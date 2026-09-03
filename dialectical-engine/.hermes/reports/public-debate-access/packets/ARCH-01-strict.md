# ARCH-01 — author the `.strict()` step V just ruled · `t_a00a162e`

**V has ruled** (DECISIONS Row 9): the contract's lone `.passthrough()` becomes `.strict()`, chosen
deliberately over silent stripping and over deferral. **The decision is made — do not re-litigate
it.** Your job is to author the step that implements it correctly.

## The finding, reproduced

`packages/contract/src/index.ts:434`, inside `NodeSchema` (424), reached by `PublicDebateSchema`
through `answer.nodes`:

    stranger_restatement: z.object({ check_status: CheckStatusSchema }).passthrough(),

It is the **only** `.passthrough()` in the contract; everything else on the anonymous path is
`.strict()`. Router probe, committed at
`.hermes/reports/public-debate-access/probes/passthrough-probe.mts`:

    parse_success: true
    keys_that_survived: ["check_status","SMUGGLED_OWNER_SECRET"]
    SMUGGLED_VALUE: ledger:abc-123

That parsed envelope is what `buildPublicAnswerExport` spreads wholesale into a downloadable file.

## What to author

A new step on **S01** (its surface is `packages/contract`), with:

1. **A real RED-before-GREEN acceptance.** A test asserting an unknown key under
   `stranger_restatement` is **rejected**. It must FAIL against the current contract and PASS after
   the change — verify that yourself by running it both ways, not by reasoning. The Router's probe
   above is a starting point, not the acceptance; note it took three attempts to build a *valid*
   fixture (`way_of_knowing` enum, `LabeledNumberSchema.value`/`kind`/`producer`,
   `relevant_as_of`) — an invalid fixture "fails" for the wrong reason and proves nothing, which is
   this mission's signature defect.
2. **A blast-radius answer, measured not assumed.** Which callers parse `NodeSchema`? Does any
   producer or test currently pass an extra key under `stranger_restatement`? `.strict()` turns
   silent widening into a hard failure, so if anything *does*, it breaks. V accepted that
   trade-off knowingly, but the fleet still has to know the number.
3. **Reopening a committed slice.** S01 is committed at `4138f72` and was reviewed PASS. Say
   plainly in DECISIONS that this reopens it and why.

## Scope

`S01/PLAN.md` and `DECISIONS.md`. **No product code, no test files, no worktrees** — a coding seat
will implement. A seat is live in `.worktrees/s02-code`; do not disturb it. SPECs remain FROZEN.
Handoff opens with `SKILLS LOADED`.
