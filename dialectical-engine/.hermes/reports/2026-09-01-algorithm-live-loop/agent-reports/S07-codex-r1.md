CODEX REVIEW S07 r1 — CHANGES · comments read through: s07-r1-2026-09-02

# S07 T9 synthesis serve chain — Codex review r1

VERDICT: REWORK (filing r1; rework 0/3)

Finding count: 3 blocking, 0 non-blocking. Packet defects: 0.

## Review basis

Static review only, per the packet ruling. I read the packet and rulings in full before reviewing the role contract, F4/goal, T09 ticket, S07 spec, controlling decisions and prior DR-159 disposition, implementation, changed tests, worker reports, and supplied evidence logs. I did not run tests, builds, installs, provider calls, or mutation commands.

The packet reconciles: HEAD `70149af04ea311fedd5201a875e117adc9c612ba`, five-commit range `e040b1ee..HEAD`, 19 changed files, `+2624/-463`, clean packet worktree, byte-identical goal text/hash, worker-report self-hash, named log presence, RED `50 failed / 13 passed`, three supplied green runs at `63/63`, and restored M1–M9/N1 mutant hashes. These are static confirmations of the supplied artifacts, not fresh execution.

## Blocking findings

### S07-r1-B1 — J24 unresolvable/unhealthy synthesis roles are not refused at claim time and are not visibly role-marked

**Input → wrong outcome:** Give T16 a syntactically present synthesis policy whose named synthesizer or evaluator ref is not configured. The only pre-claim check verifies that the policy family exists (`apps/runner/src/index.ts:1757-1769`); the named ref is resolved only when synthesis/evaluation is eventually called (`apps/runner/src/index.ts:3207-3219`, `3412-3418`, `3478-3484`). The run therefore claims work and performs the debate/propagation path before throwing `SYNTHESIS_ROLE_PROVIDER_UNRESOLVED`, with no persisted condition mark naming the unavailable role.

A second reachable discriminator is worse: when a named role provider is configured but found absent by claim-time probing, claim processing removes it from the local healthy `configuredMakers` set (`apps/runner/src/index.ts:1858-1914`), but the late synthesis resolver looks it up in the unfiltered `this.#configuredMakers` collection (`apps/runner/src/index.ts:3211`). If another panel provider remains healthy, the run proceeds and calls the already-absent sealed role. Provider-call exhaustion is then rewritten as generic `SYNTHESIS_TRANSPORT_DEATH` (`apps/runner/src/index.ts:1239-1255`) and the serve chain converts that to `COMPONENTS_ONLY` (`packages/serve/src/index.ts:715-720`). That collapses known role unavailability into the ordinary mid-call transport crash class.

**Required outcome:** Before claim where deployment/health state permits, resolve both sealed refs by identity against the claim-eligible providers. Refuse loudly without substitution, preserve the distinction from a provider that becomes unavailable after a healthy claim, and emit the J24-visible condition naming `SYNTHESIZER` or `EVALUATOR`. Add discriminators for (1) missing family, (2) ref not configured, (3) configured ref absent at claim, and (4) genuine post-claim transport death.

**Test gap:** The architecture test titled “refuses at CLAIM TIME” proves only source order for the missing-policy-family check, then separately checks that late resolver strings exist (`tests/architecture/t09-synthesis-entrypoint.test.ts:58-77`). It never executes either named-ref failure case.

### S07-r1-B2 — Loop-round “records” and prior-candidate references are transient, not durable

**Input → wrong outcome:** Run the allowed two rounds: round 1 returns an objection and round 2 satisfies it. `ServeGateResult` returns the two structured round objects (`packages/serve/src/index.ts:484-491`, `797-799`), but `ServeRepository.persist` receives the result and writes no digest, round request, round verdict, standing objection, or round-to-candidate linkage (`packages/serve/src/index.ts:1133-1144`, `1513-1730`). After persistence/reload, the required round record cannot be reviewed as a record; only the ephemeral caller object had it.

