"""El técnico: alumno con guardapolvo azul sobre anatomía MakeHuman de 52 huesos.

Uso:
  python3 tools/build_classic.py
  blender -b --python-exit-code 1 --python tools/build_estanga.py -- test-results/classic classic-student
Genera test-results/classic/model.{npz,json} y las texturas classic-*.{jpg,png}.
Guardapolvo con cuerpo ajustado al torso, mangas hasta la muñeca, faldón hasta
la rodilla con abertura delantera y tajo trasero, solapas, cuello, botones y
bolsillos; camisa blanca, pantalón, zapatillas, pelo corto y ojos MakeHuman.
"""
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import estanga_mh as mh  # noqa: E402
import estanga_model as em  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'test-results/classic'
TEX = ROOT / 'assets/characters/textures'
COAT_OPEN = (.088, .016, .094, .072)   # abertura del cuello del guardapolvo
SHIRT_OPEN = (.074, .016, .080, .062)
SKIRT_TOP, SKIRT_BOTTOM = .925, .505
SLIT_TOP = .72


def neck_norm(P, spec):
    ax, cy, af, ab = spec
    dy = P[:, 1] - cy
    return np.sqrt((P[:, 0] / ax) ** 2 + (dy / np.where(dy > 0, af, ab)) ** 2)


def cylinder_uv(P, faces, scale=1.0):
    """UV cilíndricas en metros (u = arco alrededor del eje vertical, v = altura)."""
    ang = np.arctan2(P[:, 0], P[:, 1])
    r = np.hypot(P[:, 0], P[:, 1])
    u = ang * np.maximum(r, .05) * scale
    v = P[:, 2] * scale
    out = []
    for f in faces:
        uv = np.stack([u[f], v[f]], 1)
        # Costura en la espalda: no cruzar ±π dentro de un mismo polígono.
        a = ang[f]
        if a.max() - a.min() > np.pi:
            uv[:, 0] = np.where(a < 0, (a + 2 * np.pi) * np.maximum(r[f], .05) * scale, uv[:, 0])
        out.append(uv)
    return out


def inflate(mesh, amount, smooth=5):
    N = mesh.normals()
    mesh.P = mesh.P + N * amount[:, None] if np.ndim(amount) else mesh.P + N * amount
    mesh.smooth(smooth, .3)
    return mesh


def build_coat(body, cuff_z):
    arm = body.w(*em.ARM_BONES)
    head = body.w('Head')
    z = body.V[:, 2]
    region = (z > SKIRT_TOP - .03) & (head < .5) & (z < 1.62) & ~((arm > .5) & (z < cuff_z - .03))
    m = em.Mesh.from_body(body, lambda f: region[f].all())
    m.clip(lambda P, W: P[:, 2] - SKIRT_TOP)
    m.clip(lambda P, W: neck_norm(P, COAT_OPEN) - 1 + np.clip(1.47 - P[:, 2], 0, None) * 8)
    armw = lambda W: W[:, [body.bi[b] for b in em.ARM_BONES]].sum(1)
    m.clip(lambda P, W: np.where(armw(W) > .5, P[:, 2] - cuff_z, 1.0))
    # Escote en V hasta el primer botón: deja ver la camisa.
    m.clip(lambda P, W: np.where((P[:, 1] > .02) & (P[:, 2] > 1.24), np.abs(P[:, 0]) - (P[:, 2] - 1.24) * .36, 1.0))
    arm_v = m.W[:, [body.bi[b] for b in em.ARM_BONES]].sum(1)
    inflate(m, np.where(arm_v > .5, .016, .021), 6)
    return m


def build_shirt(body):
    head = body.w('Head')
    arm = body.w(*em.ARM_BONES)
    z = body.V[:, 2]
    region = (z > 1.12) & (z < 1.62) & (head < .5) & (arm < .3)
    m = em.Mesh.from_body(body, lambda f: region[f].all())
    m.clip(lambda P, W: neck_norm(P, SHIRT_OPEN) - 1 + np.clip(1.49 - P[:, 2], 0, None) * 8)
    m.clip(lambda P, W: P[:, 2] - 1.14)
    inflate(m, .006, 3)
    return m


