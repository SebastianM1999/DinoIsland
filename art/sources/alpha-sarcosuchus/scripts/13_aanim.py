for atxt in ['lib','anim','adata']:exec(bpy.data.texts[atxt].as_string(),globals())
init('AlphaRig')
A_LEGS=list(A_LEGJ)
def a_tail(t,amp=.035):chain('Tail',8,lambda i:((X,.008*math.sin(TAU*t-.4*i)),(Z,amp*math.sin(TAU*t-.45*i))))

def a_step(k,t,start,end,offset,lift=.16):
    # A real swing arc followed by a held contact; no simultaneous sliding pads.
    u=max(0,min(1,(t-start)/(end-start)))
    settle=track(t,[(0,1),(.82,1),(1,0)])
    loc('IK_'+k,(offset[0]*ss(u)*settle,offset[1]*ss(u)*settle,
        lift*math.sin(math.pi*u)**1.3))

def a_snap(t,open_at,hold_at,close_at,gape=.48):
    rot('Jaw',(X,track(t,[(0,0),(open_at,gape),(hold_at,gape),
        (close_at,.005),(close_at+.065,.045),(.88,.018),(1,0)])))
def a_idle(t):
    br=math.sin(2*TAU*t);loc('Body',(0,0,.015*br))
    look=track(t,[(0,0),(.12,0),(.25,.09),(.43,.09),(.57,-.07),(.75,-.07),(.9,0),(1,0)])
    rot('Neck1',(Z,look*.4));rot('Neck2',(Z,look*.35));rot('Head',(Z,look*.25),(X,.007*br))
    rot('Jaw',(X,.015*max(0,math.sin(TAU*t))));a_tail(t,.025)
def a_spine_wave(t,hips,shoulders,neck,tail,lag=.55):
    """Crocodilian lateral undulation: hips and shoulders swing in opposition, the neck/head counter
    so the head stays steady, and an S-wave travels down the tail growing toward the tip."""
    f=TAU*t
    rot('Body',(Z,hips*math.sin(f)),(Y,.035*math.sin(f)))
    rot('Shoulders',(Z,-shoulders*math.sin(f+.35)))
    rot('Neck1',(Z,neck*math.sin(f+.6)));rot('Neck2',(Z,neck*.8*math.sin(f+.9)))
    rot('Head',(Z,-neck*.6*math.sin(f+1.1)))
    chain('Tail',8,lambda i:((X,.006*math.sin(2*f-.5*i)),(Z,tail*(.55+.12*i)*math.sin(f-lag*(i+1)))))
def a_walk(t):
    # Big, unhurried strides (lateral sequence) so the giant does not patter: stride 2.0 m / duty .7.
    for k in A_LEGS:quad_leg(k,(t+LATERAL[k])%1,2.0,.7,.34,tilt=.1)
    loc('Body',(.04*math.sin(TAU*t),0,-.1+.035*math.cos(2*TAU*(t-.06))))
    a_spine_wave(t,.11,.14,.075,.085)        # agile: strong S-wave through body and tail
    rot('Head',(X,.015*math.cos(2*TAU*t)))
def a_run(t):
    # Charge: bounding gallop - hind pair drives, front pair lands; the body rocks nose-down/up,
    # the head stays up and forward, the tail swings less and lifts a little for balance.
    phases={'BackL':0,'BackR':.1,'FrontL':.5,'FrontR':.6}
    for k in A_LEGS:quad_leg(k,(t+phases[k])%1,2.6,.38,.55,tilt=.12)
    rock=1.35*math.sin(TAU*t+.5)
    loc('Body',(0,0,-.24+.12*math.cos(2*TAU*(t-.08))))
    rot('Body',(X,.07*rock),(Z,.03*math.sin(TAU*t)))
    rot('Shoulders',(X,-.06*rock),(Z,-.035*math.sin(TAU*t+.4)))
    rot('Neck1',(X,-.06+.03*rock));rot('Neck2',(X,-.03))
    rot('Head',(X,-.06-.05*rock));rot('Jaw',(X,.06+.03*math.sin(2*TAU*t)))
    chain('Tail',8,lambda i:((X,(.09 if i==0 else .012)+.016*math.sin(TAU*t-.6*i)),(Z,.035*(1+.15*i)*math.sin(TAU*t-.55*(i+1)))))
