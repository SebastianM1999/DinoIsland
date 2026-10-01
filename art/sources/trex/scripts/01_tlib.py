
exec(bpy.data.texts['rlib'].as_string(), globals())
P.update(back=lin('#686c67'), back2=lin('#585c57'), flank=lin('#9b9e96'), flank2=lin('#abada4'),
         belly=lin('#f0e7cd'), stripe=lin('#42463f'), mask=lin('#363833'), leg=lin('#62655e'),
         red=lin('#3a3c3a'), gum=lin('#963838'), tongue=lin('#c2615b'), lip=lin('#dcd2b6'),
         eye=lin('#ffb21f'), eye2=lin('#d9620e'), claw=lin('#1f1d1b'), clawtip=lin('#857a6c'))
def rex_skin(p, n):
    """Grey T-Rex hide: dark back, grey flanks, cream underside, mottled blotches, fine speckle."""
    up = n.z + 0.15 * fbm(p, 3.0)
    c = mix(P['flank'], P['flank2'], 0.5 + 0.8 * fbm(p, 2.4))
    c = mix(c, mix(P['back'], P['back2'], 0.5 + fbm(p, 4.0)), smooth(-0.05, 0.6, up))
    c = mix(c, P['belly'], smooth(-0.25, -0.65, up))
    blot = fbm(p * V((1.0, 0.6, 1.0)), 6.0)
    c = mix(c, P['stripe'], smooth(0.12, 0.3, blot) * smooth(-0.45, 0.1, up) * 0.75)
    band = math.sin(p.y * 16.0 + 1.5 * fbm(p, 2.0))
    c = mix(c, P['stripe'], smooth(0.75, 0.95, band) * smooth(0.4, 0.8, p.y) * smooth(-0.3, 0.3, up) * 0.45)
    c = mix(c, P['flank2'], smooth(0.45, 0.55, fbm(p, 22.0)) * smooth(-0.2, 0.5, up) * 0.35)
    return shade(c, 1.0 + 0.07 * fbm(p, 9.0))
V = mathutils.Vector
def MAPP(x, y, z):
    """Raptor head space -> T-Rex head space: longer, wider, much taller."""
    return V((x * 1.32, -0.74 + (y + 0.54) * 0.88, 1.38 + (z - 1.345) * 1.3))
