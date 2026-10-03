# Clips as pose functions of t in [0, 1] (FK only). The game picks them by flight state:
# Fly / Glide / Dive while alive in the air, Attack = dive strike, Fall = dead and still in the air
# (loops until impact), Death = impact + lying on the ground (clamps), Idle = hovering.
exec(bpy.data.texts['anim'].as_string(), globals())
init('PteraRig')

def p_wing(s, up=0.0, sweep=0.0, elbow=0.0, wrist=0.0, finger=0.0, hand_up=0.0, tip_up=0.0):
    """up: flap (+ raises the wing), sweep: + swings it back, elbow/wrist/finger: + fold back,
    hand_up/tip_up: extra flap on the outer bones (lag / flex)."""
    sx = 1 if s == 'L' else -1
    rot('WingUp' + s, (Y, -sx * up), (Z, sx * sweep))
    rot('WingLow' + s, (Z, sx * elbow))
    rot('WingHand' + s, (Z, sx * wrist), (Y, -sx * hand_up))
    rot('WingFinger' + s, (Z, sx * finger), (Y, -sx * tip_up))

def p_legs(thigh=1.25, shin=-0.15, foot=0.5, splay=0.0):
    """Legs trail behind in flight (thigh + swings the foot back)."""
    for s, sx in (('L', 1), ('R', -1)):
        rot('BackUpLeg' + s, (X, thigh), (Y, sx * splay)); rot('BackLowLeg' + s, (X, shin)); rot('BackFoot' + s, (X, foot))

P_FLAP = [(0, .62), (.42, -.42), (1, .62)]                 # fast downstroke, slower upstroke
def p_fly(t):
    f = TAU * t; up = track(t, P_FLAP)
    fold = math.sin(math.pi * min(1, max(0, (t - .42) / .58)))   # upstroke: fold the hand in
    for s in 'LR':
        p_wing(s, up=up, sweep=.05 + .12 * fold, elbow=.18 * fold, wrist=.1 * fold, finger=.35 * fold,
               hand_up=.22 * math.cos(f - .8), tip_up=.18 * math.cos(f - 1.5))
    loc('Body', (0, 0, -.05 * math.cos(f + .5)))
    rot('Body', (X, .03 * math.sin(f)))
    rot('Neck1', (X, -.04 * math.sin(f + .6))); rot('Neck2', (X, -.02 * math.sin(f + 1.0)))
    rot('Head', (X, .03 * math.sin(f + 1.4))); rot('Jaw', (X, .02))
    chain('Tail', 2, lambda i: ((X, .05 * math.sin(f - .5 * i)),))
    p_legs(1.25 + .05 * math.sin(f - 1.0))

def p_glide(t):
    f = TAU * t
    look = track(t, [(0, 0), (.2, .25), (.4, .25), (.55, -.2), (.8, -.2), (1, 0)])
    for s, sx in (('L', 1), ('R', -1)):
        p_wing(s, up=.09 + .03 * math.sin(f + sx * .4), sweep=.06, finger=.05 + .04 * math.sin(f - .5),
               hand_up=.04 * math.sin(f - .8), tip_up=.08 + .05 * math.sin(f - 1.4))
    loc('Body', (0, 0, .02 * math.sin(f)))
    rot('Body', (Y, .04 * math.sin(f)), (X, .02 * math.sin(2 * f)))
    rot('Neck1', (Z, look * .3)); rot('Neck2', (Z, look * .35)); rot('Head', (Z, look * .3), (Y, -.1 * look))
    rot('Jaw', (X, .02 + .03 * max(0., math.sin(3 * f))))
    chain('Tail', 2, lambda i: ((Z, .05 * math.sin(f - .6 * i)),))
    p_legs(1.3)

def p_dive(t):
    f = TAU * t
    for s, sx in (('L', 1), ('R', -1)):
        p_wing(s, up=-.08 + .03 * math.sin(2 * f + sx), sweep=.75, elbow=.2, wrist=-.1, finger=.55,
               tip_up=.06 * math.sin(2 * f + sx * .7))
    rot('Body', (Y, .03 * math.sin(f)))
    rot('Neck1', (X, -.08)); rot('Neck2', (X, -.05)); rot('Head', (X, .12)); rot('Jaw', (X, .03))
    p_legs(1.45, -.1, .7)

def p_attack(t):
    """Dive strike: flare + talons forward + beak snap at ~0.4, then a power stroke to climb away."""
    flare = track(t, [(0, 0), (.3, 1), (.5, 1), (.62, 0)])
    stroke = track(t, [(0, 0), (.5, 0), (.66, 1), (.8, -.4), (1, 0)])        # big downstroke after the hit
    dive = track(t, [(0, 1), (.25, 0), (1, 0)])
    for s in 'LR':
        p_wing(s, up=.45 * flare + .25 - .75 * stroke - .3 * dive, sweep=.7 * dive - .25 * flare, elbow=.15 * dive,
               finger=.5 * dive - .1 * flare, hand_up=.2 * flare - .2 * stroke, tip_up=.25 * flare - .25 * stroke)
    lunge = track(t, [(0, 0), (.3, -.3), (.42, 1), (.55, .6), (.8, 0)])
    rot('Body', (X, -.25 * flare))                                             # rear up into the flare
    rot('Neck1', (X, .18 * lunge)); rot('Neck2', (X, .14 * lunge)); rot('Head', (X, .1 * lunge))
    rot('Jaw', (X, track(t, [(0, .02), (.28, .45), (.4, .45), (.46, 0), (1, .02)])))
    talon = track(t, [(0, 0), (.3, 1), (.5, 1), (.7, 0)])
    p_legs(1.3 - 2.0 * talon, -.15 + .3 * talon, .5 - .9 * talon)            # talons swing forward for the grab

