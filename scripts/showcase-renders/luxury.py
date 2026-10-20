import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(800, 1000)
s.cycles.max_bounces = 16; s.cycles.transmission_bounces = 16; s.cycles.glossy_bounces = 12
gold = mat("gold", (1.0, 0.76, 0.42), rough=0.12, metal=1.0)
diamond = mat("diamond", (1, 1, 1), rough=0.0, **{"Transmission Weight": 1.0, "IOR": 2.42})

# the band: a torus, a little flattened, standing upright in a velvet slot
bpy.ops.mesh.primitive_torus_add(major_radius=0.0105, minor_radius=0.0016, major_segments=128, minor_segments=32, location=(0, 0, 0.0125), rotation=(math.pi / 2, 0, math.radians(18)))
band = bpy.context.active_object; band.scale = (1, 1, 1.35); smooth(band); assign(band, gold)
# the setting: four claws holding a round brilliant
cx, cy, cz = 0, 0, 0.0125 + 0.0105 + 0.0012
lathe("seat", [(0.0, cz - 0.0012), (0.0016, cz - 0.0012), (0.0028, cz + 0.0012), (0.0, cz + 0.0012)], gold, segs=48)
# a round brilliant: crown and pavilion facets from a low-poly lathe
bm = bmesh.new()
segs = 16
r, crown_h, pav_h, table = 0.0040, 0.0013, 0.0032, 0.55
top_ring = [bm.verts.new((r * table * math.cos(2 * math.pi * i / segs), r * table * math.sin(2 * math.pi * i / segs), cz + 0.0022 + crown_h)) for i in range(segs)]
girdle = [bm.verts.new((r * math.cos(2 * math.pi * (i + 0.5) / segs), r * math.sin(2 * math.pi * (i + 0.5) / segs), cz + 0.0022)) for i in range(segs)]
culet = bm.verts.new((0, 0, cz + 0.0022 - pav_h))
bm.faces.new(top_ring)
for i in range(segs):
    bm.faces.new((top_ring[i], girdle[i], top_ring[(i + 1) % segs]))
    bm.faces.new((girdle[i], girdle[(i + 1) % segs], top_ring[(i + 1) % segs]))
    bm.faces.new((girdle[(i + 1) % segs], girdle[i], culet))
me = bpy.data.meshes.new("stone"); bm.to_mesh(me)
stone_o = bpy.data.objects.new("stone", me); bpy.context.collection.objects.link(stone_o); assign(stone_o, diamond)
for k in range(4):
    a = math.radians(45 + 90 * k)
    x, y = math.cos(a) * 0.0039, math.sin(a) * 0.0039
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.00045, depth=0.0042, location=(x, y, cz + 0.0019))
    claw = bpy.context.active_object; claw.rotation_euler = (-math.sin(a) * 0.25, math.cos(a) * 0.25, 0); smooth(claw); assign(claw, gold)

# black velvet box insert
velvet = mat("velvet", (0.006, 0.009, 0.030), rough=1.0)
for k, v in (("Sheen Weight", 0.10), ("Sheen Roughness", 0.4)):
    try: bsdf(velvet).inputs[k].default_value = v
    except KeyError: pass
try: bsdf(velvet).inputs["Sheen Tint"].default_value = (0.12, 0.13, 0.20, 1)
except Exception: pass
cube("cushionL", (-0.0128, 0, 0.007), (0.025, 0.05, 0.018), velvet, bevel=0.0075)
cube("cushionR", (0.0128, 0, 0.007), (0.025, 0.05, 0.018), velvet, bevel=0.0075)
# the open box: a deep green leather shell
leather = mat("leather", (0.015, 0.03, 0.025), rough=0.45, **{"Coat Weight": 0.2})
ln = node(leather, "ShaderNodeTexVoronoi"); ln.inputs["Scale"].default_value = 900
lb = node(leather, "ShaderNodeBump"); lb.inputs["Strength"].default_value = 0.25
link(leather, ln, "Distance", lb, "Height"); link(leather, lb, "Normal", bsdf(leather), "Normal")
box = cube("box", (0, 0, -0.004), (0.062, 0.062, 0.026), leather, bevel=0.004)
lid = cube("lid", (0, 0.034, 0.024), (0.062, 0.006, 0.058), leather, bevel=0.003)
lid.rotation_euler.x = math.radians(-12)
cube("lidVelvet", (0, 0.0305, 0.024), (0.054, 0.001, 0.050), velvet)

# dark marble underneath, a black void beyond
cube("table", (0, 0, -0.018), (0.6, 0.6, 0.004), stone("marble", (0.03, 0.03, 0.032), scale=12, contrast=0.6, rough=0.15))
world((0, 0, 0), 0.0)
area("spot", (-0.10, -0.12, 0.25), (0, 0, 0.02), 1.6, 0.03, (1.0, 0.93, 0.82))
area("spark1", (0.05, -0.15, 0.12), (0, 0, 0.025), 0.25, 0.006)
area("spark2", (-0.06, -0.10, 0.16), (0, 0, 0.025), 0.25, 0.006)
area("strip", (0.14, -0.04, 0.10), (0, 0, 0.02), 0.7, 0.02, (1.0, 0.95, 0.9), size_y=0.2)
area("top", (0, 0, 0.30), (0, 0, 0.02), 0.5, 0.15)

cam = camera((0.0, -0.17, 0.075), (0.0, 0.0, 0.020), lens=100, fstop=5.6)
finish(os.environ.get("NAME", "luxury"), exposure=-1.3)
