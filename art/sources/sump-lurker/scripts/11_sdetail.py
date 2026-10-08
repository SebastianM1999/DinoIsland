for stxt in ['lib','fuse','mouth','eyes','sdata']: exec(bpy.data.texts[stxt].as_string(),globals())
body=bpy.data.objects['SumpBody']; S_BVH=_bvh(_bake(body))
S_SKIN=vc_mat('SumpHide',.53); S_GLOSS=vc_mat('SumpWet',.29)
S_GLOW=vc_mat('SumpEyeCloud',.25)
# Readable under the game's darker lighting: olive-bronze back, lighter olive flanks, cream-yellow
# ventral shields, dark crocodile crossbands. (The near-black #17271b hide read as a flat silhouette.)
# Cave colouration: blotchy cold slate back fading to grey-white flanks and a pale belly (never sunlit, never green).
S_P={k:lin(v) for k,v in dict(back='#6a7683',back2='#59656f',flank='#99a5ae',flank2='#b3bec5',belly='#e7ecec',stripe='#3f4954').items()}
S_WOUNDS=[]   # no scars: the lurker is an untouched cave animal
def s_wound(p):
    if abs(p.x)<.35:return 0
    mask=0
    for y0,z0,dy,dz,width,phase in S_WOUNDS:
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
def s_scar_tint(p,c):
    wound=s_wound(p)
    blood=mix(lin('#a21d23'),lin('#f24b38'),.48+.4*fbm(p,13))
    return mix(c,blood,wound*.97)
def s_cells(u,v):
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

def s_hide(p,n):
    c=countershade(p,n,S_P,mottle=2.4)
    # Raptor-like broad mottling and stego-like rim/center contrast, translated
    # into crocodilian scutes, transverse belly shields and folded joint skin.
    grain=fbm(p,3.1);broad=fbm(p,.85)
    top=abs(n.z)**3/(abs(n.z)**3+abs(n.x)**3+.001)
    centre,variation=s_cells(p.y/.38+.13*math.sin(p.z*3),p.x/.32)
    side,sv=s_cells(p.y/.37+.15*math.sin(p.z*4),p.z/.31)
    centre=centre*top+side*(1-top);variation=variation*top+sv*(1-top)
    c=shade(c,.62+.34*centre+.2*variation)
    c=mix(c,lin('#c4ced3'),smooth(-.03,.28,broad)*(.25+.2*centre))
    c=mix(c,lin('#46515c'),smooth(.10,.32,grain)*.22)
    # crocodile crossbands over back and tail (fading down the flanks), dark speckles on the sides
    # blotchy cave camouflage: irregular pale and slate patches over the back and tail instead of crossbands
    blot=smooth(.16,.3,fbm(p*V((1,.55,1)),1.7))*smooth(-.35,.25,n.z)
    c=mix(c,lin('#d8e0e3'),blot*.55)
    dark=smooth(.2,.34,fbm(p*V((1,.6,1))+V((9,3,1)),2.3))*smooth(-.3,.3,n.z)
    c=mix(c,S_P['stripe'],dark*.5)
    speck=smooth(.62,.7,fbm(p*V((1,.7,1)),7.5))*smooth(.6,-.1,abs(n.z))
    c=mix(c,S_P['stripe'],speck*.4)
    # Longer rectangular ventral shields and irregular folds at elbows/hips.
    belly=smooth(.15,-.55,n.z)
    shield=abs(math.sin(p.y*math.pi/.43+.15*math.sin(p.x*4)))
    c=shade(c,1-belly*.38*(1-smooth(.10,.40,shield)))
    joints=math.exp(-((p.y+1.1)/.48)**2)+math.exp(-((p.y-.95)/.5)**2)
    folds=(1-smooth(.06,.38,abs(math.sin(p.z*17+.8*math.sin(p.y*4)))))
    c=shade(c,1-.28*folds*min(1,joints)*smooth(1.15,1.6,abs(p.x)))
    return s_scar_tint(p,c)
def s_lure(p,c):
    # faint teal-cyan speckles along the lips and snout: the lure that draws prey to the jaws
    near=smooth(-3.6,-5.2,p.y)*smooth(.9,.25,abs(p.z-S_MOUTH))
    spk=smooth(.60,.68,fbm(p*V((1.4,1.4,1.4)),11.0))
    return mix(c,lin('#38e8de'),spk*near*.75)
def s_headpaint(p,n):
    c=s_hide(p,n)
    c=mix(c,lin('#59656f'),math.exp(-((p.y+4.05)/.45)**2-((p.z-2.78)/.2)**2)*.4)
    c=s_lure(p,c)
    return mix(c,lin('#9c6a72'),math.exp(-((p.z-S_MOUTH)/.06)**2)*.6)
def s_jawpaint(p,n):
    c=mix(s_hide(p,n),lin('#c9d3d7'),.3)
    c=s_lure(p,c)
    return mix(c,lin('#9c6a72'),smooth(1.98,2.13,p.z)*smooth(.5,.05,abs(p.x)))
