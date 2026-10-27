"""Ajuste del rostro de Estanga a la foto frontal con MediaPipe Face Mesh.

Uso: python3 tools/estanga_face_fit.py   (requiere mediapipe==0.10.14)
Detecta los 478 puntos en el primer plano frontal de la hoja y en un render de
la cabeza MakeHuman, y guarda en assets/characters/source/estanga/face-fit.json
la escala de cabeza y los campos de desplazamiento (splines biarmónicas).
La reconstrucción normal lee ese JSON y no necesita MediaPipe.
"""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
import mediapipe as mp

sys.path.insert(0, str(Path(__file__).resolve().parent))
import estanga_model as em  # noqa: E402
import estanga_raster as rz  # noqa: E402

UP = 4  # sobremuestreo del render para la detección
REF_IMG = em.REF / 'face_front.png'


def landmarks(image_bgr, scale):
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True,
                                         max_num_faces=1, min_detection_confidence=.3) as fm:
        res = fm.process(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    if not res.multi_face_landmarks:
        raise RuntimeError('MediaPipe no encontró el rostro')
    h, w = image_bgr.shape[:2]
    pts = np.array([[p.x * w, p.y * h, p.z * w] for p in res.multi_face_landmarks[0].landmark])
    return pts / scale  # en píxeles del recorte original


def head_geometry(body):
    region = body.head_region()
    faces, fuv = [], []
    for f, fu in zip(body.faces, body.face_uv):
        if (region[f] > .5).all():
            for k in range(1, len(f) - 1):
                faces.append([f[0], f[k], f[k + 1]])
                fuv.append(body.A.uvs[[fu[0], fu[k], fu[k + 1]]])
    eyes = body.eyes()
    eF, eUV = [], []
    for f, fu in zip(body.eye_map['faces'], body.eye_map['fuv']):
        f, fu = list(reversed(f)), list(reversed(fu))
        for k in range(1, len(f) - 1):
            eF.append([f[0], f[k], f[k + 1]])
            eUV.append([fu[0], fu[k], fu[k + 1]])
    return np.array(faces), np.array(fuv), eyes, np.array(eF), np.array(eUV, float)


def render(body, view, skin_tex, eye_tex):
    F, FUV, eyes, eF, eUV = head_geometry(body)
    P = np.concatenate([body.V, eyes])
    allF = np.concatenate([F, eF + len(body.V)])
    allUV = np.concatenate([FUV, eUV])
    z, t, bb = rz.zbuffer(view, P, allF, bary=True)
    h, w = z.shape
    img = np.full((h, w, 3), 58.0)
    m = t >= 0
    tri = t[m]
    l0, l1 = bb[..., 0][m], bb[..., 1][m]
    l2 = 1 - l0 - l1
    uv = allUV[tri, 0] * l0[:, None] + allUV[tri, 1] * l1[:, None] + allUV[tri, 2] * l2[:, None]
    is_eye = tri >= len(F)
    col = np.zeros((len(tri), 3))
    for tex, sel in [(skin_tex, ~is_eye), (eye_tex, is_eye)]:
        th, tw = tex.shape[:2]
        col[sel] = rz.sample(tex, np.stack([uv[sel, 0] * tw, (1 - uv[sel, 1]) * th], 1))[:, :3]
    n = np.cross(P[allF[tri, 1]] - P[allF[tri, 0]], P[allF[tri, 2]] - P[allF[tri, 0]])
    n = em.normalize(n)
    light = em.normalize(view.toward + np.array([.25, 0, .45]))
    shade = .35 + .65 * np.clip(np.abs(n @ light), 0, 1)
    img[m] = col * shade[:, None]
    return img.astype(np.uint8), t, bb, P, allF, len(F)


def main():
    ref_img = cv2.imread(str(REF_IMG))
    R = landmarks(cv2.resize(ref_img, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC), UP)
    skin = cv2.cvtColor(cv2.imread(str(em.mh.REAL / 'skin.png')), cv2.COLOR_BGR2RGB).astype(float)
    eye = cv2.cvtColor(cv2.imread(str(em.mh.REAL / 'eyes/brown-eye.png')), cv2.COLOR_BGR2RGB).astype(float)
    body = em.Body(face_fit=False)
    neck_z = float(body.J['Neck'][2])
    pivot = [0.0, float(body.J['Neck'][1]), neck_z]
    fit = {'pivot': pivot, 'neck_z': neck_z, 'scale': 1.0, 'steps': [], 'report': []}
    h, w = ref_img.shape[:2]
    ref_eyes = R[[33, 133, 362, 263], :2].mean(axis=0)
    stable = np.arange(468)
    for it in range(4):
        eyes3d = (body.eyes()[:, :].mean(axis=0))
        S = em.S_FACE * UP
        view = rz.View('fit', [-1, 0, 0], [0, 1, 0], 0, 0, S, (w * UP, h * UP))
        view.u0 = ref_eyes[0] * UP + eyes3d[0] * S
        view.v0 = ref_eyes[1] * UP + eyes3d[2] * S
        img, t, bb, P, allF, nskin = render(body, view, skin, eye)
        cv2.imwrite(str(em.DEBUG / f'face_fit_{it}.png'), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        M = landmarks(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), UP)
        # Retroproyección de cada punto del render a la superficie de la malla.
        px = np.clip((M[:, :2] * UP).astype(int), 0, [w * UP - 1, h * UP - 1])
        tri = t[px[:, 1], px[:, 0]]
        ok = (tri >= 0) & (tri < nskin)
        l0, l1 = bb[px[:, 1], px[:, 0], 0], bb[px[:, 1], px[:, 0], 1]
        bary = np.stack([l0, l1, 1 - l0 - l1], 1)
        M3 = (P[allF[np.maximum(tri, 0)]] * bary[:, :, None]).sum(axis=1)
        use = np.intersect1d(np.flatnonzero(ok), stable)
        to_model = lambda pts: np.stack([-(pts[:, 0] * UP - view.u0) / S, (view.v0 - pts[:, 1] * UP) / S], 1)
        Rm, Mm = to_model(R[use]), to_model(M[use])
        err_px = np.linalg.norm(R[use, :2] - M[use, :2], axis=1)
        fit['report'].append({'iteration': it, 'mean_error_px': float(err_px.mean()),
                              'max_error_px': float(err_px.max())})
        print(f'iteración {it}: error medio {err_px.mean():.2f} px, máx {err_px.max():.2f} px')
        if it == 3:
            # Cámara del primer plano: u = u0 - x·s, v = v0 - z·s (píxeles del recorte).
            sel = use
            u0 = float(np.mean(R[sel, 0] + M3[sel, 0] * em.S_FACE))
            v0 = float(np.mean(R[sel, 1] + M3[sel, 2] * em.S_FACE))
            fit['face_front_view'] = {'u0': u0, 'v0': v0, 's': em.S_FACE}
            fit['reference_landmarks'] = R[:, :2].tolist()
            break
        if it == 0:
            spread = lambda a: np.sqrt(((a - a.mean(axis=0)) ** 2).sum(axis=1).mean())
            sigma = float(spread(Rm) / spread(Mm))
            fit['scale'] = sigma
            body.apply_face_fit({'pivot': pivot, 'neck_z': neck_z, 'scale': sigma, 'steps': []})
            print('escala de cabeza', sigma)
            continue
        offset = (Rm - Mm).mean(axis=0)
        D = np.zeros((len(use), 3))
        D[:, 0] = Rm[:, 0] - Mm[:, 0] - offset[0]
        D[:, 2] = Rm[:, 1] - Mm[:, 1] - offset[1]
        # Profundidad diferencial: ambas estimaciones de MediaPipe comparten sesgo.
        D[:, 1] = -(R[use, 2] - M[use, 2]) / em.S_FACE * .7
        D[:, 1] -= D[:, 1].mean()
        X = M3[use]
        # Anclas sin desplazamiento: nuca, coronilla y cuello por debajo de la mandíbula.
        head = body.V[body.used]
        reg = body.head_region()[body.used]
        chin_z = X[:, 2].min()
        back = head[(reg > .9) & ((head[:, 1] < X[:, 1].min() - .015) | (head[:, 2] > X[:, 2].max() + .02))]
        neck = head[(reg > .3) & (reg < .8) & (head[:, 2] < chin_z - .03)]
        rng = np.random.default_rng(7)
        anchors = np.concatenate([back[rng.choice(len(back), min(70, len(back)), replace=False)],
                                  neck[rng.choice(len(neck), min(30, len(neck)), replace=False)]])
        Xall = np.concatenate([X, anchors])
        Dall = np.concatenate([D, np.zeros((len(anchors), 3))])
        coef = tps = em.tps_fit(Xall, Dall, 2e-4)
        step = {'points': Xall.tolist(), 'coef': tps.tolist()}
        fit['steps'].append(step)
        body.apply_face_fit({'pivot': pivot, 'neck_z': neck_z, 'scale': 1.0, 'steps': [step]})
        del coef
    profile_fit(body, fit)
    em.FACE_FIT.write_text(json.dumps(fit))
    print('guardado', em.FACE_FIT)


def head_profile(body, zs, side):
    """Punto más adelantado (Y) de la cabeza sin pelo por altura."""
    region = body.head_region()
    pts = body.V[body.used][region[body.used] > .6]
    eyes = body.eyes()
    pts = np.concatenate([pts, eyes])
    out = np.full(len(zs), np.nan)
    for i, z in enumerate(zs):
        band = pts[np.abs(pts[:, 2] - z) < .0018]
        if len(band):
            out[i] = band[:, 1].max()
    return out


def calibrate_side(body, name):
    """Calibra un primer plano lateral con el contorno de frente, nariz y labio."""
    mask = cv2.imread(str(em.REF / f'{name}_mask.png'), 0) > 127
    h, w = mask.shape
    sign = -1 if name == 'face_left' else 1  # face_left: derecha de imagen = -Y
    rows = np.arange(h)
    front = np.array([(np.flatnonzero(r).min() if sign < 0 else np.flatnonzero(r).max()) if r.any() else -1 for r in mask], float)
    valid = (front > 2) & (front < w - 3)
    best = None
    for v0 in np.arange(1460, 1560, .5):
        z = (v0 - rows) / em.S_FACE
        band = valid & (((z > 1.585) & (z < 1.662)) | ((z > 1.695) & (z < 1.735)))
        if band.sum() < 20:
            continue
        ym = head_profile(body, z[band], name)
        ok = np.isfinite(ym)
        # u = u0 + sign·y·s  →  u0 = u - sign·y·s
        u0s = front[band][ok] - sign * ym[ok] * em.S_FACE
        u0 = np.median(u0s)
        cost = np.median(np.abs(u0s - u0))
        if best is None or cost < best[0]:
            best = (cost, float(u0), float(v0))
    return {'u0': best[1], 'v0': best[2], 's': em.S_FACE, 'sign': sign, 'cost_px': best[0]}


def mirror_calibration(left):
    """El perfil derecho tiene la nariz cortada por el marco: se registra contra
    el izquierdo espejado (misma escala) maximizando la coincidencia de siluetas."""
    L = cv2.imread(str(em.REF / 'face_left_mask.png'), 0) > 127
    Rm = cv2.imread(str(em.REF / 'face_right_mask.png'), 0) > 127
    flip = L[:, ::-1]
    best = None
    H = max(flip.shape[0], Rm.shape[0]) + 100
    Wd = max(flip.shape[1], Rm.shape[1]) + 100
    base = np.zeros((H, Wd), bool)
    base[50:50 + Rm.shape[0], 50:50 + Rm.shape[1]] = Rm
    # Solo la cabeza por encima del mentón: el cuello y el suéter cambian de encuadre.
    base[50 + 150:] = False
    for dy in range(-30, 31):
        for dx in range(-40, 41):
            cand = np.zeros_like(base)
            y0, x0 = 50 + dy, 50 + dx
            cand[y0:y0 + flip.shape[0], x0:x0 + flip.shape[1]] = flip
            cand[50 + 150:] = False
            score = (base & cand).sum() / max((base | cand).sum(), 1)
            if best is None or score > best[0]:
                best = (score, dx, dy)
    _, dx, dy = best
    u0 = (L.shape[1] - 1 - left['u0']) + dx
    return {'u0': float(u0), 'v0': float(left['v0'] + dy), 's': em.S_FACE, 'sign': 1, 'iou': float(best[0])}


def profile_fit(body, fit):
    """Corrige la profundidad de nariz, labios y mentón con el perfil izquierdo."""
    cal = calibrate_side(body, 'face_left')
    mask = cv2.imread(str(em.REF / 'face_left_mask.png'), 0) > 127
    rows = np.arange(mask.shape[0])
    z = (cal['v0'] - rows) / em.S_FACE
    front = np.array([np.flatnonzero(r).min() if r.any() else np.nan for r in mask], float)
    yr = (cal['u0'] - front) / em.S_FACE
    # Frente a labio inferior; la barba del mentón se modela aparte.
    band = (z > 1.585) & (z < 1.735) & np.isfinite(yr) & ~((z > 1.662) & (z < 1.695))
    ym = head_profile(body, z[band], 'face_left')
    dy = np.clip(yr[band] - ym, -.012, .012)
    print('perfil: corrección media %.1f mm, máx %.1f mm' % (np.abs(dy).mean() * 1000, np.abs(dy).max() * 1000))
    region = body.head_region()
    pts = body.V[body.used]
    face = pts[(region[body.used] > .6)]
    ctrl, disp = [], []
    for zz, d in zip(z[band][::3], dy[::3]):
        band_pts = face[np.abs(face[:, 2] - zz) < .002]
        if not len(band_pts):
            continue
        p = band_pts[np.argmax(band_pts[:, 1])]
        ctrl.append(p)
        disp.append([0, d, 0])
    rng = np.random.default_rng(11)
    back = face[face[:, 1] < face[:, 1].max() - .06]
    anchors = back[rng.choice(len(back), min(80, len(back)), replace=False)]
    X = np.concatenate([np.array(ctrl), anchors])
    D = np.concatenate([np.array(disp), np.zeros((len(anchors), 3))])
    coef = em.tps_fit(X, D, 5e-4)
    step = {'points': X.tolist(), 'coef': coef.tolist()}
    fit['steps'].append(step)
    body.apply_face_fit({'pivot': fit['pivot'], 'neck_z': fit['neck_z'], 'scale': 1.0, 'steps': [step]})
    fit['face_left_view'] = calibrate_side(body, 'face_left')
    fit['face_right_view'] = mirror_calibration(fit['face_left_view'])
    print('calibración perfiles', fit['face_left_view'], fit['face_right_view'])


if __name__ == '__main__':
    em.DEBUG.mkdir(parents=True, exist_ok=True)
    main()
