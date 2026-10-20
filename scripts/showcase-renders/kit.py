"""Building blocks shared by the product scenes."""
import bpy, bmesh, math
from mathutils import Vector
from studio import *

def lathe(name, profile, m=None, segs=96, loc=(0, 0, 0), sub=1):
    """A turned object from a (radius, height) profile, bottom to top."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    # close top and bottom if they reach the axis
    me = bpy.data.meshes.new(name); bm.to_mesh(me)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc
    for p in me.polygons: p.use_smooth = True
    if sub:
        sm = o.modifiers.new("sub", "SUBSURF"); sm.levels = sub; sm.render_levels = sub
    if m: assign(o, m)
    return o

def glass(name, color=(1, 1, 1), rough=0.02, ior=1.45):
    return mat(name, color, rough=rough, **{"Transmission Weight": 1.0, "IOR": ior})

def paper_sweep(color, **kw):
    paper = mat("paper", color, rough=0.9)
    pn = node(paper, "ShaderNodeTexNoise"); pn.inputs["Scale"].default_value = 220; pn.inputs["Detail"].default_value = 8
    pb = node(paper, "ShaderNodeBump"); pb.inputs["Strength"].default_value = 0.04
    link(paper, pn, "Fac", pb, "Height"); link(paper, pb, "Normal", bsdf(paper), "Normal")
    return sweep(paper, **kw)

def stone(name, color, scale=18, contrast=0.25, rough=0.6):
    m = mat(name, color, rough=rough)
    tc = node(m, "ShaderNodeTexCoord")
    nz = node(m, "ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 12
    nz.inputs["Distortion"].default_value = 1.5
    link(m, tc, "Object", nz, "Vector")
    rgb = node(m, "ShaderNodeRGB"); rgb.outputs[0].default_value = (*color, 1)
    mx = node(m, "ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "SOFT_LIGHT"; mx.inputs[0].default_value = contrast
    link(m, rgb, 0, mx, 6); link(m, nz, "Color", mx, 7); link(m, mx, 2, bsdf(m), "Base Color")
    pn = node(m, "ShaderNodeTexNoise"); pn.inputs["Scale"].default_value = 400
    bp = node(m, "ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.08
    link(m, pn, "Fac", bp, "Height"); link(m, bp, "Normal", bsdf(m), "Normal")
    return m

def finish(name, exposure=-0.3):
    s = bpy.context.scene
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.view_settings.exposure = exposure
    return render(name)

def text(body, loc, size_, m, rot=(math.pi / 2, 0, 0), extrude=0.0002, align="CENTER", spacing=1.0):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.active_object
    t.data.body = body; t.data.size = size_; t.data.extrude = extrude
    t.data.align_x = align; t.data.align_y = "CENTER"; t.data.space_character = spacing
    assign(t, m)
    return t
