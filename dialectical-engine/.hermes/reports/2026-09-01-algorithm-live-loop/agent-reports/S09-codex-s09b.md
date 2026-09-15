CODEX REVIEW S09B — CHANGES · comments read through: s09b-2026-09-02
VERDICT: CHANGES — 2 blocking findings and 2 non-blocking findings (4 total). S09B follows three exhausted worker rounds: B1 and B2 are V DECISIONS PACKET rows, not a fourth round; N1 and N2 are mandatory, already-authorized report/evidence repairs.

# Scope and method

I read the dispatch packet in full first, then the heartbeat protocol and reviewer contract, J28, the S09B authorization, D24 and both addenda, D27 ADDENDUM-3, D28, D35 and its correction/addendum, D38, the prior codex r3 verdict, ticket, frozen spec, complete 902-line report, worker self-report, the three-commit S09B diff, all relevant reporter/parser consumers, and the filed S09B logs.

This was **static review only**, as dispatched. I ran no tests, builds, installs, mutation campaigns, or provider calls and made no product or Git changes. The normal reviewer-contract probe duty is therefore CANNOT-ASSESS here; every runtime result below is a static inspection of filed evidence, not my own execution.

# Findings

## B1 — J28 changed terminal reporting, but the runner's refused-next-attempt consumer still requires equality to mean HARD_STOP

V row: **V-S09-CODEX-S09B-1** — authorize a J28-consistent recovery path for a provider attempt refused at the equality boundary, plus a production-wrapper pin. There is no lawful r4.

Files: `packages/budget/src/index.ts:187-213,324-330`; `apps/runner/src/index.ts:3037-3055,3134-3142,3261-3273`; `tests/integration/t17-envelope-ledger.test.ts:508-542`; `tests/unit/budget-s09.test.ts:45-94`.

The successful-completion direction is fixed: a run that has completed with `consumed == max` now records WITHIN and keeps its answer. The opposite direction still consumes the old meaning. `assertModelAttemptAllowed` refuses a *next* provider call when the ledger is already `>= max`. The runner catches that exact `RUN_COST_ENVELOPE_EXHAUSTED`, calls `evaluateEnvelope()`, and accepts the catch only when the result is `HARD_STOP`. At equality the newly inclusive `decideBudgetPressure` returns `WITHIN_ENVELOPE`, so runner `:3264` rethrows the provider-boundary error and never calls `makeEnvelopeTerminal`.

Concrete input → wrong outcome: let the initial envelope evaluation see a full ledger (`consumed == max`) while a serve-model call remains pending—for example, the structural receipt undercounts a newly reachable site, which is exactly the drift this envelope guard exists to contain. Initial evaluation now enters the serve chain as WITHIN; the provider gateway refuses before spending the next attempt; the catch re-evaluates the unchanged equality state as WITHIN and rethrows. The run gets neither the ruled components-only envelope terminal nor an `ENVELOPE_EXHAUSTED` record. The same failure occurs when a call consumes the last available slot and a later pending call reaches the guard.

The new tests cover direct reporting at `max`/`max+1` and a successfully completed maximum path. Neither drives the runner through `RUN_COST_ENVELOPE_EXHAUSTED` at equality. Fix the consumer so a refused pending attempt is represented truthfully without reverting J28's successful-terminal WITHIN state, and assert the persisted outcome through the runner wrapper. The two equality contexts cannot continue to share a branch that has only the post-consumption count as input.

## B2-PACKET — the packet dropped r3's larger-arm requirement, and the parser still accepts a receipt selecting the smaller arm

V row: **V-S09-CODEX-S09B-2** — authorize completion of r3 B2's receipt invariant and a discriminating parser pin/mutant. There is no lawful r4.

Files: `packets/s09-codex-s09b.md:14-17,34-38`; `packages/budget/src/index.ts:73-102`; `packages/register/src/index.ts:288-309,321-337`; `tests/unit/t17-envelope.test.ts:322-355`; prior `S09-codex-r3.md`, B2.

r3 required two independent cross-field checks: the selected arm must agree with `call_sites.serve`, **and `selected` must not name the smaller arm**. The packet's verification list shortened that to selected-count agreement plus composition decomposition. The worker implemented exactly that shortened list.

