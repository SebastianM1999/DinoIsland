# Dino-Blender-Creator: rig + animation helpers. exec after lib.py, then call init('<RigName>').
# Clips are pose FUNCTIONS of phase t in [0,1]; IK controls plant the feet; sample() reads the
# constrained result back as plain FK keys for the deform bones (no NLA bake operator needed).
import bpy, math, mathutils
from mathutils import Vector as V, Quaternion as Q

TAU = math.pi * 2; X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
rig = pb = None
def init(name):
    global rig, pb
    rig = bpy.data.objects[name]; pb = rig.pose.bones

# ---------------------------------------------------------------- rig building
def new_rig(name):
    """Create an armature object in edit mode; returns (rig, edit_bones). Call finish_rig() after."""
    for o in bpy.data.objects:
        if o.name == name: bpy.data.objects.remove(o, do_unlink=True)
    arm = bpy.data.armatures.new(name); r = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(r)
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = r; r.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    return r, arm.edit_bones

def bone(eb, name, h, t, parent=None, connect=False, deform=True, flip=False):
    """Bones lie in the YZ plane with local X = world X, so world-X rotations are pitch for every
    bone. flip=True rolls 180 deg: use it for the JAW so the game's rotateX(-0.52) opens the mouth."""
    b = eb.new(name); b.head = h; b.tail = t
    d = (V(t) - V(h)).normalized(); z = V((1, 0, 0)).cross(d)
    if z.length > 1e-4: b.align_roll(-z if flip else z)
    if parent: b.parent = eb[parent]; b.use_connect = connect
    b.use_deform = deform
    return b

def theropod_leg_ik(eb, s, hip, knee, ankle, ball, toe, parent='Body'):
    """Biped digitigrade leg: BackUpLeg/BackLowLeg/BackFoot/BackToes + IK_Ball (root) ->
    IK_Ankle (child, pivots the heel around the ball) + IK_Toe + Pole in front of the knee."""
    bone(eb, 'BackUpLeg' + s, hip, knee, parent)
    bone(eb, 'BackLowLeg' + s, knee, ankle, 'BackUpLeg' + s, True)
    bone(eb, 'BackFoot' + s, ankle, ball, 'BackLowLeg' + s, True)
    bone(eb, 'BackToes' + s, ball, toe, 'BackFoot' + s, True)
    bone(eb, 'IK_Ball' + s, ball, (ball[0], ball[1], ball[2] + .1), 'root', deform=False)
    bone(eb, 'IK_Ankle' + s, ankle, (ankle[0], ankle[1], ankle[2] + .1), 'IK_Ball' + s, deform=False)
    bone(eb, 'IK_Toe' + s, ball, toe, 'root', deform=False)
    bone(eb, 'Pole' + s, (knee[0], knee[1] - .8, knee[2]), (knee[0], knee[1] - .8, knee[2] + .1), parent, deform=False)

def theropod_constraints(s):
    c = pb['BackLowLeg' + s].constraints.new('IK'); c.target = rig; c.subtarget = 'IK_Ankle' + s
    c.chain_count = 2; c.pole_target = rig; c.pole_subtarget = 'Pole' + s; c.pole_angle = -math.pi / 2
    c = pb['BackFoot' + s].constraints.new('DAMPED_TRACK'); c.target = rig; c.subtarget = 'IK_Ball' + s
    c = pb['BackToes' + s].constraints.new('COPY_ROTATION'); c.target = rig; c.subtarget = 'IK_Toe' + s

def quad_leg_ik(eb, key, hip, knee, ankle, foot_end, parent, pole_dir):
    """Pillar leg: <Front|Back>UpLeg/LowLeg/Foot<L|R>. The IK bone MUST point exactly like the foot
    bone (ankle -> foot_end), otherwise Copy Rotation tilts the pad into the ground."""
    pre, s = key[:-1], key[-1]
    bone(eb, pre + 'UpLeg' + s, hip, knee, parent)
    bone(eb, pre + 'LowLeg' + s, knee, ankle, pre + 'UpLeg' + s, True)
    bone(eb, pre + 'Foot' + s, ankle, foot_end, pre + 'LowLeg' + s, True)
    bone(eb, 'IK_' + key, ankle, foot_end, 'root', deform=False)
    bone(eb, 'Pole_' + key, (knee[0], knee[1] + pole_dir * 4, knee[2]), (knee[0], knee[1] + pole_dir * 4, knee[2] + .5), parent, deform=False)

def quad_constraints(key, pole_angle):
    """Hind knees: pole in front, pole_angle=-pi/2. Front elbows: pole behind, pole_angle=+pi/2.
    Verify: with no animation the joints must stay exactly where they were modelled."""
    pre, s = key[:-1], key[-1]
    c = pb[pre + 'LowLeg' + s].constraints.new('IK'); c.target = rig; c.subtarget = 'IK_' + key
    c.chain_count = 2; c.pole_target = rig; c.pole_subtarget = 'Pole_' + key; c.pole_angle = pole_angle
    c = pb[pre + 'Foot' + s].constraints.new('COPY_ROTATION'); c.target = rig; c.subtarget = 'IK_' + key

def finish_rig():
    for b in pb: b.rotation_mode = 'XYZ' if b.name.startswith(('IK_', 'Pole')) else 'QUATERNION'
    bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- posing
def ss(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)
def track(t, keys):
    """Smoothstep through (t, value) keys: holds, anticipation, overshoot+settle are just keys."""
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1: return v0 + (v1 - v0) * ss((t - t0) / (t1 - t0))
    return keys[-1][1]
def reset():
    for b in pb:
        b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0); b.rotation_euler = (0, 0, 0); b.scale = (1, 1, 1)
