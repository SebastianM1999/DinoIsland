"""Blender 4.5 CLI: blender -b <source.blend> --python scripts/convert-dino-pack.py -- <species>.

Source files are untouched. Export smooth subdivided skins, vertex palettes and all actions.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

species = sys.argv[sys.argv.index('--') + 1]
palettes = {
    'raptor': ['ee8b3a', 'dd7430', 'f6e0b5', '7a3b1e'],
    'trex': ['d96843', 'a94335', 'f2d8ac', '81362f'],
    'stego': ['86a03c', '6f8a2f', 'f3e3b6', 'f07c36'],
    'brachio': ['8089dc', '6c73c8', 'f4e0b8', '6269bb'],
}
def linear(h):
    return tuple((c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4)
                 for c in [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)])
palette = [linear(h) for h in palettes[species]]
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
arm.animation_data.action = next(a for a in bpy.data.actions if a.name.endswith('_Idle'))
bpy.context.scene.frame_set(0)
print('HEAD_DIRECTION', list(arm.data.bones['Head'].head_local))
for o in list(bpy.context.scene.objects):
    if o.type not in ('ARMATURE', 'MESH'):
        bpy.data.objects.remove(o, do_unlink=True)
    elif o.type == 'MESH':
        bpy.context.view_layer.objects.active = o
        # Subdivision before skin deformation preserves weights and rounds silhouettes.
        sub = o.modifiers.new('Rounded silhouette', 'SUBSURF')
        sub.levels = 2
        bpy.ops.object.modifier_move_up(modifier=sub.name)
        bpy.ops.object.modifier_apply(modifier=sub.name)
        for p in o.data.polygons:
            p.use_smooth = True
        colors = o.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        zvalues = [v.co.z for v in o.data.vertices]
        zmin, zmax = min(zvalues), max(zvalues)
        for p in o.data.polygons:
            name = o.data.materials[p.material_index].name.lower()
            accent = ('darkbrown' in name and species == 'stego')
            base = linear('24202b') if 'black' in name else palette[2] if 'light' in name else palette[3] if accent else palette[0]
            if 'red' in name: base = linear('a53b3d')
            for li in p.loop_indices:
                v = o.data.vertices[o.data.loops[li].vertex_index].co
                height = (v.z-zmin) / max(.001,zmax-zmin)
                shade = .96 + .04*math.sin(v.y*.65)*math.sin(v.z*.8)
                back = max(0, min(.45, (height-.4)*.6)) if base == palette[0] else 0
                colors.data[li].color = tuple((base[i]*(1-back)+palette[1][i]*back)*shade for i in range(3))+(1,)
        mat = bpy.data.materials.new('Dinosaur vertex palette')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = .85
        attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Color'
        mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
        o.data.materials.clear()
        o.data.materials.append(mat)
        for p in o.data.polygons: p.material_index = 0

out = Path(bpy.path.abspath('//')).resolve().parents[2] / 'assets/models/dinos'
out.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out / (species+'.glb')), export_format='GLB',
    export_animation_mode='ACTIONS', export_frame_range=False, export_force_sampling=True,
    export_def_bones=False, export_all_vertex_colors=True)
print('EXPORTED', species)
