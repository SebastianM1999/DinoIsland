# Skull + lower jaw + trunk -> ONE fluid mesh (no head/neck seam), region groups for paint/skin.
# Then the legs are boolean-unioned in with a smoothed fillet so thighs/shoulders grow out of the body.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('AnkBody', 'AnkHead', 'AnkJaw', AK_CORNER, AK_MOUTH, lip_gap=0.016, region=0.035,
          seam_width=0.1, fillet_iters=40)
union_fillet('AnkBody', 'AnkLegs', width=0.2, iters=60, head_back_y=-2.0)
# the front toes reach forward under the neck (y < head_back_y): clear stray head/jaw regions below the jaw
_b = bpy.data.objects['AnkBody']
for _n in ('rg_head', 'rg_jaw'):
    if _n in _b.vertex_groups: _b.vertex_groups[_n].remove([v.index for v in _b.data.vertices if v.co.z < 0.8])
