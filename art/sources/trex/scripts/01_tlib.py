
exec(bpy.data.texts['rlib'].as_string(), globals())
P.update(back=lin('#56552c'), back2=lin('#45452a'), flank=lin('#a67e3b'), flank2=lin('#bd9348'),
         belly=lin('#e8d6a0'), stripe=lin('#2e2214'), mask=lin('#2a2016'), leg=lin('#5a4a32'),
         red=lin('#4a3d22'), gum=lin('#963838'), tongue=lin('#c2615b'), lip=lin('#e6d2a0'),
         eye=lin('#ffb21f'), eye2=lin('#d9620e'), claw=lin('#1f1915'), clawtip=lin('#7d6c58'))
V = mathutils.Vector
def MAPP(x, y, z):
    """Raptor head space -> T-Rex head space: longer, wider, much taller."""
    return V((x * 1.32, -0.74 + (y + 0.54) * 0.88, 1.38 + (z - 1.345) * 1.3))
