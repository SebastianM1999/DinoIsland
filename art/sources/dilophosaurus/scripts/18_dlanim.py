# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls (theropod legs).
# A quick, agile hit-and-run hunter: springy walk, fast run with a flight phase, Attack = lunge, snap and hop
# back out of reach (1.0 s), Roar = crest display + hiss (2 s loop), Idle (5 s), Death (2 s, onto the belly;
# a side roll would bury the crests).
exec(bpy.data.texts['anim'].as_string(), globals())
init('DlRig')
# Neck frill: rest pose = OPEN. dl_frill(f) folds every rib back flat along the neck (f=0) or spreads it
# (f=1); a small per-rib rattle sells the display. Closed direction hugs the neck, slightly fanned.
DL_NECK_DIR = V((0, .78, -.63)).normalized()
def dl_frill(f, rattle=0.0, t=0.0):
    for s, sx in (('L', 1), ('R', -1)):
        for k in range(sum(1 for b in pb if b.name.startswith('Frill' + s))):
            b = pb['Frill%s%d' % (s, k)]; o = (b.bone.tail_local - b.bone.head_local).normalized()
            c = (DL_NECK_DIR + V((sx * .05, 0, .06 - .03 * k))).normalized()   # tucked against the neck side
            ax = o.cross(c); ang = math.atan2(ax.length, o.dot(c))
            fk = max(0.0, min(1.0, f + rattle * math.sin(TAU * 13 * t + 1.3 * k)))
            if ax.length > 1e-6: rot(b.name, (ax.normalized(), ang * (1 - fk)))

DL_WALK = dict(S=1.2, duty=0.6, h=0.22, lift=0.5, z=-0.04)
DL_RUN = dict(S=1.45, duty=0.36, h=0.36, lift=0.62, z=-0.12, y0=-0.03)

def dl_tail(fn):
    chain('Tail', 6, fn)

def dl_arms(fn):
    for s, sg in (('L', 1), ('R', -1)):
        up, low, hand = fn(s, sg)
        rot('ArmUp' + s, (X, up)); rot('ArmLow' + s, (X, low)); rot('Hand' + s, (X, hand))

def dl_walk(t):
    """Springy walk: body bobs and sways over the stance foot, the alert head stays level and bobs a little
    forward (bird-like), the long tail swings opposite to the hips with lag, arms held ready."""
    g = DL_WALK; m = t - g['duty'] / 2
    biped_leg('L', t % 1, g['S'], g['duty'], g['h'], lift=g['lift'], toe_droop=.3)
    biped_leg('R', (t + .5) % 1, g['S'], g['duty'], g['h'], lift=g['lift'], toe_droop=.3)
    bob = math.cos(2 * TAU * m)
    loc('Body', (.04 * math.cos(TAU * m), 0, g['z'] + .03 * bob))
    pitch = .02 * math.cos(2 * TAU * (m - .05))
    rot('Body', (X, .03 + pitch), (Y, .04 * math.cos(TAU * m)), (Z, .04 * math.sin(TAU * t)))
    rot('Torso', (Z, -.035 * math.sin(TAU * t)))
    rot('Neck1', (X, .03 - .5 * pitch + .03 * math.cos(2 * TAU * (m - .15))), (Z, -.03 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, -.02 * math.cos(2 * TAU * (m - .2))), (Z, -.02 * math.sin(TAU * t - .6)))
    rot('Neck3', (X, -.03 - .4 * pitch))
    rot('Head', (X, .01 + .02 * math.cos(2 * TAU * (m - .25))), (Z, -.035 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .03))
    dl_tail(lambda i: ((X, (.02 if i == 0 else 0) + .025 * math.cos(2 * TAU * m - .5 * i)), (Z, -.08 * math.sin(TAU * t - .55 * i - .3))))
    dl_arms(lambda s, sg: (-.2 + .06 * math.sin(TAU * t + (0 if sg > 0 else math.pi)), -.3, -.15))
    dl_frill(0)

def dl_run(t):
    """Fast run with a short flight phase: strong lean, neck stretched forward, head level, jaws ajar, the
    tail straight back as a counterweight, arms tucked with claws forward."""
    g = DL_RUN; m = t - g['duty'] / 2
    biped_leg('L', t % 1, g['S'], g['duty'], g['h'], lift=g['lift'], y0=g['y0'], toe_droop=.35)
    biped_leg('R', (t + .5) % 1, g['S'], g['duty'], g['h'], lift=g['lift'], y0=g['y0'], toe_droop=.35)
    bob = math.cos(2 * TAU * m)
    loc('Body', (.03 * math.cos(TAU * m), -.03, g['z'] - .06 * bob))
    pitch = .035 * math.cos(2 * TAU * (m - .05))
    rot('Body', (X, .14 + pitch), (Y, .035 * math.cos(TAU * m)), (Z, .03 * math.sin(TAU * t)))
    rot('Neck1', (X, .08 - .4 * pitch)); rot('Neck2', (X, -.04)); rot('Neck3', (X, -.1 - .3 * pitch))
    rot('Head', (X, -.06 + .03 * math.cos(2 * TAU * (m - .1))), (Z, -.02 * math.sin(TAU * t)))
    rot('Jaw', (X, .1 + .04 * math.sin(2 * TAU * t)))
    dl_tail(lambda i: ((X, (-.14 if i == 0 else .0) + .03 * math.cos(2 * TAU * m - .6 * i) / 2), (Z, -.05 * math.sin(TAU * t - .6 * i))))
    dl_arms(lambda s, sg: (-.5, -.6, -.3))
    dl_frill(0)

