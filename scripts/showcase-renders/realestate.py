import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(900, 900)
brass = mat("brass", (0.88, 0.70, 0.40), rough=0.22, metal=1.0)
nickel = mat("nickel", (0.80, 0.80, 0.80), rough=0.2, metal=1.0)

def flat(name, pts, thick, m, loc, rot, bevel=0.0006, hole=None):
    bm = bmesh.new(); vs = [bm.verts.new((x, y, 0)) for x, y in pts]; bm.faces.new(vs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    so = o.modifiers.new("so", "SOLIDIFY"); so.thickness = thick; so.offset = 1
    if hole:
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=hole[2], depth=0.05, location=(hole[0], hole[1], 0))
        c = bpy.context.active_object; c.hide_render = True; c.hide_viewport = True
        bo = o.modifiers.new("bo", "BOOLEAN"); bo.object = c; bo.operation = "DIFFERENCE"
        c.parent = o
    bv = o.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 2; bv.limit_method = "ANGLE"
    o.location = loc; o.rotation_euler = rot
    for p in me.polygons: p.use_smooth = False
    assign(o, m)
    return o

def key(loc, rot_z, m):
    pts = []
    for i in range(48):  # round bow
        a = math.radians(20 + 320 * i / 47)
        pts.append((-0.012 + math.cos(a) * 0.012, math.sin(a) * 0.012))
    # blade with cut teeth
    teeth = [(0.0, 0.004), (0.004, 0.004), (0.006, 0.0005), (0.008, 0.004), (0.011, 0.0015), (0.014, 0.004), (0.017, 0.0005), (0.020, 0.004), (0.026, 0.004), (0.030, 0.0)]
    blade = [(x, -0.004 + y * 0) for x, y in []]
    top = [(0.0, 0.0045), (0.030, 0.0045), (0.034, 0.0015)]
    bottom = [(0.034, -0.0015)] + [(0.030 - x, -0.0045 + (0.0045 - y)) for x, y in [(0.0, 0.004), (0.004, 0.0045), (0.007, 0.001), (0.010, 0.0045), (0.013, 0.002), (0.016, 0.0045), (0.019, 0.001), (0.022, 0.0045), (0.030, 0.0045)]]
    outline = top + bottom + list(reversed(pts))
    return flat("key", outline, 0.0022, m, loc, (0, 0, rot_z), hole=(-0.016, 0.0, 0.0035))

key((0.03, 0.01, 0.0005), math.radians(-30), brass)
key((0.034, -0.004, 0.0028), math.radians(-62), nickel)
bpy.ops.mesh.primitive_torus_add(location=(0.02, 0.022, 0.0016), major_radius=0.012, minor_radius=0.0009, rotation=(0, math.radians(8), 0))
smooth(bpy.context.active_object); assign(bpy.context.active_object, nickel)

# a little wooden house tag on the ring
wood = stone("beech", (0.55, 0.38, 0.22), scale=40, contrast=0.3, rough=0.55)
house = [(-0.018, -0.02), (0.018, -0.02), (0.018, 0.006), (0.0, 0.022), (-0.018, 0.006)]
flat("tag", house, 0.005, wood, (-0.015, 0.035, 0.0005), (0, 0, math.radians(18)), bevel=0.0012, hole=(0.0, 0.012, 0.0022))
text("C", (-0.015 + 0.0, 0.035 - 0.004, 0.0056), 0.014, mat("burn", (0.12, 0.07, 0.04), rough=0.8), rot=(0, 0, math.radians(18)))

# a small terracotta pot of rosemary behind, out of focus
lathe("pot", [(0.0, 0.0), (0.028, 0.0), (0.036, 0.060), (0.040, 0.060), (0.040, 0.068), (0.0, 0.068)], mat("terra", (0.50, 0.22, 0.12), rough=0.85), loc=(0.11, 0.16, 0))
for i in range(26):
    a = i * 2.4
    r = 0.004 + (i % 5) * 0.004
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.0018, depth=0.07 + (i % 4) * 0.015,
                                        location=(0.11 + math.cos(a) * r, 0.16 + math.sin(a) * r, 0.10 + (i % 3) * 0.01),
                                        rotation=(math.cos(a) * 0.3, math.sin(a) * 0.3, 0))
    assign(bpy.context.active_object, mat("herb", (0.10, 0.18, 0.08), rough=0.6))

# pale marble tabletop, bright room
cube("table", (0, 0.1, -0.01), (1.2, 1.0, 0.02), stone("marble", (0.80, 0.79, 0.76), scale=5, contrast=0.12, rough=0.18))
cube("wall", (0, 0.55, 0.5), (2, 0.05, 1.2), stone("wallW", (0.78, 0.76, 0.72), scale=10, contrast=0.05, rough=0.9))
area("window", (-0.6, 0.2, 0.5), (0, 0.02, 0.0), 22, 0.5, (1.0, 0.95, 0.88))
area("fill", (0.6, -0.6, 0.6), (0, 0.02, 0.0), 8, 1.2)
world((0.92, 0.94, 1.0), 0.25)

cam = camera((0.03, -0.21, 0.15), (0.01, 0.035, 0.0), lens=70, fstop=3.2)
cam.data.dof.focus_distance = (Vector((0.02, 0.01, 0.0)) - Vector((0.03, -0.21, 0.15))).length
finish(os.environ.get("NAME", "realestate"), exposure=-1.5)