paint_regions(body,s_hide,s_headpaint,s_jawpaint)
for v in body.data.vertices:
    m=s_wound(v.co)
    if m>.2:v.co-=v.normal*(.018*m)
# Boolean union retains an empty material slot. Clear it; the glTF exporter otherwise
# emits a default material and silently exports the other skin parts with white colors.
body.data.materials.clear();body.data.materials.append(S_SKIN)
for f in body.data.polygons:f.material_index=0
# Distinct staggered armor rows. Plates overlap along the back; low domes stay embedded.
def s_plate(bm,hit,wide,long,raised=.055):
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
    rx=next((a[3]+(b[3]-a[3])*(y-a[1])/(b[1]-a[1]) for a,b in zip(S_TRUNK,S_TRUNK[1:]) if a[1]<=y<=b[1]),.2)
    for row,f in enumerate((-.4,.4)):
        yy=y+(.16 if row%2 else 0); x=rx*f
        hit=S_BVH.ray_cast(V((x,yy,8)),V((0,0,-1)))
        if hit[0] is None: continue
        p=hit[0]; size=max(.08,min(.28,rx*.2))
        s_plate(bm,hit,size,.26,.07 if i<14 else .045)
    if i%1==0:
        for sx in (-1,1):
            x=sx*rx*.2; hit=S_BVH.ray_cast(V((x,y,8)),V((0,0,-1)))
            if hit[0] is not None:
                p=hit[0]; height=(.18+.13*math.sin(math.pi*min(1,i/22)))*(.8+ .2*math.sin(i*1.8)**2)
                horn_bm(rbm,(x,y,p.z+.05),(x,y+.2,p.z+height),.13 if i<15 else .09,bend=(0,-.08,.04),seg=8,rings=4,flat=.6)
# Dense tessellated flank scales with staggered rows. These are shallow angular plates,
# with embedded rims and deliberate dark gaps; never spherical dots.
for i in range(29):
    y=-3.05+i*.36
    for sx in (-1,1):
        for j in range(2):
            zz=1.45+j*.4;yy=y+(.18 if j%2 else 0)
            hit=S_BVH.ray_cast(V((sx*5,yy,zz)),V((-sx,0,0)))
            if hit[0] is not None and abs(hit[1].x)>.3:s_plate(peb,hit,.165,.18,.04)
armor=mk('SumpArmor',bm); ridges=mk('SumpRidges',rbm); pebbles=mk('SumpPebbles',peb)
def s_armor(p,n):
    return mix(lin('#7b8892'),lin('#b9c4ca'),smooth(-.15,.8,n.z)*.5+.16*fbm(p,3))
def s_scale_color(p,t):
    green=mix(lin('#c3ccd1'),lin('#e5eaea'),.40+.7*fbm(p,2.2))   # small pale scutes
    green=mix(green,lin('#8a97a1'),smooth(.55,.8,math.sin(p.y*2.35+.9*fbm(p,.9)))*.35)
    # Embedded almost-black seams, olive crown, weathered lichen flecks, and
    # directional ribbing carry detail like the stego's modeled plate painting.
    crown=smooth(.12,.70,t)
    green=shade(green,.5+.5*crown)
    rib=abs(math.sin(p.y*19+.65*math.sin(p.x*8+p.z*5)))
    green=shade(green,1-.24*smooth(.65,.95,rib)*crown)
    green=mix(green,lin('#f2f5f4'),smooth(.16,.36,fbm(p,8))*.3*crown)              # weathered pale crowns
    return green
paint_t(armor,s_scale_color);armor.data.materials.append(S_SKIN)
paint_t(ridges,lambda p,t:mix(lin('#8f9ca5'),lin('#eef2f2'),smooth(.15,.8,t)));ridges.data.materials.append(S_SKIN)
paint_t(pebbles,s_scale_color);pebbles.data.materials.append(S_SKIN)
# Fine cranial scutes: compact asymmetric fields, not oversized separate lumps.
hbm=bmesh.new()
for i in range(23):
    y=-8.3+i*.20
    for j in range(-1,2):
        hit=S_BVH.ray_cast(V((j*.14*smooth(-8.3,-4.6,y),y+(j%2)*.09,8)),V((0,0,-1)))
        if hit[0] is not None and (j==0 or y>-6):s_plate(hbm,hit,.07 if y<-5.5 else .1,.075 if y<-5.5 else .095,.02)
    for sx in (-1,1):
        for z in [2.3]:
            hit=S_BVH.ray_cast(V((sx*5,y,z)),V((-sx,0,0)))
            if hit[0] is not None:s_plate(hbm,hit,.085,.095,.022)
headscales=mk('SumpHeadScales',hbm);paint_t(headscales,s_scale_color);headscales.data.materials.append(S_SKIN)
# Smaller scales on bent limbs track their local surface and retain joint articulation.
lbm=bmesh.new()
for key,(hip,knee,ank,toe) in S_LEGJ.items():
    sx=1 if hip[0]>0 else -1
    for j in range(5):
        z=.55+j*.24
        for i in range(3):
            y=knee[1]+(i-1)*.23
            hit=S_BVH.ray_cast(V((sx*5,y,z)),V((-sx,0,0)))
            if hit[0] is not None and abs(hit[0].x)>1.35:s_plate(lbm,hit,.075,.085,.03)
