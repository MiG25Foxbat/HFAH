"""Shared helpers for the Zaprosto characters (Blender 5.x, headless-safe).

Conventions: Z up, characters face -Y, origin bottom-centre on z=0, ~1.6 units tall.
Names are prefixed "<cat>." inside the .blend (Blender needs unique names) and the
prefix is stripped on glTF export, so the GLBs contain Body / Face / Lid_L ... as contracted.
"""
import bpy, bmesh, math, os
from math import sin, cos, pi, radians
from collections import defaultdict
from mathutils import Vector, Matrix, Euler, Quaternion
from mathutils.bvhtree import BVHTree

BASE = r"C:/Users/debil/hfah-dev/blender-work"
CAT = ["x"]          # current category id (furniture, plumbing, ...)
COLL = [None]        # current collection
FPS = 50
HAND_SCALE = 1.25   # art-direction pass: mittens + thumbs +25% for legibility at ~200 px


def N(n):
    return f"{CAT[0]}.{n}"


# ----------------------------------------------------------------- colour / material
def _s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    h = h.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (_s2l(r), _s2l(g), _s2l(b), a)


_MATS = {}


def mat(name, hexcolor, rough=0.7, metal=0.0, spec=0.5, emit=None, emit_k=1.0, coat=0.0, alpha=None):
    key = (CAT[0], name)
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(N(name))
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hexc(hexcolor)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    # spec/coat are intentionally ignored: they would export KHR_materials_specular/clearcoat and force
    # MeshPhysicalMaterial in three.js; plain metal-rough keeps mobile cost low.
    m.use_backface_culling = True
    if emit:
        b.inputs["Emission Color"].default_value = hexc(emit)
        b.inputs["Emission Strength"].default_value = emit_k
    if alpha is not None:            # glTF alphaMode BLEND (plain metal-rough material, no transmission extension)
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    m.diffuse_color = hexc(hexcolor)
    _MATS[key] = m
    return m


# ----------------------------------------------------------------- objects
def new_coll(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    COLL[0] = c
    return c


def empty(name, parent=None, loc=(0, 0, 0), display="PLAIN_AXES", size=0.05):
    o = bpy.data.objects.new(N(name), None)
    o.empty_display_type = display
    o.empty_display_size = size
    COLL[0].objects.link(o)
    o.parent = parent
    o.location = loc
    return o


def finish(bm, name, material, parent=None, loc=(0, 0, 0), rot=None, smooth=True,
           normals="area", origin=None):
    """bmesh -> object. origin: optional world point (in bm space) to move the origin to."""
    if origin is not None:
        o = Vector(origin)
        bmesh.ops.translate(bm, vec=-o, verts=bm.verts)
        loc = (Vector(loc) + o)
    me = bpy.data.meshes.new(N(name))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    if normals == "area" and smooth:
        area_normals(me)
    if material is not None:
        me.materials.append(material)
    ob = bpy.data.objects.new(N(name), me)
    COLL[0].objects.link(ob)
    ob.parent = parent
    ob.location = loc
    if rot is not None:
        ob.rotation_mode = "QUATERNION" if isinstance(rot, Quaternion) else "XYZ"
        if isinstance(rot, Quaternion):
            ob.rotation_quaternion = rot
        else:
            ob.rotation_euler = rot
    return ob


def area_normals(me):
    """Smooth vertex normals weighted by face area, welded by position (fixes pillow shading on
    bevelled flats and seams). Needs no auto-smooth in Blender >= 4.1."""
    me.update()
    acc = defaultdict(Vector)
    key = lambda co: (round(co.x, 4), round(co.y, 4), round(co.z, 4))
    for p in me.polygons:
        n = p.normal * p.area
        for vi in p.vertices:
            acc[key(me.vertices[vi].co)] += n
    out = []
    for l in me.loops:
        n = acc[key(me.vertices[l.vertex_index].co)]
        out.append(n.normalized() if n.length > 1e-12 else Vector((0, 0, 1)))
    me.normals_split_custom_set(out)


def merge(dst, src, M=None):
    vm = {}
    for v in src.verts:
        vm[v] = dst.verts.new(M @ v.co if M is not None else v.co)
    for f in src.faces:
        try:
            dst.faces.new([vm[v] for v in f.verts])
        except ValueError:
            pass
    src.free()


def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @
            Matrix.Diagonal((scale[0], scale[1], scale[2], 1)))


