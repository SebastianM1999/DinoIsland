# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls.
# Walk (lateral sequence), Run = the charge (rotary gallop, head low, horns forward),
# Attack = horn thrust (head drops, shove forward, hooking toss up, 1.2 s), Idle (5 s), Death (2 s).
exec(bpy.data.texts['anim'].as_string(), globals())
init('TriRig')
# hind and front legs need the same ground speed (S / duty equal); the short front legs sweep less.
# Reach: front legs are near-straight pillars -> keep a crouch, Sf small.
TR_WALK = dict(S=1.0, duty=0.66, Sf=0.85, h=0.24, hf=0.2, z=-0.07)       # stride 1.515 m
TR_RUN = dict(S=1.3, duty=0.36, Sf=1.05, h=0.36, hf=0.28, z=-0.15)       # stride 3.611 m
TR_GALLOP = {'BackL': 0.0, 'BackR': 0.2, 'FrontR': 0.5, 'FrontL': 0.7}  # rotary gallop, always one foot down

def tr_legs(t, g, phases, tilt=0.12):
    for k in TR_LEGS:
        front = k.startswith('Front'); S = g['Sf'] if front else g['S']
        quad_leg(k, (t + phases[k]) % 1, S, g['duty'] * S / g['S'], g['hf'] if front else g['h'], tilt=tilt)

def tr_tail(fn):
    chain('Tail', 6, fn)

def tr_walk(t):
    tr_legs(t, TR_WALK, LATERAL)
    loc('Body', (.05 * math.sin(TAU * t), 0, TR_WALK['z'] + .03 * math.cos(2 * TAU * (t - .08))))
    rot('Body', (X, .012 * math.cos(2 * TAU * t)), (Y, .035 * math.sin(TAU * t)), (Z, .03 * math.sin(TAU * t)))
    rot('Shoulders', (Y, -.03 * math.sin(TAU * t + .8)), (Z, -.02 * math.sin(TAU * t)))
    rot('Neck1', (X, .03 + .02 * math.cos(2 * TAU * t - .4)), (Z, -.02 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, .02 * math.cos(2 * TAU * t - .8)), (Z, -.02 * math.sin(TAU * t - .6)))
    rot('Head', (X, -.03 - .03 * math.cos(2 * TAU * t - 1.0)), (Z, -.03 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .02))
    tr_tail(lambda i: ((X, .012 * math.cos(2 * TAU * t - .5 * i)), (Z, .05 * math.sin(TAU * t - .5 * i))))

def tr_run(t):
    """Charge: crouched rocking gallop, head lowered so the brow horns point forward, tail up and stiff."""
    tr_legs(t, TR_RUN, TR_GALLOP)
    loc('Body', (.03 * math.sin(TAU * t), 0, TR_RUN['z'] + .05 * math.cos(2 * TAU * (t - .12))))
    rot('Body', (X, .04 * math.sin(TAU * t + .4)), (Y, .03 * math.sin(TAU * t)), (Z, .02 * math.sin(TAU * t)))
    rot('Shoulders', (X, .04 - .03 * math.sin(TAU * t + .9)))
    rot('Neck1', (X, .12 + .03 * math.cos(2 * TAU * t - .4)))
    rot('Neck2', (X, .08 + .03 * math.cos(2 * TAU * t - .8)))
    rot('Head', (X, .1 - .05 * math.sin(TAU * t + .4) - .03 * math.cos(2 * TAU * t - 1.2)))
    rot('Jaw', (X, .06 + .03 * math.sin(2 * TAU * t)))
    tr_tail(lambda i: ((X, (-.05 if i == 0 else .015) - .06 * math.sin(TAU * t + .4 - .45 * i) / 6), (Z, .03 * math.sin(TAU * t - .45 * i))))

TR_LOOK = [(0, 0), (.08, 0), (.18, .5), (.36, .5), (.44, -.38), (.6, -.38), (.66, 0), (1, 0)]
def tr_idle(t):
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, .02 * br)); rot('Body', (X, -.006 * br))
    look = track(t, TR_LOOK)
    graze = track(t, [(0, 0), (.66, 0), (.74, 1), (.92, 1), (1, 0)])        # dip to the ground and chew
    snort = .06 * max(0., math.sin(TAU * 6 * t)) * track(t, [(0, 0), (.36, 0), (.38, 1), (.42, 1), (.44, 0), (1, 0)])
    rot('Shoulders', (X, .05 * graze))
    rot('Neck1', (X, .02 * math.sin(TAU * t) + .2 * graze), (Z, look * .3))
    rot('Neck2', (X, .14 * graze + snort), (Z, look * .3))
    rot('Head', (X, .03 * math.sin(2 * TAU * t + .5) + .12 * graze), (Z, look * .3), (Y, -.08 * look))
    chew = graze * max(0., math.sin(TAU * 7 * t))
    rot('Jaw', (X, .02 + .1 * chew))
    tr_tail(lambda i: ((X, .01 * math.sin(TAU * t - .4 * i)), (Z, .05 * math.sin(TAU * t - .5 * i) + .025 * math.sin(2 * TAU * t - .7 * i))))

