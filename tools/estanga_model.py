"""Estanga: geometría y texturas desde la hoja de referencia (numpy + OpenCV).

Uso (después de tools/estanga_reference.py):
    python3 tools/estanga_model.py
Genera test-results/estanga/model.npz (mallas, UV y pesos en pose de referencia)
y las texturas assets/characters/textures/estanga-*.{jpg,png}. Luego
tools/build_estanga.py arma el rig en Blender y exporta los GLB.

Pose de unión = pose de la hoja: brazos colgando, palmas hacia los muslos y
dedos relajados. Unidades en metros, ejes de Blender del juego (cara hacia +Y,
huesos Left en +X, Z arriba); suela de las botas en Z=0.
"""
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import estanga_mh as mh  # noqa: E402
import estanga_raster as rz  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'test-results/estanga'
REF = WORK / 'ref'
DEBUG = WORK / 'debug'
TEX = ROOT / 'assets/characters/textures'

FACE_FIT = ROOT / 'assets/characters/source/estanga/face-fit.json'


def hand_bones(side):
    """Mano y sus 15 falanges."""
    return [b for b in mh.BONES if b.startswith(side + 'Hand')]


# Brazo completo: húmero, antebrazo, mano y falanges (sin la clavícula).
ARM_BONES = tuple([f'{s}{b}' for s in ('Left', 'Right') for b in ('Arm', 'ForeArm')] +
                  hand_bones('Left') + hand_bones('Right'))
S_FACE = 848.0  # px/m de los primeros planos (ancho de cabeza contra la vista entera)

TOTAL = 1.80   # coronilla con pelo hasta suela, como en la hoja
HAIR = 0.024   # volumen de pelo sobre el cuero cabelludo en la coronilla
SOLE = 0.028   # suela de las botas bajo el pie


# ---------------------------------------------------------------- utilidades
def normalize(v):
    v = np.asarray(v, float)
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def rotation(axis, angle):
    axis = normalize(axis)
    x, y, z = axis
    c, s = np.cos(angle), np.sin(angle)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def align(a, b):
    """Rotación mínima que lleva la dirección a sobre b."""
    a, b = normalize(a), normalize(b)
    axis = np.cross(a, b)
    s = np.linalg.norm(axis)
    if s < 1e-9:
        return np.eye(3)
    return rotation(axis, np.arctan2(s, float(np.dot(a, b))))


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def piecewise(x, knots, values):
    return np.interp(x, knots, values)


def tps_fit(X, D, lam=1e-5):
    """Spline biarmónica 3D (φ = r) que interpola desplazamientos D en X."""
    n = len(X)
    K = np.linalg.norm(X[:, None] - X[None], axis=2)
    Pm = np.hstack([np.ones((n, 1)), X])
    A = np.zeros((n + 4, n + 4))
    A[:n, :n] = K + lam * np.eye(n)
    A[:n, n:] = Pm
    A[n:, :n] = Pm.T
    rhs = np.zeros((n + 4, 3))
    rhs[:n] = D
    return np.linalg.solve(A, rhs)


def tps_eval(X, coef, Y):
    n = len(X)
    out = np.zeros((len(Y), 3))
    for start in range(0, len(Y), 4000):
        y = Y[start:start + 4000]
        K = np.linalg.norm(y[:, None] - X[None], axis=2)
        out[start:start + 4000] = K @ coef[:n] + np.hstack([np.ones((len(y), 1)), y]) @ coef[n:]
    return out


# ------------------------------------------------------------ anatomía y pose
# Perfiles de cuerpo: Estanga (hoja de referencia) y el alumno de guardapolvo.
PROFILES = {
    'estanga': {'height': 1.78, 'targets': None, 'proportions': True, 'sole': SOLE,
                'arm': (19, 13), 'forearm': (.14, .62, -.78), 'face_fit': True},
    'classic': {'height': 1.74, 'targets': [('caucasian-male-young', 1.0)], 'proportions': False, 'sole': .024,
                'arm': (11, 4), 'forearm': (.06, .30, -.95), 'face_fit': False},
}


class Body:
    """Cuerpo MakeHuman llevado a las proporciones y a la pose de unión del perfil."""

    def __init__(self, face_fit=True, profile='estanga'):
        self.profile = PROFILES[profile]
        A = mh.Anatomy(height=self.profile['height'], targets=self.profile['targets'])
        self.A = A
        self.faces = [list(reversed(f)) for f in A.groups['body']]
        self.face_uv = [list(reversed(f)) for f in A.face_uv['body']]
        self.W = A.weights.copy()
        self.bi = {b: i for i, b in enumerate(mh.BONES)}
        self.used = np.array(sorted({i for f in self.faces for i in f}))
        V = A.V.copy()
        J = {b: p.copy() for b, p in A.joint_pos.items()}
        V = self.curl_fingers(V)
        V, J = self.proportions(V, J)
        V, J = self.hang_arms(V, J)
        J.update(self.finger_joints(V))
        self.head_scale = .962 if self.profile['proportions'] else 1.0
        self.V, self.J = V, J
        self.eye_map = A.proxy_mapping('eyes', 'high-poly')
        if face_fit and self.profile['face_fit'] and FACE_FIT.exists():
            self.apply_face_fit(json.loads(FACE_FIT.read_text()))

    def finger_joints(self, V, k=10):
        """Falanges posadas: centro de los vértices de piel que rodean cada articulación.

        Las articulaciones de MakeHuman son vértices auxiliares sin pesos; se
        siguen por la piel cercana, que sí recorre curvatura de dedos y brazos.
        """
        from scipy.spatial import cKDTree
        rest = self.A.V
        tree = cKDTree(rest[self.used])
        out = {}
        for b in mh.BONES:
            if 'Hand' not in b or b.endswith('Hand'):
                continue
            p0 = self.A.joint_pos[b]
            _, idx = tree.query(p0, k)
            ids = self.used[idx]
            out[b] = V[ids].mean(axis=0) + (p0 - rest[ids].mean(axis=0)) * .0
        return out

    def head_region(self):
        return smoothstep(.15, .55, self.w('Head') + .6 * self.w('Neck'))

    def apply_face_fit(self, fit):
        """Escala de cabeza y campo de desplazamiento ajustados a la foto frontal."""
        V = self.V
        pivot = np.array(fit['pivot'])
        region = smoothstep(fit['neck_z'] - .05, fit['neck_z'] + .015, V[:, 2])
        scaled = pivot + (V - pivot) * fit['scale']
        V = V * (1 - region[:, None]) + scaled * region[:, None]
        for b in ('Head',):
            self.J[b] = pivot + (self.J[b] - pivot) * fit['scale']
        self.head_scale *= fit['scale']
        for step in fit['steps']:
            X = np.array(step['points'])
            coef = np.array(step['coef'])
            face = smoothstep(fit['neck_z'] - .03, fit['neck_z'] + .03, V[:, 2])
            sel = np.flatnonzero(face > 0)
            D = tps_eval(X, coef, V[sel])
            V[sel] += D * face[sel, None]
        self.V = V

    def eyes(self):
        return self.A.evaluate_proxy(self.eye_map, self.V, self.head_scale)

    def w(self, *names):
        return self.W[:, [self.bi[n] for n in names]].sum(axis=1)

    def mhw(self, name):
        """Peso original de un hueso MakeHuman (dedos), antes del mapeo a 19 huesos."""
        if not hasattr(self, '_mhw'):
            import gzip
            data = json.loads(gzip.decompress((mh.REAL / 'default_weights.mhw.gz').read_bytes()))
            self._mhw = data['weights']
        out = np.zeros(len(self.A.raw))
        for i, value in self._mhw.get(name, []):
            out[i] += value
        return out

    def curl_fingers(self, V):
        """Mano relajada de la hoja: falanges flexionadas hacia la palma."""
        A = self.A
        out = V.copy()
        for k, side in [('l', 'L'), ('r', 'R')]:
            wrist = A.joint(f'joint-{k}-hand')
            index = A.joint(f'joint-{k}-finger-2-1')
            pinky = A.joint(f'joint-{k}-finger-5-1')
            thumb_tip = A.joint(f'joint-{k}-finger-1-4')
            n = normalize(np.cross(index - wrist, pinky - wrist))
            if np.dot(n, thumb_tip - wrist) < 0:
                n = -n
            for f, angles in [(1, (.05, .16, .14)), (2, (.14, .30, .20)), (3, (.18, .34, .22)),
                              (4, (.22, .38, .24)), (5, (.27, .42, .26))]:
                joints = [A.joint(f'joint-{k}-finger-{f}-{j}') for j in range(1, 5)]
                weights = [self.mhw(f'finger{f}-{j}.{side}') for j in range(1, 4)]
                d = joints[1] - joints[0]
                axis = normalize(np.cross(d, n))
                # Transformaciones encadenadas por falange (rotación + pivote).
                Rs, ts = [], []
                R, t = np.eye(3), np.zeros(3)
                for j in range(3):
                    pivot = R @ joints[j] + t
                    Rj = rotation(axis if f > 1 else R @ axis, angles[j])
                    R, t = Rj @ R, Rj @ (t - pivot) + pivot
                    Rs.append(R.copy())
                    ts.append(t.copy())
                total = sum(weights)
                moved = (1 - total)[:, None] * out
                for wj, Rj, tj in zip(weights, Rs, ts):
                    moved += wj[:, None] * (out @ Rj.T + tj)
                mask = total > 0
                out[mask] = moved[mask]
            # Pulgar junto al índice, no abierto en garra.
            thumb = sum(self.mhw(f'finger1-{j}.{side}') for j in range(1, 4)) + self.mhw(f'metacarpal1.{side}') * .5
            base = A.joint(f'joint-{k}-finger-1-1')
            tdir = normalize(A.joint(f'joint-{k}-finger-1-3') - base)
            # Abducción palmar: el pulgar vuelve hacia el plano de la palma.
            Rt = rotation(np.cross(tdir, n), -.50) @ rotation(n, -.12 if k == 'l' else .12)
            moved = out @ Rt.T + (base - Rt @ base)
            sel = thumb > 0
            out[sel] = out[sel] * (1 - thumb[sel, None]) + moved[sel] * thumb[sel, None]
            # Muñeca neutra: la pose base de MakeHuman flexiona la mano hacia la palma.
            hand = self.w(*hand_bones('Left' if k == 'l' else 'Right'))
            fore = normalize(wrist - A.joint(f'joint-{k}-elbow'))
            Rw = rotation(np.cross(fore, n), -.30)
            moved = out @ Rw.T + (wrist - Rw @ wrist)
            sel = hand > 0
            out[sel] = out[sel] * (1 - hand[sel, None]) + moved[sel] * hand[sel, None]
        return out

    def proportions(self, V, J):
        if not self.profile['proportions']:
            V = V.copy()
            V[:, 2] += self.profile['sole']
            return V, {b: p + np.array([0, 0, self.profile['sole']]) for b, p in J.items()}
        return self.proportions_estanga(V, J)

    def proportions_estanga(self, V, J):
        """Torso más largo y piernas más cortas, como mide la hoja (entrepierna al 41 %)."""
        knots = np.array([0, .071, .540, .864, 1.499, 1.80])
        target = np.array([0, .072, .472, .727, 1.477, 1.477 + .301 * .962])
        head_scale = .962
        arm = self.w(*ARM_BONES)
        shoulder_z = J['LeftArm'][2]
        shift_arm = piecewise(shoulder_z, knots, target) - shoulder_z
        out = V.copy()
        z = V[:, 2]
        trunk = piecewise(z, knots, target)
        # Cabeza y cuello: escala uniforme para conservar la forma del rostro.
        neck_base = 1.50
        head_blend = smoothstep(1.46, 1.53, z)
        base = np.array([0, J['Neck'][1], neck_base])
        new_base = np.array([0, J['Neck'][1], piecewise(neck_base, knots, target)])
        head = new_base + (V - base) * head_scale
        out[:, 2] = (1 - arm) * trunk + arm * (z + shift_arm)
        out = out * (1 - head_blend[:, None]) + head * head_blend[:, None]
        # Piernas más juntas: en la hoja rodillas a 0,25 m y tobillos a 0,32 m.
        legs = self.w('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
                      'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase')
        inward = piecewise(z, [0, .071, .540, .944, 2], [.024, .024, .034, 0, 0])
        out[:, 0] -= np.sign(V[:, 0]) * inward * np.clip(legs * 1.4, 0, 1)
        out[:, 2] += SOLE

        def move(p):
            q = p.copy()
            q[2] = piecewise(p[2], knots, target)
            return q
        J2 = {}
        for b, p in J.items():
            if b in ('Neck', 'Head'):
                q = new_base + (p - base) * head_scale
            elif 'Arm' in b or 'Hand' in b:
                q = p + np.array([0, 0, shift_arm])
            else:
                q = move(p)
                if any(k in b for k in ('UpLeg', 'Leg', 'Foot', 'Toe')):
                    q[0] -= np.sign(p[0]) * piecewise(p[2], [0, .071, .540, .944, 2], [.024, .024, .034, 0, 0])
            q[2] += SOLE
            J2[b] = q
        return out, J2

    def hang_arms(self, V, J):
        """Brazos colgando como en la hoja: húmero abierto por el abdomen, antebrazo adelante, pulgar al frente."""
        out = V.copy()
        J2 = dict(J)
        for side, sign in [('Left', 1), ('Right', -1)]:
            S, E, Wr = J[side + 'Arm'], J[side + 'ForeArm'], J[side + 'Hand']
            wa, wf = self.w(side + 'Arm'), self.w(side + 'ForeArm')
            wh = self.w(*hand_bones(side))
            k = 'l' if side == 'Left' else 'r'
            # Torsión del antebrazo repartida a lo largo (sin hueso de giro en el rig).
            axis = normalize(Wr - E)
            index = self.A.joint(f'joint-{k}-finger-2-1')
            pinky = self.A.joint(f'joint-{k}-finger-5-1')
            # Medido en la hoja: codo a x≈0,27 y y≈-0,05; muñeca a x≈0,30 y y≈0,12.
            up, back = (np.radians(a) for a in self.profile['arm'])
            u1 = np.array([sign * np.sin(up) * np.cos(back), -np.sin(back), -np.cos(up) * np.cos(back)])
            fx, fy, fz = self.profile['forearm']
            f1 = normalize(np.array([sign * fx, fy, fz]))
            R1 = align(E - S, u1)
            R2 = align(R1 @ (Wr - E), f1)
            # Ángulo de torsión: llevar índice-meñique hacia +Y (pulgar al frente).
            across = R2 @ R1 @ (index - pinky)
            across -= f1 * np.dot(across, f1)
            want = np.array([0, 1, 0]) - f1 * f1[1]
            angle = np.arctan2(np.dot(np.cross(normalize(across), normalize(want)), f1),
                               np.dot(normalize(across), normalize(want)))
            t = np.clip(((out - E) @ axis) / np.linalg.norm(Wr - E), 0, 1)
            twist_w = np.clip(wf + wh, 0, 1) * np.where(wh > .5, 1, smoothstep(.0, 1, t))
            for i in np.flatnonzero(twist_w > 1e-4):
                Rt = rotation(axis, angle * twist_w[i])
                out[i] = Rt @ (out[i] - E) + E
            E1 = S + R1 @ (E - S)
            p_arm = (out - S) @ R1.T + S
            p_fore = (p_arm - E1) @ R2.T + E1
            rest = np.clip(1 - wa - wf - wh, 0, 1)
            blend = rest[:, None] * out + wa[:, None] * p_arm + (wf + wh)[:, None] * p_fore
            touched = (wa + wf + wh) > 1e-6
            out[touched] = blend[touched]
            J2[side + 'ForeArm'] = E1
            J2[side + 'Hand'] = E1 + R2 @ R1 @ (Wr - E)
        return out, J2


