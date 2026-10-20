import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(720, 1280)

def fabric(name, col, scale=900):
    m = mat(name, col, rough=0.95)
    for k, v in (("Sheen Weight", 0.25), ("Sheen Roughness", 0.5)):
        try: bsdf(m).inputs[k].default_value = v
        except KeyError: pass
    tc = node(m, "ShaderNodeTexCoord")
    nz = node(m, "ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 6
    link(m, tc, "Object", nz, "Vector")
    rgb = node(m, "ShaderNodeRGB"); rgb.outputs[0].default_value = (*col, 1)
    mx = node(m, "ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "SOFT_LIGHT"; mx.inputs[0].default_value = 0.35
    link(m, rgb, 0, mx, 6); link(m, nz, "Color", mx, 7); link(m, mx, 2, bsdf(m), "Base Color")
    bp = node(m, "ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.35
    link(m, nz, "Fac", bp, "Height"); link(m, bp, "Normal", bsdf(m), "Normal")
    return m

def cushion(name, loc, dims, m, bevel, puff=0.012):
    o = cube(name, loc, dims, m)
    bv = o.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 8
    sb = o.modifiers.new("sb", "SUBSURF"); sb.levels = 2; sb.render_levels = 2
    t = bpy.data.textures.new("t" + name, "CLOUDS"); t.noise_scale = 0.25
    d = o.modifiers.new("d", "DISPLACE"); d.texture = t; d.strength = puff; d.texture_coords = "GLOBAL"
    for p in o.data.polygons: p.use_smooth = True
    return o

sage = fabric("sage", (0.22, 0.28, 0.21))
oak = mat("legs", (0.30, 0.19, 0.10), rough=0.4)
W = 1.75
cushion("base", (0, 0, 0.26), (W, 0.92, 0.22), sage, 0.06, 0.006)
for k in (-1, 1):
    cushion("arm", (k * (W / 2 - 0.10), 0.0, 0.43), (0.22, 0.92, 0.42), sage, 0.09, 0.008)
cushion("back", (0, 0.36, 0.60), (W - 0.36, 0.22, 0.50), sage, 0.09, 0.012)
for i in range(2):
    x = -0.33 + i * 0.66
    cushion("seat", (x, -0.04, 0.43), (0.655, 0.74, 0.16), sage, 0.07, 0.014)
    cushion("backc", (x, 0.20, 0.70), (0.64, 0.20, 0.46), sage, 0.09, 0.018).rotation_euler.x = math.radians(-10)
for kx in (-1, 1):
    for ky in (-1, 1):
        cyl("leg", (kx * (W / 2 - 0.08), ky * 0.36, 0.075), 0.022, 0.15, oak, verts=32, bevel=0.003)
# a rust throw pillow
cushion("pillow", (0.52, 0.06, 0.62), (0.42, 0.14, 0.40), fabric("rustP", (0.40, 0.12, 0.05)), 0.12, 0.02).rotation_euler = (math.radians(-12), 0, math.radians(-12))

# side table with a vase and a book
table = mat("table", (0.30, 0.19, 0.10), rough=0.35)
cyl("top", (1.20, 0.05, 0.52), 0.24, 0.035, table, verts=96, bevel=0.006)
cyl("stem", (1.20, 0.05, 0.26), 0.035, 0.5, table, verts=48)
cyl("foot", (1.20, 0.05, 0.015), 0.16, 0.03, table, verts=96, bevel=0.005)
lathe("vase", [(0.0, 0.0), (0.05, 0.0), (0.075, 0.08), (0.06, 0.18), (0.03, 0.24), (0.035, 0.26), (0.0, 0.26)],
      mat("vase", (0.72, 0.68, 0.60), rough=0.6), loc=(1.18, 0.10, 0.5375))
cube("book", (1.16, -0.06, 0.555), (0.20, 0.14, 0.03), mat("book", (0.12, 0.17, 0.22), rough=0.7), bevel=0.003).rotation_euler.z = 0.3

# a cream wool rug on a pale polished concrete floor; warm plaster wall
cube("floor", (0, 0, -0.01), (8, 8, 0.02), stone("conc", (0.55, 0.52, 0.48), scale=3, contrast=0.25, rough=0.3))
rug = fabric("rug", (0.70, 0.66, 0.58), scale=400)
cushion("rug", (0, -0.4, 0.004), (3.2, 2.2, 0.012), rug, 0.004, 0.002)
cube("wall", (0, 0.85, 2.5), (8, 0.05, 5.0), stone("plaster", (0.74, 0.70, 0.64), scale=10, contrast=0.12, rough=0.95))

# group the furniture and turn it a little, as a photographer would
grp = bpy.data.objects.new("grp", None); bpy.context.collection.objects.link(grp)
for o in list(bpy.data.objects):
    if o.name.split(".")[0] in ("base", "arm", "back", "seat", "backc", "leg", "pillow", "top", "stem", "foot", "vase", "book"):
        o.parent = grp
grp.rotation_euler.z = math.radians(-18); grp.location = (-0.15, 0.1, 0)
sn = sun((58, 0, -32), power=6.0, soft=1.2, color=(1.0, 0.88, 0.72))
# a window frame the sun shines through, out of shot: a lit patch with mullions on the wall
from mathutils import Vector, Matrix
d = (sn.rotation_euler.to_matrix() @ Vector((0, 0, -1))).normalized()
centre = Vector((-0.35, 0.80, 1.55)) - d * 2.2
frame = bpy.data.objects.new("frame", None); bpy.context.collection.objects.link(frame)
blk = mat("blk", (0, 0, 0), rough=1)
for (x, y, w, h) in ((0, 1.6, 6, 2.4), (0, -1.6, 6, 2.4), (1.7, 0, 2.4, 1.0), (-1.7, 0, 2.4, 1.0), (0, 0, 0.05, 1.0), (0, 0.15, 1.0, 0.05)):
    b = cube("blocker", (x, y, 0), (w, h, 0.02), blk); b.parent = frame; b.visible_camera = False
frame.location = centre
frame.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
area("fill", (1.5, -3.5, 1.6), (0, 0.2, 0.6), 260, 3.5, (0.95, 0.95, 1.0))
area("fill2", (-2.0, -3.0, 2.4), (0, 0.4, 1.0), 160, 3.0, (1.0, 0.96, 0.9))
world((0.95, 0.93, 0.9), 0.6)

cam = camera((0.10, -4.6, 1.25), (0.05, 0.0, 0.95), lens=40, fstop=8)
finish(os.environ.get("NAME", "furniture"), exposure=-1.1)
