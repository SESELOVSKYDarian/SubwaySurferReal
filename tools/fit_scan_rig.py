"""Ajuste de plantilla MakeHuman a un personaje escaneado (estilo SMPL).

Uso: python3 tools/fit_scan_rig.py hoodie-student   (después de rig_scan.py dump)
Posa y escala el cuerpo MakeHuman CC0 (52 huesos con pesos anatómicos) hasta
que coincide con la superficie del escaneo: cadera, columna, cabeza, hombros,
codos, muñecas, caderas, rodillas y largos de segmentos. Pérdida robusta para
que el pelo largo y la ropa suelta no arrastren el ajuste. Escribe las
articulaciones ajustadas y los pesos transferidos a cada vértice del escaneo.
"""
import json
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

sys.path.insert(0, str(Path(__file__).resolve().parent))
import estanga_mh as mh  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'test-results/scans'
BI = {b: i for i, b in enumerate(mh.BONES)}

# Pose inicial por personaje: (brazo [rotvec], antebrazo [x, z]) para el lado +X.
INIT = {
    'hoodie-student': {'arm': (0, .62, 0), 'fore': (-.75, 0)},
    # Sostiene el teléfono frente al pecho: codo flexionado ~100°, antebrazo adentro.
    'phone-student': {'arm': (.10, .55, 0), 'fore': (.90, .60)},
}
LAYOUT = ['tx', 'ty', 'tz', 'yaw', 'scale', 'arm_len', 'leg_len', 'torso_len',
          'spine_x', 'spine_y', 'neck_x', 'neck_z']
for _s in ('L', 'R'):
    LAYOUT += [f'{_s}arm0', f'{_s}arm1', f'{_s}arm2', f'{_s}fore0', f'{_s}fore2', f'{_s}hand0', f'{_s}hand2']
for _s in ('L', 'R'):
    LAYOUT += [f'{_s}leg0', f'{_s}leg1', f'{_s}leg2', f'{_s}knee']
IDX = {k: i for i, k in enumerate(LAYOUT)}


def relaxed_hands(A):
    import types
    import estanga_model as em
    b = types.SimpleNamespace(A=A, W=A.weights, bi=BI)
    b.mhw = types.MethodType(em.Body.mhw, b)
    b.w = types.MethodType(em.Body.w, b)
    return em.Body.curl_fingers(b, A.V.copy())


