"""
generate_followers.py — Cult Tycoon Follower Model Generator

Creates a base low-poly follower model (robed figure with hood) and exports
3 color variants as GLB files with Draco compression.

Usage:
    blender --background --python generate_followers.py -- [--output-dir PATH]
"""

import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
try:
    import bpy
    import bmesh
    import math
    from mathutils import Matrix
    import os
    import sys
    from blender_utils import clear_scene, make_flat_material, add_edge_split, apply_flat_shading, export_glb, safe_bpy_import
except ImportError as e:
    print(f"ERROR: {e}", file=sys.stderr)
    print("Run with: blender --background --python generate_followers.py", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "followers"
)

VARIANTS = [
    {"name": "follower_novice", "robe_color": (0.35, 0.25, 0.18, 1.0)},
    {"name": "follower_adept",  "robe_color": (0.12, 0.35, 0.38, 1.0)},
    {"name": "follower_priest", "robe_color": (0.35, 0.08, 0.10, 1.0)},
]

SKIN_COLOR = (0.6, 0.5, 0.4, 1.0)
HOOD_INNER_COLOR = (0.05, 0.05, 0.06, 1.0)


# ---------------------------------------------------------------------------
# Mesh Building
# ---------------------------------------------------------------------------
def create_body_mesh():
    """Build the follower body as a single mesh. ~280-350 tris."""
    bm = bmesh.new()

    # Robe (lower body) — 8-sided tapered cylinder
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=8,
        radius1=0.18, radius2=0.28, depth=0.35,
        matrix=Matrix.Translation((0, 0, 0.175)),
    )

    # Torso — 8-sided cylinder
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=8,
        radius1=0.16, radius2=0.20, depth=0.25,
        matrix=Matrix.Translation((0, 0, 0.475)),
    )

    # Head — low-poly UV sphere
    bmesh.ops.create_uvsphere(
        bm, u_segments=8, v_segments=4, radius=0.12,
        matrix=Matrix.Translation((0, 0, 0.66)),
    )

    # Hood — half UV sphere
    hood_bm = bmesh.new()
    bmesh.ops.create_uvsphere(
        hood_bm, u_segments=8, v_segments=4, radius=0.16,
        matrix=Matrix.Translation((0, 0, 0.66)),
    )
    for v in list(hood_bm.verts):
        if v.co.z < 0.66:
            hood_bm.verts.remove(v)
    bm.faces.ensure_lookup_table()
    hood_bm.faces.ensure_lookup_table()
    vert_map = {}
    for v in hood_bm.verts:
        nv = bm.verts.new(v.co)
        vert_map[v] = nv
    for f in hood_bm.faces:
        try:
            bm.faces.new([vert_map[v] for v in f.verts])
        except ValueError:
            pass
    hood_bm.free()

    # Arms — 6-sided cylinders
    for x_offset in [-0.22, 0.22]:
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.05, radius2=0.06, depth=0.28,
            matrix=Matrix.Translation((x_offset, 0, 0.47)),
        )

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("FollowerBody")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("Follower", mesh)
    bpy.context.collection.objects.link(obj)
    apply_flat_shading(obj)
    add_edge_split(obj)
    return obj


def assign_materials(obj, robe_color):
    """Assign materials to different face groups based on position."""
    robe_mat = make_flat_material("Robe", robe_color)
    skin_mat = make_flat_material("Skin", SKIN_COLOR)
    hood_mat = make_flat_material("HoodInner", HOOD_INNER_COLOR)

    obj.data.materials.append(robe_mat)
    obj.data.materials.append(skin_mat)
    obj.data.materials.append(hood_mat)

    for poly in obj.data.polygons:
        center = poly.center
        if abs(center.x) > 0.17:
            poly.material_index = 0  # arms = robe
        elif center.z < 0.35:
            poly.material_index = 0  # robe
        elif 0.55 < center.z < 0.74 and center.z < 0.72:
            poly.material_index = 1  # skin
        elif center.z >= 0.74:
            poly.material_index = 2  # hood inner
        else:
            poly.material_index = 0  # default robe


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def generate_variant(variant):
    """Generate one follower variant and export it as GLB."""
    clear_scene()
    obj = create_body_mesh()
    assign_materials(obj, variant["robe_color"])
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{variant['name']}.glb")
    try:
        export_glb(obj, filepath)
    except Exception as e:
        print(f"FAILED to export {variant['name']}: {e}", file=sys.stderr)
        raise


def main():
    args = sys.argv
    if "--" in args:
        args = args[args.index("--") + 1:]
    else:
        args = []

    global OUTPUT_DIR
    for i, arg in enumerate(args):
        if arg == "--output-dir" and i + 1 < len(args):
            OUTPUT_DIR = args[i + 1]

    print(f"=== Cult Tycoon — Follower Generator ===")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Blender: {bpy.app.version_string}")

    for variant in VARIANTS:
        print(f"\n--- Generating {variant['name']} ---")
        generate_variant(variant)

    print("\n=== Done! ===")


if __name__ == "__main__":
    main()