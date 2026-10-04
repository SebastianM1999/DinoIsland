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
for pre,y,ky,ay in [('Front',-1.85,-1.15,-2.05),('Back',1.65,.95,1.95)]:
    for side,sx in [('L',1),('R',-1)]:
        x=1.5*sx; hip=(x,y,2.05); knee=(x,ky,1.23); ank=(x,ay,.32); toe=(x,ay-.55,.23)
        key=pre+side; A_LEGJ[key]=(hip,knee,ank,toe)
        nodes=[(*hip,.48,.53),(x,y+(ky-y)*.4,1.75,.57,.58),(*knee,.43,.43),(x,ky+(ay-ky)*.55,.75,.28,.31),(*ank,.29,.24),(*toe,.38,.21)]
        leg=tube_ref('AlphaLeg'+key,nodes,ring=12,k=3,sub=1); apply_mods(leg)
        union_fillet('AlphaBody',leg.name,width=.2,iters=24,head_back_y=-2.7)
        for j in range(4):
            tx=x+(j-1.5)*.24; ty=ay-.55-.13*(1-abs(j-1.5)/2)
            toeob=tube_ref('AlphaToe',[(tx,ay-.23,.26,.14,.16),(tx,ty,.2,.13,.15),(tx+sx*.055,ty-.23,.19,.09,.12)],ring=8,k=2,sub=1)
            apply_mods(toeob); union_fillet('AlphaBody',toeob.name,width=.08,iters=10,head_back_y=-2.7)
print('body',len(body.data.vertices))
# Boolean operands can inherit head-region membership onto front toes ahead of the shoulder.
for gn in ['rg_head','rg_jaw']:
    body.vertex_groups[gn].remove([v.index for v in body.data.vertices if v.co.z<1.4 or (abs(v.co.x)>1.3 and v.co.y>-3.4)])
adata=bpy.data.texts.get('adata') or bpy.data.texts.new('adata')
adata.from_string('\n'.join(k+' = '+repr(globals()[k]) for k in ['A_TRUNK','A_MOUTH','A_CORNER','A_TEETH','A_LEGJ']))
view(yaw=math.pi/2,pitch=1.35,dist=23,loc=(0,.7,1.7))
