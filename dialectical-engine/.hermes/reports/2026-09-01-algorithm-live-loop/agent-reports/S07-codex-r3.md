CODEX REVIEW S07 r3 — CHANGES · comments read through: s07-r3-2026-09-02

# S07 T9 synthesis serve chain — Codex review r3

VERDICT: REWORK (filing r5 = rework 3/3; this is the last lawful worker rework)

Finding count: 2 blocking, 1 non-blocking. Packet defects: 1.

## Review basis

Static review only, as the packet requires. I read the packet first (RULINGS section first), then the complete packet, heartbeat contracts, r2 verdict, ticket, worker filing, prior self-report, controlling rulings, frozen T9/T16 text, the two-commit `4fbbf2e3..HEAD` rework delta, the J29 paths in the full `e040b1ee..HEAD` work, changed tests, and supplied gate/mutant evidence. I did not run tests, builds, migrations, mutation commands or provider calls.

The packet constants reconcile statically. The lane is at `1a74eb33b99c10cf30e6db6185f3e6ede58bde77`, tree `6b11124dff0594b25504ba5a288306e04ce6e113`, nine commits after `e040b1ee`, 23 changed files and `+3734/-472`; `git status --short` returned no lines and the diff summary contains no mode change. The report's line-2-excluded digest reproduced exactly:

```text
535ddde213649e54fa880cf8a1b2184d7fd4de8a340d9df449d73eda11d16dd9  -
```

The D27 ADDENDUM-3 comparator resolved the current prefix independently:

```text
TIP=1a74eb33b99c10cf30e6db6185f3e6ede58bde77
COUNT=9
```

There were no `STALE` lines. The nine supplied tip-stamped logs report cluster `63/63` three times; crypto `48/48`; zone `13 failed | 1334 passed (1347)` with the exact base failure-name set; database `1 failed | 81 passed (82)` with the same `claims, judges through the HTTP gateway, propagates, serves, and settles` failure as base; root typecheck with no reported compiler error; and only the known `layout.tsx:3 TS2882` error on each surface check. These are authenticated supplied artifacts, not fresh execution by this seat.

## Blocking findings

### S07-r3-B1 — The retained request carrier is not required by the DoD and does not prove the request as sent

**Input → wrong outcome:** Run the normal two-round synthesis loop on an encrypted run. `ServeRepository.persist` encrypts and stores the complete `SynthesizerRequest` for every round (`packages/serve/src/index.ts:1613-1625`, `1806-1825`); migration 0057 therefore adds `synthesizer_request`, ciphertext and attestation columns plus a reproduced encryption function and trigger (`migrations/0057_t09_synthesis_round.sql:55-60`, `72-214`), and the reader decrypts the duplicate (`packages/serve/src/index.ts:1963-2012`). The answer now carries a fifteenth physical content carrier even though J29 permits a transcript field only if it is genuinely required.

It is not required. The frozen T9 text asks for “fresh-context + round-2-objection recorded-request assertions” and, separately, “loop-round records” (`S07-synthesis/SPEC.md:63-69`). The existing recorder observes both role requests directly and already makes the byte-equality assertion before any repository exists (`tests/unit/t09-synthesis.test.ts:194-215`, `309-325`). For a production-boundary assertion, the HTTP provider double already receives the serialized request body (`tests/integration/database.test.ts:414-425`) and can retain that body for the assertion; the runner puts `JSON.stringify(request)` directly into the user message (`apps/runner/src/index.ts:3518-3544`). Typed round refs, ordinal, stage and satisfaction state satisfy the separate durable round-record clause.

The new database assertion is also not evidence of “the request AS SENT.” The same in-memory `round.synthesizerRequest` object feeds both the provider packet and the later database insert. Reading that duplicate back at `tests/integration/database.test.ts:4091-4095` only proves that `persist` copied the object it was handed; an adapter that altered or dropped `priorObjection` on the actual wire could still leave this assertion green. Under D35, a second copy of the same premise is not a second opinion.

The worker's narrower factual premise is correct: `ledger.raw_artifact` encrypts only `{ rawText, parseErrorDetail }` and nulls `input_hash` for encrypted runs (`packages/ledger/src/index.ts:231-258`), so the request cannot be reconstructed from those response artifacts. That establishes only that artifacts are not a request archive, not that T9 needs such an archive.

**Required outcome:** Remove the request body and its encryption-carrier machinery from `serve.synthesis_round`; keep the ownership-aware, leased reader and the durable structural/ref fields. Assert the verbatim objection at the actual provider boundary by retaining and decoding the provider double's HTTP request. If V instead elects a production request archive, it needs a new explicit purpose/retention ruling; the current conditional in J29 resolves to deletion. If the carrier is nevertheless retained, the encryption suite must also add the round row and `synthesisRequestMarker` to the persisted-row aggregation and physical data scan, which currently omit `serve.synthesis_round` (`tests/integration/s6-content-encryption-database.test.ts:5114-5141`, `5164-5176`).

### S07-r3-B2 — The durable refs prove only “some artifact in this run,” not J29's round producer

**Input → wrong outcome:** Let a run already contain an unrelated JUDGE raw artifact, then pass that artifact UUID as both `candidateRef` and `verdictRef` for synthesis round 1. The foreign keys accept it. The pre-commit proof deduplicates the two values, selects only `raw_artifact_id` and `run_id`, and accepts every selected row whose `run_id` equals `input.runId` (`packages/serve/src/index.ts:1786-1805`). The answer and round therefore commit, and a reader resolving the “candidate” or “evaluator” ref receives a judge response that neither produced the candidate nor evaluated it.

