import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(900, 900)

rubber = mat("rubberHead", (0.025, 0.025, 0.027), rough=0.55)
chrome = mat("chrome", (0.9, 0.9, 0.92), rough=0.12, metal=1.0)
knurl = mat("knurl", (0.75, 0.75, 0.78), rough=0.35, metal=1.0)
kn = node(knurl, "ShaderNodeTexWave"); kn.inputs["Scale"].default_value = 300; kn.bands_direction = "DIAGONAL"
kb = node(knurl, "ShaderNodeBump"); kb.inputs["Strength"].default_value = 0.6
link(knurl, kn, "Fac", kb, "Height"); link(knurl, kb, "Normal", bsdf(knurl), "Normal")

def hex_head(loc, r, length, rot_z):
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=length, location=loc, rotation=(0, math.pi / 2, rot_z))
    o = bpy.context.active_object
    bv = o.modifiers.new("bv", "BEVEL"); bv.width = r * 0.08; bv.segments = 4
    assign(o, rubber); return o

def dumbbell(cx, cy, rot, r=0.062, head=0.075, bar=0.15):
    c, s_ = math.cos(rot), math.sin(rot)
    for k in (-1, 1):
        d = (bar / 2 + head / 2) * k
        hex_head((cx + c * d, cy + s_ * d, r * math.cos(math.radians(30))), r, head, rot)
        # chrome end caps
        d2 = (bar / 2 + head + 0.003) * k
        cyl("cap", (cx + c * d2, cy + s_ * d2, r * math.cos(math.radians(30))), r * 0.45, 0.006, chrome, rot=(0, math.pi / 2, rot), bevel=0.001)
    cyl("bar", (cx, cy, r * math.cos(math.radians(30))), 0.016, bar + 0.01, knurl, rot=(0, math.pi / 2, rot), verts=48)

dumbbell(0.02, -0.06, math.radians(-8))
dumbbell(0.14, 0.24, math.radians(22), r=0.07, head=0.085)

# a matte steel water bottle
lathe("bottle", [(0.0, 0.0), (0.036, 0.0), (0.038, 0.006), (0.038, 0.20), (0.030, 0.22), (0.022, 0.235), (0.0, 0.235)],
      mat("steel", (0.12, 0.30, 0.42), rough=0.35, metal=0.6), loc=(-0.24, 0.20, 0))
lathe("bcap", [(0.0, 0.234), (0.023, 0.234), (0.023, 0.262), (0.0, 0.262)], mat("capB", (0.03, 0.03, 0.03), rough=0.5), loc=(-0.24, 0.20, 0))

text('NORTHSIDE', (-0.24, 0.20 - 0.0385, 0.12), 0.012, mat('wht', (0.9, 0.9, 0.9), rough=0.5), rot=(math.pi / 2, 0, math.pi / 2 * 0), spacing=1.2)
# rubber gym flooring with flecks
floor = mat("floor", (0.03, 0.03, 0.032), rough=0.8)
fn = node(floor, "ShaderNodeTexVoronoi"); fn.inputs["Scale"].default_value = 220
fr = node(floor, "ShaderNodeValToRGB"); fr.color_ramp.elements[0].position = 0.05
fr.color_ramp.elements[0].color = (0.16, 0.17, 0.18, 1); fr.color_ramp.elements[1].position = 0.08; fr.color_ramp.elements[1].color = (0.025, 0.025, 0.028, 1)
link(floor, fn, "Distance", fr, "Fac"); link(floor, fr, "Color", bsdf(floor), "Base Color")
nb = node(floor, "ShaderNodeTexNoise"); nb.inputs["Scale"].default_value = 500
bp = node(floor, "ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.2
link(floor, nb, "Fac", bp, "Height"); link(floor, bp, "Normal", bsdf(floor), "Normal")
cube("floor", (0, 0, -0.01), (4, 4, 0.02), floor)
# a dark concrete wall far behind, out of focus
cube("wall", (0, 1.4, 1.0), (5, 0.1, 3), stone("concrete", (0.07, 0.075, 0.08), scale=4, contrast=0.4, rough=0.9))

# hard light from a high window on the left, a cool rim from behind
area("key", (-1.2, -0.3, 1.4), (0, 0.1, 0.05), 60, 0.5, (1.0, 0.94, 0.86))
area("rim", (0.9, 1.1, 0.5), (0, 0.1, 0.05), 70, 0.6, (0.60, 0.78, 1.0))
area("glow", (0, 1.3, 1.2), (0, 1.4, 1.2), 30, 2.0, (0.35, 0.6, 1.0))
world((0.6, 0.7, 0.9), 0.02)

cam = camera((0.06, -0.95, 0.36), (0.0, 0.10, 0.10), lens=50, fstop=2.4)
finish(os.environ.get("NAME", "fitness"), exposure=-0.2)
