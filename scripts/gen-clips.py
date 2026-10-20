#!/usr/bin/env python
"""Animate the approved stills into short looping clips with Veo.

Reads the "### <name>.mp4 · Veo 3 motion" blocks in docs/homepage-image-prompts.md,
feeds each matching still in images/home/ to Veo as the starting frame (and as the
last frame, so the clip returns to where it began), waits for every operation,
downloads the raw MP4 to images/home/raw/, then compresses it with ffmpeg into
images/home/<name>.mp4 (H.264, muted, faststart).

Usage:
  python scripts/gen-clips.py --dry-run
  python scripts/gen-clips.py --only pain-desk.mp4
  python scripts/gen-clips.py                 every clip whose still exists and whose mp4 does not
  python scripts/gen-clips.py --compress-only re-encode existing raw clips without calling the API
"""
import argparse, json, os, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / 'docs' / 'homepage-image-prompts.md'
OUT = ROOT / 'images' / 'home'
RAW = OUT / 'raw'
MANIFEST = OUT / 'manifest.json'
PORTRAIT = {'pain-desk.mp4'}  # 4:5 slot: ask for 9:16 and let CSS cover-crop

# gen-images.py has the same loader; kept inline so each script runs alone.
def load_env():
    if os.environ.get('GEMINI_API_KEY'):
        return
    if os.name == 'nt':
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as k:
                val, _ = winreg.QueryValueEx(k, 'GEMINI_API_KEY')
                if val:
                    os.environ['GEMINI_API_KEY'] = val
                    return
        except OSError:
            pass
    env = ROOT / '.env'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.strip().startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def parse_prompts():
    text = PROMPTS.read_text(encoding='utf-8')
    clips = []
    for m in re.finditer(r'^### (\S+\.mp4) · Veo 3 motion\s*\n(.*?)(?=^### |^---|\Z)', text, re.M | re.S):
        name, prompt = m.group(1), ' '.join(m.group(2).split())
        still = OUT / (name[:-4] + '.jpg')
        clips.append({'file': name, 'still': still, 'prompt': prompt, 'aspect': '9:16' if name in PORTRAIT else '16:9'})
    return clips


def compress(raw, dest, portrait):
    # Portrait clips come back 9:16 with the 4:5 still letterboxed; crop to 4:5.
    # Landscape clips come back 16:9 for a 16:10 still (thin pillarbox); crop to 16:10.
    scale = 'crop=iw:iw*5/4,scale=720:-2' if portrait else 'crop=ih*16/10:ih,scale=1280:-2'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw), '-an', '-vf', scale,
           '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dest)]
    subprocess.run(cmd, check=True)


