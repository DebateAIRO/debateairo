# I01 — Language foundation and the menu · DECISIONS

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
| 2026-09-02 | Where does the menu go, given that the debate view suppresses the top bar? | Adjacent to every ModeToggle, including the compact one in the debate toolbar at DebatePageClient.tsx:1139 | Intake contradiction C2; TopBar.tsx:58 returns null on /debate and /public/debate | orchestrator (mission law) |
| 2026-09-02 | Does I01 editing DebatePageClient.tsx break single-writer, when I05 owns that file? | No: I01 makes a mount edit (one import, one element) and merges before I05 starts; single-writer forbids two CONCURRENT writers | Vertical-slice law, COMMON.md §3 | REQ-01 |
| 2026-09-02 | Cookie name | __Host-debateai-locale, Path=/, Secure, SameSite=Lax, Max-Age=31536000, no Domain | Matches the repo's existing __Host- convention; the prefix pins Path and Secure and forbids Domain. Recorded as contested row T-4 because it fails silently over plain HTTP | REQ-01 (contested, T-4) |
| 2026-09-01 | New styles for the menu versus the T9 mode-token gate | No colour literal outside the first two token blocks of globals.css; new tokens registered in the t9-mode-tokens maps with comma-tight values | Intake contradiction C8; the ui-overhaul gate binds every CSS change made here | orchestrator (mission law) |

