# Pitch deck

`sehati_pitch.pptx` — 13 slides, paced for a 3-minute pitch. Structure follows the
Amazon Industry Program pitching workshop: team → problem → why now → solution →
problem–solution fit → demo → business model → competitive advantage → future plans.

Every slide carries speaker notes with its time slot and what to say.

## Before you present — fill these in

| Slide | What to replace |
|---|---|
| 2 — Team | Real names, years and roles for members 2–4 (initials on the avatars too) |
| 3 — Story | Swap the composite quote for a real, consented one if you have it |
| 5 — Why now | The three `[ % ] [ # ] [ $ ]` stats — use figures you can cite, or delete the strip |
| 9 — Demo | Paste the video link, or embed the video on the slide |
| 10 — Business model | Replace with real pricing once the pilot-ward costing is done |

## Regenerating

The deck is generated, not hand-edited — edit `build_deck.js` and rerun:

```bash
npm install pptxgenjs
node build_deck.js sehati_pitch.pptx
```

Small tweaks are fine to make directly in PowerPoint; if you do, the script goes stale.
