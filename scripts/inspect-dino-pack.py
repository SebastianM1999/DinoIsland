import bpy, json
print('DINO_INSPECT ' + json.dumps({
    'actions': [{'name': a.name, 'frames': list(a.frame_range)} for a in bpy.data.actions],
    'objects': [{'name': o.name, 'type': o.type, 'dimensions': list(o.dimensions),
                 'rotation': list(o.rotation_euler), 'location': list(o.location),
                 'bones': [b.name for b in o.data.bones] if o.type == 'ARMATURE' else [],
                 'materials': [m.name for m in o.data.materials] if o.type == 'MESH' else []}
                for o in bpy.context.scene.objects]}, indent=2))
