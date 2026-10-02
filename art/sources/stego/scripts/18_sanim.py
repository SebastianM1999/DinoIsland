# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls.
# Game: walk <= ~2.1 m/s, charge 8.8 m/s (run clip), tail swing = attack clip (server hit at 0.55 s of 1.2 s).
exec(bpy.data.texts['anim'].as_string(), globals())
init('StegoRig')
# hind and front legs need the same ground speed: S / duty equal; the short front legs sweep less
S_WALK = dict(S=1.1, duty=0.66, Sf=0.95, h=0.26, hf=0.22)          # stride 1.667 m
S_RUN = dict(S=1.45, duty=0.36, Sf=1.1, h=0.42, hf=0.3)          # stride 4.03 m
S_GALLOP = {'BackL': 0.0, 'BackR': 0.2, 'FrontR': 0.5, 'FrontL': 0.7}  # rotary gallop, always one foot down

def s_legs(t, g, phases, tilt=0.12):
    for k in S_LEGS:
        front = k.startswith('Front'); S = g['Sf'] if front else g['S']
        quad_leg(k, (t + phases[k]) % 1, S, g['duty'] * S / g['S'], g['hf'] if front else g['h'], tilt=tilt)

def s_tail(fn):
    chain('Tail', 7, fn)

def s_walk(t):
    s_legs(t, S_WALK, LATERAL)
    loc('Body', (.04 * math.sin(TAU * t), 0, -.06 + .03 * math.cos(2 * TAU * (t - .08))))
    rot('Body', (X, .012 * math.cos(2 * TAU * t)), (Y, .03 * math.sin(TAU * t)), (Z, .03 * math.sin(TAU * t)))
    rot('Shoulders', (Y, -.025 * math.sin(TAU * t + .8)), (Z, -.02 * math.sin(TAU * t)))
    rot('Neck1', (X, .04 + .02 * math.cos(2 * TAU * t - .4)), (Z, -.02 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, .02 * math.cos(2 * TAU * t - .8)), (Z, -.02 * math.sin(TAU * t - .6)))
    rot('Head', (X, -.05 - .03 * math.cos(2 * TAU * t - 1.0)), (Z, -.03 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .02))
    s_tail(lambda i: ((X, .01 * math.cos(2 * TAU * t - .5 * i)), (Z, .045 * math.sin(TAU * t - .5 * i))))

def s_run(t):
    """Heavy charge: head low, rocking gallop, tail held up and stiff."""
    s_legs(t, S_RUN, S_GALLOP)
    loc('Body', (.03 * math.sin(TAU * t), 0, -.1 + .06 * math.cos(2 * TAU * (t - .12))))
    rot('Body', (X, .04 * math.sin(TAU * t + .4)), (Y, .03 * math.sin(TAU * t)), (Z, .02 * math.sin(TAU * t)))
    rot('Shoulders', (X, .05 - .03 * math.sin(TAU * t + .9)))
    rot('Neck1', (X, .0 + .03 * math.cos(2 * TAU * t - .4)))
    rot('Neck2', (X, -.02 + .03 * math.cos(2 * TAU * t - .8)))
    rot('Head', (X, -.1 - .06 * math.sin(TAU * t + .4) - .03 * math.cos(2 * TAU * t - 1.2)))
    rot('Jaw', (X, .08 + .04 * math.sin(2 * TAU * t)))
    s_tail(lambda i: ((X, (-.06 if i == 0 else .015) - .07 * math.sin(TAU * t + .4 - .45 * i) / 7), (Z, .03 * math.sin(TAU * t - .45 * i))))