def start(client, model, clip):
    from google.genai import types
    img = types.Image(image_bytes=clip['still'].read_bytes(), mime_type='image/jpeg')
    # Progressively simpler configs: the Gemini API rejects some Vertex-only options.
    attempts = [
        dict(aspect_ratio=clip['aspect'], duration_seconds=8, resolution='720p', number_of_videos=1, last_frame=img),
        dict(aspect_ratio=clip['aspect'], duration_seconds=8, resolution='720p', number_of_videos=1),
        dict(aspect_ratio=clip['aspect'], duration_seconds=8, number_of_videos=1),
        dict(aspect_ratio=clip['aspect']),
    ]
    last = None
    for cfg_kwargs in attempts:
        try:
            return client.models.generate_videos(model=model, prompt=clip['prompt'], image=img, config=types.GenerateVideosConfig(**cfg_kwargs))
        except Exception as e:
            last = e
            msg = str(e)
            if 'not supported' not in msg and 'INVALID_ARGUMENT' not in msg and 'invalid' not in msg.lower():
                break
    raise last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--compress-only', action='store_true')
    ap.add_argument('--model', default='veo-3.1-generate-preview')
    ap.add_argument('--fallback-model', default='veo-3.0-generate-001')
    ap.add_argument('--max-parallel', type=int, default=2)
    args = ap.parse_args()

    clips = parse_prompts()
    if args.only:
        wanted = {s.strip() for s in args.only.split(',')}
        clips = [c for c in clips if c['file'] in wanted]
    RAW.mkdir(parents=True, exist_ok=True)

    if args.compress_only:
        for c in clips:
            raw = RAW / c['file']
            if raw.exists():
                compress(raw, OUT / c['file'], c['file'] in PORTRAIT)
                print(f"  compressed {c['file']:26s} {(OUT / c['file']).stat().st_size // 1024:5d} KB")
        return

    todo = [c for c in clips if c['still'].exists() and (args.force or not (OUT / c['file']).exists())]
    missing = [c['file'] for c in clips if not c['still'].exists()]
    print(f'{len(clips)} clip prompts, {len(todo)} to generate' + (f', no still for: {missing}' if missing else ''))
    for c in todo:
        print(f"  {c['file']:26s} {c['aspect']:6s} from {c['still'].name}")
    if args.dry_run or not todo:
        return

    load_env()
    if not os.environ.get('GEMINI_API_KEY'):
        sys.exit('GEMINI_API_KEY not set')
    from google import genai
    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])

    # Veo allows only a couple of generations in flight per key: keep at most
    # --max-parallel running, start the next when one finishes, and back off on 429.
    queue = list(todo)
    ops = {}
    model_used = {}
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    pending = {}
    t0 = time.time()
    backoff = 20

    def try_start():
        nonlocal backoff
        while queue and len(pending) < args.max_parallel:
            c = queue[0]
            started = False
            for model in (args.model, args.fallback_model):
                try:
                    op = start(client, model, c)
                    ops[c['file']] = op; pending[c['file']] = op; model_used[c['file']] = model
                    print(f"  started   {c['file']:26s} {model}", flush=True)
                    started = True
                    break
                except Exception as e:
                    msg = str(e)
                    if '429' in msg or 'RESOURCE_EXHAUSTED' in msg:
                        print(f"  quota     {c['file']:26s} waiting {backoff}s", flush=True)
                        time.sleep(backoff); backoff = min(backoff * 2, 180)
                        return  # try again on the next poll tick
                    print(f"  no-start  {c['file']:26s} {model}: {msg[:140]}", flush=True)
            queue.pop(0)
            if not started:
                print(f"  FAIL      {c['file']:26s} could not start", flush=True)

    try_start()
    while (pending or queue) and time.time() - t0 < 2400:
        if not pending and queue:
            try_start()
            continue
        time.sleep(12)
        for name, op in list(pending.items()):
            try:
                op = client.operations.get(op)
            except Exception as e:
                print(f"  poll-err  {name:26s} {str(e)[:120]}")
                continue
            pending[name] = op
            if not op.done:
                continue
            del pending[name]
            try:
                vids = op.response.generated_videos if op.response else None
                if not vids:
                    print(f"  FAIL      {name:26s} {str(getattr(op, 'error', None))[:160] or 'no video returned'}")
                    continue
                raw = RAW / name
                client.files.download(file=vids[0].video)
                vids[0].video.save(str(raw))
                dest = OUT / name
                compress(raw, dest, name in PORTRAIT)
                manifest[name] = {'model': model_used[name], 'aspect': next(c['aspect'] for c in todo if c['file'] == name), 'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'raw_bytes': raw.stat().st_size, 'bytes': dest.stat().st_size}
                MANIFEST.write_text(json.dumps(manifest, indent=2))
                print(f"  ok        {name:26s} raw {raw.stat().st_size // 1024:6d} KB -> {dest.stat().st_size // 1024:5d} KB  {time.time() - t0:5.0f}s", flush=True)
            except Exception as e:
                print(f"  FAIL      {name:26s} {type(e).__name__}: {str(e)[:160]}", flush=True)
            try_start()
    for name in pending:
        print(f"  TIMEOUT   {name}")


if __name__ == '__main__':
    main()
