"""Rebuild user-approved recorded effects. Requires numpy and soundfile.

python scripts/prepare-approved-audio.py [--preview-dir /path/to/preview-pack]
Downloads are cached in .cache/approved-audio, never shipped. Only CC0 sources
selected on 2026-10-08 are used; R2/R10/R11 and raw animal voices are excluded.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/audio'
CACHE = ROOT / '.cache/approved-audio'
CACHE.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--preview-dir', type=Path)
args = parser.parse_args()
sources = {x['id']: x for x in json.loads((ROOT/'scripts/approved-audio-sources.json').read_text())}
cuts = json.loads((ROOT/'scripts/approved-audio-cuts.json').read_text())['cuts']
registry = json.loads((OUT/'sources.json').read_text())
prepared=[]
decoded={}

def download(url):
    path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.source')
    if not path.exists():
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=90) as r:
            path.write_bytes(r.read())
    return path.read_bytes()

def read(key):
    if key in decoded:
        return decoded[key]
    source=sources[key]
    local=args.preview_dir/source['file'] if args.preview_dir else None
    if local and local.exists():
        data=local.read_bytes()
    else:
        url=source.get('preview_url') or source['download_url']
        if '#' in url:
            base,member=url.split('#',1)
            data=zipfile.ZipFile(io.BytesIO(download(base))).read(member)
        else:
            data=download(url)
    if hashlib.sha256(data).hexdigest()!=source['file_sha256']:
        raise ValueError(f'{key}: original differs from auditioned source')
    audio,rate=sf.read(io.BytesIO(data),always_2d=True,dtype='float32')
    decoded[key]=(audio.mean(axis=1),rate)
    registry['sources']['approved-'+key]={
        'author':source['author'],'license':'CC0-1.0','page':source['source'],
        'download':source.get('preview_url') or source['download_url'],
        'verified':source['verified_date'],'originalSha256':source['file_sha256'],
        'notes':source['notes'],
    }
    return decoded[key]

def write(name,key,segment,peak=.6):
    audio,rate=read(key)
    start,end=segment
    clip=audio[int(start*rate):min(len(audio),int(end*rate))].copy()
    if len(clip)<rate*.03 or not np.isfinite(clip).all():
        raise ValueError(f'{name}: invalid segment')
    clip-=clip.mean()
    maximum=np.max(np.abs(clip))
    if maximum<.0001:
        raise ValueError(f'{name}: silent segment')
    clip*=peak/maximum
    attack=min(int(rate*(.0005 if key.startswith('G') else .002)),len(clip)//2)
    tail=min(int(rate*.02),len(clip)//2)
    clip[:attack]*=np.linspace(0,1,attack)
    clip[-tail:]*=np.linspace(1,0,tail)
    path=OUT/'sfx'/(name+'.wav')
    sf.write(path,clip,rate,subtype='PCM_16')
    prepared.append({'file':'sfx/'+path.name,'source':'approved-'+key,
        'original':sources[key]['file'],'segment':[start,end],
        'edits':f'Mono, DC removed, peak balanced to {peak}, 0.5ms gun / 2ms other attack and 20ms tail fades; unchanged source pitch.',
        'duration':round(len(clip)/rate,4),'sampleRate':rate,'peakLimit':peak})

def series(prefix,key,bounds,count):
    assert len(bounds)>=count,(prefix,len(bounds),count)
    for i,segment in enumerate(bounds[:count],1):
        write(f'{prefix}-{i}',key,segment)

write('recorded-pistol-1','G1',cuts['G1'][0],.85)
write('recorded-rifle-1','G4',cuts['G4'][0],.85)
write('recorded-trex-step-1','W2',cuts['W2'][0],.65)
for surface,key,count in [('grass','F1',6),('gravel','F2',6),('rock','F3',6),
                          ('sand','F4',6),('mud','F5',4),('wood','F7',6),('leaves','F8',6)]:
    series('recorded-'+surface+'-walk',key,cuts[key],count)
for i,(key,segment) in enumerate([('F6',c) for c in cuts['F6-dirt'][:3]]+
                                [('F11',c) for c in cuts['F11'][:3]],1):
    write(f'recorded-dirt-walk-{i}',key,segment)
series('recorded-water-walk','F6',cuts['F6-water-small']+cuts['F6-water-large'][:1],6)
series('recorded-grass-alt','F10',cuts['F10'],6)
series('recorded-brush','F9',cuts['F9-brush'],3)
series('recorded-trex-roar','R1',cuts['R1'][2:5],3)
series('recorded-sarco-growl','R1',[cuts['R1'][0],cuts['R1'][1],cuts['R1'][6]],3)
for name,key,start in [('recorded-ptera-1','R3',0),('recorded-trill','R4',.39),
                     ('recorded-grunt-1','R5',.03),('recorded-grunt-2','R6',0),
                     ('recorded-roar-1','R7',.03),('recorded-roar-2','R8',0),('recorded-roar-3','R9',0)]:
    audio,rate=read(key)
    write(name,key,[start,len(audio)/rate],.7)
newfiles={a['file'] for a in prepared}
registry['assets']=[a for a in registry['assets'] if a['file'] not in newfiles]+prepared
(OUT/'sources.json').write_text(json.dumps(registry,indent=2)+'\n',encoding='utf-8')
print(f'Prepared {len(prepared)} individual CC0 effects from {len(decoded)} approved sources.')