# ------------------------------------------------------ vistas de la hoja
class Reference:
    """Vistas ortográficas de la hoja calibradas al modelo y perfiles de silueta."""

    # Dirección del modelo hacia la derecha de la imagen y hacia la cámara.
    # La figura 2 del giro (rótulo RIGHT SIDE) muestra el lado izquierdo:
    # el reloj queda cerca y la cara mira a la izquierda de la imagen.
    AXES = {
        'turn_front': ([-1, 0, 0], [0, 1, 0]), 'turn_back': ([1, 0, 0], [0, -1, 0]),
        'turn_right': ([0, -1, 0], [-1, 0, 0]), 'turn_left': ([0, 1, 0], [1, 0, 0]),
        'face_front': ([-1, 0, 0], [0, 1, 0]), 'face_right': ([0, 1, 0], [1, 0, 0]),
        'face_left': ([0, -1, 0], [-1, 0, 0]),
    }

    def __init__(self, body):
        import cv2
        self.cv2 = cv2
        info = json.loads((REF / 'reference.json').read_text())
        self.info = info
        self.images, self.masks, self.views = {}, {}, {}
        for name in info['views']:
            self.images[name] = cv2.cvtColor(cv2.imread(str(REF / f'{name}.png')), cv2.COLOR_BGR2RGB)
            self.masks[name] = cv2.imread(str(REF / f'{name}_mask.png'), 0) > 127
        # Piernas del jean (z 0,50–0,62) como referencia horizontal y de profundidad.
        legs = body.V[body.used]
        band = legs[(legs[:, 2] > .50) & (legs[:, 2] < .62) & (np.abs(legs[:, 0]) < .3)]
        self.leg_y = float(band[:, 1].mean())
        for name in ['turn_front', 'turn_back', 'turn_right', 'turn_left']:
            m = self.masks[name]
            rows = np.flatnonzero(m.any(1))
            top, bot = rows[0], rows[-1] + 1
            s = (bot - top) / TOTAL
            cols = []
            for f in np.linspace(.28, .34, 4) if name in ('turn_right', 'turn_left') else np.linspace(.17, .33, 9):
                r = int(bot - f * (bot - top))
                segs = self.segments(m[r])
                cols.append(np.mean([(a + b) / 2 for a, b in segs]) if len(segs) <= 2 else np.nan)
            u0 = float(np.nanmean(cols))
            right, toward = self.AXES[name]
            if name in ('turn_right', 'turn_left'):
                u0 -= float(np.dot([0, self.leg_y, 0], right)) * s
            self.views[name] = rz.View(name, right, toward, u0, bot, s, m.shape[::-1])

    @staticmethod
    def segments(row):
        cols = np.flatnonzero(row)
        if not len(cols):
            return []
        br = np.flatnonzero(np.diff(cols) > 1)
        starts = np.r_[cols[0], cols[br + 1]]
        ends = np.r_[cols[br], cols[-1]]
        return [(int(a), int(b) + 1) for a, b in zip(starts, ends) if b - a > 1]

    def row(self, name, z):
        v = self.views[name]
        r = int(round(v.v0 - z * v.s - .5))
        r = np.clip(r, 0, self.masks[name].shape[0] - 1)
        return self.segments(self.masks[name][r]), v

    def to_model(self, name, u):
        v = self.views[name]
        return (u - v.u0) / v.s  # coordenada a lo largo de 'right'

    def torso_profile(self, zs):
        """Semiancho X y frente/espalda Y del tronco por altura (NaN si un brazo lo tapa)."""
        out = np.full((len(zs), 4), np.nan)  # x_half, y_front, y_back, unused
        for i, z in enumerate(zs):
            halves = []
            for name in ('turn_front', 'turn_back'):
                segs, v = self.row(name, z)
                hit = [(a, b) for a, b in segs if a <= v.u0 <= b]
                if not hit:
                    continue
                a, b = hit[0]
                left, right = v.u0 - a, b - v.u0
                # Un lado fundido con el brazo es mucho más ancho: usar el otro.
                if max(left, right) > 1.18 * min(left, right):
                    halves.append(min(left, right) / v.s)
                elif len(segs) >= 3:
                    halves.append((left + right) / 2 / v.s)
            if halves:
                out[i, 0] = np.mean(halves)
            fronts, backs = [], []
            for name in ('turn_right', 'turn_left'):
                segs, v = self.row(name, z)
                c = v.u0 + self.leg_y * np.dot([0, 1, 0], v.right) * v.s
                hit = [(a, b) for a, b in segs if a - 25 <= c <= b + 25]
                if not hit:
                    continue
                a, b = hit[0]
                ya, yb = sorted([self.to_model(name, a) * v.right[1], self.to_model(name, b) * v.right[1]])
                fronts.append(yb)
                backs.append(ya)
            if fronts:
                out[i, 1] = min(fronts)
                out[i, 2] = max(backs)
        return out

    def leg_profile(self, zs):
        """Por pierna: extremos X (izq/der de imagen frontal) y extremos Y del perfil."""
        out = np.full((len(zs), 6), np.nan)  # xa_L, xb_L, xa_R, xb_R, y_front, y_back
        for i, z in enumerate(zs):
            segs, v = self.row('turn_front', z)
            legs = [(a, b) for a, b in segs if b - a > 12]
            if len(legs) >= 2:
                left_img = min(legs, key=lambda s: s[0])
                right_img = max(legs, key=lambda s: s[1])
                # Imagen frontal: derecha de imagen = -X. Pierna +X (Left) a la izquierda.
                xa = sorted([-self.to_model('turn_front', left_img[0]), -self.to_model('turn_front', left_img[1])])
                xb = sorted([-self.to_model('turn_front', right_img[0]), -self.to_model('turn_front', right_img[1])])
                out[i, 0:2] = xa
                out[i, 2:4] = xb
            fronts, backs = [], []
            for name in ('turn_right', 'turn_left'):
                segs, v = self.row(name, z)
                c = v.u0 + self.leg_y * np.dot([0, 1, 0], v.right) * v.s
                hit = [(a, b) for a, b in segs if a - 30 <= c <= b + 30]
                if hit:
                    a, b = hit[0]
                    ya, yb = sorted([self.to_model(name, a) * v.right[1], self.to_model(name, b) * v.right[1]])
                    fronts.append(yb)
                    backs.append(ya)
            if fronts:
                out[i, 4] = min(fronts)
                out[i, 5] = max(backs)
        return out


def fill_smooth(values, sigma=2.0):
    """Interpola NaN y suaviza a lo largo de la altura."""
    v = values.copy()
    idx = np.arange(len(v))
    good = np.isfinite(v)
    if good.sum() >= 2:
        v[~good] = np.interp(idx[~good], idx[good], v[good])
    k = np.exp(-.5 * (np.arange(-6, 7) / sigma) ** 2)
    k /= k.sum()
    pad = np.pad(v, 6, mode='edge')
    return np.convolve(pad, k, mode='same')[6:-6]


# ------------------------------------------------------------ mallas de prenda
class Mesh:
    """Polígonos con UV por esquina y pesos por vértice (19 huesos)."""

    def __init__(self, P, faces, fuv, W):
        self.P = np.asarray(P, float)
        self.faces = [list(f) for f in faces]
        self.fuv = [np.asarray(u, float) for u in fuv]
        self.W = np.asarray(W, float)

    @classmethod
    def from_body(cls, body, keep_face):
        faces, fuv = [], []
        for f, fu in zip(body.faces, body.face_uv):
            if keep_face(f):
                faces.append(f)
                fuv.append(body.A.uvs[fu])
        return cls(body.V, faces, fuv, body.W).compact()

    def compact(self):
        used = sorted({i for f in self.faces for i in f})
        remap = -np.ones(len(self.P), int)
        remap[used] = np.arange(len(used))
        self.P, self.W = self.P[used], self.W[used]
        self.faces = [[int(remap[i]) for i in f] for f in self.faces]
        return self

    def clip(self, field):
        """Recorta por un campo escalar f(P, W) ≥ 0 cortando polígonos en el borde."""
        values = field(self.P, self.W)
        P, W = list(self.P), list(self.W)
        cache = {}
        faces, fuv = [], []
        for f, uv in zip(self.faces, self.fuv):
            vals = values[f]
            if (vals >= 0).all():
                faces.append(f)
                fuv.append(uv)
                continue
            if (vals < 0).all():
                continue
            out, out_uv = [], []
            n = len(f)
            for i in range(n):
                a, b = f[i], f[(i + 1) % n]
                va, vb = vals[i], vals[(i + 1) % n]
                if va >= 0:
                    out.append(a)
                    out_uv.append(uv[i])
                if (va >= 0) != (vb >= 0):
                    t = va / (va - vb)
                    key = (min(a, b), max(a, b))
                    if key not in cache:
                        cache[key] = len(P)
                        P.append(self.P[a] + t * (self.P[b] - self.P[a]))
                        W.append(self.W[a] + t * (self.W[b] - self.W[a]))
                    out.append(cache[key])
                    out_uv.append(uv[i] + t * (uv[(i + 1) % n] - uv[i]))
            if len(out) >= 3:
                faces.append(out)
                fuv.append(np.array(out_uv))
        self.P, self.W = np.array(P), np.array(W)
        self.faces, self.fuv = faces, fuv
        return self.compact()

    def triangles(self):
        tris, uvs = [], []
        for f, uv in zip(self.faces, self.fuv):
            for k in range(1, len(f) - 1):
                tris.append([f[0], f[k], f[k + 1]])
                uvs.append([uv[0], uv[k], uv[k + 1]])
        return np.array(tris), np.array(uvs)

    def normals(self):
        F, _ = self.triangles()
        n = np.cross(self.P[F[:, 1]] - self.P[F[:, 0]], self.P[F[:, 2]] - self.P[F[:, 0]])
        N = np.zeros_like(self.P)
        for k in range(3):
            np.add.at(N, F[:, k], n)
        return normalize(N)

    def neighbors(self):
        nb = [set() for _ in self.P]
        edges = {}
        for f in self.faces:
            for i in range(len(f)):
                a, b = f[i], f[(i + 1) % len(f)]
                nb[a].add(b)
                nb[b].add(a)
                key = (min(a, b), max(a, b))
                edges[key] = edges.get(key, 0) + 1
        boundary = np.zeros(len(self.P), bool)
        for (a, b), count in edges.items():
            if count == 1:
                boundary[a] = boundary[b] = True
        return [np.array(sorted(s)) for s in nb], boundary

    def smooth(self, iterations=4, lam=.35, fixed=None, weight=None):
        nb, boundary = self.neighbors()
        lock = boundary if fixed is None else (boundary | fixed)
        for _ in range(iterations):
            avg = np.array([self.P[n].mean(axis=0) if len(n) else self.P[i] for i, n in enumerate(nb)])
            step = lam if weight is None else lam * weight[:, None]
            move = (avg - self.P) * step
            move[lock] = 0
            self.P = self.P + move
        return self


def superellipse(ux, uy, n):
    """Radio en dirección unitaria (ux, uy) de |x|^n + |y|^n = 1."""
    return 1 / np.maximum(np.abs(ux) ** n + np.abs(uy) ** n, 1e-12) ** (1 / n)


