import bpy, json
from mathutils import Vector
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
arm.animation_data.action = None
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
print('SOURCE_BONES', json.dumps([{'name': b.name, 'head': list(b.head_local), 'tail': list(b.tail_local),
    'parent': b.parent.name if b.parent else None} for b in arm.data.bones]))
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    groups = {g.index: g.name for g in o.vertex_groups}
    head = [o.matrix_world @ v.co for v in o.data.vertices
        if any(groups[g.group] == 'Head' and g.weight > .5 for g in v.groups)]
    if head:
        print('HEAD_BOUNDS', o.name, json.dumps({
            'min': [min(v[i] for v in head) for i in range(3)],
            'max': [max(v[i] for v in head) for i in range(3)]}))
    for i, mat in enumerate(o.data.materials):
        verts = {vi for p in o.data.polygons if p.material_index == i for vi in p.vertices}
        print('MATERIAL', mat.name, len(verts))
print('CONSTRAINTS', json.dumps([{ 'bone': b.name, 'constraints': [c.type for c in b.constraints] } for b in arm.pose.bones if b.constraints]))
