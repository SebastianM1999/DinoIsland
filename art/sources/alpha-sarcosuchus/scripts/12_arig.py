for atxt in ['lib','anim','weights','mouth','adata']:exec(bpy.data.texts[atxt].as_string(),globals())
rig,eb=new_rig('AlphaRig')
bone(eb,'root',(0,0,0),(0,1,0))
bone(eb,'Body',(0,1.65,2.05),(0,0,2.1),'root')
bone(eb,'Shoulders',(0,0,2.1),(0,-1.85,2.05),'Body',True)
bone(eb,'Neck1',(0,-1.85,2.05),(0,-2.7,2.18),'Shoulders',True)
bone(eb,'Neck2',(0,-2.7,2.18),(0,-3.55,2.47),'Neck1',True)
bone(eb,'Head',(0,-3.55,2.47),(0,-7.15,2.4),'Neck2',True)
bone(eb,'Jaw',(0,-3.55,2.03),(0,-7.1,1.88),'Head',flip=True)
A_TAILY=[1.65,2.65,3.65,4.65,5.65,6.65,7.65,8.65,9.45]
def a_tz(y):
    for a,b in zip(A_TRUNK,A_TRUNK[1:]):
        if a[1]<=y<=b[1]:return a[2]+(b[2]-a[2])*(y-a[1])/(b[1]-a[1])
    return .8
for i in range(8):bone(eb,'Tail%d'%(i+1),(0,A_TAILY[i],a_tz(A_TAILY[i])),(0,A_TAILY[i+1],a_tz(A_TAILY[i+1])),'Body' if i==0 else 'Tail%d'%i,i>0)
for key,j in A_LEGJ.items():quad_leg_ik(eb,key,*j,'Body' if key.startswith('Back') else 'Shoulders',-1 if key.startswith('Back') else 1)
bpy.ops.object.mode_set(mode='POSE');init('AlphaRig')
for key in A_LEGJ:quad_constraints(key,-math.pi/2 if key.startswith('Back') else math.pi/2)
finish_rig();bpy.context.view_layer.update()
print('IK rest errors',{k:round((pb[k[:-1]+'LowLeg'+k[-1]].head-V(j[1])).length,5) for k,j in A_LEGJ.items()})
body=bpy.data.objects['AlphaBody']; A_TAIL=['Tail%d'%i for i in range(1,9)]
A_CORE=['Body','Shoulders','Neck1','Neck2','Head']+A_TAIL
distance_weights(body,rig,A_CORE,{'L':[],'R':[]},side_x=99,sigma=.19)
for key in A_LEGJ:
    ch=[key[:-1]+n+key[-1] for n in ('UpLeg','LowLeg','Foot')]
    limb_weights(body,rig,ch,key[-1],A_TRUNK,sigma=.07,reach=(.92,.62))
head_jaw_regions(body)
for key,j in A_LEGJ.items():
    ank=V(j[2]);bn=key[:-1]+'Foot'+key[-1]
    for v in body.data.vertices:
        if abs(v.co.x-ank.x)<.75 and abs(v.co.y-ank.y)<1 and v.co.z<.53:
            blend=smooth(.53,.36,v.co.z)
            ws={body.vertex_groups[g.group].name:g.weight*(1-blend) for g in v.groups}
            ws[bn]=ws.get(bn,0)+blend;set_weights(body,v,ws)
spine=segs(rig,A_CORE)
# Project plate weights from the fused skin, including the shoulder/hip fade. A
# nearest-spine assignment leaves flank scutes suspended when the legs swing.
from mathutils.bvhtree import BVHTree
limit_influences(body)
body.data.calc_loop_triangles()
skin_tri=[tuple(t.vertices) for t in body.data.loop_triangles]
skin_bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],skin_tri,all_triangles=True)
leg_names={k[:-1]+n+k[-1] for k in A_LEGJ for n in ['UpLeg','LowLeg','Foot']}
def a_skin_weights(p):
    q,normal,idx,d=skin_bvh.find_nearest(p)
    ids=skin_tri[idx];a,b,c=[body.data.vertices[i].co for i in ids]
    u=b-a;v=c-a;w=q-a;uu=u.dot(u);uv=u.dot(v);vv=v.dot(v)
    den=uu*vv-uv*uv
    wb=(vv*w.dot(u)-uv*w.dot(v))/den if abs(den)>1e-12 else 0
    wc=(uu*w.dot(v)-uv*w.dot(u))/den if abs(den)>1e-12 else 0
    factors=[max(0,1-wb-wc),max(0,wb),max(0,wc)];ws={}
    for vi,f in zip(ids,factors):
        for g in body.data.vertices[vi].groups:
            bn=body.vertex_groups[g.group].name;ws[bn]=ws.get(bn,0)+g.weight*f
    ws=dict(sorted(ws.items(),key=lambda x:x[1],reverse=True)[:4]);total=sum(ws.values())
    return {n:w/total for n,w in ws.items()}

