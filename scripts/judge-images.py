#!/usr/bin/env python
"""Judge generated renderings with Gemini and regenerate the ones that fail.

Sends each image to a vision model with a rubric, gets a JSON verdict, and
calls gen-images.py --force for anything under the bar, up to --rounds times.

Usage:
  python scripts/judge-images.py --only hero-grid-02.jpg,hero-grid-04.jpg
  python scripts/judge-images.py --pattern "hero-grid-??.jpg" --even --rounds 2
  python scripts/judge-images.py --only hero-grid-06.jpg --judge-only
"""
import argparse, json, os, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'images' / 'home'
FULL = OUT / 'raw' / 'hero-grid'
REPORT = OUT / 'judge-report.json'

RUBRIC = """You are a senior architect reviewing an AI-generated image that will appear on a website for a California architecture firm that draws permit sets for ADUs, remodels, additions, and simple new homes.
Score the image from 1 to 10 on how convincingly it reads as a real photograph of a real, well-designed, completed project of that kind. Be strict about:
- silhouette: is the building form plausible and simple, with a roof that makes sense?
- openings: are windows, doors, and porches placed and sized the way a real house has them, aligned, not floating or random?
- siting: is the building on a finished lot with real landscaping (lawn, beds, trees, paths), not bare dirt or an empty gravel field?
- interiors (if any): fully furnished and complete, kitchens with all cabinets, counters, appliances; no empty rooms, no half-built islands?
- materials: a coherent palette of at most two or three materials, applied the way a builder would apply them?
- realism: photographic, no CGI sheen, no warped geometry, no duplicated or melting details, no text artifacts?
- fit: a house a California homeowner would actually build (farmhouse, Craftsman, ranch, Spanish, simple modern), not avant-garde?
Return only JSON: {"score": <1-10>, "pass": <true if score >= 7>, "issues": ["short issue", ...]}"""


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


def judge(client, model, path):
    from google.genai import types
    img = types.Part.from_bytes(data=path.read_bytes(), mime_type='image/jpeg')
    for attempt in range(3):
        try:
            resp = client.models.generate_content(model=model, contents=[RUBRIC, img],
                                                  config=types.GenerateContentConfig(response_mime_type='application/json', temperature=0.2))
            txt = resp.text or ''
            m = re.search(r'\{.*\}', txt, re.S)
            return json.loads(m.group(0)) if m else {'score': 0, 'pass': False, 'issues': ['no json: ' + txt[:120]]}
        except Exception as e:
            err = e
            time.sleep(5 * (attempt + 1))
    return {'score': 0, 'pass': False, 'issues': ['judge error: ' + str(err)[:120]]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--pattern', default='hero-grid-??.jpg')
    ap.add_argument('--even', action='store_true', help='only even-numbered files (the renderings)')
    ap.add_argument('--rounds', type=int, default=2)
    ap.add_argument('--threshold', type=int, default=7)
    ap.add_argument('--judge-only', action='store_true')
    ap.add_argument('--model', default='gemini-2.5-flash')
    args = ap.parse_args()

    if args.only:
        files = [OUT / n.strip() for n in args.only.split(',')]
    else:
        files = sorted(OUT.glob(args.pattern))
        if args.even:
            files = [f for f in files if int(re.search(r'(\d+)', f.stem).group(1)) % 2 == 0]
    files = [f for f in files if f.exists()]
    if not files:
        sys.exit('no files')

    load_env()
    from google import genai
    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])
    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}

    pending = files
    for rnd in range(args.rounds + 1):
        failed = []
        for f in pending:
            v = judge(client, args.model, f)
            report.setdefault(f.name, []).append({'round': rnd, 'score': v.get('score'), 'issues': v.get('issues', [])})
            REPORT.write_text(json.dumps(report, indent=2))
            ok = (v.get('score') or 0) >= args.threshold
            print(f"  {'pass' if ok else 'FAIL'} {f.name:20s} {v.get('score')}/10  {'; '.join(v.get('issues', []))[:140]}", flush=True)
            if not ok:
                failed.append(f)
        if not failed or args.judge_only or rnd == args.rounds:
            break
        print(f'round {rnd + 1}: regenerating {len(failed)}', flush=True)
        subprocess.run([sys.executable, '-I', str(ROOT / 'scripts' / 'gen-images.py'), '--force', '--only', ','.join(f.name for f in failed)], check=False)
        pending = failed
    print('done; still failing:', [f.name for f in failed] if failed else 'none')


if __name__ == '__main__':
    main()
