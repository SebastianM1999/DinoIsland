import bpy, bmesh, math, os
exec(bpy.data.texts['lib'].as_string(), globals())
exec(bpy.data.texts['mouth'].as_string(), globals())
exec(bpy.data.texts['fuse'].as_string(), globals())
A_TRUNK = [(0,-3.7,2.25,.7,.57),(0,-2.9,2.05,1.2,.86),(0,-1.7,2.05,1.65,1.03),(0,0,2.1,1.72,1.08),(0,1.7,2.05,1.55,.95),(0,2.8,1.9,1.12,.76),(0,4,1.65,.85,.65),(0,5.5,1.36,.58,.61),(0,7,1.12,.38,.56),(0,8.5,.91,.21,.43),(0,9.4,.8,.06,.18)]
A_MOUTH = 2.13
A_CORNER = -3.45
body = tube_path('AlphaBody', A_TRUNK, ring=24,k=4,sub=1)
def a_skull(w,top,lip):
    return [(0,top),(.55*w,top+.015),(.95*w,top-.08),(1.04*w,top-.22),(.92*w,lip+.15),(w,lip+.07),(.85*w,lip),( .45*w,lip-.01),(0,lip-.01)]
A_HEAD=[(-7.6,.18,2.43),(-7.45,.57,2.59),(-7.1,.72,2.66),(-6.7,.65,2.63),(-6,.62,2.65),(-5.2,.69,2.75),(-4.5,.88,2.94),(-3.9,1.12,3.11),(-3.3,1.13,3.03),(-2.8,.69,2.7)]
head=loft2('AlphaHead',[(y,a_skull(w,z,A_MOUTH)) for y,w,z in A_HEAD],sub=2)
A_JAW=[(-7.42,.16,1.91),(-7.2,.53,1.79),(-6.8,.57,1.72),(-6,.53,1.68),(-5.2,.62,1.62),(-4.5,.78,1.55),(-3.9,.98,1.5),(-3.25,1.01,1.61),(-2.8,.62,1.8)]
jaw=loft2('AlphaJaw',[(y,jaw_prof(w,b,A_MOUTH-.035,.11*trough_fade(y,-7.42,-2.8))) for y,w,b in A_JAW],sub=2)
apply_mods(head); apply_mods(jaw)
# Teeth measured on the evaluated lips before the head is fused.
A_TEETH=[]
for side in (-1,1):
    for lower in (False,True):
        for i in range(20):
            y=-7.1+i*.172+( .075 if lower else 0)
            x,z=lip_at(jaw if lower else head,y,lower=not lower,k=36)
            length=(.22+.16*(.5+.5*math.sin(i*2.1)))*(.68 if i in (3,11,16) else 1)
            A_TEETH.append((side*x*.96,y,z, length,lower,i))
body=fuse_head('AlphaBody','AlphaHead','AlphaJaw',A_CORNER,A_MOUTH,lip_gap=.024,region=.12,seam_width=.22,fillet_iters=28)
print('fused head',len(body.data.vertices))
A_LEGJ={}
# Crocodilian SPRAWLED legs (not pillar "dog legs"): the joint sits low on the body side, the upper
# arm/thigh angles out and down to an elbow/knee well outside the body, the lower leg drops nearly
# vertically to a splayed, out-turned foot. Front elbow points back, hind knee forward.
#                 shoulder/hip            elbow/knee              wrist/ankle           toe tip
A_LEGDEF={'Front':((1.2,-1.85,1.72),(2.3,-1.6,1.12),(2.38,-1.95,.3),(2.62,-2.45,.2)),
          'Back': ((1.2,1.65,1.68),(2.35,1.38,1.12),(2.42,1.9,.3),(2.7,1.38,.21))}
for pre,(hip0,knee0,ank0,toe0) in A_LEGDEF.items():
    for side,sx in [('L',1),('R',-1)]:
        m=lambda p:(p[0]*sx,p[1],p[2])
        hip,knee,ank,toe=m(hip0),m(knee0),m(ank0),m(toe0)
        key=pre+side; A_LEGJ[key]=(hip,knee,ank,toe)
        root=(hip[0]*.7,hip[1],hip[2]+.15)                      # starts deep inside the trunk
        mid1=tuple(h+(k-h)*.5 for h,k in zip(hip,knee)); mid2=tuple(k+(a_-k)*.5 for k,a_ in zip(knee,ank))
        nodes=[(*root,.5,.55),(*hip,.55,.58),(*mid1,.5,.5),(*knee,.42,.42),(*mid2,.31,.31),(*ank,.29,.26),(ank[0]+sx*.08,ank[1]-.2,.2,.36,.2)]
        leg=tube_ref('AlphaLeg'+key,nodes,ring=12,k=3,sub=1,ref=(0,1,0)); apply_mods(leg)
        for v in leg.data.vertices:                              # flat sole on the ground plane
            if v.co.z<.05:v.co.z=.05+(v.co.z-.05)*.12
        leg.data.update()
        union_fillet('AlphaBody',leg.name,width=.2,iters=24,head_back_y=-2.7)
        # four toes fanned forward and outward from the out-turned foot
        fx,fy=toe[0]-ank[0],toe[1]-ank[1]; fl=math.hypot(fx,fy); fx,fy=fx/fl,fy/fl; rx,ry=-fy*sx,fx*sx
        for j in range(4):
            o=(j-1.5)*.24; bx,by=ank[0]+fx*.25+rx*o*.4,ank[1]+fy*.25+ry*o*.4
            ang=(j-1.5)*.22; cx,cy=fx*math.cos(ang)-fy*math.sin(ang),fx*math.sin(ang)+fy*math.cos(ang)
            L=.62-.08*abs(j-1.5)
            toeob=tube_ref('AlphaToe',[(bx,by,.28,.14,.16),(bx+cx*L*.55,by+cy*L*.55,.235,.13,.15),(bx+cx*L,by+cy*L,.215,.09,.12)],ring=8,k=2,sub=1)
            apply_mods(toeob); union_fillet('AlphaBody',toeob.name,width=.08,iters=10,head_back_y=-2.7)
print('body',len(body.data.vertices))
# Boolean operands can inherit head-region membership onto front toes ahead of the shoulder.
for gn in ['rg_head','rg_jaw']:
    body.vertex_groups[gn].remove([v.index for v in body.data.vertices if v.co.z<1.4 or (abs(v.co.x)>1.3 and v.co.y>-3.4)])
adata=bpy.data.texts.get('adata') or bpy.data.texts.new('adata')
adata.from_string('\n'.join(k+' = '+repr(globals()[k]) for k in ['A_TRUNK','A_MOUTH','A_CORNER','A_TEETH','A_LEGJ']))
view(yaw=math.pi/2,pitch=1.35,dist=23,loc=(0,.7,1.7))
