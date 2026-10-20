"""The three example businesses' pictures (4:3): SCENE=shop-demo, shop-problem, shop-offer,
service-demo, service-problem, service-offer, salon-demo, salon-problem, salon-offer."""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from pieces import *

SCENE = os.environ.get("SCENE", "shop-demo")
s = reset(); size(1200, 900)
random.seed(5)
clay = (0.55, 0.42, 0.30)
sage = (0.36, 0.45, 0.36)   # Fernleaf's green glaze (#3f6b4f family)
walnut = lambda: stone("walnut", (0.16, 0.09, 0.05), scale=3, contrast=0.4, rough=0.35)
plaster = lambda c=(0.62, 0.55, 0.45): stone("plaster", c, scale=14, contrast=0.15, rough=0.95)

def coffee_in(x, y, h, r):
    cyl("coffee", (x, y, h - 0.012), r - 0.0075, 0.002, mat("cof", (0.05, 0.025, 0.012), rough=0.04), verts=96)
    crema = cyl("crema", (x, y, h - 0.0108), r - 0.016, 0.0004, mat("crema", (0.35, 0.20, 0.10), rough=0.3), verts=96)

if SCENE == "shop-demo":
    mug(0.0, 0.0, glaze("sage", sage, clay), rot=math.radians(205)); coffee_in(0.0, 0.0, 0.095, 0.042)
    cube("table", (0, 0.2, -0.015), (1.6, 1.2, 0.03), walnut(), bevel=0.003)
    cube("wall", (0, 0.55, 0.6), (3, 0.05, 1.4), plaster())
    # a linen napkin and a few coffee beans
    cube("napkin", (0.14, -0.04, 0.002), (0.16, 0.14, 0.004), fabric("linen", (0.66, 0.60, 0.50)), bevel=0.003).rotation_euler.z = 0.4
    for i in range(7):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.006, location=(-0.11 + random.random() * 0.06, -0.06 + random.random() * 0.05, 0.004))
        o = bpy.context.active_object; o.scale = (1, 0.7, 0.55); smooth(o); assign(o, mat("bean", (0.10, 0.05, 0.025), rough=0.4))
    area("window", (-0.9, 0.0, 0.6), (0, 0.0, 0.05), 40, 0.6, (1.0, 0.88, 0.72), size_y=0.9)
    area("fill", (0.8, -0.8, 0.5), (0, 0.0, 0.05), 6, 1.2, (0.9, 0.93, 1.0))
    world((0.9, 0.85, 0.8), 0.04)
    camera((0.05, -0.50, 0.20), (0.0, 0.0, 0.055), lens=60, fstop=2.8); exp = -0.3

elif SCENE == "shop-problem":
    # two sturdy mugs on an open oak shelf against a plaster wall
    shelf = stone("oakShelf", (0.42, 0.28, 0.16), scale=4, contrast=0.35, rough=0.5)
    cube("shelf", (0, 0.05, -0.012), (0.9, 0.24, 0.024), shelf, bevel=0.002)
    cube("wall", (0, 0.17, 0.3), (2, 0.02, 1.2), plaster((0.70, 0.66, 0.60)))
    mug(-0.07, 0.04, glaze("sage", sage, clay), rot=math.radians(200))
    mug(0.07, 0.06, glaze("cream", (0.80, 0.76, 0.66), clay, split=0.6), h=0.09, r=0.041, rot=math.radians(-25))
    lathe("jug", [(0.0, 0.0), (0.03, 0.0), (0.04, 0.05), (0.032, 0.11), (0.026, 0.13), (0.03, 0.14), (0.0, 0.14)], glaze("rust", (0.42, 0.13, 0.05), clay, split=0.4), loc=(0.22, 0.09, 0))
    # bracket under the shelf
    for x in (-0.3, 0.3):
        cube("br", (x, 0.15, -0.05), (0.02, 0.02, 0.08), mat("iron", (0.03, 0.03, 0.03), rough=0.5))
    area("window", (-0.8, -0.4, 0.6), (0, 0.05, 0.05), 28, 0.6, (1.0, 0.9, 0.76), size_y=0.9)
    area("fill", (0.8, -0.8, 0.3), (0, 0.05, 0.05), 5, 1.2, (0.9, 0.93, 1.0))
    world((0.9, 0.85, 0.8), 0.05)
    camera((0.03, -0.60, 0.12), (0.03, 0.05, 0.06), lens=55, fstop=4); exp = -0.3