class Template:
    def __init__(self):
        A = mh.Anatomy(height=1.70, targets=[])
        used = np.array(sorted({i for f in A.groups['body'] for i in f}))
        # Manos relajadas como en los escaneos: dedos rectos del molde se apoyaban
        # sobre el muslo y le pasaban peso de mano al jean.
        self.V = relaxed_hands(A)[used]
        self.W = A.weights[used]
        self.faces_ok = used
        self.J = np.array([A.joint_pos[b] for b in mh.BONES])
        self.parent = np.array([BI[mh.PARENTS[b]] if mh.PARENTS[b] else -1 for b in mh.BONES])
        side = lambda b: b.startswith(('Left', 'Right'))
        self.arm_chain = np.array([side(b) and not b.endswith('Shoulder') and
                                   any(k in b for k in ('Arm', 'Hand')) for b in mh.BONES])
        self.leg_chain = np.array([side(b) and any(k in b for k in ('UpLeg', 'Leg', 'Foot', 'Toe')) for b in mh.BONES])
        self.torso_chain = ~(self.arm_chain | self.leg_chain)

    def pose(self, x, points=None):
        """Articulaciones y vértices posados para el vector de parámetros x."""
        p = dict(zip(LAYOUT, x))
        local = np.tile(np.eye(3), (len(mh.BONES), 1, 1))
        rv = lambda *v: Rotation.from_rotvec(v).as_matrix()
        local[BI['Spine1']] = rv(p['spine_x'], p['spine_y'], 0)
        local[BI['Neck']] = rv(p['neck_x'], 0, p['neck_z'])
        for s, name in (('L', 'Left'), ('R', 'Right')):
            local[BI[name + 'Arm']] = rv(p[f'{s}arm0'], p[f'{s}arm1'], p[f'{s}arm2'])
            local[BI[name + 'ForeArm']] = rv(p[f'{s}fore0'], 0, p[f'{s}fore2'])
            local[BI[name + 'Hand']] = rv(p[f'{s}hand0'], 0, p[f'{s}hand2'])
            # Piernas de pie: flexión y apertura, sin torsión (el pie no gira).
            local[BI[name + 'UpLeg']] = rv(p[f'{s}leg0'], p[f'{s}leg1'], 0)
            local[BI[name + 'Leg']] = rv(p[f'{s}knee'], 0, 0)
        seg = np.where(self.arm_chain, p['arm_len'], np.where(self.leg_chain, p['leg_len'], p['torso_len']))
        R = np.zeros_like(local)
        P = np.zeros((len(mh.BONES), 3))
        for b in range(len(mh.BONES)):
            q = self.parent[b]
            if q < 0:
                R[b] = local[b]
                P[b] = self.J[b]
            else:
                P[b] = P[q] + R[q] @ ((self.J[b] - self.J[q]) * seg[b])
                R[b] = R[q] @ local[b]
        V = self.V if points is None else points
        W = self.W if points is None else None
        M = R * seg[:, None, None]                   # rotación y escala del segmento
        off = P - np.einsum('bij,bj->bi', M, self.J)
        A = (W @ M.reshape(len(mh.BONES), 9)).reshape(-1, 3, 3)
        out = np.einsum('nij,nj->ni', A, V) + W @ off
        G = Rotation.from_rotvec([0, 0, p['yaw']]).as_matrix() * p['scale']
        t = np.array([p['tx'], p['ty'], p['tz']])
        return out @ G.T + t, P @ G.T + t


def initial(stem, temp, scan):
    x = np.zeros(len(LAYOUT))
    x[IDX['scale']] = (scan[:, 2].max() - scan[:, 2].min()) / (temp.V[:, 2].max() + .02)
    x[IDX['arm_len']] = x[IDX['leg_len']] = x[IDX['torso_len']] = 1
    x[IDX['tx']] = np.median(scan[:, 0])
    x[IDX['ty']] = np.median(scan[scan[:, 2] < .5 * scan[:, 2].max(), 1]) - np.median(temp.V[temp.V[:, 2] < .85, 1]) * x[IDX['scale']]
    x[IDX['tz']] = scan[:, 2].min()
    init = INIT.get(stem, INIT['hoodie-student'])
    for s, sign in (('L', 1), ('R', -1)):
        a = init['arm']
        x[IDX[f'{s}arm0']], x[IDX[f'{s}arm1']], x[IDX[f'{s}arm2']] = a[0], sign * a[1], sign * a[2]
        x[IDX[f'{s}fore0']], x[IDX[f'{s}fore2']] = init['fore'][0], sign * init['fore'][1]
    return x