DL_LOOK = [(0, 0), (.08, .4), (.22, .4), (.28, -.35), (.46, -.35), (.52, .1), (.62, .1), (.68, 0), (1, 0)]
def dl_idle(t):
    """Alert and twitchy: quick head turns with holds (bird-like), a crest-flashing head bob, breathing,
    a jaw snap, tail S-wave, hands flexing slowly."""
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, -.03 + .012 * br)); rot('Body', (X, .03 + .01 * br))
    look = track(t, DL_LOOK); bobh = track(t, [(0, 0), (.74, 0), (.78, 1), (.82, -.3), (.86, .8), (.9, 0), (1, 0)])
    rot('Neck1', (X, -.02 * br + .06 * bobh), (Z, look * .3)); rot('Neck2', (Z, look * .25)); rot('Neck3', (X, -.08 * bobh), (Z, look * .2))
    rot('Head', (X, .02 * math.sin(TAU * t + 1)), (Z, look * .3), (Y, .1 * look))
    snap = track(t, [(0, 0), (.56, 0), (.59, .35), (.62, 0), (1, 0)])
    rot('Jaw', (X, .03 + .015 * br + snap))
    dl_tail(lambda i: ((X, .02 * math.sin(TAU * t - .4 * i)), (Z, .07 * math.sin(TAU * t - .5 * i) + .03 * math.sin(2 * TAU * t - i))))
    flex = .5 + .5 * math.sin(TAU * t)
    dl_arms(lambda s, sg: (-.15 + .04 * br, -.3 + .05 * math.sin(TAU * t + sg), -.1 - .2 * flex))
    dl_frill(.06 * bobh)   # a twitch of the folded frill with the crest bob

def dl_attack(t):
    """Hit and run (1.0 s, plays once): crouch and coil back with jaws opening (0-0.25 = dodge time), dart
    forward low, snap ~0.4 with a quick head jerk, then hop back out of reach (0.55-0.85) and settle alert."""
    by = track(t, [(0, 0), (.25, .2), (.4, -.55), (.52, -.5), (.72, .25), (.86, .18), (1, 0)])      # +y = back
    hop = .12 * math.sin(math.pi * ss((t - .55) / .25))
    loc('Body', (0, by, track(t, [(0, 0), (.25, -.08), (.4, -.12), (.52, -.08), (1, 0)]) + hop))
    for s, k in (('L', .35), ('R', .8)):                         # feet follow the dart and the hop back
        lift = .1 * math.sin(math.pi * ss((t - (.27 if s == 'R' else .56)) / .2))
        loc('IK_Ball' + s, (0, by * k, max(0., lift) + .7 * hop))
    rot('Body', (X, track(t, [(0, .03), (.25, -.08), (.4, .18), (.55, .1), (.75, -.05), (1, .03)])))
    rot('Neck1', (X, track(t, [(0, 0), (.25, -.2), (.4, .22), (.55, .05), (1, 0)])))
    rot('Neck2', (X, track(t, [(0, 0), (.25, -.08), (.4, .08), (1, 0)])))
    jerk = math.sin(TAU * 6 * t) * track(t, [(0, 0), (.4, 0), (.44, 1), (.54, 1), (.6, 0), (1, 0)])
    rot('Head', (X, track(t, [(0, 0), (.25, -.15), (.4, .06), (.6, 0), (1, 0)])), (Y, .12 * jerk), (Z, .06 * jerk))
    rot('Jaw', (X, track(t, [(0, .03), (.24, .45), (.36, .45), (.41, 0), (.7, .04), (1, .03)])))
    dl_arms(lambda s, sg: (track(t, [(0, -.2), (.25, -.55), (.4, .1), (.6, -.2), (1, -.2)]), -.35, -.2))
    dl_tail(lambda i: ((X, track(t, [(0, 0), (.25, -.04), (.4, .05), (.7, -.03), (1, 0)])), (Z, .05 * jerk)))
    dl_frill(track(t, [(0, 0), (.1, .15), (.2, 1), (.7, 1), (.95, .35), (1, .3)]), .05 * track(t, [(0, 0), (.2, 1), (.6, 1), (.8, 0)]), t)   # snaps open as it coils

