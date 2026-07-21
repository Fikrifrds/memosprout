import bpy
import math
import os

# ---------------------------------------------------------------------------
# MemoSprout procedural logo — v3 ("M" grown from sprouts)
#
# The letter M drawn as a single organic vine. The two upper peaks of the M
# each sprout a pair of leaves — so the M itself is growing. MemoSprout =
# the M that sprouts. Compact, bold, reads as a lettermark at any size.
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

vine_mat = make_material("VineGreen", (0.09, 0.36, 0.19), roughness=0.48)
leaf_mat = make_material("LeafGreen", (0.18, 0.66, 0.35), roughness=0.34)

# --- The "M" as a single vine curve ----------------------------------------
m_data = bpy.data.curves.new(name="m_vine", type="CURVE")
m_data.dimensions = "3D"
m_data.resolution_u = 32
m_data.bevel_resolution = 6
m_data.use_fill_caps = True

spline = m_data.splines.new("BEZIER")
# M skeleton in the XZ plane (camera looks along Y):
#   bottom-left -> top-left peak -> middle valley -> top-right peak -> bottom-right
pts = [
    (-0.82, 0.00, 0.00, 0.095),   # bottom-left
    (-0.82, 0.00, 1.12, 0.080),   # top-left peak
    ( 0.00, 0.00, 0.42, 0.085),   # middle valley
    ( 0.82, 0.00, 1.12, 0.080),   # top-right peak
    ( 0.82, 0.00, 0.00, 0.095),   # bottom-right
]
spline.bezier_points.add(len(pts) - 1)
for i, (x, y, z, r) in enumerate(pts):
    bp = spline.bezier_points[i]
    bp.co = (x, y, z)
    bp.radius = r
    bp.handle_left_type = "AUTO"
    bp.handle_right_type = "AUTO"

m_obj = bpy.data.objects.new("M_Vine", m_data)
m_obj.data.materials.append(vine_mat)
scene.collection.objects.link(m_obj)

# --- Leaf builder (points straight up, base at origin) ---------------------
def make_leaf(name):
    data = bpy.data.curves.new(name=name, type="CURVE")
    data.dimensions = "3D"
    data.resolution_u = 32
    data.bevel_depth = 0.026
    data.bevel_resolution = 4
    data.use_fill_caps = True

    s = data.splines.new("BEZIER")
    leaf_pts = [
        (0.000, 0.00, 0.00),
        (0.300, 0.00, 0.40),
        (0.000, 0.00, 0.95),
        (-0.300, 0.00, 0.40),
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

def sprout_at(name, x, z, tilt=26.0, scale=0.42):
    """A pair of leaves opening upward from a point — a little sprout bud."""
    right = make_leaf(f"{name}_R")
    right.location = (x, 0.0, z)
    right.rotation_euler = (0.0, math.radians(tilt), 0.0)
    right.scale = (scale, scale, scale)

    left = make_leaf(f"{name}_L")
    left.location = (x, 0.0, z)
    left.rotation_euler = (0.0, math.radians(-tilt), 0.0)
    left.scale = (scale, scale, scale)

# Sprout a bud on each of the two peaks of the M.
sprout_at("PeakL", -0.82, 1.16)
sprout_at("PeakR", 0.82, 1.16)

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

# --- Camera (orthographic, frames the M lettermark) ------------------------
cam_data = bpy.data.cameras.new(name="Camera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.5
cam_obj = bpy.data.objects.new("Camera", cam_data)
cam_obj.location = (0.0, -6.0, 0.78)
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
