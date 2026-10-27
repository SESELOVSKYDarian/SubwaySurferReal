"""Esqueleto detallado de 52 huesos para los personajes jugables (Blender 4.3).

Uso:
  blender -b --python-exit-code 1 --python tools/rig_detailed.py -- teen
Convención del juego: el personaje mira a +Y en Blender (-Z en glTF) y los
huesos Left* están en +X. Todos los huesos apuntan a +Z con roll 0, así la
rotación de reposo exportada es la identidad y el IK de piernas del juego sigue
funcionando. Se conservan los 19 nombres anteriores y se agregan hombros,
Spine1, dedos (3 falanges) y se mantiene ToeBase.
"""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
CHAR = ROOT / 'assets/characters'
FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']
PARENTS = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
for _s in ('Left', 'Right'):
    for _b, _p in [('Shoulder', 'Spine2'), ('Arm', 'Shoulder'), ('ForeArm', 'Arm'), ('Hand', 'ForeArm')]:
        BONES.append(_s + _b)
        PARENTS[_s + _b] = _p if _p == 'Spine2' else _s + _p
    for _f in FINGERS:
        for _k in (1, 2, 3):
            name = f'{_s}Hand{_f}{_k}'
            BONES.append(name)
            PARENTS[name] = f'{_s}Hand' if _k == 1 else f'{_s}Hand{_f}{_k - 1}'
    for _b, _p in [('UpLeg', 'Hips'), ('Leg', 'UpLeg'), ('Foot', 'Leg'), ('ToeBase', 'Foot')]:
        BONES.append(_s + _b)
        PARENTS[_s + _b] = _p if _p == 'Hips' else _s + _p
PREFIX = 'mixamorig'


def clean_name(name):
    """'mixamorig:LeftHandIndex1_016' -> 'LeftHandIndex1'."""
    name = name.split(':')[-1]
    if '_' in name and name.rsplit('_', 1)[1].isdigit():
        name = name.rsplit('_', 1)[0]
    return name


def merge_group(obj, src, dst):
    """Suma los pesos del grupo src en dst y elimina src."""
    gs, gd = obj.vertex_groups.get(src), obj.vertex_groups.get(dst)
    if gs is None:
        return
    if gd is None:
        gd = obj.vertex_groups.new(name=dst)
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == gs.index and g.weight > 0:
                current = 0.0
                for h in v.groups:
                    if h.group == gd.index:
                        current = h.weight
                gd.add([v.index], current + g.weight, 'REPLACE')
    obj.vertex_groups.remove(gs)


def limit_weights(obj, count=4):
    vg = obj.vertex_groups
    for v in obj.data.vertices:
        gs = sorted([(g.weight, g.group) for g in v.groups if g.weight > 1e-5], reverse=True)
        for w, gi in gs[count:]:
            vg[gi].remove([v.index])
        keep = gs[:count]
        total = sum(w for w, _ in keep) or 1
        for w, gi in keep:
            vg[gi].add([v.index], w / total, 'REPLACE')