def loc(name, off):
    """Offset in armature (world-aligned) axes, for root-parented controls and the Body bone."""
    b = pb[name]; b.location = b.bone.matrix_local.to_3x3().inverted() @ V(off)
def rot(name, *axang):
    """Rotations about creature axes (applied in order). +X = nose/forward end DOWN (tail bones: tail UP),
    +Z = yaw left, Y = roll."""
    b = pb[name]; Mi = b.bone.matrix_local.to_3x3().inverted(); q = Q()
    for ax, ang in axang: q = Q(Mi @ V(ax), ang) @ q
    if b.rotation_mode == 'QUATERNION': b.rotation_quaternion = q
    else: b.rotation_euler = q.to_euler('XYZ')
def chain(prefix, n, fn):
    """Pose a bone chain (Neck1.., Tail1..): fn(i) -> tuple of (axis, angle). Use phase lag per index."""
    for i in range(n): rot('%s%d' % (prefix, i + 1), *fn(i))

def biped_leg(side, phi, S, duty, h, lift=0.55, y0=0.0, toe_droop=0.55):
    """Planted stance (foot slides back exactly S during the duty fraction) + eased swing.
    Ground speed of the stance foot = S / duty per cycle -> stride for glbCatalog = S / duty."""
    if phi < duty:
        u = phi / duty; dy = -S / 2 + S * u; dz = 0; heel = lift * ss((u - 0.55) / 0.45); toe = 0
    else:
        s = (phi - duty) / (1 - duty)
        dy = S / 2 - S * ss(s); dz = h * math.sin(math.pi * s) ** 1.2
        heel = lift * (1 - ss((s - 0.15) / 0.7)) + 0.25 * math.sin(math.pi * s)
        toe = toe_droop * math.sin(math.pi * min(1, s * 1.15))
    loc('IK_Ball' + side, (0, y0 + dy, dz)); rot('IK_Ball' + side, (X, heel)); rot('IK_Toe' + side, (X, toe))

def quad_leg(key, phi, S, duty, h, y0=0.0, tilt=0.12):
    if phi < duty:
        u = phi / duty; dy = -S / 2 + S * u; dz = 0; tl = tilt * ss((u - 0.75) / 0.25)
    else:
        s = (phi - duty) / (1 - duty); dy = S / 2 - S * ss(s); dz = h * math.sin(math.pi * s) ** 1.3
        tl = tilt * (1 - ss(s / 0.4)) + 1.5 * tilt * math.sin(math.pi * s)
    loc('IK_' + key, (0, y0 + dy, dz)); rot('IK_' + key, (X, -tl))

LATERAL = {'BackL': 0.0, 'FrontL': 0.25, 'BackR': 0.5, 'FrontR': 0.75}   # walking quadruped footfall order

def follow_body(keys, extra, bone_of=lambda k: 'IK_' + k, floor=True):
    """Move IK controls rigidly with the posed Body (rearing, toppling, lunging) plus offsets in body
    space; clamps them above the ground. Call after posing Body."""
    bpy.context.view_layer.update()
    M = pb['Body'].matrix @ pb['Body'].bone.matrix_local.inverted(); ax, ang = M.to_quaternion().to_axis_angle()
    for k in keys:
        b = pb[bone_of(k)]; rest = b.bone.matrix_local.translation
        off = M @ (rest + V(extra(k))) - rest
        if floor: off.z = max(off.z, 0.0)
        loc(b.name, off)
        Mi = b.bone.matrix_local.to_3x3().inverted(); b.rotation_euler = Q(Mi @ ax, ang).to_euler('XYZ')

# ---------------------------------------------------------------- baking + checks
def deform_bones(): return [b.name for b in rig.data.bones if b.use_deform]
def sample(fn, N):
    """Pose fn(f/N) for f = 0..N, return per-frame {bone: (loc, quat)} in LOCAL space with all
    constraints applied. Frame N == frame 0 for loops, so the exported clip has no seam."""
    frames = []; D = deform_bones()
    for f in range(N + 1):
        reset(); fn(f / N); bpy.context.view_layer.update()
        fr = {}
        for n in D:
            m = rig.convert_space(pose_bone=pb[n], matrix=pb[n].matrix, from_space='POSE', to_space='LOCAL')
            fr[n] = (tuple(m.to_translation()), tuple(m.to_quaternion()))
        frames.append(fr)
    reset(); return frames

def min_z():
    """Lowest skinned vertex of everything parented to the rig (feet should sit at ~0, never < -0.01)."""
    dg = bpy.context.evaluated_depsgraph_get(); zs = []
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == rig and o.visible_get():
            e = o.evaluated_get(dg); mw = o.matrix_world; zs.append(min((mw @ v.co).z for v in e.data.vertices))
    return min(zs)

def max_step(frames, bones=None):
    """Largest per-sample rotation (rad) per bone. Convert to the game's 1/60 s frame with:
    step * samples_per_cycle * max_cadence / 60  -> must stay < 0.4 (test 'knee snaps during run')."""
    bones = bones or list(frames[0]); out = {}
    for n in bones:
        out[n] = max(Q(frames[i][n][1]).rotation_difference(Q(frames[i + 1][n][1])).angle for i in range(len(frames) - 1))
    return out

def ground_report(clips, ts=(0, .25, .5, .75, 1.0)):
    """{clip: [min_z at each t]} — run after every animation change."""
    out = {}
    for name, (fn, N) in clips.items():
        row = []
        for t in ts:
            reset(); fn(t); bpy.context.view_layer.update(); row.append(round(min_z(), 3))
        out[name] = row
    reset(); return out
