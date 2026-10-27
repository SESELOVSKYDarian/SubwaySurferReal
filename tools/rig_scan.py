"""Re-rig de los personajes escaneados con el esqueleto detallado (Blender 4.3).

  blender -b --python-exit-code 1 --python tools/rig_scan.py -- dump  hoodie-student
  python3 tools/fit_scan_rig.py hoodie-student
  blender -b --python-exit-code 1 --python tools/rig_scan.py -- apply hoodie-student

dump: guarda la malla en reposo de ambos niveles de detalle en
test-results/scans/<id>-{high,low}.npz. apply: reemplaza el rig de 19 huesos
(articulaciones copiadas de otro personaje) por los 52 huesos ajustados a este
cuerpo (fit_scan_rig.py) con sus pesos, y exporta los GLB.
"""
import json
import sys
from pathlib import Path
import bmesh
import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rig_detailed as rd  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'test-results/scans'


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.materials]
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    return rig, meshes


def rest_points(obj):
    mw = obj.matrix_world
    return np.array([tuple(mw @ v.co) for v in obj.data.vertices])


def dump(stem):
    WORK.mkdir(parents=True, exist_ok=True)
    for level, suffix in [('high', ''), ('low', '-low')]:
        rig, meshes = load(rd.CHAR / f'{stem}{suffix}.glb')
        data = {}
        for k, obj in enumerate(meshes):
            obj.data.calc_loop_triangles()
            data[f'P{k}'] = rest_points(obj)
            data[f'F{k}'] = np.array([tuple(t.vertices) for t in obj.data.loop_triangles])
            data[f'N{k}'] = np.array([tuple(obj.matrix_world.to_3x3() @ v.normal) for v in obj.data.vertices])
        np.savez_compressed(WORK / f'{stem}-{level}.npz', **data)
        print(stem, level, [len(data[f'P{k}']) for k in range(len(meshes))], 'vértices')


def apply(stem):
    fit = json.loads((WORK / f'{stem}-fit.json').read_text())
    for level, suffix in [('high', ''), ('low', '-low')]:
        old, meshes = load(rd.CHAR / f'{stem}{suffix}.glb')
        weights = np.load(WORK / f'{stem}-{level}-weights.npz')
        for obj in meshes:
            mw = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = mw
            obj.modifiers.clear()
            obj.vertex_groups.clear()
        bpy.data.objects.remove(old, do_unlink=True)
        arm = bpy.data.armatures.new(stem)
        rig = bpy.data.objects.new(stem, arm)
        bpy.context.scene.collection.objects.link(rig)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        edit = {}
        for name in rd.BONES:
            b = arm.edit_bones.new(rd.PREFIX + name)
            head = fit['joints'][name]
            b.head = head
            b.tail = (head[0], head[1], head[2] + .06)
            b.roll = 0
            edit[name] = b
        for name, parent in rd.PARENTS.items():
            if parent:
                edit[name].parent = edit[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        for k, obj in enumerate(meshes):
            W = weights[f'W{k}']
            # Contactos del escaneo (mano sobre el muslo, manga pegada al torso):
            # caras que se estiran como una lámina en las poses de juego (fit_scan_rig).
            drop = weights[f'D{k}']
            dump = np.load(WORK / f'{stem}-{level}.npz')[f'F{k}']
            bad = {tuple(sorted(t)) for t in dump[drop].tolist()}
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bridges = [f for f in bm.faces if tuple(sorted(v.index for v in f.verts)) in bad]
            bmesh.ops.delete(bm, geom=bridges, context='FACES_ONLY')
            bm.to_mesh(obj.data)
            bm.free()
            print(stem, level, 'caras de contacto eliminadas', len(bridges))
            groups = [obj.vertex_groups.new(name=rd.PREFIX + b) for b in rd.BONES]
            for j, g in enumerate(groups):
                for i in np.flatnonzero(W[:, j] > 1e-4):
                    g.add([int(i)], float(W[i, j]), 'REPLACE')
            rd.limit_weights(obj)
            obj.parent = rig
            mod = obj.modifiers.new('Armature', 'ARMATURE')
            mod.object = rig
        path = rd.CHAR / f'{stem}{suffix}.glb'
        rd.export(path)
        print(stem, level, rd.triangles(), 'triángulos', len(arm.bones), 'huesos')


if __name__ == '__main__':
    mode, stem = sys.argv[sys.argv.index('--') + 1:][:2]
    {'dump': dump, 'apply': apply}[mode](stem)
