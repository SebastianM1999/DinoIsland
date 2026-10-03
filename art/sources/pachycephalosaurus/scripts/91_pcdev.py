# Dev helper (not part of the build): reload every scripts/NN_name.py into text block 'name' so the
# .blend always runs the reviewed files, then exec the steps listed in PCDEV_STEPS (set before exec).
import bpy, os, glob
_d = os.path.join(os.path.dirname(bpy.data.filepath), 'scripts')
for _f in sorted(glob.glob(os.path.join(_d, '*.py'))):
    _n = os.path.basename(_f)[3:-3]
    _t = bpy.data.texts.get(_n) or bpy.data.texts.new(_n)
    _t.from_string(open(_f, encoding='utf-8').read())
for _n in globals().get('PCDEV_STEPS', ()): exec(bpy.data.texts[_n].as_string(), globals())
