# S01-CODE self-report — public-debate-access

Date: 2026-08-29  
Seat: S01-CODE / Codex  
Ticket: `t_3d2c21e9` (source-alias redaction rework; follows `t_9e9e04ef`, `t_383216fe`, and `t_57c47f03`)  
Outcome: ready for peer review after the final redaction-correctness round, with one narrow V Row 7 factual deviation pending Architecture ratification; seven upstream control-plane blocks were separate and did not consume worker rework rounds.

## Executive finding

The product change was small: widen the public debate envelope with optional tree fields, publish a deliberately redacted tree projection, and prove that legacy answer-only ciphertext still reads without a fabricated tree. The dominant cost was not implementation. It was repeated failure of the control plane to guarantee that the ticket state, packet, worktree plan, dependency topology, and acceptance commands were the artifacts it claimed they were.

The common cause was **assertion without readback at the seat's exact path and execution context**. Several upstream repairs were announced before the repaired state had been independently read back or executed where the worker would use it. That produced seven legitimate stops and resume cycles before and during the later security rework. Exact token telemetry is unavailable, so I will not invent a number; the measurable price was seven full packet/plan/ticket revalidation passes plus repeated acceptance-command executions.

## The seven upstream defects and their price

1. **Authorization did not cover a mandatory output** (`t_cf5d0bff`). The PLAN required `pnpm run generate:contract`, but packet section 5 omitted `packages/contract/generated/**`. Price: one correct stop and one complete packet/path audit. Upgrade: statically compare every PLAN file surface and command write target against the packet allowlist before dispatch.
2. **The repaired PLAN was not copied to the assigned worktree** (`t_08356244`), and a ticket comment was mistaken for an actual state transition. Price: a second stop plus byte-comparison and database-state verification. Upgrade: content-address the dispatched PLAN and require a hash read back from the worker path; verify ticket state from the database after mutation.
3. **The dependency topology and test runner assumptions were stale** (`t_ee78455b`, `t_71699495`). A root `node_modules` symlink did not reproduce pnpm per-package workspace links, while Vitest 4.1.10 no longer supports `--reporter=basic`. Price: another stop and environment reconstruction, followed by rewriting and re-running every affected acceptance command. Upgrade: build the worktree with the same package-manager operation used in CI and execute every command, not merely parse it.
4. **The old ticket was still in `triage`**. The loop breaker behaved correctly after repeated same-kind re-blocks; implementation from triage would have violated the protocol. Price: a fourth stop and a fresh-ticket migration to `t_383216fe`. Upgrade: make dispatch consume a database transaction that both verifies and claims an allowed state, returning the resulting ticket id to the packet generator.
5. **Live `vitest | grep -q` guards stole the runner's exit status** (`t_eade6007`). Early-closing `grep -q` could also trigger EPIPE, but the deterministic defect was that a producer could print a matching summary, exit 7, and the pipeline still exit 0. Price: a fifth stop, six reproduced masked crashes, and another full acceptance-command audit. Upgrade: standardize one capture-first helper that records runner status and separately validates a positive passed-test count; prohibit direct test-runner pipelines in PLAN linting.
6. **Fixed line ranges drifted away from the code they purported to verify** (`t_83a9eb08`). The explicit-projection remedy moved the positive map-call gate outside its range, making correct code fail loudly; worse, the forbidden-field negative gate drifted onto unrelated code and passed silently. Price: a sixth stop plus a symbol-by-symbol audit of every live range. Upgrade: anchor source gates on unique symbols and mutation-test every negative assertion so it is observed failing at least once.
7. **A recursive value-provenance rule was specified with the wrong production alias in test D** (`t_3d2c21e9`). SQL/code readback shows `node.provenance_ref` and `base_score.source` are both derived from `raw_artifact_id`, while `base_score.provenance_ref` is a different `reduced_judgement_id`. The PLAN instead paired `.source` with the labeled number's sibling `.provenance_ref`, recreating the fixture-realism defect this round exists to prevent. Price: a seventh correct stop, producer/SQL tracing, V escalation after the architecture rework cap, and another RED/GREEN cycle. Upgrade: derive security fixtures from producer bindings, store those relationships as machine-readable test vectors, and require a reviewer to compare every alias fixture to its actual write/read path.

