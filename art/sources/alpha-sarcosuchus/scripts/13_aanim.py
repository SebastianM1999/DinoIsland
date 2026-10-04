for atxt in ['lib','anim','adata']:exec(bpy.data.texts[atxt].as_string(),globals())
init('AlphaRig')
A_LEGS=list(A_LEGJ)
def a_tail(t,amp=.035):chain('Tail',8,lambda i:((X,.008*math.sin(TAU*t-.4*i)),(Z,amp*math.sin(TAU*t-.45*i))))
def a_idle(t):
    br=math.sin(2*TAU*t);loc('Body',(0,0,.015*br))
    look=track(t,[(0,0),(.12,0),(.25,.09),(.43,.09),(.57,-.07),(.75,-.07),(.9,0),(1,0)])
    rot('Neck1',(Z,look*.4));rot('Neck2',(Z,look*.35));rot('Head',(Z,look*.25),(X,.007*br))
    rot('Jaw',(X,.015*max(0,math.sin(TAU*t))));a_tail(t,.025)
def a_walk(t):
    for k in A_LEGS:quad_leg(k,(t+LATERAL[k])%1,1.2,.68,.26,tilt=0)
    loc('Body',(.025*math.sin(TAU*t),0,-.08+.025*math.cos(2*TAU*t)))
    rot('Body',(Z,.012*math.sin(TAU*t)),(Y,.018*math.sin(TAU*t)))
    rot('Shoulders',(Z,-.016*math.sin(TAU*t)))
    rot('Head',(Z,-.012*math.sin(TAU*t)));a_tail(t,.035)
def a_run(t):
    phases={'BackL':0,'BackR':.2,'FrontL':.7,'FrontR':.5}
    for k in A_LEGS:quad_leg(k,(t+phases[k])%1,1.5,.42,.4,tilt=0)
    loc('Body',(0,0,-.1+.06*math.cos(2*TAU*(t-.06))))
    rot('Body',(X,.025*math.sin(TAU*t)))
    rot('Shoulders',(X,.025*math.sin(TAU*t+.6)))
    rot('Head',(X,-.035-.025*math.sin(TAU*t)));rot('Jaw',(X,.03));a_tail(t,.02)
    rot('Tail1',(X,.065+.008*math.sin(TAU*t)),(Z,.02*math.sin(TAU*t)))
def a_attack(t):
    wind=track(t,[(0,0),(.25,1),(.34,1),(.46,0),(.65,0),(1,0)])
    thrust=track(t,[(0,0),(.3,-.12),(.45,.5),(.57,.48),(.8,.16),(1,0)])
    loc('Body',(0,-thrust,-.16*wind));rot('Neck1',(X,-.10*wind))
    rot('Neck2',(X,-.06*wind))
    # Lift the long snout before the full authored gape. The catalog marks this
    # attack's jaw as authored, so runtime overlays do not add a second opening.
    rot('Head',(X,track(t,[(0,-.08),(.18,-.16),(.36,-.16),(.5,-.10),(.8,-.10),(1,-.08)])))
    rot('Jaw',(X,track(t,[(0,0),(.25,.48),(.36,.48),(.49,.005),(.6,.025),(1,0)])))
    for k in A_LEGS:loc('IK_'+k,(0,-thrust,0))
    a_tail(t,.015)
def a_roar(t):
    lift=track(t,[(0,0),(.2,1),(.75,1),(1,0)])
    rot('Neck1',(X,-.06*lift));rot('Neck2',(X,-.04*lift));rot('Head',(X,-.025*lift))
    rot('Jaw',(X,.25*lift));a_tail(t,.02)
def a_sweep(t):
    turn=track(t,[(0,0),(.3,-.25),(.4,-.27),(.56,.34),(.68,.3),(1,0)])
    rot('Body',(Z,turn*.23));rot('Shoulders',(Z,-turn*.23));rot('Head',(Z,-turn*.08))
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
    gather=track(t,[(0,0),(.28,1),(.4,1),(.56,0),(.8,.12),(1,0)])
    thrust=track(t,[(0,0),(.38,-.12),(.54,.24),(.65,.2),(1,0)])
    loc('Body',(0,-thrust,-.05*gather))
    rot('Neck1',(X,-.055*gather));rot('Head',(X,-.1-.06*gather))
    rot('Jaw',(X,track(t,[(0,0),(.32,.40),(.41,.40),(.55,.005),(.7,.025),(1,0)])))
    for k in A_LEGS:loc('IK_'+k,(0,-thrust,0))
    a_tail(t,.015)

