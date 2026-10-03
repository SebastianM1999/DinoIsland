# Skull + lower jaw + trunk -> ONE fluid mesh (no head/neck seam), region groups for paint/skin.
# Then the legs are boolean-unioned in with a smoothed fillet so thighs/shoulders grow out of the body.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('TriBody', 'TriHead', 'TriJaw', TR_CORNER, TR_MOUTH, lip_gap=0.008, region=0.04,
          seam_width=0.12, fillet_iters=45)
union_fillet('TriBody', 'TriLegs', width=0.22, iters=70, head_back_y=-1.9)
