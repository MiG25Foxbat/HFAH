"""Toolbox contents for the `other` character: claw hammer, screwdriver, pliers, adjustable wrench, cordless drill.
Every builder returns [(mesh name, bmesh, material)] built along +Z in the tool's own frame (z = 0 at the box rim);
chars.build_other places them with `place()` (leaning forward through the lid gap).
Toy style: lathes, flattened tubes, bevelled boxes; no brand text."""
import bmesh, math
from math import radians
from mathutils import Vector, Matrix
import lib
from lib import merge, T, box_bm, lathe_bm, tube_bm, fillet, resample


def V(*a):
    return Vector(a)


def _xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts, space=Matrix.Identity(4))
    return bm


def _axis_matrix(base, direction):
    q = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    return Matrix.Translation(base) @ q.to_matrix().to_4x4()


def place(bm, base, direction, roll=0.0):
    return _xf(bm, _axis_matrix(Vector(base), direction) @ Matrix.Rotation(roll, 4, "Z"))


def _flat(bm, k):
    """Squash a bmesh in Y (flat tool bodies: pliers, wrench)."""
    return _xf(bm, Matrix.Diagonal((1.0, k, 1.0, 1.0)))


def _along_x(bm, z):
    """lathe built around Z -> around X at height z."""
    return _xf(bm, Matrix.Translation((0, 0, z)) @ Matrix.Rotation(radians(90), 4, "Y"))


def hammer(steel, polished, grip):
    """Claw hammer: tapered grip (butt at -0.46), steel shaft, big head: round striking face (+X), split curved claw (-X)."""
    gp = lib.fillet2d([(0, -0.46), (0.034, -0.46), (0.046, -0.44), (0.046, -0.36), (0.034, -0.30), (0.036, -0.10),
                       (0.040, 0.12), (0.030, 0.30), (0.027, 0.34), (0, 0.34)],
                      [0, 0.012, 0.014, 0.03, 0.04, 0.05, 0.05, 0.04, 0.01, 0], 5)
    handle = lathe_bm(lib.densify(gp, 0.03), 28)
    hp = lib.fillet2d([(0, -0.085), (0.040, -0.085), (0.056, -0.06), (0.058, 0.0), (0.058, 0.075), (0.052, 0.09),
                       (0.066, 0.105), (0.066, 0.185), (0.060, 0.205), (0, 0.205)],
                      [0, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01, 0.012, 0.014, 0], 4)
    head = _along_x(lathe_bm(lib.densify(hp, 0.025), 32), 0.54)
    merge(head, tube_bm([V(0, 0, 0.33), V(0, 0, 0.53)], [0.022, 0.027], ring=16, cap_start=None, cap_end=None))
    P = [V(-0.04, 0, 0.54), V(-0.21, 0, 0.545), V(-0.35, 0, 0.395)]
    n = 22
    path = resample(fillet(P, [0, 0.15, 0], 10), n)
    for sg in (-1, 1):                                    # two prongs with a V slot between them
        pts = [V(p.x, sg * (0.027 + 0.012 * k / n), p.z) for k, p in enumerate(path)]
        rad = [0.033 * (1 - k / n) + 0.011 * k / n for k in range(n + 1)]
        merge(head, tube_bm(pts, rad, ring=14, cap_start=None, cap_end="round"))
    face = _along_x(lathe_bm([(0, 0.2035), (0.054, 0.2035), (0.058, 0.2085), (0.058, 0.2145), (0, 0.2145)], 28), 0.54)
    return [("Hammer_Handle", handle, grip), ("Hammer_Head", head, steel), ("Hammer_Face", face, polished)]


def screwdriver(steel, red):
    sd = [(0, 0.30), (0.034, 0.30), (0.046, 0.34), (0.050, 0.42), (0.046, 0.55), (0.032, 0.61), (0, 0.625)]
    handle = lathe_bm(lib.densify(lib.fillet2d(sd, [0, 0.01, 0.03, 0.03, 0.04, 0.04, 0], 4), 0.03), 24)
    merge(handle, lathe_bm([(0, 0.27), (0.036, 0.27), (0.036, 0.315), (0, 0.315)], 20))
    shaft = tube_bm([V(0, 0, -0.45), V(0, 0, 0.28)], 0.012, ring=10, cap_start="round", cap_end=None)
    return [("Screwdriver_Handle", handle, red), ("Screwdriver_Shaft", shaft, steel)]


