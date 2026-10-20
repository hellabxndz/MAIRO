import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
from studio import *

random.seed(3)
s = reset()
size(720, 1280)

def check(name, base, dark, line1, line2, freq=15.0):
    """A woven check: stripes across and along, averaged, with brushed fibres and a twill bump."""
    m = mat(name, rough=0.9)
    b = bsdf(m)
    for k, v in (("Sheen Weight", 0.12), ("Sheen Roughness", 0.5)):
        try: b.inputs[k].default_value = v
        except KeyError: pass
    tc = node(m, "ShaderNodeTexCoord")
    jn = node(m, "ShaderNodeTexNoise"); jn.inputs["Scale"].default_value = 900; jn.inputs["Detail"].default_value = 4
    link(m, tc, "Object", jn, "Vector")
    jc = node(m, "ShaderNodeVectorMath"); jc.operation = "SUBTRACT"; jc.inputs[1].default_value = (0.5, 0.5, 0.5)
    link(m, jn, "Color", jc, 0)
    js = node(m, "ShaderNodeVectorMath"); js.operation = "SCALE"; js.inputs["Scale"].default_value = 0.0035
    link(m, jc, 0, js, 0)
    ja = node(m, "ShaderNodeVectorMath"); ja.operation = "ADD"
    link(m, tc, "Object", ja, 0); link(m, js, 0, ja, 1)
    sep = node(m, "ShaderNodeSeparateXYZ"); link(m, ja, 0, sep, "Vector")
    def stripes(axis):
        mul = node(m, "ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = freq
        link(m, sep, axis, mul, 0)
        fr = node(m, "ShaderNodeMath"); fr.operation = "FRACT"; link(m, mul, 0, fr, 0)
        ramp = node(m, "ShaderNodeValToRGB"); cr = ramp.color_ramp; cr.interpolation = "CONSTANT"
        stops = [(0.0, base), (0.30, dark), (0.40, base), (0.46, dark), (0.74, line1), (0.755, dark), (0.86, line2), (0.872, base)]
        cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
        cr.elements[1].position, cr.elements[1].color = stops[1][0], (*stops[1][1], 1)
        for pos, col in stops[2:]:
            e = cr.elements.new(pos); e.color = (*col, 1)
        link(m, fr, 0, ramp, "Fac")
        return ramp
    sx, sy = stripes("X"), stripes("Y")
    mix = node(m, "ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs[0].default_value = 0.5
    link(m, sx, "Color", mix, 6); link(m, sy, "Color", mix, 7)
    fib(m, tc, mix)
    return m

def fib(m, tc, colour_node, out=2, amount=0.3):
    b = bsdf(m)
    nz = node(m, "ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 300; nz.inputs["Detail"].default_value = 10
    link(m, tc, "Object", nz, "Vector")
    var = node(m, "ShaderNodeMix"); var.data_type = "RGBA"; var.blend_type = "SOFT_LIGHT"; var.inputs[0].default_value = amount
    link(m, colour_node, out, var, 6); link(m, nz, "Color", var, 7)
    link(m, var, 2, b, "Base Color")
    wv = node(m, "ShaderNodeTexWave"); wv.inputs["Scale"].default_value = 500; wv.bands_direction = "DIAGONAL"
    wv.inputs["Distortion"].default_value = 2; link(m, tc, "Object", wv, "Vector")
    ad = node(m, "ShaderNodeMath"); ad.operation = "ADD"; link(m, wv, "Fac", ad, 0); link(m, nz, "Fac", ad, 1)
    bp = node(m, "ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.3; bp.inputs["Distance"].default_value = 0.0004
    link(m, ad, 0, bp, "Height"); link(m, bp, "Normal", b, "Normal")

def heather(name, col):
    m = mat(name, col, rough=0.95)
    tc = node(m, "ShaderNodeTexCoord")
    rgb = node(m, "ShaderNodeRGB"); rgb.outputs[0].default_value = (*col, 1)
    fib(m, tc, rgb, out=0, amount=0.55)
    return m

def soft(o, strength=0.009, scale=0.12):
    t = bpy.data.textures.new("t" + o.name, "CLOUDS"); t.noise_scale = scale
    d = o.modifiers.new("disp", "DISPLACE"); d.texture = t; d.strength = strength; d.texture_coords = "GLOBAL"
    return o

def rounded(name, dims, loc, m, bevel, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object; o.name = name
    o.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2); bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 8
    sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 3
    soft(o)
    for p in o.data.polygons: p.use_smooth = True
    o.rotation_euler.z = rot
    assign(o, m)
    return o

horn = mat("horn", (0.06, 0.045, 0.03), rough=0.3, **{"Coat Weight": 0.5})

def folded_shirt(cx, cy, z, rot, fabric, buttons=horn, collar_fabric=None):
    """One overshirt folded for a shop shelf: front panel up, collar standing at the back."""
    W, D, Hh = 0.30, 0.36, 0.045
    parts = []
    parts.append(rounded("fold", (W, D, Hh), (0, 0, Hh / 2), fabric, 0.02))
    top = Hh
    # placket and buttons down the middle
    parts.append(rounded("placket", (0.04, D - 0.07, 0.006), (0, -0.035, top + 0.001), fabric, 0.002))
    for i in range(5):
        y = 0.105 - i * 0.068
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.0085, depth=0.0035, location=(0, y, top + 0.0055))
        btn = bpy.context.active_object; smooth(btn, bevel=0.0012); assign(btn, buttons); parts.append(btn)
    # two chest pockets with flaps
    for k in (-1, 1):
        parts.append(rounded("pocket", (0.10, 0.11, 0.004), (k * 0.085, 0.03, top), fabric, 0.002))
        parts.append(rounded("flap", (0.106, 0.035, 0.007), (k * 0.085, 0.075, top + 0.002), fabric, 0.003))
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.0065, depth=0.003, location=(k * 0.085, 0.066, top + 0.0068))
        b2 = bpy.context.active_object; smooth(b2, bevel=0.001); assign(b2, buttons); parts.append(b2)
    # collar: a standing band round the back of the neck, its points folded forward
    cf = collar_fabric or fabric
    bm = bmesh.new()
    R, hgt, th = 0.064, 0.022, 0.004
    ring = []
    for i in range(41):
        a = math.radians(-15 + 210 * i / 40)
        ring.append([bm.verts.new((math.cos(a) * (R + d), 0.125 + math.sin(a) * (R + d) * 0.7, top + zz)) for d, zz in ((0, 0), (0, hgt), (th, hgt), (th, 0))])
    for i in range(40):
        for j in range(4):
            bm.faces.new((ring[i][j], ring[i + 1][j], ring[i + 1][(j + 1) % 4], ring[i][(j + 1) % 4]))
    me = bpy.data.meshes.new("collar"); bm.to_mesh(me)
    col = bpy.data.objects.new("collar", me); bpy.context.collection.objects.link(col)
    sub = col.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    for p in me.polygons: p.use_smooth = True
    assign(col, cf); parts.append(col)
    for k in (-1, 1):
        bm = bmesh.new()
        pts = [(0.010 * k, 0.115), (0.072 * k, 0.135), (0.078 * k, 0.055), (0.018 * k, 0.088)]
        vs = [bm.verts.new((x, y, top + 0.006 + 0.02 * max(0, (y - 0.07) / 0.08))) for x, y in pts]
        bm.faces.new(vs if k > 0 else vs[::-1])
        me = bpy.data.meshes.new("pt"); bm.to_mesh(me)
        pt = bpy.data.objects.new("collarpt", me); bpy.context.collection.objects.link(pt)
        so = pt.modifiers.new("so", "SOLIDIFY"); so.thickness = 0.005
        bv = pt.modifiers.new("bv", "BEVEL"); bv.width = 0.002; bv.segments = 3
        sb = pt.modifiers.new("sb", "SUBSURF"); sb.levels = 2; sb.render_levels = 2
        assign(pt, cf); parts.append(pt)
    # a woven brand label inside the collar
    parts.append(rounded("label", (0.045, 0.004, 0.018), (0, 0.125 + 0.064 * 0.7 - 0.006, top + 0.011), mat("lab", (0.42, 0.38, 0.30), 0.8), 0.001))
    holder = bpy.data.objects.new("shirt", None); bpy.context.collection.objects.link(holder)
    for p in parts: p.parent = holder
    holder.location = (cx, cy, z); holder.rotation_euler.z = rot
    return holder

green = check("green", (0.018, 0.048, 0.026), (0.003, 0.004, 0.004), (0.40, 0.33, 0.21), (0.22, 0.035, 0.015))
rust = check("rust", (0.22, 0.05, 0.018), (0.03, 0.010, 0.006), (0.45, 0.36, 0.22), (0.02, 0.03, 0.02), freq=12)
oat = heather("oat", (0.55, 0.47, 0.36))

folded_shirt(0.0, 0.0, 0.0, math.radians(4), rust)
folded_shirt(0.006, -0.004, 0.047, math.radians(-3), oat)
folded_shirt(-0.004, 0.002, 0.094, math.radians(1.5), green)

# a seamless paper sweep, warm stone colour, with a faint paper tooth
paper = mat("paper", (0.40, 0.34, 0.27), rough=0.9)
pn = node(paper, "ShaderNodeTexNoise"); pn.inputs["Scale"].default_value = 220; pn.inputs["Detail"].default_value = 8
pb = node(paper, "ShaderNodeBump"); pb.inputs["Strength"].default_value = 0.05
link(paper, pn, "Fac", pb, "Height"); link(paper, pb, "Normal", bsdf(paper), "Normal")
sweep(paper, width=4, depth=3, height=2.5, radius=0.6, y=0.45)

# window light from the left and behind, a soft bounce from the right
area("window", (-1.6, 0.1, 1.2), (0, 0, 0.1), 170, 1.4, (1.0, 0.93, 0.84), size_y=1.8)
area("bounce", (1.4, -0.9, 0.8), (0, 0, 0.1), 30, 2.0, (0.95, 0.96, 1.0))
world((0.85, 0.88, 0.95), 0.15)

cam = camera((0.14, -1.40, 0.95), (0.0, 0.02, 0.16), lens=75, fstop=3.2)
cam.data.dof.focus_object = None
cam.data.dof.focus_distance = (Vector((0.0, -0.05, 0.14)) - Vector((0.14, -1.40, 0.95))).length
s.view_settings.view_transform = "Standard"
s.view_settings.look = "None"
s.view_settings.exposure = -0.35
render(os.environ.get("NAME", "fashion"))