elif SCENE == "shop-offer":
    # an open kraft gift box with two mugs nested in tissue, a tag on twine
    kraft = mat("kraft", (0.42, 0.28, 0.16), rough=0.8)
    kn = node(kraft, "ShaderNodeTexNoise"); kn.inputs["Scale"].default_value = 250
    kb = node(kraft, "ShaderNodeBump"); kb.inputs["Strength"].default_value = 0.1
    link(kraft, kn, "Fac", kb, "Height"); link(kraft, kb, "Normal", bsdf(kraft), "Normal")
    W, D, H, t = 0.24, 0.16, 0.07, 0.004
    cube("bottom", (0, 0, t / 2), (W, D, t), kraft)
    for k in (-1, 1):
        cube("wallx", (k * (W / 2 - t / 2), 0, H / 2), (t, D, H), kraft)
        cube("wally", (0, k * (D / 2 - t / 2), H / 2), (W, t, H), kraft)
    lid = cube("lid", (0, D / 2 + 0.07, 0.006), (W + 0.01, D + 0.01, 0.012), kraft, bevel=0.002); lid.rotation_euler.z = math.radians(8)
    lid.location = (0.06, 0.20, 0.006)
    tissue = fabric("tissue", (0.82, 0.80, 0.76), scale=200)
    tz = cube("tissue", (0, 0, 0.03), (W - 0.012, D - 0.012, 0.04), tissue)
    tt = bpy.data.textures.new("tt", "CLOUDS"); tt.noise_scale = 0.03
    sb = tz.modifiers.new("sb", "SUBSURF"); sb.levels = 4; sb.render_levels = 4
    d = tz.modifiers.new("d", "DISPLACE"); d.texture = tt; d.strength = 0.012
    mug(-0.055, 0.0, glaze("sage", sage, clay), h=0.088, r=0.039, rot=math.radians(150)).location.z = 0.035
    mug(0.055, 0.0, glaze("cream", (0.80, 0.76, 0.66), clay, split=0.6), h=0.088, r=0.039, rot=math.radians(30)).location.z = 0.035
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith("Torus"): o.location.z += 0.035
    tag = cube("tag", (-0.17, -0.07, 0.001), (0.05, 0.03, 0.001), mat("tagM", (0.80, 0.74, 0.62), rough=0.8), bevel=0.0005); tag.rotation_euler.z = -0.4
    cube("table", (0, 0.2, -0.015), (1.6, 1.2, 0.03), walnut(), bevel=0.003)
    cube("wall", (0, 0.6, 0.6), (3, 0.05, 1.4), plaster())
    area("window", (-0.8, 0.1, 0.8), (0, 0.0, 0.03), 40, 0.6, (1.0, 0.88, 0.72), size_y=0.9)
    area("fill", (0.8, -0.8, 0.6), (0, 0.0, 0.03), 7, 1.2, (0.9, 0.93, 1.0))
    world((0.9, 0.85, 0.8), 0.04)
    camera((0.02, -0.46, 0.36), (0.0, 0.02, 0.03), lens=50, fstop=4); exp = -0.3

