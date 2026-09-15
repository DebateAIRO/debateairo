# [claude@opus-5] F-SEALEDROWS-A · both deployment seeders are dead — nothing can be seeded, so no run can start

```yaml
state:
  ticket: F-SEALEDROWS-A
  risk_tier: high            # the demonstration run cannot start; both deployments affected; a V-approved seal changes value
  status: done # MERGED into integration at d08ee928 (2026-09-05), codex r7 APPROVE / MERGEABLE: yes, 0 blocking. Both deployment seeders build; the evaluator prompt is a named export the runner SENDS and both seeders DIGEST; every wire attempt at the sealed three-attempt bound is proven to lead with it. Sealed value unchanged — no re-seed. Seven commits, 15 files, seven codex rounds, cap 3/3 + three V exceptions. Three record follow-ups → F-SEALEDROWS-L
  owner: { agent: claude, session: lane-sealedrows }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict, D15 batch]
    human_review: yes         # the conformanceContractHash value changes, and V approved the seal
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows, branch: lane/sealedrows, merge_status: merged@d08ee928, tip: a6948439 }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 4
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-r1-2026-09-03
```

Found by the lane/sealedrows seat while refuting F-S11-6's premise. **Verified independently by
the orchestrator before ticketing**, by running the extractor's own regex against the shipped
file:

```
acceptance extractor matches: 0 (requires exactly 2)
VERDICT: SEEDER THROWS SHIPPED_CONTRACT_TEXT_UNRESOLVED:conformance
Return only JSON prompts actually present in apps/runner/src/index.ts:
  • Return only JSON with a segments array of at most two {segment_id,text,node_…
  • Return only JSON {satisfied,objection,criteria} where criteria is {fairness_…
```

`acceptance/seed-register.ts:120` and `apps/runner/src/dev-deployment-register.ts:199` carry the
IDENTICAL regex — it hunts `Return only JSON {conforms,findings}` or `{pass}` and demands exactly
two matches. T9 (`c1d8e09d`, 2026-09-02) replaced the two-prompt conformance protocol with the
single combined evaluator prompt. Zero matches now. **Both `buildAcceptanceRegisterRows()` and
`buildDevelopmentRunnerRegisterRows()` throw before producing a single row.**

## Why no gate caught it

The last D15 batch, b11, measured tip `19bbb4c4` — recorded in its own header. Three lane merges
landed after it: T17B `152ed7ed`, S11 `58c4715e`, T9/T9B `7dda3cc0`. **No full-suite batch has
run since the break landed.** In b11 these very tests pass:

```
✓ acceptance/seed-register.test.ts > ACC-01 acceptance register > materializes the
  V-approved DR-133 values byte-faithfully and computes contract hashes from shipped text 7ms
```

That is an orchestrator defect, not a lane defect: I merged three lanes and did not re-measure.
Batch b12 is running at `7dda3cc0` to establish the true state.

## What the fix must decide, and why it is human_review

`conformanceContractHash` is `digest(conformanceTexts.join("\n"))`. Any repair changes that
value in BOTH deployments. It is a V-approved seal, so what the repair chooses to hash is a
product decision, not a mechanism the seat may pick under D58.

The three copies must change together — `acceptance/seed-register.ts`,
`acceptance/seed-register.test.ts`, `apps/runner/src/dev-deployment-register.ts`. Repairing one
deployment leaves the other dead.

## Refuted alongside it

F-S11-6's premise. `envelopeFormulaInputs` really does appear zero times in
`acceptance/seed-register.ts`, but the row arrives transitively at line 324 via
`...buildAcceptanceAlgorithmRegisterRows()` → `buildAlgorithmRegisterRows`. Measured through the
real reader against a stub pool: RESOLVED as shipped, and THREW with the row deleted. The count
was right; the inference from it was wrong.

## MEASURED — D15 batch b12 at the true tip

```
D15 SUITE b12 · tip 7dda3cc0 · dirty 0
Tests  48 failed | 2152 passed | 3 skipped (2203)          b11 @ 19bbb4c4: 23 failed | 2048 passed (2071)
Failed Suites 2  — acceptance/mono-panel.test.ts, acceptance/panel-multi-maker.test.ts
                   both: Error: SHIPPED_CONTRACT_TEXT_UNRESOLVED:conformance
```

