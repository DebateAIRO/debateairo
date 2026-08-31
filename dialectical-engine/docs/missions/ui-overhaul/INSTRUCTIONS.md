# ui-overhaul — mission compass

**What:** Replace the shipped UI with the eight designed TURN sections so every
present TURN in the design document becomes the live product surface.

**Done (V):** TURN 1, 3, 4, 5, 6, 7, 8, 9 are implemented (~13 artboards).
**TURN 2 does not exist** — Done is exactly those eight sections. Landing (T9)
serves anonymous users at `/`; signed-in users keep the library. Nav Method /
Transcripts / Pricing are stub anchors only (pages never designed).

## Slices

| Code | Name |
|---|---|
| T1 | Debate view — tree canvas |
| T3 | Library & public debate view |
| T4 | New debate |
| T5 | Node detail drawer |
| T6 | Settings — identity & account |
| T7 | Sign in, two-step & fleet |
| T8 | Sign up, MFA enrolment & recovery |
| T9 | Landing page |

## Roster and review route

- **Requirements:** Grok — compass + SPECs; reviewed by Claude Opus 5 (§2.1).
- **Architecture:** Claude Opus 5 — HOW / PLAN fill / ADRs; reviewed by Grok.
- **Programming:** Codex — code; reviewed by Claude Opus 5.
- **QA:** V personally — every SPEC acceptance section is human-runnable in a
  browser (numbered steps + expected observations).

## Table of contents (pointers only)

| Pointer | Path |
|---|---|
| Design (rendered, read this) | `docs/missions/ui-overhaul/design/design-document-rendered.html` |
| Design (plain text) | `docs/missions/ui-overhaul/design/design-document-text.txt` |
| Design (original bundle, ref) | `docs/missions/ui-overhaul/design/design-document-original.html` |
| Slice T1 | `docs/missions/ui-overhaul/slices/T1/` |
| Slice T3 | `docs/missions/ui-overhaul/slices/T3/` |
| Slice T4 | `docs/missions/ui-overhaul/slices/T4/` |
| Slice T5 | `docs/missions/ui-overhaul/slices/T5/` |
| Slice T6 | `docs/missions/ui-overhaul/slices/T6/` |
| Slice T7 | `docs/missions/ui-overhaul/slices/T7/` |
| Slice T8 | `docs/missions/ui-overhaul/slices/T8/` |
| Slice T9 | `docs/missions/ui-overhaul/slices/T9/` |
| Goal packet REQ-01 | `.hermes/planning/ui-overhaul/packets/REQ-01.md` |
| Agent reports | `.hermes/reports/ui-overhaul/agent-reports/` |
| Serving UI tree | `apps/ui` |
| Owner debate route | `apps/ui/app/debate/[id]/` |
| Public debate route | `apps/ui/app/public/debate/[id]/` (same workspace, `publicMode`) |
| Library / home today | `apps/ui/app/page.tsx` |
| Render pins (OLD UI) | `tests/render/**` — must move to NEW UI per slice (ARCH names pins) |
| Heartbeat spine | `docs/agent-protocols/debateai-heartbeat-protocol.md` |
| Requirements contract | `.claude/skills/heartbeat-requirements/SKILL.md` |
| Architecture contract | `.claude/skills/heartbeat-architecture/SKILL.md` |

## Design-system facts (requirements; token extraction = ARCH)

Fonts: Fraunces + Plus Jakarta Sans. Palette: terracotta `#C15F3C`, green
`#3F7466`, cream `#E7E2D8` / `#f0eee6`, ink `#111111`. Modes: Terracotta
(light) / Chamber (dark) with a mode toggle the current app does not have.

## Standing laws (by name)

Rework cap 3 · no self-review (§2.1) · finding-is-a-finding · board-is-state ·
RED-before-GREEN · verbatim evidence · UNVERIFIED respected · file-contract ·
no push/merge/Done from non-verifier · QA=V (human browser steps). Full text:
spine + `heartbeat-protocol`.

## Order of work (dependency hint only)

T9 landing (anonymous `/`) before signed-in library remains the default for
logged-out visitors · T7/T8 auth shell before gated settings/new-debate flows ·
T3 library/public and T1/T5 debate surfaces share card/chrome vocabulary ·
T4 new-debate form · T6 settings. Architecture owns exact sequencing.