elif SCENE in ("service-demo", "service-problem"):
    chrome = mat("chrome", (0.92, 0.92, 0.94), rough=0.08, metal=1.0)
    white = stone("cab", (0.78, 0.77, 0.74), scale=30, contrast=0.08, rough=0.45)
    cube("back", (0, 0.30, 0.40), (1.2, 0.02, 0.80), white)
    cube("floorC", (0, 0.0, 0.0), (1.2, 0.62, 0.02), white)
    def pipe(name, pts, r, m):
        cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 6
        sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
        for p, xyz in zip(sp.points, pts): p.co = (*xyz, 1)
        o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o); assign(o, m); return o
    def bend(a, b, c, steps=10):
        return [tuple((1 - t) ** 2 * a[j] + 2 * (1 - t) * t * b[j] + t ** 2 * c[j] for j in range(3)) for t in [i / steps for i in range(steps + 1)]]
    y0 = 0.05
    pts = [(0, y0, 0.80), (0, y0, 0.40)] + bend((0, y0, 0.40), (0, y0, 0.30), (0.08, y0, 0.30))[1:] + bend((0.08, y0, 0.30), (0.16, y0, 0.30), (0.16, y0, 0.38))[1:] + bend((0.16, y0, 0.38), (0.16, y0, 0.42), (0.16, 0.12, 0.42))[1:] + [(0.16, 0.29, 0.42)]
    pipe("drain", pts, 0.019, chrome)
    for z in (0.62, 0.40): cyl("nut", (0, y0, z), 0.026, 0.022, chrome, verts=48, bevel=0.003)
    cyl("flange", (0.16, 0.285, 0.42), 0.04, 0.01, chrome, rot=(math.pi / 2, 0, 0), bevel=0.002)
    for k, col in ((-1, (0.6, 0.06, 0.04)), (1, (0.08, 0.20, 0.55))):
        x = k * 0.22
        cyl("valve", (x, 0.25, 0.30), 0.02, 0.06, chrome, rot=(math.pi / 2, 0, 0), bevel=0.003)
        cyl("valveUp", (x, 0.235, 0.34), 0.012, 0.07, chrome)
        cube("handle", (x, 0.215, 0.30), (0.045, 0.012, 0.022), mat("h", col, rough=0.4), bevel=0.004)
        pipe("hose", bend((x, 0.235, 0.37), (x, 0.20, 0.62), (x * 0.4, 0.10, 0.85), 16), 0.006, mat("braid", (0.75, 0.75, 0.76), rough=0.35, metal=1.0))
    wrench = mat("wrench", (0.55, 0.56, 0.58), rough=0.3, metal=1.0)
    grip = mat("grip", (0.65, 0.08, 0.04), rough=0.6)
    if SCENE == "service-demo":
        w = cube("wrenchH", (-0.16, -0.10, 0.018), (0.22, 0.03, 0.01), wrench, bevel=0.004); w.rotation_euler.z = math.radians(25)
        cyl("wrenchHead", (-0.16 + math.cos(math.radians(25)) * 0.12, -0.10 + math.sin(math.radians(25)) * 0.12, 0.018), 0.03, 0.012, wrench, bevel=0.003)
        cube("grip", (-0.16 - math.cos(math.radians(25)) * 0.05, -0.10 - math.sin(math.radians(25)) * 0.05, 0.02), (0.10, 0.034, 0.013), grip, bevel=0.005).rotation_euler.z = math.radians(25)
        cube("cloth", (0.22, -0.14, 0.022), (0.16, 0.12, 0.025), mat("cloth", (0.07, 0.17, 0.35), rough=0.95), bevel=0.01).rotation_euler.z = -0.2
        camera((0.0, -0.95, 0.42), (0.03, 0.12, 0.40), lens=30, fstop=5.6); exp = -0.6
    else:
        # close on the trap's slip nut, a wrench's jaw closed on it
        jaw = cube("jaw", (0.0, y0 - 0.032, 0.40), (0.07, 0.012, 0.03), wrench, bevel=0.003)
        jaw2 = cube("jaw2", (0.0, y0 + 0.032, 0.40), (0.07, 0.012, 0.03), wrench, bevel=0.003)
        handle = cube("handleW", (-0.17, y0 - 0.03, 0.40), (0.28, 0.022, 0.012), wrench, bevel=0.004)
        handle.rotation_euler.z = math.radians(-8)
        cube("gripW", (-0.27, y0 - 0.045, 0.40), (0.11, 0.03, 0.016), grip, bevel=0.006).rotation_euler.z = math.radians(-8)
        for i in range(5):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.004 - i * 0.0004, location=(0.006, y0 - 0.018, 0.375 - i * 0.03))
            o = bpy.context.active_object; o.scale = (1, 1, 1.5); smooth(o)
            assign(o, mat("water", (1, 1, 1), rough=0.0, **{"Transmission Weight": 1.0, "IOR": 1.33}))
        camera((-0.05, -0.42, 0.47), (0.0, y0, 0.39), lens=70, fstop=3.5); exp = -0.6
    area("torch", (0.18, -0.50, 0.50), (0.04, 0.10, 0.38), 2.2, 0.12, (1.0, 0.93, 0.82))
    area("room", (0, -1.4, 0.9), (0, 0.1, 0.4), 7, 1.5, (0.95, 0.97, 1.0))
    world((0.9, 0.92, 0.95), 0.03)

