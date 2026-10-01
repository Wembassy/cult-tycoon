"""
generate_buildings.py — Cult Tycoon Building Model Generator

Creates modular building assets and exports each as GLB with Draco compression.

Usage:
    blender --background --python generate_buildings.py -- [--output-dir PATH]
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
    from blender_utils import clear_scene, make_flat_material, add_edge_split, apply_flat_shading, export_glb
except ImportError as e:
    print(f"ERROR: {e}", file=sys.stderr)
    print("Run with: blender --background --python generate_buildings.py", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models", "buildings"
)

TILE_SIZE = 1.0
WALL_HEIGHT = 1.0
WALL_THICKNESS = 0.1

COLORS = {
    "wood":       (0.30, 0.20, 0.12, 1.0),
    "stone":      (0.35, 0.35, 0.38, 1.0),
    "dark_stone": (0.22, 0.22, 0.25, 1.0),
    "fabric":     (0.20, 0.15, 0.18, 1.0),
    "metal":      (0.18, 0.18, 0.20, 1.0),
    "ground":     (0.25, 0.22, 0.18, 1.0),
    "grass":      (0.20, 0.30, 0.15, 1.0),
    "teal_glow":  (0.10, 0.45, 0.50, 1.0),
    "gold":       (0.55, 0.42, 0.15, 1.0),
    "blood_red":  (0.35, 0.08, 0.10, 1.0),
    "dark_red":   (0.20, 0.05, 0.08, 1.0),
}


# ---------------------------------------------------------------------------
# Local helpers
# ---------------------------------------------------------------------------
def new_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    apply_flat_shading(obj)
    add_edge_split(obj)
    return obj


def assign_single_material(obj, mat):
    obj.data.materials.append(mat)


def safe_export(obj, name):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{name}.glb")
    try:
        export_glb(obj, filepath)
    except Exception as e:
        print(f"FAILED to export {name}: {e}", file=sys.stderr)
        raise


def add_box(bm, size, location):
    """Add a box to the bmesh."""
    sx, sy, sz = [s / 2 for s in size]
    lx, ly, lz = location
    verts = [
        bm.verts.new((lx-sx, ly-sy, lz-sz)), bm.verts.new((lx+sx, ly-sy, lz-sz)),
        bm.verts.new((lx+sx, ly+sy, lz-sz)), bm.verts.new((lx-sx, ly+sy, lz-sz)),
        bm.verts.new((lx-sx, ly-sy, lz+sz)), bm.verts.new((lx+sx, ly-sy, lz+sz)),
        bm.verts.new((lx+sx, ly+sy, lz+sz)), bm.verts.new((lx-sx, ly+sy, lz+sz)),
    ]
    faces = [
        (verts[0],verts[1],verts[2],verts[3]), (verts[4],verts[7],verts[6],verts[5]),
        (verts[0],verts[4],verts[5],verts[1]), (verts[1],verts[5],verts[6],verts[2]),
        (verts[2],verts[6],verts[7],verts[3]), (verts[3],verts[7],verts[4],verts[0]),
    ]
    for f in faces:
        bm.faces.new(f)


def add_cylinder(bm, radius, depth, location, segments=8):
    """Add a cylinder to the bmesh."""
    lx, ly, lz = location
    bottom_verts, top_verts = [], []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        x, y = lx + radius * math.cos(angle), ly + radius * math.sin(angle)
        bottom_verts.append(bm.verts.new((x, y, lz - depth/2)))
        top_verts.append(bm.verts.new((x, y, lz + depth/2)))
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new([bottom_verts[i], bottom_verts[ni], top_verts[ni], top_verts[i]])
    top_center = bm.verts.new((lx, ly, lz + depth/2))
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new([top_verts[i], top_verts[ni], top_center])
    bot_center = bm.verts.new((lx, ly, lz - depth/2))
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new([bot_center, bottom_verts[ni], bottom_verts[i]])


# ---------------------------------------------------------------------------
# Asset Builders
# ---------------------------------------------------------------------------
def build_wall_straight():
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("WallStone", COLORS["stone"])
    add_box(bm, (TILE_SIZE, WALL_THICKNESS, WALL_HEIGHT), (0, 0, WALL_HEIGHT/2))
    add_box(bm, (TILE_SIZE+0.04, WALL_THICKNESS+0.04, 0.05), (0, 0, WALL_HEIGHT+0.025))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("wall_straight", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "wall_straight")

def build_wall_corner():
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("WallStone", COLORS["stone"])
    add_box(bm, (TILE_SIZE/2+WALL_THICKNESS/2, WALL_THICKNESS, WALL_HEIGHT), (-TILE_SIZE/4, 0, WALL_HEIGHT/2))
    add_box(bm, (WALL_THICKNESS, TILE_SIZE/2+WALL_THICKNESS/2, WALL_HEIGHT), (0, TILE_SIZE/4, WALL_HEIGHT/2))
    add_box(bm, (TILE_SIZE/2+0.08, WALL_THICKNESS+0.04, 0.05), (-TILE_SIZE/4, 0, WALL_HEIGHT+0.025))
    add_box(bm, (WALL_THICKNESS+0.04, TILE_SIZE/2+0.08, 0.05), (0, TILE_SIZE/4, WALL_HEIGHT+0.025))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("wall_corner", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "wall_corner")

def build_wall_tjunction():
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("WallStone", COLORS["stone"])
    add_box(bm, (TILE_SIZE, WALL_THICKNESS, WALL_HEIGHT), (0, 0, WALL_HEIGHT/2))
    add_box(bm, (WALL_THICKNESS, TILE_SIZE/2, WALL_HEIGHT), (0, TILE_SIZE/4, WALL_HEIGHT/2))
    add_box(bm, (TILE_SIZE+0.04, WALL_THICKNESS+0.04, 0.05), (0, 0, WALL_HEIGHT+0.025))
    add_box(bm, (WALL_THICKNESS+0.04, TILE_SIZE/2+0.04, 0.05), (0, TILE_SIZE/4, WALL_HEIGHT+0.025))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("wall_tjunction", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "wall_tjunction")

def build_wall_end():
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("WallStone", COLORS["stone"])
    add_box(bm, (TILE_SIZE/2, WALL_THICKNESS, WALL_HEIGHT), (0, 0, WALL_HEIGHT/2))
    add_box(bm, (WALL_THICKNESS+0.06, WALL_THICKNESS+0.06, WALL_HEIGHT+0.08), (TILE_SIZE/4, 0, WALL_HEIGHT/2+0.04))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("wall_end", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "wall_end")

def build_door():
    clear_scene()
    bm = bmesh.new()
    wood_mat = make_flat_material("DoorWood", COLORS["wood"])
    metal_mat = make_flat_material("DoorMetal", COLORS["metal"])
    add_box(bm, (WALL_THICKNESS, 0.12, WALL_HEIGHT*0.85), (-TILE_SIZE/2+0.06, 0, WALL_HEIGHT*0.425))
    add_box(bm, (WALL_THICKNESS, 0.12, WALL_HEIGHT*0.85), (TILE_SIZE/2-0.06, 0, WALL_HEIGHT*0.425))
    add_box(bm, (TILE_SIZE, 0.12, 0.15), (0, 0, WALL_HEIGHT*0.85+0.075))
    add_box(bm, (0.02, 0.05, WALL_HEIGHT*0.7), (-0.12, 0, WALL_HEIGHT*0.4))
    add_box(bm, (0.02, 0.05, WALL_HEIGHT*0.7), (0.12, 0, WALL_HEIGHT*0.4))
    add_box(bm, (0.28, 0.05, 0.04), (0, 0, WALL_HEIGHT*0.55))
    add_box(bm, (0.28, 0.05, 0.04), (0, 0, WALL_HEIGHT*0.25))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("door", bm)
    obj.data.materials.append(wood_mat)
    obj.data.materials.append(metal_mat)
    for poly in obj.data.polygons:
        poly.material_index = 1 if abs(poly.center.x) > 0.35 else 0
    safe_export(obj, "door")

def build_floor_tile():
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("FloorStone", COLORS["dark_stone"])
    add_box(bm, (TILE_SIZE, TILE_SIZE, 0.05), (0, 0, 0.025))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("floor_tile", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "floor_tile")

def build_floor_wood():
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("FloorWood", COLORS["wood"])
    add_box(bm, (TILE_SIZE, TILE_SIZE, 0.05), (0, 0, 0.025))
    for i in range(3):
        add_box(bm, (TILE_SIZE, 0.01, 0.01), (0, -0.33+i*0.33, 0.055))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("floor_wood", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "floor_wood")

def build_floor_grass():
    """Floor tile — grass surface for outdoor areas."""
    clear_scene()
    bm = bmesh.new()
    mat = make_flat_material("FloorGrass", COLORS["grass"])
    add_box(bm, (TILE_SIZE, TILE_SIZE, 0.05), (0, 0, 0.025))
    # Add subtle tufts (small raised boxes)
    for x_off, y_off in [(-0.3, -0.2), (0.25, 0.15), (0.1, -0.35), (-0.15, 0.3)]:
        add_box(bm, (0.08, 0.08, 0.03), (x_off, y_off, 0.055))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("floor_grass", bm)
    assign_single_material(obj, mat)
    safe_export(obj, "floor_grass")

def build_bed():
    clear_scene()
    bm = bmesh.new()
    wood_mat = make_flat_material("BedFrame", COLORS["wood"])
    fabric_mat = make_flat_material("Bedding", COLORS["fabric"])
    add_box(bm, (0.5, 0.9, 0.15), (0, 0, 0.075))
    for x in [-0.22, 0.22]:
        for y in [-0.40, 0.40]:
            add_box(bm, (0.05, 0.05, 0.10), (x, y, 0.05))
    add_box(bm, (0.42, 0.78, 0.08), (0, 0.02, 0.23))
    add_box(bm, (0.30, 0.15, 0.05), (0, -0.32, 0.28))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("bed", bm)
    obj.data.materials.append(wood_mat)
    obj.data.materials.append(fabric_mat)
    for poly in obj.data.polygons:
        poly.material_index = 1 if poly.center.z > 0.16 else 0
    safe_export(obj, "bed")

def build_prayer_mat():
    clear_scene()
    bm = bmesh.new()
    mat_fabric = make_flat_material("PrayerMat", COLORS["fabric"])
    mat_accent = make_flat_material("PrayerAccent", COLORS["teal_glow"])
    add_box(bm, (0.6, 0.8, 0.02), (0, 0, 0.01))
    add_box(bm, (0.55, 0.05, 0.025), (0, 0.35, 0.022))
    add_box(bm, (0.55, 0.05, 0.025), (0, -0.35, 0.022))
    add_box(bm, (0.05, 0.75, 0.025), (0.275, 0, 0.022))
    add_box(bm, (0.05, 0.75, 0.025), (-0.275, 0, 0.022))
    add_box(bm, (0.15, 0.15, 0.03), (0, 0, 0.025))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("prayer_mat", bm)
    obj.data.materials.append(mat_fabric)
    obj.data.materials.append(mat_accent)
    for poly in obj.data.polygons:
        poly.material_index = 1 if poly.center.z > 0.012 else 0
    safe_export(obj, "prayer_mat")

def build_research_desk():
    clear_scene()
    bm = bmesh.new()
    wood_mat = make_flat_material("DeskWood", COLORS["wood"])
    gold_mat = make_flat_material("CandleGold", COLORS["gold"])
    add_box(bm, (0.6, 0.4, 0.04), (0, 0, 0.38))
    for x in [-0.27, 0.27]:
        for y in [-0.17, 0.17]:
            add_box(bm, (0.04, 0.04, 0.36), (x, y, 0.18))
    add_box(bm, (0.20, 0.14, 0.02), (0, 0.05, 0.41))
    add_cylinder(bm, radius=0.03, depth=0.10, location=(0.18, -0.10, 0.45), segments=6)
    add_cylinder(bm, radius=0.05, depth=0.03, location=(0.18, -0.10, 0.40), segments=6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("research_desk", bm)
    obj.data.materials.append(wood_mat)
    obj.data.materials.append(gold_mat)
    for poly in obj.data.polygons:
        c = poly.center
        poly.material_index = 1 if (c.z > 0.42 and abs(c.x - 0.18) < 0.08) else 0
    safe_export(obj, "research_desk")

def build_cooking_pot():
    clear_scene()
    bm = bmesh.new()
    metal_mat = make_flat_material("PotMetal", COLORS["metal"])
    wood_mat = make_flat_material("TableWood", COLORS["wood"])
    add_box(bm, (0.7, 0.5, 0.04), (0, 0, 0.38))
    for x in [-0.32, 0.32]:
        for y in [-0.22, 0.22]:
            add_box(bm, (0.04, 0.04, 0.36), (x, y, 0.18))
    add_cylinder(bm, radius=0.15, depth=0.18, location=(0, 0, 0.49), segments=8)
    add_cylinder(bm, radius=0.17, depth=0.04, location=(0, 0, 0.58), segments=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("cooking_pot", bm)
    obj.data.materials.append(metal_mat)
    obj.data.materials.append(wood_mat)
    for poly in obj.data.polygons:
        c = poly.center
        poly.material_index = 0 if (c.z > 0.40 and abs(c.x) < 0.2 and abs(c.y) < 0.2) else 1
    safe_export(obj, "cooking_pot")

def build_ritual_circle():
    clear_scene()
    bm = bmesh.new()
    stone_mat = make_flat_material("RitualStone", COLORS["dark_stone"])
    red_mat = make_flat_material("RitualBlood", COLORS["blood_red"])
    gold_mat = make_flat_material("RitualGold", COLORS["gold"])
    add_cylinder(bm, radius=0.45, depth=0.03, location=(0, 0, 0.015), segments=12)
    add_cylinder(bm, radius=0.35, depth=0.04, location=(0, 0, 0.04), segments=10)
    add_cylinder(bm, radius=0.20, depth=0.05, location=(0, 0, 0.055), segments=8)
    for angle_deg in [0, 90, 180, 270]:
        angle = math.radians(angle_deg)
        x, y = 0.40 * math.cos(angle), 0.40 * math.sin(angle)
        add_cylinder(bm, radius=0.04, depth=0.15, location=(x, y, 0.105), segments=5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object("ritual_circle", bm)
    obj.data.materials.append(stone_mat)
    obj.data.materials.append(red_mat)
    obj.data.materials.append(gold_mat)
    for poly in obj.data.polygons:
        c = poly.center
        dist = math.sqrt(c.x**2 + c.y**2)
        if c.z > 0.08:
            poly.material_index = 2
        elif dist < 0.22 and c.z > 0.03:
            poly.material_index = 1
        elif dist < 0.37 and c.z > 0.02:
            poly.material_index = 1
        else:
            poly.material_index = 0
    safe_export(obj, "ritual_circle")


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

    print(f"=== Cult Tycoon — Building Generator ===")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Blender: {bpy.app.version_string}")

    builders = [
        ("wall_straight",  build_wall_straight),
        ("wall_corner",    build_wall_corner),
        ("wall_tjunction", build_wall_tjunction),
        ("wall_end",       build_wall_end),
        ("door",           build_door),
        ("floor_tile",     build_floor_tile),
        ("floor_wood",     build_floor_wood),
        ("floor_grass",    build_floor_grass),
        ("bed",            build_bed),
        ("prayer_mat",     build_prayer_mat),
        ("research_desk",  build_research_desk),
        ("cooking_pot",    build_cooking_pot),
        ("ritual_circle",  build_ritual_circle),
    ]

    for name, builder in builders:
        print(f"\n--- Building {name} ---")
        try:
            builder()
        except Exception as e:
            print(f"FAILED: {name}: {e}", file=sys.stderr)

    print("\n=== All buildings generated! ===")


if __name__ == "__main__":
    main()