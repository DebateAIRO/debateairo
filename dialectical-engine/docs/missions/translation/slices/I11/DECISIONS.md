# I11 — Locale formatting and right-to-left · DECISIONS

**Append-only.** One line per decision: date · question · choice · reason · who ruled. Never edited, never deleted.

**Before any seat asks V a question, it reads this file and `docs/missions/translation/V-DECISIONS-PACKET.md`.** A question already answered here is re-asked to nobody.

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-01 | What counts as "actually be translated"? | The app's own words only; model-written debate content stays as argued | DR-179 leaves no lawful run-time translation service; intake contradiction C1 | orchestrator, as recorded in 00-intake-H0.md (V row V-3, default in force) |
| 2026-09-01 | Which languages? | English + 16, the table in requirements/translation.md §Q2 | V-2 default; both rankings agree on the block and Romanian is the home market | orchestrator (V row V-2, default in force) |
| 2026-09-01 | Where is the chosen language remembered? | A browser cookie, one year; not on the account | The account and settings surface belongs to the accounts/privacy program; intake C6 | orchestrator (V row V-6, default in force) |
| 2026-09-01 | What happens on a first visit with no cookie? | Best match from the browser's Accept-Language list, else English | V-7 default | orchestrator (V row V-7, default in force) |
| 2026-09-02 | Who does the work? | Opus 5 subagents for every seat; Fable 5.1 orchestrator only; V is QA | V ruled verbatim on 2026-09-02 | V (row V-1, RULED) |
| 2026-09-02 | In-house i18n layer or the next-intl package? | The architecture seat decides and records ADR-0019 | V row V-8 is an information row; ADR-0019 is the next free number | pending ARCH-01 |
| 2026-09-01 | Right-to-left: text only, or a mirrored layout? | Full mirrored layout in this mission | V-4 default; intake C4 | orchestrator (V row V-4, default in force) |
| 2026-09-01 | Fonts for non-Latin scripts? | Per-script system fallback stacks; no new font files | V-5 default; intake C5 | orchestrator (V row V-5, default in force) |
| 2026-09-01 | New styles for the menu versus the T9 mode-token gate | No colour literal outside the first two token blocks of globals.css; new tokens registered in the t9-mode-tokens maps with comma-tight values | Intake contradiction C8; the ui-overhaul gate binds every CSS change made here | orchestrator (mission law) |