def section_fit(P, center, axes, body_center, body_axes, n_front=2.2, n_back=2.9):
    """Lleva cada punto a la sección superelíptica de la silueta.

    La dirección se toma en coordenadas normalizadas por la sección del cuerpo,
    así se conserva el reparto angular de la malla original.
    """
    ux = (P[:, 0] - body_center[:, 0]) / body_axes[:, 0]
    uy = (P[:, 1] - body_center[:, 1]) / body_axes[:, 1]
    r = np.hypot(ux, uy)
    ux, uy = ux / np.maximum(r, 1e-9), uy / np.maximum(r, 1e-9)
    n = np.where(uy > 0, n_front, n_back)
    k = superellipse(ux, uy, n)
    out = P.copy()
    out[:, 0] = center[:, 0] + axes[:, 0] * ux * k
    out[:, 1] = center[:, 1] + np.where(uy > 0, axes[:, 1], axes[:, 2]) * uy * k
    return out


def band_stats(points, zs, width=.012):
    """Centro y semiejes de la sección del cuerpo por altura (suavizados)."""
    stats = np.full((len(zs), 4), np.nan)
    for i, z in enumerate(zs):
        sel = points[np.abs(points[:, 2] - z) < width]
        if len(sel) >= 6:
            x0, x1 = np.percentile(sel[:, 0], [1, 99])
            y0, y1 = np.percentile(sel[:, 1], [1, 99])
            stats[i] = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2]
    for c in range(4):
        stats[:, c] = fill_smooth(stats[:, c], 1.5)
    return stats


HEM_Z = 0.913      # dobladillo del suéter (51 % de la altura en la hoja)
CUFF_Z = 1.108     # puño de las mangas subidas a mitad del antebrazo
WAIST_Z = 0.985    # cintura del jean, oculta bajo el suéter
JEANS_HEM = 0.128  # ruedo del jean sobre la caña de la bota


NECK_OPEN = (.098, .016, .100, .080)  # semieje lateral, centro Y, semieje frontal, semieje dorsal


def neck_norm(P):
    """Distancia normalizada al eje del cuello (1 = borde de la abertura del suéter)."""
    ax, cy, af, ab = NECK_OPEN
    dy = P[:, 1] - cy
    ay = np.where(dy > 0, af, ab)
    return np.sqrt((P[:, 0] / ax) ** 2 + (dy / ay) ** 2)


def neckline(P):
    """Altura aproximada del cuello redondo (compatibilidad: piel bajo el cuello)."""
    return 1.522 - .030 * np.clip(P[:, 1] - .02, 0, None) / .10 + .022 * np.clip(-P[:, 1] + .02, 0, None) / .08


def build_sweater(body, ref):
    arm = body.w(*ARM_BONES)
    head = body.w('Head')
    zall = body.V[:, 2]
    region = (zall > HEM_Z - .03) & (head < .5) & (zall < 1.60) & ~((arm > .5) & (zall < CUFF_Z - .03))
    m = Mesh.from_body(body, lambda f: region[f].all())
    m.clip(lambda P, W: P[:, 2] - HEM_Z)
    # Abertura elíptica alrededor del cuello proyectada sobre hombros y pecho.
    m.clip(lambda P, W: neck_norm(P) - 1 + np.clip(1.50 - P[:, 2], 0, None) * 8)
    armw = lambda W: W[:, [body.bi[b] for b in ARM_BONES]].sum(1)
    m.clip(lambda P, W: np.where(armw(W) > .5, P[:, 2] - CUFF_Z, 1.0))
    return fit_sweater(m, body, ref)


def fit_sweater(m, body, ref):
    zs = np.arange(.80, 1.62, .01)
    T = ref.torso_profile(zs)
    T[zs > 1.36, 1:3] = np.nan  # por encima del pecho el perfil ya es cuello y barba
    xh, yf, yb = (fill_smooth(T[:, c], 2.5) for c in range(3))
    torso_pts = body.V[body.used]
    tw = body.W[body.used]
    armsel = tw[:, [body.bi[b] for b in ARM_BONES]].sum(1)
    S = band_stats(torso_pts[armsel < .15], zs)
    P, W = m.P, m.W
    z = P[:, 2]
    at = lambda arr: np.interp(z, zs, arr)
    cy = (at(yf) + at(yb)) / 2
    half_y = (at(yf) - at(yb)) / 2
    # 1,5 % de holgura sobre la silueta para que el borde no quede bajo la línea.
    center = np.stack([np.zeros_like(z), cy], 1)
    axes = np.stack([at(xh) * 1.0, half_y, half_y], 1)
    bc = np.stack([at(S[:, 0]), at(S[:, 1])], 1)
    ba = np.stack([at(S[:, 2]), at(S[:, 3])], 1)
    torso_fit = section_fit(P, center, axes, bc, ba)
    N = m.normals()
    inflated = P + N * .014
    arm = W[:, [body.bi[b] for b in ARM_BONES]].sum(1)
    c_arm = smoothstep(.35, .75, arm)
    upper = smoothstep(1.30, 1.42, z)  # hombros y canesú: inflado desde el cuerpo
    torso = torso_fit * (1 - upper[:, None]) + inflated * upper[:, None]
    sleeves = fit_sleeves(P, W, N, body)
    out = torso * (1 - c_arm[:, None]) + sleeves * c_arm[:, None]
    # Dobladillo acanalado: ciñe 3 % en los últimos 5 cm.
    rib = 1 - .035 * (1 - smoothstep(HEM_Z, HEM_Z + .055, z)) * (1 - c_arm)
    out[:, 0] *= rib
    out[:, 1] = cy + (out[:, 1] - cy) * rib
    m.P = out
    fixed = np.zeros(len(out), bool)
    m.smooth(6, .30, fixed)
    m.rib = (1 - smoothstep(HEM_Z + .05, HEM_Z + .062, z)) * (1 - c_arm)
    return m


def fit_sleeves(P, W, N, body):
    """Mangas: tubo alrededor del húmero y antebrazo con radios de la vista frontal."""
    out = P + N * .012
    for side, sign in [('Left', 1), ('Right', -1)]:
        S, E, Wr = body.J[side + 'Arm'], body.J[side + 'ForeArm'], body.J[side + 'Hand']
        sel = (np.sign(P[:, 0]) == sign) & (W[:, [body.bi[b] for b in ARM_BONES if b.startswith(side)]].sum(1) > .2)
        idx = np.flatnonzero(sel)
        p = P[idx]
        # Proyección sobre la polilínea hombro-codo-muñeca.
        seg_a = [(S, E), (E, Wr)]
        best_t, best_q, best_d = None, None, None
        for k, (a, b) in enumerate(seg_a):
            d = b - a
            t = np.clip(((p - a) @ d) / (d @ d), 0, 1)
            q = a + t[:, None] * d
            dist = np.linalg.norm(p - q, axis=1)
            tt = t * .5 + .5 * k
            if best_d is None:
                best_t, best_q, best_d = tt, q, dist
            else:
                take = dist < best_d
                best_t = np.where(take, tt, best_t)
                best_q = np.where(take[:, None], q, best_q)
                best_d = np.where(take, dist, best_d)
        # Radio: hombro 0,074 · bíceps 0,070 · codo 0,062 · puño 0,054 (vista frontal).
        radius = np.interp(best_t, [0, .12, .35, .5, .62, .75, 1], [.078, .074, .070, .064, .060, .055, .050])
        radial = normalize(p - best_q)
        # Pliegues de la manga empujada sobre el antebrazo.
        fold = .0035 * np.sin((p[:, 2] - CUFF_Z) / .021 * 2 * np.pi + 1.7 * np.arctan2(radial[:, 1], radial[:, 0])) \
            * smoothstep(.55, .62, best_t) * (1 - smoothstep(.70, .74, best_t))
        cuff = 1 - .06 * smoothstep(CUFF_Z + .055, CUFF_Z + .045, p[:, 2])
        target = best_q + radial * (radius * cuff + fold)[:, None]
        near_shoulder = smoothstep(.02, .14, best_t)
        out[idx] = out[idx] * (1 - near_shoulder[:, None]) + target * near_shoulder[:, None]
    return out


def build_jeans(body, ref):
    arm = body.w(*ARM_BONES)
    zall = body.V[:, 2]
    region = (zall < WAIST_Z + .03) & (zall > JEANS_HEM - .04) & (arm < .3)
    m = Mesh.from_body(body, lambda f: region[f].all())
    m.clip(lambda P, W: WAIST_Z - P[:, 2])
    m.clip(lambda P, W: P[:, 2] - JEANS_HEM)
    return fit_jeans(m, body, ref)


def fit_jeans(m, body, ref):
    zs = np.arange(.08, 1.05, .01)
    L = ref.leg_profile(zs)
    T = ref.torso_profile(zs)
    # Caña de la bota: bajo 0,22 m la silueta incluye la puntera; se fija la pierna.
    low = zs < .22
    for c in (4, 5):
        L[low, c] = np.nan
    cols = [fill_smooth(L[:, c], 2.0) for c in range(6)]
    xh, yf, yb = (fill_smooth(T[:, c], 2.0) for c in range(3))
    P, W = m.P, m.W
    z = P[:, 2]
    at = lambda arr: np.interp(z, zs, arr)
    pts = body.V[body.used]
    out_leg = P.copy()
    for side, sign, (ca, cb) in [('Left', 1, (0, 1)), ('Right', -1, (2, 3))]:
        legw = body.W[body.used][:, [body.bi[side + b] for b in ('UpLeg', 'Leg', 'Foot', 'ToeBase')]].sum(1)
        S = band_stats(pts[(legw > .6) & (np.sign(pts[:, 0]) == sign)], zs, .015)
        xa, xb = at(cols[ca]), at(cols[cb])
        center = np.stack([(xa + xb) / 2, (at(cols[4]) + at(cols[5])) / 2], 1)
        hy = (at(cols[4]) - at(cols[5])) / 2
        axes = np.stack([(xb - xa) / 2, hy, hy], 1)
        bc = np.stack([at(S[:, 0]), at(S[:, 1])], 1)
        ba = np.stack([at(S[:, 2]), at(S[:, 3])], 1)
        fit = section_fit(P, center, axes, bc, ba, 2.3, 2.3)
        sel = np.sign(P[:, 0]) == sign
        out_leg[sel] = fit[sel]
    S = band_stats(pts[body.W[body.used][:, [body.bi[b] for b in ARM_BONES]].sum(1) < .15], zs)
    cy = (at(yf) + at(yb)) / 2
    hy = (at(yf) - at(yb)) / 2
    hips = section_fit(P, np.stack([np.zeros_like(z), cy], 1), np.stack([at(xh), hy, hy], 1),
                       np.stack([at(S[:, 0]), at(S[:, 1])], 1), np.stack([at(S[:, 2]), at(S[:, 3])], 1), 2.4, 2.6)
    crotch = .742
    c_hips = smoothstep(crotch - .01, crotch + .05, z)
    out = out_leg * (1 - c_hips[:, None]) + hips * c_hips[:, None]
    # Ruedo apilado sobre la bota: pliegues horizontales y algo más de vuelo.
    stack = 1 - smoothstep(JEANS_HEM + .02, JEANS_HEM + .09, z)
    ang = np.arctan2(P[:, 1], P[:, 0] - np.sign(P[:, 0]) * .14)
    for side, sign, (ca, cb) in [('Left', 1, (0, 1)), ('Right', -1, (2, 3))]:
        sel = np.sign(P[:, 0]) == sign
        cx = (at(cols[ca]) + at(cols[cb])) / 2
        cyl = (at(cols[4]) + at(cols[5])) / 2
        d = out[:, :2] - np.stack([cx, cyl], 1)
        k = 1 + (.10 + .025 * np.sin(z / .018 * 2 * np.pi + ang * 2)) * stack
        out[sel, :2] = (np.stack([cx, cyl], 1) + d * k[:, None])[sel]
    m.P = out
    m.smooth(5, .3)
    return m


# ------------------------------------------------------- proyección de texturas
def face_views(ref, fit):
    """Cámaras de los primeros planos (calibradas por estanga_face_fit.py)."""
    out = {}
    for name, key in [('face_front', 'face_front_view'), ('face_left', 'face_left_view'),
                      ('face_right', 'face_right_view')]:
        c = fit[key]
        right, toward = Reference.AXES[name]
        h, w = ref.masks[name].shape
        out[name] = rz.View(name, right, toward, c['u0'], c['v0'], c['s'], (w, h))
    return out


LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]


def clean_glasses(ref, fit, views):
    """Borra el armazón de los anteojos de las fotos: se modelan en 3D aparte."""
    cv2 = ref.cv2
    out = {}
    lm = np.array(fit['reference_landmarks'])
    for name in ('face_front', 'face_left', 'face_right'):
        img = ref.images[name].copy()
        lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(float)
        L = lab[..., 0]
        h, w = L.shape
        mask = np.zeros((h, w), np.uint8)
        yy, xx = np.mgrid[0:h, 0:w]
        if name == 'face_front':
            x0, x1 = lm[234, 0] - 4, lm[454, 0] + 4
            y0 = min(lm[105, 1], lm[334, 1]) - 6
            y1 = max(lm[145, 1], lm[374, 1]) + 22
            box = (xx > x0) & (xx < x1) & (yy > y0) & (yy < y1)
            # Ojos protegidos por su contorno de MediaPipe: iris y pestañas son oscuros.
            eyes = np.zeros((h, w), np.uint8)
            for ring in (LEFT_EYE, RIGHT_EYE):
                cv2.fillPoly(eyes, [np.round(lm[ring]).astype(np.int32)], 1)
            eyes = cv2.dilate(eyes, np.ones((3, 3), np.uint8), iterations=1).astype(bool)
            # Armazón: muy oscuro y más oscuro que su entorno (sombrero negro).
            gray = L.astype(np.uint8)
            blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, np.ones((9, 9), np.uint8))
            mask[box & ~eyes & ((L < 58) | ((L < 85) & (blackhat > 28)))] = 1
        else:
            v = views[name]
            eye_z = 1.675
            eye_v = v.v0 - eye_z * v.s
            # Aro delantero y patilla: barra oscura a la altura del ojo hasta la oreja.
            ear_u = v.u0 + v.right[1] * (-.005) * v.s
            if name == 'face_left':
                band = (xx < ear_u) & (xx > 10)
            else:
                band = (xx > ear_u) & (xx < w - 2)
            band &= (yy > eye_v - 20) & (yy < eye_v + 24)
            mask[band & (L < 80)] = 1
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
        clean = cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)
        cv2.imwrite(str(DEBUG / f'{name}_glassmask.png'), mask * 255)
        out[name] = clean
        cv2.imwrite(str(DEBUG / f'{name}_clean.png'), cv2.cvtColor(clean, cv2.COLOR_RGB2BGR))
    return out


