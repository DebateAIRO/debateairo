# PROG-09 — eval-09-consumer — second independent review (opus2, Grok-substitute seat), round 2

Reviewer: opus2 (second independent reviewer; Grok-substitute seat).
Branch: `codex/eval-09-consumer` @ `9650a00` (`fix(evaluator): harden blinded consumer samples`),
reworked in-session over round 1's `4f0356a`.
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer`.
Independence maintained: no other reviewer's PROG-09 output was read.

**VERDICT: PASS.** All three round-1 blockers are genuinely fixed, four of my five
non-blocking findings were addressed, and my entire round-1 strong surface is unbroken.

Evidence: **66 independent checks across three harnesses, all passing** (44 + 16 + 6), plus
`tsc --noEmit` clean and `pnpm run test` at **711/711 across 98 files** (up from 706 — five
new tests), all run by me on real embedded PostgreSQL with a real HTTP vLLM stub and the
real `OpenAICompatibleProviderGateway`.

---

## 1. Blocker verification

### B1 — shared blinding helper: **FIXED**

`createBlindEvaluationSample` was extracted to a new `packages/evaluator/src/blind-sample.ts`
and is now the single construction site for every blinded sample in the package:

- FR-4.1 (add-on grader) — `packages/evaluator/src/index.ts` imports and calls it;
- FR-7.1 (consumer reader) — `packages/evaluator/src/consumer-postgres.ts` imports and calls
  it inside the `samples` loop, replacing the hand-rolled `Object.freeze({...})`.

Architecture §5.3's "the same helper supplies grading-adjacent samples to the consumer
reader" now literally holds. FR-3.3 AC1 is satisfied: `tests/unit/evaluator-foundation.test.ts`
carries helper-level tests asserting `JSON.stringify(sample)` matches no
`/maker|provider|model|artifact/i` and that the byte bound holds.

I verified adoption behaviourally rather than by grep alone: the helper's new 4096-byte cap
is observable in the consumer's on-the-wire prompt (§1.3 below), which is only possible if
the consumer path actually runs through the helper. I also confirmed the helper still drops
non-approved fields (a `maker`/`provider` bearing input returns a 5-key DTO) and still
rejects blank required fields.

### B2 — blinded-sample read path coverage: **FIXED, and better than I asked for**

`tests/integration/evaluator-consumer-database.test.ts` now:

- seeds real product runs and drives them through the **real lane-05 harvest projector**
  (`EvaluatorHarvestRepository.harvestTerminalRun`) to produce the `evaluator.observation`
  rows — a real write path, not literal INSERTs;
- stands up a **real `node:http` server** and a **real `OpenAICompatibleProviderGateway`**
  (with the real `LedgerRepository` and `assertNoOpenWriteTransaction`) and captures the
  actual request bodies — replacing the `vi.fn()` gateway for the headline case;
- asserts `payload.blinded_samples` has length **3**, which exercises the four-way join, the
  `modelDomainKey` bucketing, the 3-sample cap, and the `opaque:sample-` derivation;
- plants dedicated leak sentinels (`provider:sample-source-must-not-leak`,
  `maker:sample-source-must-not-leak`) on the sample source artifact and asserts they are
  absent from the wire bytes — a real no-authorship capture on a **populated** sample section;
- asserts the persisted `blinded_sample_refs` carries three opaque refs.

This is exactly the vacuity I flagged, closed. My own harness independently confirms it: with
real seeded observations the sample section is populated, and stripping it leaves a
structural prompt containing **zero** provider/model/version/maker tokens
(`leaked=[]`), while the sample DTO exposes only the five approved fields
(`sample_id, question_excerpt, task_excerpt, grade, reasons`).

### B3 — unbounded untrusted text: **FIXED**

`BLIND_SAMPLE_EXCERPT_MAX_BYTES = 4096`, enforced by a UTF-8-safe code-point-wise truncation
inside the shared helper, so lane 06 inherits the bound too. Re-running my exact round-1
repro — a single 200 KB `core.node.claim_text` — the largest request body went from
**203,464 bytes to 7,560 bytes**, with `max(task_excerpt) = 4096` bytes exactly. I separately
verified the truncation is UTF-8 safe: 4000 emoji truncate to 4096 bytes with no replacement
character and no split code point.

---

## 2. Non-blocking findings from round 1

| # | Finding | Status |
| --- | --- | --- |
| N1 | Null-domain aggregates silently dropped | **FIXED** — `current.domainIds.add(row.domain_id)` no longer skips `null`, so a null-domain bucket job is created alongside domain jobs. Verified: my previously-orphaned `prowess.authoring-quality.v1` null-domain cell now reaches a prompt (job count 2 → 3). |
| N2 | Batch `state` could read `REFRESHED` while a job failed | **FIXED** — the rule is now `failures > 0 ? "FAILED"`. Verified directly: a batch with one refusal and two current outputs reports `{state:"FAILED", outputsCurrent:2, failures:1}`. Fails loud, consistent with repo law. |
| N3 | Architecture §2.3 lists relative-cost status as a prompt input; packet omits it | **ADDRESSED** — explicit deferral recorded in the package README ("Relative-cost cells are intentionally absent from the prompt until their upstream derivation is populated; this reader does not synthesize missing cost evidence"). That was one of the two options I named. |
| N5 | Samples query not point-in-time under `POST_AGGREGATE(as_of)` | **FIXED** — `AND ($1::timestamptz IS NULL OR observation.observed_at <= $1)` added. Verified both directions: an observation later than `aggregateAsOf` does **not** enter a point-in-time refresh, while an unfiltered `ON_DEMAND` refresh does see it. |
| N4 | Crashed attempt wedges its key (no lease/reaper) | **Open, still non-blocking.** Unchanged. Blast radius stays bounded because a new aggregate version mints a new snapshot key, which self-heals it. |

Also still open and still non-blocking: the samples query has no `LIMIT` (full scan, capped
to 3 per key in JavaScript). The correctness half of that finding was the `as_of` filter,
which is fixed; the scale half is a future concern, not a merge gate.

---

## 3. Unrequested hardening in this commit — I reviewed it too

The rework went beyond my blockers. I did not take the additions on trust.

**Typed `SELF_ROUTING_FORBIDDEN`.** `TypeError` sentinels were replaced with
`TypedDomainError`, and a new recursive `containsSelfRoutingField` scanner rejects
numeric/routing keys under the architecture-named `SELF_ROUTING_FORBIDDEN` code before the
schema parse — aligning with Architecture §2.3's "a model-supplied numeric rank/routing input
is rejected with `SELF_ROUTING_FORBIDDEN`". My round-1 self-promoting payload now produces a
`SELF_ROUTING_FORBIDDEN` receipt rather than a generic content refusal.

Because this is new code on the adversarial path, I probed it specifically:

- **No false positives.** A legitimate output whose *values* contain "ranks", "scoring",
  "weight", and "ordinal" persists normally — the scanner inspects keys, not values, and no
  key in the approved schema matches the pattern.
- **Caught at every depth.** Top-level `ordinal`, `routing_weight` nested inside an
  `adjacent_domain_flags` entry, and a `score` four levels deep in a stray object are all
  refused and never persisted.
- **Stack safety.** A 60,000-deep adversarially nested JSON body is contained — typed
  `CONSUMER_CONTENT_REFUSED`, no uncaught crash, nothing persisted.
- Minor note, not a finding: a camelCase `routingWeight` is refused by the `.strict()` schema
  as `CONSUMER_CONTENT_REFUSED` rather than `SELF_ROUTING_FORBIDDEN`, because the key regex
  uses `_` boundaries. Refused either way; only the reason code is less specific.

**Hardcoded literals removed.** `persistOutput` now threads `family` and validates the
generated artifact against `family.value.providerRef` / `family.value.maker` instead of the
previously inlined `'provider:evaluator-vllm'` / `'maker:evaluator-local-vllm'` strings. My
authorization checks still pass: a response from a non-selected model is refused with a
durable `CONSUMER_AUTHORIZATION_FAILED` receipt and persists nothing.

---

## 4. Round-1 strong surface — re-verified unbroken

Every property I certified in round 1 was re-run against `9650a00`, not assumed:

- **SELF_ROUTING_FORBIDDEN.** Numeric fingerprint of `profile_cell` / `rank_snapshot` /
  `observation` (counts + sums of `value`, `score`, `ordinal`) byte-identical across
  successful, self-promoting, and all seven malformed interpretations, with the target set to
  the consumer model's own identity.
- **Hostile/malformed output.** Non-JSON, JSON array, `null`, forged `domain_ref`, blank
  strings all refused with typed receipts and an unchanged store; SQL-ish payloads persist
  inert (`profile_cell` intact); no `Object.prototype` pollution.
- **Versioning.** Append-only, hash-keyed, prior rows byte-identical after re-interpretation,
  distinct hash per version, DB-level `UPDATE`/`DELETE` rejection on both tables, and an
  unchanged-snapshot re-run making zero model calls.
- **Bounded retries.** Exactly 2 provider attempts per refresh over real HTTP with the repair
  packet observed on the wire; refresh cap at 2 → `CONSUMER_RETRY_LIMIT_REACHED`; **zero**
  orphan `STARTED` receipts; preflight refusal receipted with no model call.
- **Concurrency.** 24 concurrent refreshes against a pool whose max is 10 → 1 winner, 1 HTTP
  call, 23 typed in-flight skips, 0 throws, 0 duplicate versions. `assertNoOpenWriteTransaction`
  armed throughout and never fired: no lock or client spans the provider call (lane-06 N5).
- **Null-run scope and isolation.** Zero non-null `run_id` on consumer ledger entries and raw
  artifacts; no product `core.*` / `scorecard.*` writes; isolation breach skips before the
  call with a typed receipt.

---

## 5. Merge-gate scorecard

| Gate item | Result |
| --- | --- |
| Self-routing tests | **PASS** — strengthened; architecture-named typed code, scanner probed at depth |
| Authorization tests | **PASS** — now family-driven rather than literal-driven |
| Blinding-of-prompt tests (captured body carries no authorship) | **PASS** — real gateway, real harvest-produced samples, planted leak sentinels, populated sample section |
| Versioned-output and refresh tests | **PASS** |
| Adversarial output tests | **PASS** — extended to the new recursive scanner |
| Differentials green | **PASS** — 711/711, 98 files, run by me |
| Typecheck | **PASS** — `tsc --noEmit` clean |
| Pin clocks / no vacuous assertions / real write paths | **PASS** — the sample path now runs through the real lane-05 harvest projector |

## 6. Carried forward (not merge-blocking)

- N4: no lease or reaper for an attempt that dies between its `STARTED` receipt and its
  terminal receipt; self-heals on the next aggregate version.
- The samples query remains an unbounded scan (`LIMIT`-less) capped in application code.

Neither is a lane-09 regression and neither touches correctness or safety. Recommend they be
carried as follow-up items rather than held against this merge.

**REVIEW VERDICT: PASS.**