def fit(stem):
    data = np.load(WORK / f'{stem}-high.npz')
    scan = np.concatenate([data[k] for k in data.files if k.startswith('P')])
    temp = Template()
    rng = np.random.default_rng(3)
    scan_sample = scan[rng.choice(len(scan), 2500, replace=False)]
    temp_idx = rng.choice(len(temp.V), 2500, replace=False)
    tree = cKDTree(scan)
    x0 = initial(stem, temp, scan)
    prior = x0.copy()
    # Restricción de lado: una pierna o brazo del molde solo se empareja con su
    # mitad del escaneo (franja central de 3 cm para manos juntas y entrepierna).
    cx = x0[IDX['tx']]
    left_w = temp.W[:, [i for i, b in enumerate(mh.BONES) if b.startswith('Left')]].sum(1)
    right_w = temp.W[:, [i for i, b in enumerate(mh.BONES) if b.startswith('Right')]].sum(1)
    side = np.where(left_w > .5, 1, np.where(right_w > .5, -1, 0))[temp_idx]
    halves = {1: cKDTree(scan[scan[:, 0] > cx - .03]), -1: cKDTree(scan[scan[:, 0] < cx + .03]), 0: tree}
    scan_side = np.where(scan_sample[:, 0] > cx + .05, 1, np.where(scan_sample[:, 0] < cx - .05, -1, 0))

    arm_param = np.array([k[1:4] in ('arm', 'for', 'han') for k in LAYOUT])
    arm_point = np.array([any(k in mh.BONES[np.argmax(w)] for k in ('Arm', 'Hand')) and
                          mh.BONES[np.argmax(w)].startswith(('Left', 'Right')) for w in temp.W[temp_idx]])
    stage = {'skip_arms': False}

    def residuals(x):
        V, _ = temp.pose(x)
        T = V[temp_idx]
        # Cuerpo → escaneo: todo el cuerpo debe quedar sobre la superficie.
        d1 = np.zeros(len(T))
        for k, t in halves.items():
            sel = side == k
            d1[sel] = t.query(T[sel])[0]
        # Escaneo → cuerpo: pelo y ropa suelta quedan como valores atípicos.
        d2 = np.zeros(len(scan_sample))
        for k in (1, -1, 0):
            pool = T[(side == k) | (side == 0)] if k else T
            sel = scan_side == k
            d2[sel] = cKDTree(pool).query(scan_sample[sel])[0]
        legs = [IDX[f'{s}{k}'] for s in 'LR' for k in ('leg0', 'leg1', 'knee')]
        reg = np.concatenate([(x[8:] - prior[8:]) * .015, (x[5:8] - 1) * .2,
                              (x[legs] - prior[legs]) * .12])
        if stage['skip_arms']:
            # Etapa 1: los brazos del molde no tiran del tronco ni de las piernas.
            d1 = np.where(arm_point, 0, d1)
        return np.concatenate([d1 * 1.4, d2 * .7, reg])

    scale = np.full(len(LAYOUT), .2)
    scale[:3] = .02
    scale[4:8] = .03

    def solve(x, active, nfev):
        def sub(y):
            full = x.copy()
            full[active] = y
            return residuals(full)
        r = least_squares(sub, x[active], loss='soft_l1', f_scale=.025, x_scale=scale[active],
                          max_nfev=nfev, diff_step=1e-3)
        out = x.copy()
        out[active] = r.x
        return out, r
    # Etapas: tronco y piernas con brazos fijos, luego brazos, luego todo junto.
    stage['skip_arms'] = True
    x1, _ = solve(x0, ~arm_param, 300)
    stage['skip_arms'] = False
    # Arranque múltiple de los brazos: el codo flexionado tiene mínimos locales
    # (una mano puede terminar en el hombro). Se conserva el de menor costo.
    best = None
    for fx in (-.6, .3, .9, 1.4):
        for fz in (0, .5):
            start = x1.copy()
            for s, sign in (('L', 1), ('R', -1)):
                start[IDX[f'{s}fore0']], start[IDX[f'{s}fore2']] = fx, sign * fz
            cand, r = solve(start, arm_param, 120)
            if best is None or r.cost < best[1]:
                best = (cand, r.cost)
    x2, _ = solve(best[0], arm_param, 300)
    xf, res = solve(x2, np.ones(len(LAYOUT), bool), 300)
    res.x = xf
    V, P = temp.pose(res.x)
    d1, _ = tree.query(V)
    report = {'cost': float(res.cost), 'body_to_scan_mm_median': float(np.median(d1) * 1000),
              'body_to_scan_mm_p90': float(np.percentile(d1, 90) * 1000), 'evaluations': int(res.nfev),
              'params': dict(zip(LAYOUT, map(float, res.x)))}
    print(stem, 'cuerpo→escaneo mediana %.1f mm, p90 %.1f mm, %d evaluaciones' %
          (report['body_to_scan_mm_median'], report['body_to_scan_mm_p90'], res.nfev))
    joints = {b: P[i].tolist() for i, b in enumerate(mh.BONES)}
    (WORK / f'{stem}-fit.json').write_text(json.dumps({'joints': joints, 'report': report}, indent=1))
    np.save(WORK / f'{stem}-template.npy', V)
    transfer(stem, temp, V)
    return report


