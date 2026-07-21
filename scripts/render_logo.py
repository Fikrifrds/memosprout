import bpy
import math
import os

# ---------------------------------------------------------------------------
# MemoSprout procedural logo
# Concept: a delicate sprout — a curved stem rising upward with two leaves
# opening like hands. Represents a correction taking root and growing into
# lasting knowledge. Hopeful, organic, growing.
# ---------------------------------------------------------------------------

OUTPUT_DIR = "/Users/fikrifirdaus/Documents/products/MemoSproutWorks/memosprout/public"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Clean slate -----------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# --- Materials -------------------------------------------------------------
def make_material(name, base_color, roughness=0.45):
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

# Deep forest green for the stem, bright emerald for the leaves.
stem_mat = make_material("StemGreen", (0.07, 0.32, 0.17), roughness=0.5)
leaf_mat = make_material("LeafGreen", (0.13, 0.62, 0.32), roughness=0.38)
seed_mat = make_material("SeedBrown", (0.30, 0.22, 0.13), roughness=0.6)

# --- Stem (curved, tapered) ------------------------------------------------
stem_data = bpy.data.curves.new(name="stem", type="CURVE")
stem_data.dimensions = "3D"
stem_data.resolution_u = 24
stem_data.bevel_resolution = 6
stem_data.use_fill_caps = True

spline = stem_data.splines.new("BEZIER")
# 4 control points forming a gentle S-curve rising along +Z
pts = [
    (0.00, 0.00, 0.00, 0.13),   # base (x, y, z, radius)
    (0.10, 0.00, 0.65, 0.10),
    (-0.08, 0.00, 1.35, 0.075),
    (0.02, 0.00, 2.00, 0.055),  # top
]
spline.bezier_points.add(len(pts) - 1)  # one point exists by default
for i, (x, y, z, r) in enumerate(pts):
    bp = spline.bezier_points[i]
    bp.co = (x, y, z)
    bp.radius = r
    bp.handle_left_type = "AUTO"
    bp.handle_right_type = "AUTO"

stem_obj = bpy.data.objects.new("Stem", stem_data)
stem_obj.data.materials.append(stem_mat)
scene.collection.objects.link(stem_obj)

# --- Leaf builder ----------------------------------------------------------
def make_leaf(name):
    """A pointed leaf shape in the XZ plane, base at origin, tip toward +X/+Z."""
    data = bpy.data.curves.new(name=name, type="CURVE")
    data.dimensions = "3D"
    data.resolution_u = 24
    data.bevel_depth = 0.028       # slight thickness
    data.bevel_resolution = 4
    data.use_fill_caps = True

    s = data.splines.new("BEZIER")
    # leaf outline (closed loop): base -> upper belly -> tip -> lower belly
    leaf_pts = [
        (0.00, 0.00, 0.00),
        (0.42, 0.00, 0.30),
        (0.95, 0.00, 0.62),   # tip
        (0.42, 0.00, 0.02),
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

# Right leaf — emerges near the top of the stem, opens up-and-out to the right.
right_leaf = make_leaf("LeafRight")
right_leaf.location = (0.00, 0.00, 1.78)
right_leaf.rotation_euler = (0.0, math.radians(-8), math.radians(-18))
right_leaf.scale = (1.05, 1.05, 1.05)

# Left leaf — mirror image, opens up-and-out to the left.
left_leaf = make_leaf("LeafLeft")
left_leaf.location = (0.02, 0.00, 1.62)
left_leaf.rotation_euler = (0.0, math.radians(-6), math.radians(196))
left_leaf.scale = (0.92, 0.92, 0.92)

# --- Seed / base -----------------------------------------------------------
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=0.20, location=(0.0, 0.0, -0.02), segments=48, ring_count=24
)
seed = bpy.context.active_object
seed.name = "Seed"
seed.scale = (1.0, 1.0, 0.78)
seed.data.materials.append(seed_mat)

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

# Soft key light from upper-front-left (warm-neutral).
key = add_area_light("Key", 320, (-3.2, -3.5, 4.2), (math.radians(40), 0, math.radians(-40)), size=3.0)
# Gentle fill from the right.
fill = add_area_light("Fill", 120, (3.5, -2.5, 2.0), (math.radians(60), 0, math.radians(50)), size=3.0)
# Subtle rim from behind for a hopeful glow on the leaf edges.
rim = add_area_light("Rim", 180, (0.5, 3.5, 3.0), (math.radians(-40), 0, math.radians(180)), size=2.5)

# --- Camera (orthographic, centered on the sprout) -------------------------
cam_data = bpy.data.cameras.new(name="Camera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 3.4
cam_obj = bpy.data.objects.new("Camera", cam_data)
cam_obj.location = (0.0, -6.0, 1.15)
cam_obj.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# --- Render settings -------------------------------------------------------
scene.render.engine = "CYCLES"
scene.cycles.samples = 200
scene.cycles.use_denoising = True
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "16"

# Prefer GPU if available, else CPU.
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
