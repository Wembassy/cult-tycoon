"""
generate_terrain.py — Cult Tycoon Terrain Tile Generator

Creates flat low-poly terrain tiles (grass, dirt, stone, water) with subtle
height variation. Exports each as GLB with Draco compression.

Usage:
    blender --background --python generate_terrain.py -- [--output-dir PATH]
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
    import random
    from blender_utils import clear_scene, make_flat_material, add_edge_split, apply_flat_shading, export_glb
except ImportError as e:
    print(f"ERROR: {e}", file=sys.stderr)
    print("Run with: blender --background --python generate_terrain.py", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "terrain"
)

TILE_SIZE = 1.0
SUBDIVISIONS = 4
BASE_THICKNESS = 0.08

TERRAIN_COLORS = {
    "grass": (0.20, 0.30, 0.15, 1.0),
    "dirt":  (0.28, 0.20, 0.12, 1.0),
    "stone": (0.38, 0.38, 0.40, 1.0),
    "water": (0.10, 0.20, 0.30, 1.0),
}


# ---------------------------------------------------------------------------
# Terrain Tile Builder
# ---------------------------------------------------------------------------
def build_terrain_tile(name, color, height_variation=0.02, seed=42):
    clear_scene()
    rng = random.Random(seed)
    bm = bmesh.new()

    half = TILE_SIZE / 2
    step = TILE_SIZE / SUBDIVISIONS

    # Top surface with height variation
    top_verts = []
    for j in range(SUBDIVISIONS + 1):
        row = []
        for i in range(SUBDIVISIONS + 1):
            x = -half + i * step
            y = -half + j * step
            edge_dist = min(i, j, SUBDIVISIONS - i, SUBDIVISIONS - j)
            edge_factor = min(edge_dist / 2.0, 1.0)
            z = BASE_THICKNESS + rng.uniform(-height_variation, height_variation) * edge_factor
            row.append(bm.verts.new((x, y, z)))
        top_verts.append(row)

    # Bottom surface (flat)
    bottom_verts = []
    for j in range(SUBDIVISIONS + 1):
        row = []
        for i in range(SUBDIVISIONS + 1):
            x = -half + i * step
            y = -half + j * step
            row.append(bm.verts.new((x, y, 0.0)))
        bottom_verts.append(row)

    # Top faces
    for j in range(SUBDIVISIONS):
        for i in range(SUBDIVISIONS):
            bm.faces.new([top_verts[j][i], top_verts[j][i+1], top_verts[j+1][i+1], top_verts[j+1][i]])

    # Bottom faces (reversed)
    for j in range(SUBDIVISIONS):
        for i in range(SUBDIVISIONS):
            bm.faces.new([bottom_verts[j+1][i], bottom_verts[j+1][i+1], bottom_verts[j][i+1], bottom_verts[j][i]])

    # Side faces
    for i in range(SUBDIVISIONS):
        bm.faces.new([bottom_verts[0][i], bottom_verts[0][i+1], top_verts[0][i+1], top_verts[0][i]])
        bm.faces.new([bottom_verts[SUBDIVISIONS][i+1], bottom_verts[SUBDIVISIONS][i], top_verts[SUBDIVISIONS][i], top_verts[SUBDIVISIONS][i+1]])
    for j in range(SUBDIVISIONS):
        bm.faces.new([bottom_verts[j+1][0], bottom_verts[j][0], top_verts[j][0], top_verts[j+1][0]])
        bm.faces.new([bottom_verts[j][SUBDIVISIONS], bottom_verts[j+1][SUBDIVISIONS], top_verts[j+1][SUBDIVISIONS], top_verts[j][SUBDIVISIONS]])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    apply_flat_shading(obj)
    add_edge_split(obj)

    mat = make_flat_material(f"{name}_mat", color)
    obj.data.materials.append(mat)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{name}.glb")
    try:
        export_glb(obj, filepath)
    except Exception as e:
        print(f"FAILED to export {name}: {e}", file=sys.stderr)
        raise


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
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

    print(f"=== Cult Tycoon — Terrain Generator ===")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Blender: {bpy.app.version_string}")

    tiles = [
        ("terrain_grass", TERRAIN_COLORS["grass"], 0.025, 42),
        ("terrain_dirt",  TERRAIN_COLORS["dirt"],  0.020, 43),
        ("terrain_stone", TERRAIN_COLORS["stone"], 0.015, 44),
        ("terrain_water", TERRAIN_COLORS["water"], 0.012, 45),
    ]

    for name, color, var, seed in tiles:
        print(f"\n--- Generating {name} ---")
        try:
            build_terrain_tile(name, color, height_variation=var, seed=seed)
        except Exception as e:
            print(f"FAILED: {name}: {e}", file=sys.stderr)

    print("\n=== All terrain tiles generated! ===")


if __name__ == "__main__":
    main()