def template_normals(V):
    A = mh.Anatomy(height=1.70, targets=[])
    used = np.array(sorted({i for f in A.groups['body'] for i in f}))
    remap = -np.ones(len(A.V), int)
    remap[used] = np.arange(len(used))
    N = np.zeros_like(V)
    for f in A.groups['body']:
        f = [remap[i] for i in reversed(f)]
        for k in range(1, len(f) - 1):
            a, b, c = f[0], f[k], f[k + 1]
            n = np.cross(V[b] - V[a], V[c] - V[a])
            N[a] += n
            N[b] += n
            N[c] += n
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


def drop_arm_islands(W, F, arm, pts):
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    a = W[:, arm].sum(axis=1)
    # El escaneo está partido en islas UV: soldar por posición para la conectividad.
    _, weld = np.unique(np.round(pts / 5e-4).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.ravel()
    n = weld.max() + 1
    a_weld = np.zeros(n)
    np.maximum.at(a_weld, weld, a)
    dom_w = a_weld > .35
    e = weld[np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])]
    e = e[dom_w[e[:, 0]] & dom_w[e[:, 1]]]
    graph = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    count, label_w = connected_components(graph, directed=False)
    label = label_w[weld]
    dom = a > .35
    top = pts[:, 2].max()
    keep = np.zeros(count, bool)
    for comp in np.unique(label[dom]):
        members = (label == comp) & dom
        # Un brazo real llega a la altura del hombro (último cuarto superior del cuerpo).
        keep[comp] = pts[members, 2].max() > .72 * top and members.sum() > 200
    island = dom & ~keep[label]
    W = W.copy()
    W[np.ix_(island, arm)] = 0
    empty = island & (W.sum(axis=1) < 1e-6)
    W[empty, BI['Hips']] = 1
    W[island] /= W[island].sum(axis=1, keepdims=True)
    print('  islas de brazo descartadas:', int(island.sum()), 'vértices')
    return W


# Poses del juego para detectar caras de contacto: {hueso: rotación (eje X del modelo)}.
_SWING = [(-.85, .75, -1.5), (.75, -.85, -1.5), (-1.1, -.8, -.9), (-.9, -.9, -1.5), (.4, .4, -.45)]
TEST_POSES = {'default': [{'LeftArm': l, 'RightArm': r, 'LeftForeArm': e, 'RightForeArm': e} for l, r, e in _SWING]}
# La conectada no bracea (sostiene el teléfono): solo dobla el tronco al rodar.
TEST_POSES['phone-student'] = [{'Spine': -.65 * .6, 'Spine1': -.65 * .4, 'Spine2': -.35}]


def contact_faces(P, F, W, joints, poses, threshold=2.2):
    """Triángulos que se estiran más de threshold veces en alguna pose de juego.

    En un escaneo la manga queda fusionada al costado y la mano al muslo: esas
    caras no existen en un cuerpo real y al bracear se estiran como una lámina.
    """
    rv = lambda v: Rotation.from_rotvec(v).as_matrix()

    def about(R, p):
        T = np.eye(4)
        T[:3, :3] = R
        T[:3, 3] = p - R @ p
        return T
    rest = lambda Q: np.stack([np.linalg.norm(Q[F[:, a]] - Q[F[:, b]], axis=1)
                               for a, b in ((0, 1), (1, 2), (2, 0))], 1).max(1)
    base = np.maximum(rest(P), 1e-6)
    Ph = np.c_[P, np.ones(len(P))]
    worst = np.zeros(len(F))
    for pose in poses:
        local = {b: np.eye(4) for b in mh.BONES}
        for bone, angle in pose.items():
            local[bone] = about(rv([angle, 0, 0]), np.array(joints[bone]))
        G = {}
        for b in mh.BONES:
            q = mh.PARENTS[b]
            G[b] = G[q] @ local[b] if q else local[b]
        M = np.array([G[b] for b in mh.BONES])
        X = np.einsum('nb,bij,nj->ni', W, M, Ph)[:, :3]
        worst = np.maximum(worst, rest(X) / base)
    return worst > threshold