def dl_roar(t):
    """Threat display: rear up, head high, crests flashed side to side, jaws wide with a hissing rattle;
    loops while the game keeps roaring."""
    a = track(t, [(0, 0), (.15, 1), (.85, 1), (1, 0)]); rattle = math.sin(TAU * 14 * t) * a
    loc('Body', (0, .06 * a, -.04 * a)); rot('Body', (X, -.12 * a))
    rot('Neck1', (X, -.12 * a)); rot('Neck2', (X, -.06 * a)); rot('Neck3', (X, .04 * a))
    sweep = math.sin(TAU * t) * a
    rot('Head', (X, .08 * a + .02 * rattle), (Z, .18 * sweep), (Y, .2 * sweep + .03 * rattle))     # turns the crests to show them
    rot('Jaw', (X, .03 + .45 * a + .03 * rattle))
    dl_tail(lambda i: ((X, (.08 if i == 0 else .03) * a), (Z, .04 * rattle)))
    dl_arms(lambda s, sg: (-.6 * a, -.5 * a, -.4 * a))
    dl_frill(1, .06 * a, t)   # full display, rattling (stays open across the loop; the crossfade opens it)

def dl_death(t):
    """Stagger with a cry, legs buckle, falls forward onto the belly and rolls a little onto the left flank,
    neck droops to the ground, arms splay."""
    sink = track(t, [(0, 0), (.2, -.03), (.6, 1), (.66, .93), (.72, 1), (1, 1)])
    roll = track(t, [(0, 0), (.45, 0), (.72, 1), (.78, .9), (.84, 1), (1, 1)])
    loc('Body', (0, track(t, [(0, 0), (.2, .15), (1, .05)]), -.8 * sink))
    rot('Body', (X, track(t, [(0, 0), (.2, -.14), (.6, .06), (1, .06)])), (Y, .18 * roll))
    droop = track(t, [(0, 0), (.15, -.5), (.35, -.3), (.7, 1), (.78, .9), (.84, 1), (1, 1)])
    rot('Neck1', (X, .3 * droop)); rot('Neck2', (X, .2 * droop)); rot('Neck3', (X, .05 * droop))
    rot('Head', (X, -.1 * droop), (Y, .3 * roll))
    rot('Jaw', (X, track(t, [(0, .03), (.15, .45), (.45, .3), (.8, .15), (1, .17)])))
    dl_tail(lambda i: ((X, (-.08 if i < 2 else .03) * sink), (Z, .05 * sink * i / 5)))
    for s, sg in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, track(t, [(0, 0), (.2, -.4), (.7, .3), (1, .28)])), (Y, -sg * 1.0 * sink))
        rot('ArmLow' + s, (X, -1.0 * sink)); rot('Hand' + s, (X, -.5 * sink))
    for s, sx in (('L', 1), ('R', -1)):
        loc('IK_Ball' + s, (sx * .32 * sink, .5 * sink, 0)); rot('IK_Toe' + s, (X, -.12 * sink))
    dl_frill(track(t, [(0, 0), (.1, .7), (.3, .5), (.6, .15), (1, .1)]))   # flares with the cry, folds limp

def dl_hurt(t):
    """Hit (0.9 s, plays once, held while the game reports hurt): flinch away with the head pulled back and a
    hiss, the frill snaps open by 0.12 with a rattle and STAYS open (the clip clamps on its last frame)."""
    jolt = track(t, [(0, 0), (.08, 1), (.3, .7), (.6, .4), (1, .35)])
    loc('Body', (0, .12 * jolt, -.05 * jolt)); rot('Body', (X, -.1 * jolt), (Y, .06 * math.sin(TAU * 5 * t) * (1 - t)))
    rot('Neck1', (X, -.16 * jolt)); rot('Neck2', (X, -.06 * jolt)); rot('Neck3', (X, .1 * jolt))
    rot('Head', (X, .05 * jolt), (Z, .1 * math.sin(TAU * 3 * t) * (1 - t)))
    rot('Jaw', (X, .03 + .35 * jolt))
    dl_tail(lambda i: ((X, .04 * jolt), (Z, .06 * math.sin(TAU * 4 * t - .5 * i) * (1 - t))))
    dl_arms(lambda s, sg: (-.5 * jolt, -.45 * jolt, -.3 * jolt))
    for s, k in (('L', .4), ('R', .7)): loc('IK_Ball' + s, (0, .12 * jolt * k, 0))
    dl_frill(track(t, [(0, 0), (.12, 1), (1, 1)]), .05 * track(t, [(0, 0), (.12, 1), (.7, .3), (1, 0)]), t)

DL_CLIPS = {'Idle': (dl_idle, 150), 'Walk': (dl_walk, 36), 'Run': (dl_run, 22), 'Attack': (dl_attack, 30),
            'Roar': (dl_roar, 60), 'Death': (dl_death, 60), 'Hurt': (dl_hurt, 27)}
