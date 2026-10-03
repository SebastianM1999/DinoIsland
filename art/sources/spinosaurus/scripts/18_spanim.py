# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls (theropod legs).
# A heavy, menacing predator: head held low and steady, claws ready, slow stalking walk, a lunging run,
# Attack = bite + claw slash (1.1 s), Roar (2 s loop), Idle (5 s), Death (2.2 s, collapses onto the belly:
# the tall sail rules out the T-Rex side roll).
exec(bpy.data.texts['anim'].as_string(), globals())
init('SpRig')
SP_WALK = dict(S=2.0, duty=0.62, h=0.38, lift=0.45, z=-0.08)
SP_RUN = dict(S=2.5, duty=0.42, h=0.62, lift=0.6, z=-0.26, y0=-0.05)

def sp_tail(fn):
    chain('Tail', 6, fn)

def sp_arms(fn):
    for s, sg in (('L', 1), ('R', -1)):
        up, low, hand = fn(s, sg)
        rot('ArmUp' + s, (X, up)); rot('ArmLow' + s, (X, low)); rot('Hand' + s, (X, hand))

def sp_walk(t):
    """Stalking walk: hips sway over the stance foot, body drops after each footfall, the low head stays
    steady (counter-rotates the body), tail swings opposite to the hips, claws held ready, slow small swing."""
    g = SP_WALK; m = t - g['duty'] / 2
    biped_leg('L', t % 1, g['S'], g['duty'], g['h'], lift=g['lift'], toe_droop=.18)
    biped_leg('R', (t + .5) % 1, g['S'], g['duty'], g['h'], lift=g['lift'], toe_droop=.18)   # long toes: small droop
    bob = math.cos(2 * TAU * m)
    loc('Body', (.07 * math.cos(TAU * m), 0, g['z'] + .05 * bob))
    pitch = .02 * math.cos(2 * TAU * (m - .05))
    rot('Body', (X, .04 + pitch), (Y, .045 * math.cos(TAU * m)), (Z, .035 * math.sin(TAU * t)))
    rot('Torso', (Z, -.03 * math.sin(TAU * t)), (Y, -.02 * math.cos(TAU * m)))
    rot('Neck1', (X, .04 - .5 * pitch), (Z, -.025 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, -.02), (Z, -.02 * math.sin(TAU * t - .6)))
    rot('Neck3', (X, -.04 - .4 * pitch))
    rot('Head', (X, .02 + .015 * math.cos(2 * TAU * (m - .12))), (Z, -.03 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .04 + .025 * max(0., math.sin(TAU * t * 2))))
    sp_tail(lambda i: ((X, (.02 if i == 0 else 0) + .02 * math.cos(2 * TAU * m - .5 * i)), (Z, -.07 * math.sin(TAU * t - .55 * i - .3))))
    sp_arms(lambda s, sg: (-.15 + .06 * math.sin(TAU * t + (0 if sg > 0 else math.pi)), -.25, -.15))

def sp_run(t):
    """Charge: strong forward lean, neck stretched forward, head pitched up to stay level, jaws ajar,
    tail raised and stiff, arms drawn up with the claws forward."""
    g = SP_RUN; m = t - g['duty'] / 2
    biped_leg('L', t % 1, g['S'], g['duty'], g['h'], lift=g['lift'], y0=g['y0'], toe_droop=.2)
    biped_leg('R', (t + .5) % 1, g['S'], g['duty'], g['h'], lift=g['lift'], y0=g['y0'], toe_droop=.2)
    bob = math.cos(2 * TAU * m)
    loc('Body', (.05 * math.cos(TAU * m), -.05, g['z'] - .09 * bob))
    pitch = .035 * math.cos(2 * TAU * (m - .05))
    rot('Body', (X, .13 + pitch), (Y, .04 * math.cos(TAU * m)), (Z, .03 * math.sin(TAU * t)))
    rot('Neck1', (X, .05 - .4 * pitch)); rot('Neck2', (X, -.05)); rot('Neck3', (X, -.08 - .3 * pitch))
    rot('Head', (X, -.08 + .03 * math.cos(2 * TAU * (m - .1))), (Z, -.025 * math.sin(TAU * t)))
    rot('Jaw', (X, .12 + .05 * math.sin(2 * TAU * t)))
    sp_tail(lambda i: ((X, (-.12 if i == 0 else .0) + .04 * math.cos(2 * TAU * m - .6 * i) / 2), (Z, -.045 * math.sin(TAU * t - .6 * i))))
    sp_arms(lambda s, sg: (-.45, -.55, -.35))