These stops did not consume additional worker rework rounds: every stop concerned an upstream dispatch or specification artifact, including the seventh stop inside an already-active peer-review round.

## What shipped

- `PublicDebateSchema` now appears after `NodeSchema`/`EdgeSchema` and gives `answer.nodes`, `answer.edges`, and `answer.tree_included` optional types. Strict outer and inner envelopes remain intact, so old snapshots parse and new unexpected keys still fail.
- The publish path includes a tree snapshot with `tree_included: true`.
- `replay_handle` is retained as a key but replaced with `REDACTED_OWNER_ONLY` in node `base_score`, nullable `final_strength`, and PRESENT edge strength numbers.
- `provenance_ref` is replaced with `REDACTED_OWNER_ONLY` at every value-provenance-sensitive site: labeled numbers, edges, nodes, and node reviews. This closes both identical-value aliases and the known `judgement:` reconstruction path.
- `source` is replaced with `REDACTED_OWNER_ONLY` for node `base_score` and nullable `final_strength`, because their producers bind those values to the same node raw-artifact provenance. PRESENT edge strength `source` stays copied because its independent producer is a `StrengthSource` enum.
- Nullable `abstention.ledger_unknown_ref` is replaced with `REDACTED_OWNER_ONLY`.
- `stranger_restatement` is projected into a fresh `{ check_status }` object, so passthrough keys cannot leak.
- `disagreement` is redacted wholesale to `null`.
- All three redactors construct full explicit projections. No source-object spread can silently forward a future field.
- List schema and routes are untouched; owner-only answer fields remain excluded.
- Generated contract artifacts were recreated by the authorized generator. They remain gitignored by repository policy.

## RED frames that pin the change

- Schema pre-fix: `pda-s01-envelope-schema.test.ts` produced 1 failed / 2 passed because strict parsing rejected the new `nodes`, `edges`, and `tree_included` keys.
- Publish omission pre-fix: `s8-publication.test.ts` produced 5 failed / 14 passed because the published answer had no tree.
- Required wholesale-spread checkpoint: with `nodes.map(node => ({...node}))` and `edges.map(edge => ({...edge}))`, C2-6 failed on a real replay marker, C2-7 failed on `secret_extra`/`owner_note`, and C2-8 failed on the open disagreement record. Each command exited 1 from an actual assertion failure before the projection/redaction implementation was installed.
- Production-shaped provenance checkpoint: against the former spread-plus-override redactors, S01-C2-9 selected three real tests and all three failed: the edge triple-alias survived, the node score pointer reconstructed the replay handle via `judgement:`, and raw node/review provenance pointers survived. With full projections restored, all three pass.
- Source-alias checkpoint: before the round-3 product edit, `source-alias-probe.mts` reported `owner_only_value_reached_via_source: true` and `SOURCE_ALIAS_LEAK`. Corrected test D then failed 1/1 with three assertions: `base_score.source`, `final_strength.source`, and serialized secret absence. After the site-specific fix it passed 1/1 and the probe reported `owner_only_value_reached_via_source: false` / `SOURCE_ALIAS_SAFE`.
- End-to-end supplied probes now report `NO_ALIAS_LEAK`, `NODE_PREFIX_SAFE`, `SOURCE_ALIAS_SAFE`, and `MUST_REDACT_CLEAN`; all four exit 0.
- C3 pre-test guarded selection: `vt=0`, `guard=1`, 20 skipped / 20; the zero-match run was correctly RED.
- C4 pre-test guarded selection: `vt=0`, `guard=1`, 20 skipped / 20; the zero-match run was correctly RED.

No failures in the final required suites are pre-existing or waived.

## Three-run cluster verdict

| Cluster | Run 1 | Run 2 | Run 3 | Worst verdict |
|---|---:|---:|---:|---|
| C1 schema/back-compat | 28/28; presence 4 passed / 24 skipped | same | same | GREEN |
| C2 publish/redaction | 25/25; presence 5 passed / 20 skipped (`vt=0 guard=0`) | same | same | GREEN |
| C3 read/HTTP regressions | 29/29; presence 2 passed / 27 skipped (`vt=0 guard=0`) | same | same | GREEN |
| C4 legacy guarded filter | 1 passed / 24 skipped (`vt=0 guard=0`) | same | same | GREEN |

