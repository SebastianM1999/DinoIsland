# Clips as pose functions of t in [0, 1]. Feet are planted by the IK controls.
# Walk (lateral sequence, slow and heavy), Run (a heavy trot, diagonal pairs), Attack = tail-club swing
# (wind-up to one side, whip across, 1.4 s), Idle (5 s, look-around, graze, club twitch), Death (2 s).
exec(bpy.data.texts['anim'].as_string(), globals())
init('AnkRig')
# hind and front legs need the same ground speed (S / duty equal); the short front legs sweep less.
AK_WALK = dict(S=0.8, duty=0.66, Sf=0.66, h=0.2, hf=0.17, z=-0.06, y0=0.0)
AK_RUN = dict(S=1.1, duty=0.46, Sf=0.9, h=0.3, hf=0.26, z=-0.12, y0=-0.08)
AK_TROT = {'BackL': 0.0, 'FrontR': 0.04, 'BackR': 0.5, 'FrontL': 0.54}   # diagonal pairs, front a touch later

def ak_legs(t, g, phases, tilt=0.12):
    for k in AK_LEGS:
        front = k.startswith('Front'); S = g['Sf'] if front else g['S']
        quad_leg(k, (t + phases[k]) % 1, S, g['duty'] * S / g['S'], g['hf'] if front else g['h'],
                 y0=0.0 if front else g['y0'], tilt=tilt)

def ak_tail(fn):
    chain('Tail', 6, fn)

def ak_walk(t):
    """Waddle: hips sway and roll toward the stance side, body drops after each footfall, the low head
    bobs a little, the stiff tail swings opposite to the hips with the club lagging."""
    ak_legs(t, AK_WALK, LATERAL)
    loc('Body', (.06 * math.sin(TAU * t), 0, AK_WALK['z'] + .025 * math.cos(2 * TAU * (t - .1))))
    rot('Body', (X, .01 * math.cos(2 * TAU * t)), (Y, .04 * math.sin(TAU * t)), (Z, .035 * math.sin(TAU * t)))
    rot('Shoulders', (Y, -.035 * math.sin(TAU * t + .8)), (Z, -.025 * math.sin(TAU * t)))
    rot('Neck1', (X, .02 * math.cos(2 * TAU * t - .4)), (Z, -.025 * math.sin(TAU * t - .3)))
    rot('Neck2', (X, .015 * math.cos(2 * TAU * t - .8)), (Z, -.02 * math.sin(TAU * t - .6)))
    rot('Head', (X, -.02 - .025 * math.cos(2 * TAU * t - 1.0)), (Z, -.03 * math.sin(TAU * t - .9)))
    rot('Jaw', (X, .02))
    ak_tail(lambda i: ((X, .01 * math.cos(2 * TAU * t - .5 * i)), (Z, -.05 * math.sin(TAU * t - .45 * i))))

def ak_run(t):
    """Heavy trot: two bounces per cycle (one per diagonal pair), little flight, the wide body rolls,
    head held low and steady, tail stiff and a bit raised, club swinging with lag."""
    ak_legs(t, AK_RUN, AK_TROT, tilt=0.16)
    def c(ph, k=2): return math.cos(k * TAU * (t - ph))
    loc('Body', (.035 * math.sin(TAU * t), 0, AK_RUN['z'] + .04 * c(.12)))
    rot('Body', (X, .02 + .015 * c(.2)), (Y, .045 * math.sin(TAU * t + .3)), (Z, .03 * math.sin(TAU * t)))
    rot('Shoulders', (X, .012 * c(.3)), (Y, -.035 * math.sin(TAU * t + .9)), (Z, -.02 * math.sin(TAU * t + .4)))
    rot('Neck1', (X, -.03 + .02 * c(.35)), (Z, -.02 * math.sin(TAU * t + .6)))
    rot('Neck2', (X, -.02 + .015 * c(.42)))
    rot('Head', (X, .05 - .5 * (.015 * c(.2) + .012 * c(.3) + .02 * c(.35))), (Z, -.025 * math.sin(TAU * t + 1.2)))
    rot('Jaw', (X, .06 + .03 * c(.25)))                                          # panting
    ak_tail(lambda i: ((X, (-.04 if i == 0 else .0) + .03 * c(.2 + .06 * i) / 3),
                       (Z, -.08 * math.sin(TAU * t - .5 * i) / (1 + .1 * i))))

