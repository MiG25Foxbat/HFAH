"""The five character builders. Each returns a dict of the key objects."""
import bpy, bmesh, math
from math import radians, pi, sin, cos
from mathutils import Vector, Matrix, Quaternion
import lib
from lib import (mat, merge, T, box_bm, sphere_bm, lathe_bm, tube_bm, fillet, fillet2d, resample,
                 finish, empty, build_face, build_arm, make_bvh, displace_nap)


def start(cat, coll):
    lib.CAT[0] = cat
    lib._MATS.clear()
    lib.new_coll(coll)
    root = empty("Root", None, display="PLAIN_AXES", size=0.25)
    rig = empty("Rig", root, display="CUBE", size=0.1)
    return root, rig


def V(*a):
    return Vector(a)


# ===================================================================== 1. Furniture
def build_furniture():
    root, rig = start("furniture", "Furniture")
    wood = mat("Wood", "#C08A55", rough=0.72)
    dark = mat("WoodDark", "#9A6A3D", rough=0.72)
    cream = mat("Handle", "#F1E7D3", rough=0.5, spec=0.6)
    gl = lib.face_mats()["glove"]

    bm = bmesh.new()
    merge(bm, box_bm(0.92, 0.56, 1.28, r=0.03), T((0, 0, 0.81)))           # carcass 0.17..1.45
    merge(bm, box_bm(0.97, 0.60, 0.07, r=0.022), T((0, 0, 0.165)))        # plinth
    merge(bm, box_bm(1.00, 0.63, 0.07, r=0.025), T((0, 0, 1.475)))        # cornice lower
    merge(bm, box_bm(0.94, 0.57, 0.08, r=0.03), T((0, 0, 1.54)))          # cornice upper
    for sx in (-1, 1):                                                    # two doors, 12 mm centre gap
        merge(bm, box_bm(0.43, 0.034, 1.17, r=0.016), T((sx * 0.221, -0.291, 0.815)))
    body = finish(bm, "Body", wood, rig)

    # legs
    bm = bmesh.new()
    prof = [(0, 0), (0.030, 0), (0.036, 0.012), (0.046, 0.15), (0, 0.15)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            merge(bm, lathe_bm(prof, 20), T((sx * 0.375, sy * 0.205, 0)))
    legs = finish(bm, "Legs", dark, rig)

    # handles: vertical bars on standoffs beside the gap
    for side, sx in (("L", 1), ("R", -1)):
        x = sx * 0.07
        bm = tube_bm([(x, -0.345, 0.56), (x, -0.345, 0.84)], 0.017, ring=12)
        for z in (0.60, 0.80):
            merge(bm, tube_bm([(x, -0.345, z), (x, -0.300, z)], 0.012, ring=10, cap_start=None))
        finish(bm, f"Handle_{side}", cream, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    flat = lambda x, z: (V(x, -0.308, z), V(0, -1, 0))
    face = build_face(rig, bvh, wood, eye_x=0.14, eye_z=1.15, eye=(0.047, 0.066, 0.022), mouth_z=1.0,
                      mouth_w=0.078, smile=0.032, cheek_x=0.235, cheek_z=1.04, hit=flat)
    ar, hr = build_arm("R", rig, V(-0.45, -0.05, 0.93), gl, dark, L=0.34, rest_deg=20)
    al, hl = build_arm("L", rig, V(0.45, -0.05, 0.93), gl, dark, L=0.34, rest_deg=20)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


# ===================================================================== 2. Plumbing
def build_plumbing():
    root, rig = start("plumbing", "Plumbing")
    chrome = mat("Chrome", "#EEF2F5", rough=0.2, metal=0.7)
    blue = mat("LeverBlue", "#4E8FCB", rough=0.45, spec=0.6)
    gl = lib.face_mats()["glove"]

    prof = [(0, 0), (0.42, 0), (0.42, 0.07), (0.34, 0.10), (0.34, 0.17), (0.30, 0.21), (0.30, 1.08),
            (0.235, 1.20), (0.235, 1.30), (0.265, 1.31), (0.265, 1.34), (0.13, 1.385), (0, 1.395)]
    rad = [0, 0.03, 0.03, 0.02, 0.02, 0.04, 0.10, 0.06, 0.02, 0.01, 0.03, 0.04, 0]
    prof = lib.densify(lib.fillet2d(prof, rad, 6), 0.06)
    bm = lathe_bm(prof, 56)
    # gooseneck spout: forward from the shoulder, bending down
    path = fillet([V(0, -0.08, 1.19), V(0, -0.80, 1.19), V(0, -0.80, 0.97)], [0, 0.22, 0], 10)
    path = resample(path, 36)
    merge(bm, tube_bm(path, 0.074, ring=20, cap_start="flat", cap_end="flat"))
    merge(bm, lathe_bm([(0, 0.895), (0.07, 0.895), (0.086, 0.91), (0.086, 0.97), (0.074, 0.97), (0, 0.97)], 24),
          T((0, -0.80, 0)))
    body = finish(bm, "Body", chrome, rig)

    # lever: chrome stem + blue tip
    p0, p1, p2 = V(0, 0.0, 1.34), V(0, 0.14, 1.46), V(0, 0.28, 1.55)
    finish(tube_bm([p0, p1], [0.082, 0.072], ring=24, cap_start="round"), "Lever", chrome, rig)
    finish(tube_bm([p1, p2], [0.074, 0.078], ring=24, cap_start="round"), "LeverTip", blue, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    face = build_face(rig, bvh, chrome, eye_x=0.105, eye_z=0.69, eye=(0.047, 0.066, 0.022), mouth_z=0.51,
                      mouth_w=0.078, smile=0.03, cheek_x=0.19, cheek_z=0.58)
    ar, hr = build_arm("R", rig, V(-0.285, -0.03, 0.62), gl, chrome, L=0.34, r=0.034, rest_deg=20, hand=1.1)
    al, hl = build_arm("L", rig, V(0.285, -0.03, 0.62), gl, chrome, L=0.34, r=0.034, rest_deg=20, hand=1.1)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


# ===================================================================== 3. Electric (desk lamp)
def build_electric():
    root, rig = start("electric", "Electric")
    shade_m = mat("Shade", "#E3B23C", rough=0.62)
    cream = mat("Base", "#EFE8D8", rough=0.55)
    metal = mat("Metal", "#D3CDBF", rough=0.35, metal=0.45)
    bulb_m = mat("Bulb", "#F2B24A", rough=0.3, emit="#FFB84D", emit_k=1.0)
    gl = lib.face_mats()["glove"]

    # base + stem
    prof = lib.fillet2d([(0, 0), (0.40, 0), (0.40, 0.05), (0.24, 0.105), (0.075, 0.135), (0, 0.135)],
                        [0, 0.02, 0.03, 0.05, 0.03, 0], 6)
    finish(lathe_bm(lib.densify(prof, 0.05), 56), "Base", cream, rig)
    bm = tube_bm([V(0, 0, 0.10), V(0, 0, 0.80)], 0.036, ring=16, cap_start=None, cap_end=None)
    merge(bm, sphere_bm(0.072, 0.072, 0.072, 24, 14), T((0, 0, 0.42)))
    merge(bm, lathe_bm([(0, 0.10), (0.055, 0.10), (0.055, 0.15), (0, 0.15)], 20))
    finish(bm, "Stem", metal, rig)
    # socket + bulb
    finish(lathe_bm([(0, 0.76), (0.05, 0.76), (0.05, 0.80), (0.057, 0.82), (0.05, 0.84), (0.057, 0.86), (0.05, 0.88),
                     (0.057, 0.90), (0.05, 0.92), (0.057, 0.94), (0.048, 0.96), (0, 0.96)], 28), "Socket", metal, rig)
    R, CZB = 0.115, 1.07
    bulb = [(0, 0.95), (0.046, 0.95), (0.046, 0.968)]
    bulb += [(R * cos(radians(a)), CZB + R * sin(radians(a))) for a in range(-62, 91, 12)]
    bulb[-1] = (0, CZB + R)
    finish(lathe_bm(bulb, 36), "Bulb", bulb_m, rig, normals=None)

    # shade: hollow cone shell, slightly tilted back so the face looks more frontal
    outer = lib.fillet2d([(0.40, 0.0), (0.428, 0.0), (0.205, 0.48), (0.0, 0.48), (0.0, 0.465),
                          (0.19, 0.465), (0.40, 0.0)], [0, 0.012, 0.04, 0, 0, 0.025, 0], 6)
    bm = lathe_bm(lib.densify(outer, 0.05), 64)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, 1.14)) @ Matrix.Rotation(radians(-8), 4, "X"),
                        verts=bm.verts, space=Matrix.Identity(4))
    body = finish(bm, "Body", shade_m, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    face = build_face(rig, bvh, shade_m, eye_x=0.10, eye_z=1.41, eye=(0.045, 0.063, 0.021), mouth_z=1.275,
                      mouth_w=0.07, smile=0.028, cheek_x=0.185, cheek_z=1.33, cheek=(0.038, 0.024))
    # shoulders sit under the shade rim, 30 deg forward of the sides (rim rises ~8 deg at the front because the shade is tilted)
    rim = lambda sx: V(sx * 0.405 * cos(radians(30)), -0.405 * sin(radians(30)) * cos(radians(8)),
                       1.14 + 0.139 * 0.405 * sin(radians(30)) - 0.02)
    ar, hr = build_arm("R", rig, rim(-1), gl, metal, L=0.26, r=0.032, rest_deg=20, hand=1.1)
    al, hl = build_arm("L", rig, rim(1), gl, metal, L=0.26, r=0.032, rest_deg=20, hand=1.1)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


# ===================================================================== 4. Repair (paint roller)
def build_repair():
    root, rig = start("repair", "Repair")
    mint = mat("Mint", "#6CC3A0", rough=0.8)
    orange = mat("Grip", "#F29A4A", rough=0.55, spec=0.55)
    steel = mat("Steel", "#C5CBD2", rough=0.3, metal=0.55)
    gl = lib.face_mats()["glove"]
    CZ, RR, LEN = 1.33, 0.24, 0.94

    # fur sleeve: lathe along Z, then laid along X
    prof = lib.fillet2d([(0, -LEN / 2), (RR, -LEN / 2), (RR, LEN / 2), (0, LEN / 2)], [0, 0.07, 0.07, 0], 6)
    bm = lathe_bm(lib.densify(prof, 0.022), 88)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, CZ)) @ Matrix.Rotation(radians(90), 4, "Y"),
                        verts=bm.verts, space=Matrix.Identity(4))
    body = finish(bm, "Body", mint, rig)
    lib.unwrap(body)                                   # unwrap the smooth sleeve, then add fur
    lib.nap_object(body, amp=0.011, freq=34.0, protect=(V(0, -RR, CZ), 0.34))

    # end hubs + frame (axle -> side bend -> shaft)
    bm = bmesh.new()
    for sx in (-1, 1):
        merge(bm, lathe_bm(lib.fillet2d([(0, 0), (0.10, 0), (0.10, 0.03), (0, 0.03)], [0, 0.008, 0.008, 0], 3), 28),
              T((sx * (LEN / 2), 0, CZ), (0, radians(90 * sx), 0)))
    finish(bm, "Hubs", steel, rig)
    wire = fillet([V(0, 0, 0.56), V(0, 0, 0.86), V(0.585, 0, 0.86), V(0.585, 0, CZ), V(-0.515, 0, CZ)],
                  [0, 0.08, 0.10, 0.10, 0], 8)
    finish(tube_bm(resample(wire, 70), 0.026, ring=14), "Frame", steel, rig)
    # grip
    gp = lib.fillet2d([(0, 0), (0.115, 0), (0.115, 0.03), (0.085, 0.07), (0.078, 0.18), (0.09, 0.34),
                       (0.088, 0.50), (0.072, 0.585), (0.05, 0.60), (0.05, 0.64), (0, 0.64)],
                      [0, 0.02, 0.02, 0.04, 0.05, 0.06, 0.05, 0.03, 0.01, 0.02, 0], 5)
    finish(lathe_bm(lib.densify(gp, 0.05), 44), "Grip", orange, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    face = build_face(rig, bvh, mint, eye_x=0.16, eye_z=CZ + 0.045, eye=(0.047, 0.062, 0.022),
                      mouth_z=CZ - 0.085, mouth_w=0.07, smile=0.026, cheek_x=0.255, cheek_z=CZ - 0.04,
                      cheek=(0.038, 0.024))
    armc = mat("ArmTube", "#C9CED4", rough=0.55)
    # shoulders on the lower front of the roller end faces (arms never cross the frame wire at y=0)
    ar, hr = build_arm("R", rig, V(-0.455, -0.12, 1.17), gl, armc, L=0.30, r=0.034, rest_deg=34, hand=1.1)
    al, hl = build_arm("L", rig, V(0.455, -0.12, 1.17), gl, armc, L=0.30, r=0.034, rest_deg=34, hand=1.1)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


# ===================================================================== 5. Other (toolbox)
def _hollow_box(w, d, h, r, wall=0.03, floor=0.08):
    bm = box_bm(w, d, h, r=r, seg=4)
    top = max(bm.faces, key=lambda f: f.normal.z * 10 + f.calc_center_median().z)
    bmesh.ops.inset_region(bm, faces=[top], thickness=wall, depth=0.0)
    # after inset the original face object is the inner face
    bmesh.ops.translate(bm, vec=(0, 0, -(h - floor)), verts=list(top.verts))
    return bm


def _axis_matrix(base, direction):
    q = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    return Matrix.Translation(base) @ q.to_matrix().to_4x4()


def _xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts, space=Matrix.Identity(4))
    return bm