J29 requires the reference to belong to the “same run and round producer,” not merely the same run. The authoritative ledger already distinguishes the producers: the production calls write `COMPOSER:SYNTHESIZER:<stage>:<round>` and `POST_COMPOSE_R9:EVALUATOR:<round>` call-site keys (`apps/runner/src/index.ts:3524-3544`, `3596-3612`), and `ledger.ledger_entry` carries `attempt_id`, `raw_artifact_ref`, call site, actor and outcome. The implementation joins none of them.

The purported D35 oracle repeats the weakened premise. Its only semantic join is `artifact.run_id = answer.run_id` (`tests/integration/database.test.ts:4097-4120`); the negative arm exercises a foreign-run artifact, never a wrong in-run producer (`tests/integration/database.test.ts:4934-4988`). More decisively, the encryption fixture supplies the same unrelated `authorArtifactId` as both candidate and evaluator refs (`tests/integration/s6-content-encryption-database.test.ts:4561-4579`). The production algorithm always performs two fresh calls. T16 permits the two configured **provider role refs** to be identical (`S01-register/SPEC.md:28-37`); it does not make the two call artifacts identical.

**Required outcome:** Before commit, resolve each ref through the matching successful `ledger.ledger_entry` and raw artifact attempt for this run/work item and expected call site/round (synthesizer vs evaluator). Add a negative arm using a real, resolvable artifact from the correct run but the wrong call site, and make the acceptance oracle join through those producer facts. Keep DISTINCT for membership cardinality if desired, but do not treat duplicate artifact refs as proof that two fresh role calls occurred. Replace the encryption fixture's reused author artifact with artifacts/entries from the two production writer calls. Also bind or derive `synthesis_round.run_id` from its referenced answer so the ownership predicate and decryption key cannot name different runs.

## Non-blocking / packet finding

### S07-r3-N1-PACKET — The packet misstates T16 and narrows J29's producer requirement out of the checklist

**Input → wrong outcome:** A reviewer follows packet lines 45–46 and treats one artifact used for both round roles as “the identical-role-refs case T16 warns about.” T16's verbatim text says the configured `synthesizerRoleRef` and `evaluatorRoleRef` may be identical; those are provider identities, not `ledger.raw_artifact` IDs. Packet lines 38–41 also reduce J29's “same run and round producer” to `artifact.run_id = answer.run_id`. Following the packet literally therefore blesses B2's in-run wrong-producer case.

**Required outcome / ticket:** Route to the orchestrator/V decision ledger. Correct the packet annotation and D35 ADDENDUM explanation to distinguish provider-role equality, artifact identity and DISTINCT membership counting, and restore J29's round-producer check to the next packet. This is an orchestrator packet defect, not a separate reason to charge the worker beyond B2.

## Disposition of r2 findings

- **r2 B1: partially fixed, still blocking as B1 above.** The old plaintext candidate/request/verdict/objection columns are gone; the migration has UUID FKs, the conditional carrier's trigger is attached before the fail-closed `ELSE`, `CONTENT_CARRIERS` and both 15-item lists include it, and the reader uses `core.run_is_owned_by`, `withRunContentLease` and the round primary key for decryption. The remaining body is unnecessary and its read-back is not a request-as-sent oracle.
- **r2 B2: partially fixed, still blocking as B2 above.** Non-UUID/nonexistent and cross-run refs now fail, and the failure occurs inside the answer transaction so it rolls the answer back. Same-round producer identity remains unenforced and unmeasured.
- **r2 N1-PACKET: fixed.** D27 ADDENDUM-3 extracts `commit=` specifically and scopes the prefix; this seat reproduced nine current records with no stale line.
- **J24/J25/J26:** no reopened finding. The prior terminal refusal, durable disclosure and refusal-specific record shape remain outside this round's changed behavior.

## Evidence audit and limits

The final admissible set contains 15 mutants: seven in r2, four in r3, and four in r4 when the corrected standalone R4M3 transcript is used in place of the aggregate campaign's aborted OLD-token attempt. Every counted transcript contains the mutation, `pre=0`, `applied=1`, `restored=0`, a discriminator result, matching before/after SHA-256 and empty post-restore porcelain. R4M1/R4M2/R4M3 are RED and R4N1 is GREEN. The claimed earlier R4M1 survival at `f525f125` has no retained D24 transcript, so the execution of that historical attempt is CANNOT-ASSESS; the source at that commit does independently show that the crypto fixture inserted its round by hand and therefore did not execute the writer.

Fresh runtime behavior, migration execution, rollback and mutant execution remain CANNOT-ASSESS because this seat was explicitly static-only. The supplied logs authenticate what they contain; they do not substitute for a fresh reviewer run.

## Ticket routing

Route `S07-r3-B1` and `S07-r3-B2` to the T9 worker as filing r5, rework 3/3. Route `S07-r3-N1-PACKET` to the orchestrator/V decision ledger the same day. After that filing there is no lawful fourth worker rework; any new blocking verdict goes to a V DECISIONS PACKET row.

## PREDICTIONS

Another lens will likely accept the fifteenth carrier because the encryption mechanics are locally complete, missing that the carrier both exceeds J29's conditional allowance and measures the same object the writer supplied rather than the bytes sent. A second likely miss is treating `artifact.run_id = answer.run_id` as full resolvability. The first counterexample to check is a same-run JUDGE artifact used as both round refs; the first simplification to test is capturing the round-2 HTTP body in the provider double and deleting the request column without weakening either frozen DoD clause.
