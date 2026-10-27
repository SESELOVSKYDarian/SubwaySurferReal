"""Estanga en Blender 4.3: rig de 19 huesos, mallas pesadas, niveles de detalle y GLB.

Uso: blender -b --python-exit-code 1 --python tools/build_estanga.py
Lee test-results/estanga/model.npz y model.json (tools/estanga_model.py) y
exporta assets/characters/estanga.glb y estanga-low.glb. Las texturas quedan
como archivos externos en assets/characters/textures, compartidos por ambos
niveles de detalle. El esqueleto conserva los nombres mixamorig* del juego.
"""
import json
import struct
import sys
from pathlib import Path
import bmesh
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'test-results/estanga'
WORK_ACTIVE = WORK
OUT = ROOT / 'assets/characters'

# Subdivisión (alto) y decimación por malla: (alto, bajo). 1.0 = sin cambio.
LOD = {
    'EstangaSkin': (1.0, .45), 'EstangaEyes': (1.0, .30),
    'EstangaHair': (.45, .18), 'EstangaHairShell1': (.35, .12), 'EstangaHairShell2': (.35, .10),
    'EstangaBeard': (1.0, .55), 'EstangaBeardShell': (1.0, .45),
    'EstangaSweater': ('subdiv', 1.0), 'EstangaJeans': ('subdiv', 1.0), 'EstangaCollar': (1.0, .5),
    'EstangaBoots': (1.0, .5), 'EstangaSoles': (1.0, .6), 'EstangaLaces': (1.0, 1.0),
    'Spectacles': (1.0, .5), 'Lenses': (1.0, 1.0),
}

# Materiales finales del GLB (se escriben tras exportar, por nombre).
SRGB = lambda c: [((v / 255) / 12.92 if v / 255 <= .04045 else ((v / 255 + .055) / 1.055) ** 2.4) for v in c]
MATERIALS = {
    'Skin': {'map': 'estanga-skin.jpg', 'normal': 'professor-skin-normal.png', 'mr': 'professor-skin-mr.png',
             'rough': 1.0, 'normal_scale': .35},
    'EyeWhite': {'map': 'professor-eyes.png', 'rough': .25, 'mask': .5},
    'EstangaHair': {'map': 'estanga-hair.png', 'rough': .78, 'mask': .22, 'double': True},
    'EstangaHairFur1': {'map': 'estanga-hair.png', 'rough': .80, 'mask': .64, 'double': True},
    'EstangaHairFur2': {'map': 'estanga-hair.png', 'rough': .82, 'mask': .80, 'double': True},
    'EstangaBeard': {'map': 'estanga-beard.png', 'rough': .85, 'mask': .28, 'double': True},
    'EstangaBeardFur': {'map': 'estanga-beard.png', 'rough': .88, 'mask': .62, 'double': True},
    'EstangaSweater': {'map': 'estanga-sweater.jpg', 'rough': .96},
    'EstangaJeans': {'map': 'estanga-jeans.jpg', 'rough': .9},
    'EstangaBoots': {'map': 'estanga-boots.jpg', 'rough': .86},
    'SweaterRib': {'rough': .97, 'double': True},
    'BootSole': {'rough': .78},
    'BootLaces': {'rough': .9},
    'GlassesFrames': {'rough': .32},
    'GlassesLenses': {'rough': .05, 'blend': .10, 'double': True},
    'WatchCase': {'rough': .45, 'metal': .3},
    'WatchStrap': {'rough': .7},
    'WatchScreen': {'rough': .08},
    'WatchCrown': {'rough': .4, 'metal': .6},
}