P_FALL_PH = {'L': 0.0, 'R': 2.2}
def p_fall_params(t):
    """Limp tumble while dead in the air (loops): wings flailing out of phase, neck and legs dangling."""
    f = TAU * t
    w = {s: dict(up=.05 + .5 * math.sin(f + ph), sweep=.25 + .15 * math.sin(f + ph + 1), elbow=.35 + .2 * math.sin(f + ph + .5),
                 finger=.35 + .2 * math.sin(f + ph + 1.2), hand_up=.3 * math.sin(f + ph - .8), tip_up=.3 * math.sin(f + ph - 1.6))
         for s, ph in P_FALL_PH.items()}
    return dict(wing=w, roll=.55 * math.sin(f), pitch=.4 + .12 * math.sin(2 * f), drop=0.0,
                n1=(.35 + .18 * math.sin(f - .5), .15 * math.sin(f - .3)), n2=(.25 + .15 * math.sin(f - 1.0), .12 * math.sin(f - .8)),
                head=(.2 + .12 * math.sin(f - 1.5), .2 * math.sin(f - 1.2)), jaw=.12 + .05 * math.sin(f - 1.8),
                tail=-.15 + .1 * math.sin(f), legs=(.5 + .3 * math.sin(f - .4), -.4 + .2 * math.sin(f - 1), .3))

# lying on the ground after the impact: belly down, rolled a little onto the left, wings sprawled
# flat (the lower left wing angled up to stay above the ground), neck along the ground, head on its side
P_LIE = dict(wing={'L': dict(up=-.02, sweep=.32, elbow=.42, finger=.3, hand_up=-.04, tip_up=-.05),
                   'R': dict(up=-.16, sweep=.32, elbow=.42, finger=.3, hand_up=-.04, tip_up=-.05)},
             roll=.1, pitch=.03, drop=-.73, n1=(.22, .12), n2=(.14, .1), head=(-.12, .65), jaw=.1, tail=.05, legs=(1.62, -.15, .2))

def p_blend(a, b, u):
    if isinstance(a, dict): return {k: p_blend(a[k], b[k], u) for k in a}
    if isinstance(a, tuple): return tuple(x + (y - x) * u for x, y in zip(a, b))
    return a + (b - a) * u

def p_apply(P):
    loc('Body', (0, 0, P['drop'])); rot('Body', (Y, P['roll']), (X, P['pitch']))
    for s in 'LR': p_wing(s, **P['wing'][s])
    rot('Neck1', (X, P['n1'][0]), (Z, P['n1'][1])); rot('Neck2', (X, P['n2'][0]), (Z, P['n2'][1]))
    rot('Head', (X, P['head'][0]), (Y, P['head'][1])); rot('Jaw', (X, P['jaw']))
    chain('Tail', 2, lambda i: ((X, P['tail']),))
    p_legs(*P['legs'])

def p_fall(t):
    p_apply(p_fall_params(t))

def p_death(t):
    """Impact from the Fall pose (frame 0 == Fall frame 0, so the switch never pops): slam onto the
    belly, one bounce, settle. The last ~40 % is still: the carcass keeps that pose."""
    hit = track(t, [(0, 0), (.18, 1), (.26, .88), (.34, 1), (1, 1)])
    settle = track(t, [(0, 0), (.2, .5), (.6, 1), (1, 1)])
    P = p_blend(p_fall_params(0), P_LIE, settle)
    fold = track(t, [(0, 0), (.15, 1)])            # legs, neck and head brace as fast as the body drops
    F0 = p_fall_params(0)
    for k in ('legs', 'n2', 'head', 'pitch'): P[k] = p_blend(F0[k], P_LIE[k], fold)
    P['n1'] = p_blend(F0['n1'], P_LIE['n1'], fold)
    P['drop'] = P_LIE['drop'] * hit
    P['jaw'] = track(t, [(0, P['jaw']), (.2, .2), (.5, .08), (1, .1)])   # the jaw is really skinned now: keep the beak off the ground
    p_apply(P)

def p_idle(t):
    """Hover: body pitched up, deep flaps, legs dangling."""
    f = TAU * t; up = track(t, P_FLAP)
    fold = math.sin(math.pi * min(1, max(0, (t - .42) / .58)))
    for s in 'LR':
        p_wing(s, up=up * 1.15, sweep=-.1 + .25 * fold, elbow=.25 * fold, finger=.4 * fold,
               hand_up=.25 * math.cos(f - .8), tip_up=.22 * math.cos(f - 1.5))
    loc('Body', (0, 0, -.07 * math.cos(f + .5)))
    rot('Body', (X, -.55))
    rot('Neck1', (X, .3)); rot('Neck2', (X, .15)); rot('Head', (X, .12 + .04 * math.sin(f + 1.2)))
    p_legs(.15 + .1 * math.sin(f - 1), -.2, .3)

P_CLIPS = {'Idle': (p_idle, 30), 'Fly': (p_fly, 30), 'Glide': (p_glide, 90), 'Dive': (p_dive, 24),
           'Attack': (p_attack, 24), 'Fall': (p_fall, 36), 'Death': (p_death, 45)}
