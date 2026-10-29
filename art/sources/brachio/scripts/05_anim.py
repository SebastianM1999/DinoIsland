# Brachio step 5: clips as pose functions of phase t in [0, 1]. Real metres. Constant crouch so the pillar legs keep slack.
# rot(): +X = forward end down (tail bones: tail up), +Z = yaw left, Y = roll.
import bpy, math
init('BrachioArm')
S_ = math.sin; C_ = math.cos
B_LEGS = ['FrontL', 'FrontR', 'BackL', 'BackR']

def B_neck(t, pitch=0.0, yaw=0.0, wave=0.0, lag=0.45, cyc=1):
    """Spread neck pose over six bones; wave = small travelling sway (overlapping action)."""
    chain('Neck', 6, lambda i: ((X, pitch / 6 + wave * 0.5 * C_(cyc * TAU * t - lag * i)), (Z, yaw / 6 + wave * S_(cyc * TAU * t - lag * i))))

def B_tail(t, amp=0.04, lift=0.0, lag=0.5, cyc=1):
    chain('Tail', 8, lambda i: ((Z, amp * (0.5 + 0.12 * i) * S_(cyc * TAU * t - lag * (i + 1))), (X, lift / 8)))

def B_idle(t):
    br = S_(2 * TAU * t)
    loc('Body', (0, 0, -0.1 + 0.03 * br)); rot('Shoulders', (X, -0.006 * br))
    look = track(t, [(0, 0), (0.1, 0), (0.24, 0.35), (0.46, 0.35), (0.56, 0), (0.64, 0), (0.74, -0.3), (0.9, -0.3), (1, 0)])
    nod = track(t, [(0, 0), (0.46, 0), (0.5, 0.1), (0.54, 0), (1, 0)])
    B_neck(t, pitch=0.04 * br + nod, yaw=look, wave=0.008)
    rot('Head', (X, 0.05 - nod), (Z, 0.15 * look))
    chew = 0.06 * max(0, S_(TAU * 6 * t)) * smooth(0.12, 0.16, t) * smooth(0.3, 0.26, t)
    rot('Jaw', (X, 0.02 + chew))
    B_tail(t, amp=0.035, lag=0.5)

B_WALK = dict(S=1.9, duty=0.7, h=0.42, y0=0.0)
def B_walk(t):
    w = B_WALK
    for k in B_LEGS: quad_leg(k, (t + LATERAL[k]) % 1, w['S'], w['duty'], w['h'], y0=w['y0'])
    bob = C_(2 * TAU * (t - 0.12))
    loc('Body', (0.06 * S_(TAU * t), 0, -0.3 + 0.04 * bob))
    rot('Body', (Z, 0.025 * S_(TAU * t)), (Y, 0.02 * S_(TAU * t)))
    rot('Shoulders', (Z, -0.03 * S_(TAU * t + 0.8)), (Y, -0.015 * S_(TAU * t + 0.8)))
    B_neck(t, pitch=0.02 * bob, yaw=0.0, wave=0.012, lag=0.5)
    rot('Head', (X, -0.03 * bob)); rot('Jaw', (X, 0.02))
    B_tail(t, amp=0.06, lag=0.6)

B_RUN = dict(S=2.4, duty=0.45, h=0.65, y0=0.0)
def B_run_(t):
    w = B_RUN
    for k in B_LEGS: quad_leg(k, (t + LATERAL[k]) % 1, w['S'], w['duty'], w['h'], y0=w['y0'])
    bob = C_(2 * TAU * (t - 0.1))
    loc('Body', (0.05 * S_(TAU * t), 0, -0.42 + 0.07 * bob))
    rot('Body', (Z, 0.03 * S_(TAU * t)), (X, 0.015 * bob))
    rot('Shoulders', (Z, -0.035 * S_(TAU * t + 0.8)))
    B_neck(t, pitch=0.18 + 0.03 * bob, wave=0.015, lag=0.5)
    rot('Head', (X, -0.14 - 0.03 * bob)); rot('Jaw', (X, 0.06))
    B_tail(t, amp=0.04, lift=0.12, lag=0.5)