SP_LOOK = [(0, 0), (.12, .32), (.3, .32), (.38, -.3), (.58, -.3), (.66, 0), (1, 0)]
def sp_idle(t):
    """Menacing hold: slow breathing, looks around with holds, two quick sniffs, a jaw clack, the claws
    flex slowly, tail S-wave."""
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, -.06 + .025 * br)); rot('Body', (X, .05 + .012 * br))
    rot('Torso', (X, -.015 * br))
    look = track(t, SP_LOOK); sniff = track(t, [(0, 0), (.7, 0), (.73, 1), (.76, 0), (.79, 1), (.82, 0), (1, 0)])
    rot('Neck1', (X, -.02 * br), (Z, look * .3)); rot('Neck2', (Z, look * .25)); rot('Neck3', (Z, look * .15))
    rot('Head', (X, .02 + .03 * math.sin(TAU * t + 1) + .06 * sniff), (Z, look * .3), (Y, .05 * math.sin(TAU * t)))
    clack = track(t, [(0, 0), (.44, 0), (.48, .4), (.52, 0), (.55, .25), (.58, 0), (1, 0)])
    rot('Jaw', (X, .04 + .02 * br + clack))
    sp_tail(lambda i: ((X, .015 * math.sin(TAU * t - .4 * i)), (Z, .06 * math.sin(TAU * t - .5 * i) + .025 * math.sin(2 * TAU * t - i))))
    flex = .5 + .5 * math.sin(TAU * t)
    sp_arms(lambda s, sg: (-.12 + .04 * br, -.25 + .05 * math.sin(TAU * t + sg), -.1 - .2 * flex))

def sp_attack(t):
    """Bite + claw slash (1.1 s, plays once): rear back with jaws open and arms raised (0-0.3 = dodge
    time), lunge low and forward, snap shut ~0.45 while both arms slash down, short head shake, recover.
    The left foot stays planted, the right slides with the lunge."""
    by = track(t, [(0, 0), (.3, .35), (.47, -.75), (.66, -.5), (1, 0)])                   # +y = back
    loc('Body', (0, by, track(t, [(0, 0), (.3, .02), (.47, -.12), (.7, -.07), (1, 0)])))
    loc('IK_BallR', (0, by * .55, .14 * math.sin(math.pi * ss((t - .3) / .25)))); loc('IK_BallL', (0, by * .15, 0))
    rot('IK_BallL', (X, track(t, [(0, 0), (.47, .35), (.8, 0), (1, 0)])))
    rot('Body', (X, track(t, [(0, .04), (.3, -.12), (.47, .15), (.7, .08), (1, .04)])))
    rot('Neck1', (X, track(t, [(0, 0), (.3, -.18), (.47, .22), (.7, .08), (1, 0)])))
    rot('Neck2', (X, track(t, [(0, 0), (.3, -.08), (.47, .08), (1, 0)])))
    shake = math.sin(TAU * 4.5 * t) * track(t, [(0, 0), (.5, 0), (.56, 1), (.74, 1), (.82, 0), (1, 0)])
    rot('Head', (X, track(t, [(0, 0), (.3, -.18), (.47, .06), (.7, 0), (1, 0)])), (Y, .16 * shake), (Z, .08 * shake))
    rot('Jaw', (X, track(t, [(0, .04), (.28, .5), (.42, .5), (.47, 0), (.82, .03), (1, .04)])))
    slash = track(t, [(0, 0), (.3, -1), (.42, -1.05), (.5, -.05), (.62, -.12), (1, 0)])      # -1 raised -> slashed down to the hang
    sp_arms(lambda s, sg: (-.2 + .55 * slash, -.3 + .35 * min(0, slash), -.2 - .3 * max(0, -slash)))
    sp_tail(lambda i: ((X, track(t, [(0, 0), (.3, -.03), (.47, .05), (1, 0)])), (Z, .05 * shake)))

