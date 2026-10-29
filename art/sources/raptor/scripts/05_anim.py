# Raptor step 5: clips as pose functions of phase t in [0, 1] (IK feet, sampled to FK on export).
# Directions in rot(): +X = forward end down (tail bones: tail up), +Z = yaw left, Y = roll.
import bpy, math
init('RaptorRig')
S_ = math.sin; C_ = math.cos

def R_tail(t, amp=0.06, lift=0.0, lag=0.55, cyc=1, pitch=0.015):
    chain('Tail', 5, lambda i: ((Z, amp * (0.6 + 0.15 * i) * S_(cyc * TAU * t - lag * (i + 1))),
                                (X, -lift / 5 + pitch * C_(2 * cyc * TAU * t - 0.5 * i))))

def R_arms(a_up=0.0, a_low=0.0, wob=0.0, t=0.0):
    for s, k in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, a_up + wob * S_(TAU * t + (0 if k > 0 else 1.2))))
        rot('ArmLow' + s, (X, a_low)); rot('Hand' + s, (X, 0.1))

def R_idle(t):
    br = S_(2 * TAU * t)
    loc('Body', (0, 0, 0.006 * br)); rot('Body', (X, 0.02)); rot('Torso', (X, -0.012 * br))
    look = track(t, [(0, 0), (0.1, 0), (0.2, 0.38), (0.4, 0.38), (0.47, -0.05), (0.56, -0.05), (0.63, -0.32), (0.8, -0.32), (0.9, 0), (1, 0)])
    sniff = 0.07 * (math.exp(-((t - 0.5) / 0.018) ** 2) + math.exp(-((t - 0.54) / 0.018) ** 2))
    tilt = track(t, [(0, 0), (0.2, 0), (0.28, 0.12), (0.38, 0.12), (0.46, 0), (1, 0)])
    rot('Neck1', (X, -0.03 + 0.01 * br), (Z, 0.25 * look)); rot('Neck2', (X, 0.02), (Z, 0.25 * look))
    rot('Head', (X, 0.02 + sniff), (Z, 0.42 * look), (Y, tilt))
    jaw = 0.2 * math.exp(-((t - 0.86) / 0.025) ** 2) + 0.02
    rot('Jaw', (X, jaw))
    R_tail(t, amp=0.05, lag=0.5, pitch=0.01); R_arms(0.0, 0.05, 0.03, t)

R_WALK = dict(S=0.95, duty=0.55, h=0.11, y0=-0.02)
def R_walk(t):
    w = R_WALK
    biped_leg('L', t % 1, w['S'], w['duty'], w['h'], lift=0.45, y0=w['y0'], toe_droop=0.35); biped_leg('R', (t + 0.5) % 1, w['S'], w['duty'], w['h'], lift=0.45, y0=w['y0'], toe_droop=0.35)
    bob = -C_(2 * TAU * (t - 0.08))
    loc('Body', (0.016 * S_(TAU * t), 0, -0.02 + 0.014 * bob))
    rot('Body', (X, 0.05), (Z, 0.045 * S_(TAU * t)), (Y, 0.03 * S_(TAU * t)))
    rot('Torso', (Z, -0.035 * S_(TAU * t)), (X, 0.01 * bob))
    rot('Neck1', (X, -0.03 - 0.02 * bob), (Z, -0.01 * S_(TAU * t - 0.4)))
    rot('Neck2', (X, -0.01 * bob))
    rot('Head', (X, -0.03 + 0.025 * bob), (Z, -0.025 * S_(TAU * t - 0.6)))
    rot('Jaw', (X, 0.02))
    R_tail(t, amp=0.08, lag=0.6, pitch=0.02); R_arms(-0.05, 0.1, 0.05, t)

