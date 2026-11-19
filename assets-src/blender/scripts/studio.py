"""Neutral soft studio + render helpers (Eevee). Same framing for every poster."""
import bpy, math
from math import radians
from mathutils import Vector
import lib


def setup_render(res=1024, transparent=True, samples=48):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.fps = lib.FPS
    try:
        sc.view_settings.view_transform = "Khronos PBR Neutral"
    except Exception:
        sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    try:
        sc.eevee.taa_render_samples = samples
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = True
    except Exception as e:
        print("eevee opts", e)


def make_world():
    w = bpy.data.worlds.new("Studio")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    cr = ramp.color_ramp
    cr.elements[0].position = 0.30
    cr.elements[0].color = (0.30, 0.31, 0.34, 1)
    mid = cr.elements.new(0.50)
    mid.color = (1.0, 1.0, 1.0, 1)
    cr.elements[2].position = 0.80
    cr.elements[2].color = (1.25, 1.25, 1.3, 1)
    bg.inputs["Strength"].default_value = 0.62
    bpy.context.scene.world = w
    return w


def make_studio(target):
    """Key / fill / rim area lights + camera, all relative to `target` (Vector at char centre)."""
    c = bpy.data.collections.get("Studio") or bpy.data.collections.new("Studio")
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    objs = {}

    def light(name, kind, loc, energy, size, color=(1, 1, 1)):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = color
        if kind == "AREA":
            d.size = size
        ob = bpy.data.objects.new(name, d)
        c.objects.link(ob)
        ob.location = target + Vector(loc)
        direction = (target + Vector((0, 0, 0)) - ob.location)
        ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        objs[name] = ob
        return ob

    light("Key", "AREA", (-2.2, -3.2, 2.6), 260, 3.0, (1.0, 0.97, 0.92))
    light("Fill", "AREA", (3.2, -2.6, 1.0), 110, 3.5, (0.92, 0.96, 1.0))
    light("Rim", "AREA", (1.5, 3.0, 2.4), 160, 2.5)
    cam = bpy.data.cameras.new("PosterCam")
    cam.lens = 70
    cam.clip_end = 100
    co = bpy.data.objects.new("PosterCam", cam)
    c.objects.link(co)
    objs["cam"] = co
    bpy.context.scene.camera = co
    return objs


def aim_camera(co, target, azim_deg=-28, elev_deg=9, dist=3.9):
    """azim measured from the front (-Y); negative = camera toward viewer's left."""
    a, e = radians(azim_deg), radians(elev_deg)
    off = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    co.location = target + off
    co.rotation_euler = (target - co.location).to_track_quat("-Z", "Y").to_euler()


def render(path, res=None):
    sc = bpy.context.scene
    if res:
        sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def make_floor(target):
    """Transparent-film shadow catcher so posters keep a soft contact shadow."""
    bpy.ops.mesh.primitive_plane_add(size=10, location=(target.x, target.y, 0))
    fl = bpy.context.active_object
    fl.name = "ShadowFloor"
    try:
        fl.is_shadow_catcher = True
    except Exception as e:
        print("no shadow catcher", e)
    c = bpy.data.collections.get("Studio")
    for col in fl.users_collection:
        col.objects.unlink(fl)
    c.objects.link(fl)
    return fl