def build_trousers(body):
    arm = body.w(*em.ARM_BONES)
    z = body.V[:, 2]
    region = (z < 1.0) & (z > .08) & (arm < .3)
    m = em.Mesh.from_body(body, lambda f: region[f].all())
    m.clip(lambda P, W: .98 - P[:, 2])
    m.clip(lambda P, W: P[:, 2] - .108)
    inflate(m, .011, 3)
    # Corte recto: bajo la rodilla la pierna no se angosta más de 5,6 cm de radio.
    for side, sign in (('Left', 1), ('Right', -1)):
        knee, ankle = body.J[side + 'Leg'], body.J[side + 'Foot']
        sel = (np.sign(m.P[:, 0]) == sign) & (m.P[:, 2] < knee[2])
        t = np.clip((m.P[sel, 2] - ankle[2]) / (knee[2] - ankle[2]), 0, 1)
        axis = ankle[:2] + (knee[:2] - ankle[:2]) * t[:, None]
        d = m.P[sel, :2] - axis
        r = np.linalg.norm(d, axis=1)
        target = np.maximum(r, .056 + .004 * t)
        m.P[sel, :2] = axis + d / np.maximum(r, 1e-6)[:, None] * target[:, None]
    m.smooth(3, .25)
    return m


def resample_loop_by_angle(P, center, n):
    ang = np.arctan2(P[:, 0] - center[0], P[:, 1] - center[1])
    order = np.argsort(ang)
    a, p = ang[order], P[order]
    a = np.concatenate([a - 2 * np.pi, a, a + 2 * np.pi])
    p = np.concatenate([p, p, p])
    t = np.linspace(-np.pi, np.pi, n, endpoint=False)
    return np.stack([np.interp(t, a, p[:, k]) for k in range(3)], 1), t


def build_skirt(coat, body):
    """Faldón: anillos desde el borde inferior del cuerpo del guardapolvo hasta la rodilla."""
    loops = em.boundary_loops(len(coat.P), coat.faces)
    hem = min((l for l in loops if abs(coat.P[l, 0].mean()) < .05), key=lambda l: coat.P[l, 2].mean())
    hp = coat.P[hem]
    center = np.array([0, hp[:, 1].mean(), 0])
    n, rows = 72, 14
    top, ang = resample_loop_by_angle(hp, center, n)
    zs = np.linspace(SKIRT_TOP, SKIRT_BOTTOM, rows)
    rx0 = np.abs(top[:, 0]).max()
    ry0 = (top[:, 1].max() - top[:, 1].min()) / 2
    cy = (top[:, 1].max() + top[:, 1].min()) / 2
    P = []
    for k, z in enumerate(zs):
        drop = SKIRT_TOP - z
        t = em.smoothstep(0, .12, drop)
        ex = np.sin(ang) * (rx0 + .024 + drop * .11)
        ey = cy + np.cos(ang) * (ry0 + .034 + drop * .07)
        x = top[:, 0] * (1 - t) + ex * t
        y = top[:, 1] * (1 - t) + ey * t
        # Pliegues suaves del faldón que caen desde la cadera.
        fold = .004 * np.sin(ang * 9) * em.smoothstep(.05, .3, drop)
        x += np.sin(ang) * fold
        y += np.cos(ang) * fold
        P.append(np.stack([x, y, np.full(n, z)], 1))
    P = np.concatenate(P)
    faces = []
    for k in range(rows - 1):
        zmid = (zs[k] + zs[k + 1]) / 2
        for i in range(n):
            j = (i + 1) % n
            am = np.arctan2(np.sin(ang[i]) + np.sin(ang[j]), np.cos(ang[i]) + np.cos(ang[j]))
            if zmid < SLIT_TOP and abs(am) < .055:          # abertura delantera
                continue
            if zmid < SLIT_TOP - .03 and abs(abs(am) - np.pi) < .04:   # tajo trasero
                continue
            faces.append([k * n + i, (k + 1) * n + i, (k + 1) * n + j, k * n + j])
    # Pesos: cadera arriba, cada muslo según el lado a medida que baja.
    W = np.zeros((len(P), len(mh.BONES)))
    drop = SKIRT_TOP - P[:, 2]
    # Con la rodilla alta el borde sigue al muslo: si no, la pierna atraviesa la tela.
    legw = em.smoothstep(.0, .17, drop)
    side = em.smoothstep(-.025, .025, P[:, 0])
    W[:, body.bi['Hips']] = 1 - legw
    W[:, body.bi['LeftUpLeg']] = legw * side
    W[:, body.bi['RightUpLeg']] = legw * (1 - side)
    return P, faces, W, (center, ang, zs, rx0, ry0, cy)


