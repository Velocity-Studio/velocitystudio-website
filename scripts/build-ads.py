#!/usr/bin/env python
"""Build the week-one ad kit from the site's assets.

Outputs ads/week1/<concept>-<ratio>.(mp4|jpg). Videos: text cards drawn with
Pillow, site clips fitted with a blurred fill, burned-in captions, hard cuts,
30 fps H.264, muted. Images composed directly.

  python scripts/build-ads.py            everything
  python scripts/build-ads.py V1 I2      a subset
"""
import os, subprocess, sys, tempfile, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / 'images' / 'home'
OUT = ROOT / 'ads' / 'week1'
TMP = Path(tempfile.mkdtemp(prefix='vsads_'))
FONTS = Path('C:/Windows/Fonts')
FPS = 30

DARK, FOREST, TEAL, TEAL_LT, GOLD, GOLD_LT, OFF, WHITE = '#1C1C1C', '#162F26', '#2D8B6E', '#5BE0B0', '#C9942B', '#E6B84A', '#F0EDE6', '#FFFFFF'
RATIOS = {'4x5': (1080, 1350), '9x16': (1080, 1920), '1x1': (1080, 1080)}


def font(size, bold=True):
    for name in (['segoeuib.ttf', 'arialbd.ttf'] if bold else ['segoeui.ttf', 'arial.ttf']):
        p = FONTS / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def safe(w, h):
    """Text-safe box: (x0, y0, x1, y1). Reels UI eats the top and bottom of 9:16."""
    m = int(w * 0.08)
    top = int(h * 0.14) if h > w * 1.4 else int(h * 0.09)
    bot = int(h * 0.20) if h > w * 1.4 else int(h * 0.09)
    return (m, top, w - m, h - bot)


def wrap(draw, text, f, max_w):
    words, lines, cur = text.split(), [], ''
    for wd in words:
        t = (cur + ' ' + wd).strip()
        if draw.textlength(t, font=f) <= max_w:
            cur = t
        else:
            lines.append(cur); cur = wd
    if cur:
        lines.append(cur)
    return lines


def draw_block(draw, box, text, size, color=WHITE, bold=True, align='left', anchor='top', y=None, lh=1.12):
    """Draw wrapped text in box. anchor: top|center|bottom. Returns bottom y."""
    x0, y0, x1, y1 = box
    f = font(size, bold)
    lines = wrap(draw, text, f, x1 - x0)
    line_h = int(size * lh)
    total = line_h * len(lines)
    if y is None:
        y = y0 if anchor == 'top' else (y0 + y1 - total) // 2 if anchor == 'center' else y1 - total
    for ln in lines:
        tw = draw.textlength(ln, font=f)
        x = x0 if align == 'left' else (x0 + x1 - tw) / 2 if align == 'center' else x1 - tw
        draw.text((x, y), ln, font=f, fill=color)
        y += line_h
    return y


