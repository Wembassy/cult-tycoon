"""
blender_utils.py — Shared helpers for Cult Tycoon Blender asset scripts.

Import this module from the other generate_*.py scripts to avoid duplication.
"""

import bpy
import bmesh
import math
import os
import sys
from typing import Tuple, Optional


def clear_scene():
    """Remove all objects, meshes, and materials from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def make_flat_material(name: str, color: Tuple[float, float, float, float]) -> bpy.types.Material:
    """Create a flat-shaded material with the given color (RGBA 0-1)."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = False
    mat.diffuse_color = color
    mat.roughness = 1.0
    mat.metallic = 0.0
    # Disable smooth shading by default
    mat.use_backface_culling = False
    return mat


def add_edge_split(obj: bpy.types.Object, angle: float = math.radians(30)):
    """Add an edge split modifier for hard edge definition (outline effect)."""
    mod = obj.modifiers.new(name="EdgeSplit", type='EDGE_SPLIT')
    mod.split_angle = angle
    mod.use_edge_angle = True
    mod.use_edge_sharp = True


def apply_flat_shading(obj: bpy.types.Object):
    """Apply flat shading to all faces of the object."""
    for poly in obj.data.polygons:
        poly.use_smooth = False


def make_object(name: str, mesh: bpy.types.Mesh, material: bpy.types.Material) -> bpy.types.Object:
    """Create an object, assign material, apply flat shading, and add edge split."""
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    apply_flat_shading(obj)
    add_edge_split(obj)
    bpy.context.collection.objects.link(obj)
    return obj


def export_glb(obj: bpy.types.Object, filepath: str):
    """Export a single object as GLB with Draco compression."""
    # Deselect all, then select only our object
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)

    # Ensure directory exists
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    try:
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format='GLB',
            export_draco_mesh_compression_enable=False,
            export_draco_mesh_compression_level=6,
            use_selection=True,
            export_apply=True,
            export_yup=True,
        )
        print(f"Exported: {filepath}")
    except Exception as e:
        print(f"ERROR exporting {filepath}: {e}", file=sys.stderr)
        raise


def safe_bpy_import() -> bool:
    """Check if bpy is available (i.e., running inside Blender)."""
    try:
        import bpy
        return True
    except ImportError:
        print("ERROR: This script must be run with Blender:", file=sys.stderr)
        print(f"  blender --background --python {os.path.basename(sys.argv[0])}", file=sys.stderr)
        return False