elif SCENE == "service-offer":
    # a written estimate on a clipboard, a pen and a pipe wrench on the work van's tailgate mat
    board = cube("board", (0, 0, 0.004), (0.23, 0.32, 0.006), stone("masonite", (0.32, 0.20, 0.10), scale=40, contrast=0.2, rough=0.6), bevel=0.003)
    board.rotation_euler.z = math.radians(-8)
    g = bpy.data.objects.new("est", None); bpy.context.collection.objects.link(g)
    paper = mat("paper", (0.84, 0.83, 0.80), rough=0.85); ink = mat("ink", (0.12, 0.12, 0.14), rough=0.7)
    blue = mat("blueInk", (0.07, 0.23, 0.42), rough=0.6)
    cube("sheet", (0, -0.01, 0.0075), (0.21, 0.28, 0.0006), paper).parent = g
    cube("head", (-0.045, 0.105, 0.008), (0.10, 0.012, 0.0002), blue).parent = g
    y = 0.07
    for i in range(9):
        w = 0.15 if i % 4 else 0.09
        cube("ln", (-0.09 + w / 2, y, 0.008), (w, 0.0035, 0.0002), ink).parent = g
        if i % 2 == 0: cube("amt", (0.075, y, 0.008), (0.025, 0.0035, 0.0002), ink).parent = g
        y -= 0.017
    cube("total", (0.06, y - 0.01, 0.008), (0.05, 0.006, 0.0002), blue).parent = g
    cube("clip", (0, 0.145, 0.012), (0.09, 0.03, 0.01), mat("steelc", (0.7, 0.7, 0.72), rough=0.25, metal=1.0), bevel=0.003).parent = g
    g.rotation_euler.z = math.radians(-8)
    text("FREE ESTIMATE", (-0.035, 0.105 + 0.022, 0.0082), 0.010, blue, rot=(0, 0, 0)).parent = g
    pen = lathe("pen", [(0.0, 0.0), (0.004, 0.006), (0.0050, 0.13), (0.0, 0.14)], mat("penB", (0.03, 0.08, 0.20), rough=0.25), segs=32)
    pen.location = (0.16, -0.05, 0.005); pen.rotation_euler = (0, math.pi / 2, math.radians(70))
    wr = mat("wrench", (0.55, 0.56, 0.58), rough=0.3, metal=1.0)
    w = cube("wrenchH", (-0.20, -0.02, 0.008), (0.26, 0.03, 0.012), wr, bevel=0.004); w.rotation_euler.z = math.radians(80)
    cyl("wrenchHead", (-0.20 + math.cos(math.radians(80)) * 0.14, -0.02 + math.sin(math.radians(80)) * 0.14, 0.008), 0.032, 0.014, wr, bevel=0.003)
    cube("grip", (-0.20 - math.cos(math.radians(80)) * 0.06, -0.02 - math.sin(math.radians(80)) * 0.06, 0.009), (0.12, 0.036, 0.015), mat("grip", (0.65, 0.08, 0.04), rough=0.6), bevel=0.006).rotation_euler.z = math.radians(80)
    mat_ = mat("rubberMat", (0.035, 0.035, 0.038), rough=0.85)
    rn = node(mat_, "ShaderNodeTexWave"); rn.inputs["Scale"].default_value = 60
    rb = node(mat_, "ShaderNodeBump"); rb.inputs["Strength"].default_value = 0.4
    link(mat_, rn, "Fac", rb, "Height"); link(mat_, rb, "Normal", bsdf(mat_), "Normal")
    cube("mat", (0, 0.1, -0.005), (1.4, 1.0, 0.01), mat_)
    area("sky", (0.2, 0.4, 1.2), (0, 0, 0), 60, 1.6, (0.85, 0.92, 1.0))
    area("sunlike", (-0.8, -0.3, 0.7), (0, 0, 0), 40, 0.4, (1.0, 0.93, 0.82))
    world((0.7, 0.8, 1.0), 0.15)
    camera((0.02, -0.48, 0.42), (0.0, 0.0, 0.0), lens=45, fstop=5.6); exp = -0.7

