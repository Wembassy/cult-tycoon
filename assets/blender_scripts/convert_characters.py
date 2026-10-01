"""
Blender script: Convert FBX character models to GLB for Three.js.
Batch converts selected cult-appropriate characters with embedded textures.
"""
import bpy
import os
import sys

# Character files perfect for cult followers
CHARACTERS = [
    "SK_Fantasy_Wizard_01.fbx",
    "SK_Fantasy_Sorcerer_01.fbx", 
    "SK_Fantasy_Witch_01.fbx",
    "SK_Fantasy_Druid_01.fbx",
    "SK_Fantasy_Bard_01.fbx",
    "SK_Fantasy_King_01.fbx",
    "SK_Fantasy_Queen_01.fbx",
    "SK_Fantasy_MalePeasant_01.fbx",
    "SK_Fantasy_FemalePeasant_01.fbx",
    "SK_Fantasy_RougeMale_01.fbx",
    "SK_Fantasy_Gypsy_01.fbx",
    "SK_Dungeon_GoblinShaman_01.fbx",
    "SK_Adventure_Viking_01.fbx",
    "SK_Adventure_Warrior_01.fbx",
]

SOURCE_DIR = "/Users/chrismcintosh/.openclaw/workspace/drstone/cult-tycoon/assets/downloads/fantasy_characters/Source_Files/Characters"
TEXTURE_DIR = "/Users/chrismcintosh/.openclaw/workspace/drstone/cult-tycoon/assets/downloads/fantasy_characters/Source_Files/Textures"
OUTPUT_DIR = "/Users/chrismcintosh/.openclaw/workspace/drstone/cult-tycoon/public/assets/models/followers"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Clear orphan data
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)

def convert_fbx_to_glb(fbx_path, output_path):
    clear_scene()
    
    # Import FBX
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    
    # Select all imported objects and center them
    bpy.ops.object.select_all(action='SELECT')
    
    # Scale down — FBX models are often in different scales
    # Polygon Minis are typically small, scale up to ~1.5 units tall
    for obj in bpy.context.selected_objects:
        if obj.type == 'MESH':
            # Ensure normals are calculated (Blender 5.x uses validate)
            obj.data.validate(verbose=False)
            # Apply scale
            obj.scale = (1.0, 1.0, 1.0)
    
    # Apply all transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    
    # Set origin to bottom center (feet on ground)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    for obj in bpy.context.selected_objects:
        if obj.type == 'MESH':
            obj.location.z = 0
    
    # Try to find and apply textures
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    # Try common texture names
                    for tex_name in os.listdir(TEXTURE_DIR):
                        if tex_name.endswith('.png'):
                            try:
                                img = bpy.data.images.load(os.path.join(TEXTURE_DIR, tex_name), check_existing=True)
                                tex_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
                                tex_node.image = img
                                mat.node_tree.links.new(tex_node.outputs['Color'], node.inputs['Base Color'])
                                break
                            except:
                                pass
    
    # Export as GLB
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        use_selection=False,
    )
    print(f"✅ Exported: {os.path.basename(output_path)}")

# Process each character
for char_file in CHARACTERS:
    fbx_path = os.path.join(SOURCE_DIR, char_file)
    if not os.path.exists(fbx_path):
        print(f"⚠️  Not found: {char_file}")
        continue
    
    # Clean name for output
    clean_name = char_file.replace("SK_", "").replace(".fbx", "").lower()
    output_path = os.path.join(OUTPUT_DIR, f"{clean_name}.glb")
    
    try:
        convert_fbx_to_glb(fbx_path, output_path)
    except Exception as e:
        print(f"❌ Failed {char_file}: {e}")

print(f"\nDone! Output: {OUTPUT_DIR}")