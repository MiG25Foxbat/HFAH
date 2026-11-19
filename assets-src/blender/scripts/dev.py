"""Dev harness: build chosen characters at origin and render quick previews.
CATS=furniture,plumbing RES=640 blender -b --python dev.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib, studio, chars

bpy.ops.wm.read_factory_settings(use_empty=True)
cats = os.environ.get("CATS", "furniture").split(",")
res = int(os.environ.get("RES", "640"))
views = os.environ.get("VIEWS", "front,tq").split(",")
out = os.path.join(lib.BASE, "previews")
os.makedirs(out, exist_ok=True)
studio.setup_render(res=res, samples=24)
studio.make_world()
tgt = Vector((0, 0, 0.8))
st = studio.make_studio(tgt)
for cat in cats:
    ch = chars.BUILDERS[cat]()
    for ob in bpy.data.objects:
        if ob.name.startswith(cat + ".") and ob.type != "EMPTY":
            pass
    bpy.context.view_layer.update()
    for name in list(ch.keys()):
        pass
    # hide other chars
    for v in views:
        az, el = {"front": (0, 4), "tq": (-28, 9), "side": (-80, 6), "back": (160, 8)}[v]
        studio.aim_camera(st["cam"], tgt, az, el, 3.9)
        studio.render(os.path.join(out, f"dev_{cat}_{v}.png"))
    bb = [ob for ob in bpy.data.objects if ob.name.startswith(cat + ".") and ob.type == "MESH"]
    mn = Vector((9, 9, 9)); mx = Vector((-9, -9, -9))
    for ob in bb:
        if "Arm_" in ob.name or "Hand_" in ob.name:
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3))); mx = Vector((max(mx[i], w[i]) for i in range(3)))
    print("BBOX", cat, tuple(round(x, 3) for x in mn), tuple(round(x, 3) for x in mx))
    print("TRIS", cat, sum(len(ob.data.polygons) for ob in bb))
    # next char in same file would overlap; remove this one's objects
    if len(cats) > 1:
        for ob in list(bpy.data.objects):
            if ob.name.startswith(cat + "."):
                ob.hide_render = True
