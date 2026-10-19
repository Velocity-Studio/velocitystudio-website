# Homepage image pack: one prompt per slot

Every slot has a matching `[PLACEHOLDER: images/home/<file>]` box on the page. Drop the finished file into `images/home/` with that name, then swap the placeholder for the tag shown at the bottom of this file.

## Which tool for which slot

- **Static slots** (drawing sheets, renderings): ChatGPT Images 2.5. It holds clean linework and structured layouts better.
- **Narrative slots** (pain, solution, the four how-it-works stops): Gemini. Generate the still first (Nano Banana), then animate that exact still with Veo 3 using the motion prompt. Generating the video from the approved still keeps the picture you chose.

## Append to every still prompt

> Editorial photography look, 35mm lens, natural daylight, shallow depth of field. Warm, muted palette: off-white and oak tones with small accents of deep teal (#2D8B6E) and amber gold (#C9942B). No visible text, logos, watermarks, or captions anywhere in the image. Reads as a real photograph, not a render.

## Append to every Veo motion prompt

> Locked-off camera, no pans or zooms. Subtle, continuous motion only. Nothing enters or leaves the frame unless the prompt says so. The first and last frames should look the same so the clip loops. 8 seconds, no audio.

Export loops as MP4 (H.264, muted, under 2 MB). Trim a few frames at each end if the seam shows. The page already does a slow drift on stills, so a slot works either way.

---

## 1. Hero deck · 5 stills · ChatGPT Images 2.5 · 4:3 · `hero-sheet-1.png` to `hero-sheet-5.png`

Real exported sheets are better here if a set exists. Generated fallbacks:

**hero-sheet-1, cover sheet**
> A single architectural cover sheet, letter-landscape, filling the frame straight on, white paper on a plain light grey surface. A small line-drawn perspective of a simple gabled accessory dwelling unit upper left, a sheet index grid below it, a title block strip down the right edge, and a round embossed architect's stamp with an illegible blue signature in the lower right. Thin professional black linework, flat even light.

**hero-sheet-2, site plan**
> A single architectural site plan sheet, letter-landscape, straight on. A rectangular suburban lot in thin black lines, an existing house footprint toward the street, a smaller new building footprint in the rear yard with dashed setback lines around it, a north arrow, dimension strings, trees drawn as circles, a title block strip down the right edge. No readable words.

**hero-sheet-3, floor plan**
> A single architectural floor plan sheet, letter-landscape, straight on. A one-bedroom accessory dwelling unit plan with thick wall poche, door swings, a kitchen run, a bathroom, window symbols, dimension strings on all sides, a few small room tags as unreadable marks, title block strip down the right edge. Crisp black linework on white.

**hero-sheet-4, elevations**
> A single architectural sheet with four exterior elevations of a simple gabled one-story building arranged two over two, letter-landscape, straight on. Standing-seam roof hatch, board-and-batten siding hatch, window and door outlines, grade line, height dimension strings at the sides, title block strip down the right edge. Thin black linework on white.

**hero-sheet-5, framing plan**
> A single structural roof framing plan sheet, letter-landscape, straight on. Parallel rafter lines, a ridge beam, headers over openings drawn as double lines, small hexagon detail bubbles, a few dimension strings, a notes column of unreadable short lines at the left, title block strip down the right edge, a small round engineer's stamp lower right. Black linework on white.

---

## 2. Pain · Gemini · 4:5 · `pain-desk.jpg` (+ `pain-desk.mp4`)

**Still**
> Across a cluttered architect's desk, a homeowner in her forties sits with her chin in her hand, tired of waiting, looking toward an older architect who is turned away to a large monitor, slowly drawing a plain floor plan in a CAD program, one hand on the mouse. We see only a sliver of grey CAD interface, no readable text. Rolled drawings, a dusty desk phone, binders, a wall calendar with weeks crossed out, fluorescent light mixed with window light. Medium shot from slightly behind the homeowner's shoulder so her posture carries the frustration.

**Motion**
> Animate this image. The homeowner breathes slowly and shifts her weight once, her fingers tapping twice on the desk. The architect's mouse hand moves a few millimeters and stops. The monitor's cursor blinks. Dust drifts in the window light. Everything else is still.

Variants: a man in work clothes holding a contractor's clipboard; or a couple, one checking a phone.

---

## 3. Solution · Gemini · 16:10 · `solution-call.jpg` (+ `solution-call.mp4`)

The page overlays three chat bubbles in the upper-left quarter. Keep that area calm.

**Still**
> A laptop screen filling most of the frame, photographed at a slight angle on a clean oak desk in warm daylight. On screen, a video call in full-screen presentation mode: the shared view is a crisp 3D building model of a small backyard accessory dwelling unit with a gabled roof, cut away to show the floor plan inside, soft white and light wood, one wall highlighted in teal. Two small round video thumbnails sit in the lower right of the screen: a young architect with a headset and a smiling homeowner at a kitchen table. The upper left quarter of the screen is calm empty sky in the model. No menus, toolbars, text, or logos.

**Motion**
> Animate this image. The 3D model rotates very slowly, about ten degrees over the clip, then eases back. The teal highlight moves from one wall to the next. The two people in the thumbnails nod and talk naturally. Light on the desk does not change.

---

## 4. How it works · Gemini · 16:10 · four slots

**journey-1-inputs.jpg (+ .mp4), before you contact us**
Still:
> Top-down view of a kitchen table. A homeowner's hands lay out a folded property survey drawing with boundary lines, a thin bound soils report with a plain cover, and an iPhone showing a colorful 3D room scan of an interior. A coffee cup and house keys at the edge. Morning light.

Motion:
> Animate this image. The hands set the phone down and withdraw out of frame, then return to square up the survey. Steam rises from the coffee. The scan on the phone screen rotates slowly.

**journey-2-sketch.jpg (+ .mp4), the day you contact us**
Still:
> Over-the-shoulder view of an architect at a standing desk with two monitors. One shows a satellite view of a suburban parcel with a teal dashed boundary and a smaller amber dashed rectangle inside it. The other shows a rough hand-drawn floor plan on a tablet with a stylus mid-stroke. A phone on a stand shows a video call with a homeowner. Bright late-morning light.

Motion:
> Animate this image. The stylus draws one more wall line on the tablet and lifts. The homeowner on the phone nods and speaks. The amber rectangle on the satellite view pulses gently once.

**journey-3-locked.jpg (+ .mp4), a day later**
Still:
> A wide monitor showing a grid of eight small architectural sheet thumbnails: plans, elevations, a framing plan, a plumbing plan, an energy form, all clean black linework on white. In the soft foreground, a structural engineer's desk with a calculator, a span-table book, and a wood sample. Afternoon light.

Motion:
> Animate this image. The sheet thumbnails fill in one at a time, left to right, lines appearing as if being drawn, then hold. A hand enters at the bottom edge, taps the calculator twice, and leaves.

**journey-4-delivered.jpg (+ .mp4), delivery day**
Still:
> A freshly printed full-size drawing set on a drafting table, cover sheet on top, a round embossed architect's stamp with an illegible blue-ink signature in the lower right, a red building-department received stamp beside it. A hand slides a USB drive and a folded checklist into a clear envelope. Clean, bright, satisfying.

Motion:
> Animate this image. The hand finishes sliding the envelope closed and rests. A corner of the top sheet lifts slightly in a draft and settles. Sunlight across the table brightens a touch.

---

## 5. Our work carousel · 5 stills · ChatGPT Images 2.5 · 4:3

The Palisades rendering is already real. Real sheets and renderings are strongly preferred for the rest; a generated portfolio is the one place a viewer who knows drawings will catch it. If generating anyway:

**work-adu-siteplan.jpg**
> A photographed architectural site plan sheet lying on a white desk, slight angle, showing a rear-yard accessory dwelling unit footprint with dashed setbacks, an existing house outline, a north arrow, and a round embossed stamp with an illegible blue signature. Thin black linework, natural window light, a pencil at the edge.

**work-adu-3d.jpg**
> A photorealistic exterior view of a small modern two-bedroom accessory dwelling unit in a California backyard at golden hour, gabled standing-seam roof, board-and-batten siding in warm white, black window frames, a small porch, a mature oak behind it, drought-tolerant planting, the main house blurred at the edge of frame.

**work-framing.jpg**
> A photographed structural roof framing plan sheet on a desk, slight angle, rafters as parallel lines, a ridge beam, headers as double lines, hexagon detail bubbles, a small engineer's stamp. Black linework on white, natural light.

**work-remodel-scan.jpg**
> A split image: left half, a colorful phone LiDAR scan of a dated kitchen and living room shown as a 3D mesh; right half, the clean black-line floor plan drawn from it with wall poche and dimension strings. Thin dividing line, white background.

**work-losaltos.jpg**
> A photorealistic street view of a six-story mixed-use building on a sunny California suburban main street, ground-floor retail with large glazing and awnings, five floors of apartments above with balconies, warm stucco and wood-tone cladding, street trees, a few pedestrians, late afternoon light.

---

## 6. Portrait · `richman.jpg` · 4:5

Real photograph only. Daylight, plain background, looking at the camera.

---

## Drop-in

| Slot | File | Size | Tool |
|---|---|---|---|
| Hero deck | `hero-sheet-1.png` to `-5.png` | 1600 x 1200 | ChatGPT Images (or real sheets) |
| Pain | `pain-desk.jpg` / `.mp4` | 1200 x 1500 | Gemini + Veo |
| Solution | `solution-call.jpg` / `.mp4` | 1600 x 1000 | Gemini + Veo |
| How it works | `journey-1..4` `.jpg` / `.mp4` | 1600 x 1000 | Gemini + Veo |
| Our work | `work-*.jpg` | 1600 x 1200 | ChatGPT Images (or real) |
| Portrait | `richman.jpg` | 1200 x 1500 | real |

Replace the placeholder box with one of:

```html
<img src="images/home/pain-desk.jpg" alt="..." loading="lazy"/>
```

```html
<video src="images/home/pain-desk.mp4" poster="images/home/pain-desk.jpg" autoplay muted loop playsinline></video>
```

The `poster` keeps the still visible until the clip loads and on data-saver connections. Compress JPGs to roughly 200 KB (Squoosh, quality 75).