The retry linkage is also a fabricated process-local label: `referenceCandidate` always returns `candidate:round-${round}` (`packages/serve/src/index.ts:711-714`) rather than the recorded synthesis raw-artifact reference. In production, the adapter assigns `compositionRawArtifactRef` from each response (`apps/runner/src/index.ts:3462-3469`), so a second round overwrites the first-round value; the emitted `candidate:round-1` does not itself resolve to that artifact.

**Required outcome:** Persist one ordered record per loop round, including the exact synthesizer request, candidate statement or resolvable raw-artifact reference, exact evaluator request/verdict, and standing objection/linkage. Alternatively, define and test a deterministic durable reconstruction that yields those same fields. A retry's `priorCandidateRef` must resolve to the prior recorded candidate, not merely resemble an identifier.

**Test gap:** The unit test named “persists one loop-round record” calls only `runServeGateChain` and asserts on the returned in-memory array (`tests/unit/t09-synthesis.test.ts:419-435`); it never invokes the repository or reloads an answer.

### S07-r1-B3 — The retired protected-core guard disclosure disappears at persistence

**Input → wrong outcome:** Exhaust the envelope before a served statement exists while the protected-core restatement status is `FAIL`. `createEnvelopeExhaustedResult` correctly adds `PROTECTED_CORE_GUARD_RETIRED` to the transient gate trace (`packages/serve/src/index.ts:522-567`). But the condition marks contain only the budget/envelope marks, and persistence retains only the *last* trace item in `verdict_unavailable.reason_ref` (`packages/serve/src/index.ts:1565-1570`); here that last item is `COMPONENTS_ONLY_ENVELOPE`. The full trace is not stored by the answer write (`packages/serve/src/index.ts:1513-1730`). Consequently, the durable served record no longer discloses that the observed failing R9 status belonged to a retired guard rather than a deciding gate.

**Required outcome:** Carry `PROTECTED_CORE_GUARD_RETIRED` into a durable, visible projection (full gate trace, typed disclosure/condition mark, or an equivalent sealed field) without allowing it to decide the terminal. Add an integration/repository discriminator that persists and reloads both `FAIL` and `PASS` envelope cases.

**Test gap:** The current test asserts only that the constructor's returned array contains or omits the token (`tests/unit/t09-synthesis.test.ts:620-645`); it does not cross the persistence boundary.

## Verified without a finding

- Digest construction preserves node membership through deterministic compression and selects decisive material from non-root positions and strongest objections.
- Synthesizer/evaluator requests use fresh two-message packets with the typed request as the only user payload; retry carries the prior objection verbatim.
- The loop is bounded by the sealed maximum, serves only after a satisfied verdict or bounded exhaustion, and keeps a standing-objection mark in the returned result.
- The production parser enforces the two-segment cap, while J23 widens citations to the digest-following set with exactly one load-bearing served root.
- `COMPONENTS_ONLY` construction is enumerated by the four allowed crash classes; the generic provider transport mapping itself is appropriate for genuine post-claim transport death. B1 is about misclassifying already-known role unavailability.
- Required labels/marks and the DR-176 tail ordering are present, and the live runner entry point loads and passes the sealed T16 role family.
- I found no broad assertion weakening in the reviewed integration diffs and no discrepancy in the supplied RED/green/mutant counts or restoration hashes.

## Ticket routing

Route `S07-r1-B1`, `S07-r1-B2`, and `S07-r1-B3` to the T9 worker/orchestrator as same-day blocking rework. No board edit was made because this seat was authorized to write only the two packet-named report files.

## CANNOT ASSESS

Fresh runtime behavior, database reload behavior, provider call counts, and mutant execution were not independently executed because the packet explicitly restricted this seat to static review. The supplied logs are internally consistent, but they do not contain the missing discriminators described above.

## PREDICTIONS

The next patch will likely fix B1 by resolving sealed roles against an explicit claim-eligible provider map before claiming, and B2/B3 by adding durable synthesis metadata or a reconstruction-backed read model. The most likely regression is overbroadly treating a provider that dies after a healthy claim as an unresolvable role; the next most likely is persisting round labels without making `priorCandidateRef` resolve to the actual first-round artifact.
