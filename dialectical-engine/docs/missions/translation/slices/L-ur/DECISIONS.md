# L-ur — اردو · DECISIONS

**Append-only.** One line per decision: date · question · choice · reason · who ruled.

**Before any seat asks V a question, it reads this file and `docs/missions/translation/V-DECISIONS-PACKET.md`.**

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-01 | What gets translated? | The app's own words only; model-written debate content stays as argued | DR-179 leaves no lawful run-time translation service; intake C1 | orchestrator (V row V-3, default in force) |
| 2026-09-01 | Which languages? | English + 16, per requirements/translation.md §Q2 | V-2 default | orchestrator (V row V-2, default in force) |
| 2026-09-02 | Register for اردو | آپ (formal) throughout | Recorded in requirements/translation.md §Q2 with its reason | REQ-01 |
| 2026-09-02 | Plural categories for `ur` | one, other | Read from Intl.PluralRules on Node v22.23.1 full ICU, 2026-09-02; not recalled | REQ-01 (measured) |
| 2026-09-01 | Right-to-left: text only or mirrored layout? | Full mirrored layout, built by slice I11 | V-4 default; intake C4 | orchestrator (V row V-4, default in force) |
| 2026-09-01 | Fonts for non-Latin scripts | Per-script system fallback stacks; no new font files | V-5 default; intake C5 | orchestrator (V row V-5, default in force) |
| 2026-09-02 | Are `Terracotta` and `Chamber` translated? | Kept in English until V rules; the glossary cell reads `Terracotta (kept)` | Contested row T-2 in requirements/translation.md | REQ-01 (contested, T-2) |