S_LOOK = [(0, 0), (.08, 0), (.18, .55), (.36, .55), (.44, -.4), (.6, -.4), (.66, 0), (1, 0)]
def s_idle(t):
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, .018 * br)); rot('Body', (X, -.006 * br))
    look = track(t, S_LOOK)
    graze = track(t, [(0, 0), (.66, 0), (.74, 1), (.92, 1), (1, 0)])        # dip to the ground and chew
    sniff = .05 * max(0., math.sin(TAU * 6 * t)) * track(t, [(0, 0), (.36, 0), (.38, 1), (.42, 1), (.44, 0), (1, 0)])
    rot('Shoulders', (X, .05 * graze))
    rot('Neck1', (X, .02 * math.sin(TAU * t) + .22 * graze), (Z, look * .25))
    rot('Neck2', (X, .14 * graze + sniff), (Z, look * .3))
    rot('Head', (X, .03 * math.sin(2 * TAU * t + .5) + .1 * graze), (Z, look * .35), (Y, -.08 * look))
    chew = graze * max(0., math.sin(TAU * 7 * t))
    rot('Jaw', (X, .02 + .12 * chew))
    s_tail(lambda i: ((X, .01 * math.sin(TAU * t - .4 * i)), (Z, .045 * math.sin(TAU * t - .5 * i) + .025 * math.sin(2 * TAU * t - .7 * i))))

# Tail swing (1.2 s). Wind-up swings the club to one side and lifts it, the strike whips it across
# behind the body (peak speed ~0.45), overshoot, heavy settle. Hips lead, shoulders counter-rotate.
S_SWING = [(0, 0), (.08, -.1), (.3, 1.25), (.36, 1.3), (.45, -1.0), (.52, -1.85), (.6, -1.7), (.78, -.55), (.92, .06), (1, 0)]
def s_attack(t):
    hips = track(t, [(0, 0), (.3, .14), (.36, .15), (.48, -.2), (.58, -.22), (.85, -.03), (1, 0)])
    loc('Body', (track(t, [(0, 0), (.3, -.06), (.5, .08), (.85, 0)]), 0, track(t, [(0, 0), (.3, -.08), (.4, -.12), (.6, -.1), (1, 0)])))
    rot('Body', (Z, hips), (Y, -.6 * hips * .25))
    rot('Shoulders', (Z, -.6 * hips))
    look = track(t, [(0, 0), (.25, -.35), (.5, .3), (.7, .3), (1, 0)])
    rot('Neck1', (Z, look * .5), (X, -.04 * abs(look)))
    rot('Neck2', (Z, look * .6))
    rot('Head', (Z, look * .5), (X, -.06 * abs(look)))
    rot('Jaw', (X, track(t, [(0, .02), (.3, .12), (.5, .2), (.7, .05), (1, .02)])))
    lift = track(t, [(0, 0), (.3, .3), (.4, .18), (.5, -.02), (.7, 0), (1, 0)])
    w = (.6, .8, 1.0, 1.15, 1.25, 1.3, 1.3); tot = sum(w)
    s_tail(lambda i: ((X, lift * w[i] / tot), (Z, track(max(0., t - .018 * i), S_SWING) * w[i] / tot)))

def s_death(t):
    """Stagger, groan, then collapse onto the belly and roll a little onto the left flank."""
    sink = track(t, [(0, 0), (.18, -.04), (.55, 1), (.6, .94), (.66, 1), (1, 1)])
    roll = track(t, [(0, 0), (.4, 0), (.7, 1), (.76, .9), (.82, 1), (1, 1)])
    droop = track(t, [(0, 0), (.15, .7), (.3, .6), (.72, 1), (.78, .92), (.84, 1), (1, 1)])
    loc('Body', (0, 0, -.48 * sink)); rot('Body', (Y, .12 * roll), (X, .04 * sink))
    for k in S_LEGS:
        sx = 1 if k.endswith('L') else -1; front = k.startswith('Front')
        loc('IK_' + k, (sx * (.55 if sx < 0 else .35) * sink, (-.2 if front else .25) * sink, 0))
    rot('Neck1', (X, -.2 * droop), (Z, .1 * droop))
    rot('Neck2', (X, -.08 * droop), (Z, .08 * droop))
    rot('Head', (X, .08 * droop), (Y, .2 * droop))
    rot('Jaw', (X, track(t, [(0, 0), (.15, .3), (.45, .15), (1, .1)])))
    s_tail(lambda i: ((X, -.05 * sink if i < 3 else .02 * sink), (Z, .05 * sink * (i / 6))))

S_CLIPS = {'Idle': (s_idle, 150), 'Walk': (s_walk, 48), 'Run': (s_run, 24), 'Attack': (s_attack, 36), 'Death': (s_death, 60)}