legscales=mk('SumpLegScales',lbm);paint_t(legscales,s_scale_color);legscales.data.materials.append(S_SKIN)
bm=bmesh.new()
for x,y,z,l,lower,i in S_TEETH:
    dz=1 if lower else -1
    horn_bm(bm,(x,y,z-dz*.045),(x*.94,y+.025,z+dz*l),.04+.01*math.sin(i)**2,bend=(0,.035,0),seg=6,rings=4)
teeth=mk('SumpTeeth',bm); paint_t(teeth,lambda p,t:mix(lin('#cfc9b4'),lin('#f6f4ea'),smooth(.05,.7,t))); teeth.data.materials.append(S_GLOSS)
bm=bmesh.new()
for hip,knee,ank,toe in S_LEGJ.values():
    sx=1 if ank[0]>0 else -1
    for j in range(4):
        tx=ank[0]+(j-1.5)*.24; ty=ank[1]-.55-.13*(1-abs(j-1.5)/2)
        horn_bm(bm,(tx+sx*.025,ty-.16,.23),(tx+sx*.08,ty-.48,.075),.105,bend=(0,-.1,.08),seg=8,rings=4)
claws=mk('SumpClaws',bm); paint_t(claws,lambda p,t:mix(lin('#8c949a'),lin('#3d464c'),t)); claws.data.materials.append(S_GLOSS)
tongue=add_tongue('SumpTongue',(0,-5.8,1.98),(.2,2.0,.07),seg=(18,10));paint(tongue,lambda p,n:lin('#c98f94'));tongue.data.materials.append(S_SKIN)
S_E=dict(c=(.86,-4.03,2.84),R=.095,yaw=.12,W=.9,Ht=.36,Hb=.42,tilt=.1,rim=(.14,.08),pupil=(.2,.3),iris=.8,ball=(18,12),rimseg=(28,5))
build_eyes('Sump',S_E)
# tiny clouded eyes: milky blue-white iris, a faint dark pupil, pale lids
S_EP={k:lin(v) for k,v in dict(iris='#cfdde0',iris2='#9fb4ba',glow='#e9f3f4',limbal='#7b8f96',pupil='#3a4448',sclera='#dde6e8',lid='#7d8993',lid2='#98a4ac').items()}
paint_eyes('Sump',S_E,S_EP,S_GLOSS,S_SKIN)
for name in ['SumpPupils','SumpGlints']:
    bpy.data.objects[name].data.materials.clear();bpy.data.objects[name].data.materials.append(S_GLOSS)
# Raised nasal bosses, heavy brows and joint armor follow the head/limbs.
bm=bmesh.new()
for sx in (-1,1):
    blob_bm(bm,(sx*.1,-8.2,2.3),(.12,.14,.05),seg=10,ring=6)
headplates=mk('SumpHeadPlates',bm);paint(headplates,s_armor);headplates.data.materials.append(S_SKIN)
bm=bmesh.new()
for sx in (-1,1): blob_bm(bm,(sx*.08,-8.22,2.472),(.07,.1,.02),seg=10,ring=6)
nostrils=mk('SumpNostrils',bm);paint(nostrils,lambda p,n:lin('#39434a'));nostrils.data.materials.append(S_GLOSS)
# Wounds belong to the actual skin and scale colors; no detached sticks or tubes.
for name in ['SumpArmor','SumpPebbles','SumpHeadScales','SumpLegScales']:
    ob=bpy.data.objects[name];col=ob.data.color_attributes['Col']
    for v in ob.data.vertices:
        rgb=col.data[v.index].color[:3];col.data[v.index].color=(*s_scar_tint(v.co,rgb),1)
print('tris',sum(len(p.vertices)-2 for o in bpy.data.objects if o.type=='MESH' for p in o.data.polygons))
# Final proportions are baked INTO the model before rigging: x x S_WX (slim), z x S_ZF (low). The game fits length by a
# UNIFORM scale, so nothing shears the sprawled legs.
S_WX=.8; S_ZF=.82
_wm=mathutils.Matrix.Diagonal((S_WX,1,S_ZF,1))
for o in bpy.data.objects:
    if o.type=='MESH' and o.name.startswith('Sump'):o.data.transform(_wm);o.data.update()
S_TRUNK=[(x*S_WX,y,z*S_ZF,rx*S_WX,rz*S_ZF) for x,y,z,rx,rz in S_TRUNK]
S_TEETH=[(x*S_WX,y,z*S_ZF,l,lo,i) for x,y,z,l,lo,i in S_TEETH]
S_LEGJ={k:tuple((p[0]*S_WX,p[1],p[2]*S_ZF) for p in j) for k,j in S_LEGJ.items()}
S_MOUTH_G=S_MOUTH*S_ZF
bpy.data.texts['sdata'].from_string('\n'.join(k+' = '+repr(globals()[k]) for k in ['S_TRUNK','S_MOUTH','S_CORNER','S_TEETH','S_LEGJ','S_WX','S_ZF','S_MOUTH_G']))
