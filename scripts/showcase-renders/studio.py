"""Shared helpers for the showcase product renders."""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = int(os.environ.get("SAMPLES", "96"))
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    s.cycles.max_bounces = 8
    s.render.film_transparent = False
    s.view_settings.view_transform = "AgX"
    try:
        s.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    s.world = bpy.data.worlds.new("w")
    s.world.use_nodes = True
    return s

def size(w, h, pct=100):
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y = w, h
    s.render.resolution_percentage = int(os.environ.get("PCT", pct))

def world(color=(1, 1, 1), strength=0.3):
    bg = bpy.context.scene.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength

def mat(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m

def assign(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)
    return obj

def smooth(obj, bevel=0.0, segments=3, subsurf=0):
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    if subsurf:
        mod = obj.modifiers.new("sub", "SUBSURF")
        mod.levels = subsurf
        mod.render_levels = subsurf
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj

def cube(name, loc, dims, m=None, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        smooth(o, bevel=bevel)
    if m:
        assign(o, m)
    return o

def cyl(name, loc, r, depth, m=None, verts=64, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    smooth(o, bevel=bevel)
    if m:
        assign(o, m)
    return o

def area(name, loc, target, power, size_=1.0, color=(1, 1, 1), shape="RECTANGLE", size_y=None):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = power
    d.color = color
    d.shape = shape
    d.size = size_
    if size_y:
        d.size_y = size_y
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    look(o, target)
    return o

def sun(angle_deg=(45, 0, 30), power=3.0, soft=3.0, color=(1, 0.96, 0.9)):
    d = bpy.data.lights.new("sun", "SUN")
    d.energy = power
    d.angle = math.radians(soft)
    d.color = color
    o = bpy.data.objects.new("sun", d)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = [math.radians(a) for a in angle_deg]
    return o

def look(o, target):
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

def camera(loc, target, lens=85, fstop=None, focus=None):
    d = bpy.data.cameras.new("cam")
    d.lens = lens
    if fstop:
        d.dof.use_dof = True
        d.dof.aperture_fstop = fstop
        d.dof.focus_distance = focus if focus else (Vector(target) - Vector(loc)).length
    o = bpy.data.objects.new("cam", d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    look(o, target)
    bpy.context.scene.camera = o
    return o

def sweep(m, width=8, depth=6, height=4, radius=1.2, y=1.5):
    """A seamless studio backdrop: floor curving up into a wall behind."""
    bm = bmesh.new()
    pts = []
    for i in range(0, 21):
        t = i / 20
        if t < 0.5:
            pts.append((-depth + (y + depth) * (t / 0.5), 0))
        else:
            a = (t - 0.5) / 0.5 * (math.pi / 2)
            pts.append((y + radius * math.sin(a), radius - radius * math.cos(a)))
    pts.append((y + radius, height))
    rows = []
    for x in (-width / 2, width / 2):
        rows.append([bm.verts.new((x, py, pz)) for py, pz in pts])
    for i in range(len(pts) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    me = bpy.data.meshes.new("sweep")
    bm.to_mesh(me)
    o = bpy.data.objects.new("sweep", me)
    bpy.context.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    assign(o, m)
    return o

def node(m, kind, **inputs):
    n = m.node_tree.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n

def link(m, a, out, b, inp):
    m.node_tree.links.new(a.outputs[out], b.inputs[inp])

def bsdf(m):
    return m.node_tree.nodes["Principled BSDF"]

def render(name):
    s = bpy.context.scene
    path = os.path.join(OUT, name + ".png")
    s.render.filepath = path
    s.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return path