# Remove complete leg-area islands from the body armor and consolidate them in
# the limb mesh. Preserve their geometry, scale colors and scar coloration.
legscales=bpy.data.objects['AlphaLegScales'];moved=0
for name in ['AlphaArmor','AlphaPebbles']:
    ob=bpy.data.objects[name];selected=set()
    for isl in _islands(ob.data):
        ctr=sum((ob.data.vertices[i].co for i in isl),V())/len(isl)
        if sum(w for n,w in a_skin_weights(ctr).items() if n in leg_names)>.05:selected.update(isl)
    if not selected:continue
    moved+=len(selected)//19
    for o in bpy.context.selected_objects:o.select_set(False)
    ob.select_set(True);bpy.context.view_layer.objects.active=ob
    for v in ob.data.vertices:v.select=v.index in selected
    before=set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='SELECTED');bpy.ops.object.mode_set(mode='OBJECT')
    part=next(o for o in bpy.data.objects if o not in before)
    for o in bpy.context.selected_objects:o.select_set(False)
    part.select_set(True);legscales.select_set(True);bpy.context.view_layer.objects.active=legscales;bpy.ops.object.join()
for name in ['AlphaArmor','AlphaPebbles','AlphaLegScales']:
    ob=bpy.data.objects[name];ob.vertex_groups.clear()
    for v in ob.data.vertices:set_weights(ob,v,a_skin_weights(v.co))
    ob.parent=rig;am=ob.modifiers.new('Armature','ARMATURE');am.object=rig
print('leg-area plates transferred',moved)
rigid_islands(bpy.data.objects['AlphaRidges'],rig,lambda c:nearest(c,spine))
for name in ['AlphaEyes','AlphaLids','AlphaGlints','AlphaPupils','AlphaHeadPlates','AlphaNostrils']:
    rigid_islands(bpy.data.objects[name],rig,lambda c:'Head')
rigid_islands(bpy.data.objects['AlphaHeadScales'],rig,lambda c:'Head')
rigid_islands(bpy.data.objects['AlphaTongue'],rig,lambda c:'Jaw')
# Teeth alternate between the upper and lower rows; choose by their root region, not centroid.
teeth=bpy.data.objects['AlphaTeeth'];teeth.vertex_groups.clear()
for isl in _islands(teeth.data):
    root=max((teeth.data.vertices[i] for i in isl),key=lambda v: -abs(v.co.z-A_MOUTH))
    ctr=sum((teeth.data.vertices[i].co for i in isl),V())/len(isl)
    # Lower teeth grow upward, so centroid lies ABOVE their root; upper teeth below.
    highest=max(teeth.data.vertices[i].co.z for i in isl);lowest=min(teeth.data.vertices[i].co.z for i in isl)
    bn='Jaw' if highest-A_MOUTH > A_MOUTH-lowest else 'Head'
    (teeth.vertex_groups.get(bn) or teeth.vertex_groups.new(name=bn)).add(isl,1,'REPLACE')
teeth.parent=rig;am=teeth.modifiers.new('Armature','ARMATURE');am.object=rig
feet=segs(rig,[k[:-1]+'Foot'+k[-1] for k in A_LEGJ])
rigid_islands(bpy.data.objects['AlphaClaws'],rig,lambda c:nearest(c,feet))
limit_influences(*[o for o in bpy.data.objects if o.type=='MESH'])
print('weights',{o.name:check_weights(o) for o in bpy.data.objects if o.type=='MESH'})
