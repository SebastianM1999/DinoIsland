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
for name in ['AlphaArmor','AlphaRidges','AlphaPebbles']:
    rigid_islands(bpy.data.objects[name],rig,lambda c:nearest(c,spine))
for name in ['AlphaEyes','AlphaLids','AlphaGlints','AlphaPupils','AlphaHeadPlates','AlphaNostrils']:
    rigid_islands(bpy.data.objects[name],rig,lambda c:'Head')
rigid_islands(bpy.data.objects['AlphaHeadScales'],rig,lambda c:'Head')
legbones=segs(rig,[k[:-1]+n+k[-1] for k in A_LEGJ for n in ['UpLeg','LowLeg','Foot']])
rigid_islands(bpy.data.objects['AlphaLegScales'],rig,lambda c:nearest(c,legbones))
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