def gradient_bar(img, x0, x1, y, thick=12):
    d = ImageDraw.Draw(img)
    c0, c1 = Image.new('RGB', (1, 1), TEAL_LT).getpixel((0, 0)), Image.new('RGB', (1, 1), GOLD_LT).getpixel((0, 0))
    for x in range(x0, x1):
        t = (x - x0) / max(1, x1 - x0)
        c = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
        d.line([(x, y), (x, y + thick)], fill=c)
    r = thick + 8
    d.ellipse((x0 - r, y + thick // 2 - r, x0 + r, y + thick // 2 + r), fill=TEAL_LT)
    d.ellipse((x1 - r, y + thick // 2 - r, x1 + r, y + thick // 2 + r), fill=GOLD_LT)


def button(img, cx, y, label, w=None):
    d = ImageDraw.Draw(img)
    f = font(44)
    tw = d.textlength(label, font=f)
    w = w or int(tw + 120)
    d.rounded_rectangle((cx - w // 2, y, cx + w // 2, y + 110), radius=16, fill=TEAL)
    d.text((cx - tw / 2, y + 28), label, font=f, fill=WHITE)
    return y + 110


def fit_cover(img, w, h):
    iw, ih = img.size
    s = max(w / iw, h / ih)
    img = img.resize((int(iw * s) + 1, int(ih * s) + 1), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def tile(path, w, h, radius=18):
    im = fit_cover(Image.open(path).convert('RGB'), w, h)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); out.paste(im, (0, 0), mask)
    return out


def canvas(w, h, bg=DARK):
    return Image.new('RGB', (w, h), bg)


# ─── video helpers ────────────────────────────────────────────────────────────
def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def seg_from_png(png, dur, out, w, h, zoom=False):
    vf = f'scale={w}:{h}'
    if zoom:  # slow push-in
        vf = f"scale={w*2}:{h*2},zoompan=z='1+0.04*in/({dur*FPS})':d={int(dur*FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS}"
        run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', str(png), '-t', str(dur), '-vf', vf, '-r', str(FPS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', str(out)])
        return
    run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', str(png), '-t', str(dur), '-vf', vf, '-r', str(FPS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', str(out)])


def seg_from_clip(clip, overlay_png, dur, out, w, h, start=0):
    """Clip fitted inside WxH over a blurred cover of itself, overlay PNG on top."""
    vf = (f"[0:v]split=2[bg][fg];[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=30:4,eq=brightness=-0.15[bgb];"
          f"[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2[base];[base][1:v]overlay=0:0,fps={FPS}")
    run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(start), '-i', str(clip), '-loop', '1', '-i', str(overlay_png), '-t', str(dur), '-filter_complex', vf, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', str(out)])


def seg_scroll_grid(grid_png, dur, out, w, h, px_per_s):
    vf = f"crop=w={w}:h={h}:x=0:y='min(ih-{h},t*{px_per_s})',fps={FPS}"
    run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', str(grid_png), '-t', str(dur), '-vf', vf, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', str(out)])


def concat(segs, out):
    lst = TMP / (out.stem + '.txt')
    lst.write_text(''.join(f"file '{Path(s).as_posix()}'\n" for s in segs))
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(out)])


