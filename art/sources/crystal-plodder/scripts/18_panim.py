# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls.
# Game: walk ~1.2 m/s, defensive charge ~4.6 m/s (Run clip), tail-club swing = Attack clip.
exec(bpy.data.texts['anim'].as_string(), globals())
init('PlodRig')
# short legs: small sweeps, low lift. hind and front need the same ground speed (S / duty equal).
P_WALK = dict(S=0.78, duty=0.7, Sf=0.66, h=0.2, hf=0.17)               # stride 1.114 m
P_RUN = dict(S=1.0, duty=0.5, Sf=0.88, h=0.15, hf=0.13)                 # heavy trot, stride 2.0 m
P_TROT = {'BackL': 0.0, 'FrontR': 0.0, 'BackR': 0.5, 'FrontL': 0.5}

def p_legs(t, g, phases, tilt=0.12):
    for k in P_LEGS:
        front = k.startswith('Front'); S = g['Sf'] if front else g['S']
        quad_leg(k, (t + phases[k]) % 1, S, g['duty'] * S / g['S'], g['hf'] if front else g['h'], tilt=tilt)

def p_tail(fn): chain('Tail', 6, fn)

def p_walk(t):
    p_legs(t, P_WALK, LATERAL)
    loc('Body', (.03 * math.sin(TAU * t), 0, -.04 + .025 * math.cos(2 * TAU * (t - .08))))
    rot('Body', (X, .012 * math.cos(2 * TAU * t)), (Y, .035 * math.sin(TAU * t)), (Z, .04 * math.sin(TAU * t)))
    rot('Shoulders', (Y, -.03 * math.sin(TAU * t + .8)), (Z, -.035 * math.sin(TAU * t)))
    rot('Neck1', (X, .08 + .02 * math.cos(2 * TAU * t - .4)), (Z, -.03 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, .06 + .02 * math.cos(2 * TAU * t - .8)), (Z, -.03 * math.sin(TAU * t - .6)))
    rot('Head', (X, -.02 - .03 * math.cos(2 * TAU * t - 1.0)), (Z, -.03 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .02))
    p_tail(lambda i: ((X, .01 * math.cos(2 * TAU * t - .5 * i)), (Z, .05 * math.sin(TAU * t - .5 * i))))

def p_run(t):
    """Defensive charge: low, rocking trot, head down and tail club cocked up."""
    p_legs(t, P_RUN, P_TROT, tilt=0.05)
    loc('Body', (.02 * math.sin(TAU * t), 0, -.03 + .03 * math.cos(2 * TAU * (t - .1))))
    rot('Body', (X, .03 * math.sin(2 * TAU * t + .4)), (Y, .05 * math.sin(TAU * t)), (Z, .03 * math.sin(TAU * t)))
    rot('Shoulders', (X, .05 - .03 * math.sin(2 * TAU * t + .9)))
    rot('Neck1', (X, -.03 + .03 * math.cos(2 * TAU * t - .4)))
    rot('Neck2', (X, -.02 + .03 * math.cos(2 * TAU * t - .8)))
    rot('Head', (X, -.04 - .04 * math.sin(2 * TAU * t + .4)))
    rot('Jaw', (X, .06 + .03 * math.sin(2 * TAU * t)))
    p_tail(lambda i: ((X, (-.05 if i == 0 else .015) - .06 * math.sin(2 * TAU * t + .4 - .45 * i) / 6), (Z, .03 * math.sin(TAU * t - .45 * i))))

P_LOOK = [(0, 0), (.1, 0), (.2, .5), (.34, .5), (.44, -.4), (.58, -.4), (.66, 0), (1, 0)]
def p_idle(t):
    """Breathes, looks around, then drops the head to lick the cave floor (minerals)."""
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, .015 * br)); rot('Body', (X, -.005 * br))
    look = track(t, P_LOOK)
    lick = track(t, [(0, 0), (.64, 0), (.74, 1), (.94, 1), (1, 0)])
    rot('Shoulders', (X, .03 * lick))
    rot('Neck1', (X, .02 * math.sin(TAU * t) + .12 * lick), (Z, look * .22))
    rot('Neck2', (X, .1 * lick), (Z, look * .26))
    rot('Head', (X, .03 * math.sin(2 * TAU * t + .5) + .04 * lick), (Z, look * .3), (Y, -.06 * look))
    lap = lick * max(0., math.sin(TAU * 8 * t))
    rot('Jaw', (X, .02 + .16 * lap))
    p_tail(lambda i: ((X, .01 * math.sin(TAU * t - .4 * i)), (Z, .04 * math.sin(TAU * t - .5 * i) + .02 * math.sin(2 * TAU * t - .7 * i))))