def B_attack(t):
    """Stomp (plays once): rear onto the hind legs over the 0.8 s server windup (t 0-0.5 of 1.6 s), slam 0.56-0.64."""
    k = lambda keys: track(t, keys)
    rear = k([(0, 0), (0.08, 0.04), (0.5, 1), (0.56, 0.9), (0.62, -0.06), (0.7, 0.02), (0.85, 0), (1, 0)])
    loc('Body', (0, k([(0, 0), (0.5, 0.35), (0.62, -0.25), (1, 0)]), -0.3 - 0.12 * rear))
    rot('Body', (X, -0.45 * rear))
    B_neck(t, pitch=0.35 * rear - 0.25 * max(0, -rear) * 4, yaw=0.0)
    rot('Head', (X, 0.25 * rear)); rot('Jaw', (X, 0.03 + 0.3 * k([(0, 0), (0.4, 1), (0.6, 0.6), (0.8, 0), (1, 0)])))
    B_tail(t, amp=0.02, lift=0.55 * rear)
    fold = max(0.0, rear)
    follow_body(['FrontL', 'FrontR'], lambda s: (0, -0.25 * fold, 0.35 * fold))
    step = k([(0, 0), (0.62, 0), (0.78, 1), (1, 1)])
    for s in 'LR':   # after the slam the front feet land forward and the hind feet take a step to settle
        if t > 0.62:
            loc('IK_Front' + s, (0, -0.55 * (1 - k([(0.62, 0), (0.95, 1), (1, 1)])), 0.18 * S_(math.pi * smooth(0.64, 0.9, t)) * (s == 'L')))
        loc('IK_Back' + s, (0, -0.0 * step, 0))

B_SIDE, B_NECKZ = 1, 1.0   # roll direction and the yaw sign that bends the rolled neck toward the ground

def B_death(t):
    """Topples onto its side: legs stay near-straight (folding 4.5 m legs under a lying body put the knees under the
    ground); the neck, now horizontal, curls down so the head rests on the ground."""
    k = lambda keys: track(t, keys)
    roll = k([(0, 0), (0.18, -0.06), (0.58, 1.42), (0.66, 1.3), (0.75, 1.36), (1, 1.36)])
    sink = k([(0, 0), (0.18, 0.05), (0.4, -0.25), (0.58, -2.78), (0.66, -2.64), (0.75, -2.72), (1, -2.72)])
    loc('Body', (k([(0, 0), (0.58, B_SIDE * 0.6), (1, B_SIDE * 0.6)]), 0, sink)); rot('Body', (Y, B_SIDE * roll))
    curl = k([(0, 0), (0.15, -0.1), (0.5, 0.3), (0.72, 1.0), (0.8, 0.94), (1, 0.96)])
    chain('Neck', 6, lambda i: ((Z, B_NECKZ * curl * (0.3, 0.26, 0.18, 0.12, 0.08, 0.06)[i]),))
    rot('Head', (Z, B_NECKZ * 0.25 * curl), (X, 0.1 * curl)); rot('Jaw', (X, k([(0, 0), (0.12, 0.3), (0.5, 0.2), (1, 0.12)])))
    chain('Tail', 8, lambda i: ((Z, B_NECKZ * -0.03 * smooth(0.4, 0.75, t)),))
    relax = k([(0, 0), (0.2, 0.1), (0.62, 1), (1, 1)])
    follow_body(B_LEGS, lambda key: (0, (-0.5 if key.startswith('Front') else 0.6) * relax, 0.5 * relax), floor=False)
    for key in ('FrontL', 'BackL'):   # the ground-side legs lie on the ground instead of in it
        b = pb['IK_' + key]; b.location += b.bone.matrix_local.to_3x3().inverted() @ V((0, 0, 0.95 * k([(0, 0), (0.22, 0), (0.5, 1), (1, 1)])))

B_CLIPS = {'Idle': (B_idle, 180), 'Walk': (B_walk, 48), 'Run': (B_run_, 36), 'Attack': (B_attack, 48), 'Death': (B_death, 72)}

def B_reach(fn, n=40):
    out = {}
    for key in B_LEGS:
        pre, s = key[:-1], key[-1]; u, l = pb[pre + 'UpLeg' + s], pb[pre + 'LowLeg' + s]; L = u.bone.length + l.bone.length; m = 0
        for i in range(n):
            reset(); fn(i / n); bpy.context.view_layer.update(); m = max(m, (l.tail - u.head).length / L)
        out[key] = round(m, 3)
    reset(); return out
