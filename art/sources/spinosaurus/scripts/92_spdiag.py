# Dev helper (not part of the build): checks on a built scene. Exec with SPDIAG = list of checks:
# 'ground' (min z per clip), 'steps' (knee steps per 1/60 s at the cadence caps), 'low' (lowest vertex per
# clip with its object), 'sheets' (8-frame side contact sheets of the clips in SPDIAG_CLIPS into SPDIAG_DIR).
import bpy, os
exec(bpy.data.texts['lib'].as_string(), globals())
exec(bpy.data.texts['anim'].as_string(), globals()); init('SpRig')
SP_TAIL = ['Tail%d' % i for i in range(1, 7)]
exec(bpy.data.texts['spanim'].as_string(), globals())
SP_CAD = {'Walk': 1.0, 'Run': 1.6}
_todo = globals().get('SPDIAG', ('ground', 'steps'))
if 'ground' in _todo:
    print('ground', ground_report(SP_CLIPS, ts=[i / 10 for i in range(11)]))
if 'steps' in _todo:
    _legs = [b for b in deform_bones() if 'Leg' in b or 'Foot' in b or 'Toes' in b]
    for _n, _cad in SP_CAD.items():
        _fn, _N = SP_CLIPS[_n]; _ms = max_step(sample(_fn, _N), _legs)
        print('steps', _n, round(max(_ms.values()) * _N * _cad / 60, 3), max(_ms, key=_ms.get))
if 'low' in _todo:
    def _low(fn, t):
        reset(); fn(t); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); out = []
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.parent == rig:
                e = o.evaluated_get(dg); v = min(e.data.vertices, key=lambda v: v.co.z)
                out.append((round(v.co.z, 3), o.name, tuple(round(x, 2) for x in v.co)))
        return sorted(out)[:2]
    for _n, (_fn, _N) in SP_CLIPS.items():
        print('low', _n, min((_low(_fn, i / 10)[0] + (i / 10,) for i in range(11)), key=lambda r: r[0]))
    reset()
if 'sheets' in _todo:
    exec(bpy.data.texts['views'].as_string(), globals())
    for _n, (_fn, _N) in SP_CLIPS.items():
        if _n in globals().get('SPDIAG_CLIPS', SP_CLIPS):
            s_clip_sheet(_fn, os.path.join(SPDIAG_DIR, 'sp_clip_%s.png' % _n), shot=globals().get('SPDIAG_SHOT', (90, 0, 14, (0, -0.3, 2.9))))
