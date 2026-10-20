import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

random.seed(4)
s = reset(); size(800, 1000)

# a dark walnut desk with a navy felt mat
cube("desk", (0, 0.1, -0.02), (1.6, 1.0, 0.04), stone("walnut", (0.06, 0.035, 0.02), scale=2.5, contrast=0.45, rough=0.35))
cube("mat", (0, 0.02, 0.001), (0.62, 0.40, 0.003), mat("felt", (0.02, 0.035, 0.07), rough=1.0), bevel=0.001)

# a printed statement, slightly turned: lines of text as fine grey bars, a blue chart block
paper = mat("paper", (0.82, 0.81, 0.78), rough=0.85)
doc = cube("doc", (-0.07, 0.03, 0.0035), (0.21, 0.297, 0.0006), paper)
doc.rotation_euler.z = math.radians(-6)
ink = mat("ink", (0.12, 0.12, 0.14), rough=0.7)
blue = mat("blueInk", (0.10, 0.25, 0.65), rough=0.6)
grp = bpy.data.objects.new("lines", None); bpy.context.collection.objects.link(grp)
y = 0.12
for i in range(16):
    w = 0.16 if i % 5 else 0.08
    if i in (3, 4, 5, 6):
        y -= 0.011; continue
    b = cube("ln", (-0.08 + w / 2 - 0.08 + 0.08, y, 0.0040), (w * (0.7 + random.random() * 0.3), 0.0035, 0.0002), ink); b.parent = grp
    if i % 3 == 0:
        c = cube("num", (0.07, y, 0.0040), (0.03, 0.0035, 0.0002), ink); c.parent = grp
    y -= 0.014
for i, h in enumerate((0.012, 0.020, 0.016, 0.026, 0.032)):
    b = cube("bar", (-0.06 + i * 0.02, 0.06 + h / 2 - 0.015, 0.0040), (0.012, h, 0.0002), blue); b.parent = grp
t = cube("title", (-0.11 + 0.04, 0.135, 0.0040), (0.08, 0.008, 0.0002), mat("navy", (0.03, 0.06, 0.15), rough=0.7)); t.parent = grp
grp.location = (-0.07, 0.03, 0); grp.rotation_euler.z = math.radians(-6)
for o in grp.children:
    o.location.x -= 0.0; o.location.y -= 0.0

# a calculator
body = cube("calc", (0.16, 0.05, 0.008), (0.09, 0.14, 0.014), mat("calcB", (0.05, 0.05, 0.055), rough=0.5), bevel=0.004)
body.rotation_euler.z = math.radians(10)
cg = bpy.data.objects.new("cg", None); bpy.context.collection.objects.link(cg)
scr = cube("screen", (0, 0.045, 0.0155), (0.07, 0.025, 0.001), mat("lcd", (0.30, 0.34, 0.30), rough=0.2)); scr.parent = cg
keym = mat("key", (0.75, 0.75, 0.73), rough=0.45); acc = mat("acc", (0.15, 0.35, 0.85), rough=0.45)
for r in range(5):
    for c in range(4):
        k = cube("k", (-0.026 + c * 0.0175, 0.018 - r * 0.0155, 0.0158), (0.013, 0.011, 0.003), acc if (c == 3 and r > 1) else keym, bevel=0.0012); k.parent = cg
cg.location = (0.16, 0.05, 0); cg.rotation_euler.z = math.radians(10)

# a gold fountain pen across the corner of the page
gold = mat("gold", (0.95, 0.75, 0.42), rough=0.2, metal=1.0)
pen = lathe("pen", [(0.0, 0.0), (0.004, 0.006), (0.0055, 0.03), (0.0058, 0.12), (0.005, 0.135), (0.0, 0.14)], mat("lacquer", (0.01, 0.015, 0.03), rough=0.1, **{"Coat Weight": 1.0}), segs=48)
cyl("band", (0, 0, 0.09), 0.0062, 0.006, gold, verts=48).parent = pen
cyl("clipb", (0, 0, 0.135), 0.0052, 0.004, gold, verts=48).parent = pen
pen.location = (0.03, -0.11, 0.0095); pen.rotation_euler = (0, math.pi / 2, math.radians(28))

# a coffee in a navy cup at the top right, out of focus
lathe("cup", [(0.0, 0.0), (0.03, 0.0), (0.04, 0.07), (0.037, 0.072), (0.028, 0.006), (0.0, 0.006)], mat("cupM", (0.05, 0.08, 0.18), rough=0.3, **{"Coat Weight": 0.6}), loc=(0.20, 0.26, 0.0))
cyl("coffee", (0.20, 0.26, 0.062), 0.034, 0.002, mat("cof", (0.04, 0.02, 0.01), rough=0.05), verts=64)

area("lamp", (-0.35, 0.25, 0.55), (0, 0.02, 0.0), 9, 0.35, (1.0, 0.88, 0.70))
area("window", (0.6, -0.4, 0.6), (0, 0.02, 0.0), 6, 1.0, (0.80, 0.88, 1.0))
area("bg", (0, 0.9, 0.5), (0, 0.6, 0.0), 2, 1.0, (0.4, 0.55, 1.0))
world((0.3, 0.4, 0.6), 0.03)

cam = camera((0.02, -0.52, 0.42), (0.03, 0.06, 0.0), lens=55, fstop=3.5)
cam.data.dof.focus_distance = (Vector((0.0, 0.0, 0.0)) - Vector((0.02, -0.52, 0.42))).length
finish(os.environ.get("NAME", "services"), exposure=-0.6)