# ----------------------------------------------------------------- primitives (into bmesh)
def box_bm(sx, sy, sz, r=0.02, seg=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    if r > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(r, min(sx, sy, sz) * 0.49), segments=seg,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def sphere_bm(rx, ry=None, rz=None, u=24, v=14):
    ry = rx if ry is None else ry
    rz = rx if rz is None else rz
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for vt in bm.verts:
        vt.co.x *= rx
        vt.co.y *= ry
        vt.co.z *= rz
    return bm


def densify(profile, step):
    """Insert points so no profile segment is longer than `step`."""
    out = [tuple(profile[0])]
    for a, b in zip(profile, profile[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(math.ceil(L / step)))
        for k in range(1, n + 1):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def lathe_bm(profile, segs=40, weld=True):
    """Surface of revolution around Z. profile = [(r, z), ...] traversed so that outward normals
    come out right when going up the outside (and down the inside of a shell)."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if abs(r) < 1e-7:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * cos(2 * pi * j / segs), r * sin(2 * pi * j / segs), z))
                          for j in range(segs)])
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        if len(A) == 1 and len(B) == 1:
            continue
        for j in range(segs):
            j1 = (j + 1) % segs
            if len(A) == 1:
                tri = [A[0], B[j1], B[j]]
            elif len(B) == 1:
                tri = [A[j], A[j1], B[0]]
            else:
                tri = [A[j], A[j1], B[j1], B[j]]
            try:
                bm.faces.new(tri)
            except ValueError:
                pass
    if weld:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm


def fillet(points, radius, steps=6):
    """Round the interior corners of a polyline (Vectors) with quadratic Beziers."""
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, p, b = pts[i - 1], pts[i], pts[i + 1]
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        da, db = a - p, b - p
        d = min(r, da.length * 0.5, db.length * 0.5)
        t1 = p + da.normalized() * d
        t2 = p + db.normalized() * d
        for k in range(steps + 1):
            t = k / steps
            out.append((1 - t) ** 2 * t1 + 2 * (1 - t) * t * p + t * t * t2)
    out.append(pts[-1])
    return out


def fillet2d(points, radius, steps=6):
    return [(v.x, v.y) for v in fillet([Vector((p[0], p[1], 0)) for p in points], radius, steps)]


def resample(path, n):
    """n+1 points evenly spaced by arc length along a polyline."""
    pts = [Vector(p) for p in path]
    L = [0.0]
    for i in range(1, len(pts)):
        L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    out = []
    for k in range(n + 1):
        d = L[-1] * k / n
        for i in range(1, len(pts)):
            if d <= L[i] + 1e-9:
                t = (d - L[i - 1]) / max(L[i] - L[i - 1], 1e-9)
                out.append(pts[i - 1].lerp(pts[i], t))
                break
    return out


def tube_bm(path, radius, ring=12, cap_start="round", cap_end="round", cap_steps=3):
    """Sweep a circle along a polyline. radius: float or list per point."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    rad = radius if isinstance(radius, (list, tuple)) else [radius] * n
    tang = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        tang.append((b - a).normalized())
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = [(tang[0].cross(ref)).normalized()]
    for i in range(1, n):
        v = nrm[-1] - tang[i] * nrm[-1].dot(tang[i])
        nrm.append(v.normalized())
    bin_ = [tang[i].cross(nrm[i]) for i in range(n)]

    def ring_at(c, r, i):
        return [c + (nrm[i] * cos(2 * pi * j / ring) + bin_[i] * sin(2 * pi * j / ring)) * r
                for j in range(ring)]

    rings = []  # list of (list_of_points)
    if cap_start == "round":
        for k in range(cap_steps, 0, -1):
            th = (k / cap_steps) * pi / 2
            c = pts[0] - tang[0] * rad[0] * sin(th)
            r = rad[0] * cos(th)
            rings.append([c] if r < 1e-6 else ring_at(c, r, 0))
    for i in range(n):
        rings.append(ring_at(pts[i], rad[i], i))
    if cap_end == "round":
        for k in range(1, cap_steps + 1):
            th = (k / cap_steps) * pi / 2
            c = pts[-1] + tang[-1] * rad[-1] * sin(th)
            r = rad[-1] * cos(th)
            rings.append([c] if r < 1e-6 else ring_at(c, r, n - 1))
    bm = bmesh.new()
    R = [[bm.verts.new(p) for p in rg] for rg in rings]
    for i in range(len(R) - 1):
        A, B = R[i], R[i + 1]
        for j in range(ring):
            j1 = (j + 1) % ring
            if len(A) == 1:
                tri = [A[0], B[j1], B[j]]
            elif len(B) == 1:
                tri = [A[j], A[j1], B[0]]
            else:
                tri = [A[j], A[j1], B[j1], B[j]]
            try:
                bm.faces.new(tri)
            except ValueError:
                pass
    if cap_start == "flat":
        bm.faces.new(R[0][::-1])
    if cap_end == "flat":
        bm.faces.new(R[-1])
    return bm


def displace_nap(bm, centre, falloff_r, amp=0.008, freq=38.0, protect=None):
    """Roller fur: noise displacement along vertex normals, damped near `protect` (face area)."""
    from mathutils import noise
    bm.normal_update()
    for v in bm.verts:
        n = noise.noise(v.co * freq) * 0.65 + noise.noise(v.co * freq * 2.1 + Vector((9, 3, 5))) * 0.35
        k = 1.0
        if protect is not None:
            d = (v.co - protect[0]).length
            if d < protect[1]:
                k = max(0.0, (d / protect[1])) ** 2
        v.co += v.normal * (n * amp * k)


# ----------------------------------------------------------------- face + arms
FACE_MATS = {}


def face_mats():
    return dict(
        eye=mat("Eye", "#12161C", rough=0.08),
        shine=mat("EyeShine", "#FFFFFF", rough=0.4, emit="#FFFFFF", emit_k=0.8),
        mouth=mat("Mouth", "#2B1E1B", rough=0.45),
        cheek=mat("Cheek", "#F08F8A", rough=0.85),
        glove=mat("Glove", "#F6F2EA", rough=0.75),
        palm=mat("GlovePalm", "#E8DDCC", rough=0.95),
    )


def make_bvh(objs):
    verts, polys = [], []
    for ob in objs:
        base = len(verts)
        mw = ob.matrix_world
        verts += [mw @ v.co for v in ob.data.vertices]
        polys += [tuple(base + i for i in p.vertices) for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def build_face(rig, bvh, body_mat, *, eye_x=0.13, eye_z=1.0, eye=(0.047, 0.066, 0.022),
               mouth_z=0.88, mouth_w=0.075, smile=0.03, mouth_r=0.0115,
               cheek_x=None, cheek_z=None, cheek=(0.042, 0.026), hit=None, lid_mat=None):
    fm = face_mats()
    face = empty("Face", rig, display="CIRCLE", size=0.08)
    rx, rz, ry = eye

    def H(x, z):
        if hit is not None:
            return hit(x, z)
        loc, nrm, _, _ = bvh.ray_cast(Vector((x, -6.0, z)), Vector((0, 1, 0)))
        assert loc is not None, f"face ray missed at {x},{z}"
        return loc, nrm.normalized()

    for side, sx in (("L", 1), ("R", -1)):
        loc, n = H(sx * eye_x, eye_z)
        q = n.to_track_quat("-Y", "Z")
        c = loc + n * 0.004
        # eye
        finish(sphere_bm(rx, ry, rz, 28, 16), f"Eye_{side}", fm["eye"], face, c, q)
        # highlight (disc-like sphere on the eye surface, upper outer corner)
        a, b = 0.30, 0.40                     # both highlights upper-right on screen
        yy = -ry * math.sqrt(max(0.05, 1 - a * a - b * b))
        pos = c + q @ Vector((a * rx, yy - 0.001, b * rz))
        finish(sphere_bm(0.0135, 0.007, 0.0135, 14, 8), f"EyeShine_{side}", fm["shine"], face, pos, q)
        # lid: body-coloured dome, origin at its top, hidden at scale ~0, closes by scaling up
        lrx, lrz, lry = rx * 1.34, rz * 1.26, ry * 1.4 + 0.003
        bm = sphere_bm(lrx, lry, lrz, 24, 14)
        bmesh.ops.translate(bm, vec=(0, 0, -lrz), verts=bm.verts)
        top = c + q @ Vector((0, -0.003, lrz))
        # Lid_<side> is an (animated) pivot empty; the mesh is its child, so mesh quantisation never has to
        # touch an animated node when the GLB is optimised.
        lid = empty(f"Lid_{side}", face, top, display="SPHERE", size=0.01)
        lid.rotation_mode = "QUATERNION"
        lid.rotation_quaternion = q
        lid.scale = (0.001, 0.001, 0.001)
        finish(bm, f"Lid_{side}_Cap", lid_mat or body_mat, lid, normals=None)
        # cheek
        if cheek_x is not None:
            cl, cn = H(sx * cheek_x, cheek_z)
            cq = cn.to_track_quat("-Y", "Z")
            finish(sphere_bm(cheek[0], 0.014, cheek[1], 16, 10), f"Cheek_{side}", fm["cheek"], face,
                   cl + cn * 0.0015, cq)
    # mouth: smile arc conformed to the surface
    pts = []
    for i in range(15):
        x = mouth_w * (2 * i / 14 - 1)
        z = mouth_z + smile * (x / mouth_w) ** 2
        loc, n = H(x, z)
        pts.append(loc + n * (mouth_r * 0.55))
    mc = Vector((0, 0, 0))
    finish(tube_bm(pts, mouth_r, ring=8), "Mouth", fm["mouth"], face, normals=None)
    return face


def _squircle(nx, nz, k=0.55):
    """Radial stretch that turns the xz outline of a sphere into a rounded square (k = 0 circle .. 1 squircle)."""
    n2 = math.hypot(nx, nz)
    if n2 < 1e-6:
        return 1.0
    q = n2 / (nx ** 4 + nz ** 4) ** 0.25
    return 1 + k * (q - 1)


def hand_bm(s, out=-1):
    """Flat mitten: hangs along -Z from the wrist, back of the hand +Y (convex), palm -Y (shallow dish over the whole palm).
    Returns (mitten bmesh, palm bmesh). The palm is a thin skin (material GlovePalm) laid on the dish: it follows the
    mitten outline, inset ~5 % from the rim with a tapered edge (the last rings dip under the surface).
    `out` = x direction of the outer (thumb) side (unused for the palm, kept for the signature)."""
    from mathutils.bvhtree import BVHTree
    hx, hz, zc = 0.056 * s, 0.058 * s, -0.066 * s
    hyb, hyp, dish = 0.034 * s, 0.025 * s, 0.014 * s
    bm = sphere_bm(1, 1, 1, 32, 20)
    for v in bm.verts:
        nx, ny, nz = v.co
        q = _squircle(nx, nz)
        x = nx * q * hx * (1 - 0.10 * nz)
        z = zc + nz * q * hz
        y = ny * (hyb if ny > 0 else hyp)
        if ny < 0:
            e = (x / hx) ** 2 + ((z - zc) / hz) ** 2
            y += dish * max(0.0, 1 - e / 1.15) ** 1.6 * (-ny)
        v.co = Vector((x, y, z))
    # palm skin: polar grid scaled to the mitten outline, rays onto the dish
    bvh = BVHTree.FromBMesh(bm)
    pad = bmesh.new()
    #        (fraction of the outline, offset above the surface in units of s)  last rings dip under the surface = soft edge
    rings = [(0.0, 0.0026), (0.12, 0.0026), (0.25, 0.0026), (0.38, 0.0026), (0.5, 0.0026), (0.62, 0.0025), (0.73, 0.0024),
             (0.83, 0.0022), (0.90, 0.0016), (0.945, 0.0004), (0.97, -0.0025)]
    segs = 36
    R = []
    for a, off in rings:
        ring = []
        for j in range(1 if a == 0.0 else segs):
            t = 2 * pi * j / segs
            nx, nz = cos(t), sin(t)
            q = _squircle(nx, nz)
            ox = nx * q * hx * (1 - 0.10 * nz)
            oz = nz * q * hz
            x, z = a * ox, zc + a * oz
            loc, nrm, _, _ = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
            assert loc is not None
            ring.append(pad.verts.new(loc + Vector((0, -off * s, 0))))
        R.append(ring)
    for i in range(len(R) - 1):
        A, B = R[i], R[i + 1]
        for j in range(segs):
            j1 = (j + 1) % segs
            tri = [A[0], B[j], B[j1]] if len(A) == 1 else [A[j], B[j], B[j1], A[j1]]
            try:
                pad.faces.new(tri)
            except ValueError:
                pass
    pad.normal_update()
    if sum(f.normal.y for f in pad.faces) > 0:                            # normals point to -Y (palm side)
        bmesh.ops.reverse_faces(pad, faces=list(pad.faces))
    return bm, pad


def cuff_bm(s, r_tube, segs=32):
    """Wrist cuff: rounded ring r = 0.043 s, flattened in Y like the mitten, open top whose hole is the arm tube
    (hole circle blends into the flattened outline so the tube never pokes through the surface)."""
    r_out, zb, zt, f = 0.043 * s, -0.030 * s, 0.016 * s, 0.010 * s
    r_in = 0.97 * r_tube
    ky = min(1.0, max(0.74, (r_tube + 0.012) / r_out))
    prof = densify(fillet2d([(0, zb), (r_out, zb), (r_out, zt), (r_in, zt)], [0, f * 1.2, f, 0], 4), 0.006 * s)
    bm = lathe_bm(prof, segs)
    r_flat = r_out * 0.88
    for v in bm.verts:
        r = math.hypot(v.co.x, v.co.y)
        t = max(0.0, min(1.0, (r - r_in) / max(r_flat - r_in, 1e-6)))
        v.co.y *= 1 + (ky - 1) * t * t * (3 - 2 * t)
    return bm


def build_arm(side, rig, pivot, glove, tube_mat, L=0.32, r=0.03, rest_deg=20, hand=1.0):
    """Pivot empty Arm_<side> (R at -X = the character's own right, Blender convention).
    Hand_<side> (wrist pivot): Hand_*_Mitten (flat mitten, convex back), Hand_*_Palm (lighter palm pad in the dish),
    Hand_*_Thumb (offset to the palm side, on the outer edge), Hand_*_Cuff (wrist cuff).
    The palm looks to -Y (towards the viewer) at rest and while waving (the wave only rotates about Y)."""
    sgn = 1 if side == "R" else -1
    out = -sgn                                   # outer side: R hangs at -X, so outwards is -X
    fm = face_mats()
    arm = empty(f"Arm_{side}", rig, pivot, display="ARROWS", size=0.06)
    arm.rotation_mode = "XYZ"
    arm.rotation_euler = (0, sgn * radians(rest_deg), 0)
    bm = tube_bm([(0, 0, 0), (0, 0, -L * 0.5), (0, 0, -L)], [r * 1.25, r, r * 0.92], ring=14)
    finish(bm, f"Arm_{side}_Tube", tube_mat, arm, normals=None)
    hd = empty(f"Hand_{side}", arm, (0, 0, -L), display="SPHERE", size=0.04)
    hd.rotation_mode = "XYZ"
    s = hand * HAND_SCALE
    mit, pad = hand_bm(s, out)
    finish(mit, f"Hand_{side}_Mitten", glove, hd, normals="area")
    finish(pad, f"Hand_{side}_Palm", fm["palm"], hd, normals="area")
    # thumb: capsule on the outer edge, shifted to the palm side (-Y), pointing down/outwards
    path = [Vector((out * 0.038 * s, -0.012 * s, -0.034 * s)), Vector((out * 0.056 * s, -0.019 * s, -0.052 * s)),
            Vector((out * 0.066 * s, -0.023 * s, -0.074 * s))]
    finish(tube_bm(path, [0.020 * s, 0.019 * s, 0.016 * s], ring=12), f"Hand_{side}_Thumb", glove, hd, normals=None)
    # cuff: short flattened ring at the wrist; its top is open (hole = arm tube) so the tube leaves it cleanly
    finish(cuff_bm(s, 0.92 * r), f"Hand_{side}_Cuff", glove, hd, normals="area")
    return arm, hd


# ----------------------------------------------------------------- UV
def unwrap(ob, island_margin=0.02, angles=(66, 55, 45, 35, 30)):
    """Smart UV Project with margin; try progressively smaller angle limits until no overlap."""
    for ang in angles:
        _unwrap_once(ob, island_margin, ang)
        rep = uv_report(ob, 384)
        print("UNWRAP", ob.name, ang, rep)
        if rep["overlap_px"] == 0 and rep["out_of_range_tris"] == 0:
            return ang
    return angles[-1]


def _unwrap_once(ob, island_margin, angle):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=radians(angle), island_margin=island_margin, area_weight=0.3,
                             correct_aspect=True, scale_to_bounds=False)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception as e:
        print("average_islands_scale failed", e)
    bpy.ops.uv.pack_islands(margin=island_margin, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)


def uv_report(ob, res=512):
    """Rasterise UV triangles at pixel centres: report coverage, overlaps, out-of-range."""
    me = ob.data
    uv = me.uv_layers.active.data
    cover = {}
    overlap = 0
    oob = 0
    for p in me.polygons:
        ls = [uv[i].uv.copy() for i in p.loop_indices]
        for k in range(1, len(ls) - 1):
            a, b, c = ls[0], ls[k], ls[k + 1]
            xs = [a.x, b.x, c.x]
            ys = [a.y, b.y, c.y]
            if min(xs) < -1e-4 or max(xs) > 1 + 1e-4 or min(ys) < -1e-4 or max(ys) > 1 + 1e-4:
                oob += 1
            x0, x1 = int(max(min(xs), 0) * res), int(min(max(xs), 1) * res) + 1
            y0, y1 = int(max(min(ys), 0) * res), int(min(max(ys), 1) * res) + 1
            den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
            if abs(den) < 1e-12:
                continue
            for py in range(y0, min(y1, res)):
                for px in range(x0, min(x1, res)):
                    x, y = (px + 0.5) / res, (py + 0.5) / res
                    l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den
                    l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den
                    l3 = 1 - l1 - l2
                    if l1 > 1e-6 and l2 > 1e-6 and l3 > 1e-6:
                        key = (px, py)
                        if key in cover:
                            overlap += 1
                        else:
                            cover[key] = 1
    return dict(coverage_pct=round(100 * len(cover) / (res * res), 1), overlap_px=overlap, out_of_range_tris=oob)


def nap_object(ob, amp, freq, protect):
    """Apply roller fur displacement to an object's mesh (keeps UVs), then recompute normals."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    displace_nap(bm, None, None, amp=amp, freq=freq, protect=protect)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    area_normals(ob.data)