class Baker:
    """Proyecta las vistas de la hoja sobre las UV de una malla, con visibilidad."""

    def __init__(self, ref, images, views):
        self.ref, self.images, self.views = ref, images, views
        self.cache = {}

    def depth(self, key, view, P, F):
        if (key, view.name) not in self.cache:
            self.cache[(key, view.name)] = rz.zbuffer(view, P, F)[0]
        return self.cache[(key, view.name)]

    def bake(self, P, F, FUV, N, size, occluders, key, names, power=3.0, rect=None, reject=None, hide=None):
        """Devuelve color (h, w, 3) en [0,255], peso acumulado y máscara de cobertura.

        rect: (u0, v0, u1, v1) de las UV que ocupa la textura (recorte del atlas).
        """
        w, h = size if isinstance(size, tuple) else (size, size)
        uv = FUV.copy()
        if rect is not None:
            u0, v0, u1, v1 = rect
            uv[..., 0] = (uv[..., 0] - u0) / (u1 - u0)
            uv[..., 1] = (uv[..., 1] - v0) / (v1 - v0)
        tri_of, bary = rz.uv_raster_rect(uv, F, w, h)
        cover = tri_of >= 0
        tri = tri_of[cover]
        b = bary[cover]
        pos = (P[F[tri]] * b[:, :, None]).sum(axis=1)
        nor = normalize((N[F[tri]] * b[:, :, None]).sum(axis=1))
        acc = np.zeros((len(tri), 3))
        wsum = np.zeros(len(tri))
        OP, OF = occluders
        for name in names:
            view = self.views[name]
            zb = self.depth(key, view, OP, OF)
            img = self.images[name].astype(float)
            mask = self.ref.masks[name]
            uvp, dep = view.project(pos)
            ui = np.floor(uvp[:, 0]).astype(int)
            vi = np.floor(uvp[:, 1]).astype(int)
            inside = (ui >= 1) & (vi >= 1) & (ui < view.size[0] - 1) & (vi < view.size[1] - 1)
            ok = np.zeros(len(tri), bool)
            idx = np.flatnonzero(inside)
            eps = 2.5 / view.s
            ok[idx] = (dep[idx] >= zb[vi[idx], ui[idx]] - eps) & mask[vi[idx], ui[idx]]
            # Borde de silueta: un píxel de margen para no tomar fondo.
            for du, dv in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                ok[idx] &= mask[np.clip(vi[idx] + dv, 0, mask.shape[0] - 1), np.clip(ui[idx] + du, 0, mask.shape[1] - 1)]
            facing = np.clip(nor @ view.toward, 0, 1)
            quality = (view.s / S_FACE) ** 2
            wv = np.where(ok, facing ** power * quality, 0)
            col = rz.sample(img, uvp)
            if reject is not None:
                # Manos o antebrazos de la foto delante de la prenda: no son tela.
                wv = np.where(reject(col[:, :3]), 0, wv)
            if hide is not None:
                wv = np.where(hide(pos), 0, wv)
            acc += col[:, :3] * wv[:, None]
            wsum += wv
        color = np.zeros((h, w, 3))
        weight = np.zeros((h, w))
        good = wsum > 1e-6
        tmp = np.zeros((len(tri), 3))
        tmp[good] = acc[good] / wsum[good, None]
        color[cover] = tmp
        weight[cover] = wsum
        return color, weight, cover, (tri_of, bary)




def build_skin(body):
    """Piel visible: cabeza, cuello bajo el cuello del suéter, antebrazos y manos."""
    arm = body.w(*ARM_BONES)
    region = body.head_region()
    z = body.V[:, 2]
    nn = neck_norm(body.V)
    keep = ((region > .2) & ((nn < 1.25) | (z > 1.49)) & (z > 1.40)) | ((arm > .5) & (z < CUFF_Z + .05))
    m = Mesh.from_body(body, lambda f: keep[f].all())
    armw = lambda W: W[:, [body.bi[b] for b in ARM_BONES]].sum(1)
    # Cuello: la piel sigue unos 2 cm bajo el borde del cuello acanalado.
    m.clip(lambda P, W: np.where(armw(W) > .5, CUFF_Z + .03 - P[:, 2],
                                 np.maximum(1.14 - neck_norm(P), P[:, 2] - 1.50)))
    return m


def color_transfer(src, src_mask, ref_pixels):
    """Ajusta media y desvío por canal Lab de src (en la máscara) a ref_pixels."""
    import cv2
    lab = cv2.cvtColor(np.clip(src, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(float)
    rlab = cv2.cvtColor(np.clip(ref_pixels[None], 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(float)[0]
    mu_s, sd_s = lab[src_mask].mean(0), lab[src_mask].std(0) + 1e-6
    mu_r, sd_r = rlab.mean(0), rlab.std(0) + 1e-6
    k = np.clip(sd_r / sd_s, .6, 1.4)
    k[0] = min(k[0], 1.0)
    out = (lab - mu_s) * k + mu_r
    return cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(float)


# ------------------------------------------------------------- pelo y barba
def lab_of(img):
    import cv2
    return cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(float)


def classify_hair(rgb):
    """Canas: luminosas y casi sin croma; la piel es cálida."""
    lab = lab_of(rgb[None])[0] if rgb.ndim == 2 else lab_of(rgb)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    return (chroma < 11.5) & (lab[..., 0] > 70)


def spherical_depth(points, faces, center, grid):
    """Radio máximo de la superficie por dirección (θ, φ) desde center."""
    nt, npf = grid
    d = points - center
    r = np.linalg.norm(d, axis=1)
    theta = np.arctan2(d[:, 0], d[:, 1])           # 0 = hacia la cara (+Y)
    phi = np.arccos(np.clip(d[:, 2] / np.maximum(r, 1e-9), -1, 1))  # 0 = arriba
    U = (theta + np.pi) / (2 * np.pi) * nt
    Vv = phi / np.pi * npf
    out = np.full((npf, nt), np.nan)
    for tri in faces:
        u, v, rr = U[tri], Vv[tri], r[tri]
        if u.max() - u.min() > nt / 2:
            u = np.where(u < nt / 2, u + nt, u)
        for shift in (0, -nt):
            uu = u + shift
            x0, x1 = int(np.floor(uu.min())), int(np.ceil(uu.max()))
            y0, y1 = int(np.floor(v.min())), int(np.ceil(v.max()))
            if x1 < 0 or x0 >= nt:
                continue
            xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, nt - 1) + 1) + .5,
                                 np.arange(max(y0, 0), min(y1, npf - 1) + 1) + .5)
            if xs.size == 0:
                continue
            a, b, c = np.stack([uu, v], 1)
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) < 1e-12:
                continue
            l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
            l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
            l2 = 1 - l0 - l1
            ins = (l0 >= -.01) & (l1 >= -.01) & (l2 >= -.01)
            if not ins.any():
                continue
            depth = l0 * rr[0] + l1 * rr[1] + l2 * rr[2]
            yi = (ys[ins] - .5).astype(int)
            xi = (xs[ins] - .5).astype(int)
            cur = out[yi, xi]
            take = np.isnan(cur) | (depth[ins] > cur)
            out[yi[take], xi[take]] = depth[ins][take]
    return out


def inside_views(points, views, masks):
    """True si el punto cae dentro de la silueta en todas las vistas."""
    ok = np.ones(len(points), bool)
    for name, view in views.items():
        uv, _ = view.project(points)
        m = masks[name]
        h, w = m.shape
        ui, vi = np.floor(uv[:, 0]).astype(int), np.floor(uv[:, 1]).astype(int)
        # Fuera del recorte por arriba: la hoja corta la coronilla, no se sabe.
        known = (ui >= 0) & (ui < w) & (vi >= 0) & (vi < h)
        res = np.ones(len(points), bool)
        res[known] = m[vi[known], ui[known]]
        if name.startswith('face'):
            res[~known & (vi >= 0)] = False
        else:
            res[~known] = False
        ok &= res
    return ok


HULL_VIEWS = ('face_front', 'face_left', 'face_right', 'turn_back', 'turn_front', 'turn_left', 'turn_right')


