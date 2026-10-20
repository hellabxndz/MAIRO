import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(800, 1000)

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

clay = (0.55, 0.42, 0.30)
mug(-0.06, 0.03, glaze("sage", (0.36, 0.45, 0.36), clay), rot=math.radians(200))
mug(0.06, 0.09, glaze("cream", (0.80, 0.76, 0.66), clay, split=0.62), h=0.085, r=0.040, rot=math.radians(-30))
# a small bowl in front
lathe("bowl", [(0.0, 0.0), (0.025, 0.0), (0.03, 0.004), (0.055, 0.035), (0.058, 0.040), (0.053, 0.040), (0.026, 0.010), (0.0, 0.009)],
      glaze("rust", (0.42, 0.13, 0.05), clay, split=0.35), loc=(0.02, -0.11, 0))

# a kraft gift box tied with twine, behind left
kraft = mat("kraft", (0.42, 0.28, 0.16), rough=0.8)
kn = node(kraft, "ShaderNodeTexNoise"); kn.inputs["Scale"].default_value = 250; kn.inputs["Detail"].default_value = 10
kb = node(kraft, "ShaderNodeBump"); kb.inputs["Strength"].default_value = 0.1
link(kraft, kn, "Fac", kb, "Height"); link(kraft, kb, "Normal", bsdf(kraft), "Normal")
gb = cube("gift", (-0.15, 0.20, 0.05), (0.15, 0.15, 0.10), kraft, bevel=0.002); gb.rotation_euler.z = math.radians(12)
twine = mat("twine", (0.75, 0.68, 0.55), rough=0.9)
for ang in (12, 102):
    t = cube("tw", (-0.15, 0.20, 0.05), (0.1525, 0.004, 0.1025), twine); t.rotation_euler.z = math.radians(ang)
bpy.ops.mesh.primitive_torus_add(location=(-0.15, 0.20, 0.103), major_radius=0.014, minor_radius=0.002, rotation=(math.pi / 2, 0, math.radians(30)))
smooth(bpy.context.active_object); assign(bpy.context.active_object, twine)
bpy.ops.mesh.primitive_torus_add(location=(-0.15, 0.20, 0.103), major_radius=0.014, minor_radius=0.002, rotation=(math.pi / 2, 0, math.radians(-40)))
smooth(bpy.context.active_object); assign(bpy.context.active_object, twine)

# walnut table, plaster wall
walnut = stone("walnut", (0.14, 0.08, 0.045), scale=3, contrast=0.4, rough=0.35)
cube("table", (0, 0.2, -0.015), (1.6, 1.2, 0.03), walnut, bevel=0.003)
cube("wall", (0, 0.65, 0.6), (3, 0.05, 1.4), stone("plaster", (0.55, 0.48, 0.40), scale=20, contrast=0.2, rough=0.95))

area("window", (-0.9, 0.0, 0.7), (0, 0.05, 0.05), 45, 0.6, (1.0, 0.88, 0.72), size_y=0.9)
area("fill", (0.8, -0.8, 0.5), (0, 0.05, 0.05), 6, 1.2, (0.9, 0.93, 1.0))
world((0.9, 0.85, 0.8), 0.04)

cam = camera((0.04, -0.72, 0.34), (0.0, 0.05, 0.045), lens=60, fstop=3.2)
finish(os.environ.get("NAME", "online"), exposure=-0.3)