# Tail-club swing (1.2 s): wind-up swings the club out and lifts it, the strike whips it across behind
# the body (peak speed ~0.45), overshoot, heavy settle. Hips lead, shoulders counter-rotate.
P_SWING = [(0, 0), (.08, -.1), (.3, 1.1), (.36, 1.15), (.45, -.85), (.52, -1.6), (.6, -1.45), (.78, -.5), (.92, .05), (1, 0)]
def p_attack(t):
    hips = track(t, [(0, 0), (.3, .13), (.36, .14), (.48, -.18), (.58, -.2), (.85, -.03), (1, 0)])
    loc('Body', (track(t, [(0, 0), (.3, -.05), (.5, .06), (.85, 0)]), 0, track(t, [(0, 0), (.3, -.07), (.4, -.1), (.6, -.08), (1, 0)])))
    rot('Body', (Z, hips), (Y, -.6 * hips * .25))
    rot('Shoulders', (Z, -.6 * hips))
    look = track(t, [(0, 0), (.25, -.3), (.5, .28), (.7, .28), (1, 0)])
    rot('Neck1', (Z, look * .5), (X, -.04 * abs(look)))
    rot('Neck2', (Z, look * .6))
    rot('Head', (Z, look * .5), (X, -.06 * abs(look)))
    rot('Jaw', (X, track(t, [(0, .02), (.3, .1), (.5, .16), (.7, .05), (1, .02)])))
    lift = track(t, [(0, 0), (.3, .26), (.4, .15), (.5, -.02), (.7, 0), (1, 0)])
    w = (.6, .85, 1.1, 1.3, 1.4, 1.4); tot = sum(w)
    p_tail(lambda i: ((X, lift * w[i] / tot), (Z, track(max(0., t - .018 * i), P_SWING) * w[i] / tot)))

def p_hurt(t):
    """Flinch (0.6 s): the armour hunkers down, head jerks away, tail clamps, then it recovers."""
    k = track(t, [(0, 0), (.14, 1), (.3, .8), (1, 0)])
    sh = math.sin(TAU * 3 * t) * (1 - t)
    loc('Body', (0, .06 * k, -.07 * k)); rot('Body', (X, -.04 * k), (Z, .05 * sh))
    rot('Shoulders', (X, .05 * k), (Z, -.06 * sh))
    rot('Neck1', (X, -.12 * k), (Z, .2 * k + .05 * sh))
    rot('Neck2', (X, -.08 * k), (Z, .2 * k))
    rot('Head', (X, -.1 * k), (Z, .15 * k), (Y, .1 * k))
    rot('Jaw', (X, .22 * k))
    p_tail(lambda i: ((X, -.04 * k), (Z, .08 * k * (1 if i % 2 else -1) + .03 * sh)))

def p_roar(t):
    """Bellow (1.8 s): draws breath, rears the head, then a long deep call with the jaw open."""
    inh = track(t, [(0, 0), (.25, 1), (.42, 1), (.5, 0), (1, 0)])
    call = track(t, [(0, 0), (.36, 0), (.46, 1), (.8, 1), (.95, 0), (1, 0)])
    loc('Body', (0, 0, .03 * inh - .02 * call)); rot('Body', (X, -.025 * inh))
    rot('Shoulders', (X, -.05 * inh - .02 * call))
    rot('Neck1', (X, -.14 * inh - .08 * call))
    rot('Neck2', (X, -.1 * inh - .1 * call))
    rot('Head', (X, -.1 * inh - .12 * call + .03 * math.sin(TAU * 5 * t) * call))
    rot('Jaw', (X, .04 + .5 * call + .03 * math.sin(TAU * 7 * t) * call))
    p_tail(lambda i: ((X, .05 * call), (Z, .06 * math.sin(TAU * t * 1.5 - .5 * i))))

def p_death(t):
    """Stagger, groan, then collapse onto the belly and roll a little onto the left flank."""
    sink = track(t, [(0, 0), (.18, -.03), (.55, 1), (.6, .94), (.66, 1), (1, 1)])
    roll = track(t, [(0, 0), (.4, 0), (.7, 1), (.76, .9), (.82, 1), (1, 1)])
    droop = track(t, [(0, 0), (.15, .7), (.3, .6), (.72, 1), (.78, .92), (.84, 1), (1, 1)])
    loc('Body', (0, 0, -.15 * sink)); rot('Body', (Y, .15 * roll), (X, .03 * sink))
    for k in P_LEGS:
        sx = 1 if k.endswith('L') else -1; front = k.startswith('Front')
        loc('IK_' + k, (sx * .05 * sink, (-.15 if front else .2) * sink, 0))
    rot('Neck1', (X, -.2 * droop), (Z, .1 * droop))
    rot('Neck2', (X, -.1 * droop), (Z, .08 * droop))
    rot('Head', (X, -.04 * droop), (Y, .2 * droop))
    rot('Jaw', (X, track(t, [(0, 0), (.15, .3), (.45, .15), (1, .1)])))
    p_tail(lambda i: ((X, -.04 * sink if i < 3 else .02 * sink), (Z, .05 * sink * (i / 5))))

P_CLIPS = {'Idle': (p_idle, 150), 'Walk': (p_walk, 48), 'Run': (p_run, 24), 'Attack': (p_attack, 36), 'Hurt': (p_hurt, 18),
           'Roar': (p_roar, 54), 'Death': (p_death, 60)}
