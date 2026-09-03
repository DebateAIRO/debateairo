# public-debate-access — mission compass

**What:** Make published debates fully readable by anyone (including anonymous
visitors), with selectable **Your Debates** / **Public Debates** navigation, and
public debate pages at READ-affordance parity with the owner's debate UI.

**Done (V):** (1) both buttons present and accessible · (2) each shows the right
list · (3) public debates open with the same READ UI options as the owner's.

## Slices

| Code | Name |
|---|---|
| S01 | Public publication envelope + publish path |
| S02 | Public debate READ-parity UI |
| S03 | Your Debates / Public Debates navigation |
| S04 | Anonymous-exposure review |

## Roster and review route

- **Requirements (this seat):** Grok — authors compass + SPECs; reviewed by Claude
  (not Grok; §2.1). Packet review of Router: Grok on `t_a12687d5`.
- **Architecture:** Claude (Opus 5) — fills PLAN.md steps/clusters/ADRs.
- **Programming:** per roster (Codex coding law unless V amends).
- **QA:** Grok holds QA on this mission; SPEC author does not review own SPEC.

Same-model Claude Architecture + Claude SPEC-reviewer are decorrelated by prompt
only — weight independent Grok findings accordingly.

## Table of contents (pointers only)

| Pointer | Path |
|---|---|
| Measured intake (do not re-derive) | `docs/missions/public-debate-access/INTAKE.md` |
| Slice S01 | `docs/missions/public-debate-access/slices/S01/` |
| Slice S02 | `docs/missions/public-debate-access/slices/S02/` |
| Slice S03 | `docs/missions/public-debate-access/slices/S03/` |
| Slice S04 | `docs/missions/public-debate-access/slices/S04/` |
| Goal packet REQ-01 | `.hermes/reports/public-debate-access/packets/REQ-01.md` |
| Agent reports | `.hermes/reports/public-debate-access/agent-reports/` |
| Tooling traps | `.hermes/TOOLING-TRAPS.md` |
| Heartbeat spine | `docs/agent-protocols/debateai-heartbeat-protocol.md` |
| Requirements contract | `.claude/skills/heartbeat-requirements/SKILL.md` |
| Architecture contract | `.claude/skills/heartbeat-architecture/SKILL.md` |
| Serving UI tree | `apps/ui` (not `web/`) |
| Public contract | `packages/contract/src/index.ts` (`PublicDebateSchema`) |
| Publish / read path | `apps/api/src/publications.ts` |
| Public API routes | `apps/api/src/index.ts` (`GET /v1/public/debates{,/{id}}`) |
| Owner debate UI | `apps/ui/app/debate/[id]/` |
| Public debate UI (today) | `apps/ui/app/public/debate/[id]/page.tsx` |
| Library home | `apps/ui/app/page.tsx` |

## Standing laws (by name)

Rework cap 3 · no self-review (§2.1) · finding-is-a-finding · board-is-state ·
RED-before-GREEN · verbatim evidence · UNVERIFIED respected · file-contract ·
no push/merge/Done from non-verifier. Full text: spine + `heartbeat-protocol`.

## Order of work

S01 (envelope) before S02 (UI consumes it) · S03 can parallel S01/S02 after its
own SPEC freeze · S04 gates widened plaintext before mission close.
