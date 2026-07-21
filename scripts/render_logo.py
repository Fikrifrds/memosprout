import bpy
import math
import os

# ---------------------------------------------------------------------------
# MemoSprout procedural logo — v2 (compact & simple)
#
# A young sprout: two full leaves emerging from the SAME point near the top
# of a short stem, tilted only slightly apart so they read as one tight,
# cohesive bud growing upward. No scattered elements — everything sits
# close together in a compact, near-square mark.
# ---------------------------------------------------------------------------

OUTPUT_DIR = "/Users/fikrifirdaus/Documents/products/MemoSproutWorks/memosprout/public"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Clean slate -----------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# --- Materials -------------------------------------------------------------
def make_material(name, base_color, roughness=0.42):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (300, 0)

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    try:
        bsdf.inputs["Specular IOR Level"].default_value = 0.25
    except KeyError:
        bsdf.inputs["Specular"].default_value = 0.25

    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat

stem_mat = make_material("StemGreen", (0.09, 0.36, 0.19), roughness=0.5)
leaf_mat = make_material("LeafGreen", (0.16, 0.63, 0.33), roughness=0.36)

# --- Short stem ------------------------------------------------------------
stem_data = bpy.data.curves.new(name="stem", type="CURVE")
stem_data.dimensions = "3D"
stem_data.resolution_u = 24
stem_data.bevel_resolution = 6
stem_data.use_fill_caps = True

spline = stem_data.splines.new("BEZIER")
# Short, near-straight stem rising along +Z, tapered.
pts = [
    (0.00, 0.00, 0.00, 0.115),   # base (x, y, z, radius)
    (0.02, 0.00, 0.32, 0.095),
    (0.00, 0.00, 0.62, 0.075),   # top — leaves attach here
]
spline.bezier_points.add(len(pts) - 1)
for i, (x, y, z, r) in enumerate(pts):
    bp = spline.bezier_points[i]
    bp.co = (x, y, z)
    bp.radius = r
    bp.handle_left_type = "AUTO"
    bp.handle_right_type = "AUTO"

stem_obj = bpy.data.objects.new("Stem", stem_data)
stem_obj.data.materials.append(stem_mat)
scene.collection.objects.link(stem_obj)

# --- Leaf builder (points straight up, base at origin) ---------------------
def make_leaf(name):
    """A full, rounded leaf in the XZ plane pointing up (+Z), base at origin."""
    data = bpy.data.curves.new(name=name, type="CURVE")
    data.dimensions = "3D"
    data.resolution_u = 32
    data.bevel_depth = 0.030       # gentle thickness
    data.bevel_resolution = 4
    data.use_fill_caps = True

    s = data.splines.new("BEZIER")
    # Symmetric upward leaf: base -> right belly -> tip -> left belly -> close
    leaf_pts = [
        (0.000, 0.00, 0.00),   # base (attachment)
        (0.300, 0.00, 0.40),   # right belly
        (0.000, 0.00, 0.95),   # tip (up)
        (-0.300, 0.00, 0.40),  # left belly
    ]
    s.bezier_points.add(len(leaf_pts) - 1)
    s.use_cyclic_u = True
    for i, (x, y, z) in enumerate(leaf_pts):
        bp = s.bezier_points[i]
        bp.co = (x, y, z)
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"

    obj = bpy.data.objects.new(name, data)
    obj.data.materials.append(leaf_mat)
    scene.collection.objects.link(obj)
    return obj

# Both leaves attach at the SAME point at the top of the stem and tilt only
# slightly apart — a tight, cohesive bud, not a wide-open spread.
attach = (0.0, 0.0, 0.58)

right_leaf = make_leaf("LeafRight")
right_leaf.location = attach
right_leaf.rotation_euler = (0.0, math.radians(26), 0.0)   # tilt toward +X
right_leaf.scale = (1.0, 1.0, 1.0)

left_leaf = make_leaf("LeafLeft")
left_leaf.location = attach
left_leaf.rotation_euler = (0.0, math.radians(-26), 0.0)   # tilt toward -X
left_leaf.scale = (1.0, 1.0, 1.0)

# --- Lighting --------------------------------------------------------------
def add_area_light(name, energy, loc, rot, size=2.0):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.size = size
    light_data.shape = "RECTANGLE"
    light_data.size_y = size * 0.7
    light_obj = bpy.data.objects.new(name, light_data)
    light_obj.location = loc
    light_obj.rotation_euler = rot
    scene.collection.objects.link(light_obj)
    return light_obj

key = add_area_light("Key", 300, (-2.6, -3.2, 3.4), (math.radians(42), 0, math.radians(-38)), size=2.6)
fill = add_area_light("Fill", 110, (3.0, -2.2, 1.6), (math.radians(62), 0, math.radians(48)), size=2.6)
rim = add_area_light("Rim", 160, (0.4, 3.0, 2.4), (math.radians(-40), 0, math.radians(180)), size=2.2)

# --- Camera (orthographic, tight frame on the compact mark) ----------------
cam_data = bpy.data.cameras.new(name="Camera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 1.9
cam_obj = bpy.data.objects.new("Camera", cam_data)
cam_obj.location = (0.0, -6.0, 0.72)
cam_obj.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# --- Render settings -------------------------------------------------------
scene.render.engine = "CYCLES"
scene.cycles.samples = 220
scene.cycles.use_denoising = True
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "16"

try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
except Exception:
    scene.cycles.device = "CPU"

# --- Render ----------------------------------------------------------------
scene.render.filepath = os.path.join(OUTPUT_DIR, "logo.png")
bpy.ops.render.render(write_still=True)

print("LOGO_RENDERED:", scene.render.filepath)
