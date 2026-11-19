"""The six character builders. Each returns a dict of the key objects."""
import bpy, bmesh, math
from math import radians, pi, sin, cos
from mathutils import Vector, Matrix, Quaternion
import lib
import toolbox_tools as tt
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


def _axis_matrix(base, direction):
    q = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    return Matrix.Translation(base) @ q.to_matrix().to_4x4()


def _xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts, space=Matrix.Identity(4))
    return bm


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


# ===================================================================== 2. Plumbing (single-lever mixer tap)
def build_plumbing():
    root, rig = start("plumbing", "Plumbing")
    chrome = mat("Chrome", "#EEF2F5", rough=0.2, metal=0.7)
    blue = mat("LeverBlue", "#4E8FCB", rough=0.45, spec=0.6)
    dark = mat("Aerator", "#56626F", rough=0.4, metal=0.4)
    gl = lib.face_mats()["glove"]

    # pillar body: round base, tall body, sloping shoulder, domed top that carries the cartridge
    prof = [(0, 0), (0.42, 0), (0.42, 0.07), (0.34, 0.10), (0.34, 0.17), (0.30, 0.21), (0.30, 1.00),
            (0.20, 1.17), (0.20, 1.20), (0, 1.21)]
    rad = [0, 0.03, 0.03, 0.02, 0.02, 0.04, 0.10, 0.07, 0.02, 0]
    prof = lib.densify(lib.fillet2d(prof, rad, 6), 0.06)
    bm = lathe_bm(prof, 56)
    # spout: chunky tube straight forward from the shoulder, then bending ~31 deg down into the aerator
    P = [V(0, -0.10, 1.07), V(0, -0.80, 1.07), V(0, -1.03, 0.93)]
    path = resample(fillet(P, [0, 0.26, 0], 12), 44)
    merge(bm, tube_bm(path, 0.098, ring=24, cap_start="flat", cap_end="flat"))
    d_end = (P[2] - P[1]).normalized()
    # collar where the spout leaves the body, aerator ring around the mouth
    collar = lathe_bm(lib.fillet2d([(0, 0.0), (0.122, 0.0), (0.122, 0.075), (0, 0.075)], [0, 0.02, 0.02, 0], 3), 28)
    merge(bm, _xf(collar, _axis_matrix(V(0, -0.23, 1.07), V(0, -1, 0))))
    ring = lathe_bm(lib.densify(lib.fillet2d([(0, -0.04), (0.112, -0.04), (0.112, 0.062), (0, 0.062)],
                                             [0, 0.018, 0.02, 0], 3), 0.03), 28)
    merge(bm, _xf(ring, _axis_matrix(P[2], d_end)))
    body = finish(bm, "Body", chrome, rig)
    # dark aerator disc: the visible mouth of the spout
    disc = lathe_bm([(0, 0.058), (0.078, 0.058), (0.086, 0.066), (0, 0.066)], 24)
    finish(_xf(disc, _axis_matrix(P[2], d_end)), "Aerator", dark, rig)

    # single-lever head: cylindrical cartridge standing on the pillar + flat paddle lever (blue) lying over it
    CT = 1.275                                           # cartridge top
    cart = lathe_bm(lib.densify(lib.fillet2d([(0, 1.17), (0.172, 1.17), (0.172, 1.235), (0.160, 1.243), (0.160, 1.262),
                                              (0.172, 1.270), (0.172, CT), (0, CT)],
                                             [0, 0.01, 0.008, 0.006, 0.006, 0.008, 0.022, 0], 4), 0.02), 40)
    az, tilt, L = radians(-52), radians(15), 0.72         # paddle points back and to the viewer's right, rising a little
    th = 0.18 * 0.42                                    # paddle half-thickness
    paddle = tube_bm([V(0, 0, 0), V(0, L, 0)], [0.18, 0.135], ring=32, cap_start="round", cap_end="round", cap_steps=5)
    bmesh.ops.transform(paddle, matrix=Matrix.Diagonal((1.0, 1.0, 0.42, 1.0)), verts=paddle.verts, space=Matrix.Identity(4))
    M = Matrix.Translation((0, 0, CT + th * 0.9)) @ Matrix.Rotation(az, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
    finish(_xf(paddle, M), "LeverTip", blue, rig)
    merge(cart, lathe_bm([(0, 0), (0.058, 0), (0.062, 0.012), (0.054, 0.024), (0, 0.028)], 24), T((0, 0, CT + th * 1.9 - 0.004)))
    finish(cart, "Lever", chrome, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    face = build_face(rig, bvh, chrome, eye_x=0.105, eye_z=0.69, eye=(0.047, 0.066, 0.022), mouth_z=0.51,
                      mouth_w=0.078, smile=0.03, cheek_x=0.19, cheek_z=0.58)
    ar, hr = build_arm("R", rig, V(-0.285, -0.03, 0.62), gl, chrome, L=0.34, r=0.034, rest_deg=20, hand=1.1)
    al, hl = build_arm("L", rig, V(0.285, -0.03, 0.62), gl, chrome, L=0.34, r=0.034, rest_deg=20, hand=1.1)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


# ===================================================================== 3. Electric (desk lamp)
LAMP_ARM = dict(L=0.44, rest=26)


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
    # shoulders on the top of the stem, just under the bulb (they used to sit under the shade rim): arms hang out
    # from the metal socket, 26 deg from vertical, and clear the shade when waving (see assemble.WAVE)
    sh = lambda sx: V(sx * 0.052, -0.02, 0.91)
    ar, hr = build_arm("R", rig, sh(-1), gl, metal, L=LAMP_ARM["L"], r=0.032, rest_deg=LAMP_ARM["rest"], hand=1.1)
    al, hl = build_arm("L", rig, sh(1), gl, metal, L=LAMP_ARM["L"], r=0.032, rest_deg=LAMP_ARM["rest"], hand=1.1)
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


TOOL_PLACE = {   # per tool: base (x, y) at the rim, axis direction (leaning forward through the lid gap), roll about own axis
    "Drill": dict(base=(-0.37, -0.17), dir=(-0.40, -0.62, 1), roll=radians(20), lift=0.12),
    "Screwdriver": dict(base=(-0.19, -0.22), dir=(-0.10, -0.55, 1)),
    "Pliers": dict(base=(0.02, -0.20), dir=(0.0, -0.50, 1), roll=radians(0), lift=0.10),
    "Wrench": dict(base=(0.205, -0.17), dir=(0.10, -0.55, 1), roll=radians(0)),
    "Hammer": dict(base=(0.37, -0.17), dir=(0.18, -0.53, 1), roll=radians(-30)),
}


def build_other():
    root, rig = start("other", "Other")
    blue = mat("Blue", "#2E57D1", rough=0.6, spec=0.5)
    yellow = mat("Handle", "#F2B531", rough=0.5, spec=0.55)
    lmetal = mat("LatchMetal", "#D9DEE5", rough=0.35, metal=0.5)
    steel = mat("Steel", "#9AA3AD", rough=0.32, metal=0.6)
    wood = mat("ToolWood", "#C99A5E", rough=0.6)
    red = mat("Screwdriver", "#E5533D", rough=0.5, spec=0.55)
    orange = mat("PliersGrip", "#F08A3C", rough=0.5, spec=0.5)
    drill_g = mat("Drill", "#3FB68B", rough=0.45, spec=0.5)
    drill_d = mat("DrillDark", "#3A3F47", rough=0.55)
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

    # tools leaning out through the gap, fanned left to right: drill, screwdriver, pliers, wrench, claw hammer
    tools = (tt.drill(steel, drill_g, drill_d) + tt.screwdriver(steel, red) + tt.pliers(steel, lmetal, orange)
             + tt.wrench(lmetal) + tt.hammer(steel, lmetal, yellow))
    for name, bmx, material in tools:
        pl = TOOL_PLACE[name.split("_")[0]]
        d = V(*pl["dir"]).normalized()
        base = V(*pl["base"], H) + d * pl.get("lift", 0.0)
        finish(tt.place(bmx, base, d, pl.get("roll", 0.0)), name, material, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    face = build_face(rig, bvh, blue, eye_x=0.18, eye_z=0.60, eye=(0.05, 0.07, 0.024), mouth_z=0.43,
                      mouth_w=0.09, smile=0.035, cheek_x=0.29, cheek_z=0.49, cheek=(0.045, 0.028))
    ar, hr = build_arm("R", rig, V(-0.485, -0.03, 0.56), gl, armc, L=0.34, r=0.040, rest_deg=20, hand=1.25)
    al, hl = build_arm("L", rig, V(0.485, -0.03, 0.56), gl, armc, L=0.34, r=0.040, rest_deg=20, hand=1.25)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


# ===================================================================== 6. Appliances (front-loading washing machine)
def _front(bm, x, y, z):
    """Lathe built around +Z (z = height above the surface) -> stands on the front face (-Y) at (x, y, z)."""
    return _xf(bm, Matrix.Translation((x, y, z)) @ Matrix.Rotation(radians(90), 4, "X"))


def build_appliances():
    root, rig = start("appliances", "Appliances")
    lav = mat("Lavender", "#8E7CE0", rough=0.5)
    white = mat("Enamel", "#F4F1FA", rough=0.35)
    chrome = mat("Chrome", "#EEF2F5", rough=0.22, metal=0.65)
    gasket = mat("Gasket", "#3A3D4A", rough=0.7)
    drum = mat("Drum", "#232645", rough=0.4)
    water = mat("Water", "#7FC8F2", rough=0.18)
    laundry = mat("Laundry", "#F7A6B7", rough=0.8)
    foam = mat("Foam", "#FFFFFF", rough=0.3)
    glass = mat("Glass", "#CFE8FF", rough=0.05, alpha=0.30)
    mark = mat("KnobMark", "#5B4BB5", rough=0.5)
    disp = mat("Display", "#1B1E3A", rough=0.25)
    glow = mat("DisplayGlow", "#8CF5E8", rough=0.4, emit="#8CF5E8", emit_k=1.0)
    feet_m = mat("Feet", "#34364A", rough=0.6)
    armc = mat("ArmTube", "#6A58C4", rough=0.55)
    gl = lib.face_mats()["glove"]

    W, D, Z0, Z1 = 1.12, 0.92, 0.08, 1.60
    YF = -D / 2                                   # front face
    PF = YF - 0.014                               # control-panel face (proud of the front by 14 mm)
    DZ = 0.66                                     # porthole centre height

    # cube body with soft bevels + a raised control panel plate (same mesh/material: the cleaning surface)
    bm = box_bm(W, D, Z1 - Z0, r=0.07, seg=5)
    bmesh.ops.translate(bm, vec=(0, 0, (Z0 + Z1) / 2), verts=bm.verts)
    merge(bm, box_bm(W - 0.20, 0.06, 0.33, r=0.035, seg=4), T((0, YF + 0.016, 1.35)))
    body = finish(bm, "Body", lav, rig)

    # feet
    fb = bmesh.new()
    prof = lib.fillet2d([(0, 0), (0.058, 0), (0.058, 0.10), (0, 0.10)], [0, 0.012, 0.01, 0], 3)
    for sx in (-1, 1):
        for sy in (-1, 1):
            merge(fb, lathe_bm(prof, 20), T((sx * 0.42, sy * 0.32, 0)))
    finish(fb, "Feet", feet_m, rig)

    # porthole door: chrome ring, rubber gasket, dark drum with laundry + water + bubbles, glass dome with a highlight
    ring = lathe_bm([(0.360, 0.0), (0.358, 0.024), (0.338, 0.052), (0.304, 0.062), (0.272, 0.042), (0.256, 0.014),
                     (0.250, 0.0)], 40)
    finish(_front(ring, 0, YF, DZ), "Door_Ring", chrome, rig)
    gk = lathe_bm([(0.262, 0.0), (0.258, 0.046), (0.222, 0.052), (0.192, 0.030), (0.185, 0.0)], 40)
    finish(_front(gk, 0, YF, DZ), "Door_Gasket", gasket, rig)
    finish(_front(lathe_bm([(0.215, 0.0), (0.215, 0.006), (0, 0.006)], 40), 0, YF, DZ), "Door_Drum", drum, rig)
    # water: a wavy-topped circular segment in the lower part of the drum
    wb = bmesh.new()
    R_, z0 = 0.205, -0.075
    xs = [-0.2 + 0.4 * k / 24 for k in range(25)]
    top = [wb.verts.new((x, z0 + 0.016 * math.sin(x * 22 + 0.6), 0.012)) for x in xs]
    bot = [wb.verts.new((x, -math.sqrt(R_ ** 2 - x * x), 0.012)) for x in xs]
    for k in range(24):
        wb.faces.new([bot[k], bot[k + 1], top[k + 1], top[k]])
    finish(_front(wb, 0, YF, DZ), "Door_Water", water, rig)
    lb = sphere_bm(0.115, 0.075, 0.042, 24, 14)
    lb = _xf(lb, Matrix.Translation((0.03, -0.085, 0.030)))
    merge(lb, sphere_bm(0.075, 0.055, 0.03, 18, 10), T((-0.075, -0.035, 0.040)))
    finish(_front(lb, 0, YF, DZ), "Door_Laundry", laundry, rig)
    fb = bmesh.new()
    for (bx, bz, br) in ((-0.10, -0.115, 0.026), (-0.045, -0.03, 0.019), (0.10, -0.095, 0.03), (0.15, -0.02, 0.018),
                         (0.03, -0.15, 0.021), (-0.16, -0.02, 0.016), (0.02, 0.07, 0.013)):
        merge(fb, sphere_bm(br, br, br, 14, 8), T((bx, bz, 0.062)))
    finish(_front(fb, 0, YF, DZ), "Door_Bubbles", foam, rig)
    # glass: shallow dome (alpha), plus a white highlight arc on it
    RG, HG, AG = 0.47, 0.072, 0.252
    ph0 = math.asin(AG / RG)
    gprof = [(RG * math.sin(ph0 * (1 - k / 14)), HG - RG + RG * math.cos(ph0 * (1 - k / 14))) for k in range(15)]
    finish(_front(lathe_bm(gprof, 40), 0, YF, DZ), "Door_Glass", glass, rig)
    arc = []
    for k in range(13):
        a = radians(120 + 50 * k / 12)
        r_ = 0.165
        arc.append(V(r_ * math.cos(a), r_ * math.sin(a), HG - RG + math.sqrt(RG ** 2 - r_ ** 2) + 0.004))
    ab = tube_bm(arc, [0.006 + 0.007 * math.sin(math.pi * k / 12) for k in range(13)], ring=8, cap_start="round", cap_end="round")
    finish(_front(ab, 0, YF, DZ), "Door_Shine", lib.face_mats()["shine"], rig)

    # control panel: program knob (left) with dial dots, small display (right)
    KX, KZ = -0.345, 1.385
    kn = lathe_bm(lib.densify(lib.fillet2d([(0, 0), (0.076, 0), (0.076, 0.040), (0.062, 0.056), (0, 0.058)],
                                           [0, 0.004, 0.014, 0.02, 0], 4), 0.02), 36)
    finish(_front(kn, KX, PF, KZ), "Knob", white, rig)
    km = box_bm(0.016, 0.014, 0.052, r=0.005, seg=2)
    km = _xf(km, Matrix.Translation((KX, PF - 0.060, KZ + 0.036)))
    for k in range(7):                                     # program dots around the knob
        a = radians(-110 + 220 * k / 6)
        merge(km, sphere_bm(0.0095, 0.006, 0.0095, 8, 6), T((KX + 0.100 * math.sin(a), PF - 0.004, KZ + 0.100 * math.cos(a))))
    finish(km, "KnobMark", mark, rig)
    DX, DZ2 = 0.325, 1.395
    finish(_xf(box_bm(0.25, 0.026, 0.115, r=0.018, seg=3), Matrix.Translation((DX, PF - 0.007, DZ2))), "Display", disp, rig)
    gb = bmesh.new()
    for ox in (-0.085, -0.045, 0.045, 0.085):
        merge(gb, box_bm(0.020, 0.010, 0.056, r=0.006, seg=2), T((DX + ox, PF - 0.024, DZ2)))
    for oz in (-0.016, 0.016):
        merge(gb, sphere_bm(0.009, 0.006, 0.009, 8, 6), T((DX, PF - 0.024, DZ2 + oz)))
    finish(gb, "Display_Glow", glow, rig)

    bpy.context.view_layer.update()
    bvh = make_bvh([body])
    flat = lambda x, z: (V(x, PF, z), V(0, -1, 0))
    face = build_face(rig, bvh, lav, eye_x=0.115, eye_z=1.40, eye=(0.05, 0.07, 0.024), mouth_z=1.29,
                      mouth_w=0.08, smile=0.032, cheek_x=0.215, cheek_z=1.32, hit=flat)
    ar, hr = build_arm("R", rig, V(-0.565, -0.05, 0.88), gl, armc, L=0.36, r=0.038, rest_deg=20, hand=1.25)
    al, hl = build_arm("L", rig, V(0.565, -0.05, 0.88), gl, armc, L=0.36, r=0.038, rest_deg=20, hand=1.25)
    return dict(root=root, rig=rig, body=body, face=face, arms=(ar, al), hands=(hr, hl))


BUILDERS = {"furniture": build_furniture, "plumbing": build_plumbing, "electric": build_electric,
            "repair": build_repair, "other": build_other, "appliances": build_appliances}