All 20 individual acceptance lines were executed across the implementation and rework. The corrected C2 symbol gates observed four redactor references, zero node/edge source spreads, and no forbidden answer-envelope fields. The negative gate had already been demonstrated capable of failing via an injected forbidden field. `pnpm run generate:contract`, `pnpm run typecheck`, `npx tsc --noEmit`, and `git diff --check` passed. The public-route count stayed 11. The worktree PLAN remains byte-identical to the corrected main-tree PLAN.

I also started the repository-wide `pnpm test` as optional extra evidence. It ran for 17 minutes through deliberately long unrelated S3 statistical/PostgreSQL probes; every completed case was green, including 133 s, 318 s, and 427 s probes. I interrupted it during `S3d rework7 B4` because it was outside S01's required matrix and had not produced an aggregate. I do **not** count that interrupted run as a pass. Vitest and its embedded PostgreSQL child both exited and left no process behind.

## Refutation evidence

| Property | Catch mutant (RED) | Neighbor mutant (stayed GREEN) |
|---|---|---|
| Old snapshots parse with absent tree keys | made `nodes` required; old-shape/schema/legacy assertions failed | added an unrelated optional schema field |
| New publishes honestly label an included tree | published `tree_included: false`; exact-true assertion failed | changed the unrelated question text |
| Node and edge values survive projection | changed node claim, then edge relation; deep equality failed at each path | changed unrelated summary/question content |
| Every sensitive handle site is redacted | independently exposed base, final, edge, and ledger handle sites; targeted plus residual assertions failed | changed a non-sensitive summary field |
| Open bags cannot leak | spread `stranger_restatement`; four soft assertions failed; passed through `disagreement`; three soft assertions failed | changed common non-bag content |
| New-shape schema preserves all tree keys | transformed each parsed tree field to `undefined`; three assertions failed | optional unrelated field change passed |
| Legacy reads do not fabricate a tree | defaulted tree fields to `[]`/`false`; three absence assertions failed | changed legacy summary text and the legacy test passed |
| Read path restores and validates the stored tree | independently dropped arrays, injected invalid `tree_included`, and failed revalidation; value/schema/non-null assertions failed | changed the publish question and the round-trip tree test passed |
| Aliased or derivable provenance cannot reveal owner-only pointers | restored the actual pre-fix spread-plus-override redactors; all 3 original S01-C2-9 tests failed | changed copied `producer`; the source-specific test stayed green while the broader tree-projection test failed, showing the narrow test's boundary |
| Node score sources cannot carry node raw-artifact provenance; edge enum source stays public | independently disabled base-source redaction and final-source redaction, then enabled edge-source redaction; each mutant failed test D on its own intended assertion | changed copied `producer`; test D stayed 1/1 green and the broader projection test caught the neighbor |

Every mutant was restored; `git status --porcelain` was printed after restores. No mutant remains in the final diff.

## Constants disclosed