def build_coat_collar(coat):
    """Cuello abierto adelante: rodea nuca y costados y baja hacia las solapas."""
    _, boundary = coat.neighbors()
    P = coat.P
    sel = np.flatnonzero(boundary & (P[:, 2] > 1.43))
    c = P[sel].mean(axis=0)
    ang = np.arctan2(P[sel, 0] - c[0], P[sel, 1] - c[1])
    keep = np.abs(ang) > .55
    order = np.argsort(np.where(ang[keep] < 0, ang[keep] + 2 * np.pi, ang[keep]))
    edge = P[sel][keep][order]
    # Polilínea abierta de una solapa a la otra por la nuca (no cerrar por delante).
    seg = np.linalg.norm(np.diff(edge, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], 40)
    edge = np.stack([np.interp(t, s, edge[:, k]) for k in range(3)], 1)
    profile = [(0, -.004), (.012, -.006), (.026, -.002), (.032, .006), (.024, .014), (.010, .018)]
    out, F = [], []
    for p in edge:
        radial = p - c
        radial[2] = 0
        radial /= max(np.linalg.norm(radial), 1e-6)
        for dz, dr in profile:
            out.append(p + np.array([0, 0, dz]) + radial * dr)
    m = len(profile)
    for i in range(len(edge) - 1):
        for k in range(m - 1):
            F.append([i * m + k, (i + 1) * m + k, (i + 1) * m + k + 1, i * m + k + 1])
    return np.array(out), F


def surface_point(mesh_P, x, z, front=True):
    """Punto del frente de una malla más cercano a (x, z) en la vista frontal."""
    pts = mesh_P[mesh_P[:, 1] > .02] if front else mesh_P
    d = np.hypot(pts[:, 0] - x, pts[:, 2] - z)
    near = pts[d < d.min() + .006]
    p = near[np.argmax(near[:, 1])] if front else near[np.argmin(near[:, 1])]
    return np.array([x, p[1], z])


def build_details(coat, skirt_P, body):
    """Solapas, botones y bolsillos apoyados sobre el guardapolvo."""
    allP = np.concatenate([coat.P, skirt_P])
    parts = {'lapels': [], 'buttons': [], 'pockets': []}
    for sign in (1, -1):
        strip = []
        for t in np.linspace(0, 1, 10):
            z = 1.245 + t * (1.425 - 1.245)
            inner = (z - 1.24) * .36
            width = .012 + .05 * np.sin(np.pi * min(1, t * 1.3) / 2) * (1 - .45 * t)
            for x in (inner, inner + width):
                p = surface_point(allP, sign * x, z)
                strip.append(p + np.array([0, .004, 0]))
        F = [[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] for i in range(9)]
        parts['lapels'].append((np.array(strip), F))
    for z in (1.205, 1.065, .925, .785):
        p = surface_point(allP, -.014, z) + np.array([0, .003, 0])
        ring = [p + np.array([.008 * np.cos(a), .0, .008 * np.sin(a)]) for a in np.linspace(0, 2 * np.pi, 12, endpoint=False)]
        top = [q + np.array([0, .003, 0]) for q in ring]
        P = np.array(ring + top + [p + np.array([0, .0035, 0])])
        F = [[i, (i + 1) % 12, 12 + (i + 1) % 12, 12 + i] for i in range(12)] + [[24, 12 + i, 12 + (i + 1) % 12] for i in range(12)]
        parts['buttons'].append((P, F))
    for x0, z0, w, h in [(-.11, 1.30, .11, .12), (.12, .81, .15, .16), (-.12, .81, .15, .16)]:
        grid = []
        for zz in np.linspace(z0 - h / 2, z0 + h / 2, 5):
            for xx in np.linspace(x0 - w / 2, x0 + w / 2, 5):
                grid.append(surface_point(allP, xx, zz) + np.array([0, .0035, 0]))
        F = [[r * 5 + c, r * 5 + c + 1, (r + 1) * 5 + c + 1, (r + 1) * 5 + c] for r in range(4) for c in range(4)]
        parts['pockets'].append((np.array(grid), F))
    return parts


