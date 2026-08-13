# Parallel-dispatch disjointness analysis — for independent Grok review

**Why this document exists.** V ruled a STANDING LAW (DR-156, 2026-08-11):

> *"first make sure that they all touch different files. then, if the answer is
> genuinely yes (use Grok for a second review), fire the parallel session.
> That's a rule by the way. if you are 100% sure they won't touch different
> files, run parallel."*

So: parallel Codex sessions are permitted ONLY when their file footprints are
genuinely disjoint, and the orchestrator's determination must be
INDEPENDENTLY REVIEWED by Grok before dispatch. This is the orchestrator's
determination. **Your job is to try to falsify it.**

This law has teeth: earlier today three concurrent `codex exec resume` calls on
one session wedged it with `Orphan function call output` errors and zero
progress. The cost of being wrong here is a wedge plus corrupted work.

## Candidate tickets (all currently `ready`)

| id | ticket |
|---|---|
| `t_35a2b742` | UI-02b — maker attribution per node (served-contract change) |
| `t_d5d1a650` | DEPTH-01 — cost the debate per depth, propose an envelope table |
| `t_4a1f8654` | HYG-01 — three verification holes |
| `t_a8ad8b2f` | POL-01 — typed refusals as 4xx |
| `t_b8750870` | XREV-01 — each node reviewed by a second model |
| `t_d02b97cb` | S15 — acceptance/launch bundle |

## The orchestrator's determination

### PROPOSED PARALLEL PAIR: UI-02b ‖ DEPTH-01

**UI-02b — WRITES (predicted):**
- `packages/contract/src/index.ts` (`NodeSchema` is `.strict()` and has no
  maker field; this is the whole reason the ticket exists)
- `packages/contract/src/client.ts` (only if a new resource is added)
- `apps/api/src/index.ts` (serve the new field)
- `packages/serve/src/index.ts` and/or the ledger read path (maker lives in
  `ledger.raw_artifact`, reachable via each node's `provenance_ref`)
- `apps/v2-ui/lib/v3/adapter.ts`, `components/DebateCanvas.tsx`,
  `components/NodeDetailDrawer.tsx`
- `tests/unit/v2ui-*.test.ts`, `tests/unit/contract.test.ts`, and probably
  `tests/architecture/*`

**DEPTH-01 — WRITES (per its own ticket body, quoted):**
> "DELIVER: the derivation + proposed table as
> `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`,
> then STOP and hand up. Do NOT seed values V has not ratified. **Only after V
> rules** do you seed the rows, update the byte-faithful expectation in
> `acceptance/seed-register.test.ts`, and unpin `runtime-policy.ts`."

So DEPTH-01's write set in this pass is **exactly one new markdown file** in a
directory nothing else touches. Everything else it does is READING
(`apps/runner/src/index.ts`, `packages/*`, `acceptance/seed-register.ts`,
`acceptance/runtime-policy.ts`) to count real call sites.

**Claim: the write sets are disjoint.** One writes code + tests; the other
writes one doc under `docs/missions/.../ratification/`.

### REJECTED for parallel, with reasons

- **HYG-01** — writes `tests/unit/v2ui-pages.test.ts`, which UI-02b will also
  write (it must add maker assertions there). **Direct collision.** It also
  touches `apps/v2-ui/lib/v3/adapter.ts` for the NUL sweep — collision again.
- **POL-01** — writes `apps/api/src/index.ts` (the error handler), which UI-02b
  also writes to serve the new field. **Direct collision.**
- **XREV-01** — declared dependent on UI-02b landing first, and touches the
  same v2-ui surfaces plus `apps/runner`. **Collision + ordering dependency.**
- **S15** — plausibly disjoint (`tools/acceptance-bundle`, `tools/orphan-audit`,
  docs), BUT: (a) UI-02b may need to update `tools/orphan-audit` rows if it
  adds surfaces, which is a real collision risk; (b) S15's own board history
  records that Codex REFUSED it once because the bundle must attest S14 as a
  completed slice while it was human-gate-pending — UI-01 is still awaiting V's
  visual gate today, so S15 may still be unable to attest honestly. **Not
  proposed.**

## What I want you to attack

1. **Is DEPTH-01's write set really one file?** Read its ticket body yourself
   (`hermes kanban --board debateai-v3 show t_d5d1a650`). If a worker following
   it would plausibly touch `acceptance/seed-register.ts`,
   `acceptance/runtime-policy.ts`, or any test, the pair is NOT safe — say so.
   Consider that a worker "computing exact cost from shipped organs" might be
   tempted to add a script or a test to do the counting.
2. **Is UI-02b's footprint wider than I predicted?** Trace what a served-contract
   change actually forces: generated types, architecture tests, the 27-row
   dependency-edge table, migrations, the orphan audit. If it reaches
   `docs/missions/.../ratification/` or `tools/` for any reason, say so.
3. **Shared non-source state.** Both sessions run in the same working tree and
   against the SAME live acceptance stack (PG 55432, shim 8791, API 8790, UI
   :3000) and the SAME kanban SQLite DB. Even with disjoint source files: can
   they collide on the database, the dev server's `.next-dev`, the register
   seed, the ports, or the board? A DB or port collision is as fatal as a file
   collision. **This is the limb I am least confident about — attack it hardest.**
4. **Anything I have not considered.**

## Verdict format

`CONCUR — safe to run UI-02b ‖ DEPTH-01 in parallel`, or
`DISSENT — <the specific collision>`, or
`CONCUR WITH CONDITIONS — <the conditions>`.

Be concrete: name files or resources, not categories. If you dissent, say
whether a DIFFERENT pair from the six would be safe instead.

"They look fine" is not useful. A specific collision, or a specific reason the
shared runtime state is safe, is.

Write to `reviews/parallel01-grok-rev1.md` and print to stdout.
