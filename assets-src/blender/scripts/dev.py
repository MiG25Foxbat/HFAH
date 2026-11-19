"""Dev harness: build chosen characters at the origin and render quick previews (one character per run is cleanest).
CATS=furniture RES=640 VIEWS=front,tq FRAME=0 FOCUS=hand|face|x,y,z DIST=3.9 blender -b --python dev.py
VIEWS entries: front, tq, side, back or az:el (degrees). FRAME evaluates the NLA clips (Idle+Wave) at that frame.
Output: previews/dev_<cat>_<view>[_f<frame>].png"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib, studio, chars, assemble

bpy.ops.wm.read_factory_settings(use_empty=True)
cats = os.environ.get("CATS", "furniture").split(",")
res = int(os.environ.get("RES", "640"))
views = os.environ.get("VIEWS", "front,tq").split(",")
frame = int(os.environ.get("FRAME", "0"))
focus = os.environ.get("FOCUS", "")
dist = float(os.environ.get("DIST", "3.9"))
out = os.path.join(lib.BASE, "previews")
os.makedirs(out, exist_ok=True)
studio.setup_render(res=res, samples=int(os.environ.get("SAMPLES", "24")))
studio.make_world()
tgt = Vector((0, 0, 0.8))
st = studio.make_studio(tgt)
PRESET = {"front": (0, 4), "tq": (-28, 9), "side": (-80, 6), "back": (160, 8), "top": (-20, 55)}
for cat in cats:
    ch = chars.BUILDERS[cat]()
    assemble.animate(cat, ch)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    t = tgt
    if focus in ("hand", "hands"):
        t = ch["hands"][0].matrix_world.translation.copy()
    elif focus == "hand_l":
        t = ch["hands"][1].matrix_world.translation.copy()
    elif focus == "face":
        t = bpy.data.objects[f"{cat}.Face"].matrix_world.translation + Vector((0, 0, 0.0))
    elif focus:
        t = Vector([float(x) for x in focus.split(",")])
    d = dist if not focus else float(os.environ.get("DIST", "1.2"))
    for v in views:
        if v in PRESET:
            az, el = PRESET[v]
        else:
            az, el = [float(x) for x in v.split(":")]
        studio.aim_camera(st["cam"], t, az, el, d)
        tag = f"_f{frame}" if frame else ""
        ftag = f"_{focus.replace(',', '_')}" if focus else ""
        studio.render(os.path.join(out, f"dev_{cat}_{v.replace(':', '_')}{ftag}{tag}.png"))
    if os.environ.get("TOOLS") and cat == "other":
        import export_all
        r = export_all.tool_overlaps()
        print("TOOLS", {k: v for k, v in r.items() if k != "tool_pairs"})
        print("TOOLPAIRS", {k: v for k, v in r["tool_pairs"].items() if v["overlaps"] or v["min_dist"] < 0.03})
    if os.environ.get("CLEAR"):
        import export_all
        print("CLEARANCE", cat, export_all.clearance(cat))
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
    if len(cats) > 1:
        for ob in list(bpy.data.objects):
            if ob.name.startswith(cat + "."):
                ob.hide_render = True
