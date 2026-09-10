# design/S01 — the artboards V accepted, verbatim

Source: the Claude Design canvas https://claude.ai/code/artifact/e08c6b3b-60b1-4e8a-9c15-79ca43a16d22
(title "Free and Premium tier selector on /new", published by seat MOCK-S01 on 2026-09-09). Read back
with the Artifact tool (action `read`) on 2026-09-10 00:06 EEST; the page's `appifact-doc` record
(`content.files`) was written out file by file, byte for byte. The record carried **0 comments** and
no edit since the mock seat's publish — V's answer at the gate was given in chat, not on the canvas:
«well, I love it the way it is. go forward with implementation».

`MANIFEST.tsv` lists every file with its byte count, line count and sha256 prefix. `canvas.json` is
the layout (14 artboards; `annotations` and `launch` as published). Each `.dc.html` is one artboard —
a self-contained page whose inline styles ARE the measurements `slices/S01/DONE.md` transcribes.

| # | File | Artboard title on the canvas | Frame (w × h) | Screen (`PLAN.md ## Screens`) |
|---|---|---|---|---|
| 1 | `Main.dc.html` | S01-tier-element-closeup-terracotta | 700 × 520 | the element alone: Free chosen · Premium chosen · neither chosen (mock furniture) |
| 2 | `S01-tier-element-chamber.dc.html` | S01-tier-element-closeup-chamber | 700 × 520 | as 1, Chamber |
| 3 | `S01-new-free-collapsed-terracotta.dc.html` | S01-new-free-collapsed-terracotta | 772 × 1010 | screen 1 |
| 4 | `S01-new-free-collapsed-chamber.dc.html` | S01-new-free-collapsed-chamber | 772 × 1010 | screen 1, Chamber |
| 5 | `S01-new-premium-collapsed-terracotta.dc.html` | S01-new-premium-collapsed-terracotta | 772 × 1010 | screen 3 |
| 6 | `S01-new-premium-collapsed-chamber.dc.html` | S01-new-premium-collapsed-chamber | 772 × 1010 | screen 3, Chamber |
| 7 | `S01-new-no-tier-terracotta.dc.html` | S01-new-no-tier-terracotta | 772 × 1010 | screen 6 — the row V-9 alternative, NOT taken (see DONE.md) |
| 8 | `S01-new-no-tier-chamber.dc.html` | S01-new-no-tier-chamber | 772 × 1010 | screen 6, Chamber — NOT taken |
| 9 | `S01-new-free-expanded-terracotta.dc.html` | S01-new-free-expanded-terracotta | 772 × 1500 | screen 2 |
| 10 | `S01-new-free-expanded-chamber.dc.html` | S01-new-free-expanded-chamber | 772 × 1500 | screen 2, Chamber |
| 11 | `S01-new-premium-moved-terracotta.dc.html` | S01-new-premium-moved-terracotta | 772 × 1500 | screen 4 |
| 12 | `S01-new-premium-moved-chamber.dc.html` | S01-new-premium-moved-chamber | 772 × 1500 | screen 4, Chamber |
| 13 | `S01-new-free-again-terracotta.dc.html` | S01-new-free-again-terracotta | 772 × 1500 | screen 5 |
| 14 | `S01-new-free-again-chamber.dc.html` | S01-new-free-again-chamber | 772 × 1500 | screen 5, Chamber |

The artboards reference `./support.js` and Google Fonts in their `<head>`; neither is part of the
record and neither is needed to read the measurements. Provenance of every value (which stylesheet
line each one copies) is `slices/S01/MOCK.md` § "Provenance".