AK_LOOK = [(0, 0), (.08, 0), (.18, .45), (.34, .45), (.42, -.35), (.56, -.35), (.62, 0), (1, 0)]
def ak_idle(t):
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, .018 * br)); rot('Body', (X, -.005 * br))
    look = track(t, AK_LOOK)
    graze = track(t, [(0, 0), (.64, 0), (.72, 1), (.9, 1), (1, 0)])             # dip to the ground and chew
    twitch = track(t, [(0, 0), (.36, 0), (.4, 1), (.46, -.6), (.52, .2), (.58, 0), (1, 0)])   # club twitch
    rot('Shoulders', (X, .04 * graze))
    rot('Neck1', (X, .02 * math.sin(TAU * t) + .18 * graze), (Z, look * .35))
    rot('Neck2', (X, .16 * graze), (Z, look * .3))
    rot('Head', (X, .03 * math.sin(2 * TAU * t + .5) + .12 * graze), (Z, look * .3), (Y, -.08 * look))
    chew = graze * max(0., math.sin(TAU * 7 * t))
    rot('Jaw', (X, .02 + .18 * chew))
    ak_tail(lambda i: ((X, .01 * math.sin(TAU * t - .4 * i)),
                       (Z, .045 * math.sin(TAU * t - .5 * i) + .02 * math.sin(2 * TAU * t - .7 * i) + .07 * twitch * (i / 5))))

# Tail-club swing (1.4 s, plays once): the hips pivot over the planted hind feet so the armoured back and
# the tail turn toward the target, the tail coils to the left (wind-up 0-0.36 = dodge time), then whips
# across to the right (club passes the centre at ~0.48, peak ~0.55), overshoots, bounces back and settles.
# The front feet step sideways with the pivot (follow the body + a lift).
AK_SWING = [(0, 0), (.32, 1), (.38, 1.05), (.5, -.8), (.58, -1.25), (.68, -.9), (.8, -.2), (1, 0)]
def ak_attack(t):
    sw = track(t, AK_SWING)
    yaw = track(t, [(0, 0), (.32, .2), (.4, .21), (.55, -.16), (.68, -.18), (.85, -.04), (1, 0)])
    loc('Body', (0, 0, track(t, [(0, 0), (.3, -.05), (.5, -.08), (.65, -.05), (1, 0)])))
    rot('Body', (Z, yaw), (Y, -.06 * sw))
    rot('Shoulders', (Z, .3 * yaw))
    step = lambda d: .1 * (math.sin(math.pi * ss((t - .08 - d) / .26)) + math.sin(math.pi * ss((t - .44 - d) / .24))
                           + math.sin(math.pi * ss((t - .76 - d) / .22)))
    follow_body(['FrontL', 'FrontR'], lambda k: (0, 0, 0))
    for k, d in (('FrontL', 0), ('FrontR', .04)):
        b = pb['IK_' + k]; off = b.bone.matrix_local.to_3x3() @ b.location
        loc('IK_' + k, (off.x, off.y, off.z + max(0., step(d))))
    rot('Neck1', (Z, -.25 * yaw - .05 * sw), (X, .04 * abs(sw)))
    rot('Neck2', (Z, -.2 * yaw - .05 * sw))
    rot('Head', (Z, -.15 * yaw), (X, .03 * abs(sw)))
    rot('Jaw', (X, track(t, [(0, .02), (.35, .06), (.55, .14), (.7, .04), (1, .02)])))
    # whip: each bone lags the one before it, the distal bones swing furthest
    ak_tail(lambda i: ((X, -.03 * abs(track(t - .02 * i, AK_SWING))),
                       (Z, (.13 + .045 * i) * track(t - .025 * i, AK_SWING))))

def ak_death(t):
    """Stagger with a groan, legs give way, the heavy body drops onto its belly and rolls slightly onto
    the right flank, head and tail sink to the ground."""
    sink = track(t, [(0, 0), (.18, -.03), (.55, 1), (.6, .93), (.66, 1), (1, 1)])
    roll = track(t, [(0, 0), (.4, 0), (.72, 1), (.78, .88), (.84, 1), (1, 1)])
    droop = track(t, [(0, 0), (.15, .5), (.3, .4), (.7, 1), (.76, .9), (.82, 1), (1, 1)])
    loc('Body', (0, 0, -.38 * sink)); rot('Body', (Y, -.08 * roll), (X, .02 * sink))
    for k in AK_LEGS:
        sx = 1 if k.endswith('L') else -1; front = k.startswith('Front')
        loc('IK_' + k, (sx * (.55 if sx < 0 else .45) * sink, (-.3 if front else .35) * sink, 0))
    rot('Neck1', (X, .18 * droop), (Z, -.08 * droop))
    rot('Neck2', (X, .12 * droop), (Z, -.06 * droop))
    rot('Head', (X, .1 * droop - .22 * track(t, [(0, 0), (.15, 1), (.35, 0)])), (Y, -.15 * droop))
    rot('Jaw', (X, track(t, [(0, 0), (.15, .28), (.45, .1), (1, .07)])))
    ak_tail(lambda i: ((X, (-.05 if i < 2 else .04) * sink), (Z, -.05 * sink * (i / 5))))

AK_CLIPS = {'Idle': (ak_idle, 150), 'Walk': (ak_walk, 48), 'Run': (ak_run, 24), 'Attack': (ak_attack, 42), 'Death': (ak_death, 60)}