def reorient(rig):
    """Huesos con cola en +Z y roll 0: rotación de reposo identidad en glTF."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for b in rig.data.edit_bones:
        length = max(b.length, .02)
        b.use_connect = False
        b.tail = b.head + Vector((0, 0, min(length, .12)))
        b.roll = 0
    bpy.ops.object.mode_set(mode='OBJECT')


def apply_pose_as_rest(rig, meshes):
    """Hornea la pose actual en las mallas y la fija como reposo del esqueleto."""
    for obj in meshes:
        if obj.data.shape_keys:
            obj.shape_key_clear()
        bpy.context.view_layer.objects.active = obj
        mod = next(m for m in obj.modifiers if m.type == 'ARMATURE')
        bpy.ops.object.modifier_apply(modifier=mod.name)
        new = obj.modifiers.new('Armature', 'ARMATURE')
        new.object = rig
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def flatten_hierarchy(rig, meshes):
    """Saca vacíos y escalas del FBX: armadura y mallas en coordenadas de mundo."""
    for obj in [rig] + meshes:
        mw = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = mw
    for obj in [rig] + meshes:
        bpy.context.view_layer.objects.active = obj
        for o in bpy.context.selected_objects:
            o.select_set(False)
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for obj in meshes:
        obj.parent = rig
        for m in obj.modifiers:
            if m.type == 'ARMATURE':
                m.object = rig


def turn_to_game(rig, meshes, turn=True):
    """Gira 180° (mirar a +Y) y apoya la suela en Z=0."""
    lowest = min((obj.matrix_world @ v.co).z for obj in meshes for v in obj.data.vertices)
    for obj in [rig] + meshes:
        obj.parent = None
    pivot = Matrix.Translation((0, 0, -lowest))
    if turn:
        pivot = Matrix.Rotation(math.pi, 4, 'Z') @ pivot
    for obj in [rig] + meshes:
        obj.matrix_world = pivot @ obj.matrix_world
        bpy.context.view_layer.objects.active = obj
        for o in bpy.context.selected_objects:
            o.select_set(False)
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for obj in meshes:
        obj.parent = rig


def rename_bones(rig, meshes, swap_sides):
    """Nombres del juego; con swap_sides intercambia Left/Right (convención Left = +X)."""
    for b in rig.data.bones:
        b.name = 'TMP_' + clean_name(b.name)
    for b in rig.data.bones:
        n = b.name[4:]
        if swap_sides:
            if n.startswith('Left'):
                n = 'Right' + n[4:]
            elif n.startswith('Right'):
                n = 'Left' + n[5:]
        b.name = PREFIX + n


def drop_extra_bones(rig, meshes):
    """Fusiona puntas (HeadTop_End, *4, Toe_End, raíz) en sus padres y las borra."""
    keep = {PREFIX + b for b in BONES}
    extras = [b.name for b in rig.data.bones if b.name not in keep]
    for name in extras:
        bone = rig.data.bones[name]
        parent = bone.parent
        while parent is not None and parent.name not in keep:
            parent = parent.parent
        for obj in meshes:
            if parent is not None:
                merge_group(obj, name, parent.name)
            elif obj.vertex_groups.get(name):
                obj.vertex_groups.remove(obj.vertex_groups[name])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name in extras:
        eb = rig.data.edit_bones.get(name)
        if eb:
            rig.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode='OBJECT')
    missing = keep - {b.name for b in rig.data.bones}
    if missing:
        raise RuntimeError(f'Faltan huesos: {sorted(missing)}')


def pose_bone(rig, name, axis, angle):
    pb = rig.pose.bones[name]
    pb.rotation_mode = 'QUATERNION'
    rest = pb.bone.matrix_local.to_3x3()
    # Rotación en ejes de mundo convertida al espacio local del hueso.
    q_world = Matrix.Rotation(angle, 3, axis)
    local = rest.inverted() @ q_world @ rest
    pb.rotation_quaternion = local.to_quaternion() @ pb.rotation_quaternion


def decimate(obj, ratio):
    if ratio >= .999:
        return
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def export(path):
    for o in bpy.context.scene.objects:
        o.select_set(o.type in ('ARMATURE', 'MESH'))
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_animations=False, export_skins=True, export_yup=True,
                              export_morph=False, export_apply=False)


def triangles():
    n = 0
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


# ------------------------------------------------------------------ El pibe
TEEN_LOD = {'low': {'haircut': .30, 'AvatarHead': .40, 'AvatarTeethUpper': .15, 'AvatarTeethLower': .15,
                    'AvatarEyelashes': .35, 'AvatarBody': .7, 'outfit_top': .6, 'outfit_bottom': .6,
                    'outfit_shoes': .6, 'AvatarLeftEyeball': .5, 'AvatarRightEyeball': .5}}


def build_teen(low):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(CHAR / 'source/teen-boy/original.glb'))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.materials and o.vertex_groups]
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    rig.animation_data_clear()
    # La pose importada arrastra la traslación del FBX (en cm): volver al reposo real.
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    for obj in meshes:
        if obj.data.shape_keys:
            bpy.context.view_layer.objects.active = obj
            obj.shape_key_clear()
    flatten_hierarchy(rig, meshes)
    # Los vacíos del FBX repiten los nombres de los materiales: borrarlos antes de renombrar.
    for o in list(bpy.data.objects):
        if o.type not in ('ARMATURE', 'MESH'):
            bpy.data.objects.remove(o, do_unlink=True)
    for obj in meshes:
        obj.name = obj.data.materials[0].name
    for obj in [rig] + meshes:
        obj.rotation_mode = 'XYZ'
    turn_to_game(rig, meshes, turn=True)
    rename_bones(rig, meshes, swap_sides=True)
    drop_extra_bones(rig, meshes)
    # Pose T → brazos a 58° bajo la horizontal y codo apenas flexionado.
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for side, sign in (('Left', 1), ('Right', -1)):
        pose_bone(rig, f'{PREFIX}{side}Arm', Vector((0, 1, 0)), sign * math.radians(58))
        # En pose T el antebrazo apunta a ±X: flexionar hacia adelante es girar sobre Z.
        pose_bone(rig, f'{PREFIX}{side}ForeArm', Vector((0, 0, 1)), sign * math.radians(14))
    bpy.ops.object.mode_set(mode='OBJECT')
    apply_pose_as_rest(rig, meshes)
    reorient(rig)
    for obj in meshes:
        if obj.data.materials[0].name == 'outfit_shoes':
            obj.data.materials[0].name = 'Shoes'
        if low:
            decimate(obj, TEEN_LOD['low'].get(obj.name, 1.0))
        limit_weights(obj)
    rig.name = rig.data.name = 'TechnicalStudent'
    path = CHAR / ('technical-student-low.glb' if low else 'technical-student.glb')
    export(path)
    print('teen', 'low' if low else 'high', triangles(), 'triángulos', len(rig.data.bones), 'huesos', path.stat().st_size)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if 'teen' in args:
        build_teen(False)
        build_teen(True)
