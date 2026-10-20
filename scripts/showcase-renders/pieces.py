"""Reusable pieces: glazed stoneware, mugs, upholstery."""
import math
from kit import *

def glaze(name, top, bottom, split=0.55, speck=True):
    """Stoneware dipped in glaze: one colour above the line, raw clay below, speckled."""
    m = mat(name, rough=0.25, **{"Coat Weight": 0.5, "Coat Roughness": 0.15})
    b = bsdf(m)
    tc = node(m, "ShaderNodeTexCoord")
    sep = node(m, "ShaderNodeSeparateXYZ"); link(m, tc, "Generated", sep, "Vector")
    nz = node(m, "ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6; link(m, tc, "Object", nz, "Vector")
    wob = node(m, "ShaderNodeMath"); wob.operation = "MULTIPLY_ADD"; wob.inputs[1].default_value = 0.06; wob.inputs[2].default_value = -0.03
    link(m, nz, "Fac", wob, 0)
    zz = node(m, "ShaderNodeMath"); zz.operation = "ADD"; link(m, sep, "Z", zz, 0); link(m, wob, 0, zz, 1)
    ramp = node(m, "ShaderNodeValToRGB"); cr = ramp.color_ramp; cr.interpolation = "EASE"
    cr.elements[0].position = split - 0.01; cr.elements[0].color = (*bottom, 1)
    cr.elements[1].position = split + 0.01; cr.elements[1].color = (*top, 1)
    link(m, zz, 0, ramp, "Fac")
    rr = node(m, "ShaderNodeMapRange"); rr.inputs["From Min"].default_value = split - 0.01; rr.inputs["From Max"].default_value = split + 0.01
    rr.inputs["To Min"].default_value = 0.75; rr.inputs["To Max"].default_value = 0.18
    link(m, zz, 0, rr, "Value"); link(m, rr, "Result", b, "Roughness")
    if speck:
        vo = node(m, "ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 900; link(m, tc, "Object", vo, "Vector")
        sr = node(m, "ShaderNodeValToRGB"); sr.color_ramp.elements[0].position = 0.04; sr.color_ramp.elements[0].color = (0.05, 0.04, 0.03, 1)
        sr.color_ramp.elements[1].position = 0.07; sr.color_ramp.elements[1].color = (1, 1, 1, 1)
        link(m, vo, "Distance", sr, "Fac")
        mx = node(m, "ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
        link(m, ramp, "Color", mx, 6); link(m, sr, "Color", mx, 7); link(m, mx, 2, b, "Base Color")
    else:
        link(m, ramp, "Color", b, "Base Color")
    return m

def mug(x, y, m, h=0.095, r=0.042, rot=0.0):
    prof = [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.004), (r + 0.002, h * 0.5), (r + 0.001, h - 0.003), (r - 0.002, h),
            (r - 0.006, h - 0.002), (r - 0.007, 0.012), (0.0, 0.010)]
    o = lathe("mug", prof, m, loc=(x, y, 0))
    bpy.ops.mesh.primitive_torus_add(location=(x + math.cos(rot) * (r + 0.009), y + math.sin(rot) * (r + 0.009), h * 0.52),
                                     major_radius=0.022, minor_radius=0.0065, rotation=(math.pi / 2, 0, rot + math.pi / 2))
    hd = bpy.context.active_object; hd.scale = (0.8, 1.15, 1); smooth(hd); assign(hd, m)
    return o


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

