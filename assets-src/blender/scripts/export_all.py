"""Open zaprosto-characters.blend -> hand-clearance QA, raw GLB export, posters, previews.
Run: blender -b zaprosto-characters.blend --python scripts/export_all.py
Env: STEPS=qa,glb,posters (default all)
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import lib, studio

BASE = lib.BASE
CATS = os.environ.get("CATS", "furniture,plumbing,electric,repair,other,appliances").split(",")
STAGE = Vector((0, 12, 0))
STEPS = os.environ.get("STEPS", "qa,glb,posters").split(",")
sc = bpy.context.scene


def objs_of(cat, typ=None):
    return [o for o in bpy.data.objects if o.name.startswith(cat + ".") and (typ is None or o.type == typ)]


def world_verts(o):
    mw = o.matrix_world
    return [mw @ v.co for v in o.data.vertices]


def bvh_of(meshes):
    verts, polys = [], []
    for o in meshes:
        b = len(verts)
        verts += world_verts(o)
        polys += [tuple(b + i for i in p.vertices) for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys), verts


def set_mute(cat, clip, mute):
    for o in objs_of(cat):
        ad = o.animation_data
        if ad:
            for tr in ad.nla_tracks:
                if tr.name == clip:
                    tr.mute = mute


# ---------------------------------------------------------------- hand clearance
def clearance(cat):
    meshes = objs_of(cat, "MESH")
    hands = {"L": [o for o in meshes if o.name.startswith(f"{cat}.Hand_L_")],
             "R": [o for o in meshes if o.name.startswith(f"{cat}.Hand_R_")]}
    tubes = {"L": f"{cat}.Arm_L_Tube", "R": f"{cat}.Arm_R_Tube"}
    arms_hands = set(hands["L"] + hands["R"] + [bpy.data.objects[t] for t in tubes.values()])
    others = [o for o in meshes if o not in arms_hands and not o.name.startswith(f"{cat}.Lid_")]
    res = dict(hand_min=1e9, hand_min_at=None, tube_min=1e9, overlaps=0, samples=0)
    passes = [("Idle+Wave", False, False, range(0, 151, 2)),
              ("Wave only", True, False, range(0, 81, 2)),
              ("Idle only", False, True, range(0, 151, 5))]
    for name, mute_idle, mute_wave, frames in passes:
        set_mute(cat, "Idle", mute_idle)
        set_mute(cat, "Wave", mute_wave)
        for f in frames:
            sc.frame_set(f)
            bpy.context.view_layer.update()
            bo, overts = bvh_of(others)
            for side in "LR":
                bh, hverts = bvh_of(hands[side])
                d_hand = min(bo.find_nearest(p)[3] for p in hverts)
                hc = sum(hverts, Vector()) / len(hverts)
                near = [p for p in overts if (p - hc).length < 0.45]
                d_rev = min((bh.find_nearest(p)[3] for p in near), default=1e9)
                d = min(d_hand, d_rev)
                ov = len(bh.overlap(bo))
                res["overlaps"] += ov
                if d < res["hand_min"]:
                    res["hand_min"], res["hand_min_at"] = d, f"{name} f{f} hand_{side}"
                # arm tube beyond the shoulder socket
                tube = bpy.data.objects[tubes[side]]
                piv = bpy.data.objects[f"{cat}.Arm_{side}"].matrix_world.translation
                tv = [p for p in world_verts(tube) if (p - piv).length > 0.09]
                res["tube_min"] = min(res["tube_min"], min(bo.find_nearest(p)[3] for p in tv))
            res["samples"] += 1
    set_mute(cat, "Idle", False)
    set_mute(cat, "Wave", False)
    sc.frame_set(0)
    res["hand_min"] = round(res["hand_min"], 4)
    res["tube_min"] = round(res["tube_min"], 4)
    return res


# ---------------------------------------------------------------- toolbox: tools vs box/lid/latches and vs each other
def tool_overlaps():
    cat = "other"
    meshes = objs_of(cat, "MESH")
    groups = {}
    for o in meshes:
        short = o.name[len(cat) + 1:]
        for tool in ("Drill", "Screwdriver", "Pliers", "Wrench", "Hammer"):
            if short.startswith(tool):
                groups.setdefault(tool, []).append(o)
    box = [o for o in meshes if o.name[len(cat) + 1:] in ("Body", "Hinge", "Latch_L", "Latch_R", "CarryHandle")]
    bb, _ = bvh_of(box)
    res = {"vs_box_overlaps": {}, "vs_box_min_dist": {}, "tool_pairs": {}, "overlap_detail": {}}
    trees = {t: bvh_of(objs) for t, objs in groups.items()}
    for t, (bh, hv) in trees.items():
        res["vs_box_overlaps"][t] = len(bh.overlap(bb))
        for part in box:
            for tm in groups[t]:
                n = len(bvh_of([tm])[0].overlap(bvh_of([part])[0]))
                if n:
                    res["overlap_detail"][f"{tm.name}-{part.name}"] = n
        res["vs_box_min_dist"][t] = round(min(bb.find_nearest(p)[3] for p in hv), 4)
    names = list(trees)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            ov = len(trees[a][0].overlap(trees[b][0]))
            d = min(trees[b][0].find_nearest(p)[3] for p in trees[a][1])
            res["tool_pairs"][f"{a}-{b}"] = dict(overlaps=ov, min_dist=round(d, 4))
    return res


# ---------------------------------------------------------------- GLB export
def strip_names(cat):
    pref = cat + "."
    ren = []
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.actions):
        for idb in list(coll):
            if idb.name.startswith(pref):
                ren.append((idb, idb.name))
    for idb, old in ren:
        idb.name = old[len(pref):]
    return ren


def export_glb(cat):
    root = bpy.data.objects[f"{cat}.Root"]
    old_loc = root.location.copy()
    root.location = (0, 0, 0)
    sc.frame_set(0)
    ren = strip_names(cat)
    try:
        bpy.ops.object.select_all(action="DESELECT")
        for o in bpy.data.objects:
            if o.name in {r[0].name for r in ren if isinstance(r[0], bpy.types.Object)}:
                o.select_set(True)
        out = os.path.join(BASE, "export", f"{cat}.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=out, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
            export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
            export_optimize_animation_size=False, export_frame_range=False,
            export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=False,
            export_texcoords=True, export_normals=True, export_tangents=False,
            export_vertex_color="NONE", export_attributes=False)
    finally:
        for idb, old in ren:
            idb.name = old
        root.location = old_loc
    return out


# ---------------------------------------------------------------- posters / previews
def make_blob():
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(STAGE.x, STAGE.y, 0.002))
    pl = bpy.context.active_object
    pl.name = "ContactShadow"
    m = bpy.data.materials.new("ContactShadow")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    dif.inputs["Color"].default_value = (0.02, 0.025, 0.03, 1)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mp = nt.nodes.new("ShaderNodeMath")
    mp.operation = "MULTIPLY"
    mp.inputs[1].default_value = 0.55
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 1.8
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tc.outputs["Object"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], pw.inputs[0])
    nt.links.new(pw.outputs["Value"], mp.inputs[0])
    nt.links.new(mp.outputs["Value"], mixs.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mixs.inputs[1])
    nt.links.new(dif.outputs["BSDF"], mixs.inputs[2])
    nt.links.new(mixs.outputs["Shader"], out.inputs["Surface"])
    try:
        m.surface_render_method = "BLENDED"
    except Exception as e:
        print("render method", e)
    pl.data.materials.append(m)
    c = bpy.data.collections["Studio"]
    for col in pl.users_collection:
        col.objects.unlink(pl)
    c.objects.link(pl)
    return pl


EYE_Z = {"furniture": 1.15, "plumbing": 0.69, "electric": 1.41, "repair": 1.375, "other": 0.60, "appliances": 1.40}
BLOB_R = {"furniture": 0.62, "plumbing": 0.60, "electric": 0.55, "repair": 0.5, "other": 0.68, "appliances": 0.72}


def render_cat(cat, blob, posters_dir, prev_dir):
    root = bpy.data.objects[f"{cat}.Root"]
    old = root.location.copy()
    root.location = STAGE
    for c2 in CATS:
        for o in objs_of(c2):
            o.hide_render = (c2 != cat)
    blob.scale = (BLOB_R[cat], BLOB_R[cat], 1)
    cam = bpy.data.objects["PosterCam"]
    tgt = STAGE + Vector((0, 0, 0.8))
    sc.frame_set(0)
    studio.setup_render(res=1024, samples=64)
    studio.aim_camera(cam, tgt, -28, 9, 3.9)
    studio.render(os.path.join(posters_dir, f"{cat}.png"), res=1024)
    studio.setup_render(res=720, samples=48)
    studio.aim_camera(cam, tgt, 0, 4, 3.9)
    studio.render(os.path.join(prev_dir, f"{cat}_front.png"), res=720)
    studio.aim_camera(cam, tgt, -28, 9, 3.9)
    sc.frame_set(34)
    studio.render(os.path.join(prev_dir, f"{cat}_wave_f34.png"), res=720)
    studio.aim_camera(cam, STAGE + Vector((0, 0, EYE_Z[cat])), -12, 4, 2.2)
    sc.frame_set(3)
    studio.render(os.path.join(prev_dir, f"{cat}_blink_f3_closeup.png"), res=640)
    # hands: rest pose (right hand, front view) and mid-wave (palm towards the viewer)
    sc.frame_set(0)
    bpy.context.view_layer.update()
    hand = bpy.data.objects[f"{cat}.Hand_R"]
    studio.aim_camera(cam, hand.matrix_world.translation.copy(), 0, 4, 1.25)
    studio.render(os.path.join(prev_dir, f"{cat}_hand_rest_closeup.png"), res=480)
    sc.frame_set(40)
    bpy.context.view_layer.update()
    studio.aim_camera(cam, hand.matrix_world.translation.copy(), -12, 4, 1.25)
    studio.render(os.path.join(prev_dir, f"{cat}_hand_wave_closeup.png"), res=480)
    sc.frame_set(0)
    root.location = old


def main():
    report = {}
    if "qa" in STEPS:
        for cat in CATS:
            root = bpy.data.objects[f"{cat}.Root"]
            old = root.location.copy()
            root.location = (0, 0, 0)
            report[cat] = clearance(cat)
            root.location = old
            print("CLEARANCE", cat, report[cat])
        report["other_tools"] = tool_overlaps()
        print("TOOLS", report["other_tools"])
        os.makedirs(os.path.join(BASE, "qa"), exist_ok=True)
        with open(os.path.join(BASE, "qa", "clearance.json"), "w") as f:
            json.dump(report, f, indent=1)
    if "glb" in STEPS:
        for cat in CATS:
            print("EXPORTED", export_glb(cat))
    if "posters" in STEPS:
        pdir = os.path.join(BASE, "posters")
        vdir = os.path.join(BASE, "previews")
        os.makedirs(pdir, exist_ok=True)
        os.makedirs(vdir, exist_ok=True)
        blob = make_blob()
        for cat in CATS:
            render_cat(cat, blob, pdir, vdir)
        bpy.data.objects.remove(blob)
        for cat in CATS:
            for o in objs_of(cat):
                o.hide_render = False


if __name__ == "__main__":
    main()
