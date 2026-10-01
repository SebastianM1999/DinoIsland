"""Generate local weapon samples with ElevenLabs; reads .env, never ships a key.

Requires numpy and soundfile. Cached originals prevent paid regeneration.
Delete a specific .cache/elevenlabs-sfx MP3 to intentionally regenerate it.
"""
from pathlib import Path
import json, os, re, urllib.request, urllib.error
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/elevenlabs-sfx'
OUT = ROOT / 'assets/audio'
MODEL = 'eleven_text_to_sound_v2'
PROMPTS = {
    'el-pistol': (1.2, 'Exactly one isolated realistic pistol gunshot, close first-person perspective: immediate sharp explosive crack and a brief low punch, short natural outdoor decay. Single shot only, no burst, no reload, no shell bouncing, no voices, no music, no background ambience. Clean dry game sound effect.'),
    'el-m4': (1.0, 'Exactly one isolated M4 carbine 5.56 rifle gunshot, close first-person perspective: immediate crisp supersonic crack, punchy compact report, very short outdoor decay. One single round only, not automatic fire or a burst. No reload, no shell bouncing, no voices, no music, no background ambience. Clean dry game sound effect suitable for repeating at automatic fire cadence.'),
    'el-spear': (.7, 'One isolated fast spear throwing whoosh: a heavy wooden shaft rapidly sweeps past the listener through air, immediate forceful swish with low weight and a short airy tail. Only the launch whoosh, no impact, no grunt, no footsteps, no music or background ambience. Clean dry first-person game sound effect.'),
    'el-bow': (.8, 'One isolated wooden hunting bow releasing a single arrow: immediate tight string snap and warm elastic twang, followed by a very brief arrow air swish. Release only, no long drawing sound, no impact, no voice, no music or background ambience. Clean dry close first-person game sound effect.'),
    'el-impact': (.7, 'One isolated compact weapon impact: a spear or arrow strikes a dense resistant surface with a sharp short crack and a weighty dull thud underneath. Immediate attack, very short decay. No metallic ringing, no ricochet, no voice, no splatter, no music or background ambience. Clean dry game hit sound effect.'),
}

def api_key():
    path = ROOT / '.env'
    match = re.search(r'^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*(.*?)\s*$', path.read_text(encoding='utf-8-sig'), re.M) if path.exists() else None
    key = match.group(1).strip().strip('"').strip("'") if match else os.environ.get('ELEVENLABS_API_KEY', '')
    if not key:
        raise SystemExit('Missing ELEVENLABS_API_KEY in local .env or environment.')
    return key

def prepare():
    CACHE.mkdir(parents=True, exist_ok=True)
    key = api_key()
    manifest_path = OUT / 'sources.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for name, (duration, prompt) in PROMPTS.items():
        original = CACHE / (name + '.mp3')
        if not original.exists():
            payload = {'text': prompt, 'duration_seconds': duration, 'prompt_influence': .75, 'loop': False, 'model_id': MODEL}
            request = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
                data=json.dumps(payload).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = response.read()
                if len(data) < 1000:
                    raise SystemExit('Generation returned empty audio: ' + name)
                original.write_bytes(data)
            except urllib.error.HTTPError as error:
                detail = json.loads(error.read()).get('detail', {})
                status = detail.get('status', 'unknown') if isinstance(detail, dict) else 'request rejected'
                raise SystemExit(f'ElevenLabs generation failed: HTTP {error.code}, {status}.') from None
        audio, rate = sf.read(original, dtype='float32', always_2d=True)
        audio = audio.mean(axis=1)
        # Remove leading silence so gameplay releases remain synchronized.
        active = np.flatnonzero(np.abs(audio) > max(.001, float(np.max(np.abs(audio))) * .015))
        if not len(active):
            raise SystemExit('Silent generated sample: ' + name)
        start = max(0, int(active[0]) - int(rate*.002))
        end = min(len(audio), int(active[-1]) + int(rate*.06))
        audio = audio[start:end]
        audio *= .65 / float(np.max(np.abs(audio)))
        n = min(int(rate*.002), len(audio)//2)
        audio[:n] *= np.linspace(0, 1, n)
        audio[-n:] *= np.linspace(1, 0, n)
        filename = f'sfx/{name}-1.wav'
        sf.write(OUT / filename, audio, rate, subtype='PCM_16')
        manifest['sources'][name] = {'author': 'Generated with ElevenLabs', 'license': 'ElevenLabs-terms',
            'page': 'https://elevenlabs.io/sound-effects', 'terms': 'https://elevenlabs.io/terms-of-use',
            'model': MODEL, 'prompt': prompt, 'duration_seconds': duration, 'prompt_influence': .75, 'loop': False}
        manifest['assets'] = [a for a in manifest['assets'] if a['file'] != filename]
        manifest['assets'].append({'file': filename, 'source': name, 'original': '.cache/elevenlabs-sfx/'+original.name,
            'segment': [start/rate, end/rate], 'edits': 'Mono, silence trimmed, peak balanced to 0.65, 2ms edge fades, PCM16 WAV.'})
        # Save after each effect; a later permission/network failure loses no work.
        manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
        print(f'Prepared {filename}: {len(audio)/rate:.3f}s, peak {np.max(np.abs(audio)):.3f}', flush=True)

if __name__ == '__main__':
    prepare()
