# Mission `translation` — the compass

Make the application available in the seventeen most-used languages, with a menu that changes the
language from any route at any time and a choice that takes effect everywhere. The app's own words
only — the arguments the models wrote stay as argued. Measured surface: **1371 strings in 73 files**.
Twenty-seven slices: eleven that build and extract, sixteen that translate.
**This file is pointers. Every fact lives in the file named beside it.**

## Slices

| Code | Name | Strings | After |
|---|---|---|---|
| `I01` | Language foundation and the menu — registry, cookie, negotiation, `lang`/`dir`, the menu, chrome in all 17 | 22 | — |
| `I02` | Auth screens — sign-in, sign-up, verify e-mail, authenticator enrolment | 117 | I01 |
| `I03` | Settings and account — settings, sessions, erasure | 90 | I01 |
| `I04` | Landing, library and new debate | 143 | I01 |
| `I05` | Debate workspace shell — toolbar, views switcher, status, loading, errors | 190 | I01 |
| `I06` | Debate views — canvas, tree, thread, split, map, outline, focus | 163 | I01 |
| `I07` | Honesty and detail drawers | 206 | I01 |
| `I08` | Banners, panels and controls | 147 | I01 |
| `I09` | Domain copy modules under `lib/` | 229 | I01 |
| `I10` | Public and admin routes, translated 404, scanner at zero | 49 | I01–I09 |
| `I11` | Locale formatting and right-to-left | 15 | I01 |
| `L-<code>` × 16 | One catalog per language: `zh-CN hi es ar fr bn pt-BR ru ur id de ja ko tr vi ro` | ≈1360 keys each | I01–I11, English frozen |

Wave order: I01 alone → I02–I09 and I11 in parallel worktrees → I10 → English catalogs frozen →
sixteen `L-*` in parallel. V tests each slice in a browser; V performs every merge and every push.

## Roster and review route

| Loop | Seat | Model |
|---|---|---|
| Orchestrator | Claude-Router | **Opus 5** from 2026-09-02 10:20 (Fable 5.1 before) — routes and assembles; no verdicts, no code |
| Requirements | REQ-01 → blind REQ-REV-01 | Opus 5 |
| Architecture | ARCH-01 → blind ARCH-REV-01 | Opus 5 |
| Programming | one worker per slice, its own worktree → blind reviewer | Opus 5 |
| Translation | one seat per language → blind reviewer | Opus 5 |
| QA | **V personally.** Developer veto is the only Done for a slice ticket | — |

Ruled by V on 2026-09-02 (row V-1), amended the same day: the orchestrator seat moved to Opus 5 too. Rework rounds: **max 3**; round 4 becomes a V DECISIONS row.
Every seat's handoff opens with `SKILLS LOADED:` and files a self-report before it stops.

## Where everything is

| You want | Read |
|---|---|
| V's verbatim goal, the measured state, the contradiction table C1–C10 | `docs/missions/translation/00-intake-H0.md` |
| The open questions only V can settle, each with the default in force | `docs/missions/translation/V-DECISIONS-PACKET.md` |
| Requirements R01–R56, the language table, the slice cut, the five oracles, the contested rows T-1…T-8 | `docs/missions/translation/requirements/translation.md` |
| How the 1371 was measured, per file, per slice, per category, and what was excluded and why | `docs/missions/translation/requirements/census.md` |
| The raw rows — file, line, category, slice, text | `docs/missions/translation/requirements/census.json` |
| Product vocabulary, one line each, with an empty column per language | `docs/missions/translation/requirements/glossary.md` |
| What a slice is, its acceptance walk, its owned files | `docs/missions/translation/slices/<CODE>/SPEC.md` — **frozen** |
| The steps and cluster commands for a slice | `docs/missions/translation/slices/<CODE>/PLAN.md` — ARCH-01 fills it |
| What is done, next, tried-and-failed, worked | `docs/missions/translation/slices/<CODE>/PROGRESS.md` — orchestrator writes it |
| Every decision already made, so nobody re-asks it | `docs/missions/translation/slices/<CODE>/DECISIONS.md` — append only |
| The master every language SPEC is generated from | `docs/missions/translation/slices/LANG-TEMPLATE/SPEC.md` |
| What the fleet did and when, with receipts | `docs/missions/translation/logs/orchestrator-ledger.md` |
| Traps already paid for once — **read before you start, append what costs you time** | `.hermes/TOOLING-TRAPS.md` |
| The protocol itself | `docs/agent-protocols/debateai-heartbeat-protocol.md` (spine v3.4.0) |
| Your seat's bounds, allowed paths and charges | `.hermes/planning/translation/packets/<SEAT>.md` and `COMMON.md` |
| Architecture decisions; the next free number is **ADR-0019** | `docs/architecture/01-decisions/` |

## Standing laws, by name

Named here so a seat knows what binds it; the wording lives at the pointer.

- **English identity** · **Catalog parity** · **Menu everywhere** · **Single writer** —
  `00-intake-H0.md`, and as R34–R35, R26–R28, R01–R02, R25 in `requirements/translation.md`.
- **The security zone** — on the auth, MFA, settings, sessions and erasure screens the copy is in
  scope and the behaviour is not. `.hermes/planning/translation/packets/COMMON.md` §3.
- **DR-179 no-API-keys hold** — every translation is authored by a seat and committed as a file; no
  run-time machine translation, no translation service. `COMMON.md` §3.
- **DR-188 data preservation** · **privacy posture** · **naming (`dialectical-engine`, "current
  algorithm version")** — `COMMON.md` §3.
- **T9 mode-token gate** — no colour literal outside the first `:root {` and
  `html[data-mode="chamber"] {` blocks of `apps/ui/app/globals.css`; new tokens registered in
  `tests/unit/t9-mode-tokens.test.ts`. `COMMON.md` §3.
- **Vertical-slice law** — a slice has a beginning and an end V can exercise; slices run in parallel
  in separate worktrees; Done is V's veto after personally testing. `COMMON.md` §4.
- **The quantifiability law** and the **banned words** (improve, better, robust, handle,
  appropriate) — every `slices/<CODE>/PLAN.md`, at the top.
- **The three-run law** — a cluster's verification runs three times and the worst run is the
  verdict. Every `PLAN.md`, §Clusters.
- **Reproduce first; verbatim means verbatim; say what you cannot do** — spine §2 and
  `heartbeat-protocol` §2. `UNVERIFIED` is always a legal answer; a guess presented as a result
  never is.
- **Base-RED is not yours** — 25 of 230 test files are RED at `4f764037` and are listed with their
  assertions in `logs/orchestrator-ledger.md`. No oracle may lean on one. A new failure elsewhere is
  yours.
