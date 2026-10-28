# Week-one ad kit · copy sheet

Files in this folder: `V1-*.mp4`, `V2-*.mp4`, `I1-adu-*.jpg`, `I1-house-*.jpg`, `I2-*.jpg`, each in `4x5` (1080x1350, feed), `9x16` (1080x1920, Reels and Stories), `1x1` (1080x1080). Videos are H.264, muted, captions burned in; V1 is 13 s, V2 is 12.5 s.

## Campaign setup (same for all four)

- Objective: Leads, with the website conversion event set to the custom "high tier" lead event once CAPI is confirmed; until then optimize for Lead.
- Location: California. Age 35 to 65. Detailed targeting: accessory dwelling unit, garage conversion, home improvement, home construction, construction loan, real estate investing. Advantage+ audience on, with those as suggestions.
- Placements: Advantage+ placements. Upload all three ratios per ad and let Meta pick.
- Budget: one campaign, four ad sets (one per concept) or one ad set with four ads; for a first week, one ad set with four ads at a flat daily budget gives cleaner comparison.
- CTA button: Learn more (Meta's closest to "See if you qualify").
- Landing URL pattern: `https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=<AD-ID>` where AD-ID is V1, V2, I1-adu, I1-house, or I2.

---

## V1 · Days, not months (video, control)

- Primary text: Waiting months for drawings? We deliver full permit sets for ADUs and homes under 3,000 sq ft in one to two weeks, priced by size from $6,000 and stamped by a California licensed architect. Two minutes to see if your lot qualifies.
- Headline: Permit plans in days, not months.
- Description: ADUs from $6,000. Homes from $15,000.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=V1
- On-screen beats: 0-1.5 s hero grid scroll, "Permit-ready in 5 days." · 1.5-3.5 s "Waiting months for drawings?" · 3.5-6.5 s live-session clip, the solution line · 6.5-8.5 s price spectrum, "From $6,000." · 8.5-10.5 s sheet stack, "Every sheet the city asks for." · 10.5-13 s CTA.

## V2 · Still waiting on your drafter? (video, pain hook)

- Primary text: If your architect takes days to reply and weeks per round of drawings, you are paying for their other projects. We put one production architect on yours and deliver a stamped, permit-ready set in one to two weeks. ADUs from $6,000.
- Headline: Your plans, on the date we promised.
- Description: One architect on your project, and only yours.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=V2
- On-screen beats: 0-1.5 s pain clip, no text · 1.5-3.5 s "Still waiting on your drafter?" · 3.5-5.5 s "Days for a reply. Weeks per round. Months for a permit." · 5.5-8.5 s live-session clip, "One architect on your project, and only yours. Full permit sets in one to two weeks." · 8.5-10.3 s "5 days for an ADU. 10 for a house." · 10.3-12.5 s CTA.

## I1-adu · Price-and-days ladder, ADU end (image)

- Primary text: Getting quotes that take a meeting to produce? Full permit sets for ADUs and homes under 3,000 sq ft, in one to two weeks. Flat prices by size, days by size, stamped by a California licensed architect with structural, MEP, and Title 24 included.
- Headline: Fixed-fee permits, $6K to $20K.
- Description: Small ADU: 5 business days, $6,000.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=I1-adu

## I1-house · Price-and-days ladder, house end (image)

- Primary text: same as I1-adu.
- Headline: Fixed-fee permits, $6K to $20K.
- Description: Large home: 10 business days, $20,000.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=I1-house

## I2 · 60 days versus 5 (image)

- Primary text: State law gives the city 60 days to review an ADU. Most drafters take longer than that just to hand you the set. We deliver a stamped, permit-ready set in 5 business days and answer every plan check comment within 3 business days until the permit issues.
- Headline: Permit-ready in 5 business days.
- Description: Stamped by a California licensed architect.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=I2

---

## Reading results after a week

- Judge on qualified leads (form passes, tier high in Pipedrive) per dollar, not clicks or raw submits.
- The page records utm_content on every lead, so each concept's passes are visible in Pipedrive without Meta's attribution.
- Kill anything with no pass after roughly 3x the cost of the best ad's first pass; double the winner's budget and add V3 (Richman on camera) when it is recorded.

## Rebuilding

`python scripts/build-ads.py` rebuilds everything from the site assets; `python scripts/build-ads.py V2` rebuilds one concept. Copy changes live in that script.

## In Ads Manager (built 2026-10-21 through the Meta Ads MCP, all paused)

- Campaign `120248961380990532` "Fast-track homeowners · week 1 (fasttrack-w1)": Leads objective, campaign budget $100/day, highest volume, no special ad category.
- Ad set `120248961390240532` "California homeowners 35-65 · website Lead": optimizes for the pixel Lead event (pixel 778078978037243), website destination, California only, Advantage+ audience with 35 to 65 as the suggestion (hard floor 25), Advantage+ placements, 7-day click / 1-day view attribution. No interest targeting; Meta's API needs verified interest IDs and the copy-sheet interests are left for Ads Manager if wanted.
- Ads: V1 `120248961403990532`, V2 `120248961406930532`, I1-adu `120248961404720532`, I2 `120248961405380532`. Each is one creative with placement asset customization: 4:5 fallback, 9:16 for Stories and Reels, 1:1 for Marketplace, right column and Explore.
- AI disclosure was not declared (field omitted). I1-house is uploaded to the media library but has no ad.

- Launched 2026-10-21 about 12:30 PT through the connector: campaign, ad set and all four ads ACTIVE, ads in Meta review. Location targeting is Meta's current default (living in or recently in California); editing the ad set's locations in Ads Manager trips error 1870194, so make targeting edits through the connector.

---

## Week two additions (built 2026-10-24)

Photographic layers come from Gemini via `scripts/gen-images.py` (prompt blocks at the end of `docs/homepage-image-prompts.md`, files `images/home/ad-contractor.jpg` and `images/home/ad-adu-dusk.jpg`); the cards are composed by `scripts/build-ads.py A B`.

## A · Your contractor has a start date (image, persona pain)

- Primary text: If your builder has a start date and you still do not have a stamped set, you are the person we built this for. Full permit sets for ADUs and homes under 3,000 sq ft in one to two weeks, with structural, MEP and Title 24 included, so the permit pull is not waiting on anyone else. Two minutes to see if your lot qualifies.
- Headline: Drawings before your contractor's start date.
- Description: Stamped set in 5 to 10 business days.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=A-contractor
- Tests: a named situation against I1 and I2's general audience. Expect fewer clicks and a higher pass rate.

## B · The delay costs more than the drawings (image, magnitude in dollars)

- Primary text: A detached ADU in most California cities rents for $2,000 to $3,500 a month. Every month your drawings sit with a slow drafter is a month of that rent gone, and most drafters take three to four months. We deliver a stamped, permit-ready set in 5 business days for a small ADU, 10 for a house, priced by size from $6,000. The drawings cost less than the delay. Two minutes to see if your lot qualifies.
- Headline: The delay costs more than the drawings.
- Description: ADU permit sets from $6,000 in 5 days.
- URL: https://velocitystud.io/?utm_source=meta&utm_medium=paid&utm_campaign=fasttrack-w1&utm_content=B-delay
- Rent figures: $2,500 a month typical, $10,000 over four months. 2026 sources put detached California ADU rents at roughly $2,200 to $4,000 statewide, with HUD fair market rent for a Los Angeles one-bedroom at $2,328, so $2,500 is conservative. Copy says "most California cities" and never promises income.
- Tests: cost of delay against I1's cost of the drawings. Expect more volume from the "no deadline yet" crowd.

- In Ads Manager (2026-10-24, paused, same ad set 120248961390240532): A `120249014782100532` creative `28953444324295529`; B `120249014782530532` creative `40717370427861754`. Placement mapping as the week-one ads.
- Ads A and B activated 2026-10-24 through the connector; six ads now share the $100/day campaign budget.

## Week-two test (2026-10-28)

- A and B moved to their own campaign so the shared budget cannot starve them: campaign `120249078741190532` "Fast-track homeowners · week 2 test, ads A and B (fasttrack-w2)", $40/day, ends 2026-11-02 23:59 PT; ad set `120249078746110532` mirrors the week-one targeting; ads A `120249078748060532`, B `120249078748580532`. The A and B copies inside the week-one ad set are paused.
- Old TOFU Ad Spend campaign trimmed from $100/day to $50/day. Note: a budget edit through the connector force-pauses the campaign; reactivate it right after.
- Lead emails changed subject when the form was rebuilt on Oct 25-26; search the inbox by sender, not subject. "High" now means start within 3 months and nothing blocking ("READY NOW" in the body).
