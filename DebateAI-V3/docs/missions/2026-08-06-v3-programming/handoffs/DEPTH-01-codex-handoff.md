# DEPTH-01 Codex handoff

Ticket: `t_d5d1a650`  
Worker: Codex GPT-5.6 Sol, Hermes run 62 / goal thread
`019ff494-abe2-7fd1-b3ab-cb4c1864338c`  
Assignment: first pass  
Comment cursor before handoff: `2026-08-12 09:08` local, WORKER CLAIM comment  
Git: no Git operation was performed.

## Outcome

The requested proposal is ready for the independent Opus 5 + Grok review
diamond. It recommends V ratify depths 1–4 and future-shape attempt ceilings
10/14/22/38 for both reachable effective tiers (`standard`, `high-stakes`). It
does not seed them. It gives auditable formulas for the current depth-only
shape and for PRO-01/PANEL-01 together, explicitly says depth 4 can spend 38
calls and depth 5 would spend 70, and identifies the stopping point as economic
rather than an engine limit.

The proposal also records the important qualification that the shipped
composition schema has no segment maximum. The fixed table uses the real
two-segment observed/prompt-required basis as a budget reservation; V must rule
whether that becomes an enforced segment cap or merely a lawful hard-stop
budget basis.

## Inventory

- Created
  `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`.
- Created/appended
  `docs/missions/2026-08-06-v3-programming/handoffs/DEPTH-01-progress.log`.
- Created this handoff.
- No source, register, test, runtime-policy, or database file changed.
- No `.pgdata` was deleted, replaced, or reseeded.

## Acceptance evidence

1. **Real call-site derivation:** proposal cites runner JUDGE `:347`, FAIR
   critic `:456`, COMPOSER `:748`, segment CONFORMANCE `:812`, and post-compose
   R9 `:831`, plus the `max_recompose = 2` loop in `packages/serve`.
2. **Calibration:** depth-1 maximum-success is 9; observed 8 is the exhausted
   two-composition path without R9; observed 6 is the first-composition pass.
3. **N and stopping reason:** recommends N=4; depth 4 is 38 calls with both
   blocked shapes, depth 5 is 70; no technical depth-5 prohibition was found.
4. **Blocked-ticket interaction:** tables include base, PRO-only, PANEL-only,
   and combined formulas, using current `M=2` makers and a separately counted
   FAIR critic leg. The possible V ruling that one panel root discharges that
   leg is exposed as an exact minus-one alternative, not assumed.
5. **Risk tiers:** proposes members for reachable `standard` and `high-stakes`
   tiers at every selectable depth; excludes deployment-sub-floor `casual` as
   unreachable under effective-tier escalation.
6. **Boot hazard:** explicitly requires unpinning the one-member tuple in
   `acceptance/runtime-policy.ts` in the same future seeding pass.
7. **Reseed hazard:** explicitly requires backup outside the repo or under the
   ignored `acceptance/.pgdata-backup-*/` pattern before a fresh seed.

## TDD RED → GREEN → REFACTOR

RED was observed before authoring:

```text
RED expected: DEPTH-01-envelope-proposal.md is absent
exit code: 1
```

GREEN contract/arithmetic check after authoring:

```text
GREEN arithmetic: base=9,10,11,12 combined=10,14,22,38 depth5=70
GREEN proposal contract: required call-site, boot-hazard, and reseed citations present
exit code: 0
```

REFACTOR was documentation-only: formulas were named (`serve`, `base`, `tree`,
`both`), the unbounded-segment caveat was raised beside the recommendation, and
the V decisions were consolidated into the future seeding plan. The GREEN
contract remained unchanged.

## Exact verification output

```text
$ npx tsc --noEmit
[no stdout or stderr]
exit code: 0
```

```text
$ npx vitest run --reporter=dot --silent
Test Files  60 passed (60)
Tests       418 passed (418)
Duration    18.68s
exit code: 0
```

```text
$ npx vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       34 passed (34)
Duration    5.85s
exit code: 0
```

```text
$ pnpm audit:architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
exit code: 0
```

```text
$ pnpm audit:source
{
  "blocking": []
}
exit code: 0
```

## Acknowledged deferrals

- V has not ratified `N`, any attempt ceiling, the segment-cap interpretation,
  or whether PANEL authorship discharges FAIR's separate critic leg.
- Therefore no register member, byte-faithful seed expectation,
  `runtime-policy.ts` schema, or database content changed.