def a_attack(t):
    wind=track(t,[(0,0),(.24,.9),(.40,1),(.49,0),(.70,0),(1,0)])
    thrust=track(t,[(0,0),(.38,-.18),(.49,.36),(.57,.31),(.78,.10),(1,0)])
    load=track(t,[(0,0),(.38,1),(.5,-.25),(.65,.35),(1,0)])
    loc('Body',(.035*load,-thrust,-.20*wind-.06*max(0,load)))
    rot('Body',(X,.018*load));rot('Shoulders',(X,-.025*wind))
    rot('Neck1',(X,-.075*wind));rot('Neck2',(X,-.045*wind))
    rot('Head',(X,track(t,[(0,-.08),(.28,-.17),(.42,-.17),(.51,-.10),(.63,-.13),(1,-.08)])),
        (Z,track(t,[(0,0),(.52,0),(.59,.032),(.68,-.025),(.8,.008),(1,0)])))
    a_snap(t,.28,.44,.505)
    for k in A_LEGS:
        start,end=(.45,.60) if k=='FrontL' else (.51,.66) if k=='FrontR' else (.62,.76) if k=='BackL' else (.68,.82)
        a_step(k,t,start,end,(0,-.30),.22 if k.startswith('Front') else .16)
    chain('Tail',8,lambda i:((X,.018*load*math.exp(-i*.25)),
        (Z,-.012*track(max(0,t-i*.02),[(0,0),(.40,1),(.6,-.5),(1,0)]))))
def a_roar(t):
    lift=track(t,[(0,0),(.16,.35),(.3,1),(.74,1),(.9,.15),(1,0)])
    loc('Body',(0,.035*lift,-.07*lift))
    rot('Neck1',(X,-.085*lift));rot('Neck2',(X,-.055*lift));rot('Head',(X,-.04*lift))
    rot('Jaw',(X,.25*lift));a_tail(t,.02)
def a_sweep(t):
    turn=track(t,[(0,0),(.3,-.25),(.4,-.27),(.56,.34),(.68,.3),(1,0)])
    rot('Body',(Z,turn*.23));rot('Shoulders',(Z,-turn*.23));rot('Head',(Z,-turn*.08))
    brace=track(t,[(0,0),(.28,1),(.40,1),(.65,.6),(.86,.25),(1,0)])
    loc('Body',(0,0,-.12*brace))
    # Front pads stay rooted while the hips load and release the tail.
    for k in ['BackL','BackR']:
        a_step(k,t,.12 if k.endswith('L') else .20,.30 if k.endswith('L') else .38,
            (.12 if k.endswith('L') else -.12,0),.12)
    chain('Tail',8,lambda i:((Z,track(max(0,t-.018*i),[(0,0),(.3,-.231),(.4,-.2475),(.57,.33),(.7,.2475),(1,0)])),))
def a_swim(t):
    chain('Tail',8,lambda i:((Z,.1*math.sin(TAU*t-.48*i)),))
    for k in A_LEGS:
        loc('IK_'+k,(0,.16,.26));rot(k[:-1]+'Foot'+k[-1],(X,.06*math.sin(TAU*t)))
    rot('Shoulders',(Z,-.025*math.sin(TAU*t)));rot('Head',(Z,.025*math.sin(TAU*t)))
def a_death(t):
    sink=track(t,[(0,0),(.2,0),(.6,1),(.7,.95),(.82,1),(1,1)])
    loc('Body',(0,0,-.65*sink))
    for k in A_LEGS:loc('IK_'+k,((.22 if k.endswith('L') else -.22)*sink,0,0))
    rot('Neck1',(X,.025*sink));rot('Head',(X,.02*sink));rot('Jaw',(X,.045*sink))
    chain('Tail',8,lambda i:((X,.01*sink),(Z,.018*sink)))

def a_bite(t):
    gather=track(t,[(0,0),(.25,.8),(.38,1),(.52,0),(.65,.3),(1,0)])
    thrust=track(t,[(0,0),(.38,-.10),(.52,.22),(.61,.17),(1,0)])
    loc('Body',(0,-thrust,-.09*gather));rot('Shoulders',(X,-.025*gather))
    rot('Neck1',(X,-.045*gather));rot('Neck2',(X,-.025*gather))
    rot('Head',(X,-.09-.08*gather),(Z,track(t,[(0,0),(.54,0),(.64,-.04),(.74,.02),(1,0)])))
    a_snap(t,.28,.40,.54,.40)
    a_step('FrontL',t,.52,.69,(0,-.17),.13)
    a_step('FrontR',t,.66,.81,(0,-.12),.10)
    a_tail(t,.012)