R_RUN = dict(S=0.95, duty=0.22, h=0.16, y0=-0.03)
def R_run_(t):
    """Bounding run. Every body curve is a smooth cosine of ONE phase m (0 = left mid-stance, 0.5 = right
    mid-stance), so bob, pitch, neck and head move as one wave; mixed offsets and kinks read as twitchy.
    Low + nose-down at mid-stance (compression), high in the flight; hips sway/roll toward the stance leg,
    chest counter-yaws, neck lags, head stays level, tail swings opposite to the hips and whips vertically."""
    w = R_RUN; m = t - w['duty'] / 2
    for s, ph in (('L', t), ('R', t + 0.5)):
        biped_leg(s, ph % 1, w['S'], w['duty'], w['h'], lift=0.55, y0=w['y0'], toe_droop=0.5)
    c2 = C_(2 * TAU * m); c1 = C_(TAU * m); s1 = S_(TAU * t)
    loc('Body', (0.028 * c1, -0.03, -0.03 - 0.045 * c2))   # deeper crouch / higher feet folded the thigh into the belly
    rot('Body', (X, 0.15 + 0.06 * C_(2 * TAU * (m - 0.05))), (Y, 0.05 * c1), (Z, 0.055 * s1))
    rot('Torso', (Z, -0.045 * s1), (Y, -0.025 * c1))
    rot('Neck1', (X, 0.12 - 0.06 * C_(2 * TAU * (m - 0.09))), (Z, -0.025 * S_(TAU * t - 0.5))); rot('Neck2', (X, 0.05))
    rot('Head', (X, -0.27 + 0.05 * C_(2 * TAU * (m - 0.13))), (Z, -0.04 * S_(TAU * t - 0.8)))
    rot('Jaw', (X, 0.15 + 0.05 * S_(2 * TAU * t)))                                               # panting
    chain('Tail', 5, lambda i: ((Z, -0.075 * (0.6 + 0.2 * i) * S_(TAU * t - 0.6 * (i + 1))),
                                (X, (-0.12 if i == 0 else 0.02) + 0.05 * C_(2 * TAU * m - 0.6 * (i + 1)))))
    for s, k in (('L', 1), ('R', -1)):                                                           # arms tucked, small pump
        rot('ArmUp' + s, (X, 0.35 + 0.07 * k * s1)); rot('ArmLow' + s, (X, 0.45 + 0.04 * c2)); rot('Hand' + s, (X, 0.1))

def R_attack(t):
    k = lambda keys: track(t, keys)
    pitch = k([(0, 0), (0.28, -0.16), (0.42, 0.2), (0.52, 0.17), (0.75, 0.1), (1, 0)])
    fwd = k([(0, 0), (0.28, 0.05), (0.44, -0.25), (0.6, -0.22), (0.85, -0.04), (1, 0)])
    low = k([(0, 0), (0.28, 0.01), (0.44, -0.1), (0.62, -0.08), (1, 0)])
    loc('Body', (0, fwd, low)); rot('Body', (X, pitch))
    rot('Torso', (X, 0.5 * pitch))
    rot('Neck1', (X, k([(0, 0), (0.28, -0.22), (0.44, 0.22), (0.6, 0.18), (1, 0)])))
    rot('Neck2', (X, k([(0, 0), (0.28, -0.12), (0.44, 0.1), (1, 0)])))
    shake = 0.16 * S_(TAU * 4 * (t - 0.5)) * smooth(0.48, 0.52, t) * smooth(0.8, 0.6, t)
    rot('Head', (X, k([(0, 0), (0.28, -0.12), (0.44, -0.05), (0.6, -0.08), (1, 0)])), (Z, shake))
    rot('Jaw', (X, k([(0, 0.02), (0.25, 0.48), (0.44, 0.48), (0.5, 0.0), (0.62, 0.04), (1, 0.02)])))
    kick = k([(0, 0), (0.33, 0), (0.46, 1), (0.58, 0.85), (0.8, 0), (1, 0)])        # left foot: sickle-claw kick
    loc('IK_BallL', (0, -0.05 - 0.12 * kick + fwd * 0.4, 0.09 * kick)); rot('IK_BallL', (X, 0.45 * kick)); rot('IK_ToeL', (X, -0.4 * kick))
    loc('IK_BallR', (0, fwd * 0.5, 0)); rot('IK_BallR', (X, 0.25 * smooth(0.3, 0.45, t) * smooth(0.9, 0.7, t)))
    R_tail(t, amp=0.04, lift=k([(0, 0), (0.28, 0.06), (0.44, -0.12), (1, 0)]), lag=0.5)
    R_arms(k([(0, 0), (0.28, -0.12), (0.44, -0.3), (0.7, -0.15), (1, 0)]), k([(0, 0), (0.44, -0.15), (1, 0)]))