Concrete input → wrong outcome:

```text
call_sites.serve = 6
serve_leg = {
  composition_sites: 7,
  composition_sites_per_round: 3,
  post_compose_sites_per_run: 1,
  synthesis_loop_sites: 6,
  selected: "SYNTHESIS_LOOP"
}
```

`selectedArm` is 6, so the count check passes. `(7 - 1) % 3` is zero, so the decomposition check passes. `parseCostEnvelopeBasis` accepts the receipt. The production constructor, however, computes `Math.max(7, 6)`, bills seven sites, and selects `COMPOSITION`; the accepted wire receipt claims the opposite topology and a smaller ceiling leg. M10 disables selected-count agreement only, while M3 mutates the constructor's `Math.max`; neither discriminates this parser hole.

Make the parser require `call_sites.serve === Math.max(composition_sites, synthesis_loop_sites)` and require `selected` to match the constructor's declared tie policy. Pin the exact smaller-selected-arm input above and mutate that parser guard. This remains blocking for the same reason r3 B2 was blocking: the high-risk persisted receipt still accepts mutually incompatible topology claims. The packet defect belongs to the orchestrator, not to the worker who followed its narrowed checklist.

## N1-PACKET/REPORT — the D28 sweep was not generated from the artifacts and left multiple false statements

Ticket to route today: **S09B-D28-REPORT** — this correction is already inside the judge-authorized S09B scope; it is mandatory, not residual.

Files: `packets/s09-codex-s09b.md:39-42`; `agent-reports/s09-envelope.md:313-317,458-464,488-492,645-656,710-733`; `tests/unit/t17-envelope.test.ts:289-310`; `logs/s09/s09b-PREEXISTING-paired-base-head.log:1-10`; prior `S09-codex-r3.md`, N1.

The packet says the five corrected sentences include a leftover r2 campaign paragraph, but the judge authorization and r3 N1 name the stale “tight cover in both worlds” claim instead. That packet drift propagated into a filing whose “generated sweep” has no generator/check output and still contains these command-refutable survivors:

1. Report `:313-315` says the pre-T9 arm is exactly **8** sites and the sum is **14**. The code and the same report derive **7** and therefore **13**.
2. Report `:491` calls `e526e5b4` the pristine base tree. The current paired log records base tree `2131932e…` and worktree overlay `a92beced…`.
3. Report `:656` says the current maximum-path run's terminal envelope state is **EXHAUSTED**. The S09B test at `t17-envelope-ledger.test.ts:523` now requires **WITHIN** under J28.
4. Report `:723,729,732` says the two new tests add 537 and 404 lines. Fresh base-to-HEAD numstat reports 548 and 442.
5. The deletion-matrix comment says “ALL ELEVEN” but immediately decomposes that as `2 + 4 + 3`; the actual schema/list has five `serve_leg` members, so the required count is `2 + 4 + 5`.

Run and file the actual D28 enumeration over every quantity/provenance/boundary claim in the active report, correct every survivor, correct the source comment, and recompute line 2's report hash. Do not hand-curate another five-item list. This is non-blocking only because the product failures are independently assessable; every false filed statement still requires repair.

## N2 — the post-D38 campaign filing does not prove marker custody or launcher refusal

Ticket to route today: **S09B-D38-EVIDENCE** — evidence repair under the already-binding D38 ruling; it is mandatory, not residual.

Files: `logs/s09/s09b-MUTANTS-t17.log:1-4,529-531`; `agent-reports/s09-envelope.md:537-557,574-627,788-799`; D38 in mission `DECISIONS.md`.

D38 requires a campaign to create a marker at start, requires any test launcher in that worktree to refuse while it exists, and removes the marker at campaign end. The filed campaign shows commit/tree, pre-campaign porcelain, per-mutant restores, final porcelain/tree, and exit 0, but it contains no marker creation, refusal discriminator, or marker removal. A fresh static search returned:

```text
CAMPAIGN_MARKER_LINES=0
```

