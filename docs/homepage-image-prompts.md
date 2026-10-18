# Homepage image pack

Every slot below has a matching `[PLACEHOLDER: ...]` box on the page that names the file it expects. Drop the finished file into `images/home/` with that name and the page picks it up once the `<img>` tag replaces the placeholder (one-line change per slot).

## House style for every generated image

Paste this block at the end of each prompt so the set reads as one family:

> Editorial photography look, 35mm lens, natural daylight, shallow depth of field. Warm, muted palette: off-white and oak tones with small accents of deep teal (#2D8B6E) and amber gold (#C9942B). No visible text, logos, watermarks, or captions anywhere in the image. No rendering or CGI look; it should read as a real photograph.

Both ChatGPT Images and Gemini accept the same prompt. Set the aspect ratio in the tool rather than in the prompt. Generate at the largest size offered and downscale; never upscale.

## Motion, without GIFs

GIFs are large, band poorly, and autoplay is unreliable on iOS. Everywhere the page uses motion it is done in code on top of a still image, which is lighter and loops perfectly:

- Hero: five sheet images are stacked and the front one cycles to the back every few seconds (CSS transform transition, already built).
- Pain and solution images: a very slow zoom and drift (Ken Burns), 24 seconds per cycle, already built.
- Solution image: the chat bubbles are HTML, fade in one after the other, then reset. Already built. Leave the screen area of the image free of UI text so the bubbles sit cleanly.

If you still want a true video loop later, generate the still first, then animate it with an image-to-video tool (Veo 3, Runway Gen-4, or Kling) using a prompt like "subtle motion only: the person breathes, the cursor blinks, the camera is locked off, seamless 5 second loop". Export MP4 (H.264, muted) and use a `<video autoplay muted loop playsinline>` tag, not a GIF.

---

## 1. Hero deck: five drawing sheets

**Files:** `hero-sheet-1.png` through `hero-sheet-5.png`
**Size:** 1600 x 1200 (4:3), PNG
**Recommendation:** do not generate these. Export five real sheets from a finished ADU or small-house set as PNG at 150 dpi, with the title block and stamp visible. Real sheets are the single strongest proof on the page and an AI image of a drawing never survives a close look on a phone.

Suggested order (front to back): cover sheet with stamp, site plan, floor plan, exterior elevations, structural framing plan.

**Fallback prompt if a real set is not ready:**

> A single architectural drawing sheet, letter-landscape proportion, seen straight on and filling the frame, white paper on a plain light grey surface. The sheet shows a clean black-line [floor plan of a small one-bedroom accessory dwelling unit / site plan of a backyard lot with a small building footprint / set of four exterior elevations of a simple gabled house / structural roof framing plan with joists and beams / cover sheet with a sheet index grid and a round architect's stamp in the lower right]. Thin professional linework, a title block strip along the right edge, dimension strings, no readable words. Crisp, flat, evenly lit, no shadows across the paper.

Generate one image per bracketed option.

---

## 2. Pain: the slow architect

**File:** `pain-desk.jpg`
**Size:** 1200 x 1500 (4:5), JPG
**Placement:** left of the pain copy on desktop, above it on phones.

**Prompt:**

> Across a cluttered architect's desk, a homeowner in her forties sits with her chin in her hand, visibly tired of waiting, looking at an older architect who is turned away toward a large monitor, slowly drawing a plain floor plan in a CAD program with one hand on the mouse. The monitor is angled so we see only a sliver of grey CAD interface, no readable text. Rolled drawings, a dusty desk phone, stacks of paper and binders, a wall calendar with weeks crossed out, fluorescent office light mixed with window light. The mood is slow, stale, and patient to the point of frustration. Medium shot from slightly behind the homeowner's shoulder so her posture carries the emotion. [house style block]

Variations worth trying: swap the homeowner for a man in work clothes holding a contractor's clipboard; or show two chairs on the client side, a couple, one checking a phone.

---

## 3. Solution: the live layout session

**File:** `solution-call.jpg`
**Size:** 1600 x 1000 (16:10), JPG
**Placement:** right of the solution bullets on desktop, above them on phones. The page overlays two animated chat bubbles in the upper-left quarter and two small circular portraits in the lower-right corner, so keep those areas visually quiet.

**Prompt:**

> A laptop screen filling most of the frame, photographed at a slight angle on a clean oak desk in warm daylight. On the screen is a video call: the shared screen shows a crisp 3D building-information model of a small backyard accessory dwelling unit with a gabled roof, cutaway to reveal the floor plan inside, rendered in soft white and light wood with teal selection highlights on one wall. Two small video-call thumbnails of people are in the lower right corner of the screen: a young architect with a headset, and a smiling homeowner at a kitchen table. The upper left of the screen is a calm, empty area of the model's sky. No menus, toolbars, text, or logos visible. The feeling is focused, modern, collaborative, and fast. [house style block]

If the tool insists on drawing UI chrome, add: "the application is in full-screen presentation mode with no toolbars".

---

## 4. How it works: four stops

All four are 1600 x 1000 (16:10), JPG, shown as the top of each step card.

**`journey-1-inputs.jpg`, before you contact us**

> Top-down view of a kitchen table with a homeowner's hands laying out three things: a folded property survey drawing with boundary lines, a thin bound soils report with a plain cover, and an iPhone showing a colorful 3D room scan of an interior. A coffee cup and house keys at the edge. Morning light. No readable text. [house style block]

**`journey-2-sketch.jpg`, the day you contact us**

> Over-the-shoulder view of an architect at a standing desk with two monitors. One monitor shows a satellite view of a suburban parcel with a teal dashed boundary and a smaller amber dashed rectangle inside it; the other shows a rough hand-drawn floor-plan sketch on a tablet with a stylus mid-stroke. A phone on a stand shows a video call with a homeowner. Energetic, bright, late-morning light. No readable text. [house style block]

**`journey-3-locked.jpg`, a day later**

> A wide monitor showing a grid of eight small architectural sheet thumbnails filling in: plans, elevations, a framing plan, a plumbing plan, an energy form, all in clean black linework on white. In the foreground, slightly out of focus, a structural engineer's desk with a calculator, a span table book, and a wood sample. Afternoon light. No readable text. [house style block]

**`journey-4-delivered.jpg`, delivery day**

> A freshly printed full-size drawing set on a drafting table, cover sheet on top, with a round embossed architect's stamp and a blue-ink signature in the lower right corner, a red "received" stamp from a building department beside it. A hand is sliding a USB drive and a folded submittal checklist into a clear envelope. Clean, bright, satisfying. Any text on the stamps should be illegible. [house style block]

---

## 5. Our work carousel

Six slots, 1600 x 1200 (4:3). **Do not generate these.** Use real renderings and real sheets: the Palisades rendering is already in place; add a stamped ADU site plan, a 3D view of an ADU, a framing plan, a remodel scan-to-plan pair, and the Los Altos rendering. Generated "work" in a proof section is the one place an AI image would cost trust.

---

## 6. Richman portrait

**File:** `richman.jpg`, 1200 x 1500 (4:5). Real photograph, daylight, plain background, looking at the camera. Not generated.

---

## Naming and drop-in

| Slot | File | Size | Source |
|---|---|---|---|
| Hero deck | `hero-sheet-1.png` to `-5.png` | 1600 x 1200 | real sheets (fallback prompt above) |
| Pain | `pain-desk.jpg` | 1200 x 1500 | generate |
| Solution | `solution-call.jpg` | 1600 x 1000 | generate |
| How it works | `journey-1-inputs.jpg` to `journey-4-delivered.jpg` | 1600 x 1000 | generate |
| Our work | six files, your choice of names | 1600 x 1200 | real |
| Portrait | `richman.jpg` | 1200 x 1500 | real |

Compress JPGs to roughly 200 KB each (Squoosh, quality 75) before committing. The page is mobile-first; a 1600-wide image is already more than a phone needs.
