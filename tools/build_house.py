"""Living/pasillo de la casa con el guardapolvo colgado en la percha (modo historia).

Uso: blender -b --python-exit-code 1 --python tools/build_house.py -- [salida] [muestras]
Salida por defecto: test-results/house  (genera house.blend, house_*.png)
Medidas en metros. Entrada por la puerta en y = 0; la percha queda en la pared
derecha cerca de la puerta, el living al fondo.
"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'test-results/house'
SAMPLES = int(argv[1]) if len(argv) > 1 else 48
os.makedirs(OUT, exist_ok=True)
random.seed(7)

# ------------------------------------------------------------------ escena
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
W, D, H = 3.6, 6.2, 2.6          # ancho (x), largo (y), alto (z)

def col(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c
C_SHELL, C_FURN, C_COAT, C_LIGHT = col('COL-shell'), col('COL-furniture'), col('COL-guardapolvo'), col('COL-lights')

def link(obj, c):
    c.objects.link(obj); return obj

# ------------------------------------------------------------------ materiales
def mat(name, base=(.8, .8, .8, 1), rough=.6, metal=0., nodes=None, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes; l = m.node_tree.links
    bsdf = n['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    for k, v in kw.items():
        if k in bsdf.inputs: bsdf.inputs[k].default_value = v
    if nodes: nodes(n, l, bsdf)
    return m

def tex_coord(n):
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping')
    return tc, mp

def noise_bump(n, l, bsdf, scale=60, strength=.15, detail=8):
    tc = n.new('ShaderNodeTexCoord')
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = detail
    bm = n.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = strength
    l.new(tc.outputs['Object'], nz.inputs['Vector']); l.new(nz.outputs['Fac'], bm.inputs['Height'])
    l.new(bm.outputs['Normal'], bsdf.inputs['Normal'])
    return nz

def wood_floor(n, l, bsdf):
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1, 1, 1)
    br = n.new('ShaderNodeTexBrick')
    br.offset = .5; br.inputs['Scale'].default_value = 1
    br.inputs['Mortar Size'].default_value = .006; br.inputs['Mortar Smooth'].default_value = .1
    br.inputs['Brick Width'].default_value = 1.1; br.inputs['Row Height'].default_value = .14
    br.inputs['Color1'].default_value = (.36, .20, .09, 1); br.inputs['Color2'].default_value = (.46, .27, .13, 1)
    br.inputs['Mortar'].default_value = (.05, .03, .02, 1)
    grain = n.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value = 6; grain.inputs['Detail'].default_value = 12
    grain.inputs['Distortion'].default_value = 1.5
    stretch = n.new('ShaderNodeMapping'); stretch.inputs['Scale'].default_value = (1.0, 22.0, 1.0)
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (.55, .5, .45, 1); cr.color_ramp.elements[1].color = (1, 1, 1, 1)
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = .85
    l.new(tc.outputs['Object'], mp.inputs['Vector']); l.new(mp.outputs['Vector'], br.inputs['Vector'])
    l.new(tc.outputs['Object'], stretch.inputs['Vector']); l.new(stretch.outputs['Vector'], grain.inputs['Vector'])
    l.new(grain.outputs['Fac'], cr.inputs['Fac'])
    l.new(br.outputs['Color'], mix.inputs[6]); l.new(cr.outputs['Color'], mix.inputs[7])
    l.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .08
    l.new(grain.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = .42
    for k in ('Coat Weight',):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = .25

def wall_paint(n, l, bsdf):
    noise_bump(n, l, bsdf, scale=140, strength=.05, detail=6)

def fabric(n, l, bsdf):
    tc = n.new('ShaderNodeTexCoord')
    wv = n.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 220; wv.inputs['Distortion'].default_value = 2
    wv2 = n.new('ShaderNodeTexNoise'); wv2.inputs['Scale'].default_value = 400
    bm = n.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = .5
    mx = n.new('ShaderNodeMath'); mx.operation = 'ADD'
    l.new(tc.outputs['Object'], wv.inputs['Vector']); l.new(tc.outputs['Object'], wv2.inputs['Vector'])
    l.new(wv.outputs['Fac'], mx.inputs[0]); l.new(wv2.outputs['Fac'], mx.inputs[1])
    l.new(mx.outputs['Value'], bm.inputs['Height']); l.new(bm.outputs['Normal'], bsdf.inputs['Normal'])
    if 'Sheen Weight' in bsdf.inputs: bsdf.inputs['Sheen Weight'].default_value = .6

M = {
    'wall': mat('MAT-wall_paint', (.86, .82, .74, 1), .9, nodes=wall_paint),
    'ceiling': mat('MAT-ceiling', (.93, .92, .9, 1), .95),
    'floor': mat('MAT-floor_wood', (.4, .22, .1, 1), .42, nodes=wood_floor),
    'base': mat('MAT-baseboard', (.92, .91, .88, 1), .5),
    'door': mat('MAT-door_wood', (.33, .19, .09, 1), .45, nodes=lambda n, l, b: noise_bump(n, l, b, 25, .1, 10)),
    'frame': mat('MAT-door_frame', (.9, .88, .84, 1), .5),
    'metal': mat('MAT-metal_black', (.02, .02, .022, 1), .35, 1.0),
    'brass': mat('MAT-brass', (.75, .56, .22, 1), .3, 1.0),
    'sofa': mat('MAT-sofa_fabric', (.30, .36, .38, 1), .95, nodes=fabric),
    'cushion': mat('MAT-cushion', (.72, .45, .22, 1), .95, nodes=fabric),
    'wood': mat('MAT-furniture_wood', (.30, .17, .08, 1), .5, nodes=lambda n, l, b: noise_bump(n, l, b, 30, .12, 10)),
    'rug': mat('MAT-rug', (.2, .09, .07, 1), 1.0, nodes=fabric),
    'glass': mat('MAT-glass', (.9, .95, 1, 1), .02, 0., **{'Transmission Weight': 1.0}),
    'shade': mat('MAT-lampshade', (.95, .88, .72, 1), .9, **{'Emission Strength': .0}),
    'coat': mat('MAT-guardapolvo_navy', (.012, .026, .095, 1), .85, nodes=fabric),
    'button': mat('MAT-button', (.9, .9, .88, 1), .35),
    'paper': mat('MAT-frame_print', (.78, .7, .55, 1), .8),
    'plant': mat('MAT-plant', (.08, .26, .08, 1), .6),
    'pot': mat('MAT-pot', (.55, .3, .2, 1), .8),
}

# ------------------------------------------------------------------ texturas PBR reales (Poly Haven, CC0)
TEX_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'story', 'textures'))

def pbr(name, folder, tile=1.0, tint=None, tint_mix=1.0, rough_mul=1.0, bump=1.0, rot=0.0, flatten=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes; l = m.node_tree.links
    bsdf = n['Principled BSDF']
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / tile,) * 3
    mp.inputs['Rotation'].default_value = (0, 0, rot)
    l.new(tc.outputs['Object'], mp.inputs['Vector'])
    def img(kind, cs):
        t = n.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEX_DIR, folder, kind + '.jpg'), check_existing=True)
        t.image.colorspace_settings.name = cs; t.projection = 'BOX'; t.projection_blend = .25; t.interpolation = 'Cubic'
        l.new(mp.outputs['Vector'], t.inputs['Vector']); return t
    d = img('diff', 'sRGB'); r = img('rough', 'Non-Color'); nr = img('nor', 'Non-Color')
    color = d.outputs['Color']
    if flatten:
        fl = n.new('ShaderNodeMix'); fl.data_type = 'RGBA'; fl.blend_type = 'MIX'
        fl.inputs['Factor'].default_value = flatten; fl.inputs[7].default_value = (.5, .5, .5, 1)
        l.new(color, fl.inputs[6]); color = fl.outputs[2]
    if tint is not None:
        mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = tint_mix; mix.inputs[7].default_value = tint
        l.new(color, mix.inputs[6]); color = mix.outputs[2]
    l.new(color, bsdf.inputs['Base Color'])
    rv = n.new('ShaderNodeMath'); rv.operation = 'MULTIPLY'; rv.inputs[1].default_value = rough_mul
    l.new(r.outputs['Color'], rv.inputs[0]); l.new(rv.outputs['Value'], bsdf.inputs['Roughness'])
    nm = n.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = bump
    l.new(nr.outputs['Color'], nm.inputs['Color']); l.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m

M['floor'] = pbr('MAT-floor_wood', 'plank_flooring_02', 1.6, tint=(.9, .8, .72, 1), tint_mix=.6)
M['wall'] = pbr('MAT-wall_paint', 'painted_plaster_wall', 1.6, tint=(1.0, .93, .8, 1), tint_mix=1.0, bump=.5)
M['sofa'] = pbr('MAT-sofa_fabric', 'poly_wool_herringbone', .55, tint=(.38, .5, .52, 1), tint_mix=1.0)
M['cushion'] = pbr('MAT-cushion', 'wool_boucle', .4, tint=(.8, .35, .1, 1), tint_mix=1.0)
M['coat'] = pbr('MAT-guardapolvo_navy', 'rough_linen', .12, tint=(.0, .005, .055, 1), tint_mix=1.0, bump=.4, flatten=.8)
M['wood'] = pbr('MAT-furniture_wood', 'fine_grained_wood', .7, tint=(2.2, 1.5, 1.0, 1), tint_mix=1.0)
M['door'] = pbr('MAT-door_wood', 'fine_grained_wood', .8, tint=(1.6, 1.0, .65, 1), tint_mix=1.0)
M['rug'] = pbr('MAT-rug', 'wool_boucle', .6, tint=(.45, .17, .12, 1), tint_mix=1.0)

# ------------------------------------------------------------------ primitivas
def box(name, size, loc, m, c=C_SHELL, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 3; b.limit_method = 'ANGLE'
    for oc in o.users_collection: oc.objects.unlink(o)
    c.objects.link(o)
    return o

def cyl(name, r, h, loc, m, c=C_FURN, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    for oc in o.users_collection: oc.objects.unlink(o)
    c.objects.link(o)
    return o

def sphere(name, r, loc, m, c=C_FURN, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.active_object; o.name = name; o.scale = scale; o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    for oc in o.users_collection: oc.objects.unlink(o)
    c.objects.link(o)
    return o

# ------------------------------------------------------------------ cáscara
box('GEO-floor', (W, D, .1), (0, D / 2, -.05), M['floor'])
box('GEO-ceiling', (W, D, .1), (0, D / 2, H + .05), M['ceiling'])
box('GEO-wall_left', (.15, D, H), (-W / 2 - .075, D / 2, H / 2), M['wall'])
box('GEO-wall_right', (.15, D, H), (W / 2 + .075, D / 2, H / 2), M['wall'])
box('GEO-wall_back', (W + .3, .15, H), (0, D + .075, H / 2), M['wall'])
# pared de entrada con vano de puerta (puerta abierta hacia afuera)
DOOR_W, DOOR_H, DX = .95, 2.1, -.9
box('GEO-wall_front_l', (W / 2 + DX - DOOR_W / 2 + .15, .15, H), (-W / 2 - .15 + (W / 2 + DX - DOOR_W / 2 + .15) / 2, -.075, H / 2), M['wall'])
rx0 = DX + DOOR_W / 2
box('GEO-wall_front_r', (W / 2 - rx0 + .15, .15, H), (rx0 + (W / 2 - rx0 + .15) / 2, -.075, H / 2), M['wall'])
box('GEO-wall_front_top', (DOOR_W, .15, H - DOOR_H), (DX, -.075, DOOR_H + (H - DOOR_H) / 2), M['wall'])
# marco de la puerta y hoja entreabierta
for sx in (-1, 1):
    box(f'GEO-door_jamb_{sx}', (.07, .2, DOOR_H), (DX + sx * (DOOR_W / 2 + .035), -.07, DOOR_H / 2), M['frame'], bevel=.01)
box('GEO-door_head', (DOOR_W + .14, .2, .07), (DX, -.07, DOOR_H + .035), M['frame'], bevel=.01)
door = box('GEO-door_leaf', (DOOR_W - .02, .045, DOOR_H - .02), (0, 0, 0), M['door'], bevel=.006)
door.location = (DX - DOOR_W / 2 + .02, -.1, DOOR_H / 2);
pivot = bpy.data.objects.new('GEO-door_pivot', None); link(pivot, C_SHELL); pivot.location = (DX - DOOR_W / 2 + .02, -.1, 0)
door.parent = pivot; door.location = (DOOR_W / 2 - .01, 0, DOOR_H / 2); pivot.rotation_euler = (0, 0, math.radians(-68))
cyl('GEO-door_knob', .028, .06, (0, 0, 0), M['brass'], C_SHELL, rot=(math.pi / 2, 0, 0))
k = bpy.data.objects['GEO-door_knob']; k.parent = door; k.location = (DOOR_W - .13, -.04, -.05)
# zócalos
for name, size, loc in (
    ('base_left', (.02, D, .11), (-W / 2 + .01, D / 2, .055)),
    ('base_right', (.02, D - .0, .11), (W / 2 - .01, D / 2, .055)),
    ('base_back', (W, .02, .11), (0, D - .01, .055)),
):
    box('GEO-' + name, size, loc, M['base'], bevel=.004)
# ventana al fondo con vidrio y marco
WX, WZ, WW, WH = .5, 1.45, 1.4, 1.2
box('GEO-win_glass', (WW, .01, WH), (WX, D - .02, WZ), M['glass'])
for name, size, loc in (
    ('win_top', (WW + .1, .08, .05), (WX, D - .04, WZ + WH / 2 + .025)), ('win_bot', (WW + .1, .12, .05), (WX, D - .06, WZ - WH / 2 - .025)),
    ('win_l', (.05, .08, WH), (WX - WW / 2 - .025, D - .04, WZ)), ('win_r', (.05, .08, WH), (WX + WW / 2 + .025, D - .04, WZ)),
    ('win_mid_v', (.03, .06, WH), (WX, D - .04, WZ)), ('win_mid_h', (WW, .06, .03), (WX, D - .04, WZ)),
):
    box('GEO-' + name, size, loc, M['frame'], bevel=.004)
# afuera de la ventana: placa luminosa (cielo de tarde) para que entre luz natural
sky = bpy.data.objects.new('LGT-window_sun', bpy.data.lights.new('LGT-window_sun', 'AREA'))
sky.data.shape = 'RECTANGLE'; sky.data.size = WW; sky.data.size_y = WH
sky.data.energy = 900; sky.data.color = (1, .86, .68)
sky.location = (WX, D + .6, WZ); sky.rotation_euler = (math.radians(-90), 0, 0)
sky.rotation_euler = (math.radians(90), 0, math.radians(180))
link(sky, C_LIGHT)
bpy.ops.mesh.primitive_plane_add(size=1, location=(WX, D + .5, WZ), rotation=(math.pi / 2, 0, 0))
outside = bpy.context.active_object; outside.name = 'GEO-outside_sky'; outside.scale = (5, 4, 1)
em = bpy.data.materials.new('MAT-sky'); em.use_nodes = True
em.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (.75, .88, 1, 1)
em.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 5.0
outside.data.materials.append(em)
for oc in list(outside.users_collection): oc.objects.unlink(outside)
C_SHELL.objects.link(outside)
sun = bpy.data.objects.new('LGT-sun', bpy.data.lights.new('LGT-sun', 'SUN'))
sun.data.energy = 5.0; sun.data.color = (1, .82, .6); sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(62), 0, math.radians(200)); link(sun, C_LIGHT)

# ------------------------------------------------------------------ percha (pared derecha)
PX, PY = W / 2 - .02, 1.1
rail = box('GEO-percha_rail', (.03, 1.15, .09), (PX - .015, PY + .4, 1.72), M['wood'], C_FURN, bevel=.008)
for i, yy in enumerate((PY - .25, PY + .05, PY + .35, PY + .65)):
    cyl(f'GEO-percha_hook_{i}', .008, .12, (PX - .075, yy, 1.74), M['metal'], C_FURN, rot=(0, math.pi / 2, 0), verts=12)
    sphere(f'GEO-percha_knob_{i}', .018, (PX - .135, yy, 1.74), M['metal'], C_FURN)
GUARD_Y = PY + .05

# ------------------------------------------------------------------ guardapolvo
# ---- guardapolvo (réplica de la foto de referencia: solapa con muesca, 5 botones, 3 bolsillos) ----
S_PX = .00125   # metros por pixel de la foto de referencia


def shell(name, poly, thick=.010, voxel=.003, smooth=6):
    """Polígono 2D (y, z) -> lámina gruesa remallada (bordes limpios, sin escalones)."""
    bm = bmesh.new()
    vs = [bm.verts.new((0, y, z)) for y, z in poly]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); link(ob, C_COAT)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    sol = ob.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = thick; sol.offset = 0
    bpy.ops.object.modifier_apply(modifier='solid')
    rm = ob.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier='remesh')
    sm = ob.modifiers.new('smooth', 'SMOOTH'); sm.iterations = smooth; sm.factor = .6
    bpy.ops.object.modifier_apply(modifier='smooth')
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(M['coat'])
    return ob


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)


def photo(px, py):
    """Pixel de la foto (centro de la prenda en x=520, línea de hombros en y=170) -> (y, z) en metros."""
    return ((px - 520) * S_PX, -(py - 170) * S_PX)


def coat():
    cx, cy, top = PX - .17, GUARD_Y, 1.64
    # mitad izquierda del cuerpo (px de la foto): hombro, sisa, costado, ruedo
    half = [photo(*p) for p in ((415, 150), (345, 188), (372, 300), (360, 520), (352, 700), (350, 893))]
    right = [(-y, z) for y, z in reversed(half)]
    # delantero con escote en V hasta el primer botón; trasero entero (se ve por el escote)
    front = [(-.07, -.01)] + half + right + [(.07, -.01), (0.0, -.205)]
    back = [(-.075, .02)] + half + right + [(.075, .02)]
    for name, poly, off in (('GEO-coat_front', front, 0.0), ('GEO-coat_back', back, .02)):
        ob = shell(name, poly, .008)
        for v in ob.data.vertices:
            y, z = v.co.y, v.co.z
            chest = max(0.0, 1 - (y / .22) ** 2) * smoothstep(-.9, -.1, z) * .028
            sag = .008 * math.sin(y * 30 + z * 4 + math.sin(z * 9) * 1.2) * (1 + z)
            drape = .004 * math.sin(z * 37 + y * 14) + .003 * math.sin(y * 71 - z * 6)
            hem = .012 * smoothstep(-.7, -.99, z) * math.sin(y * 18)
            v.co.x += -(chest + sag + drape + hem) + off
            v.co.z += -.012 * (abs(y) / .22) ** 2
    # solapas con muesca, dobladas hacia afuera
    for side in (-1, 1):
        lap = [(.065, .018), (.155, -.012), (.165, -.052), (.205, -.088), (.17, -.14), (.0, -.215), (.0, -.12)]
        lap = [(side * y, z) for y, z in lap]
        if side > 0: lap = lap[::-1]
        lo = shell(f'GEO-coat_lapel_{side}', lap, .009, voxel=.0025)
        for v in lo.data.vertices:
            d = abs(v.co.y) / .2
            v.co.x += -(.016 + .020 * smoothstep(.1, 1.0, d)) + .003 * math.sin(v.co.z * 55)
    # cuello: banda parada alrededor de la nuca
    bm = bmesh.new()
    segs, rows = 40, 6
    ring = []
    for r in range(rows + 1):
        zr = .005 + .044 * r / rows
        rr = .078 + .004 * r / rows
        ring.append([bm.verts.new((.018 + rr * math.cos(math.radians(-100 + 200 * sg / segs)),
                                   rr * math.sin(math.radians(-100 + 200 * sg / segs)), zr)) for sg in range(segs + 1)])
    for r in range(rows):
        for sg in range(segs):
            bm.faces.new((ring[r][sg], ring[r][sg + 1], ring[r + 1][sg + 1], ring[r + 1][sg]))
    me = bpy.data.meshes.new('GEO-coat_collar'); bm.to_mesh(me); bm.free()
    collar = bpy.data.objects.new('GEO-coat_collar', me); link(collar, C_COAT)
    me.materials.append(M['coat'])
    collar.modifiers.new('solid', 'SOLIDIFY').thickness = .008
    collar.modifiers.new('sub', 'SUBSURF').levels = 2
    for pl in me.polygons: pl.use_smooth = True
    # mangas: tubos aplanados y cónicos que caen por delante del costado
    for side in (-1, 1):
        bm = bmesh.new()
        rings, around = 46, 56
        pts = []
        for r in range(rings + 1):
            t = r / rings
            sy = side * (.214 + .06 * t - .008 * math.sin(t * math.pi))
            sz = -.02 - .62 * t
            cap = math.sqrt(min(1.0, t / .07))
            ra = (.066 - .010 * t) * cap
            rb = (.042 - .006 * t) * cap
            row = []
            for k in range(around):
                a = 2 * math.pi * k / around
                wob = 1 + .03 * math.sin(a * 3 + t * 9) * (1 - t * .4)
                row.append(bm.verts.new((-.028 - .022 * t + rb * math.cos(a) * wob, sy + ra * math.sin(a) * wob, sz)))
            pts.append(row)
        for r in range(rings):
            for k in range(around):
                bm.faces.new((pts[r][k], pts[r][(k + 1) % around], pts[r + 1][(k + 1) % around], pts[r + 1][k]))
        me = bpy.data.meshes.new(f'GEO-coat_sleeve_{side}'); bm.to_mesh(me); bm.free()
        sl = bpy.data.objects.new(f'GEO-coat_sleeve_{side}', me); link(sl, C_COAT)
        me.materials.append(M['coat'])
        for v in me.vertices:
            t = max(0.0, min(1.0, (-.02 - v.co.z) / .62))
            ang = math.atan2(v.co.y - side * (.214 + .06 * t), v.co.x + .03)
            v.co.x += .0025 * math.sin(v.co.z * 26 + ang * 2) * (.4 + t) + .0018 * math.sin(v.co.z * 61 + ang * 5)
            v.co.y += .0018 * math.sin(v.co.z * 33 - ang * 3) * side
        sl.modifiers.new('sub', 'SUBSURF').levels = 1
        sl.modifiers.new('solid', 'SOLIDIFY').thickness = .007
        for pl in me.polygons: pl.use_smooth = True

    # bolsillos de parche con esquinas inferiores redondeadas
    def pocket(name, y, z, w, h, r=.018):
        pts = []
        for ang in range(0, 91, 15): pts.append((w / 2 - r + r * math.cos(math.radians(ang)), -h + r - r * math.sin(math.radians(ang))))
        for ang in range(90, 181, 15): pts.append((-w / 2 + r + r * math.cos(math.radians(ang)), -h + r - r * math.sin(math.radians(ang))))
        pts += [(-w / 2, 0), (w / 2, 0)]
        ob = shell(name, pts, .006, voxel=.0022, smooth=3)
        ob.location = (-.017, y, z)
        return ob
    pocket('GEO-coat_pocket_l', -.145, -.49, .136, .19)
    pocket('GEO-coat_pocket_r', .145, -.49, .136, .19)
    pocket('GEO-coat_chest_pocket', .113, -.156, .113, .144, r=.014)
    # botones azul marino con cuatro agujeros
    btn = mat('MAT-coat_button', (.012, .028, .09, 1), .35)
    for i, py_ in enumerate((348, 430, 512, 590, 668)):
        y_, z_ = photo(522, py_)
        b = cyl(f'GEO-coat_button_{i}', .0098, .0042, (-.034, y_, z_), btn, C_COAT, rot=(0, math.pi / 2, 0), verts=24)
        for dy, dz in ((.0035, .0035), (-.0035, .0035), (.0035, -.0035), (-.0035, -.0035)):
            cyl(f'GEO-coat_btnhole_{i}', .0012, .005, (-.0365, y_ + dy, z_ + dz), M['metal'], C_COAT, rot=(0, math.pi / 2, 0), verts=8)
    # insignia celeste y etiqueta del cuello
    by_, bz_ = photo(585, 215)
    cyl('GEO-coat_badge', .0115, .003, (-.058, by_, bz_), mat('MAT-badge', (.1, .62, .85, 1), .35), C_COAT, rot=(0, math.pi / 2, 0))
    ty, tz = photo(520, 130)
    box('GEO-coat_label', (.003, .042, .052), (.012, 0, tz - .02), mat('MAT-coat_label', (.55, .6, .75, 1), .6), C_COAT)
    # gancho y percha de madera dentro de los hombros
    bpy.ops.mesh.primitive_torus_add(major_radius=.028, minor_radius=.0035, location=(.05, 0, .06),
                                     rotation=(math.pi / 2, 0, 0), major_segments=24, minor_segments=8)
    hook = bpy.context.active_object; hook.name = 'GEO-coat_hook'; hook.data.materials.append(M['metal'])
    for oc in list(hook.users_collection): oc.objects.unlink(hook)
    C_COAT.objects.link(hook)
    cyl('GEO-coat_hookpost', .004, .07, (.05, 0, .025), M['metal'], C_COAT)
    for side in (-1, 1):
        box(f'GEO-hanger_{side}', (.012, .13, .012), (.02, side * .1, -.025), M['wood'], C_COAT, rot=(0, 0, math.radians(side * -14)))
    # la prenda mira hacia -x y cuelga de la percha de pared
    root = bpy.data.objects.new('GEO-guardapolvo', None); link(root, C_COAT)
    root.location = (cx, cy, top)
    for ob in list(C_COAT.objects):
        if ob is not root: ob.parent = root
coat()

# ------------------------------------------------------------------ living: sillón, mesa, estantería, planta, lámpara
def sofa(x, y, rot=0):
    g = bpy.data.objects.new('GEO-sofa', None); link(g, C_FURN); g.location = (x, y, 0); g.rotation_euler = (0, 0, math.radians(rot))
    parts = [
        box('GEO-sofa_base', (1.9, .86, .22), (0, 0, .22), M['sofa'], C_FURN, bevel=.04),
        box('GEO-sofa_back', (1.9, .2, .5), (0, -.33, .6), M['sofa'], C_FURN, bevel=.07),
        box('GEO-sofa_arm_l', (.18, .86, .32), (-.86, 0, .46), M['sofa'], C_FURN, bevel=.07),
        box('GEO-sofa_arm_r', (.18, .86, .32), (.86, 0, .46), M['sofa'], C_FURN, bevel=.07),
        box('GEO-sofa_seat_l', (.78, .64, .14), (-.39, .06, .43), M['sofa'], C_FURN, bevel=.05),
        box('GEO-sofa_seat_r', (.78, .64, .14), (.39, .06, .43), M['sofa'], C_FURN, bevel=.05),
        box('GEO-cushion_a', (.4, .12, .36), (-.58, -.2, .72), M['cushion'], C_FURN, bevel=.05, rot=(math.radians(-14), 0, math.radians(8))),
        box('GEO-cushion_b', (.4, .12, .36), (.62, -.2, .72), M['sofa'], C_FURN, bevel=.05, rot=(math.radians(-14), 0, math.radians(-10))),
    ]
    for p in parts:
        p.parent = g
        for mod in p.modifiers:
            if mod.type == 'BEVEL': mod.width = min(mod.width, .05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            f = cyl('GEO-sofa_foot', .028, .1, (sx * .85, sy * .36, .05), M['wood'], C_FURN); f.parent = g
sofa(.55, D - 1.0, 180)
# mesa ratona
box('GEO-table_top', (.95, .55, .04), (.55, 3.9, .42), M['wood'], C_FURN, bevel=.012)
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl('GEO-table_leg', .022, .4, (.55 + sx * .42, 3.9 + sy * .22, .2), M['wood'], C_FURN)
# alfombra
rug = box('GEO-rug', (2.1, 1.5, .012), (.55, 3.9, .008), M['rug'], C_FURN)
# estantería con libros contra pared izquierda
box('GEO-shelf_frame_l', (.3, .03, 1.5), (-W / 2 + .15, 4.4, .75), M['wood'], C_FURN)
box('GEO-shelf_frame_r', (.3, .03, 1.5), (-W / 2 + .15, 5.4, .75), M['wood'], C_FURN)
for i, z in enumerate((.02, .5, .95, 1.4)):
    box(f'GEO-shelf_board_{i}', (.3, 1.04, .03), (-W / 2 + .15, 4.9, z + .015), M['wood'], C_FURN)
book_cols = [(.55, .1, .1), (.1, .3, .5), (.85, .75, .45), (.15, .45, .2), (.6, .25, .12), (.2, .2, .22)]
for r_i, z in enumerate((.5, .95, 1.4)):
    y = 4.43
    while y < 5.35:
        w = random.uniform(.025, .05); h = random.uniform(.2, .3)
        if y + w > 5.36: break
        bm_ = mat(f'MAT-book_{r_i}_{int(y*100)}', random.choice(book_cols) + (1,), .7)
        box('GEO-book', (.2, w, h), (-W / 2 + .15, y + w / 2, z + .015 + h / 2), bm_, C_FURN, rot=(0, 0, 0))
        y += w + .004
# lámpara de pie
cyl('GEO-lamp_base', .12, .02, (-W / 2 + .45, D - .4, .01), M['metal'], C_FURN)
cyl('GEO-lamp_pole', .012, 1.4, (-W / 2 + .45, D - .4, .72), M['metal'], C_FURN)
shade = cyl('GEO-lamp_shade', .17, .26, (-W / 2 + .45, D - .4, 1.5), M['shade'], C_FURN)
lamp_pt = bpy.data.objects.new('LGT-lamp', bpy.data.lights.new('LGT-lamp', 'POINT'))
lamp_pt.data.energy = 220; lamp_pt.data.color = (1, .78, .5); lamp_pt.data.shadow_soft_size = .15
lamp_pt.location = (-W / 2 + .45, D - .4, 1.48); link(lamp_pt, C_LIGHT)
# lámpara de techo (luz de pasillo)
cyl('GEO-ceiling_lamp', .16, .06, (0, 1.4, H - .03), M['shade'], C_FURN)
ceil_pt = bpy.data.objects.new('LGT-hall', bpy.data.lights.new('LGT-hall', 'POINT'))
ceil_pt.data.energy = 220; ceil_pt.data.color = (1, .9, .78); ceil_pt.data.shadow_soft_size = .2
ceil_pt.location = (0, 1.4, H - .25); link(ceil_pt, C_LIGHT)
# planta junto a la ventana
cyl('GEO-pot', .16, .26, (1.4, D - .4, .13), M['pot'], C_FURN)
for i in range(11):
    a = i * 2.4
    leaf = bpy.data.objects.new(f'GEO-leaf_{i}', None)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.1, location=(1.4 + math.cos(a) * .12, D - .4 + math.sin(a) * .12, .55 + (i % 4) * .13), segments=16, ring_count=8)
    lf = bpy.context.active_object; lf.name = f'GEO-leaf_{i}'; lf.scale = (.32, 1.6, .06)
    lf.rotation_euler = (math.radians(random.uniform(-30, 30)), math.radians(random.uniform(-40, -10)), a)
    lf.data.materials.append(M['plant']); bpy.ops.object.shade_smooth()
    for oc in lf.users_collection: oc.objects.unlink(lf)
    C_FURN.objects.link(lf)
# cuadros en la pared izquierda
for i, (y, z, w, h) in enumerate(((1.7, 1.55, .5, .65), (2.5, 1.5, .4, .5), (3.2, 1.6, .6, .45))):
    box(f'GEO-picture_frame_{i}', (.03, w, h), (-W / 2 + .015, y, z), M['wood'], C_FURN, bevel=.006)
    box(f'GEO-picture_print_{i}', (.005, w - .06, h - .06), (-W / 2 + .032, y, z), M['paper'], C_FURN)
# zapatero y felpudo junto a la puerta
box('GEO-doormat', (.8, .5, .015), (DX, .45, .008), pbr('MAT-doormat', 'wool_boucle', .3, tint=(.18, .13, .09, 1)), C_FURN)

# ------------------------------------------------------------------ mundo, cámara, render
scene.world = bpy.data.worlds.new('World'); scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.5, .62, .8, 1); bg.inputs['Strength'].default_value = .35
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
try:
    scene.cycles.device = 'GPU'
except Exception:
    pass
RES = int(argv[2]) if len(argv) > 2 else 1280
scene.render.resolution_x, scene.render.resolution_y = RES, RES * 9 // 16
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Base Contrast'
scene.view_settings.exposure = .7

def camera(name, loc, target, lens=22):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name)); scene.collection.objects.link(cam)
    cam.data.lens = lens; cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return cam

shots = {
    'frente': ((PX - 3.0, GUARD_Y, 1.14), (PX - .17, GUARD_Y, 1.14), 50),
    'entrada': ((DX + .55, .35, 1.55), (1.0, 3.8, 1.2), 20),
    'percha': ((-.3, .85, 1.45), (PX - .17, GUARD_Y, 1.15), 30),
    'living': ((-1.0, .6, 1.5), (.4, D - 1.0, .9), 22),
}
cams = {k: camera('CAM-' + k, *v) for k, v in shots.items()}
try:
    for a in bpy.context.screen.areas: pass
except Exception:
    pass
ONLY = argv[3].split(',') if len(argv) > 3 else None
for k, cam in cams.items():
    if ONLY and k not in ONLY: continue
    scene.camera = cam
    scene.render.filepath = os.path.abspath(os.path.join(OUT, f'house_{k}.png'))
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(OUT, 'house.blend')))
print('saved blend')
