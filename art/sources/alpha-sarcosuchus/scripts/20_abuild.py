# Full rebuild from the saved source. Output paths are relative to this .blend.
import bpy,os
if not bpy.data.filepath:raise RuntimeError('Save this file in art/sources/alpha-sarcosuchus first')
ap=os.path.dirname(bpy.data.filepath)
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
for db in [bpy.data.meshes,bpy.data.armatures]:
    for block in list(db):
        if block.users==0:db.remove(block)
for fn in sorted(os.listdir(ap+'/scripts')):
    if fn.endswith('.py'):
        name=fn[3:-3];txt=bpy.data.texts.get(name) or bpy.data.texts.new(name);txt.from_string(open(ap+'/scripts/'+fn,encoding='utf-8').read())
for name in ['abody','adetail','arig','aanim','aexport']:exec(bpy.data.texts[name].as_string(),globals())