def transfer(stem, temp, V):
    """Pesos por vecinos con normal compatible: la cara interna de una manga pegada
    al torso toma el brazo (normal hacia adentro), no el costado del torso."""
    joints = json.loads((WORK / f'{stem}-fit.json').read_text())['joints']
    body_tree = cKDTree(V)
    NV = template_normals(V)
    arm = np.array([b.startswith(('Left', 'Right')) and any(k in b for k in ('Arm', 'Hand')) for b in mh.BONES])
    high_pts, high_w = [], []
    for level in ('high', 'low'):
        d = np.load(WORK / f'{stem}-{level}.npz')
        out = {}
        for key in [k for k in d.files if k.startswith('P')]:
            pts = d[key]
            if level == 'low':
                # La malla decimada está muy fragmentada: hereda los pesos ya
                # limpios del nivel alto (misma superficie del escaneo).
                hp, hw = np.concatenate(high_pts), np.concatenate(high_w)
                dist, idx = cKDTree(hp).query(pts, 3)
                w = 1 / np.maximum(dist, 1e-4) ** 2
                W = (hw[idx] * w[:, :, None]).sum(axis=1) / w.sum(axis=1, keepdims=True)
                out['W' + key[1:]] = W.astype(np.float32)
                out['D' + key[1:]] = contact_faces(pts, d['F' + key[1:]], W, joints, TEST_POSES.get(stem, TEST_POSES['default']))
                print('  ', level, 'caras de contacto:', int(out['D' + key[1:]].sum()))
                continue
            nrm = d['N' + key[1:]]
            nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
            dist, idx = body_tree.query(pts, 32)
            agree = np.einsum('nkj,nj->nk', NV[idx], nrm) > .3
            agree[~agree.any(axis=1), :6] = True
            w = np.where(agree, 1 / np.maximum(dist, 1e-3) ** 2, 0)
            keep = np.argsort(-w, axis=1)[:, :6]
            w = np.take_along_axis(w, keep, 1)
            idx = np.take_along_axis(idx, keep, 1)
            dist = np.take_along_axis(dist, keep, 1)
            W = (temp.W[idx] * w[:, :, None]).sum(axis=1) / np.maximum(w.sum(axis=1, keepdims=True), 1e-12)
            # Islas de peso de brazo sin conexión con el hombro (dedos del molde
            # apoyados sobre el muslo): pierden el brazo y siguen a la pierna o al tronco.
            W = drop_arm_islands(W, d['F' + key[1:]], arm, pts)
            # Pelo largo, capucha y objetos lejos del cuerpo siguen al tronco, no a los brazos.
            far = dist[:, 0] > .035
            W[np.ix_(far, arm)] = 0
            W[far, BI['Spine2']] += 1e-6
            W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
            out['W' + key[1:]] = W.astype(np.float32)
            out['D' + key[1:]] = contact_faces(pts, d['F' + key[1:]], W, joints, TEST_POSES.get(stem, TEST_POSES['default']))
            print('  ', level, 'caras de contacto:', int(out['D' + key[1:]].sum()))
            high_pts.append(pts)
            high_w.append(W)
        np.savez_compressed(WORK / f'{stem}-{level}-weights.npz', **out)


if __name__ == '__main__':
    args = sys.argv[1:]
    for stem in [a for a in args if not a.startswith('--')]:
        if '--weights-only' in args:
            transfer(stem, Template(), np.load(WORK / f'{stem}-template.npy'))
        else:
            fit(stem)
