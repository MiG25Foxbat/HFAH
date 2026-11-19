"""Build all five characters, unwrap Body, create Idle/Wave/Blink NLA clips, lay out and save the .blend.
Run: blender -b --python scripts/assemble.py
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from math import radians, sin, cos, pi
from mathutils import Vector
import lib, chars, studio

ORDER = [("furniture", "Furniture"), ("plumbing", "Plumbing"), ("electric", "Electric"),
         ("repair", "Repair"), ("other", "Other")]
LAYOUT_X = {"furniture": -5.0, "plumbing": -2.5, "electric": 0.0, "repair": 2.5, "other": 5.0}
STAGE = Vector((0, 12, 0))      # poster stage (studio lights/camera live here)
OUT = os.path.join(lib.BASE, "ladno-characters.blend")

FPS = lib.FPS                    # 50
IDLE_F, WAVE_F, BLINK_F = 150, 80, 9     # 3.0 s, 1.6 s, 0.18 s


# ------------------------------------------------------------------ animation helpers
def short(ob, cat):
    return ob.name[len(cat) + 1:]


def begin(ob, cat, clip):
    ad = ob.animation_data_create()
    act = bpy.data.actions.new(f"{cat}.{short(ob, cat)}.{clip}")
    ad.action = act
    return act


def key(ob, path, idx, frame, value):
    getattr(ob, path)[idx] = value
    ob.keyframe_insert(data_path=path, index=idx, frame=frame)


def push(ob, clip):
    ad = ob.animation_data
    act = ad.action
    tr = ad.nla_tracks.new()
    tr.name = clip
    st = tr.strips.new(clip, 0, act)
    try:
        if st.action_slot is None and len(act.slots):
            st.action_slot = act.slots[0]
    except Exception as e:
        print("slot", e)
    ad.action = None


def animate(cat, ch):
    rig, ar, al, hr, hl = ch["rig"], ch["arms"][0], ch["arms"][1], ch["hands"][0], ch["hands"][1]
    lids = [ob for ob in bpy.data.objects if ob.name in (f"{cat}.Lid_L", f"{cat}.Lid_R")]
    rest_r = ar.rotation_euler[1]

    # ---- Idle: 3 s loop, gentle bob + squash/stretch + tiny roll on the Rig node (feet stay planted)
    begin(rig, cat, "Idle")
    for f in range(0, IDLE_F + 1, 10):
        t = f / IDLE_F
        ph = 0.5 - 0.5 * cos(2 * pi * t)          # 0 -> 1 -> 0, zero slope at both ends
        rig.rotation_mode = "XYZ"
        key(rig, "location", 2, f, 0.012 * ph)
        key(rig, "scale", 2, f, 1.0 + 0.014 * ph)
        key(rig, "scale", 0, f, 1.0 - 0.007 * ph)
        key(rig, "scale", 1, f, 1.0 - 0.007 * ph)
        key(rig, "rotation_euler", 1, f, 0.012 * sin(2 * pi * t))
        key(rig, "rotation_euler", 2, f, 0.010 * sin(2 * pi * t + pi / 2) - 0.010)
    push(rig, "Idle")

    # ---- Wave: 1.6 s, right arm (character's own right, viewer's left) up, wrist waves ~2.5x, back to rest
    up = radians(152)
    begin(ar, cat, "Wave")
    for f, v in ((0, rest_r), (16, up), (60, up), (80, rest_r)):
        key(ar, "rotation_euler", 1, f, v)
    push(ar, "Wave")
    begin(hr, cat, "Wave")
    for f, v in ((0, 0.0), (16, 0.0), (22, -0.55), (30, 0.55), (38, -0.55), (46, 0.55), (54, -0.35), (60, 0.0), (80, 0.0)):
        key(hr, "rotation_euler", 1, f, v)
    push(hr, "Wave")

    # ---- Blink: 0.18 s, body-coloured lids scale up over the eyes and back
    for lid in lids:
        begin(lid, cat, "Blink")
        for f, v in ((0, 0.001), (3, 1.0), (4, 1.0), (9, 0.001)):
            for i in range(3):
                key(lid, "scale", i, f, v)
        push(lid, "Blink")


# ------------------------------------------------------------------ main
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 0, IDLE_F
    sc.unit_settings.system = "METRIC"
    report = {}
    for cat, coll in ORDER:
        ch = chars.BUILDERS[cat]()
        body = ch["body"]
        if cat != "repair":              # repair is unwrapped on the smooth sleeve before the fur
            lib.unwrap(body)
        uv = lib.uv_report(body, 512)
        animate(cat, ch)
        ch["root"].location = (LAYOUT_X[cat], 0, 0)
        meshes = [o for o in bpy.data.objects if o.name.startswith(cat + ".") and o.type == "MESH"]
        report[cat] = dict(
            uv=uv,
            body_materials=[m.name for m in body.data.materials],
            meshes=len(meshes),
            tris=sum(len(o.data.polygons) for o in meshes),
        )
        print("BUILT", cat, report[cat])
    # studio for posters lives on a separate stage so it never overlaps the row
    studio.setup_render(res=1024)
    studio.make_world()
    studio.make_studio(Vector((0, 12, 0.8)))
    sc.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    os.makedirs(os.path.join(lib.BASE, "qa"), exist_ok=True)
    with open(os.path.join(lib.BASE, "qa", "assemble_report.json"), "w") as f:
        json.dump(report, f, indent=1)
    print("SAVED", OUT)


main()
