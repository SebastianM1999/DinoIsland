# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls (theropod legs).
# The owner's brief: it charges with its head and headbutts with big knockback. So Run IS the charge (body level,
# neck straight, dome aimed forward like a battering ram), Attack = headbutt (wind-up, ram dome-first ~0.45,
# upward toss that launches the target ~0.55), Roar = challenge display (head lowered, scrapes the ground with a
# foot, snorts), Idle (5 s), Walk, Death (2 s, onto the belly).
exec(bpy.data.texts['anim'].as_string(), globals())
init('PcRig')
PC_WALK = dict(S=0.72, duty=0.6, h=0.13, lift=0.45, z=-0.03)
PC_RUN = dict(S=0.95, duty=0.38, h=0.22, lift=0.6, z=-0.08, y0=-0.02)

def pc_tail(fn):
    chain('Tail', 6, fn)

def pc_arms(fn):
    for s, sg in (('L', 1), ('R', -1)):
        up, low, hand = fn(s, sg)
        rot('ArmUp' + s, (X, up)); rot('ArmLow' + s, (X, low)); rot('Hand' + s, (X, hand))

def pc_ram(k):
    """Head-down ramming posture, k 0..1: neck lowered and straight, head pitched so the dome points forward."""
    rot('Neck1', (X, .28 * k)); rot('Neck2', (X, .12 * k)); rot('Head', (X, .45 * k))

def pc_walk(t):
    """Sturdy waddle: body bobs and rolls over the stance foot, the heavy head nods a little, tail swings opposite."""
    g = PC_WALK; m = t - g['duty'] / 2
    biped_leg('L', t % 1, g['S'], g['duty'], g['h'], lift=g['lift'], toe_droop=.18)
    biped_leg('R', (t + .5) % 1, g['S'], g['duty'], g['h'], lift=g['lift'], toe_droop=.18)
    loc('Body', (.035 * math.cos(TAU * m), 0, g['z'] + .022 * math.cos(2 * TAU * m)))
    rot('Body', (X, .03 + .015 * math.cos(2 * TAU * (m - .05))), (Y, .045 * math.cos(TAU * m)), (Z, .04 * math.sin(TAU * t)))
    rot('Torso', (Z, -.03 * math.sin(TAU * t)))
    rot('Neck1', (X, .02 * math.cos(2 * TAU * (m - .15))), (Z, -.03 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, -.02 * math.cos(2 * TAU * (m - .2))))
    rot('Head', (X, .03 * math.cos(2 * TAU * (m - .25))), (Z, -.03 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .02))
    pc_tail(lambda i: ((X, (.02 if i == 0 else 0) + .02 * math.cos(2 * TAU * m - .5 * i)), (Z, -.07 * math.sin(TAU * t - .55 * i - .3))))
    pc_arms(lambda s, sg: (-.15 + .05 * math.sin(TAU * t + (0 if sg > 0 else math.pi)), -.3, -.1))

def pc_run(t):
    """The charge: body level and low, neck straight, dome aimed forward like a ram and held steady against the
    bounce, tail straight back and raised as a counterweight, arms tucked."""
    g = PC_RUN; m = t - g['duty'] / 2
    biped_leg('L', t % 1, g['S'], g['duty'], g['h'], lift=g['lift'], y0=g['y0'], toe_droop=.4)
    biped_leg('R', (t + .5) % 1, g['S'], g['duty'], g['h'], lift=g['lift'], y0=g['y0'], toe_droop=.4)
    loc('Body', (.025 * math.cos(TAU * m), -.03, g['z'] - .045 * math.cos(2 * TAU * m)))
    pitch = .03 * math.cos(2 * TAU * (m - .05))
    rot('Body', (X, .12 + pitch), (Y, .035 * math.cos(TAU * m)), (Z, .025 * math.sin(TAU * t)))
    pc_ram(1.0)
    rot('Head', (X, .36 - .8 * pitch), (Z, -.02 * math.sin(TAU * t)))          # dome stays aimed while the body rocks
    rot('Jaw', (X, .04))
    pc_tail(lambda i: ((X, (-.1 if i == 0 else .0) + .03 * math.cos(2 * TAU * m - .6 * i) / 2), (Z, -.04 * math.sin(TAU * t - .6 * i))))
    pc_arms(lambda s, sg: (-.45, -.55, -.25))

PC_LOOK = [(0, 0), (.1, .35), (.26, .35), (.33, -.3), (.5, -.3), (.56, 0), (1, 0)]
def pc_idle(t):
    """Wary: looks around with holds, a short head-bob (testing the dome), dips to sniff the ground, tail sway."""
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, -.02 + .01 * br)); rot('Body', (X, .02 + .01 * br))
    look = track(t, PC_LOOK)
    dip = track(t, [(0, 0), (.62, 0), (.7, 1), (.84, 1), (.92, 0), (1, 0)])
    bob = track(t, [(0, 0), (.52, 0), (.545, 1), (.57, 0), (.595, 1), (.62, 0), (1, 0)])
    rot('Neck1', (X, -.015 * br + .3 * dip), (Z, look * .35)); rot('Neck2', (X, .15 * dip + .08 * bob), (Z, look * .3))
    rot('Head', (X, .02 * math.sin(TAU * t + 1) + .2 * dip + .15 * bob), (Z, look * .3), (Y, .06 * look))
    rot('Jaw', (X, .02 + .08 * dip * max(0., math.sin(TAU * 8 * t))))
    pc_tail(lambda i: ((X, .015 * math.sin(TAU * t - .4 * i)), (Z, .06 * math.sin(TAU * t - .5 * i) + .025 * math.sin(2 * TAU * t - i))))
    pc_arms(lambda s, sg: (-.12 + .03 * br, -.3 + .04 * math.sin(TAU * t + sg), -.1))