def pliers(steel, polished, grip):
    """Combination pliers, head up: two jaws, pivot boss with rivet, steel arms, coloured grips (mostly in the box)."""
    head = bmesh.new()
    for sg in (-1, 1):
        jaw = tube_bm([V(sg * 0.026, 0, 0.0), V(sg * 0.030, 0, 0.11), V(sg * 0.012, 0, 0.235)], [0.038, 0.030, 0.014],
                      ring=14, cap_start=None, cap_end="round")
        merge(head, _flat(jaw, 0.62))
        arm = tube_bm([V(sg * 0.030, 0, -0.01), V(sg * 0.050, 0, -0.14)], [0.030, 0.027], ring=12, cap_start="round",
                      cap_end=None)
        merge(head, _flat(arm, 0.70))
    X90 = Matrix.Translation((0, 0, 0.005)) @ Matrix.Rotation(radians(-90), 4, "X")
    boss = lathe_bm(lib.fillet2d([(0, -0.030), (0.054, -0.030), (0.054, 0.030), (0, 0.030)], [0, 0.012, 0.012, 0], 3), 28)
    merge(head, _xf(boss, X90))
    rivet = _xf(lathe_bm([(0, 0.030), (0.026, 0.030), (0.026, 0.040), (0, 0.044)], 20), X90)
    grips = bmesh.new()
    for sg in (-1, 1):
        g = tube_bm([V(sg * 0.050, 0, -0.14), V(sg * 0.075, 0, -0.30), V(sg * 0.100, 0, -0.50)], [0.036, 0.040, 0.038],
                    ring=14, cap_start="round", cap_end="round")
        merge(grips, _flat(g, 0.72))
    return [("Pliers_Head", head, steel), ("Pliers_Rivet", rivet, polished), ("Pliers_Grip", grips, grip)]


def wrench(metal):
    """Adjustable (monkey) wrench: flat tapered bar, jaw head tilted 18 deg with a slot, thumb wheel on the face."""
    bar = tube_bm([V(0, 0, -0.34), V(0, 0, 0.10), V(0, 0, 0.26)], [0.034, 0.040, 0.046], ring=18, cap_start="round",
                  cap_end=None)
    wr = _flat(bar, 0.34)
    t = 0.026
    head = bmesh.new()
    for (w, h, cx, cz) in ((0.17, 0.085, 0.0, 0.0), (0.050, 0.17, -0.060, 0.115), (0.046, 0.115, 0.067, 0.088)):
        merge(head, box_bm(w, t, h, r=0.014, seg=3), T((cx, 0, cz)))
    _xf(head, Matrix.Translation((0, 0, 0.25)) @ Matrix.Rotation(radians(18), 4, "Y"))
    merge(wr, head)
    wheel = lathe_bm(lib.fillet2d([(0, -0.020), (0.034, -0.020), (0.034, 0.020), (0, 0.020)], [0, 0.008, 0.008, 0], 3), 24)
    merge(wr, _xf(wheel, Matrix.Translation((0.050, 0, 0.225)) @ Matrix.Rotation(radians(-90), 4, "X")))
    return [("Wrench", wr, metal)]


def drill(steel, body_m, dark_m):
    """Cordless drill/driver, chuck up: tapered housing, clutch ring, chuck with bit, pistol grip + battery (hidden)."""
    barrel = lathe_bm(lib.densify(lib.fillet2d([(0, -0.08), (0.040, -0.08), (0.060, -0.05), (0.064, 0.04), (0.060, 0.17),
                                                (0.050, 0.25), (0, 0.25)], [0, 0.02, 0.03, 0.03, 0.03, 0.02, 0], 4), 0.03), 28)
    chuck = lathe_bm(lib.densify(lib.fillet2d([(0, 0.28), (0.036, 0.28), (0.042, 0.31), (0.036, 0.39), (0.028, 0.395),
                                               (0, 0.395)], [0, 0.01, 0.02, 0.012, 0.01, 0], 3), 0.025), 24)
    merge(chuck, tube_bm([V(0, 0, 0.39), V(0, 0, 0.52)], 0.008, ring=8, cap_start=None, cap_end="round"))
    grip = tube_bm([V(0, 0.005, -0.01), V(0, 0.05, -0.20)], 0.038, ring=14, cap_start="round", cap_end=None)
    merge(grip, box_bm(0.09, 0.11, 0.06, r=0.02, seg=3), T((0, 0.05, -0.23)))
    merge(grip, lathe_bm([(0, 0.245), (0.054, 0.245), (0.054, 0.285), (0, 0.285)], 28))
    return [("Drill_Body", barrel, body_m), ("Drill_Chuck", chuck, steel), ("Drill_Grip", grip, dark_m)]
