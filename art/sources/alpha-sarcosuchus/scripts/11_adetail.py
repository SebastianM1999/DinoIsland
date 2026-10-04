for atxt in ['lib','fuse','mouth','eyes','adata']: exec(bpy.data.texts[atxt].as_string(),globals())
body=bpy.data.objects['AlphaBody']; A_BVH=_bvh(_bake(body))
A_SKIN=vc_mat('AlphaHide',.53); A_GLOSS=vc_mat('AlphaWet',.29)
A_RED=vc_mat('AlphaEyeGlow',.2)
bs=next(n for n in A_RED.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Color'].default_value=(1,.007,.002,1); bs.inputs['Emission Strength'].default_value=.7
A_P={k:lin(v) for k,v in dict(back='#40583a',back2='#566c46',flank='#657b4e',flank2='#7c8d5c',belly='#838967',stripe='#33482e').items()}
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
    blood=mix(lin('#54231e'),lin('#a54836'),.32+.4*fbm(p,13))
    return mix(c,blood,wound*.9)
def a_hide(p,n):
    c=countershade(p,n,A_P,mottle=2.4)
    # Smaller irregular scale fields painted between the modeled scutes. Dark borders,
    # olive centers and moss-green tonal drift are all vertex colors, no image textures.
    aa=p.x if abs(n.z)>.6 else p.z
    band=math.floor(aa/.18); yy=p.y/.23+(.5 if band%2 else 0)
    edge=min(abs(math.sin(math.pi*aa/.18)),abs(math.sin(math.pi*yy)))
    c=shade(c,.66+.34*smooth(.05,.35,edge))
    c=mix(c,lin('#91a16e'),smooth(.08,.32,fbm(p,5))*.15)
    return a_scar_tint(p,c)
def a_headpaint(p,n):
    c=a_hide(p,n)
    c=mix(c,lin('#282d29'),math.exp(-((p.y+4.05)/.45)**2-((p.z-2.78)/.2)**2)*.55)
    return mix(c,lin('#73392f'),math.exp(-((p.z-A_MOUTH)/.06)**2)*.65)
def a_jawpaint(p,n):
    c=mix(a_hide(p,n),lin('#8c946e'),.35)
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
    return mix(lin('#354b30'),lin('#7f925c'),smooth(-.15,.8,n.z)*.4+.14*fbm(p,3))
def a_scale_color(p,t):
    green=mix(lin('#47603b'),lin('#768956'),.45+.6*fbm(p,3))
    green=mix(green,lin('#8a9b66'),.18*math.sin(p.y*3+p.z*7)**2)
    return shade(green,.6+.4*smooth(.0,.65,t))
paint_t(armor,a_scale_color);armor.data.materials.append(A_SKIN)
paint_t(ridges,lambda p,t:mix(lin('#35492f'),lin('#7d8c59'),smooth(.15,.8,t)));ridges.data.materials.append(A_SKIN)
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
A_EP={k:lin(v) for k,v in dict(iris='#e6381f',iris2='#95241a',glow='#ff7b36',limbal='#411a16',pupil='#160b09',sclera='#902a1d',lid='#405339',lid2='#6d8050').items()}
paint_eyes('Alpha',A_E,A_EP,A_RED,A_SKIN)
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