def sp_roar(t):
    """Head up and forward, jaws wide, arms spread with the claws out, rumbling shake; loops while the game roars."""
    a = track(t, [(0, 0), (.15, 1), (.85, 1), (1, 0)]); rumble = math.sin(TAU * 12 * t) * a
    loc('Body', (0, .1 * a, -.08 * a)); rot('Body', (X, -.1 * a))
    rot('Torso', (X, .02 * rumble))
    rot('Neck1', (X, -.1 * a)); rot('Neck2', (X, -.08 * a)); rot('Neck3', (X, -.06 * a))
    rot('Head', (X, .06 * a + .025 * rumble), (Z, .12 * math.sin(TAU * t) * a), (Y, .04 * rumble))
    rot('Jaw', (X, .04 + .46 * a + .03 * rumble))
    sp_tail(lambda i: ((X, (.06 if i == 0 else .02) * a), (Z, .03 * rumble)))
    sp_arms(lambda s, sg: (-.7 * a, -.5 * a, -.45 * a))

def sp_death(t):
    """Stagger back with a cry, the legs give way, collapse forward onto the belly and roll a little onto the
    left flank, neck droops so the head rests on the ground, arms fold under."""
    sink = track(t, [(0, 0), (.2, -.04), (.6, 1), (.66, .93), (.72, 1), (1, 1)])
    roll = track(t, [(0, 0), (.45, 0), (.72, 1), (.78, .9), (.84, 1), (1, 1)])
    loc('Body', (0, track(t, [(0, 0), (.2, .25), (1, .1)]), -1.0 * sink))
    rot('Body', (X, track(t, [(0, 0), (.2, -.12), (.6, .08), (1, .08)])), (Y, .22 * roll))
    droop = track(t, [(0, 0), (.15, -.5), (.35, -.3), (.7, 1), (.78, .9), (.84, 1), (1, 1)])
    rot('Neck1', (X, .16 * droop)); rot('Neck2', (X, .14 * droop)); rot('Neck3', (X, .1 * droop))
    rot('Head', (X, .08 * droop), (Y, .12 * roll))
    rot('Jaw', (X, track(t, [(0, .04), (.15, .5), (.45, .35), (.8, .18), (1, .2)])))
    sp_tail(lambda i: ((X, (-.06 if i < 2 else .04) * sink), (Z, .04 * sink * i / 5)))
    for s, sg in (('L', 1), ('R', -1)):                       # arms splay out sideways and lie on the ground
        rot('ArmUp' + s, (X, track(t, [(0, 0), (.2, -.4), (.7, .3), (1, .28)])), (Y, -sg * 1.0 * sink))
        rot('ArmLow' + s, (X, -1.1 * sink)); rot('Hand' + s, (X, -.6 * sink))
    for s, sx in (('L', 1), ('R', -1)):                       # feet slide out and fold flat under the body
        loc('IK_Ball' + s, (sx * .25 * sink, .5 * sink, 0)); rot('IK_Toe' + s, (X, -.12 * sink))   # toes stay flat, claws above the ground

SP_CLIPS = {'Idle': (sp_idle, 150), 'Walk': (sp_walk, 48), 'Run': (sp_run, 28), 'Attack': (sp_attack, 33),
            'Roar': (sp_roar, 60), 'Death': (sp_death, 66)}