def build_rig(manifest):
    root = manifest.get('root', 'Estanga')
    arm = bpy.data.armatures.new(root)
    rig = bpy.data.objects.new(root, arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    bones = {}
    for name in manifest['bones']:
        b = arm.edit_bones.new('mixamorig' + name)
        head = manifest['joints'][name]
        b.head = head
        b.tail = (head[0], head[1], head[2] + .1)  # eje +Z: rotación de reposo identidad en glTF
        b.roll = 0
        bones[name] = b
    for name, parent in manifest['parents'].items():
        if parent:
            bones[name].parent = bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_mesh(entry, data, rig, bones):
    key = entry['key']
    P = data[key + '_P'].astype(float)
    F = data[key + '_F'].astype(int)
    W = data[key + '_W'].astype(float)
    me = bpy.data.meshes.new(entry['name'])
    me.from_pydata(P.tolist(), [], F.tolist())
    me.update()
    if entry['uv']:
        U = data[key + '_U'].astype(float)
        layer = me.uv_layers.new(name='UVMap')
        uv = np.zeros((len(F) * 3, 2))
        uv[:] = U.reshape(-1, 2)
        # Polígonos creados en el mismo orden que F: bucles 3·i + k.
        layer.data.foreach_set('uv', uv.ravel())
    mat = bpy.data.materials.get(entry['material']) or bpy.data.materials.new(entry['material'])
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(entry['name'], me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = rig
    groups = [obj.vertex_groups.new(name='mixamorig' + b) for b in bones]
    for j, g in enumerate(groups):
        idx = np.flatnonzero(W[:, j] > 1e-4)
        for i in idx:
            g.add([int(i)], float(W[i, j]), 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    return obj


def limit_weights(obj, count=4):
    """glTF admite 4 influencias por vértice: conservar las mayores y normalizar."""
    vg = obj.vertex_groups
    for v in obj.data.vertices:
        gs = sorted([(g.weight, g.group) for g in v.groups], reverse=True)
        keep = gs[:count]
        total = sum(w for w, _ in keep) or 1
        for w, gi in gs[count:]:
            vg[gi].remove([v.index])
        for w, gi in keep:
            vg[gi].add([v.index], w / total, 'REPLACE')


def apply_lod(obj, setting):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    if setting == 'subdiv':
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.tris_convert_to_quads()
        bpy.ops.object.mode_set(mode='OBJECT')
        mod = obj.modifiers.new('Subdivision', 'SUBSURF')
        mod.levels = mod.render_levels = 1
        mod.uv_smooth = 'PRESERVE_BOUNDARIES'
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    elif setting < .999:
        mod = obj.modifiers.new('Decimate', 'DECIMATE')
        mod.ratio = setting
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    limit_weights(obj)


def export(path):
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_animations=False, export_skins=True, export_yup=True,
                              export_apply=False, export_materials='EXPORT', export_image_format='NONE')


def finish_glb(path):
    """Materiales PBR del juego y texturas externas compartidas entre niveles."""
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]
    images, textures = [], []
    index = {}

    def tex(name, srgb=True):
        if name not in index:
            index[name] = len(textures)
            images.append({'uri': 'textures/' + name,
                           'mimeType': 'image/jpeg' if name.endswith('.jpg') else 'image/png'})
            textures.append({'source': len(images) - 1, 'sampler': 0})
        return {'index': index[name]}

    colors = json.loads((WORK_ACTIVE / 'model.json').read_text())
    color_of = {m['material']: m.get('color') for m in colors['meshes'] if m.get('color')}
    for mat in doc.get('materials', []):
        spec = MATERIALS.get(mat['name'], {})
        pbr = {'metallicFactor': spec.get('metal', 0.0), 'roughnessFactor': spec.get('rough', .8)}
        if 'map' in spec:
            pbr['baseColorTexture'] = tex(spec['map'])
        else:
            c = color_of.get(mat['name'], [128, 128, 128])
            pbr['baseColorFactor'] = SRGB(c) + [spec.get('blend', 1.0)]
        if 'mr' in spec:
            pbr['metallicRoughnessTexture'] = tex(spec['mr'], False)
        out = {'name': mat['name'], 'pbrMetallicRoughness': pbr}
        if 'normal' in spec:
            out['normalTexture'] = {**tex(spec['normal'], False), 'scale': spec.get('normal_scale', 1.0)}
        if 'mask' in spec:
            out['alphaMode'] = 'MASK'
            out['alphaCutoff'] = spec['mask']
        if 'blend' in spec:
            out['alphaMode'] = 'BLEND'
        if spec.get('double'):
            out['doubleSided'] = True
        mat.clear()
        mat.update(out)
    doc['images'], doc['textures'] = images, textures
    doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    doc.setdefault('asset', {})['copyright'] = colors.get('copyright', (
        'Estanga: anatomía MakeHuman CC0; ropa, rig, accesorios y texturas '
        'proyectadas desde la hoja de referencia del usuario. Ver ATTRIBUTION.md'))
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    path.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(js) + len(binary)) +
                     struct.pack('<II', len(js), 0x4e4f534a) + js + struct.pack('<II', len(binary), 0x004e4942) + binary)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    work = ROOT / args[0] if args else WORK
    stem = args[1] if len(args) > 1 else 'estanga'
    manifest = json.loads((work / 'model.json').read_text())
    data = np.load(work / 'model.npz')
    MATERIALS.update(manifest.get('materials', {}))
    LOD.update({k: tuple(v) for k, v in manifest.get('lod', {}).items()})
    global WORK_ACTIVE
    WORK_ACTIVE = work
    report = {}
    for level, name in [(0, stem), (1, stem + '-low')]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rig = build_rig(manifest)
        tris = 0
        for entry in manifest['meshes']:
            obj = build_mesh(entry, data, rig, manifest['bones'])
            apply_lod(obj, LOD.get(entry['name'], (1.0, 1.0))[level])
            obj.data.calc_loop_triangles()
            tris += len(obj.data.loop_triangles)
        path = OUT / (name + '.glb')
        export(path)
        finish_glb(path)
        report[name] = {'triangles': tris, 'bytes': path.stat().st_size}
        print(name, tris, 'triángulos', path.stat().st_size, 'bytes')
    (work / 'blender-report.json').write_text(json.dumps(report, indent=1))


main()