- Public redaction sentinel: `REDACTED_OWNER_ONLY`.
- Stable publication run id: `11111111-1111-4111-8111-111111111111`.
- Test-only handle markers: `real-replay-ptr-base-b2c1`, `real-replay-ptr-final-b2c1`, `real-replay-ptr-edge-b2c1`, `real-ledger-ptr-9f2a`.
- Test-only owner/session/user ids use the stable UUIDs beginning `4444`, `5555`, and `6666` respectively.
- Production-shaped edge alias marker: `edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK`.
- Prefix-derivability fixture: raw id `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, transformed as `judgement:<id>`.
- Raw node/review pointer markers: `node-raw-artifact-id-SHOULD-NOT-LEAK` and `review-raw-artifact-id-SHOULD-NOT-LEAK`.
- Production-shaped node/source alias marker: `raw-artifact-id-SHARED-BY-node-prov-and-score-sources`.
- Independently produced edge source marker: `EVIDENCE_VERIFIER`.
- Test-only reviewer lineage literals: `reviewer`, `review-model`, `test`, and `development:review-provider`.

## What I nearly got wrong and dead ends

- I initially assumed the PLAN lived at `docs/missions/public-debate-access/PLAN.md`; the packet's absolute path correctly points to `slices/S01/PLAN.md`. The wrong lookup was harmless but wasted a command.
- A provisional C1 `-t` filter matched an unrelated existing test while the intended file was absent. The final guarded, unfiltered C1 command avoids this vacuous pass.
- The generated directory did not exist at first, which looked like package breakage until the authorized generator established the expected artifacts.
- A test fixture initially embedded a replay marker inside `provenance_ref`, making the residual test fail even after the actual handle was redacted. The marker now exists only at its intended sensitive site.
- Vitest treats escaped `\|` in `-t` as a literal separator, not alternation. The upstream filters were corrected to real regex alternation and the four temporarily contrived literal-pipe titles were renamed to natural English; all presence arms select real tests.
- A field-name-based review looked persuasive because every fixture assigned different provenance and replay values. The production producer aliases them. Residual fixtures must preserve producer value relationships, not merely populate every field.
- The round-3 PLAN correctly classified node labeled-number `source` as sensitive but test D paired it with the wrong sibling `provenance_ref`. The actual producer relationship is node `provenance_ref` ↔ node score `source`; stopping on that mismatch avoided institutionalizing another unreal fixture. V Row 7 authorized only this factual test correction, provisionally pending Architecture ratification.
- The neighboring `producer` mutant intentionally stayed green under test D; the broader projection test failed it. This is the desired narrowness, not a missing source-alias assertion.
- Two proposed reference-identity assertions were tautological because encrypt/decrypt always creates fresh objects. They were removed; deep value equality is the real property.
- In zsh, `status` is readonly. A verification wrapper that used it failed before the test; wrappers now use `vt`, `guard`, and `verdict`.
- My optional repo-wide run was itself an efficiency dead end: `pnpm test` includes multi-minute S3 statistical probes. It cost 17 minutes without reaching an aggregate and should not be a default S01 handoff gate.

## Where the packet/PLAN remains unclear or brittle

- Packet section 6 still says `node_modules` is symlinked and warns against install, although the unblock states a real pnpm install is now the required/fixed topology.
- The packet still names `t_383216fe` and describes only four CLOSED V rulings. More importantly, the worktree V packet is 141 lines and stops before Row 7, while the main-tree copy is 202 lines and contains the binding Row 7 ruling. The user's direct V ruling and the durable main-tree row were sufficient to proceed, but dispatch should have synchronized the decision packet into the exact worktree path before resuming the seat.
- The packet says the PLAN was reworked twice and that round 4 does not exist, while the PLAN itself contains rework-round-4 / PLAN-03 and PLAN-04 history. This is understandable as architecture history versus worker rework, but the terminology invites miscounting.
- The live fixed-range gates were repaired to symbol-anchored extraction after the sixth block. Their remaining limit is structural: if publication construction stops using the anchored `PublicDebateSchema.parse({ ... });` shape, the gate must be updated alongside that intentional refactor.
- The PLAN names `LabeledNumber` in its implementation sketch, but the contract exports no such type. I used the exact structural alias `Node["base_score"]` locally rather than inventing a new contract export.
- C2-2's prose suggested reference-identity mutation detection across encryption, which is mechanically impossible in this harness. The value-preservation property is covered; identity is not and should not be claimed.
- Gitignored generated outputs cannot be reviewed via ordinary `git diff`. The corrected generator exit criterion is valid, but a durable checksum or CI artifact diff would provide stronger review evidence.

## One-prompt-machine upgrades

1. Make dispatch atomic: resolve all absolute paths, validate allowlists, install dependencies, hash packet/PLAN, claim a database-ready ticket, and emit one signed manifest.
2. Execute every acceptance command in the declared nested cwd against pre-fix and known-good fixtures. Reject absent test files, zero selected tests, unknown reporters, live runner pipelines, and unexpected exit classes.
3. Treat test selection as typed data (`file`, `pattern`, `minimumPassed`) and generate shell commands from one maintained helper instead of copying shell snippets into PLAN prose.
4. Classify expected outcomes explicitly, as the final PLAN now does: feature RED, regression GREEN, verification-only GREEN, and security no-match. Have the gate compare observed result to category.
5. Require mutation/refutation rows in the PLAN itself: property, catch mutant, neighboring mutant, restoration check. This would turn worker judgment into mechanical execution.
6. Separate fast required handoff gates from slow statistical/nightly suites. Report both, but never let a 7-minute unrelated probe become an accidental local default.
7. Persist the worker self-report before ticket handoff and verify byte identity between worktree and main-tree receipts.

Comments read through: index 3 on `t_3d2c21e9` before the final handoff.
