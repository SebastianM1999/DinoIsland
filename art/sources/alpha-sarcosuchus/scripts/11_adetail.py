for atxt in ['lib','fuse','mouth','eyes','adata']: exec(bpy.data.texts[atxt].as_string(),globals())
body=bpy.data.objects['AlphaBody']; A_BVH=_bvh(_bake(body))
A_SKIN=vc_mat('AlphaHide',.53); A_GLOSS=vc_mat('AlphaWet',.29)
A_RED=vc_mat('AlphaEyeGlow',.2)
bs=next(n for n in A_RED.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Color'].default_value=(1,.01,.003,1); bs.inputs['Emission Strength'].default_value=1.8
A_YELLOW=vc_mat('AlphaYellowEyeGlow',.2)
bs=next(n for n in A_YELLOW.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Color'].default_value=(1,.63,.015,1);bs.inputs['Emission Strength'].default_value=1.8
# Readable under the game's darker lighting: olive-bronze back, lighter olive flanks, cream-yellow
# ventral shields, dark crocodile crossbands. (The near-black #17271b hide read as a flat silhouette.)
A_P={k:lin(v) for k,v in dict(back='#435e2c',back2='#354d24',flank='#5f7d3c',flank2='#728f48',belly='#bfc28a',stripe='#22311a').items()}
A_WOUNDS=[(-6.1,2.6,.54,-.54,.075,1.4),(-2.7,2.95,.38,-.86,.105,2.1),(-.9,2.7,.7,-1.12,.09,3.3),(1.0,2.55,.76,-.87,.12,4.5),(2.4,2.3,.22,-.42,.055,5.8)]
def a_wound(p):
    if abs(p.x)<.35:return 0
    mask=0
    for y0,z0,dy,dz,width,phase in A_WOUNDS:
        if not y0-.25<p.y<y0+dy+.25:continue
        for i in range(21):
            u=i/20
            yy=y0+dy*u+.065*math.sin(u*math.pi*3+phase)*math.sin(math.pi*u)
            zz=z0+dz*u+.09*math.sin(u*math.pi*4+phase)*math.sin(math.pi*u)
            w=width*(.28+.72*math.sin(math.pi*u)**.5)*(.8+.2*math.sin(u*19+phase))
            d=math.hypot((p.y-yy)*.9,p.z-zz)
            mask=max(mask,1-smooth(w*.35,w*1.35,d))
            # Short jagged tears branch from the main gouge and have unequal lengths.
            if i in [6,12,15]:
                for j in range(1,5):
                    v=j/4;by=yy+(.11 if i%2 else -.17)*v;bz=zz+.10*v
                    mask=max(mask,(1-smooth(w*.18,w*.7,math.hypot(p.y-by,p.z-bz)))*(1-v*.75))
    return mask
def a_scar_tint(p,c):
    wound=a_wound(p)
    blood=mix(lin('#a21d23'),lin('#f24b38'),.48+.4*fbm(p,13))
    return mix(c,blood,wound*.97)
def a_cells(u,v):
    # Staggered, irregular scale cells. Cell-level tonal drift gives each scale
    # identity; smooth distance fields keep the existing skin normals intact.
    near=[]
    for j in range(math.floor(v)-1,math.floor(v)+2):
        for i in range(math.floor(u)-1,math.floor(u)+2):
            seed=math.sin(i*127.1+j*311.7)*43758.5453
            seed-=math.floor(seed)
            x=i+.5+.17*math.sin(i*4.3+j*1.7)
            y=j+.5+.15*math.sin(i*2.1-j*3.5)
            near.append(((u-x)**2+(v-y)**2,seed))
    near.sort()
    return smooth(.025,.20,math.sqrt(near[1][0])-math.sqrt(near[0][0])),near[0][1]

def a_hide(p,n):
    c=countershade(p,n,A_P,mottle=2.4)
    # Raptor-like broad mottling and stego-like rim/center contrast, translated
    # into crocodilian scutes, transverse belly shields and folded joint skin.
    grain=fbm(p,3.1);broad=fbm(p,.85)
    top=abs(n.z)**3/(abs(n.z)**3+abs(n.x)**3+.001)
    centre,variation=a_cells(p.y/.38+.13*math.sin(p.z*3),p.x/.32)
    side,sv=a_cells(p.y/.37+.15*math.sin(p.z*4),p.z/.31)
    centre=centre*top+side*(1-top);variation=variation*top+sv*(1-top)
    c=shade(c,.62+.34*centre+.2*variation)
    c=mix(c,lin('#7c8a4a'),smooth(-.03,.28,broad)*(.1+.16*centre))
    c=mix(c,lin('#2b3519'),smooth(.10,.32,grain)*.22)
    # crocodile crossbands over back and tail (fading down the flanks), dark speckles on the sides
    band=smooth(.55,.8,math.sin(p.y*2.35+.9*fbm(p,.9)))*smooth(-.35,.25,n.z)*smooth(-1.5,.5,p.y)
    c=mix(c,A_P['stripe'],band*.62)
    speck=smooth(.62,.7,fbm(p*V((1,.7,1)),7.5))*smooth(.6,-.1,abs(n.z))
    c=mix(c,A_P['stripe'],speck*.55)
    # Longer rectangular ventral shields and irregular folds at elbows/hips.
    belly=smooth(.15,-.55,n.z)
    shield=abs(math.sin(p.y*math.pi/.43+.15*math.sin(p.x*4)))
    c=shade(c,1-belly*.38*(1-smooth(.10,.40,shield)))
    joints=math.exp(-((p.y+1.1)/.48)**2)+math.exp(-((p.y-.95)/.5)**2)
    folds=(1-smooth(.06,.38,abs(math.sin(p.z*17+.8*math.sin(p.y*4)))))
    c=shade(c,1-.28*folds*min(1,joints)*smooth(1.15,1.6,abs(p.x)))
    return a_scar_tint(p,c)
def a_headpaint(p,n):
    c=a_hide(p,n)
    c=mix(c,lin('#282d29'),math.exp(-((p.y+4.05)/.45)**2-((p.z-2.78)/.2)**2)*.55)
    return mix(c,lin('#73392f'),math.exp(-((p.z-A_MOUTH)/.06)**2)*.65)
def a_jawpaint(p,n):
    c=mix(a_hide(p,n),lin('#45513a'),.28)
    return mix(c,lin('#63372f'),smooth(1.98,2.13,p.z)*smooth(.5,.05,abs(p.x)))
paint_regions(body,a_hide,a_headpaint,a_jawpaint)
for v in body.data.vertices:
    m=a_wound(v.co)
    if m>.2:v.co-=v.normal*(.018*m)
# Boolean union retains an empty material slot. Clear it; the glTF exporter otherwise
# emits a default material and silently exports the other skin parts with white colors.
body.data.materials.clear();body.data.materials.append(A_SKIN)
for f in body.data.polygons:f.material_index=0
# Distinct staggered armor rows. Plates overlap along the back; low domes stay embedded.
def a_plate(bm,hit,wide,long,raised=.055):
    p,n=hit[0],hit[1].normalized()
    ty=V((0,1,0))-n*n.y
    if ty.length<.05:ty=V((1,0,0))-n*n.x
    ty.normalize();tx=ty.cross(n).normalized()
    perimeter=[(-.7,-1),(.7,-1),(1,0),(.7,1),(-.7,1),(-1,0)]
    lay=bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht');rings=[]
    for scale,z,edge in [(1,-.025,0),(1,.007,.18),(.82,raised,.7)]:
        ring=[]
        for u,v in perimeter:
            point=p+tx*(u*wide*scale)+ty*(v*long*scale)+n*z
            point+=n*(.009*math.sin(p.y*9+u*2)*math.cos(p.z*5+v))
            vert=bm.verts.new(point);vert[lay]=edge;ring.append(vert)
        rings.append(ring)
    for r0,r1 in zip(rings,rings[1:]):
        for k in range(6):bm.faces.new((r0[k],r0[(k+1)%6],r1[(k+1)%6],r1[k]))
    center=bm.verts.new(p+n*(raised*1.12));center[lay]=1
    for k in range(6):bm.faces.new((rings[-1][k],rings[-1][(k+1)%6],center))
    bm.faces.new(list(reversed(rings[0])))
bm=bmesh.new(); rbm=bmesh.new(); peb=bmesh.new()
for i in range(23):
    y=-3.05+i*.52
    rx=next((a[3]+(b[3]-a[3])*(y-a[1])/(b[1]-a[1]) for a,b in zip(A_TRUNK,A_TRUNK[1:]) if a[1]<=y<=b[1]),.2)
    for row,f in enumerate((-.72,-.25,.25,.72)):
        yy=y+(.16 if row%2 else 0); x=rx*f
        hit=A_BVH.ray_cast(V((x,yy,8)),V((0,0,-1)))
        if hit[0] is None: continue
        p=hit[0]; size=max(.12,min(.47,rx*.34))
        a_plate(bm,hit,size,.37,.11 if i<14 else .065)
    if i%1==0:
        for sx in (-1,1):
            x=sx*rx*.32; hit=A_BVH.ray_cast(V((x,y,8)),V((0,0,-1)))
            if hit[0] is not None:
                p=hit[0]; height=(.35+.28*math.sin(math.pi*min(1,i/22)))*(.8+ .2*math.sin(i*1.8)**2)
                horn_bm(rbm,(x,y,p.z+.08),(x,y+.28,p.z+height),.23 if i<15 else .15,bend=(0,-.08,.04),seg=8,rings=4,flat=.6)
# Dense tessellated flank scales with staggered rows. These are shallow angular plates,
# with embedded rims and deliberate dark gaps; never spherical dots.
for i in range(29):
    y=-3.05+i*.36
    for sx in (-1,1):
        for j in range(4):
            zz=1.28+j*.36;yy=y+(.18 if j%2 else 0)
            hit=A_BVH.ray_cast(V((sx*5,yy,zz)),V((-sx,0,0)))
            if hit[0] is not None and abs(hit[1].x)>.3:a_plate(peb,hit,.165,.18,.04)
armor=mk('AlphaArmor',bm); ridges=mk('AlphaRidges',rbm); pebbles=mk('AlphaPebbles',peb)
def a_armor(p,n):
    return mix(lin('#34421f'),lin('#6f7c3f'),smooth(-.15,.8,n.z)*.5+.16*fbm(p,3))
def a_scale_color(p,t):
    green=mix(lin('#3a4723'),lin('#76833f'),.40+.7*fbm(p,2.2))
    green=mix(green,lin('#262f17'),smooth(.55,.8,math.sin(p.y*2.35+.9*fbm(p,.9)))*.55)   # crossbands continue over the scutes
    # Embedded almost-black seams, olive crown, weathered lichen flecks, and
    # directional ribbing carry detail like the stego's modeled plate painting.
    crown=smooth(.12,.70,t)
    green=shade(green,.5+.5*crown)
    rib=abs(math.sin(p.y*19+.65*math.sin(p.x*8+p.z*5)))
    green=shade(green,1-.24*smooth(.65,.95,rib)*crown)
    green=mix(green,lin('#a4a468'),smooth(.16,.36,fbm(p,8))*.3*crown)              # weathered pale crowns
    return green
paint_t(armor,a_scale_color);armor.data.materials.append(A_SKIN)
paint_t(ridges,lambda p,t:mix(lin('#2c371b'),lin('#8a8e52'),smooth(.15,.8,t)));ridges.data.materials.append(A_SKIN)
paint_t(pebbles,a_scale_color);pebbles.data.materials.append(A_SKIN)
# Fine cranial scutes: compact asymmetric fields, not oversized separate lumps.
hbm=bmesh.new()
for i in range(17):
    y=-7.25+i*.20
    for j in range(-2,3):
        hit=A_BVH.ray_cast(V((j*.22,y+(j%2)*.09,8)),V((0,0,-1)))
        if hit[0] is not None:a_plate(hbm,hit,.10,.095,.023)
    for sx in (-1,1):
        for z in [2.3,2.5]:
            hit=A_BVH.ray_cast(V((sx*5,y,z)),V((-sx,0,0)))
            if hit[0] is not None:a_plate(hbm,hit,.085,.095,.022)
headscales=mk('AlphaHeadScales',hbm);paint_t(headscales,a_scale_color);headscales.data.materials.append(A_SKIN)
# Smaller scales on bent limbs track their local surface and retain joint articulation.
lbm=bmesh.new()
for key,(hip,knee,ank,toe) in A_LEGJ.items():
    sx=1 if hip[0]>0 else -1
    for j in range(5):
        z=.55+j*.24
        for i in range(3):
            y=knee[1]+(i-1)*.23
            hit=A_BVH.ray_cast(V((sx*5,y,z)),V((-sx,0,0)))
            if hit[0] is not None and abs(hit[0].x)>1.35:a_plate(lbm,hit,.105,.115,.035)
legscales=mk('AlphaLegScales',lbm);paint_t(legscales,a_scale_color);legscales.data.materials.append(A_SKIN)
bm=bmesh.new()
for x,y,z,l,lower,i in A_TEETH:
    dz=1 if lower else -1
    horn_bm(bm,(x,y,z-dz*.045),(x*.94,y+.025,z+dz*l),.075+.018*math.sin(i)**2,bend=(0,.035,0),seg=8,rings=4)
teeth=mk('AlphaTeeth',bm); paint_t(teeth,lambda p,t:mix(lin('#9b8964'),lin('#eee4c7'),smooth(.05,.7,t))); teeth.data.materials.append(A_GLOSS)
bm=bmesh.new()
for hip,knee,ank,toe in A_LEGJ.values():
    sx=1 if ank[0]>0 else -1
    for j in range(4):
        tx=ank[0]+(j-1.5)*.24; ty=ank[1]-.55-.13*(1-abs(j-1.5)/2)
        horn_bm(bm,(tx+sx*.025,ty-.16,.23),(tx+sx*.08,ty-.48,.075),.105,bend=(0,-.1,.08),seg=8,rings=4)
claws=mk('AlphaClaws',bm); paint_t(claws,lambda p,t:mix(lin('#484a42'),lin('#171b1a'),t)); claws.data.materials.append(A_GLOSS)
tongue=add_tongue('AlphaTongue',(0,-5,1.98),(.39,1.34,.10),seg=(18,10));paint(tongue,lambda p,n:lin('#8f4e48'));tongue.data.materials.append(A_SKIN)
A_E=dict(c=(1.02,-4.03,2.79),R=.205,yaw=.12,W=.9,Ht=.36,Hb=.46,tilt=.34,rim=(.16,.075),pupil=(.095,.33),iris=.78,ball=(24,16),rimseg=(36,6))
build_eyes('Alpha',A_E)
A_EP={k:lin(v) for k,v in dict(iris='#ff2818',iris2='#a31c17',glow='#ff6330',limbal='#581813',pupil='#100b08',sclera='#b52a1c',lid='#213725',lid2='#365033').items()}
A_YP={**A_EP,**{k:lin(v) for k,v in dict(iris='#ffd52c',iris2='#bc7614',glow='#fff077',limbal='#674818',sclera='#c89421').items()}}
paint_eyes('Alpha',A_E,lambda p:A_YP if p.x>0 else A_EP,A_RED,A_SKIN)
eyes=bpy.data.objects['AlphaEyes'];eyes.data.materials.append(A_YELLOW)
for f in eyes.data.polygons:
    if f.material_index==0 and f.center.x>0:f.material_index=2
for name in ['AlphaPupils','AlphaGlints']:
    bpy.data.objects[name].data.materials.clear();bpy.data.objects[name].data.materials.append(A_GLOSS)
# Raised nasal bosses, heavy brows and joint armor follow the head/limbs.
bm=bmesh.new()
for sx in (-1,1):
    blob_bm(bm,(sx*.4,-7.02,2.62),(.23,.34,.14),seg=14,ring=8)
    blob_bm(bm,(sx*1.01,-4,2.99),(.22,.56,.16),(0,sx*.2,-sx*.15),seg=14,ring=8)
headplates=mk('AlphaHeadPlates',bm);paint(headplates,a_armor);headplates.data.materials.append(A_SKIN)
bm=bmesh.new()
for sx in (-1,1): blob_bm(bm,(sx*.4,-7.14,2.748),(.11,.17,.023),seg=12,ring=6)
nostrils=mk('AlphaNostrils',bm);paint(nostrils,lambda p,n:lin('#1b201c'));nostrils.data.materials.append(A_GLOSS)
# Wounds belong to the actual skin and scale colors; no detached sticks or tubes.
for name in ['AlphaArmor','AlphaPebbles','AlphaHeadScales','AlphaLegScales']:
    ob=bpy.data.objects[name];col=ob.data.color_attributes['Col']
    for v in ob.data.vertices:
        rgb=col.data[v.index].color[:3];col.data[v.index].color=(*a_scar_tint(v.co,rgb),1)
print('tris',sum(len(p.vertices)-2 for o in bpy.data.objects if o.type=='MESH' for p in o.data.polygons))
# Build the lateral proportions INTO the model (x 10/9): the game fits length/height by 0.9 but keeps
# the width. A non-uniform runtime scale sheared the sprawled legs (feet missed banks by ~5 cm), so the
# runtime scale is uniform now and the extra width lives here, before rigging, skinning and IK.
A_WIDEN=10/9
_wm=mathutils.Matrix.Diagonal((A_WIDEN,1,1,1))
for o in bpy.data.objects:
    if o.type=='MESH' and o.name.startswith('Alpha'):o.data.transform(_wm);o.data.update()
A_TRUNK=[(x,y,z,rx*A_WIDEN,rz) for x,y,z,rx,rz in A_TRUNK]
A_TEETH=[(x*A_WIDEN,y,z,l,lo,i) for x,y,z,l,lo,i in A_TEETH]
A_LEGJ={k:tuple((p[0]*A_WIDEN,p[1],p[2]) for p in j) for k,j in A_LEGJ.items()}
bpy.data.texts['adata'].from_string('\n'.join(k+' = '+repr(globals()[k]) for k in ['A_TRUNK','A_MOUTH','A_CORNER','A_TEETH','A_LEGJ']))