elif SCENE == "salon-demo":
    # a salon chair facing a round mirror on a plum wall, a small trolley beside it
    leather = mat("leatherC", (0.06, 0.035, 0.03), rough=0.35, **{"Coat Weight": 0.3})
    chrome = mat("chrome", (0.9, 0.9, 0.92), rough=0.1, metal=1.0)
    cyl("base", (0, 0, 0.02), 0.26, 0.04, chrome, verts=96, bevel=0.01)
    cyl("post", (0, 0, 0.25), 0.04, 0.42, chrome, verts=48)
    from pieces import fabric as _f
    seat = cube("seat", (0, 0, 0.50), (0.56, 0.50, 0.12), leather, bevel=0.05)
    sb = seat.modifiers.new("sb", "SUBSURF"); sb.levels = 2; sb.render_levels = 2
    back = cube("backr", (0, 0.24, 0.85), (0.54, 0.12, 0.62), leather, bevel=0.05); back.rotation_euler.x = math.radians(-8)
    sb = back.modifiers.new("sb", "SUBSURF"); sb.levels = 2; sb.render_levels = 2
    for k in (-1, 1):
        a = cube("arm", (k * 0.30, 0.02, 0.66), (0.08, 0.46, 0.06), leather, bevel=0.025)
        sb = a.modifiers.new("sb", "SUBSURF"); sb.levels = 2; sb.render_levels = 2
        cube("armpost", (k * 0.30, -0.15, 0.58), (0.03, 0.03, 0.12), chrome)
    wall = plaster((0.11, 0.035, 0.08))
    cube("wall", (0, 0.95, 1.4), (6, 0.05, 2.8), wall)
    # round mirror reflecting the room, brass rim
    cyl("mirror", (0, 0.92, 1.30), 0.42, 0.01, mat("mirror", (0.80, 0.80, 0.80), rough=0.06, metal=1.0), rot=(math.pi / 2, 0, 0), verts=128)
    bpy.ops.mesh.primitive_torus_add(location=(0, 0.915, 1.30), major_radius=0.425, minor_radius=0.014, rotation=(math.pi / 2, 0, 0), major_segments=128)
    smooth(bpy.context.active_object); assign(bpy.context.active_object, mat("brass", (0.88, 0.70, 0.40), rough=0.25, metal=1.0))
    cube("ledge", (0, 0.86, 0.80), (1.3, 0.18, 0.04), stone("terrazzo", (0.80, 0.74, 0.70), scale=60, contrast=0.4, rough=0.3))
    for i, (x, h) in enumerate(((-0.4, 0.16), (-0.33, 0.12), (0.45, 0.2))):
        lathe("btl", [(0.0, 0.0), (0.03, 0.0), (0.03, h), (0.012, h + 0.02), (0.0, h + 0.03)], mat(f"b{i}", ((0.85, 0.75, 0.70), (0.25, 0.30, 0.25), (0.80, 0.80, 0.78))[i], rough=0.3), loc=(x, 0.86, 0.82))
    cube("floor", (0, 0, -0.01), (6, 6, 0.02), stone("oakF", (0.45, 0.32, 0.20), scale=3, contrast=0.3, rough=0.4))
    sun((55, 0, -35), power=3.0, soft=2, color=(1.0, 0.90, 0.78))
    area("fill", (0.8, -2.6, 1.6), (0, 0.4, 0.8), 160, 2.5, (1.0, 0.96, 0.92))
    area("fill2", (-1.6, -1.5, 2.0), (0, 0.4, 0.8), 90, 2.0)
    world((0.95, 0.92, 0.9), 0.4)
    camera((0.55, -2.4, 1.05), (0.05, 0.3, 0.80), lens=45, fstop=5.6); exp = -1.0