- PRO-01 and PANEL-01 remain blocked implementation work; this ticket supplies
  only their cost-envelope proposal.

## Environment tail

None. The requested TypeScript, both Vitest suites, architecture audit, and
source audit all ran successfully in the current environment.

## Questions for V

For the later ratification packet (not a worker-side assumption):

1. Ratify selectable depths 1–4 and combined-shape ceilings 10/14/22/38 for
   both `standard` and `high-stakes`?
2. Is two segments an enforced maximum or only the envelope's reservation
   basis, with more verbose compositions allowed to hard-stop at the ceiling?
3. May one PANEL-01 root author satisfy FAIR-01's critic obligation (subtract
   one call at every panel depth), or must the separate critic leg remain?

---

# Rev2 rework handoff

Trigger: orchestrator comment at `2026-08-12 09:31` local, carrying Opus 5
rev1 `CHANGES REQUESTED` (3 blocking, 7 advisory) and Grok rev1 `APPROVED`.  
Rework owner: same Codex run 62 / goal thread
`019ff494-abe2-7fd1-b3ab-cb4c1864338c`.  
Comment cursor before rev2 handoff: `2026-08-12 09:32` local,
`REWORK ACKNOWLEDGED`.

## Rev2 outcome

The proposal no longer recommends or silently settles a single envelope. It
exposes the complete V-owned decision surface:

- **B1:** first-try-success ceilings versus 3× retry-tolerant ledger-attempt
  ceilings;
- **B2:** two fixed composition segments versus served-node-proportional
  conformance;
- **B3:** root-counted authored levels versus PRO/CON expansion rounds.

Both first-try and retry-tolerant 2×2 matrices cover depths 1–5. The proposal
states that V's defender wording implies the expansion-round convention but
does not choose it. It records DR-157's maximum depth 5 and depth-3 test, and
states that depth remains inert in the shipped runner: ratification enables
budget, while PRO-01 still owns behavior wiring.

All seven Opus advisories are explicit facts: maker count absent from the match
key; cross-root leg uncosted; FAIR likely scales per primary; claim-lease
growth; sampling qualification; latent memory-disclosure segment; and the
verified facts plus third hardcoded `9` in `tests/support/v2uiFixtures.ts:119`.

## Findings addressed one by one

1. **B1 closed:** the proposal cites failed/timed-out `MODEL_CALL` accounting,
   the no-outcome-filter budget fold, three-attempt organ bounds, and live
   failed-run evidence. It shows first-try and retry-tolerant numbers side by
   side, including 10 versus 30 at depth 1.
2. **B2 closed:** the model now uses `S(d)` and gives V fixed-two-segment and
   node-proportional alternatives. It names the tradeoff that fixed serve at
   rev1 depth 4 compresses 30 authored nodes into two segments and shows 38
   versus 94.
3. **B3 closed:** both conventions are defined. The fixed-serve sequences are
   10/14/22/38/70 versus 14/22/38/70/134, with all other serve/retry variants
   shown through depth 5.
4. **A1–A7 folded in:** each is a named subsection and is carried into the
   future ratification/seeding plan without choosing on V's behalf.

## Rev2 RED → GREEN

Before the revision, the focused contract check failed on the first absent
choice:

```text
REV2 RED expected: missing retry-tolerant
exit code: 1
```

After the documentation rework:

```text
REV2 GREEN arithmetic: first-try matrix and 3x retry matrix verified for depths 1..5
REV2 GREEN contract: B1/B2/B3 choices, DR-157, A1-A7, pins, backup, and no-seed statement present
exit code: 0
```

## Fresh rev2 gate output

```text
$ npx tsc --noEmit
[no stdout or stderr]
exit code: 0
```

```text
$ npx vitest run --reporter=dot --silent
Test Files  60 passed (60)
Tests       418 passed (418)
Duration    19.48s
exit code: 0
```

```text
$ npx vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       34 passed (34)
Duration    6.05s
exit code: 0
```

```text
$ pnpm audit:architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
exit code: 0
```

```text
$ pnpm audit:source
{
  "blocking": []
}
exit code: 0
```

## Rev2 scope and deferrals

- Documentation only: the proposal, progress log, and this handoff.
- No source, test, register, runtime-policy, or database file changed.
- No member was seeded; no `.pgdata` was deleted/reseeded; no Git operation ran.
- V still owns every B1/B2/B3 choice and the additive A1–A6 policy decisions.
