# Skull + lower jaw + trunk -> ONE fluid mesh, then legs unioned into the trunk with a smoothed fillet.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('PlodBody', 'PlodHead', 'PlodJaw', P_CORNER, P_MOUTH, lip_gap=0.015, region=0.04, seam_width=0.12, fillet_iters=45)
union_fillet('PlodBody', 'PlodLegs', width=0.22, iters=70, head_back_y=-2.15)
print('plod verts', len(bpy.data.objects['PlodBody'].data.vertices))