def a_shove(t):
    wind=track(t,[(0,0),(.35,1),(.5,1),(.67,0),(1,0)])
    push=track(t,[(0,0),(.45,-.12),(.68,.38),(.8,.32),(1,0)])
    loc('Body',(push,0,-.10*wind));rot('Body',(Y,-.035*wind),(Z,.025*wind))
    rot('Shoulders',(Y,track(t,[(0,0),(.5,.06),(.68,-.09),(1,0)])))
    rot('Head',(X,-.06),(Z,-.06*wind));rot('Jaw',(X,.018))
    for k in A_LEGS:loc('IK_'+k,(push,0,0))
    chain('Tail',8,lambda i:((Z,-.035*push*math.sin((i+1)*math.pi/9)),))

def a_pivot(t):
    # Server turns the whole creature with a bounded yaw rate. Animate the
    # planted-front-foot weight transfer and counterbalancing hips/tail locally.
    turn=track(t,[(0,0),(.25,-.08),(.6,.10),(.82,.06),(1,0)])
    loc('Body',(0,0,-.06*math.sin(math.pi*t)**2));rot('Body',(Z,turn))
    rot('Shoulders',(Z,-turn*.7));rot('Head',(Z,-turn*.3),(X,-.035))
    for k in A_LEGS:
        if k.startswith('Back'):
            sx=1 if k.endswith('L') else -1
            loc('IK_'+k,(sx*.10*math.sin(math.pi*t)**2,0,.10*math.sin(math.pi*t)**2))
    chain('Tail',8,lambda i:((Z,-turn*.12*math.sin((i+1)*math.pi/9)),))

def a_retreat(t):
    for k in A_LEGS:quad_leg(k,(1-t+LATERAL[k])%1,.60,.68,.18,tilt=0)
    loc('Body',(0,0,-.08+.015*math.cos(2*TAU*t)))
    rot('Head',(X,-.055));a_tail(t,.025)

def a_ambush(t):
    # Submersion is a world-space water/floor placement, never a mesh below its
    # local ground. This clip coils, holds as a warning, then bursts low forward.
    coil=track(t,[(0,0),(.25,1),(.52,1),(.62,0),(.8,0),(1,0)])
    thrust=track(t,[(0,0),(.52,-.18),(.67,.58),(.77,.5),(1,0)])
    loc('Body',(0,-thrust,-.20*coil));rot('Neck1',(X,-.05*coil))
    rot('Head',(X,-.12-.04*coil))
    rot('Jaw',(X,track(t,[(0,0),(.47,.48),(.56,.48),(.67,.01),(.8,.035),(1,0)])))
    for k in A_LEGS:loc('IK_'+k,(0,-thrust,0))
    chain('Tail',8,lambda i:((Z,.02*math.sin(TAU*t-.4*i)*math.sin(math.pi*t)),))

def a_recovery(t):
    # Deliberate vulnerable settle; no additional strike inside this window.
    fatigue=track(t,[(0,0),(.2,1),(.72,1),(1,0)])
    loc('Body',(0,0,-.10*fatigue));rot('Head',(X,-.03*fatigue))
    rot('Jaw',(X,.025*fatigue));a_tail(t,.008)

A_CLIPS={'Idle':(a_idle,150),'Walk':(a_walk,48),'Run':(a_run,30),'Attack':(a_attack,40),'Roar':(a_roar,60),'Death':(a_death,66),'TailSweep':(a_sweep,48),'Swim':(a_swim,48),'Bite':(a_bite,23),'Shove':(a_shove,26),'Pivot':(a_pivot,30),'Retreat':(a_retreat,36),'Ambush':(a_ambush,48),'Recovery':(a_recovery,44)}
