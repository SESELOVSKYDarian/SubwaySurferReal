"""Anatomía MakeHuman CC0 para Estanga: malla, targets, pesos, articulaciones y proxies.

Solo numpy; lo importa tools/build_estanga.py dentro de Blender. Coordenadas de
salida en ejes de Blender del juego: X lateral (huesos Left en +X), +Y hacia la
cara, Z arriba, metros, suela en Z=0. Es el mismo espejo que build_student.py,
así los nombres de huesos y la lógica del juego no cambian.
"""
import gzip
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets/characters/source'
REAL = SRC / 'realism'

# Mezcla de targets: hombre de unos 58 años, corpulento y con abdomen marcado.
TARGETS = [
    ('caucasian-male-old', .72), ('caucasian-male-young', .28),
    ('universal-male-old-averagemuscle-maxweight', .62),
    ('universal-male-young-averagemuscle-maxweight', .20),
]
# Esqueleto detallado de 52 huesos (mismo orden que tools/rig_detailed.py):
# hombros, tres vértebras, cinco dedos de tres falanges y dedos del pie.
FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']
PARENTS = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
JOINTS = {'Hips': 'joint-pelvis', 'Spine': 'joint-spine-3', 'Spine1': 'joint-spine-2', 'Spine2': 'joint-spine-1',
          'Neck': 'joint-neck', 'Head': 'joint-head'}
for _s, _k in [('Left', 'l'), ('Right', 'r')]:
    for _b, _p, _j in [('Shoulder', 'Spine2', 'clavicle'), ('Arm', 'Shoulder', 'shoulder'),
                       ('ForeArm', 'Arm', 'elbow'), ('Hand', 'ForeArm', 'hand')]:
        BONES.append(_s + _b)
        PARENTS[_s + _b] = _p if _p == 'Spine2' else _s + _p
        JOINTS[_s + _b] = f'joint-{_k}-{_j}'
    for _i, _f in enumerate(FINGERS):
        for _n in (1, 2, 3):
            _name = f'{_s}Hand{_f}{_n}'
            BONES.append(_name)
            PARENTS[_name] = f'{_s}Hand' if _n == 1 else f'{_s}Hand{_f}{_n - 1}'
            JOINTS[_name] = f'joint-{_k}-finger-{_i + 1}-{_n}'
    for _b, _p, _j in [('UpLeg', 'Hips', 'upper-leg'), ('Leg', 'UpLeg', 'knee'),
                       ('Foot', 'Leg', 'ankle'), ('ToeBase', 'Foot', 'foot-1')]:
        BONES.append(_s + _b)
        PARENTS[_s + _b] = _p if _p == 'Hips' else _s + _p
        JOINTS[_s + _b] = f'joint-{_k}-{_j}'


