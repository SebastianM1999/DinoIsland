# Dino-Blender-Creator: "living" eyes (exec after lib.py). Replaces the old ball + button pupil + cap lid.
#   - eyeball sits in an almond lid opening; the ball OUTSIDE the opening is painted as lid skin and uses
#     the skin material, so the lids read as skin wrapped round the eye, not a hat on top
#   - a rolled lid rim hugs the ball (thicker upper lid), tilted per species (calm droop / angry slant)
#   - painted iris: dark limbal ring, radial streaks, bright ring round the pupil, round or slit pupil,
#     a soft shadow under the upper lid (depth), off-white sclera in the corners
#   - two white catchlights (big + small, front-top) on the gloss material: the eye "looks back"
# Every eye is described by a dict E: c (left eye centre, x > 0), R, yaw (forward turn), W/Ht/Hb (opening
# half-width / upper / lower height as fractions of R), tilt (rad, + = outer corner down), rim (upper,
# lower tube radius as fractions of R), pupil (rx, ry as fractions of R; ry > rx = slit), iris (fraction of R).
import bpy, bmesh, math
from mathutils import Vector as V, Matrix

def eye_frame(E, sx):
    """Centre, outward axis d, h (toward the back of the head), v (up) for side sx (+1 left, -1 right)."""
    c = V((sx * E['c'][0], E['c'][1], E['c'][2]))
    d = V((sx * math.cos(E['yaw']), -math.sin(E['yaw']), 0))
    h = (sx * V((0, 0, 1)).cross(d)).normalized(); v = d.cross(h).normalized()
    if v.z < 0: v = -v
    return c, d, h, v

def eye_local(E, sx, p):
    """p -> (x, y, z) in the eye frame in units of R, opening tilt removed (x + = back, y + = up, z + = out)."""
    c, d, h, v = eye_frame(E, sx); q = p - c; R = E['R']
    x, y = q.dot(h) / R, q.dot(v) / R; t = -E['tilt']
    return x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t), q.dot(d) / R

def eye_open(E, x, y):
    """< 1 inside the almond opening (pointed corners: height shrinks toward the ends)."""
    H = E['Ht'] if y > 0 else E['Hb']
    k = 1 - 0.25 * min(1, (x / E['W']) ** 2)
    return math.hypot(x / E['W'], y / (H * k))