def hull_masks(ref):
    return {k: ref.cv2.dilate(ref.masks[k].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
            for k in HULL_VIEWS}


def hull_radius(center, dirs, views, masks, r_min=.03, r_max=.22, steps=16):
    """Radio del casco visual (intersección de siluetas) en cada dirección."""
    lo = np.full(len(dirs), r_min)
    hi = np.full(len(dirs), r_max)
    hv = {k: views[k] for k in HULL_VIEWS}
    for _ in range(steps):
        mid = (lo + hi) / 2
        ins = inside_views(center + dirs * mid[:, None], hv, masks)
        lo = np.where(ins, mid, lo)
        hi = np.where(ins, hi, mid)
    return lo


def head_center(body):
    pts = body.V[body.used]
    reg = body.head_region()[body.used]
    sk = pts[(reg > .8) & (pts[:, 2] > body.J['Head'][2] + .05)]
    return np.array([0, (sk[:, 1].max() + sk[:, 1].min()) / 2, 1.700])


def conform_skull(body, ref, views):
    """El cráneo MakeHuman sobresale del casco de la hoja: se lo reduce radialmente
    dejando el espesor de pelo observado (arriba 2 cm, lados 1 cm, nuca 0,5 cm)."""
    c = head_center(body)
    masks = hull_masks(ref)
    reg = body.head_region()
    V = body.V
    idx = np.flatnonzero((reg > .4) & (V[:, 2] > 1.58))
    d = V[idx] - c
    r = np.linalg.norm(d, axis=1)
    dirs = d / r[:, None]
    rh = hull_radius(c, dirs, views, masks)
    z = V[idx, 2]
    front = dirs[:, 1]
    margin = .010 + .010 * smoothstep(1.74, 1.80, z) + .002 * smoothstep(.2, -.6, front)
    margin *= smoothstep(1.60, 1.66, z)
    # Cara, orejas y mandíbula quedan como las dejó el ajuste facial.
    zone = smoothstep(.62, .30, front) * smoothstep(1.62, 1.67, z)
    zone = np.maximum(zone, smoothstep(1.725, 1.76, z))
    ratio = np.clip((rh - margin) / r, .75, 1.0)
    ratio = 1 - (1 - ratio) * zone
    # Suavizar la razón sobre la topología para no dejar escalones.
    full = np.ones(len(V))
    full[idx] = ratio
    nb = [set() for _ in V]
    for f in body.faces:
        for i in range(len(f)):
            nb[f[i]].add(f[(i + 1) % len(f)])
            nb[f[(i + 1) % len(f)]].add(f[i])
    nbl = [np.array(sorted(s)) for s in nb]
    for _ in range(8):
        full[idx] = np.array([full[nbl[i]].mean() if len(nbl[i]) else full[i] for i in idx]) * .5 + full[idx] * .5
    V[idx] = c + (V[idx] - c) * full[idx, None]
    body.V = V
    return float(full[idx].min())


def build_hair(body, skin, ref, views, images):
    """Casco de pelo: superficie exterior por casco visual de las vistas de la hoja."""
    import cv2
    center = head_center(body)
    nt, npf = 160, 96
    F, _ = skin.triangles()
    keepF = F[(skin.P[F, 2] > 1.55).all(axis=1)]
    rs = spherical_depth(skin.P, keepF, center, (nt, npf))
    # Cerca del polo los triángulos abarcan todos los θ: completar por filas.
    for r in range(npf // 3, -1, -1):
        bad = ~np.isfinite(rs[r])
        if bad.any():
            below = rs[r + 1]
            rs[r, bad] = np.nanmean(below) if r < 4 else below[bad]
    th = (np.arange(nt) + .5) / nt * 2 * np.pi - np.pi
    ph = (np.arange(npf) + .5) / npf * np.pi
    TH, PH = np.meshgrid(th, ph)
    D = np.stack([np.sin(PH) * np.sin(TH), np.sin(PH) * np.cos(TH), np.cos(PH)], -1)
    hull_views = {k: views[k] for k in HULL_VIEWS}
    flat_d = D.reshape(-1, 3)
    base = np.nan_to_num(rs.reshape(-1), nan=.09)
    rh = hull_radius(center, flat_d, views, hull_masks(ref))
    t_hull = np.clip(rh - base, 0, .07).reshape(npf, nt)
    # Confiabilidad: direcciones perpendiculares a alguna cámara están en su contorno.
    obs = np.zeros(len(flat_d))
    for k in ('face_front', 'face_left', 'face_right', 'turn_back', 'turn_left', 'turn_right'):
        obs = np.maximum(obs, 1 - np.abs(flat_d @ hull_views[k].toward))
    reliable = obs > .93
    t_flat = t_hull.reshape(-1)
    t_est = np.empty_like(t_flat)
    rel_d, rel_t = flat_d[reliable], t_flat[reliable]
    for i in range(0, len(flat_d), 2000):
        cosang = flat_d[i:i + 2000] @ rel_d.T
        wgt = np.exp((cosang - 1) / (1 - np.cos(np.radians(16))))
        t_est[i:i + 2000] = (wgt @ rel_t) / np.maximum(wgt.sum(1), 1e-9)
    thick = np.minimum(t_flat, t_est * 1.08).reshape(npf, nt)
    thick = blur_sphere(thick, 2.2)
    outer = center + D * (np.nan_to_num(rs, nan=.09) + thick)[..., None]
    # Región de pelo por color en la vista más frontal a cada dirección.
    hair = np.zeros((npf, nt), bool)
    score = np.full((npf, nt), -1.0)
    # Muestrear dentro del casco, no en su borde (allí el píxel mezcla fondo).
    flat_outer = (center + D * (np.nan_to_num(rs, nan=.09) + thick * .35)[..., None]).reshape(-1, 3)
    seen = np.zeros((npf, nt), bool)
    for k in ('face_front', 'face_left', 'face_right', 'turn_back', 'turn_front', 'turn_left', 'turn_right'):
        v = views[k]
        # Las vistas enteras tienen menos resolución: solo deciden donde no hay primer plano.
        facing = (flat_d @ v.toward).reshape(npf, nt) * (1 if k.startswith('face') or k == 'turn_back' else .6)
        uv, _ = v.project(flat_outer)
        img = images.get(k, ref.images[k])
        h, w = img.shape[:2]
        inb = (uv[:, 0] >= 1) & (uv[:, 0] < w - 1) & (uv[:, 1] >= 1) & (uv[:, 1] < h - 1)
        col = rz.sample(img.astype(float), np.clip(uv, 1, [w - 2, h - 2]))[:, :3]
        is_hair = classify_hair(col) & inb
        better = (facing > score) & inb.reshape(npf, nt) & (facing > .05)
        hair = np.where(better, is_hair.reshape(npf, nt), hair)
        score = np.where(better, facing, score)
        seen |= better
    # Coronilla sin vista frontal útil (la hoja la recorta): pelo.
    hair |= ~seen & (PH < np.radians(70))
    zc = outer[..., 2]
    frontness = D[..., 1]
    # Sin pelo bajo la línea de patillas ni sobre la cara (la barba va aparte).
    hair &= ~((zc < 1.648) & (frontness > -.35))
    hair &= zc > 1.585
    hair &= np.isfinite(rs)
    hair = ref.cv2.morphologyEx(hair.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
    hair = ref.cv2.morphologyEx(hair.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    hair[PH < np.radians(42)] = True  # coronilla
    # Rellenar huecos interiores de la región de pelo.
    holes = (~hair).astype(np.uint8)
    cnt, lab, st, _ = cv2.connectedComponentsWithStats(holes, 4)
    for k in range(1, cnt):
        if st[k, cv2.CC_STAT_AREA] < 120 and st[k, cv2.CC_STAT_TOP] > 0:
            hair[lab == k] = True
    edge = cv2.distanceTransform(hair.astype(np.uint8), cv2.DIST_L2, 3)
    taper = smoothstep(0, 6, edge)
    thick = blur_sphere(np.maximum(thick, .004) * (.12 + .88 * taper), 1.2)
    outer = center + D * (np.nan_to_num(rs, nan=.09) + thick)[..., None]
    return {'center': center, 'grid': (nt, npf), 'outer': outer, 'scalp': rs, 'hair': hair,
            'edge': edge, 'dirs': D, 'thick': thick}


def mesh_neighbors(n, faces):
    nb = [set() for _ in range(n)]
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            nb[a].add(b)
            nb[b].add(a)
    return [np.array(sorted(s)) for s in nb]


def smooth_field(values, nbl, iterations=4, alpha=.5):
    v = values.astype(float).copy()
    for _ in range(iterations):
        avg = np.array([v[n].mean() if len(n) else v[i] for i, n in enumerate(nbl)])
        v = v * (1 - alpha) + avg * alpha
    return v


def build_beard(skin, ref, views, images):
    """Barba y bigote: cáscara sobre la piel con espesor del casco y color de la foto."""
    P = skin.P
    N = skin.normals()
    F = skin.faces
    nbl = mesh_neighbors(len(P), F)
    score = np.full(len(P), -1.0)
    beard = np.zeros(len(P), bool)
    for k in ('face_front', 'face_left', 'face_right'):
        v = views[k]
        facing = N @ v.toward
        uv, _ = v.project(P)
        img = images[k]
        h, w = img.shape[:2]
        inb = (uv[:, 0] >= 1) & (uv[:, 0] < w - 1) & (uv[:, 1] >= 1) & (uv[:, 1] < h - 1)
        col = rz.sample(img.astype(float), np.clip(uv, 1, [w - 2, h - 2]))[:, :3]
        lab = lab_of(col[None])[0]
        chroma = np.hypot(lab[:, 1] - 128, lab[:, 2] - 128)
        # Canas con tinte cálido de estudio: más claras y menos saturadas que la piel.
        is_beard = (chroma < 21.5) & (lab[:, 0] > 102)
        better = (facing > score) & inb
        beard = np.where(better, is_beard, beard)
        score = np.where(better, facing, score)
    z = P[:, 2]
    # Zona posible: bajo la nariz, por delante de las orejas y sobre el cuello.
    zone = (z < 1.634) & (z > 1.50) & (P[:, 1] > .035) & (np.abs(P[:, 0]) < .095)
    dens = smooth_field((beard & zone).astype(float), nbl, 6) * zone
    region = dens > .28
    faces = [f for f in F if region[f].all()]
    fuv = [u for f, u in zip(F, skin.fuv) if region[f].all()]
    # Espesor por casco a lo largo de la normal (mentón ≈ 1 cm en el perfil).
    masks = hull_masks(ref)
    hv = {k: views[k] for k in ('face_front', 'face_left', 'face_right')}
    idx = np.flatnonzero(region)
    lo, hi = np.zeros(len(idx)), np.full(len(idx), .016)
    for _ in range(12):
        mid = (lo + hi) / 2
        ins = inside_views(P[idx] + N[idx] * mid[:, None], hv, {k: masks[k] for k in hv})
        lo = np.where(ins, mid, lo)
        hi = np.where(ins, hi, mid)
    obs = np.max([1 - np.abs(N[idx] @ hv[k].toward) for k in hv], axis=0)
    t = np.where(obs > .85, lo, np.minimum(lo, .004))
    thick = np.zeros(len(P))
    thick[idx] = np.clip(t, .0015, .013)
    thick = smooth_field(thick, nbl, 5)
    edge = smooth_field(region.astype(float), nbl, 3)
    thick *= smoothstep(.5, .95, edge)
    # Bigote más corto y denso: tope de 4 mm sobre el labio.
    lip = (z > 1.598) & (z < 1.622)
    thick[lip] = np.minimum(thick[lip], .004)
    return {'region': region, 'faces': faces, 'fuv': fuv, 'thick': thick, 'density': dens, 'normals': N}


def offset_shell(P, N, thick, faces, fuv, scale=1.0, base=.0006):
    used = sorted({i for f in faces for i in f})
    remap = -np.ones(len(P), int)
    remap[used] = np.arange(len(used))
    Q = P[used] + N[used] * (thick[used] * scale + base)[:, None]
    return Q, [[int(remap[i]) for i in f] for f in faces], fuv, np.array(used)


def rounded_rect(w, h, r, n=96, taper=0.0):
    """Contorno de lente rectangular con esquinas redondeadas (x, z), sentido antihorario."""
    pts = []
    per = n // 4
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, np.pi / 2),
               (-w / 2 + r, -h / 2 + r, np.pi), (w / 2 - r, -h / 2 + r, 1.5 * np.pi)]
    for cx, cz, a0 in corners:
        for k in range(per):
            a = a0 + (np.pi / 2) * k / per
            pts.append([cx + r * np.cos(a), cz + r * np.sin(a)])
    pts = np.array(pts)
    # Borde inferior algo más angosto hacia la nariz, como el armazón de la foto.
    lower = pts[:, 1] < 0
    pts[lower, 0] *= 1 - taper * (-pts[lower, 1] / (h / 2))
    return pts


def loft_loop(path, width, depth, frame_y):
    """Aro de sección rectangular a lo largo de un contorno cerrado en X-Z."""
    n = len(path)
    P, F = [], []
    for i in range(n):
        a, b = path[i - 1], path[(i + 1) % n]
        t = b - a
        t /= np.linalg.norm(t)
        out2 = np.array([t[1], -t[0]])  # normal hacia afuera (contorno antihorario)
        wv = width[i] if np.ndim(width) else width
        for s_out, s_dep in [(-.5, .5), (.5, .5), (.5, -.5), (-.5, -.5)]:
            x, z = path[i] + out2 * wv * s_out
            P.append([x, frame_y(x) + depth * s_dep, z])
    for i in range(n):
        j = (i + 1) % n
        for k in range(4):
            k2 = (k + 1) % 4
            F.append([i * 4 + k, j * 4 + k, j * 4 + k2, i * 4 + k2])
    return np.array(P), F


def tube(points, radius, sides=8):
    """Tubo a lo largo de una polilínea abierta."""
    points = np.asarray(points, float)
    P, F = [], []
    up = np.array([0, 0, 1.0])
    for i, p in enumerate(points):
        t = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        t = normalize(t)
        a = normalize(np.cross(t, up if abs(t @ up) < .9 else np.array([1.0, 0, 0])))
        b = np.cross(t, a)
        r = radius[i] if np.ndim(radius) else radius
        for k in range(sides):
            ang = 2 * np.pi * k / sides
            P.append(p + r * (np.cos(ang) * a + np.sin(ang) * b))
    for i in range(len(points) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            F.append([i * sides + k, (i + 1) * sides + k, (i + 1) * sides + k2, i * sides + k2])
    F.append(list(range(sides))[::-1])
    F.append([(len(points) - 1) * sides + k for k in range(sides)])
    return np.array(P), F


def build_glasses(body, skin, ref, fit, views):
    """Armazón rectangular de acetato negro medido en el primer plano frontal."""
    import cv2
    lm = np.array(fit['reference_landmarks'])
    v = views['face_front']
    img = ref.images['face_front']
    L = lab_of(img)[..., 0]
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w]
    box = (xx > lm[234, 0] - 6) & (xx < lm[454, 0] + 6) & (yy > min(lm[105, 1], lm[334, 1]) - 8) & \
          (yy < max(lm[145, 1], lm[374, 1]) + 24)
    dark = box & (L < 60)
    nose_u = lm[168, 0]
    rows = np.flatnonzero(dark.sum(1) > 6)
    top, bottom = rows.min(), rows.max()
    # Ancho del frente en la franja media de la lente (la patilla sale por arriba).
    mid = dark[int(top + .35 * (bottom - top)):int(top + .75 * (bottom - top))]
    cols = np.flatnonzero(mid.any(0))
    half = min(nose_u - cols.min(), cols.max() - nose_u)
    bridge_gap = 10.0  # px entre aros sobre la nariz (≈12 mm)
    lenses = [(nose_u - half, top, nose_u - bridge_gap / 2, bottom),
              (nose_u + bridge_gap / 2, top, nose_u + half, bottom)]
    # Imagen frontal: u = u0 - x·s → x = (u0 - u)/s ; z = (v0 - v)/s
    to_x = lambda u: (v.u0 - u) / v.s
    to_z = lambda vv: (v.v0 - vv) / v.s
    eyes = body.eyes()
    eye_front = eyes[:, 1].max()
    y0 = eye_front + .012
    frame_y = lambda x: y0 - 1.6 * x * x
    P_all, F_all, groups = [], [], []
    rims = []
    for x0, yy0, x1, yy1 in lenses:
        xa, xb = sorted([to_x(x0), to_x(x1)])
        za, zb = to_z(yy1), to_z(yy0)
        cx, cz = (xa + xb) / 2, (za + zb) / 2
        wl, hl = xb - xa - .005, zb - za - .005
        path = rounded_rect(wl, hl, .0075, 96, .06) + [cx, cz]
        width = np.where(path[:, 1] > cz + hl * .25, .0068, .0046)
        Pr, Fr = loft_loop(path, width, .0058, frame_y)
        F_all += [[i + len(P_all) for i in f] for f in Fr]
        P_all += list(Pr)
        rims.append((cx, cz, wl, hl, path))
    frames = (np.array(P_all), F_all)
    # Puente y patillas.
    (c1, z1, w1, h1, _), (c2, z2, w2, h2, _) = sorted(rims, key=lambda r: r[0])
    inner1, inner2 = c1 + w1 / 2, c2 - w2 / 2
    zb = (z1 + h1 / 2 + z2 + h2 / 2) / 2 - .006
    bridge = [[x, frame_y(x), zb + .0025 * np.cos(np.pi * x / (inner2 - inner1 + 1e-6))]
              for x in np.linspace(inner1 - .002, inner2 + .002, 9)]
    Pb, Fb = tube(bridge, .0026, 8)
    head = skin.P[(skin.P[:, 2] > 1.65) & (skin.P[:, 2] < 1.70)]
    temple_half = np.abs(head[(head[:, 1] > .0) & (head[:, 1] < .09), 0]).max() + .004
    ear = skin.P[(np.abs(skin.P[:, 0]) > temple_half - .02) & (skin.P[:, 2] > 1.62) & (skin.P[:, 2] < 1.72)
                 & (skin.P[:, 1] < .04) & (skin.P[:, 1] > -.06)]
    # La patilla va casi horizontal hasta la raíz de la oreja (foto de perfil).
    eye_z = float(eyes[:, 2].mean())
    ear_top_z = eye_z + .004
    ear_y = float(np.median(ear[:, 1])) if len(ear) else -.01
    temples = []
    for (cx, cz, wl, hl, path), sign in zip(sorted(rims, key=lambda r: r[0]), (-1, 1)):
        x_out = cx + sign * wl / 2
        zt = cz + hl * .28
        pts = [[x_out + sign * .003, frame_y(x_out) - .004, zt],
               [sign * (temple_half + .002), frame_y(x_out) - .025, zt - .002],
               [sign * (temple_half + .001), ear_y + .005, ear_top_z + .003],
               [sign * (temple_half - .002), ear_y - .012, ear_top_z - .004],
               [sign * (temple_half - .006), ear_y - .020, ear_top_z - .022]]
        # Interpolación suave de la patilla.
        pts = np.array(pts)
        tt = np.linspace(0, 1, 16)
        seg = np.array([np.interp(tt, np.linspace(0, 1, len(pts)), pts[:, c]) for c in range(3)]).T
        Pt, Ft = tube(seg, np.linspace(.0030, .0024, len(seg)), 8)
        temples.append((Pt, Ft))
    lenses_mesh = []
    for cx, cz, wl, hl, path in rims:
        inner = rounded_rect(wl - .004, hl - .004, .006, 48, .06) + [cx, cz]
        Pl = [[x, frame_y(x) + .0005, z] for x, z in inner] + [[cx, frame_y(cx) + .0005, cz]]
        n = len(inner)
        Fl = [[n, i, (i + 1) % n] for i in range(n)]
        lenses_mesh.append((np.array(Pl), Fl))
    return {'frames': frames, 'bridge': (Pb, Fb), 'temples': temples, 'lenses': lenses_mesh,
            'measured': [list(map(float, r[:4])) for r in rims]}


def build_watch(body, skin):
    """Smartwatch negro redondo en la muñeca izquierda (huesos Right*, lado -X)."""
    E, Wr = body.J['RightForeArm'], body.J['RightHand']
    f = normalize(Wr - E)
    c = Wr - f * .038
    near = skin.P[(np.abs((skin.P - c) @ f) < .012) & (np.linalg.norm(skin.P - c, axis=1) < .07)]
    axis_pt = near.mean(axis=0)
    rel = near - axis_pt
    rel -= np.outer(rel @ f, f)
    # Dorso de la muñeca: lado lateral (-X) girado hacia adelante, como en la hoja.
    dorsal = normalize(np.array([-1.0, .55, 0]) - f * (np.array([-1.0, .55, 0]) @ f))
    side = normalize(np.cross(f, dorsal))
    ra = np.abs(rel @ dorsal).max() + .002
    rb = np.abs(rel @ side).max() + .002
    parts = {}
    # Correa: anillo elíptico de 2 cm de ancho.
    P, F = [], []
    n = 40
    for k, off in enumerate([-.010, .010]):
        for i in range(n):
            a = 2 * np.pi * i / n
            for thick in (0, .0028):
                P.append(axis_pt + f * off + dorsal * np.cos(a) * (ra + thick) + side * np.sin(a) * (rb + thick))
    for i in range(n):
        j = (i + 1) % n
        a0, a1 = 2 * i, 2 * j
        b0, b1 = 2 * n + 2 * i, 2 * n + 2 * j
        F += [[a0, a1, b1, b0], [a0 + 1, b0 + 1, b1 + 1, a1 + 1], [a0, a0 + 1, a1 + 1, a1], [b0, b1, b1 + 1, b0 + 1]]
    parts['WatchStrap'] = (np.array(P), F)
    # Caja: cilindro de 44 mm y 11 mm de alto sobre el dorso.
    base = axis_pt + dorsal * (ra + .002)
    P, F = [], []
    m = 40
    for hgt, rad in [(0, .0205), (.007, .0222), (.0105, .0212), (.0110, .0190)]:
        for i in range(m):
            a = 2 * np.pi * i / m
            P.append(base + dorsal * hgt + f * np.cos(a) * rad + side * np.sin(a) * rad)
    for ring in range(3):
        for i in range(m):
            j = (i + 1) % m
            F.append([ring * m + i, ring * m + j, (ring + 1) * m + j, (ring + 1) * m + i])
    F.append(list(range(m))[::-1])
    parts['WatchCase'] = (np.array(P), F)
    P = [base + dorsal * .0112 + f * np.cos(2 * np.pi * i / m) * .0186 + side * np.sin(2 * np.pi * i / m) * .0186 for i in range(m)]
    P.append(base + dorsal * .0114)
    parts['WatchScreen'] = (np.array(P), [[m, i, (i + 1) % m] for i in range(m)])
    crown = [base + dorsal * .006 + side * .021, base + dorsal * .006 + side * .0255]
    parts['WatchCrown'] = tube(crown, .0022, 10)
    return parts, {'center': base.tolist(), 'dorsal': dorsal.tolist()}


def build_collar(sweater, body):
    """Cuello redondo acanalado siguiendo el borde superior del suéter."""
    nb, boundary = sweater.neighbors()
    P = sweater.P
    top = np.flatnonzero(boundary & (P[:, 2] > 1.40))
    # Ordenar el borde por ángulo alrededor del cuello.
    c = P[top].mean(axis=0)
    ang = np.arctan2(P[top, 0] - c[0], P[top, 1] - c[1])
    loop = P[top][np.argsort(ang)]
    # Remuestreo uniforme.
    seg = np.linalg.norm(np.diff(np.vstack([loop, loop[:1]]), axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = 72
    targets = np.linspace(0, s[-1], n, endpoint=False)
    closed = np.vstack([loop, loop[:1]])
    ring = np.array([[np.interp(t, s, closed[:, k]) for k in range(3)] for t in targets])
    Pc, F, UV = [], [], []
    profile = [(-.004, -.006), (.007, -.008), (.016, -.004), (.020, .004), (.016, .009), (.004, .008), (-.006, .004)]
    for i, p in enumerate(ring):
        out = p - c
        out[2] = 0
        out = normalize(out)
        for k, (dz, dr) in enumerate(profile):
            rib = .0008 * np.cos(i * 2 * np.pi / 3)
            Pc.append(p + np.array([0, 0, dz]) + out * (dr + rib))
            UV.append([i / n, k / (len(profile) - 1)])
    m = len(profile)
    for i in range(n):
        j = (i + 1) % n
        for k in range(m - 1):
            F.append([i * m + k, j * m + k, j * m + k + 1, i * m + k + 1])
    return np.array(Pc), F


def boundary_loops(n, faces):
    """Bordes abiertos de una malla como lazos ordenados de índices."""
    edges = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            key = (min(a, b), max(a, b))
            edges[key] = edges.get(key, 0) + 1
    nxt = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            if edges[(min(a, b), max(a, b))] == 1:
                nxt[a] = b
    loops, seen = [], set()
    for start in list(nxt):
        if start in seen:
            continue
        loop, cur = [], start
        while cur not in seen and cur in nxt:
            seen.add(cur)
            loop.append(cur)
            cur = nxt[cur]
        if len(loop) > 8:
            loops.append(loop)
    return loops


BOOT_TOP = .172   # caña de la bota, cubierta por el ruedo del jean


def build_boots(body, shaft_top=None):
    """Botas de trekking: proxy MakeHuman con caña alta, suela de tacos y cordones."""
    A = body.A
    mp = A.proxy_mapping('shoes', 'shoes01')
    P = A.evaluate_proxy(mp, body.V)
    faces = [list(reversed(f)) for f in mp['faces']]
    W = mp['weights']
    upper_P, upper_F, upper_W = [list(P)], [list(faces)], [W]
    soles, laces = [], []
    loops = boundary_loops(len(P), faces)
    for side, sign in [('Left', 1), ('Right', -1)]:
        foot = np.sign(P[:, 0]) == sign
        ankle = body.J[side + 'Foot']
        loop = max([l for l in loops if np.sign(P[l, 0].mean()) == sign], key=len)
        lp = P[loop]
        c = np.array([ankle[0], ankle[1] + .012])
        ang = np.arctan2(lp[:, 0] - c[0], lp[:, 1] - c[1])
        # Caña: anillos desde la boca del zapato hasta 17 cm, con cuello acolchado.
        base_idx = sum(len(p) for p in upper_P)
        rings = [(.30, .000), (.60, .000), (.85, .003), (1.0, .007)]
        newP, newF = [], []
        prev = loop
        offset = base_idx
        for k, (t, pad) in enumerate(rings):
            z = lp[:, 2] + ((BOOT_TOP if shaft_top is None else shaft_top) - lp[:, 2]) * t
            rx, ry = .050 + pad, .058 + pad
            ex = c[0] + np.sin(ang) * rx
            ey = c[1] + np.cos(ang) * ry
            mix = smoothstep(0, .6, t)
            ring = np.stack([lp[:, 0] * (1 - mix) + ex * mix, lp[:, 1] * (1 - mix) + ey * mix, z], 1)
            idx = list(range(offset + len(newP), offset + len(newP) + len(ring)))
            newP += list(ring)
            n = len(loop)
            for i in range(n):
                j = (i + 1) % n
                newF.append([prev[i], prev[j], idx[j], idx[i]])
            prev = idx
        # Borde superior vuelto hacia adentro (espesor del cuero).
        top = np.array(newP[-len(loop):])
        inner = c[None].repeat(len(loop), 0)
        lip = np.concatenate([(top[:, :2] - inner) * .86 + inner, top[:, 2:] - .006], 1)
        idx = list(range(offset + len(newP), offset + len(newP) + len(lip)))
        newP += list(lip)
        for i in range(len(loop)):
            j = (i + 1) % len(loop)
            newF.append([prev[i], prev[j], idx[j], idx[i]])
        wfoot = np.zeros((len(newP), len(mh.BONES)))
        wfoot[:, body.bi[side + 'Foot']] = .55
        wfoot[:, body.bi[side + 'Leg']] = .45
        upper_P.append(newP)
        upper_F.append(newF)
        upper_W.append(wfoot)
        # Suela de goma con puntera levantada: contorno convexo del pie + 6 mm.
        bottom = P[foot & (P[:, 2] < .05)]
        hull = convex_hull_2d(bottom[:, :2])
        hull = resample_loop(hull, 72)
        cen = hull.mean(axis=0)
        outline = cen + (hull - cen) * (1 + .006 / np.maximum(np.linalg.norm(hull - cen, axis=1, keepdims=True), 1e-6))
        toe_y = outline[:, 1].max()
        lift = .009 * smoothstep(toe_y - .06, toe_y, outline[:, 1])
        sole_top = bottom[:, 2].min() + .004
        Ps, Fs = [], []
        layers = [(lift, 1.0), (lift + .004, 1.0), (sole_top - .010, 1.012), (sole_top, 1.0)]
        for zl, sc in layers:
            pts = cen + (outline - cen) * sc
            Ps += [[x, y, z] for (x, y), z in zip(pts, np.broadcast_to(zl, len(pts)))]
        m = len(outline)
        for k in range(len(layers) - 1):
            for i in range(m):
                j = (i + 1) % m
                Fs.append([k * m + i, k * m + j, (k + 1) * m + j, (k + 1) * m + i])
        Ps.append([cen[0], cen[1], .003])
        Fs += [[len(Ps) - 1, (i + 1) % m, i] for i in range(m)]
        Ps.append([cen[0], cen[1], sole_top])
        Fs += [[len(Ps) - 1, (len(layers) - 1) * m + i, (len(layers) - 1) * m + (i + 1) % m] for i in range(m)]
        ws = np.zeros((len(Ps), len(mh.BONES)))
        ys = np.array(Ps)[:, 1]
        toe = smoothstep(ankle[1] + .07, ankle[1] + .13, ys)
        ws[:, body.bi[side + 'Foot']] = 1 - toe
        ws[:, body.bi[side + 'ToeBase']] = toe
        soles.append((np.array(Ps), Fs, ws, outline, sole_top))
        # Cordones cruzados sobre el empeine y ganchos en la caña.
        shoe = P[foot]
        y_front = shoe[:, 1].max()
        ys = np.linspace(ankle[1] + .025, y_front - .085, 6)
        xc = np.median(shoe[(shoe[:, 1] > ankle[1]) & (shoe[:, 1] < y_front - .06), 0])
        pts = []
        for y in ys:
            band = shoe[(np.abs(shoe[:, 1] - y) < .008) & (np.abs(shoe[:, 0] - xc) < .012)]
            ztop = band[:, 2].max() + .0035 if len(band) else .09
            pts.append((y, ztop))
        segs = []
        for i in range(len(pts) - 1):
            (y1, z1), (y2, z2) = pts[i], pts[i + 1]
            for s1 in (-1, 1):
                a = [xc + s1 * .017, y2, z2]
                b = [xc - s1 * .017, y1, z1]
                mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + .002]
                segs.append([a, mid, b])
        for (y, z) in pts[-1:]:
            pass
        laces.append((segs, side))
    upper = (np.concatenate([np.asarray(p) for p in upper_P]),
             merge_faces(upper_F, [len(p) for p in upper_P]),
             np.concatenate(upper_W))
    return {'upper': upper, 'soles': soles, 'laces': laces}


def merge_faces(face_lists, sizes):
    out, off = [], 0
    # Las listas ya usan índices globales salvo la primera (proxy).
    for k, (fl, n) in enumerate(zip(face_lists, sizes)):
        out += [list(f) for f in fl]
    return out


def convex_hull_2d(pts):
    pts = sorted(map(tuple, pts))
    if len(pts) <= 2:
        return np.array(pts)
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return np.array(lower[:-1] + upper[:-1])


def resample_loop(loop, n):
    closed = np.vstack([loop, loop[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.stack([np.interp(t, s, closed[:, k]) for k in range(closed.shape[1])], 1)


def blur_sphere(values, sigma):
    """Desenfoque gaussiano en la cuadrícula (φ, θ) con continuidad en θ."""
    import cv2
    pad = int(3 * sigma) + 1
    ext = np.concatenate([values[:, -pad:], values, values[:, :pad]], axis=1).astype(np.float32)
    out = cv2.GaussianBlur(ext, (0, 0), sigma, borderType=cv2.BORDER_REPLICATE)
    return out[:, pad:-pad].astype(float)


def grid_mesh(points, keep, wrap=True, uv_rect=(0, 0, 1, 1)):
    """Malla de cuadrícula (filas φ, columnas θ) con UV equirectangular."""
    npf, nt = keep.shape
    idx = -np.ones((npf + 1, nt + 1), int)
    # Vértices en las esquinas de las celdas: promedio de centros vecinos.
    P, UV = [], []
    pad = np.concatenate([points, points[:, :1]], axis=1) if wrap else points
    for r in range(npf + 1):
        for c in range(nt + 1):
            cells = [(rr, cc % nt) for rr in (r - 1, r) for cc in (c - 1, c) if 0 <= rr < npf]
            if not any(keep[rr, cc] for rr, cc in cells):
                continue
            pts = [points[rr, cc] for rr, cc in cells]
            idx[r, c] = len(P)
            P.append(np.mean(pts, axis=0))
            UV.append([uv_rect[0] + (uv_rect[2] - uv_rect[0]) * c / nt,
                       uv_rect[3] - (uv_rect[3] - uv_rect[1]) * r / npf])
    faces, fuv = [], []
    UV = np.array(UV)
    for r in range(npf):
        for c in range(nt):
            if not keep[r, c]:
                continue
            q = [idx[r, c], idx[r + 1, c], idx[r + 1, c + 1], idx[r, c + 1]]
            if min(q) < 0:
                continue
            faces.append(q)
            fuv.append(UV[q])
    return np.array(P), faces, fuv


# ------------------------------------------------------------ ensamblado final
def transfer_weights(points, src_P, src_W, k=6):
    from scipy.spatial import cKDTree
    tree = cKDTree(src_P)
    d, idx = tree.query(points, k)
    w = 1 / np.maximum(d, 1e-4) ** 2
    out = (src_W[idx] * w[:, :, None]).sum(axis=1) / w.sum(axis=1, keepdims=True)
    return out


def strip_arm_weights(P, W, bi, mask):
    """Cuello y cuello del suéter siguen a la columna, no a los hombros."""
    W = W.copy()
    arm = [bi[b] for b in ARM_BONES]
    moved = W[mask][:, arm].sum(axis=1)
    sub = W[mask]
    sub[:, arm] = 0
    sub[:, bi['Spine2']] += moved
    W[mask] = sub / np.maximum(sub.sum(axis=1, keepdims=True), 1e-9)
    return W


def rigid(n, bone, bi):
    W = np.zeros((n, len(mh.BONES)))
    W[:, bi[bone]] = 1
    return W


def tris_uv(faces, fuv):
    F, U = [], []
    for f, u in zip(faces, fuv):
        u = np.asarray(u, float)
        for k in range(1, len(f) - 1):
            F.append([f[0], f[k], f[k + 1]])
            U.append([u[0], u[k], u[k + 1]])
    return np.array(F, np.int64), np.array(U, float)


def tris_only(faces):
    F = []
    for f in faces:
        for k in range(1, len(f) - 1):
            F.append([f[0], f[k], f[k + 1]])
    return np.array(F, np.int64)


def uv_rect_of(U, margin=.004):
    lo, hi = U.reshape(-1, 2).min(0) - margin, U.reshape(-1, 2).max(0) + margin
    return (float(lo[0]), float(lo[1]), float(hi[0]), float(hi[1]))


def remap_uv(U, rect):
    out = U.copy()
    out[..., 0] = (U[..., 0] - rect[0]) / (rect[2] - rect[0])
    out[..., 1] = (U[..., 1] - rect[1]) / (rect[3] - rect[1])
    return out


def vertex_normals(P, F):
    n = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, F[:, k], n)
    return normalize(N)


def strand_noise(h, w, seed, along=6.0, across=.8):
    """Ruido alargado (mechones) en dirección v de la textura."""
    import cv2
    rng = np.random.default_rng(seed)
    n = rng.random((h, w)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigmaX=across, sigmaY=along)
    n = (n - n.min()) / (n.max() - n.min() + 1e-9)
    return n


def save_rgb(path, img, quality=90):
    import cv2
    cv2.imwrite(str(path), cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, quality])


def save_rgba(path, rgb, alpha):
    import cv2
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    cv2.imwrite(str(path), cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])


def finalize(color, weight, cover, fallback, w0=.02, w1=.22):
    a = smoothstep(w0, w1, weight)[..., None]
    out = fallback * (1 - a) + color * a
    out[~cover] = fallback[~cover]
    out, _ = rz.dilate(out, cover, 6)
    return out


def assemble():
    import cv2
    DEBUG.mkdir(parents=True, exist_ok=True)
    TEX.mkdir(parents=True, exist_ok=True)
    fit = json.loads(FACE_FIT.read_text())
    body = Body()
    ref = Reference(body)
    fv = face_views(ref, fit)
    views = dict(ref.views)
    views.update(fv)
    shrink = conform_skull(body, ref, views)
    images = dict(ref.images)
    images.update(clean_glasses(ref, fit, fv))
    bi = body.bi
    report = {'skull_min_ratio': shrink, 'face_fit': fit['report']}

    skin = build_skin(body)
    sweater = build_sweater(body, ref)
    jeans = build_jeans(body, ref)
    hairfit = build_hair(body, skin, ref, views, images)
    beard = build_beard(skin, ref, views, images)
    glasses = build_glasses(body, skin, ref, fit, views)
    watch, watch_info = build_watch(body, skin)
    collar_P, collar_F = build_collar(sweater, body)
    boots = build_boots(body)
    eyes = body.eyes()
    eye_faces = [list(reversed(f)) for f in body.eye_map['faces']]
    eye_fuv = [list(reversed(u)) for u in body.eye_map['fuv']]
    report['glasses_lenses_m'] = glasses['measured']
    report['watch'] = watch_info

    meshes = []

    def add(name, material, P, F, U, W, extra=None):
        meshes.append({'name': name, 'material': material, 'P': np.asarray(P, np.float32),
                       'F': np.asarray(F, np.int32), 'U': None if U is None else np.asarray(U, np.float32),
                       'W': np.asarray(W, np.float32), **(extra or {})})

    # ---------------- piel
    sF, sU = tris_uv(skin.faces, skin.fuv)
    sN = vertex_normals(skin.P, sF)
    hP, hfaces, hfuv = grid_mesh(hairfit['outer'], hairfit['hair'])
    hF, hU = tris_uv(hfaces, hfuv)
    bq, bfaces, bfuv, bused = offset_shell(skin.P, beard['normals'], beard['thick'], beard['faces'], beard['fuv'])
    bF, bU = tris_uv(bfaces, bfuv)
    swF, swU = tris_uv(sweater.faces, sweater.fuv)
    jF, jU = tris_uv(jeans.faces, jeans.fuv)
    upP, upFaces, upW = boots['upper']
    upF = tris_only(upFaces)
    eF, eU = tris_uv(eye_faces, eye_fuv)
    cF = tris_only(collar_F)
    scene = [(skin.P, sF), (sweater.P, swF), (jeans.P, jF), (eyes, eF), (collar_P, cF), (upP, upF)]
    for Ps, Fs, *_ in boots['soles']:
        scene.append((Ps, tris_only(Fs)))

    def stack(parts):
        Ps, Fs, off = [], [], 0
        for P_, F_ in parts:
            Ps.append(P_)
            Fs.append(F_ + off)
            off += len(P_)
        return np.concatenate(Ps), np.concatenate(Fs)

    occ_body = stack(scene)
    occ_all = stack(scene + [(hP, hF), (bq, bF)])
    baker = Baker(ref, images, views)
    all_views = ['face_front', 'face_left', 'face_right', 'turn_front', 'turn_back', 'turn_right', 'turn_left']
    turn_views = ['turn_front', 'turn_back', 'turn_right', 'turn_left']

    col, wt, cover, (tri_of, bary) = baker.bake(skin.P, sF, sU, sN, 2048, occ_body, 'skin', all_views)
    texel_pos = np.zeros(cover.shape + (3,))
    texel_pos[cover] = (skin.P[sF[tri_of[cover]]] * bary[cover][:, :, None]).sum(axis=1)
    # Sin foto bajo el cuello del suéter ni bajo el puño: allí asoma la prenda.
    hidden = (neck_norm(texel_pos.reshape(-1, 3)).reshape(cover.shape) < 1.16) & (texel_pos[..., 2] < 1.555)
    hidden |= (texel_pos[..., 2] > CUFF_Z - .012) & (texel_pos[..., 2] < 1.40)
    wt[hidden] = 0
    mhskin = cv2.cvtColor(cv2.imread(str(mh.REAL / 'skin.png')), cv2.COLOR_BGR2RGB).astype(float)
    lab = lab_of(col)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    skinpx = (wt > .3) & (chroma > 14) & (lab[..., 0] > 90)
    fallback = color_transfer(mhskin, cover, col[skinpx])
    # Cuero cabelludo bajo el pelo: gris del pelo, no piel (si asoma entre mechones).
    c = hairfit['center']
    d = texel_pos - c
    r = np.linalg.norm(d, axis=-1)
    th = np.arctan2(d[..., 0], d[..., 1])
    ph = np.arccos(np.clip(d[..., 2] / np.maximum(r, 1e-9), -1, 1))
    nt, npf = hairfit['grid']
    gi = np.clip((ph / np.pi * npf).astype(int), 0, npf - 1)
    gj = np.clip(((th + np.pi) / (2 * np.pi) * nt).astype(int), 0, nt - 1)
    under_hair = cover & hairfit['hair'][gi, gj] & (texel_pos[..., 2] > 1.60)
    skin_tex = finalize(col, wt, cover, fallback)
    hair_px = col[(wt > .3) & cover & under_hair]
    hair_mean = hair_px.mean(axis=0) if len(hair_px) else np.array([150, 145, 140])
    weak = under_hair & (wt < .15)
    skin_tex[weak] = skin_tex[weak] * .3 + hair_mean * .7
    save_rgb(TEX / 'estanga-skin.jpg', skin_tex, 90)
    neck_zone = (neck_norm(skin.P) < 1.35) & (skin.P[:, 2] > 1.42)
    add('EstangaSkin', 'Skin', skin.P, sF, sU, strip_arm_weights(skin.P, skin.W, bi, neck_zone))
    add('EstangaEyes', 'EyeWhite', eyes, eF, eU, rigid(len(eyes), 'Head', bi))

    # ---------------- pelo (cáscara + dos capas de mechones)
    hN = vertex_normals(hP, hF)
    occ_hair = stack(scene + [(hP, hF)])
    hcol, hwt, hcover, (htri, hbary) = baker.bake(hP, hF, hU, hN, (1024, 640), occ_hair, 'hair', all_views)
    noise = strand_noise(640, 1024, 3, along=7, across=.9)
    hfall = np.zeros_like(hcol) + hair_mean * (0.82 + .36 * noise[..., None])
    hair_tex = finalize(hcol, hwt, hcover, hfall)
    # Canas: mechones claros como en la hoja (la luz del juego las apaga un poco).
    hair_tex = hair_tex * (.92 + .24 * noise[..., None]) + 6
    # Alfa: borde de la línea de pelo suave y mechones para las capas externas.
    edge = hairfit['edge']
    # Fila de textura y = fila de la cuadrícula (v = 1 - fila/npf en grid_mesh).
    gi = np.clip(((np.arange(640)[:, None] + .5) / 640 * npf).astype(int), 0, npf - 1)
    gj = np.clip(((np.arange(1024)[None] + .5) / 1024 * nt).astype(int), 0, nt - 1)
    efade = smoothstep(0, 2.5, edge[gi, gj])
    hair_alpha = efade * (.55 + .45 * noise)
    save_rgba(TEX / 'estanga-hair.png', hair_tex, hair_alpha)
    head_w = rigid(len(hP), 'Head', bi)
    add('EstangaHair', 'EstangaHair', hP, hF, hU, head_w)
    for k, (dr, mat) in enumerate([(.0035, 'EstangaHairFur1'), (.0070, 'EstangaHairFur2')]):
        shellP = c + (hP - c) * (1 + dr / np.maximum(np.linalg.norm(hP - c, axis=1, keepdims=True), 1e-6))
        add(f'EstangaHairShell{k + 1}', mat, shellP, hF, hU, head_w)

    # ---------------- barba
    brect = uv_rect_of(bU)
    bN = vertex_normals(bq, bF)
    bcol, bwt, bcover, (btri, bbary) = baker.bake(bq, bF, bU, bN, 1024, occ_all, 'beard', ['face_front', 'face_left', 'face_right'], rect=brect)
    dens_v = beard['density'][bused]
    texd = np.zeros(bcover.shape)
    texd[bcover] = (dens_v[bF[btri[bcover]]] * bbary[bcover]).sum(axis=1)
    bnoise = strand_noise(1024, 1024, 5, along=2.5, across=.7)
    seen_beard = bcover & (bwt > .2)
    beard_mean = np.median(bcol[seen_beard], axis=0) if seen_beard.any() else np.array([170, 162, 152])
    bfall = np.zeros_like(bcol) + beard_mean * (.85 + .25 * bnoise[..., None])
    beard_tex = finalize(bcol, bwt, bcover, bfall)
    # Solo hay barba con volumen donde alguna foto la ve (bajo el mentón no).
    beard_alpha = smoothstep(.12, .38, texd) * smoothstep(.03, .2, bwt) * (.5 + .5 * bnoise)
    save_rgba(TEX / 'estanga-beard.png', beard_tex, beard_alpha)
    bUr = remap_uv(bU, brect)
    add('EstangaBeard', 'EstangaBeard', bq, bF, bUr, rigid(len(bq), 'Head', bi))
    bN2 = vertex_normals(bq, bF)
    add('EstangaBeardShell', 'EstangaBeardFur', bq + bN2 * (.002 + beard['thick'][bused, None] * .35), bF, bUr,
        rigid(len(bq), 'Head', bi))

    # ---------------- suéter
    srect = uv_rect_of(swU)
    aspect = (srect[3] - srect[1]) / (srect[2] - srect[0])
    size = (2048, int(round(2048 * aspect / 8)) * 8)
    swN = vertex_normals(sweater.P, swF)
    wcol, wwt, wcover, (wtri, wbary) = baker.bake(sweater.P, swF, swU, swN, size, occ_body, 'body', turn_views,
                                                  power=2.0, rect=srect, reject=skin_like)
    good = wcover & (wwt > .05)
    sw_mean = np.median(wcol[good], axis=0)
    tpos = np.zeros(wcover.shape + (3,))
    tpos[wcover] = (sweater.P[swF[wtri[wcover]]] * wbary[wcover][:, :, None]).sum(axis=1)
    knit = strand_noise(size[1], size[0], 9, along=1.2, across=1.2)
    wfall = np.zeros_like(wcol) + sw_mean * (.9 + .2 * knit[..., None])
    sw_tex = finalize(wcol, wwt, wcover, wfall)
    # Acanalado del dobladillo y los puños: costillas verticales cada 5 mm.
    angle_t = np.arctan2(tpos[..., 0], tpos[..., 1] - .06)
    hem = (tpos[..., 2] < HEM_Z + .055) & wcover
    ribs = .5 + .5 * np.cos(angle_t * .21 / .0052 * 2 * np.pi / (2 * np.pi))
    sw_tex[hem] *= (.86 + .2 * ribs[hem])[:, None]
    sw_tex *= (.94 + .12 * knit[..., None])
    save_rgb(TEX / 'estanga-sweater.jpg', sw_tex, 90)
    add('EstangaSweater', 'EstangaSweater', sweater.P, swF, remap_uv(swU, srect), sweater.W)
    collar_W = strip_arm_weights(collar_P, transfer_weights(collar_P, sweater.P, sweater.W), bi,
                                 np.ones(len(collar_P), bool))
    add('EstangaCollar', 'SweaterRib', collar_P, cF, None, collar_W, {'color': (sw_mean * .92).tolist()})

    # ---------------- jean
    jrect = uv_rect_of(jU)
    aspect = (jrect[3] - jrect[1]) / (jrect[2] - jrect[0])
    size = (2048, int(round(2048 * aspect / 8)) * 8)
    jN = vertex_normals(jeans.P, jF)
    olive = lambda col: skin_like(col) | (lab_of(col[None])[0][:, 2] > 136)  # manos y borde del suéter
    jcol, jwt, jcover, _ = baker.bake(jeans.P, jF, jU, jN, size, occ_body, 'body', turn_views, power=2.0, rect=jrect,
                                      reject=olive, hide=lambda pos: pos[:, 2] > HEM_Z - .004)
    good = jcover & (jwt > .05)
    j_mean = np.median(jcol[good], axis=0)
    twill = strand_noise(size[1], size[0], 13, along=1.0, across=1.0)
    yy, xx = np.mgrid[0:size[1], 0:size[0]]
    diag = .5 + .5 * np.sin((xx + yy) * 2 * np.pi / 3.0)
    jfall = np.zeros_like(jcol) + j_mean * (.9 + .2 * twill[..., None])
    j_tex = finalize(jcol, jwt, jcover, jfall)
    j_tex *= (.93 + .07 * diag[..., None]) * (.95 + .1 * twill[..., None])
    save_rgb(TEX / 'estanga-jeans.jpg', j_tex, 90)
    add('EstangaJeans', 'EstangaJeans', jeans.P, jF, remap_uv(jU, jrect), jeans.W)

    # ---------------- botas
    bootU = boot_uv(upP, upF, body)
    bN3 = vertex_normals(upP, upF)
    kcol, kwt, kcover, (ktri, kbary) = baker.bake(upP, upF, bootU, bN3, 1024, occ_body, 'body', turn_views, power=2.0)
    kpos = np.zeros(kcover.shape + (3,))
    kpos[kcover] = (upP[upF[ktri[kcover]]] * kbary[kcover][:, :, None]).sum(axis=1)
    boot_tex = boot_albedo(kpos, kcover, body, boots)
    a = smoothstep(.02, .25, kwt)[..., None] * .45
    boot_tex = boot_tex * (1 - a) + kcol * a
    boot_tex, _ = rz.dilate(boot_tex, kcover, 6)
    save_rgb(TEX / 'estanga-boots.jpg', boot_tex, 90)
    add('EstangaBoots', 'EstangaBoots', upP, upF, bootU, upW)
    soleP, soleF, soleW = [], [], []
    off = 0
    for Ps, Fs, ws, *_ in boots['soles']:
        soleP.append(Ps)
        soleF.append(tris_only(Fs) + off)
        soleW.append(ws)
        off += len(Ps)
    add('EstangaSoles', 'BootSole', np.concatenate(soleP), np.concatenate(soleF), None, np.concatenate(soleW),
        {'color': [38, 35, 33]})
    laceP, laceF, off = [], [], 0
    for segs, side in boots['laces']:
        for sg in segs:
            Pt, Ft = tube(sg, .0021, 6)
            laceP.append(Pt)
            laceF.append(tris_only(Ft) + off)
            off += len(Pt)
    laceP = np.concatenate(laceP)
    add('EstangaLaces', 'BootLaces', laceP, np.concatenate(laceF), None, transfer_weights(laceP, upP, upW),
        {'color': [176, 138, 88]})

    # ---------------- anteojos y reloj
    parts = [glasses['frames'], glasses['bridge']] + glasses['temples']
    gP, gF, off = [], [], 0
    for Pp, Ff in parts:
        gP.append(np.asarray(Pp))
        gF.append(tris_only(Ff) + off)
        off += len(Pp)
    gP = np.concatenate(gP)
    add('Spectacles', 'GlassesFrames', gP, np.concatenate(gF), None, rigid(len(gP), 'Head', bi), {'color': [14, 14, 15]})
    lP, lF, off = [], [], 0
    for Pp, Ff in glasses['lenses']:
        lP.append(Pp)
        lF.append(tris_only(Ff) + off)
        off += len(Pp)
    lP = np.concatenate(lP)
    add('Lenses', 'GlassesLenses', lP, np.concatenate(lF), None, rigid(len(lP), 'Head', bi), {'color': [200, 210, 215]})
    for key, name, color in [('WatchCase', 'Wristwatch', [22, 22, 24]), ('WatchStrap', 'WristwatchStrap', [12, 12, 13]),
                             ('WatchScreen', 'WristwatchScreen', [6, 7, 9]), ('WatchCrown', 'WristwatchCrown', [40, 40, 42])]:
        Pp, Ff = watch[key]
        Pp = np.asarray(Pp)
        add(name, key, Pp, tris_only(Ff), None, transfer_weights(Pp, skin.P, skin.W, 8), {'color': color})

    # Silueta final contra la hoja (puerta de calidad multivista).
    allP, allF = stack([(m['P'].astype(float), m['F']) for m in meshes if m['name'] not in ('Lenses',)])
    report['silhouette_iou'] = {}
    for name in turn_views:
        mask = rz.silhouette(views[name], allP, allF)
        report['silhouette_iou'][name] = rz.iou(mask, ref.masks[name])
    for name in ('face_front', 'face_left', 'face_right'):
        mask = rz.silhouette(views[name], allP, allF)
        h = ref.masks[name].shape[0]
        upper = np.zeros_like(mask)
        upper[:int(h * .62)] = True
        report['silhouette_iou'][name + '_head'] = rz.iou(mask & upper, ref.masks[name] & upper)
    joints = {b: body.J[b].tolist() for b in mh.BONES}
    return meshes, joints, report


def skin_like(col):
    lab = lab_of(col[None])[0]
    a, b = lab[:, 1] - 128, lab[:, 2] - 128
    return (np.hypot(a, b) > 13) & (a > 6) & (lab[:, 0] > 70)


def boot_uv(P, F, body):
    """UV esféricas por pie: izquierda en u∈[0,.5], derecha en [.5,1]."""
    U = np.zeros((len(F), 3, 2))
    for side, sign, u0 in [('Left', 1, 0.0), ('Right', -1, .5)]:
        a = body.J[side + 'Foot']
        c = np.array([a[0], a[1] + .06, .07])
        d = P - c
        th = np.arctan2(d[:, 0] * sign, d[:, 1])
        ph = np.arccos(np.clip(d[:, 2] / np.maximum(np.linalg.norm(d, axis=1), 1e-9), -1, 1))
        u = u0 + .5 * (th + np.pi) / (2 * np.pi)
        v = 1 - ph / np.pi
        sel = np.sign(P[F].mean(axis=1)[:, 0]) == sign
        uvv = np.stack([u, v], 1)
        tri_uv = uvv[F]
        # Costura en θ = ±π (talón): evitar triángulos que la crucen.
        span = tri_uv[..., 0].max(1) - tri_uv[..., 0].min(1)
        fix = span > .2
        t = tri_uv[fix]
        t[..., 0] = np.where(t[..., 0] < u0 + .25, t[..., 0] + .5, t[..., 0])
        t[..., 0] = np.minimum(t[..., 0], u0 + .4999)
        tri_uv[fix] = t
        U[sel] = tri_uv[sel]
    return U


def boot_albedo(pos, cover, body, boots):
    """Nobuk marrón, puntera y talón de cuero oscuro, franja de goma y costuras."""
    out = np.zeros(pos.shape)
    nubuck = np.array([128, 95, 62.0])
    leather = np.array([70, 50, 34.0])
    rubber = np.array([44, 40, 37.0])
    for side, sign in [('Left', 1), ('Right', -1)]:
        a = body.J[side + 'Foot']
        sel = cover & (np.sign(pos[..., 0]) == sign)
        p = pos[sel]
        y = p[:, 1] - a[1]
        z = p[:, 2]
        toe_front = y.max() if len(y) else .2
        col = np.tile(nubuck, (len(p), 1))
        cap = smoothstep(toe_front - .075, toe_front - .060, y) & (z < .085) if False else \
            smoothstep(toe_front - .078, toe_front - .062, y) * (1 - smoothstep(.075, .085, z))
        heel = (1 - smoothstep(-.02, .005, y)) * (1 - smoothstep(.07, .08, z))
        stay = (np.abs(p[:, 0] - a[0]) < .028) & (y > .0) & (y < toe_front - .07) & (z > .07)
        col = col * (1 - cap[:, None]) + leather * cap[:, None]
        col = col * (1 - heel[:, None]) + leather * heel[:, None]
        col[stay] = col[stay] * .55 + leather * .45
        band = 1 - smoothstep(.040, .048, z)
        col = col * (1 - band[:, None]) + rubber * band[:, None]
        stitch = (np.abs(z - .052) < .0012) | (np.abs(y - (toe_front - .07)) < .0012) & (z > .045)
        col[stitch] = col[stitch] * .6 + np.array([190, 165, 120]) * .4
        rng = np.random.default_rng(17)
        col *= (.9 + .2 * rng.random((len(p), 1)))
        out[sel] = col
    return out


def write_npz(meshes, joints, report):
    WORK.mkdir(parents=True, exist_ok=True)
    data = {}
    manifest = {'meshes': [], 'joints': joints, 'bones': mh.BONES, 'parents': mh.PARENTS}
    for i, m in enumerate(meshes):
        key = f'm{i}'
        data[key + '_P'] = m['P']
        data[key + '_F'] = m['F']
        data[key + '_W'] = m['W']
        if m['U'] is not None:
            data[key + '_U'] = m['U']
        manifest['meshes'].append({'key': key, 'name': m['name'], 'material': m['material'],
                                   'uv': m['U'] is not None, 'color': m.get('color')})
    np.savez_compressed(WORK / 'model.npz', **data)
    (WORK / 'model.json').write_text(json.dumps(manifest, indent=1))
    (WORK / 'report.json').write_text(json.dumps(report, indent=1, default=float))


if __name__ == '__main__':
    meshes, joints, report = assemble()
    write_npz(meshes, joints, report)
    tris = sum(len(m['F']) for m in meshes)
    print('mallas', len(meshes), 'triángulos', tris)
    print(json.dumps(report['silhouette_iou'], indent=1))