# Horn thrust (1.2 s, plays once): rock back with the head lowered (wind-up = dodge time), shove forward
# horns first with a stomping step of the front feet (peak ~0.45), hook the horns up (toss ~0.55),
# heavy settle and step back. Hind feet stay planted.
def tr_attack(t):
    fwd = track(t, [(0, 0), (.3, .24), (.36, .26), (.47, -.42), (.58, -.46), (.8, -.12), (1, 0)])   # +y = back
    loc('Body', (0, fwd, track(t, [(0, 0), (.3, -.08), (.36, -.1), (.5, -.08), (.6, -.02), (.85, -.02), (1, 0)])))
    rot('Body', (X, track(t, [(0, 0), (.3, .03), (.45, .04), (.58, -.04), (.8, 0), (1, 0)])))
    for k, d in (('FrontL', 0), ('FrontR', .04)):     # step forward with the shove, step back in the recovery
        a = track(t - d, [(0, 0), (.34, 0), (.48, 1), (.72, 1), (.94, 0), (1, 0)])
        lift = .14 * (math.sin(math.pi * ss((t - d - .34) / .14)) + math.sin(math.pi * ss((t - d - .72) / .22)))
        loc('IK_' + k, (0, -.36 * a, max(0., lift)))
    lower = track(t, [(0, 0), (.3, 1), (.46, 1), (.56, -.6), (.66, -.7), (.85, -.1), (1, 0)])   # 1 = horns forward, <0 = toss up
    rot('Shoulders', (X, .03 * max(0, lower)))
    rot('Neck1', (X, .07 * lower), (Z, track(t, [(0, 0), (.3, -.05), (.5, .06), (.7, .03), (1, 0)])))
    rot('Neck2', (X, .06 * lower))
    rot('Head', (X, .14 * lower), (Y, track(t, [(0, 0), (.5, 0), (.58, .12), (.7, .05), (1, 0)])))
    rot('Jaw', (X, track(t, [(0, .02), (.3, .06), (.55, .12), (.7, .04), (1, .02)])))
    tr_tail(lambda i: ((X, track(t, [(0, 0), (.3, .02), (.5, -.03), (.7, .01), (1, 0)])),
                       (Z, .05 * math.sin(TAU * t * 1.5 - .5 * i) * track(t, [(0, 0), (.4, 1), (1, 0)]))))

def tr_death(t):
    """Stagger with a groan, collapse onto the belly, roll a little onto the left flank, head on the ground."""
    sink = track(t, [(0, 0), (.18, -.04), (.55, 1), (.6, .94), (.66, 1), (1, 1)])
    roll = track(t, [(0, 0), (.4, 0), (.7, 1), (.76, .9), (.82, 1), (1, 1)])
    droop = track(t, [(0, 0), (.15, .6), (.3, .5), (.72, 1), (.78, .92), (.84, 1), (1, 1)])
    loc('Body', (0, 0, -.5 * sink)); rot('Body', (Y, .1 * roll), (X, .02 * sink))
    for k in TR_LEGS:
        sx = 1 if k.endswith('L') else -1; front = k.startswith('Front')
        loc('IK_' + k, (sx * (.8 if sx < 0 else .6) * sink, (-.25 if front else .3) * sink, 0))
    rot('Neck1', (X, .02 * droop), (Z, .08 * droop))
    rot('Neck2', (X, -.04 * droop), (Z, .06 * droop))
    rot('Head', (X, -.04 * droop - .25 * track(t, [(0, 0), (.15, 1), (.35, 0)])), (Y, .18 * droop))
    rot('Jaw', (X, track(t, [(0, 0), (.15, .3), (.45, .12), (1, .08)])))
    tr_tail(lambda i: ((X, -.04 * sink if i < 2 else .05 * sink), (Z, .05 * sink * (i / 5))))

TR_CLIPS = {'Idle': (tr_idle, 150), 'Walk': (tr_walk, 48), 'Run': (tr_run, 24), 'Attack': (tr_attack, 36), 'Death': (tr_death, 60)}