def build_eyes(prefix, E):
    """Creates <prefix>Eyes (ball), <prefix>Lids (rim), <prefix>Pupils (curved discs), <prefix>Glints (catchlights)."""
    for n in ('Eyes', 'Lids', 'Glints', 'Pupils'): remove(prefix + n)
    R = E['R']; bm = bmesh.new()
    for sx in (1, -1):
        c, d, h, v = eye_frame(E, sx)
        blob_bm(bm, c, (R, R, R), (0, 0, 0), 32, 22)
    mk(prefix + 'Eyes', bm)
    bm = bmesh.new(); N, M = 56, 8
    for sx in (1, -1):
        c, d, h, v = eye_frame(E, sx); rings = []
        tl = E['tilt']
        for i in range(N):
            a = 2 * math.pi * i / N
            y0 = math.sin(a); x0 = math.cos(a)
            H = E['Ht'] if y0 > 0 else E['Hb']; k = 1 - 0.25 * x0 * x0
            x, y = E['W'] * x0, H * k * y0
            x, y = x * math.cos(tl) - y * math.sin(tl), x * math.sin(tl) + y * math.cos(tl)
            x, y = x * R, y * R
            q = c + h * x + v * y + d * math.sqrt(max(R * R - x * x - y * y, 0.0))
            n = (q - c).normalized(); m = (h * x + v * y); m = (m - n * m.dot(n)).normalized()
            r = R * (E['rim'][0] * max(0, y0) ** 0.7 + E['rim'][1] * max(0, -y0) ** 0.7 + 0.05 * (1 - abs(y0)))
            ctr = q + n * r * 0.35 + m * r * 0.4
            rings.append([bm.verts.new(ctr + n * r * math.cos(2 * math.pi * j / M) + m * r * 1.3 * math.sin(2 * math.pi * j / M)) for j in range(M)])
        for r0, r1 in zip(rings, rings[1:] + rings[:1]):
            for j in range(M): bm.faces.new((r0[j], r0[(j + 1) % M], r1[(j + 1) % M], r1[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mk(prefix + 'Lids', bm)
    bm = bmesh.new()
    for sx in (1, -1):
        c, d, h, v = eye_frame(E, sx)
        for gx, gy, gr in ((-0.28, 0.3, 0.15), (0.2, -0.24, 0.07)):     # big glint front-top, small one opposite
            x, y = gx * R, gy * R
            n = (h * x + v * y + d * math.sqrt(R * R - x * x - y * y)).normalized()
            rot = n.to_track_quat('Z', 'Y').to_euler()
            blob_bm(bm, c + n * (R + 0.002), (gr * R, gr * R * 0.85, 0.012 * R + 0.002), rot, 14, 8)
    mk(prefix + 'Glints', bm)
    bm = bmesh.new()   # pupil: a curved disc lying ON the ball (crisp edge, independent of the ball's density)
    rx, ry = E['pupil']; S = 40
    for sx in (1, -1):
        c, d, h, v = eye_frame(E, sx)
        def on_ball(x, y):
            x, y = x * R, y * R
            return c + (h * x + v * y + d * math.sqrt(max(R * R - x * x - y * y, 0.0))).normalized() * R * 1.004
        rings = [[bm.verts.new(on_ball(rx * f * math.cos(2 * math.pi * j / S), ry * f * math.sin(2 * math.pi * j / S)))
                  for j in range(S)] for f in (0.35, 0.7, 1.0)]
        mid = bm.verts.new(on_ball(0, 0))
        for j in range(S): bm.faces.new((mid, rings[0][j], rings[0][(j + 1) % S]))
        for r0, r1 in zip(rings, rings[1:]):
            for j in range(S): bm.faces.new((r0[j], r1[j], r1[(j + 1) % S], r0[(j + 1) % S]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mk(prefix + 'Pupils', bm)

def paint_eyes(prefix, E, P, gloss, skin):
    """P: iris, iris2 (edge), glow (ring round the pupil), limbal, pupil, sclera, lid, lid2 (linear RGB)."""
    eyes = bpy.data.objects[prefix + 'Eyes']; me = eyes.data
    def ball(p, n):
        sx = 1 if p.x >= 0 else -1; x, y, z = eye_local(E, sx, p)
        o = eye_open(E, x, y)
        if o > 1.0 or z < 0:                                   # outside the opening: lid skin
            return mix(P['lid'], P['lid2'], smooth(1.0, 1.25, o) * 0.6)
        r = math.hypot(x, y); ph = math.atan2(y, x); ir = E['iris']
        rx, ry = E['pupil']; pr = math.hypot(x / rx, y / ry)
        c = mix(P['iris'], P['iris2'], smooth(0.35 * ir, ir, r))
        c = shade(c, 1 + 0.13 * math.sin(ph * 17 + 3 * fbm(p * 40, 1.0)) * smooth(0.3 * ir, 0.6 * ir, r))   # streaks
        c = mix(c, P['glow'], smooth(1.9, 1.15, pr) * 0.75)                # bright ring round the pupil
        c = mix(c, P['limbal'], smooth(0.84 * ir, 0.97 * ir, r))           # dark iris edge
        c = mix(c, P['sclera'], smooth(ir, 1.06 * ir, r))                  # off-white corners
        c = mix(c, P['pupil'], smooth(1.0, 0.9, pr))          # under the pupil disc
        c = shade(c, 1 - 0.45 * smooth(0.0, E['Ht'] * 0.95, y))            # upper lid shadow -> depth
        return shade(c, 1 - 0.35 * smooth(0.8, 1.0, o))                    # darken toward the rim
    paint(eyes, ball)
    me.materials.clear(); me.materials.append(gloss); me.materials.append(skin)
    for f in me.polygons:
        p = eyes.matrix_world @ f.center; sx = 1 if p.x >= 0 else -1; x, y, z = eye_local(E, sx, p)
        f.material_index = 1 if (eye_open(E, x, y) > 1.0 or z < 0) else 0
    lids = bpy.data.objects[prefix + 'Lids']
    paint(lids, lambda p, n: mix(P['lid'], P['lid2'], smooth(0.3, -0.5, n.z) * 0.5 + 0.2))
    lids.data.materials.clear(); lids.data.materials.append(skin)
    pu = bpy.data.objects[prefix + 'Pupils']
    paint(pu, lambda p, n: P['pupil'])
    pu.data.materials.clear(); pu.data.materials.append(gloss)
    gl = bpy.data.objects[prefix + 'Glints']
    paint(gl, lambda p, n: [1.0, 0.98, 0.93])
    gl.data.materials.clear(); gl.data.materials.append(gloss)