def R_death(t):
    k = lambda keys: track(t, keys)
    roll = k([(0, 0), (0.2, -0.08), (0.52, 1.56), (0.6, 1.42), (0.7, 1.5), (1, 1.5)])
    drop = k([(0, 0), (0.2, 0.03), (0.4, -0.18), (0.52, -0.6), (0.6, -0.55), (0.7, -0.58), (1, -0.58)])
    loc('Body', (k([(0, 0), (0.52, -0.08), (1, -0.08)]), k([(0, 0), (0.2, 0.06), (1, 0.12)]), drop))
    rot('Body', (X, k([(0, 0), (0.2, -0.2), (0.52, 0.05), (1, 0.05)])), (Y, -roll))
    rot('Neck1', (X, k([(0, 0), (0.2, -0.3), (0.55, 0.2), (0.65, 0.12), (1, 0.15)])), (Z, k([(0, 0), (0.55, 0.22), (1, 0.22)])))
    rot('Neck2', (X, k([(0, 0), (0.2, -0.2), (0.55, 0.1), (1, 0.08)])))
    rot('Head', (X, k([(0, 0), (0.2, -0.25), (0.55, 0.1), (1, 0.12)])), (Z, k([(0, 0), (0.55, 0.15), (1, 0.15)])))
    rot('Jaw', (X, k([(0, 0), (0.12, 0.45), (0.3, 0.4), (0.6, 0.2), (1, 0.18)])))
    chain('Tail', 5, lambda i: ((X, k([(0, 0), (0.2, 0.05), (0.55, -0.04), (1, -0.03)])), (Z, k([(0, 0), (0.55, 0.02), (1, 0.0)]))))
    R_arms(k([(0, 0), (0.2, -0.5), (0.6, 0.3), (1, 0.25)]), k([(0, 0), (0.6, 0.6), (1, 0.55)]))
    curl = k([(0, 0), (0.25, 0.1), (0.6, 1), (1, 1)])
    follow_body('LR', lambda s: (0, -0.12 * curl if s == 'R' else 0.14 * curl, (0.2 if s == 'R' else -0.04) * curl), bone_of=lambda s: 'IK_Ball' + s, floor=True)
    follow_body('LR', lambda s: (0, 0, 0), bone_of=lambda s: 'IK_Toe' + s, floor=False)
    b = pb['IK_BallR']; b.location += b.bone.matrix_local.to_3x3().inverted() @ V((0, 0, 0.035 * k([(0, 0), (0.3, 1), (1, 1)])))   # ground-side foot lies on its edge
    stag = k([(0, 0), (0.1, 0.15), (0.22, -0.1), (0.35, 0), (1, 0)])
    pb['IK_BallL'].location += pb['IK_BallL'].bone.matrix_local.to_3x3().inverted() @ V((0, stag, 0)) * (1 - smooth(0.3, 0.5, t))

R_CLIPS = {'Idle': (R_idle, 120), 'Walk': (R_walk, 32), 'Run': (R_run_, 40), 'Attack': (R_attack, 30), 'Death': (R_death, 60)}

def R_femur_range(fn, n=40):
    """Max forward/back femur swing (deg) vs rest: a chunky thigh folds into the belly past ~40 deg."""
    out = []
    for s in 'LR':
        b = pb['BackUpLeg' + s]; r = (b.bone.tail_local - b.bone.head_local).normalized(); a = []
        for i in range(n):
            reset(); fn(i / n); bpy.context.view_layer.update()
            d = (b.tail - b.head).normalized(); a.append(math.degrees(math.atan2(-d.y, -d.z) - math.atan2(-r.y, -r.z)))
        out.append((round(min(a)), round(max(a))))
    reset(); return out
def R_reach(fn, n=40):
    """Max hip->ankle distance as a fraction of thigh+shin over the clip (keep <= 0.95: the IK knee snaps near 1)."""
    out = []
    for s in 'LR':
        u, l = pb['BackUpLeg' + s], pb['BackLowLeg' + s]; L = u.bone.length + l.bone.length; m = 0
        for i in range(n):
            reset(); fn(i / n); bpy.context.view_layer.update(); m = max(m, (l.tail - u.head).length / L)
        out.append(round(m, 3))
    reset(); return out