def build_hair(body, skin):
    """Pelo corto castaño: casco sobre el cuero cabelludo con línea de nacimiento."""
    center = em.head_center(body)
    nt, npf = 128, 72
    F, _ = skin.triangles()
    keepF = F[(skin.P[F, 2] > 1.50).all(axis=1)]
    rs = em.spherical_depth(skin.P, keepF, center, (nt, npf))
    for r in range(npf // 3, -1, -1):
        bad = ~np.isfinite(rs[r])
        if bad.any():
            rs[r, bad] = np.nanmean(rs[r + 1]) if r < 4 else rs[r + 1][bad]
    th = (np.arange(nt) + .5) / nt * 2 * np.pi - np.pi
    ph = (np.arange(npf) + .5) / npf * np.pi
    TH, PH = np.meshgrid(th, ph)
    D = np.stack([np.sin(PH) * np.sin(TH), np.sin(PH) * np.cos(TH), np.cos(PH)], -1)
    scalp = center + D * np.nan_to_num(rs, nan=.09)[..., None]
    eye_z = float(body.eyes()[:, 2].mean())
    a = np.abs(TH)
    # Línea de nacimiento: frente alta, sienes, sobre las orejas y nuca.
    line = np.interp(a, [0, .45, .9, 1.45, 2.2, np.pi], [.072, .058, .030, .020, -.035, -.062]) + eye_z
    hair = (scalp[..., 2] > line) & np.isfinite(rs)
    import cv2
    edge = cv2.distanceTransform(hair.astype(np.uint8), cv2.DIST_L2, 3)
    thick = np.interp(PH, [0, .6, 1.3, 1.9], [.014, .012, .007, .005])
    thick = np.where(a > 2.0, thick * 1.25, thick) * (.15 + .85 * em.smoothstep(0, 4, edge))
    outer = center + D * (np.nan_to_num(rs, nan=.09) + em.blur_sphere(thick, 1.5))[..., None]
    P, faces, fuv = em.grid_mesh(outer, hair)
    tex_h, tex_w = 320, 512
    noise = em.strand_noise(tex_h, tex_w, 21, along=6, across=.8)
    color = np.array([46, 33, 25.0]) * (.75 + .5 * noise[..., None])
    gi = np.clip(((np.arange(tex_h)[:, None] + .5) / tex_h * npf).astype(int), 0, npf - 1)
    gj = np.clip(((np.arange(tex_w)[None] + .5) / tex_w * nt).astype(int), 0, nt - 1)
    alpha = em.smoothstep(0, 2.5, edge[gi, gj]) * (.55 + .45 * noise)
    em.save_rgba(TEX / 'classic-hair.png', color, alpha)
    return P, faces, fuv, center


def assemble():
    WORK.mkdir(parents=True, exist_ok=True)
    body = em.Body(profile='classic')
    bi = body.bi
    cuff_z = body.J['LeftHand'][2] + .03
    meshes = []

    def add(name, material, P, F, U, W, color=None):
        meshes.append({'name': name, 'material': material, 'P': np.asarray(P, np.float32),
                       'F': np.asarray(F, np.int32), 'U': None if U is None else np.asarray(U, np.float32),
                       'W': np.asarray(W, np.float32), 'color': color})

    # Piel: cabeza, cuello bajo la camisa y manos bajo el puño.
    arm = body.w(*em.ARM_BONES)
    region = body.head_region()
    z = body.V[:, 2]
    nn = neck_norm(body.V, SHIRT_OPEN)
    keep = ((region > .2) & ((nn < 1.2) | (z > 1.50)) & (z > 1.38)) | ((arm > .5) & (z < cuff_z + .05))
    skin = em.Mesh.from_body(body, lambda f: keep[f].all())
    armw = lambda W: W[:, [bi[b] for b in em.ARM_BONES]].sum(1)
    skin.clip(lambda P, W: np.where(armw(W) > .5, cuff_z + .025 - P[:, 2],
                                    np.maximum(1.12 - neck_norm(P, SHIRT_OPEN), P[:, 2] - 1.50)))
    sF, sU = em.tris_uv(skin.faces, skin.fuv)
    import cv2
    mhskin = cv2.cvtColor(cv2.imread(str(mh.REAL / 'skin.png')), cv2.COLOR_BGR2RGB).astype(float)
    tone = np.array([[201, 152, 121]] * 50, float) + np.random.default_rng(2).normal(0, 9, (50, 3))
    young = em.color_transfer(mhskin, np.ones(mhskin.shape[:2], bool), tone)
    em.save_rgb(TEX / 'classic-skin.jpg', young, 88)
    neck_zone = (em.neck_norm(skin.P) < 1.35) & (skin.P[:, 2] > 1.40)
    add('ClassicSkin', 'Skin', skin.P, sF, sU, em.strip_arm_weights(skin.P, skin.W, bi, neck_zone))
    eyes = body.eyes()
    eF, eU = em.tris_uv([list(reversed(f)) for f in body.eye_map['faces']], [list(reversed(u)) for u in body.eye_map['fuv']])
    add('ClassicEyes', 'EyeWhite', eyes, eF, eU, em.rigid(len(eyes), 'Head', bi))

    hP, hfaces, hfuv, hc = build_hair(body, skin)
    hF, hU = em.tris_uv(hfaces, hfuv)
    head_w = em.rigid(len(hP), 'Head', bi)
    add('ClassicHair', 'ClassicHair', hP, hF, hU, head_w)
    shell = hc + (hP - hc) * (1 + .004 / np.maximum(np.linalg.norm(hP - hc, axis=1, keepdims=True), 1e-6))
    add('ClassicHairShell', 'ClassicHairFur', shell, hF, hU, head_w)

    coat = build_coat(body, cuff_z)
    cF, _ = em.tris_uv(coat.faces, coat.fuv)
    cU = np.array([u[[0, k, k + 1]] for f, u in zip(coat.faces, cylinder_uv(coat.P, coat.faces)) for k in range(1, len(f) - 1)])
    add('ClassicCoat', 'StudentCoat', coat.P, cF, cU, coat.W, [42, 62, 104])
    kP, kfaces, kW, _ = build_skirt(coat, body)
    kF = em.tris_only(kfaces)
    kU = np.array([u[[0, k, k + 1]] for f, u in zip(kfaces, cylinder_uv(kP, kfaces)) for k in range(1, len(f) - 1)])
    add('ClassicCoatSkirt', 'StudentCoat', kP, kF, kU, kW, [42, 62, 104])
    det = build_details(coat, kP, body)
    allP = np.concatenate([coat.P, kP])
    allW = np.concatenate([coat.W, kW])
    for name, mat, color, key in [('ClassicLapels', 'CoatLapel', [48, 70, 116], 'lapels'),
                                  ('ClassicButtons', 'Buttons', [18, 22, 30], 'buttons'),
                                  ('ClassicPockets', 'CoatPocket', [37, 56, 95], 'pockets')]:
        Ps, Fs, off = [], [], 0
        for P_, F_ in det[key]:
            Ps.append(P_)
            Fs.append(em.tris_only(F_) + off)
            off += len(P_)
        Ps = np.concatenate(Ps)
        add(name, mat, Ps, np.concatenate(Fs), None, em.transfer_weights(Ps, allP, allW, 6), color)
    collar_P, collar_F = build_coat_collar(coat)
    add('ClassicCollar', 'CoatLapel', collar_P, em.tris_only(collar_F), None,
        em.strip_arm_weights(collar_P, em.transfer_weights(collar_P, coat.P, coat.W), bi, np.ones(len(collar_P), bool)),
        [48, 70, 116])
    shirt = build_shirt(body)
    shF, _ = em.tris_uv(shirt.faces, shirt.fuv)
    add('ClassicShirt', 'Shirt', shirt.P, shF, None, shirt.W, [236, 236, 231])
    trousers = build_trousers(body)
    tF, _ = em.tris_uv(trousers.faces, trousers.fuv)
    tU = np.array([u[[0, k, k + 1]] for f, u in zip(trousers.faces, cylinder_uv(trousers.P, trousers.faces)) for k in range(1, len(f) - 1)])
    add('ClassicTrousers', 'Trousers', trousers.P, tF, tU, trousers.W, [36, 40, 48])
    shoes = em.build_boots(body, shaft_top=.112)
    upP, upFaces, upW = shoes['upper']
    add('ClassicShoes', 'Shoes', upP, em.tris_only(upFaces), None, upW, [24, 24, 27])
    soleP, soleF, soleW, off = [], [], [], 0
    for Ps, Fs, ws, *_ in shoes['soles']:
        soleP.append(Ps)
        soleF.append(em.tris_only(Fs) + off)
        soleW.append(ws)
        off += len(Ps)
    add('ClassicSoles', 'BootSole', np.concatenate(soleP), np.concatenate(soleF), None, np.concatenate(soleW), [228, 228, 222])
    laceP, laceF, off = [], [], 0
    for segs, side in shoes['laces']:
        for sg in segs:
            Pt, Ft = em.tube(sg, .0019, 6)
            laceP.append(Pt)
            laceF.append(em.tris_only(Ft) + off)
            off += len(Pt)
    laceP = np.concatenate(laceP)
    add('ClassicLaces', 'BootLaces', laceP, np.concatenate(laceF), None, em.transfer_weights(laceP, upP, upW), [214, 214, 210])

    joints = {b: body.J[b].tolist() for b in mh.BONES}
    materials = {
        'Skin': {'map': 'classic-skin.jpg', 'normal': 'professor-skin-normal.png', 'mr': 'professor-skin-mr.png',
                 'rough': 1.0, 'normal_scale': .3},
        'EyeWhite': {'map': 'professor-eyes.png', 'rough': .25, 'mask': .5},
        'ClassicHair': {'map': 'classic-hair.png', 'rough': .7, 'mask': .25, 'double': True},
        'ClassicHairFur': {'map': 'classic-hair.png', 'rough': .72, 'mask': .62, 'double': True},
        'StudentCoat': {'rough': .92, 'double': True}, 'CoatLapel': {'rough': .9, 'double': True},
        'CoatPocket': {'rough': .92, 'double': True}, 'Buttons': {'rough': .35},
        'Shirt': {'rough': .9}, 'Trousers': {'rough': .9}, 'Shoes': {'rough': .6},
        'BootSole': {'rough': .7}, 'BootLaces': {'rough': .85},
    }
    # Presupuesto de los jugables: ≤60 mil triángulos en alto y ≤24 mil en bajo.
    lod = {'ClassicSkin': [.85, .36], 'ClassicEyes': [1.0, .3], 'ClassicHair': [.45, .18], 'ClassicHairShell': [.35, .12],
           'ClassicCoat': ['subdiv', .75], 'ClassicTrousers': [1.0, .7], 'ClassicShoes': [.8, .45],
           'ClassicCoatSkirt': [1.0, .7], 'ClassicShirt': [.8, .5]}
    return meshes, joints, materials, lod


def write(meshes, joints, materials, lod):
    data = {}
    manifest = {'meshes': [], 'joints': joints, 'bones': mh.BONES, 'parents': mh.PARENTS,
                'materials': materials, 'lod': lod, 'root': 'ClassicStudent',
                'copyright': 'El técnico: anatomía MakeHuman CC0; guardapolvo, rig y texturas de este proyecto. Ver ATTRIBUTION.md'}
    for i, m in enumerate(meshes):
        key = f'm{i}'
        data[key + '_P'], data[key + '_F'], data[key + '_W'] = m['P'], m['F'], m['W']
        if m['U'] is not None:
            data[key + '_U'] = m['U']
        manifest['meshes'].append({'key': key, 'name': m['name'], 'material': m['material'],
                                   'uv': m['U'] is not None, 'color': m['color']})
    np.savez_compressed(WORK / 'model.npz', **data)
    (WORK / 'model.json').write_text(json.dumps(manifest, indent=1))
    print('mallas', len(meshes), 'triángulos', sum(len(m['F']) for m in meshes))


if __name__ == '__main__':
    write(*assemble())