def pc_attack(t):
    """Headbutt (1.0 s, plays once): rock back and lower the dome (0-0.3 = dodge time), explode forward and ram
    dome-first (contact ~0.45, short jolt), then whip the head UP to toss the target (0.5-0.62), settle back.
    The right foot drives forward with the lunge, the left slides."""
    by = track(t, [(0, 0), (.28, .18), (.44, -.5), (.5, -.46), (.62, -.4), (.85, -.12), (1, 0)])   # +y = back
    loc('Body', (0, by, track(t, [(0, 0), (.28, -.06), (.44, -.1), (.55, -.04), (.62, .03), (1, 0)])))
    loc('IK_BallR', (0, by * .9, .1 * math.sin(math.pi * ss((t - .28) / .2)))); loc('IK_BallL', (0, by * .3, 0))
    rot('IK_BallL', (X, track(t, [(0, 0), (.44, .35), (.8, 0), (1, 0)])))
    rot('Body', (X, track(t, [(0, .02), (.28, -.04), (.44, .16), (.55, .1), (.62, -.06), (.85, .02), (1, .02)])))
    ram = track(t, [(0, 0), (.28, 1.1), (.44, 1.0), (.5, 1.0), (.62, -.55), (.75, -.3), (1, 0)])   # <0 = tossing up
    pc_ram(ram)
    jolt = math.exp(-((t - .46) / .025) ** 2)                                     # the impact
    rot('Head', (X, .45 * ram - .12 * jolt), (Y, .04 * jolt))
    rot('Jaw', (X, track(t, [(0, .02), (.44, .02), (.6, .18), (.8, .04), (1, .02)])))
    pc_tail(lambda i: ((X, track(t, [(0, 0), (.28, -.05), (.44, .06), (.62, -.03), (1, 0)])), (Z, .03 * jolt)))
    pc_arms(lambda s, sg: (-.35 * max(0, ram), -.4, -.2))

def pc_roar(t):
    """Challenge display (2 s loop): head lowered with the dome aimed, a right-foot ground scrape (twice, like a
    bull), snorts that jerk the head, tail lashing. Plays while the game holds pose.roar (pre-charge taunt)."""
    a = track(t, [(0, 0), (.12, 1), (.88, 1), (1, 0)])
    pc_ram(.8 * a)
    snort = math.exp(-((t - .3) / .03) ** 2) + math.exp(-((t - .72) / .03) ** 2)
    rot('Head', (X, .36 * a - .08 * snort), (Z, .05 * math.sin(TAU * 2 * t) * a))
    rot('Jaw', (X, .02 + .1 * snort))
    for k, t0 in enumerate((.2, .55)):                                           # scrape: foot drags back along the ground
        u = ss((t - t0) / .22)
        if 0 < u < 1:
            loc('IK_BallR', (0, .25 * math.sin(math.pi * u) * (2 * u - 1) * -1 + .1, .04 * math.sin(math.pi * u * 2) ** 2))
    loc('Body', (0, .04 * a, -.04 * a)); rot('Body', (X, .06 * a))
    pc_tail(lambda i: ((X, .04 * a), (Z, .12 * math.sin(TAU * 2 * t - .6 * i) * a)))
    pc_arms(lambda s, sg: (-.3 * a, -.4 * a, -.2 * a))

def pc_death(t):
    """Stagger, legs buckle, falls forward onto the belly with a small roll; the heavy dome sinks to the ground."""
    sink = track(t, [(0, 0), (.2, -.03), (.6, 1), (.66, .93), (.72, 1), (1, 1)])
    roll = track(t, [(0, 0), (.45, 0), (.72, 1), (.78, .9), (.84, 1), (1, 1)])
    loc('Body', (0, track(t, [(0, 0), (.2, .1), (1, .03)]), -.5 * sink))
    rot('Body', (X, track(t, [(0, 0), (.2, -.12), (.6, .06), (1, .06)])), (Y, .2 * roll))
    droop = track(t, [(0, 0), (.15, -.4), (.35, -.25), (.7, 1), (.78, .9), (.84, 1), (1, 1)])
    rot('Neck1', (X, .22 * droop)); rot('Neck2', (X, .1 * droop)); rot('Head', (X, .05 * droop), (Y, .2 * roll))
    rot('Jaw', (X, track(t, [(0, .02), (.15, .3), (.45, .2), (.8, .1), (1, .12)])))
    pc_tail(lambda i: ((X, (-.06 if i < 2 else .03) * sink), (Z, .05 * sink * i / 5)))
    for s, sg in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, track(t, [(0, 0), (.2, -.4), (.7, .3), (1, .28)])), (Y, -sg * .9 * sink))
        rot('ArmLow' + s, (X, -.8 * sink)); rot('Hand' + s, (X, -.4 * sink))
    for s, sx in (('L', 1), ('R', -1)):
        loc('IK_Ball' + s, (sx * .26 * sink, .4 * sink, 0)); rot('IK_Toe' + s, (X, -.12 * sink))

PC_CLIPS = {'Idle': (pc_idle, 150), 'Walk': (pc_walk, 36), 'Run': (pc_run, 22), 'Attack': (pc_attack, 30),
            'Roar': (pc_roar, 60), 'Death': (pc_death, 60)}
