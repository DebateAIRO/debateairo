# PLAN — S01 · The Free/Premium selector on `/new` (ticket `t_11abead2`)

**SCAFFOLD ONLY.** The REQ node leaves this shape; the architecture seat (`ARCH(S01)`) fills every
section and appends each choice to `DECISIONS.md`. No line cap: a slice needs as many steps as it has
(V, 2026-08-28).

## The quantifiability law

Every step is finite, categoric and markable done by a stranger. WRONG: "improve the lock". RIGHT:
"`#treeDepth` carries the `disabled` attribute while `data-value=free` is `aria-checked`, and the
test asserting it passes." A step that cannot be marked done from its own text is not a step.
Banned in any step or criterion: improve, better, robust, handle, appropriate.
(The five words in the previous sentence are the ban list itself, quoted from
`heartbeat-requirements` §4 — they are not used as a criterion anywhere in this mission's files.)


## The UI gate comes first

S01 is `ui: yes`. `MOCK(S01)` builds the canvas and V writes `DONE.md` BEFORE any BUILD node starts.
If V's `DONE.md` contradicts a SPEC requirement, that is a supersession recorded in `DECISIONS.md`,
not a silent divergence — and R2 and R18 of the SPEC name in advance the requirement most likely to
move.

## SPEC → PLAN trace (every SPEC requirement is covered by at least one step)

| SPEC req | Covered by step(s) | Cluster |
|---|---|---|
| R1 control semantics | | |
| R2 initial tier | | |
| R3 tier names its models | | |
| R4 Free locks the **fourteen** controls, by id: `#riskTier-casual` · `#riskTier-standard` · `#riskTier-high-stakes` · `#budgetTier-low` · `#budgetTier-medium` · `#budgetTier-high` (6 segment buttons) · `#treeDepth` (slider) · `#steeringPresets` · `#steeringAnnotations` (2 textareas) · `#depthMode` · `#scrutinyDepth` · `#branchingWidth` · `#concurrency` · `#maxTokens` (5 ⚙ OPTIONS knobs). *Corrected at REQ-FIX pass 2, finding N8: v1 said thirteen, and a cluster written against "all thirteen" leaves one control unlocked with its assertion still green.* | | |
| R5 OPTIONS toggle stays operable | | |
| R6 question stays editable | | |
| R7 Free values, **and the provenance pair a Free ask sends** (`tier_source` `MACHINE_DEFAULT`, `tier_provenance_ref` `machine:plan-tier-free`) | | |
| R8 switching re-pins, no hidden restore | | |
| R9 Premium unlocks | | |
| R10 depth range 1..5 preserved | | |
| R11 one roster declaration | | |
| R12 `plan_tier` in `AskRequestSchema` | | |
| R13 UI builder + `createDebate` guard, **with the `NewDebateAskDefaults` member pinned optional** | | |
| R14 API 202 / 400 | | |
| R15 `generate:contract` re-run | | |
| R16 source-shape guards unchanged | | |
| R17 tokens in the two blocks | | |
| R18 `ready` unaffected | | |
| R19 named suites vs baseline — **nine now**, `v2ui-data-layer` (57/57) and `pol01-policy` (8/8) added at pass 2 | | |
| R20 every site that constructs an ask which must now carry a tier — **three sub-classes**: A the 13 schema-parsed literals in 5 files · B the 6 `createDebate` config sites · C the 3 `buildNewDebateAskConfig` sites. *Corrected at REQ-FIX pass 2, finding B2: v1 swept sub-class A only.* | | |
| R21 no new typecheck diagnostic | | |

Every row carries at least one step, and every step names the requirement it serves. A requirement
with an empty row is an unfinished plan.

## Clusters — BUILD units, one verification command each

A cluster is the smallest group of steps verifiable on its own. One command per cluster, run three
times, worst run wins. The review unit is the whole slice at `REV(S01)`, never a cluster.

| Cluster | Steps | What it builds | Verification command (one) | Depends on |
|---|---|---|---|---|
| S01-C1 | | | | |
| S01-C2 | | | | |
| S01-C3 | | | | |

## Boundaries — files this slice may write

Filled by `ARCH(S01)` from the SPEC. Known now: `apps/ui/app/new/page.tsx`,
`apps/ui/app/new/defaults.tsx`, `apps/ui/lib/api.ts`, `apps/ui/app/globals.css`,
`packages/contract/src/index.ts`, `tests/**` for the suites the SPEC names. `packages/contract/src/index.ts`
is S01's alone in this mission (`INSTRUCTIONS.md`).

## RED-first order

Each cluster names the failing test it writes first and the frame in which it fails. A test written
after the code, with no failing evidence, is not evidence (`heartbeat-protocol` §3.5).

## Verification list for the whole slice

Filled by `ARCH(S01)`: the suites of SPEC R19–R21 with their baseline numbers, the three-run table
shape, and the typecheck delta command.

## ADRs

One per decision that a later reader would otherwise re-derive. Recorded in `DECISIONS.md` with the
date, the question, the choice, the reason and who ruled.
