"""Prepare the bundled audio. Requires numpy, soundfile, imageio-ffmpeg and 7z.

Original downloads/extractions live in .cache/audio-sources; runtime needs none
of these tools. See assets/audio/CREDITS.md for source licenses.
"""
from pathlib import Path
import json
import subprocess
import urllib.request
import numpy as np
import soundfile as sf
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/audio-sources'
OUT = ROOT / 'assets/audio'
OGA = 'https://opengameart.org/sites/default/files/'
SOURCES = {
    'feet': ('Fantozzi', 'CC0-1.0', 'https://opengameart.org/content/fantozzis-footsteps-grasssand-stone', OGA + 'Fantozzi-footsteps.7z'),
    'steps': ('TinyWorlds', 'CC0-1.0', 'https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud', OGA + '%5Bkdd%5DDifferentSteps_0.zip'),
    'firearms': ('Ben Jaszczak et al.', 'CC0-1.0', 'https://opengameart.org/content/the-free-firearm-sound-library', OGA + 'Prepared%20SFX%20Library.7z'),
    'foley': ('Jan Schupke (Vehicle)', 'CC0-1.0', 'https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx', OGA + 'tinysized.zip'),
    'swish': ('qubodup', 'CC0-1.0', 'https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes', OGA + 'swoshes.7z'),
    'impact': ('Kenney', 'CC0-1.0', 'https://kenney.nl/assets/impact-sounds', 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip'),
    'trex': ('CaveboyTup', 'CC0-1.0', 'https://opengameart.org/content/t-rex-calls', OGA + 't-rex_calls.mp3'),
    'snarl1': ('Darsycho', 'CC0-1.0', 'https://opengameart.org/content/monster-snarls', OGA + 'monster-snarls_0.ogg'),
    'snarl2': ('Darsycho', 'CC0-1.0', 'https://opengameart.org/content/monster-snarls', OGA + 'monster-snarls-2_0.ogg'),
    'snarl3': ('Darsycho', 'CC0-1.0', 'https://opengameart.org/content/monster-snarls', OGA + 'monsters-snarls-3_0.ogg'),
    'water1': ('Peludo', 'CC0-1.0', 'https://opengameart.org/content/water-splash-and-sand-footsteps', OGA + 'splash1_0.wav'),
    'water2': ('Peludo', 'CC0-1.0', 'https://opengameart.org/content/water-splash-and-sand-footsteps', OGA + 'splash2_0.wav'),
    'bow1': ('Ali_6868', 'CC0-1.0', 'https://freesound.org/people/Ali_6868/sounds/384915/', 'https://cdn.freesound.org/previews/384/384915_984733-hq.mp3'),
    'bow2': ('Ali_6868', 'CC0-1.0', 'https://freesound.org/people/Ali_6868/sounds/384916/', 'https://cdn.freesound.org/previews/384/384916_984733-hq.mp3'),
    'jungle': ('RandomMind', 'CC0-1.0', 'https://opengameart.org/content/medieval-exploration', OGA + 'Exploration_0.mp3'),
    'battle': ('cynicmusic', 'CC0-1.0', 'https://opengameart.org/content/battle-theme-a', OGA + 'battleThemeA.mp3'),
    'volcano': ('Scott Buckley', 'CC-BY-4.0', 'https://www.scottbuckley.com.au/library/the-spaces-between/', 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/07/sb_monomyth_6_thespacesbetween.mp3'),
    'encounter': ('Scott Buckley', 'CC-BY-4.0', 'https://www.scottbuckley.com.au/library/the-encounter/', 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/07/sb_monomyth_7_theencounter.mp3'),
}


def acquire():
    CACHE.mkdir(parents=True, exist_ok=True)
    for key, (_, _, _, url) in SOURCES.items():
        ext = Path(url).suffix
        dest = CACHE / (key + ext)
        if not dest.exists():
            # The artist's www host rejects some clients; the canonical host
            # serves the same files. No third-party mirrors are needed.
            urls = [url, url.replace('https://www.scottbuckley.com.au', 'https://scottbuckley.com.au')]
            for attempt, candidate in enumerate(urls):
                try:
                    req = urllib.request.Request(candidate, headers={'User-Agent': 'Mozilla/5.0', 'Accept': '*/*'})
                    with urllib.request.urlopen(req, timeout=90) as response:
                        data = response.read()
                    dest.write_bytes(data)
                    break
                except Exception:
                    if attempt == len(urls) - 1:
                        raise
        if ext in ('.zip', '.7z') and not (CACHE / key).exists():
            subprocess.run(['7z', 'x', str(dest), '-o' + str(CACHE / key), '-y'], check=True, stdout=subprocess.DEVNULL)


def read(relative):
    return sf.read(CACHE / relative, dtype='float32', always_2d=True)


def regions(audio, rate, gap=.25):
    """Find separated one-shots, merging syllables and reverb tails."""
    window = int(rate * .02)
    mono = np.max(np.abs(audio), axis=1)
    rms = np.array([np.sqrt(np.mean(mono[i:i+window]**2)) for i in range(0, len(mono), window)])
    active = np.flatnonzero(rms > max(.004, rms.max() * .07))
    if not len(active):
        return []
    cuts = np.flatnonzero(np.diff(active) * .02 > gap) + 1
    return [(max(0, int((part[0]*.02-.025)*rate)), min(len(audio), int((part[-1]*.02+.14)*rate)))
            for part in np.split(active, cuts) if len(part) > 1]


records = []


def write_effect(name, source, relative, start=None, end=None, peak=.65):
    audio, rate = read(relative)
    if start is not None:
        audio = audio[int(start*rate):int(end*rate)]
    audio = audio.mean(axis=1, keepdims=True)
    spans = regions(audio, rate, gap=10)
    if spans:
        audio = audio[spans[0][0]:spans[-1][1]]
    if not len(audio) or np.max(np.abs(audio)) < .0001:
        raise ValueError('Empty audio: ' + relative)
    audio *= peak / np.max(np.abs(audio))
    n = min(int(rate*.004), len(audio)//2)
    audio[:n] *= np.linspace(0, 1, n)[:, None]
    audio[-n:] *= np.linspace(1, 0, n)[:, None]
    path = OUT / 'sfx' / (name + '.wav')
    temp = CACHE / (name + '-prepared.wav')
    sf.write(temp, audio, rate, subtype='PCM_16')
    temp.replace(path)
    records.append({'file': 'sfx/'+path.name, 'source': source, 'original': relative,
                    'segment': [start, end], 'edits': 'Mono, silence trimmed, peak balanced, 4ms edge fades.'})


def slice_series(prefix, source, relative, count, gap=.25, max_duration=4):
    audio, rate = read(relative)
    spans = regions(audio, rate, gap)
    spans = [(a, min(b, a+int(rate*max_duration))) for a,b in spans if (b-a)/rate > .12]
    if len(spans) < count:
        raise ValueError(f'{relative}: expected {count} shots, found {len(spans)}')
    for i, (a,b) in enumerate(spans[:count]):
        write_effect(f'{prefix}-{i+1}', source, relative, a/rate, b/rate)


def write_music(name, source, relative, start, end):
    audio, rate = read(relative)
    audio = audio[int(start*rate):int(end*rate)]
    # Rotate a two-second tail/head overlap into the loop; its last sample
    # meets the first continuously, rather than adding silence at each repeat.
    n = int(rate*2)
    mix = np.linspace(0, 1, n, endpoint=False)[:, None]
    audio = np.concatenate((audio[n:-n], audio[-n:]*(1-mix)+audio[:n]*mix))
    audio *= min(.09 / max(.0001, np.sqrt(np.mean(audio**2))), .7 / np.max(np.abs(audio)))
    temp = CACHE / (name + '-loop.wav')
    sf.write(temp, audio, rate, subtype='PCM_16')
    dest = OUT / 'music' / (name+'.ogg')
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-y', '-i', str(temp),
                    '-c:a', 'libvorbis', '-q:a', '4', str(dest)], check=True)
    records.append({'file': 'music/'+dest.name, 'source': source, 'original': relative,
                    'segment': [start, end], 'edits': 'Excerpt, two-second circular crossfade, level balanced, Ogg Vorbis.'})


def prepare():
    acquire()
    for folder in ['sfx', 'music']:
        (OUT / folder).mkdir(parents=True, exist_ok=True)
    for i, side in enumerate(['L1', 'L2', 'L3', 'R1', 'R2', 'R3'], 1):
        write_effect(f'sand-{i}', 'feet', f'feet/Fantozzi-footsteps/flac/Fantozzi-Sand{side}.flac')
        write_effect(f'rock-{i}', 'feet', f'feet/Fantozzi-footsteps/flac/Fantozzi-Stone{side}.flac')
    for i in range(1, 6):
        write_effect(f'grass-{i}', 'impact', f'impact/Audio/footstep_grass_{i-1:03}.ogg')
    for i in range(1, 4):
        write_effect(f'wood-{i}', 'steps', f'steps/wood{i:02}.ogg')
        write_effect(f'swish-{i}', 'swish', f'swish/swosh-{i:02}.flac')
        write_effect(f'hit-{i}', 'impact', f'impact/Audio/impactPunch_heavy_{i-1:03}.ogg')
        write_effect(f'thunk-{i}', 'impact', f'impact/Audio/impactWood_medium_{i-1:03}.ogg')
    for i in range(1, 3):
        write_effect(f'leaves-{i}', 'steps', f'steps/leaves{i:02}.ogg')
        write_effect(f'water-{i}', f'water{i}', f'water{i}.wav')
        write_effect(f'reload-{i}', 'foley', f'foley/sfx-cc0/handcuffs-metal-lock-{i:02}.wav')
        write_effect(f'bow-draw-{i}', 'foley', f'foley/sfx-cc0/arrow-grab-from-quiver-{i:02}.wav')
    write_effect('gravel-1', 'steps', 'steps/gravel.ogg')
    write_effect('mud-1', 'steps', 'steps/mud02.ogg')
    slice_series('dirt', 'foley', 'foley/sfx-cc0/soil-steps-01.wav', 2, gap=.15)
    slice_series('pistol', 'firearms', 'firearms/Prepared SFX Library/1911/A_42P.wav', 2, gap=.8, max_duration=1.5)
    slice_series('rifle', 'firearms', 'firearms/Prepared SFX Library/AR-15/D_32P.wav', 2, gap=.8, max_duration=1.5)
    write_effect('empty-1', 'foley', 'foley/sfx-cc0/handcuffs-metal-open-01.wav')
    write_effect('bow-1', 'bow1', 'bow1.mp3')
    write_effect('bow-2', 'bow2', 'bow2.mp3')
    slice_series('trex', 'trex', 'trex.mp3', 3, gap=.6, max_duration=5)
    slice_series('raptor', 'snarl2', 'snarl2.ogg', 2, gap=.25, max_duration=2)
    slice_series('ptera', 'snarl3', 'snarl3.ogg', 2, gap=.5, max_duration=2.5)
    slice_series('stego', 'snarl1', 'snarl1.ogg', 2, gap=.5, max_duration=3)
    write_effect('brachio-1', 'trex', 'trex.mp3', 15.7, 18.5)
    write_effect('brachio-2', 'trex', 'trex.mp3', .2, 1.7)
    write_music('jungle-calm', 'jungle', 'jungle.mp3', 15, 135)
    write_music('jungle-danger', 'battle', 'battle.mp3', 2, 94)
    write_music('volcano-calm', 'volcano', 'volcano.mp3', 45, 165)
    write_music('volcano-danger', 'encounter', 'encounter.mp3', 140, 260)
    metadata = {key: {'author': a, 'license': l, 'page': p, 'download': u} for key,(a,l,p,u) in SOURCES.items()}
    (OUT / 'sources.json').write_text(json.dumps({'sources': metadata, 'assets': records}, indent=2)+'\n', encoding='utf-8')
    print(f'Prepared {len(records)} assets ({sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())/1024/1024:.1f} MiB)')


if __name__ == '__main__':
    prepare()
