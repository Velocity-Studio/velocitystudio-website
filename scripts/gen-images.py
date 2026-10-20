#!/usr/bin/env python
"""Generate the homepage image slots with Gemini.

Reads docs/homepage-image-prompts.md, finds every "### <file> · <aspect>" still
prompt, calls the Gemini image model once per slot, and writes the result to
images/home/<file> at the slot's target size. Existing files are skipped unless
--force is given, so rejected images can be deleted and regenerated alone.

Usage:
  python scripts/gen-images.py --dry-run            list what would be generated
  python scripts/gen-images.py --only pain-desk.jpg  one slot
  python scripts/gen-images.py                       every missing still
  python scripts/gen-images.py --force --only hero-sheet-3.png

The key is read from GEMINI_API_KEY in the environment or from a .env file in
the repo root (KEY=VALUE lines). The key is never printed.
"""
import argparse, hashlib, io, json, os, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / 'docs' / 'homepage-image-prompts.md'
OUT = ROOT / 'images' / 'home'
MANIFEST = OUT / 'manifest.json'
SIZES = {'4:3': (1600, 1200), '4:5': (1200, 1500), '16:10': (1600, 1000), '16:9': (1600, 900), '1:1': (1200, 1200)}
SKIP = {'richman.jpg'}  # real photo only


def load_env():
    if os.environ.get('GEMINI_API_KEY'):
        return
    env = ROOT / '.env'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def parse_prompts():
    text = PROMPTS.read_text(encoding='utf-8')
    slots = []
    for m in re.finditer(r'^### (\S+) · (\S+)\s*\n(.*?)(?=^### |^---|\Z)', text, re.M | re.S):
        name, aspect, body = m.group(1), m.group(2), m.group(3).strip()
        if name.endswith('.mp4') or name in SKIP or aspect not in SIZES:
            continue
        prompt = ' '.join(p.strip() for p in body.split('\n\n') if p.strip() and not p.strip().startswith('Real photograph'))
        if prompt:
            slots.append({'file': name, 'aspect': aspect, 'prompt': prompt})
    return slots


def fit(img, aspect):
    from PIL import Image
    tw, th = SIZES[aspect]
    w, h = img.size
    target = tw / th
    if w / h > target:
        nw = int(h * target); x = (w - nw) // 2; img = img.crop((x, 0, x + nw, h))
    elif w / h < target:
        nh = int(w / target); y = (h - nh) // 2; img = img.crop((0, y, w, y + nh))
    return img.resize((tw, th), Image.LANCZOS)


def save(img_bytes, dest, aspect):
    from PIL import Image
    img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    img = fit(img, aspect)
    if dest.suffix.lower() in ('.jpg', '.jpeg'):
        img.save(dest, 'JPEG', quality=82, optimize=True, progressive=True)
    else:
        img.save(dest, 'PNG', optimize=True)


def generate(client, model, prompt, aspect):
    from google.genai import types
    cfg_kwargs = {'response_modalities': ['IMAGE']}
    try:
        cfg = types.GenerateContentConfig(image_config=types.ImageConfig(aspect_ratio=aspect), **cfg_kwargs)
    except Exception:
        cfg = types.GenerateContentConfig(**cfg_kwargs)
        prompt = f'Aspect ratio {aspect}. ' + prompt
    last_err = None
    for attempt in range(3):
        try:
            resp = client.models.generate_content(model=model, contents=prompt, config=cfg)
            for cand in (resp.candidates or []):
                for part in (cand.content.parts or []):
                    data = getattr(getattr(part, 'inline_data', None), 'data', None)
                    if data:
                        return data if isinstance(data, (bytes, bytearray)) else bytes(data)
            last_err = RuntimeError('no image part in response: ' + (getattr(resp, 'text', '') or '')[:200])
        except Exception as e:  # rate limits, transient errors
            last_err = e
        time.sleep(4 * (attempt + 1))
    raise last_err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='comma-separated file names')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--model', default='gemini-2.5-flash-image')
    args = ap.parse_args()

    slots = parse_prompts()
    if args.only:
        wanted = {s.strip() for s in args.only.split(',')}
        slots = [s for s in slots if s['file'] in wanted]
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [s for s in slots if args.force or not (OUT / s['file']).exists()]
    if args.limit:
        todo = todo[:args.limit]

    print(f'{len(slots)} still slots in prompts file, {len(todo)} to generate')
    for s in todo:
        print(f"  {s['file']:28s} {s['aspect']:6s} {len(s['prompt'].split())} words")
    if args.dry_run or not todo:
        return

    load_env()
    if not os.environ.get('GEMINI_API_KEY'):
        sys.exit('GEMINI_API_KEY not set (environment or .env in the repo root)')
    from google import genai
    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    ok = 0
    for s in todo:
        dest = OUT / s['file']
        t0 = time.time()
        try:
            data = generate(client, args.model, s['prompt'], s['aspect'])
            save(data, dest, s['aspect'])
            manifest[s['file']] = {'model': args.model, 'aspect': s['aspect'], 'prompt_sha1': hashlib.sha1(s['prompt'].encode()).hexdigest()[:12], 'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'bytes': dest.stat().st_size}
            MANIFEST.write_text(json.dumps(manifest, indent=2))
            ok += 1
            print(f"  ok   {s['file']:28s} {dest.stat().st_size // 1024:4d} KB  {time.time() - t0:4.1f}s")
        except Exception as e:
            print(f"  FAIL {s['file']:28s} {type(e).__name__}: {str(e)[:160]}")
    print(f'{ok}/{len(todo)} generated')


if __name__ == '__main__':
    main()