def a_shove(t):
    wind=track(t,[(0,0),(.32,.8),(.50,1),(.64,0),(.80,.15),(1,0)])
    push=track(t,[(0,0),(.50,-.14),(.65,.34),(.76,.25),(1,0)])
    loc('Body',(push,-.07*max(0,push),-.14*wind))
    rot('Body',(Y,-.045*wind),(Z,.035*wind))
    rot('Shoulders',(Y,track(t,[(0,0),(.50,.09),(.65,-.075),(.78,-.03),(1,0)])))
    rot('Head',(X,-.075),(Z,-.045*wind));rot('Jaw',(X,.018))
    a_step('FrontL',t,.54,.69,(.30,-.05),.18)
    a_step('BackL',t,.64,.79,(.22,0),.14)
    a_step('FrontR',t,.72,.85,(.16,0),.12)
    chain('Tail',8,lambda i:((Z,-.05*track(max(0,t-.025*i),[(0,0),(.50,-.5),(.70,1),(1,0)])*math.sin((i+1)*math.pi/9)),))

def a_pivot(t):
    # Server turns the whole creature with a bounded yaw rate. Animate the
    # planted-front-foot weight transfer and counterbalancing hips/tail locally.
    turn=track(t,[(0,0),(.25,-.08),(.6,.10),(.82,.06),(1,0)])
    loc('Body',(0,0,-.06*math.sin(math.pi*t)**2));rot('Body',(Z,turn))
    rot('Shoulders',(Z,-turn*.7));rot('Head',(Z,-turn*.3),(X,-.035))
    for k in A_LEGS:
        start={'BackL':.06,'FrontR':.23,'BackR':.42,'FrontL':.60}[k]
        sx=1 if k.endswith('L') else -1
        a_step(k,t,start,start+.20,(sx*.20,.08 if k.startswith('Back') else -.08),.18)
    chain('Tail',8,lambda i:((Z,-turn*.12*math.sin((i+1)*math.pi/9)),))

def a_retreat(t):
    for k in A_LEGS:quad_leg(k,(1-t+LATERAL[k])%1,.60,.68,.18,tilt=0)
    loc('Body',(0,0,-.08+.015*math.cos(2*TAU*t)))
    rot('Head',(X,-.055));a_tail(t,.025)

def a_ambush(t):
    # Submersion is a world-space water/floor placement, never a mesh below its
    # local ground. This clip coils, holds as a warning, then bursts low forward.
    coil=track(t,[(0,0),(.20,.8),(.48,1),(.54,1),(.63,0),(.76,.15),(1,0)])
    thrust=track(t,[(0,0),(.52,-.16),(.65,.35),(.75,.28),(1,0)])
    loc('Body',(0,-thrust,-.20*coil));rot('Shoulders',(X,-.02*coil))
    rot('Neck1',(X,-.06*coil));rot('Neck2',(X,-.03*coil))
    rot('Head',(X,-.10-.075*coil));a_snap(t,.45,.57,.675)
    # Feet paddle independently during the warning, then reach for the bank in
    # two staggered front contacts, followed by the hind drive and weight settle.
    for k in A_LEGS:
        paddle=track(t,[(0,0),(.20,1),(.48,1),(.58,0),(1,0)])
        start={'FrontL':.56,'FrontR':.62,'BackL':.71,'BackR':.77}[k]
        a_step(k,t,start,start+.13,(0,-.28),.25 if k.startswith('Front') else .18)
        b=pb['IK_'+k];off=b.bone.matrix_local.to_3x3()@b.location
        off.y+=.12*paddle;off.z+=.14*paddle;loc('IK_'+k,off)
    chain('Tail',8,lambda i:((Z,.035*math.sin(TAU*t-.45*i)*math.sin(math.pi*t)),
        (X,.008*coil*math.exp(-i*.25))))

def a_recovery(t):
    # Deliberate vulnerable settle; no additional strike inside this window.
    fatigue=track(t,[(0,0),(.2,1),(.72,1),(1,0)])
    loc('Body',(.025*fatigue,0,-.13*fatigue));rot('Shoulders',(X,.008*fatigue))
    rot('Head',(X,-.03*fatigue));rot('Jaw',(X,.025*fatigue));a_tail(t,.008)
    a_step('FrontR',t,.10,.32,(0,.10),.10)
    a_step('BackL',t,.40,.62,(0,.07),.08)

A_CLIPS={'Idle':(a_idle,150),'Walk':(a_walk,48),'Run':(a_run,30),'Attack':(a_attack,40),'Roar':(a_roar,60),'Death':(a_death,66),'TailSweep':(a_sweep,48),'Swim':(a_swim,48),'Bite':(a_bite,23),'Shove':(a_shove,26),'Pivot':(a_pivot,30),'Retreat':(a_retreat,36),'Ambush':(a_ambush,48),'Recovery':(a_recovery,44)}
