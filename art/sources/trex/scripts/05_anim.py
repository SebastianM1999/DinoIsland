# T-Rex step 5: clips as pose functions of phase t in [0, 1]. Heavy: long contacts, small bounce, head steadier than the body.
# rot(): +X = forward end down (tail bones: tail up), +Z = yaw left, Y = roll.
import bpy, math
init('TRexArm')
S_ = math.sin; C_ = math.cos

def T_tail(t, amp=0.06, lift=0.0, lag=0.55, cyc=1, pitch=0.012):
    chain('Tail', 5, lambda i: ((Z, amp * (0.6 + 0.15 * i) * S_(cyc * TAU * t - lag * (i + 1))),
                                (X, -lift / 5 + pitch * C_(2 * cyc * TAU * t - 0.5 * i))))

def T_arms(a_up=0.0, a_low=0.0, wob=0.0, t=0.0):
    for s, k in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, a_up + wob * S_(TAU * t + (0 if k > 0 else 1.0))))
        rot('ArmLow' + s, (X, a_low)); rot('Hand' + s, (X, 0.08))

def T_idle(t):
    br = S_(2 * TAU * t)
    loc('Body', (0, 0, 0.012 * br)); rot('Body', (X, 0.02)); rot('Torso', (X, -0.015 * br))
    look = track(t, [(0, 0), (0.12, 0), (0.24, 0.32), (0.44, 0.32), (0.52, 0.0), (0.6, 0.0), (0.68, -0.28), (0.84, -0.28), (0.93, 0), (1, 0)])
    sniff = 0.06 * (math.exp(-((t - 0.55) / 0.02) ** 2) + math.exp(-((t - 0.59) / 0.02) ** 2))
    rot('Neck1', (X, -0.02 + 0.012 * br), (Z, 0.3 * look)); rot('Neck2', (Z, 0.25 * look))
    rot('Head', (X, 0.02 + sniff), (Z, 0.35 * look))
    rot('Jaw', (X, 0.03 + 0.22 * math.exp(-((t - 0.9) / 0.03) ** 2)))
    T_tail(t, amp=0.05, lag=0.5, pitch=0.008); T_arms(0.0, 0.05, 0.02, t)

T_WALK = dict(S=1.25, duty=0.6, h=0.13, y0=-0.04)
def T_walk(t):
    w = T_WALK
    for s, ph in (('L', t), ('R', t + 0.5)): biped_leg(s, ph % 1, w['S'], w['duty'], w['h'], lift=0.4, y0=w['y0'], toe_droop=0.3)
    bob = -C_(2 * TAU * (t - 0.1))
    loc('Body', (0.03 * S_(TAU * t), 0, -0.03 + 0.024 * bob))
    rot('Body', (X, 0.03), (Z, 0.04 * S_(TAU * t)), (Y, 0.035 * S_(TAU * t)))
    rot('Torso', (Z, -0.03 * S_(TAU * t)), (X, 0.01 * bob))
    rot('Neck1', (X, -0.02 - 0.02 * bob), (Z, -0.015 * S_(TAU * t - 0.4)))
    rot('Head', (X, -0.02 + 0.025 * bob), (Z, -0.03 * S_(TAU * t - 0.6)))
    rot('Jaw', (X, 0.03))
    T_tail(t, amp=0.08, lag=0.65, pitch=0.015); T_arms(0.0, 0.08, 0.04, t)

T_RUN = dict(S=1.35, duty=0.42, h=0.2, y0=-0.04)
def T_run_(t):
    w = T_RUN
    for s, ph in (('L', t), ('R', t + 0.5)): biped_leg(s, ph % 1, w['S'], w['duty'], w['h'], lift=0.45, y0=w['y0'], toe_droop=0.35)
    bob = -C_(2 * TAU * (t - 0.08))
    loc('Body', (0.02 * S_(TAU * t), 0, -0.05 + 0.035 * bob))
    rot('Body', (X, 0.1 + 0.02 * bob), (Z, 0.03 * S_(TAU * t)), (Y, 0.025 * S_(TAU * t)))
    rot('Torso', (Z, -0.025 * S_(TAU * t)))
    rot('Neck1', (X, 0.04 - 0.025 * bob)); rot('Neck2', (X, -0.02))
    rot('Head', (X, -0.11 + 0.03 * bob)); rot('Jaw', (X, 0.1))
    T_tail(t, amp=0.04, lift=-0.06, lag=0.5, pitch=0.02); T_arms(0.25, 0.3, 0.03, t)

def T_attack(t):
    k = lambda keys: track(t, keys)
    pitch = k([(0, 0), (0.28, -0.14), (0.44, 0.22), (0.55, 0.19), (0.78, 0.08), (1, 0)])
    fwd = k([(0, 0), (0.28, 0.08), (0.45, -0.38), (0.62, -0.34), (0.86, -0.05), (1, 0)])
    low = k([(0, 0), (0.28, 0.02), (0.45, -0.14), (0.62, -0.12), (1, 0)])
    loc('Body', (0, fwd, low)); rot('Body', (X, pitch)); rot('Torso', (X, 0.4 * pitch))
    rot('Neck1', (X, k([(0, 0), (0.28, -0.2), (0.45, 0.2), (0.62, 0.16), (1, 0)])))
    rot('Neck2', (X, k([(0, 0), (0.28, -0.1), (0.45, 0.08), (1, 0)])))
    shake = 0.12 * S_(TAU * 3.5 * (t - 0.5)) * smooth(0.48, 0.53, t) * smooth(0.82, 0.62, t)
    rot('Head', (X, k([(0, 0), (0.28, -0.14), (0.45, -0.04), (0.62, -0.07), (1, 0)])), (Z, shake))
    rot('Jaw', (X, k([(0, 0.03), (0.25, 0.48), (0.45, 0.48), (0.51, 0.0), (0.64, 0.05), (1, 0.03)])))
    loc('IK_BallR', (0, fwd * 0.55, 0)); loc('IK_BallL', (0, fwd * 0.2, 0))
    rot('IK_BallR', (X, 0.3 * smooth(0.3, 0.45, t) * smooth(0.92, 0.72, t)))
    T_tail(t, amp=0.04, lift=k([(0, 0), (0.28, 0.05), (0.45, -0.1), (1, 0)]), lag=0.5)
    T_arms(k([(0, 0), (0.45, -0.2), (1, 0)]), k([(0, 0), (0.45, -0.1), (1, 0)]))