Set-compared by NAME against b11, both directions: **0 vanished, 25 new.** Attribution of the 25,
each read from its own error line:

| cause | count |
|---|---|
| `*_CONTRACT_TEXT_UNRESOLVED:conformance` (this ticket) | 20 |
| T9 sealed role rows unseeded in T17 fixtures (F-T17-T9) | 2 |
| J7 startup-warning counts, same file, cause not established | 2 |
| `S3d rework4` timed out at 180000ms — known-unstable family | 1 |

Two whole test FILES failed to LOAD, so their tests never ran and are not inside the 48. The real
damage is larger than the count.

**The classification tool REFUSED**, correctly: `summary says 48 failed; parsed 47 names` — the
F-S09-6 parser gap. The set-difference above is the orchestrator's own extraction, whose 48
unique names reconcile with the 48 summary count and the 48 `×` markers. The parser still needs
fixing before any future batch verdict is trusted.

## ORCHESTRATOR PACKET DEFECT #7 — admitted 2026-09-04 (codex r5)

My r5 reviewer packet claimed the new integration test asserts "the contract hash travelling with
it is the sealed one." At `database.test.ts:4153` it compares against
`runnerSettings().conformanceContractHash`, whose fixture value is the synthetic string
`contract:conformance:test-layer` — not sha256 `2364b1b5…`. The assertion proves the runner
FORWARDS the settings field; the seeder tests prove the digest. I described one as the other.

Seven defects in this lane, one habit with two faces: **stating an outcome without checking the
contract can reach it, and relaying a claim without verifying it against the artifact.** This one
is the second face. Memory: `outcome-needs-contract-reach`.

## b12 VERDICT NOW TOOL-CONFIRMED (D60, 2026-09-05)

The classifier that refused b12 is replaced by `tools/d15-classify.py` — full-name key,
heading-scoped authority. Re-classified from the filed log without re-running:

```
b12 @ 7dda3cc0: 48 failing · NEW 25 · VANISHED 0 · suites-failed 2   (authority 23 stable + 5 unstable)
b11 @ 19bbb4c4: 23 failing · NEW 0  · VANISHED 0 · suites-failed 0   (regression: matches its original verdict)
```

The orchestrator's manual set-difference above is superseded by tool output that agrees with it
exactly. The refusal is retained as `integration-suite-b12.CLASSIFICATION.v1-refused.txt`.

## ORCHESTRATOR PACKET DEFECT #8 — admitted 2026-09-05 (codex r6)

My r6 reviewer packet said the repair assertion "checks only that the contract LEADS, per
AMENDMENT 6." At `database.test.ts:4187` the test also pinned the repair packet to exactly one
more message than the original. I described the test the seat was asked to write, not the test it
wrote — the second face of the same habit (relaying without verifying against the artifact),
one packet after admitting the seventh.

## ORCHESTRATOR PACKET DEFECT #9 — admitted 2026-09-05 (codex r7 F2-PACKET)

My r7 reviewer packet said that after B2 "nothing else about shape" was asserted. Not literally
true: the pre-existing sole-system assertion (`expect(system).toHaveLength(1)`), the outer-call
cardinality check, and the contract-hash forwarding assertion all remain — and AMENDMENT 6 had
itself told the seat not to weaken the sole-system one. I described the two DELETED pins as if
they were the only pins. Nine in one lane. Codex: not a reopened B2, not a reason to hold.

## LANE CLOSED 2026-09-05 — codex r7 on the seat's accounting (Q6), verbatim

> The central diagnosis is right. Six of the eight listed rounds contained the same category
> error: the assertion observed a narrower proxy while the prose claimed the property. […]
> Nothing decision-critical in the final proof is still a proxy.

**Identity note 2026-09-05:** this defect had already been ticketed as **W8** ("conformance scrape — BLOCKS the demo") from W4's and W5's independent discoveries on 2026-09-03. Three independent discoveries of one defect; one fix. W8 closed on this merge.

**Alias (W4-R1-N2, 2026-09-05):** this ticket also closes **F-W4-1** — the codex rollout scrape filed by lane/w4 on 2026-09-03 under that name.
