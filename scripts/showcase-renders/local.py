import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(720, 1280)
chrome = mat("chrome", (0.92, 0.92, 0.94), rough=0.08, metal=1.0)
brushed = mat("braid", (0.75, 0.75, 0.76), rough=0.35, metal=1.0)
bw = node(brushed, "ShaderNodeTexWave"); bw.inputs["Scale"].default_value = 220; bw.bands_direction = "DIAGONAL"
bb = node(brushed, "ShaderNodeBump"); bb.inputs["Strength"].default_value = 0.8
link(brushed, bw, "Fac", bb, "Height"); link(brushed, bb, "Normal", bsdf(brushed), "Normal")
white = stone("cab", (0.78, 0.77, 0.74), scale=30, contrast=0.08, rough=0.45)

# cabinet: back wall, sides, floor; the sink bowl's underside at the top
cube("back", (0, 0.30, 0.40), (0.84, 0.02, 0.80), white)
cube("floorC", (0, 0.0, 0.0), (0.84, 0.62, 0.02), white)
for k in (-1, 1):
    cube("side", (k * 0.43, 0.0, 0.40), (0.02, 0.62, 0.80), white)
cube("top", (0, 0.0, 0.81), (0.88, 0.66, 0.02), mat("counter", (0.10, 0.10, 0.10), rough=0.3))
lathe("bowl", [(0.0, 0.68), (0.045, 0.68), (0.15, 0.73), (0.17, 0.80), (0.0, 0.80)], mat("porcelain", (0.85, 0.85, 0.84), rough=0.15), loc=(0, 0.05, 0))

def pipe_path(name, pts, r, m):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 6
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for p, xyz in zip(sp.points, pts): p.co = (*xyz, 1)
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o); assign(o, m)
    return o

def bend(a, b, c, steps=10):
    """Points along a rounded corner from a through b to c (quadratic)."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        out.append(tuple((1 - t) ** 2 * a[j] + 2 * (1 - t) * t * b[j] + t ** 2 * c[j] for j in range(3)))
    return out

# drain: tailpiece down from the bowl, a J-bend, then the trap arm into the wall
y0 = 0.05
pts = [(0, y0, 0.68), (0, y0, 0.40)] + bend((0, y0, 0.40), (0, y0, 0.30), (0.08, y0, 0.30))[1:] \
      + bend((0.08, y0, 0.30), (0.16, y0, 0.30), (0.16, y0, 0.38))[1:] \
      + bend((0.16, y0, 0.38), (0.16, y0, 0.42), (0.16, 0.12, 0.42))[1:] + [(0.16, 0.29, 0.42)]
pipe_path("drain", pts, 0.019, chrome)
for z in (0.64, 0.40):
    cyl("nut", (0, y0, z), 0.026, 0.022, chrome, verts=48, bevel=0.003)
cyl("flange", (0.16, 0.285, 0.42), 0.04, 0.01, chrome, rot=(math.pi / 2, 0, 0), bevel=0.002)

# hot and cold shut-off valves on the back wall, braided hoses up to the tap
for k, handle_col in ((-1, (0.6, 0.06, 0.04)), (1, (0.08, 0.20, 0.55))):
    x = k * 0.20
    cyl("stub", (x, 0.27, 0.30), 0.012, 0.05, chrome, rot=(math.pi / 2, 0, 0))
    cyl("valve", (x, 0.235, 0.30), 0.02, 0.04, chrome, rot=(math.pi / 2, 0, 0), bevel=0.003)
    cyl("valveUp", (x, 0.235, 0.33), 0.012, 0.05, chrome)
    cube("handle", (x, 0.205, 0.30), (0.045, 0.012, 0.022), mat("h", handle_col, rough=0.4), bevel=0.004)
    hp = bend((x, 0.235, 0.35), (x, 0.20, 0.62), (x * 0.4, 0.10, 0.76), 16)
    pipe_path("hose", hp, 0.006, brushed)

# an adjustable wrench and a folded cloth on the cabinet floor
wrench = mat("wrench", (0.55, 0.56, 0.58), rough=0.3, metal=1.0)
w = cube("wrenchH", (-0.12, -0.12, 0.018), (0.22, 0.03, 0.01), wrench, bevel=0.004); w.rotation_euler.z = math.radians(25)
hd = cyl("wrenchHead", (-0.12 + math.cos(math.radians(25)) * 0.12, -0.12 + math.sin(math.radians(25)) * 0.12, 0.018), 0.03, 0.012, wrench, bevel=0.003)
cube("grip", (-0.12 - math.cos(math.radians(25)) * 0.05, -0.12 - math.sin(math.radians(25)) * 0.05, 0.02), (0.10, 0.034, 0.013), mat("grip", (0.65, 0.08, 0.04), rough=0.6), bevel=0.005).rotation_euler.z = math.radians(25)
cl = cube("cloth", (0.18, -0.16, 0.022), (0.16, 0.12, 0.025), mat("cloth", (0.12, 0.22, 0.38), rough=0.95), bevel=0.01)
cl.rotation_euler.z = math.radians(-10)

# open doors at the edges of the frame
for k in (-1, 1):
    d = cube("door", (k * 0.60, -0.42, 0.40), (0.02, 0.40, 0.78), white, bevel=0.003); d.rotation_euler.z = math.radians(k * 25)

area("torch", (0.18, -0.50, 0.50), (0.04, 0.10, 0.38), 2.2, 0.12, (1.0, 0.93, 0.82))
area("room", (0, -1.4, 0.9), (0, 0.1, 0.4), 7, 1.5, (0.95, 0.97, 1.0))
world((0.9, 0.92, 0.95), 0.03)
cube("roomfloor", (0, -0.6, -0.02), (3, 2, 0.02), stone("tile", (0.30, 0.28, 0.26), scale=6, contrast=0.3, rough=0.4))

cam = camera((0.0, -0.88, 0.40), (0.03, 0.15, 0.40), lens=30, fstop=5.6)
finish(os.environ.get("NAME", "local"), exposure=-0.6)