class Anatomy:
    def __init__(self, height=1.78, targets=None):
        verts, uvs, groups, face_uv = [], [], {}, {}
        name = ''
        with gzip.open(SRC / 'makehuman-base.obj.gz', 'rt') as file:
            for line in file:
                if line.startswith('v '):
                    verts.append([float(t) for t in line.split()[1:4]])
                elif line.startswith('vt '):
                    uvs.append([float(t) for t in line.split()[1:3]])
                elif line.startswith('g '):
                    name = line[2:].strip()
                    groups.setdefault(name, [])
                    face_uv.setdefault(name, [])
                elif line.startswith('f '):
                    tokens = [t.split('/') for t in line.split()[1:]]
                    groups[name].append([int(t[0]) - 1 for t in tokens])
                    face_uv[name].append([int(t[1]) - 1 for t in tokens])
        self.raw = np.array(verts)
        self.uvs = np.array(uvs)
        self.groups, self.face_uv = groups, face_uv
        V = self.raw.copy()
        for target, weight in (TARGETS if targets is None else targets):
            with gzip.open(REAL / (target + '.target.gz'), 'rt') as file:
                for line in file:
                    tokens = line.split()
                    if len(tokens) == 4 and tokens[0].isdigit():
                        V[int(tokens[0])] += np.array([float(t) for t in tokens[1:]]) * weight
        self.mh = V
        body = sorted({i for f in groups['body'] for i in f})
        self.floor = V[body, 1].min()
        self.scale = height / (V[body, 1].max() - self.floor)
        self.V = self.convert(V)
        self.weights = self._weights()
        self.joint_pos = {b: self.joint(JOINTS[b]) for b in BONES}

    def convert(self, p):
        """MakeHuman (Y arriba, cara +Z) → Blender del juego (espejo X como build_student)."""
        p = np.asarray(p, dtype=float)
        out = np.empty_like(p)
        out[..., 0] = p[..., 0] * self.scale
        out[..., 1] = p[..., 2] * self.scale
        out[..., 2] = (p[..., 1] - self.floor) * self.scale
        return out

    def joint(self, group):
        ids = sorted({i for f in self.groups[group] for i in f})
        return self.V[ids].mean(axis=0)

    def _weights(self):
        data = json.loads(gzip.decompress((REAL / 'default_weights.mhw.gz').read_bytes()))
        W = np.zeros((len(self.raw), len(BONES)))
        index = {b: i for i, b in enumerate(BONES)}
        for name, entries in data['weights'].items():
            side = 'Left' if name.endswith('.L') else 'Right'
            if name.startswith('clavicle'):
                target = side + 'Shoulder'
            elif name.startswith(('upperarm', 'shoulder')):
                target = side + 'Arm'
            elif name.startswith('lowerarm'):
                target = side + 'ForeArm'
            elif name.startswith(('wrist', 'metacarpal')):
                target = side + 'Hand'
            elif name.startswith('finger'):
                # 'finger2-3.L' → dedo índice, tercera falange.
                target = f'{side}Hand{FINGERS[int(name[6]) - 1]}{name[8]}'
            elif name.startswith('upperleg'):
                target = side + 'UpLeg'
            elif name.startswith('lowerleg'):
                target = side + 'Leg'
            elif name.startswith('foot'):
                target = side + 'Foot'
            elif name.startswith('toe'):
                target = side + 'ToeBase'
            elif name.startswith('breast') or name in ['spine01', 'spine02']:
                target = 'Spine2'
            elif name == 'spine03':
                target = 'Spine1'
            elif name == 'spine04':
                target = 'Spine'
            elif name.startswith('neck'):
                target = 'Neck'
            elif name in ['root', 'spine05'] or name.startswith('pelvis'):
                target = 'Hips'
            else:
                target = 'Head'
            for i, w in entries:
                W[i, index[target]] += w
        W[W.sum(axis=1) == 0, index['Hips']] = 1
        return W / W.sum(axis=1, keepdims=True)

    def proxy_mapping(self, folder, name):
        """Proxy MakeHuman como (ids, baricéntricas, desplazamiento) sobre la malla base.

        Permite evaluarlo sobre la malla ya posada o deformada: Σ b·V[ids] + offset.
        """
        path = REAL / folder
        vertices, uv, faces, fuv = [], [], [], []
        for line in (path / (name + '.obj')).read_text().splitlines():
            if line.startswith('v '):
                vertices.append([float(t) for t in line.split()[1:4]])
            elif line.startswith('vt '):
                uv.append([float(t) for t in line.split()[1:3]])
            elif line.startswith('f '):
                tokens = [t.split('/') for t in line.split()[1:]]
                faces.append([int(t[0]) - 1 for t in tokens])
                fuv.append([uv[int(t[1]) - 1] for t in tokens])
        scale = np.ones(3)
        ids, bary, offset = [], [], []
        reading = False
        for line in (path / (name + '.mhclo')).read_text().splitlines():
            tokens = line.split()
            if not tokens or tokens[0].startswith('#'):
                continue
            if tokens[0] in ['x_scale', 'y_scale', 'z_scale']:
                axis = {'x_scale': 0, 'y_scale': 1, 'z_scale': 2}[tokens[0]]
                a, b = int(tokens[1]), int(tokens[2])
                scale[axis] = abs(self.mh[a, axis] - self.mh[b, axis]) / float(tokens[3])
            elif tokens[0] == 'verts':
                reading = True
            elif reading:
                if len(tokens) == 9:
                    try:
                        rec = [float(t) for t in tokens]
                    except ValueError:
                        reading = False
                        continue
                    ids.append([int(r) for r in rec[:3]])
                    bary.append(rec[3:6])
                    offset.append(np.array(rec[6:]) * scale)
                elif len(tokens) == 1 and tokens[0].isdigit():
                    ids.append([int(tokens[0])] * 3)
                    bary.append([1, 0, 0])
                    offset.append(np.zeros(3))
                else:
                    reading = False
        off = np.array(offset)
        off = np.stack([off[:, 0], off[:, 2], off[:, 1]], 1) * self.scale  # mismo espejo que convert
        ids, bary = np.array(ids), np.array(bary)
        W = (self.weights[ids] * bary[:, :, None]).sum(axis=1)
        W = np.maximum(W, 0)
        W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
        return {'ids': ids, 'bary': bary, 'offset': off, 'faces': faces, 'fuv': fuv, 'weights': W}

    @staticmethod
    def evaluate_proxy(mapping, V, offset_scale=1.0):
        return (V[mapping['ids']] * mapping['bary'][:, :, None]).sum(axis=1) + mapping['offset'] * offset_scale

    def proxy(self, folder, name):
        """Proxy MakeHuman (.obj + .mhclo) ajustado a la anatomía actual, con pesos."""
        path = REAL / folder
        vertices, uv, faces, fuv = [], [], [], []
        for line in (path / (name + '.obj')).read_text().splitlines():
            if line.startswith('v '):
                vertices.append([float(t) for t in line.split()[1:4]])
            elif line.startswith('vt '):
                uv.append([float(t) for t in line.split()[1:3]])
            elif line.startswith('f '):
                tokens = [t.split('/') for t in line.split()[1:]]
                faces.append([int(t[0]) - 1 for t in tokens])
                fuv.append([uv[int(t[1]) - 1] for t in tokens])
        scale = np.ones(3)
        mapping, reading = [], False
        for line in (path / (name + '.mhclo')).read_text().splitlines():
            tokens = line.split()
            if not tokens or tokens[0].startswith('#'):
                continue
            if tokens[0] in ['x_scale', 'y_scale', 'z_scale']:
                axis = {'x_scale': 0, 'y_scale': 1, 'z_scale': 2}[tokens[0]]
                a, b = int(tokens[1]), int(tokens[2])
                scale[axis] = abs(self.mh[a, axis] - self.mh[b, axis]) / float(tokens[3])
            elif tokens[0] == 'verts':
                reading = True
            elif reading:
                if len(tokens) == 9:
                    try:
                        mapping.append([float(t) for t in tokens])
                    except ValueError:
                        reading = False
                elif len(tokens) == 1 and tokens[0].isdigit():
                    mapping.append([int(tokens[0])])
                else:
                    reading = False
        points, weights = [], []
        for record in mapping:
            if len(record) == 1:
                p = self.mh[record[0]]
                w = self.weights[record[0]]
            else:
                ids = np.array(record[:3], dtype=int)
                bary = np.array(record[3:6])
                p = (self.mh[ids] * bary[:, None]).sum(axis=0) + np.array(record[6:]) * scale
                w = (self.weights[ids] * bary[:, None]).sum(axis=0)
            points.append(p)
            w = np.maximum(w, 0)
            weights.append(w / max(w.sum(), 1e-9))
        return self.convert(np.array(points)), faces, fuv, np.array(weights)