def build_other():
    root, rig = start("other", "Other")
    blue = mat("Blue", "#2E57D1", rough=0.6, spec=0.5)
    yellow = mat("Handle", "#F2B531", rough=0.5, spec=0.55)
    lmetal = mat("LatchMetal", "#D9DEE5", rough=0.35, metal=0.5)
    steel = mat("Steel", "#9AA3AD", rough=0.32, metal=0.6)
    wood = mat("ToolWood", "#C99A5E", rough=0.6)
    red = mat("Screwdriver", "#E5533D", rough=0.5, spec=0.55)
    armc = mat("ArmTube", "#1F3C94", rough=0.6)
    gl = lib.face_mats()["glove"]

    W, D, H = 1.0, 0.60, 0.95
    HING = V(0, 0.32, H)
    lid_M = Matrix.Translation(HING) @ Matrix.Rotation(radians(-22), 4, "X")   # front lifted: tools keep it ajar

    bm = _hollow_box(W, D, H, 0.05, wall=0.03, floor=0.10)
    bmesh.ops.translate(bm, vec=(0, 0, H / 2), verts=bm.verts)
    merge(bm, box_bm(1.04, 0.62, 0.17, r=0.06, seg=4), lid_M @ T((0, -0.31, 0.085)))
    body = finish(bm, "Body", blue, rig)

    # hinge barrel, latches (body plate + lid catch), carry handle
    finish(tube_bm([V(-0.30, 0.32, H + 0.02), V(0.30, 0.32, H + 0.02)], 0.035, ring=14), "Hinge", lmetal, rig)
    for side, sx in (("L", 1), ("R", -1)):
        bm = _xf(box_bm(0.13, 0.03, 0.17, r=0.012), Matrix.Translation((sx * 0.34, -0.314, H - 0.13)))
        merge(bm, lathe_bm([(0, 0), (0.026, 0), (0.026, 0.012), (0, 0.012)], 14),
              T((sx * 0.34, -0.33, H - 0.155), (radians(90), 0, 0)))
        merge(bm, box_bm(0.09, 0.03, 0.07, r=0.012), lid_M @ T((sx * 0.34, -0.62 - 0.012, 0.045)))
        finish(bm, f"Latch_{side}", lmetal, rig)
    arch = [V(0.26 * cos(t), -0.31, 0.17 + 0.21 * sin(t)) for t in [pi * k / 24 for k in range(25)]]
    bm = tube_bm(arch, 0.03, ring=14, cap_start="round", cap_end="round")
    for sx in (-1, 1):
        merge(bm, box_bm(0.08, 0.12, 0.05, r=0.015), T((sx * 0.26, -0.31, 0.17)))
    finish(_xf(bm, lid_M), "CarryHandle", yellow, rig)

    # tools leaning out through the gap: hammer (handle + head) and screwdriver
    d_h = V(0.10, -math.tan(radians(28)), 1).normalized()
    Mh = _axis_matrix(V(0.27, -0.17, H), d_h)
    bm = tube_bm([V(0, 0, -0.50), V(0, 0, 0.64)], [0.030, 0.026], ring=14, cap_start="round", cap_end=None)
    finish(_xf(bm, Mh), "Hammer_Handle", wood, rig)
    hp = lib.fillet2d([(0, -0.12), (0.055, -0.12), (0.055, 0.075), (0.036, 0.075), (0.012, 0.23), (0, 0.23)],
                      [0, 0.012, 0.01, 0.012, 0.012, 0], 4)
    hb = lathe_bm(lib.densify(hp, 0.03), 22)
    _xf(hb, Matrix.Translation((0, 0, 0.66)) @ Matrix.Rotation(radians(90), 4, "Y"))
    finish(_xf(hb, Mh), "Hammer_Head", steel, rig)

    d_s = V(-0.12, -math.tan(radians(32)), 1).normalized()
    Ms = _axis_matrix(V(-0.25, -0.21, H), d_s)
    sd = [(0, 0.30), (0.034, 0.30), (0.046, 0.34), (0.050, 0.42), (0.046, 0.55), (0.032, 0.61), (0, 0.625)]
    sbm = lathe_bm(lib.densify(lib.fillet2d(sd, [0, 0.01, 0.03, 0.03, 0.04, 0.04, 0], 4), 0.03), 24)
    merge(sbm, lathe_bm([(0, 0.27), (0.036, 0.27), (0.036, 0.315), (0, 0.315)], 20))
    finish(_xf(sbm, Ms), "Screwdriver_Handle", red, rig)
    shaft = tube_bm([V(0, 0, -0.45), V(0, 0, 0.28)], 0.012, ring=10, cap_start="round", cap_end=None)
    finish(_xf(shaft, Ms), "Screwdriver_Shaft", steel, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    face = build_face(rig, bvh, blue, eye_x=0.18, eye_z=0.60, eye=(0.05, 0.07, 0.024), mouth_z=0.43,
                      mouth_w=0.09, smile=0.035, cheek_x=0.29, cheek_z=0.49, cheek=(0.045, 0.028))
    ar, hr = build_arm("R", rig, V(-0.485, -0.03, 0.56), gl, armc, L=0.34, r=0.040, rest_deg=20, hand=1.25)
    al, hl = build_arm("L", rig, V(0.485, -0.03, 0.56), gl, armc, L=0.34, r=0.040, rest_deg=20, hand=1.25)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


BUILDERS = {"furniture": build_furniture, "plumbing": build_plumbing, "electric": build_electric,
            "repair": build_repair, "other": build_other}