elif SCENE == "salon-problem":
    # a phone on a marble counter showing an online booking calendar
    # the screen: booking.html captured at 340x730 (any headless browser) as booking.png
    scr_path = os.path.join(os.path.dirname(__file__), "booking.png")
    phone = cube("phone", (0, 0, 0.005), (0.075, 0.155, 0.009), mat("phoneB", (0.02, 0.02, 0.025), rough=0.25, metal=0.5), bevel=0.008)
    phone.rotation_euler.z = math.radians(-14)
    sm = bpy.data.materials.new("screen"); sm.use_nodes = True
    nt = sm.node_tree; b = nt.nodes["Principled BSDF"]
    im = nt.nodes.new("ShaderNodeTexImage"); im.image = bpy.data.images.load(scr_path)
    nt.links.new(im.outputs["Color"], b.inputs["Base Color"]); nt.links.new(im.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.4; b.inputs["Roughness"].default_value = 0.05
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.0096))
    sc = bpy.context.active_object; sc.scale = (0.068, 0.146, 1); sc.rotation_euler.z = math.radians(-14); assign(sc, sm)
    cube("counter", (0, 0.1, -0.01), (1.2, 1.0, 0.02), stone("marble", (0.82, 0.80, 0.78), scale=5, contrast=0.12, rough=0.15))
    # salon props softly behind: a comb and a small vase of dried flowers
    cube("comb", (0.13, 0.08, 0.002), (0.16, 0.025, 0.003), mat("comb", (0.04, 0.03, 0.03), rough=0.3), bevel=0.001).rotation_euler.z = 0.5
    lathe("vase", [(0.0, 0.0), (0.025, 0.0), (0.035, 0.06), (0.015, 0.11), (0.018, 0.12), (0.0, 0.12)], mat("vaseP", (0.85, 0.65, 0.66), rough=0.5), loc=(-0.12, 0.18, 0))
    for i in range(9):
        a = i * 0.7
        st = cyl("stem", (-0.12 + math.cos(a) * 0.008, 0.18 + math.sin(a) * 0.008, 0.18), 0.0015, 0.16, mat("stemD", (0.45, 0.38, 0.22), rough=0.8), verts=8, rot=(math.cos(a) * 0.25, math.sin(a) * 0.25, 0))
    area("window", (-0.6, 0.2, 0.5), (0, 0.02, 0.0), 18, 0.5, (1.0, 0.95, 0.88))
    area("fill", (0.6, -0.6, 0.6), (0, 0.02, 0.0), 6, 1.2)
    world((0.92, 0.94, 1.0), 0.25)
    camera((0.03, -0.30, 0.26), (0.0, 0.02, 0.0), lens=50, fstop=3.5); exp = -1.3

elif SCENE == "salon-offer":
    # salon scissors and a comb with a gift tag on a plum linen
    steel = mat("steel", (0.85, 0.85, 0.87), rough=0.12, metal=1.0)
    def blade(rot):
        g = bpy.data.objects.new("blade", None); bpy.context.collection.objects.link(g)
        b = cube("b", (0.07, 0, 0.003), (0.13, 0.010, 0.0025), steel, bevel=0.001); b.parent = g
        bpy.ops.mesh.primitive_torus_add(location=(-0.035, 0.0, 0.004), major_radius=0.018, minor_radius=0.0035)
        r = bpy.context.active_object; smooth(r); assign(r, steel); r.parent = g
        cube("shank", (0.0, 0, 0.003), (0.04, 0.008, 0.004), steel, bevel=0.001).parent = g
        g.rotation_euler.z = rot; g.location = (0.0, 0.0, 0.0); return g
    blade(math.radians(6)); blade(math.radians(-6)).location.z = 0.0035
    cyl("pivot", (0.0, 0.0, 0.007), 0.004, 0.004, steel, verts=24)
    comb = cube("comb", (0.02, -0.07, 0.003), (0.17, 0.028, 0.004), mat("combT", (0.08, 0.05, 0.04), rough=0.3), bevel=0.0012); comb.rotation_euler.z = math.radians(-12)
    tag = cube("tag", (-0.12, 0.06, 0.0015), (0.07, 0.04, 0.0012), mat("tagW", (0.86, 0.82, 0.74), rough=0.8), bevel=0.0006); tag.rotation_euler.z = math.radians(15)
    text("Free fringe trim", (-0.12, 0.06, 0.0029), 0.0065, mat("tagInk", (0.30, 0.10, 0.25), rough=0.7), rot=(0, 0, math.radians(15)))
    lin = fabric("plum", (0.20, 0.07, 0.14), scale=500)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=200, y_subdivisions=200, size=1.4, location=(0, 0, -0.004))
    sh = bpy.context.active_object; assign(sh, lin)
    for p in sh.data.polygons: p.use_smooth = True
    t = bpy.data.textures.new("cl", "CLOUDS"); t.noise_scale = 0.12
    d = sh.modifiers.new("d", "DISPLACE"); d.texture = t; d.strength = 0.01
    area("key", (-0.5, 0.1, 0.5), (0, 0, 0), 14, 0.4, (1.0, 0.94, 0.86))
    area("fill", (0.5, -0.5, 0.4), (0, 0, 0), 4, 1.0)
    world((0.9, 0.9, 0.95), 0.1)
    camera((0.02, -0.30, 0.26), (0.0, 0.0, 0.0), lens=50, fstop=4); exp = -0.6

finish(os.environ.get("NAME", SCENE), exposure=exp)
