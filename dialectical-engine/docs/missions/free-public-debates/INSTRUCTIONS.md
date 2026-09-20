# INSTRUCTIONS — mission `free-public-debates` (the compass)

Pointers, not content. Anything explained twice drifts; the detail lives in the slice files, where it
is uncapped. Hard cap: 100 lines.

## 1. The mission

V's goal, verbatim, is in the intake record. In one line: **a Free debate is made public by the
server itself, and cannot be made private again** — auto-publish on serve, unpublish refused, the
creator may still delete. Premium is unchanged. Backend only: no `apps/ui` file is written.
V's rulings I-1…I-4 are closed and live in the intake record. Contradictions C1–C7 are there too;
C4–C7 carry defaults that bind as rows V-1…V-5 until V rules (V-5 is REQ-01's delete-while-public row).

## 2. Slices

| code | name | ui | done oracle |
|---|---|---|---|
| S01 | A Free debate is made public by the server and cannot be made private again | `no` | `slices/S01/SPEC-v2.md` §4 — V runs the numbered walk once, personally, against a served lane |

One slice. The argument for not splitting it, and the alternatives rejected, are in
`slices/S01/DECISIONS.md` §1–§2.

## 3. Roster and route

| node | seat | model |
|---|---|---|
| orchestrator | Claude-Router | claude-fable-5.1 |
| REQ | REQ-01 | claude-opus-5 |
| REQ-REV (blind) | review seat | grok-4.6 |
| ARCH(S01) | architecture | grok-4.6 |
| ARCH-REV (blind) | review seat | claude-opus-5 |
| BUILD / FIX | coding | codex@gpt-5.6-sol |
| REV(S01) — three lenses | correctness/tests · security/data-safety · product-truth | claude-opus-5, one blind session per lens |
| DONE(S01) | V's veto, after testing it personally | V |

`ui: no` — there is no MOCK node and no `DONE.md`. Risk tier `high` (intake, "Classification"), so
`REV(S01)` runs all three lenses. Three REV passes per slice, then it is V's.

## 4. Table of contents — the real files

| what you need | where it is |
|---|---|
| V's verbatim goal, rulings I-1…I-4, contradiction check C1–C7, measured state, the baseline table | `docs/missions/free-public-debates/00-intake.md` |
| the rows whose defaults bind until V rules (V-1…V-5) | `docs/missions/free-public-debates/V-DECISIONS-PACKET.md` |
| WHAT S01 builds — requirements R-1…R-25, suite assertions, V's acceptance walk | `docs/missions/free-public-debates/slices/S01/SPEC-v2.md` — **the SPEC of record**, frozen at REQ-FIX-02's READY |
| the superseded first version, kept byte-identical | `docs/missions/free-public-debates/slices/S01/SPEC.md` (frozen at REQ-01's READY; read `SPEC-v2.md` instead) |
| the detector for the findings SPEC-v2 closes | `docs/missions/free-public-debates/slices/S01/spec-v2-check.sh` |
| the REQ-REV pass-1 verdict that produced SPEC-v2 | `docs/missions/free-public-debates/reviews/REQ-REV-p1.md` |
| HOW — steps, clusters, the SPEC↔PLAN trace | `docs/missions/free-public-debates/slices/S01/PLAN.md` |
| why a choice was made, what was rejected, rows for V | `docs/missions/free-public-debates/slices/S01/DECISIONS.md` |
| where the slice stands | `docs/missions/free-public-debates/slices/S01/PROGRESS.md` (orchestrator writes) |
| what binds every seat — paths, board commands, laws, mission facts | `.hermes/planning/free-public-debates/packets/COMMON.md` |
| your own packet | `.hermes/planning/free-public-debates/packets/<SEAT>.md` |
| the protocol spine (v4.0.0) — the authority in a dispute | `docs/agent-protocols/debateai-heartbeat-protocol.md` |
| role contracts | `.claude/skills/heartbeat-<role>/SKILL.md` |
| self-reports, ledger, probes, review packages | `.hermes/reports/free-public-debates/` |
| tooling traps — read the heading index first | `grep -n '^## ' .hermes/TOOLING-TRAPS.md` |
| where a plan tier lives, and how the publication function may be redefined | `docs/architecture/01-decisions/ADR-0024-plan-tier-storage-and-layering.md` |
| the snapshot back-compat trap that decides the design | `docs/missions/public-debate-access/INTAKE.md:57-75` |

## 5. Ground the mission stands on

- Repo root and cwd for every command: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine`
- Base: `integration/all` @ `5b6cc9b1` (the tier exists only on this line — intake, "Why the base is
  `integration/all`"). Lane for S01 and the merge target are in `COMMON.md` §6.
- The main checkout `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` carries other
  missions' uncommitted work. It is never touched, reverted, stashed or cleaned.
- Baselines, listeners and freeze commits: `COMMON.md` §6, which cites the intake rather than copying
  it. Re-measure before you lean on one.

## 6. Standing laws — by name; the text is in the spine and in `heartbeat-protocol` §3

No self-review · a finding is a finding and you fix the CLASS · three REV passes per slice, then it is
V's · the board is the state · reproduce first, RED before GREEN on every pass · verbatim means
verbatim · say what you cannot do, and UNVERIFIED is always legal · the reading floor · the
no-terminal law.

**Never:** push · merge · mark Done · delete product or database data · fabricate runtime data or
evidence · reveal secrets · cross your `allowed` list · ignore ticket comments · sub-delegate your
deliverable · open a terminal, window or app on V's desktop.

**Git writes:** requirements, architecture and review seats make none. Coding seats commit only on the
slice branch, inside the lane, only when the cluster is green three runs.

**Every seat** loads `superpowers:using-superpowers` first, then `heartbeat-protocol`, then its role
contract, then its floor; opens its handoff with `SKILLS LOADED:`; and files its self-report at
`.hermes/reports/free-public-debates/agent-reports/<SEAT>.md` before its handoff.

## 7. Words no criterion may contain

improve · better · robust · handle · appropriate. A criterion that needs one of them is not yet
measurable — name the status code, the typed string, the row state or the list membership instead.