The three S09B commits also add no durable campaign/launcher harness from which the refusal could be inspected. I therefore cannot assess D38 compliance or accept the claim that the rerun was mechanically exclusive; “the later zone was run solo” is not the marker mechanism the ruling requires. Do not edit the existing log. If these mutant results are to be admitted under D38, rerun through a durable harness and file marker absent → created, a launcher refusal while present, marker removal, and final clean-tree evidence.

# Verified without a finding

Packet provenance and the filed report hash match fresh static checks:

```text
HEAD=265581b27250094bfc3c5f12e65d1338bf3e7f0c
TREE=adbf8382e92c859d2c63cbd91f96b712b6865f78
COMMITS=7
MODE_CHANGES=0
REPORT_SHA256=3c50b13eddfdee63ea049a992087423d37a9dec48078d051f71c2b241df7ad21
S09B_LOGS=7
STALE_LOGS=0
548 0 dialectical-engine/tests/integration/t17-envelope-ledger.test.ts
442 0 dialectical-engine/tests/unit/t17-envelope.test.ts
```

The S09B delta is the last three commits and changes only the six product/test files disclosed by the commit stats. The lane was clean at review entry and after the static inspection; `git diff --check 8aa1357c..HEAD` printed nothing.

The completed-maximum direction of J28 is present. `decideBudgetPressure` uses `<=`; `assertModelAttemptAllowed` remains `>=`; the integration source requires the current progress value WITHIN, requires `result.kind === "COMPLETED"`, requires exactly one `serve.answer` row, rejects `ENVELOPE_EXHAUSTED`, and requires the chain's own DOWNGRADED terminal. The only production consumer of `decideBudgetPressure` resolves through `BudgetRepository.evaluateRunPressure` into the runner; that consumer trace produced B1 rather than another unexamined call site.

The receipt's implemented checks do reject selected-count disagreement and non-integral composition decomposition. Both shared fixtures now say serve 7 against composition 7. The deletion matrix contains eleven distinct entries: two `per_site_attempts`, four `call_sites`, and five `serve_leg` members. Its arithmetic is correct despite the stale comment.

I spot-checked M8, M9 and M10 against the fresh campaign log. Their filed result lines are, respectively:

```text
--- discriminating result --- Tests  31 failed | 67 passed (98)
VERDICT: CAUGHT (failing tests 31, pre-existing floor 2)
--- discriminating result --- Tests  4 failed | 95 passed (99)
VERDICT: CAUGHT (failing tests 4, pre-existing floor 2)
--- discriminating result --- Tests  4 failed | 95 passed (99)
VERDICT: CAUGHT (failing tests 4, pre-existing floor 2)
```

Each of those blocks has `pre=0`, `applied=1`, `restored=0`, an equal post-restore sha256, and empty porcelain. The final log records the filed tree and zero verdicts differing from expectation. Those are internally consistent D24 facts; N2 is specifically the missing D38 custody proof.

The solo unit-zone log records `7 failed | 1047 passed (1054)` and the seven failure names match the b8 unit authority. My static mutant-token search returned `ZONE_MUTANT_TOKEN_LINES=0`. The three cluster logs each record `97/99`, the same two named authority failures; the typecheck log records exit 0. I did not execute any of these gates, so I do not claim an independently reproduced green run.

# Not verified

I did not execute the maximum-path fixture, the direct budget boundary tests, the receipt parser, any campaign, typecheck, unit/cluster/zone suite, W12 ceremony, T9 post-merge topology, or a provider call. I did not verify runtime exclusivity outside the filed logs, and under N2 the filing does not make that fact assessable. V-S09-8's alternative remains open exactly as J28 records it.

# PREDICTIONS

Another lens will likely approve after following only the successful 109-attempt integration arm and miss that the runner's `RUN_COST_ENVELOPE_EXHAUSTED` catch still assumes equality means HARD_STOP; the first counterexample to try is a pending provider call with the ledger already at `max`. A receipt-focused lens may see M10 and stop at selected-count agreement; changing only `selected` and `call_sites.serve` together to the smaller six-site arm leaves the parser green. An evidence lens may accept the phrases “generated sweep” and “solo” without checking their mechanisms; artifact-generated counts expose the stale 8/14, EXHAUSTED, e526e5b4, 404/537 claims, while the campaign contains no D38 marker receipt at all.