# ─── cards ────────────────────────────────────────────────────────────────────
def overlay_caption(w, h, text, size=None, pos='bottom', eyebrow=None):
    """Transparent PNG with a dark band and caption for compositing over a clip."""
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = safe(w, h)
    size = size or int(w * 0.062)
    f = font(size)
    lines = wrap(d, text, f, x1 - x0)
    lh = int(size * 1.12); block = lh * len(lines) + (int(size * 0.9) if eyebrow else 0)
    y = (y1 - block - 40) if pos == 'bottom' else y0 + 20
    band = Image.new('RGBA', (w, block + 120), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    for i in range(band.height):
        bd.line([(0, i), (w, i)], fill=(20, 20, 20, int(170 * min(1, i / 40) if pos == 'bottom' else 170 * min(1, (band.height - i) / 40))))
    img.alpha_composite(band, (0, y - 60))
    if eyebrow:
        d.text((x0, y), eyebrow, font=font(int(size * 0.5)), fill=TEAL_LT); y += int(size * 0.9)
    for ln in lines:
        d.text((x0, y), ln, font=f, fill=WHITE); y += lh
    return img


def card_text(w, h, headline, sub=None, bg=DARK, eyebrow=None, accent=GOLD_LT, cta=None, url=None):
    img = canvas(w, h, bg); d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = safe(w, h)
    size = int(w * 0.085)
    f = font(size); lines = wrap(d, headline, f, x1 - x0)
    lh = int(size * 1.08)
    subf = font(int(w * 0.042), False) if sub else None
    sub_lines = wrap(d, sub, subf, x1 - x0) if sub else []
    total = lh * len(lines) + (len(sub_lines) * int(w * 0.042 * 1.3) + 40 if sub else 0) + (int(w * 0.04) + 20 if eyebrow else 0) + (170 if cta else 0)
    y = (y0 + y1 - total) // 2
    if eyebrow:
        d.text((x0, y), eyebrow.upper(), font=font(int(w * 0.03)), fill=TEAL_LT); y += int(w * 0.04) + 20
    for ln in lines:
        d.text((x0, y), ln, font=f, fill=WHITE); y += lh
    if sub:
        y += 40
        for ln in sub_lines:
            d.text((x0, y), ln, font=subf, fill=(255, 255, 255, 200) if False else '#D9D4CA'); y += int(w * 0.042 * 1.3)
    if cta:
        y += 50; y = button(img, w // 2, y, cta)
        if url:
            d.text(((w - d.textlength(url, font=font(int(w * 0.036), False))) / 2, y + 24), url, font=font(int(w * 0.036), False), fill='#D9D4CA')
    return img


def card_spectrum(w, h, title, left=('500 sq ft ADU', '5 business days · $6,000'), right=('4,000 sq ft house', '10 business days · $20,000'), sub=None, tiles=None, cta=None, url=None, bg=DARK):
    img = canvas(w, h, bg); d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = safe(w, h)
    y = y0 + 10
    y = draw_block(d, (x0, y, x1, y1), title, int(w * 0.072)) + 50
    f1, f2 = font(int(w * 0.04)), font(int(w * 0.03), False)
    d.text((x0, y), left[0], font=f1, fill=WHITE); d.text((x1 - d.textlength(right[0], font=f1), y), right[0], font=f1, fill=WHITE); y += int(w * 0.05)
    d.text((x0, y), left[1], font=f2, fill=TEAL_LT); d.text((x1 - d.textlength(right[1], font=f2), y), right[1], font=f2, fill=GOLD_LT); y += int(w * 0.06)
    gradient_bar(img, x0 + 12, x1 - 12, y); y += 60
    if sub:
        y = draw_block(d, (x0, y, x1, y1), sub, int(w * 0.034), '#D9D4CA', False) + 30
    if tiles:
        n = len(tiles); gap = 20; tw = (x1 - x0 - gap * (n - 1)) // n; th = int(tw * 2 / 3)
        if y + th < y1 - (180 if cta else 0):
            for i, t in enumerate(tiles):
                img.paste(tile(t, tw, th), (x0 + i * (tw + gap), y), tile(t, tw, th));
            y += th + 40
    if cta:
        y = max(y, y1 - 190); button(img, w // 2, y, cta)
        if url:
            d.text(((w - d.textlength(url, font=f2)) / 2, y + 134), url, font=f2, fill='#D9D4CA')
    return img


def card_sheets(w, h, caption, tiles, bg=DARK):
    img = canvas(w, h, bg); d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = safe(w, h)
    n = len(tiles); gap = 24; tw = x1 - x0; th = int(tw * 2 / 3)
    if n * th + (n - 1) * gap > (y1 - y0) * 0.72:  # fan them: overlapping offsets
        step = int(((y1 - y0) * 0.72 - th) / max(1, n - 1))
        for i, t in enumerate(tiles):
            tt = tile(t, tw - i * 40, int((tw - i * 40) * 2 / 3)); img.paste(tt, (x0 + i * 20, y0 + i * step), tt)
        y = y0 + int((y1 - y0) * 0.72) + 30
    else:
        y = y0
        for t in tiles:
            tt = tile(t, tw, th); img.paste(tt, (x0, y), tt); y += th + gap
        y += 10
    draw_block(d, (x0, y, x1, y1), caption, int(w * 0.06), WHITE, True, 'left', 'top')
    return img


def grid_png(w, h, tiles_list, cols=3, gap=14):
    tw = (w - gap * (cols - 1)) // cols; th = int(tw * 2 / 3)
    rows = (len(tiles_list) + cols - 1) // cols
    img = canvas(w, rows * (th + gap), DARK)
    for i, t in enumerate(tiles_list):
        r, c = divmod(i, cols); tt = tile(t, tw, th, 10); img.paste(tt, (c * (tw + gap), r * (th + gap)), tt)
    return img


def save(img, path):
    # PNG keeps alpha (overlays depend on it); JPG flattens to RGB.
    if path.suffix == '.png':
        img.save(path, 'PNG')
    else:
        img.convert('RGB').save(path, 'JPEG', quality=90, optimize=True)


# ─── concepts ─────────────────────────────────────────────────────────────────
HG = lambda n: HOME / f'hero-grid-{n:02d}.jpg'
URL = 'velocitystud.io'
SOLUTION = 'Full permit sets for ADUs and homes under 3,000 sq ft, in one to two weeks.'


def build_V1(ratio):
    w, h = RATIOS[ratio]; segs = []
    p = TMP / f'v1-{ratio}'; p.mkdir(exist_ok=True)
    g = grid_png(w, h, [HG(n) for n in range(1, 25)] * 2)  # 16 rows: never scrolls off the end
    save(g, p / 'grid.png'); seg_scroll_grid(p / 'grid.png', 1.2, p / 's1.mp4', w, h, px_per_s=int(h * 0.55))
    save(overlay_caption(w, h, 'Permit-ready in 5 days.', pos='top'), p / 'o1.png')
    seg_from_clip(p / 's1.mp4', p / 'o1.png', 1.2, p / 's1b.mp4', w, h); segs.append(p / 's1b.mp4')
    # snap to one stamped floor plan
    plan = canvas(w, h, DARK); x0, y0, x1, y1 = safe(w, h); tw = x1 - x0; th = int(tw * 2 / 3)
    tt = tile(HG(7), tw, th); plan.paste(tt, (x0, (h - th) // 2), tt)
    save(plan, p / 'c1c.png'); seg_from_png(p / 'c1c.png', 0.8, p / 's1c.mp4', w, h, zoom=True)
    seg_from_clip(p / 's1c.mp4', p / 'o1.png', 0.8, p / 's1d.mp4', w, h); segs.append(p / 's1d.mp4')
    save(card_text(w, h, 'Waiting months for drawings?', eyebrow='Permits are usually painful'), p / 'c2.png'); seg_from_png(p / 'c2.png', 2.0, p / 's2.mp4', w, h, zoom=True); segs.append(p / 's2.mp4')
    save(overlay_caption(w, h, SOLUTION), p / 'o3.png'); seg_from_clip(HOME / 'solution-call.mp4', p / 'o3.png', 3.0, p / 's3.mp4', w, h, start=1); segs.append(p / 's3.mp4')
    save(card_spectrum(w, h, 'From $6,000.', sub='Stamped, engineered, Title 24 included.'), p / 'c4.png'); seg_from_png(p / 'c4.png', 2.0, p / 's4.mp4', w, h, zoom=True); segs.append(p / 's4.mp4')
    save(card_sheets(w, h, 'Every sheet the city asks for.', [HG(1), HG(3), HG(5)]), p / 'c5.png'); seg_from_png(p / 'c5.png', 2.0, p / 's5.mp4', w, h, zoom=True); segs.append(p / 's5.mp4')
    save(card_text(w, h, 'Two minutes to see if your lot qualifies.', cta='See if you qualify', url=URL), p / 'c6.png'); seg_from_png(p / 'c6.png', 2.5, p / 's6.mp4', w, h); segs.append(p / 's6.mp4')
    concat(segs, OUT / f'V1-{ratio}.mp4')


def build_V2(ratio):
    w, h = RATIOS[ratio]; segs = []
    p = TMP / f'v2-{ratio}'; p.mkdir(exist_ok=True)
    save(Image.new('RGBA', (w, h), (0, 0, 0, 0)), p / 'blank.png')
    seg_from_clip(HOME / 'pain-desk.mp4', p / 'blank.png', 1.5, p / 's1.mp4', w, h); segs.append(p / 's1.mp4')
    save(overlay_caption(w, h, 'Still waiting on your drafter?', pos='top'), p / 'o2.png'); seg_from_clip(HOME / 'pain-desk.mp4', p / 'o2.png', 2.0, p / 's2.mp4', w, h, start=1.5); segs.append(p / 's2.mp4')
    save(overlay_caption(w, h, 'Days for a reply. Weeks per round. Months for a permit.', pos='top', size=int(w * 0.05)), p / 'o2b.png'); seg_from_clip(HOME / 'pain-desk.mp4', p / 'o2b.png', 2.0, p / 's2b.mp4', w, h, start=3.5); segs.append(p / 's2b.mp4')
    save(overlay_caption(w, h, 'One architect on your project, and only yours. Full permit sets in one to two weeks.', size=int(w * 0.055)), p / 'o3.png'); seg_from_clip(HOME / 'solution-call.mp4', p / 'o3.png', 3.0, p / 's3.mp4', w, h, start=1); segs.append(p / 's3.mp4')
    save(card_text(w, h, '5 days for an ADU. 10 for a house.', sub='From $6,000. Stamped by a California licensed architect.'), p / 'c4.png'); seg_from_png(p / 'c4.png', 1.8, p / 's4.mp4', w, h, zoom=True); segs.append(p / 's4.mp4')
    save(card_text(w, h, 'See if you qualify.', sub='Two minutes. Then a 15-minute call with your exact price.', cta='See if you qualify', url=URL), p / 'c5.png'); seg_from_png(p / 'c5.png', 2.2, p / 's5.mp4', w, h); segs.append(p / 's5.mp4')
    concat(segs, OUT / f'V2-{ratio}.mp4')


def build_I1(ratio):
    w, h = RATIOS[ratio]
    adu = card_spectrum(w, h, '$6,000 and 5 days for a small ADU.', sub='Flat prices by size. Days by size. Stamped by a California licensed architect, structural, MEP, and Title 24 included.', tiles=[HG(2), HG(3), HG(8)], cta='See if you qualify', url=URL)
    save(adu, OUT / f'I1-adu-{ratio}.jpg')
    house = card_spectrum(w, h, '$20,000 and 10 days for a large home.', sub='Flat prices by size. Days by size. Stamped by a California licensed architect, structural, MEP, and Title 24 included.', tiles=[HG(14), HG(11), HG(22)], cta='See if you qualify', url=URL)
    save(house, OUT / f'I1-house-{ratio}.jpg')


def build_I2(ratio):
    w, h = RATIOS[ratio]
    img = canvas(w, h, FOREST); d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = safe(w, h)
    y = draw_block(d, (x0, y0 + 10, x1, y1), 'The city takes 60 days to review an ADU.', int(w * 0.082), WHITE)
    y = draw_block(d, (x0, y + 30, x1, y1), 'We take 5 to draw it.', int(w * 0.082), GOLD_LT, y=y + 30)
    y = draw_block(d, (x0, y + 40, x1, y1), 'Stamped, permit-ready, and every plan check comment answered within 3 business days.', int(w * 0.036), '#D9D4CA', False, y=y + 40)
    tw = int((x1 - x0) * 0.5); th = int(tw * 2 / 3)
    tt = tile(HG(3), tw, th); img.paste(tt, (x1 - tw, y1 - th - 150), tt)
    button(img, x0 + 190, y1 - 120, 'See if you qualify', w=380)
    d.text((x0, y1 - 0), '', font=font(10))
    save(img, OUT / f'I2-{ratio}.jpg')


BUILDERS = {'V1': build_V1, 'V2': build_V2, 'I1': build_I1, 'I2': build_I2}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:] or list(BUILDERS)
    for k in wanted:
        for ratio in RATIOS:
            BUILDERS[k](ratio)
            print('built', k, ratio, flush=True)
    for f in sorted(OUT.iterdir()):
        print(f'  {f.name:22s} {f.stat().st_size // 1024:6d} KB')