def T_roar(t):
    k = lambda keys: track(t, keys)
    up = k([(0, 0), (0.16, 1), (0.82, 1), (1, 0)])
    rumble = 0.012 * S_(TAU * 24 * t) * smooth(0.16, 0.24, t) * smooth(0.82, 0.74, t)
    sweep = 0.14 * S_(TAU * (t - 0.16) / 0.66 * 0.5) * smooth(0.16, 0.3, t) * smooth(0.82, 0.68, t)
    loc('Body', (0, 0.06 * up, 0.02 * up)); rot('Body', (X, -0.12 * up))
    rot('Torso', (X, -0.05 * up))
    rot('Neck1', (X, -0.18 * up), (Z, 0.4 * sweep)); rot('Neck2', (X, -0.08 * up), (Z, 0.3 * sweep))
    rot('Head', (X, 0.12 * up + rumble), (Z, 0.3 * sweep))
    rot('Jaw', (X, 0.03 + 0.45 * up))
    T_tail(t, amp=0.03, lift=0.12 * up, lag=0.5, pitch=0.0); T_arms(-0.35 * up, -0.2 * up)
    rot('IK_BallR', (X, 0.0))

def T_death(t):
    k = lambda keys: track(t, keys)
    roll = k([(0, 0), (0.2, -0.06), (0.55, 1.52), (0.63, 1.4), (0.73, 1.47), (1, 1.47)])
    drop = k([(0, 0), (0.2, 0.04), (0.42, -0.2), (0.55, -0.72), (0.63, -0.66), (0.73, -0.7), (1, -0.7)])
    loc('Body', (k([(0, 0), (0.55, -0.12), (1, -0.12)]), k([(0, 0), (0.2, 0.08), (1, 0.15)]), drop))
    rot('Body', (X, k([(0, 0), (0.2, -0.18), (0.55, 0.04), (1, 0.04)])), (Y, -roll))
    rot('Neck1', (X, k([(0, 0), (0.2, -0.28), (0.58, 0.16), (0.68, 0.1), (1, 0.12)])), (Z, k([(0, 0), (0.58, 0.2), (1, 0.2)])))
    rot('Neck2', (X, k([(0, 0), (0.2, -0.18), (0.58, 0.08), (1, 0.06)])))
    rot('Head', (X, k([(0, 0), (0.2, -0.22), (0.58, 0.08), (1, 0.1)])), (Z, k([(0, 0), (0.58, 0.12), (1, 0.12)])))
    rot('Jaw', (X, k([(0, 0), (0.12, 0.45), (0.3, 0.4), (0.62, 0.22), (1, 0.2)])))
    chain('Tail', 5, lambda i: ((X, k([(0, 0), (0.2, 0.04), (0.58, -0.03), (1, -0.02)])),))
    T_arms(k([(0, 0), (0.2, -0.4), (0.6, 0.25), (1, 0.2)]), k([(0, 0), (0.6, 0.5), (1, 0.45)]))
    curl = k([(0, 0), (0.25, 0.1), (0.62, 1), (1, 1)])
    follow_body('LR', lambda s: (0, -0.18 * curl if s == 'R' else 0.12 * curl, (0.3 if s == 'R' else -0.05) * curl), bone_of=lambda s: 'IK_Ball' + s, floor=True)
    follow_body('LR', lambda s: (0, 0, 0), bone_of=lambda s: 'IK_Toe' + s, floor=False)
    b = pb['IK_BallR']; b.location += b.bone.matrix_local.to_3x3().inverted() @ V((0, 0, 0.065 * k([(0, 0), (0.3, 1), (1, 1)])))   # ground-side foot lies on its edge

T_CLIPS = {'Idle': (T_idle, 150), 'Walk': (T_walk, 40), 'Run': (T_run_, 30), 'Attack': (T_attack, 36), 'Death': (T_death, 72), 'Roar': (T_roar, 60)}

def T_femur_range(fn, n=40):
    out = []
    for s in 'LR':
        b = pb['BackUpLeg' + s]; r = (b.bone.tail_local - b.bone.head_local).normalized(); a = []
        for i in range(n):
            reset(); fn(i / n); bpy.context.view_layer.update()
            d = (b.tail - b.head).normalized(); a.append(math.degrees(math.atan2(-d.y, -d.z) - math.atan2(-r.y, -r.z)))
        out.append((round(min(a)), round(max(a))))
    reset(); return out

def T_reach(fn, n=40):
    out = []
    for s in 'LR':
        u, l = pb['BackUpLeg' + s], pb['BackLowLeg' + s]; L = u.bone.length + l.bone.length; m = 0
        for i in range(n):
            reset(); fn(i / n); bpy.context.view_layer.update(); m = max(m, (l.tail - u.head).length / L)
        out.append(round(m, 3))
    reset(); return out
