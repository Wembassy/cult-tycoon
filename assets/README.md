# Cult Tycoon — 3D Assets

Blender Python scripts for generating low-poly 3D assets in the Prison Architect aesthetic.

## Usage

Run each script with Blender's command-line mode:

```bash
blender --background --python assets/blender_scripts/generate_followers.py
blender --background --python assets/blender_scripts/generate_buildings.py
blender --background --python assets/blender_scripts/generate_terrain.py
```

Or with a custom output directory:

```bash
blender --background --python assets/blender_scripts/generate_followers.py -- --output-dir /path/to/output
```

## Scripts

| Script | Output | Assets |
|--------|--------|--------|
| `generate_followers.py` | `models/followers/` | 3 follower variants (novice, adept, priest) |
| `generate_buildings.py` | `models/buildings/` | 13 building props (walls, door, floors, bed, prayer mat, desk, cooking pot, ritual circle) |
| `generate_terrain.py` | `models/terrain/` | 4 terrain tiles (grass, dirt, stone, water) |

## Shared Utilities

`blender_utils.py` provides shared helpers used by all scripts:
- `clear_scene()` — Remove all objects/meshes/materials
- `make_flat_material(name, color)` — Create flat-shaded material
- `add_edge_split(obj)` — Add edge split modifier for hard edges
- `apply_flat_shading(obj)` — Set all faces to flat shading
- `export_glb(obj, filepath)` — Export as GLB with Draco compression

## Art Direction

- **Flat shading** — no smooth normals, hard edge definition
- **Edge split** — bold outlines via edge split modifier
- **Muted palette** — desaturated greens, browns, grays
- **Accent colors** — teal (faith), gold (funds), blood red (rituals)
- **Low poly** — 200-400 tris for followers, 50-200 for props, 50-100 for tiles
- **Scale** — 1 tile = 1 meter

## Export Format

All assets export as **GLB** (binary glTF) with **Draco mesh compression** (level 6).