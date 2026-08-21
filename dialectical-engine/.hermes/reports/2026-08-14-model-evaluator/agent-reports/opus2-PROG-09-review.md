# opus2 self-report — PROG-09 eval-09-consumer, second independent review

Seat: second independent reviewer (Grok-substitute, per V's ruling).
Subject: `codex/eval-09-consumer`.
Reviews written:
- round 1 — `.../programming/reviews/PROG-09-opus2-review-1.md` (REWORK, @ `4f0356a`)
- round 2 — `.../programming/reviews/PROG-09-opus2-review-2.md` (**PASS**, @ `9650a00`)

**Current verdict: PASS.**

---

## Round 1 (2026-08-14/15) — REWORK @ `4f0356a`

Judged from scratch; read no other reviewer's PROG-09 output. Read the binding docs myself
(Architecture §2.3/§4/§5.3/§5.4/§7 tier-6A/§8; Requirements §7 FR-7.1, ruling 3, FR-0.6,
FR-0.7, FR-3.3, FR-9; goal packet; wayfinder issue 09), then the whole diff.

I did not trust the lane's tests. I built harnesses in my scratchpad using real embedded
PostgreSQL, a real `node:http` vLLM stub (so I capture the actual wire body, not the
in-process `PromptPacket`), the real `OpenAICompatibleProviderGateway` + `LedgerRepository` +
`assertNoOpenWriteTransaction`, real seeded product rows so the blinded-sample section was
non-empty, and the consumer model's own identity as the interpretation target.

Blockers raised:

1. **B1** — the consumer path did not use the shared blinding helper, contradicting
   Architecture §5.3 ("the same helper supplies grading-adjacent samples to the consumer
   reader") and FR-3.3 / AC1. The DTO was hand-rolled inline, duplicating the single choke
   point.
2. **B2** — the blinded-sample read path had zero coverage and the blinding proof was
   vacuous: the integration fixture seeded no observations, so `blindedSamples` was always
   `[]`; the four-way join, bucketing, 3-sample cap and opaque sample-ids had never run
   against a database. Every test also injected a `vi.fn()` gateway, so the real provider
   path was never exercised.
3. **B3** — unbounded untrusted text in a bounded call; a 200 KB `claim_text` produced a
   **203,464-byte** request body. Fields named "excerpt" never excerpted.

Non-blocking: N1 silent null-domain drop; N2 batch `state` could read REFRESHED while a job
failed; N3 §2.3's relative-cost prompt input omitted; N4 crashed attempt wedges its key;
N5 samples not point-in-time under `POST_AGGREGATE(as_of)`.

Certified strong even in round 1: SELF_ROUTING_FORBIDDEN, adversarial refusals, versioning,
bounded retries, receipt completeness, 24-way concurrency, null-run scope, isolation.

## Round 2 (2026-08-15) — PASS @ `9650a00`

Codex reworked in-session. I re-verified everything rather than reading the changelog:
**66 independent checks across three harnesses, all passing** (44 + 16 + 6), plus
`tsc --noEmit` clean and `pnpm run test` at **711/711 / 98 files** (up from 706), all run by me.

- **B1 FIXED.** Helper extracted to `packages/evaluator/src/blind-sample.ts`; both FR-4.1
  (`index.ts`) and FR-7.1 (`consumer-postgres.ts`) now call it; helper-level unit tests added
  per FR-3.3 AC1. I verified adoption *behaviourally* — the helper's new byte cap is
  observable in the consumer's wire prompt, which is only possible if the path runs through it.
- **B2 FIXED, better than I asked.** The fixture now drives the **real lane-05 harvest
  projector** to produce observations, stands up a real HTTP server + real
  `OpenAICompatibleProviderGateway`, asserts `blinded_samples` length 3 (so the join,
  bucketing and cap are exercised), and plants dedicated leak sentinels on the sample source
  artifact and asserts their absence from the wire bytes — a real no-authorship capture on a
  populated sample section.
- **B3 FIXED.** `BLIND_SAMPLE_EXCERPT_MAX_BYTES = 4096`, UTF-8-safe truncation in the shared
  helper. My exact repro went **203,464 → 7,560 bytes**, `max(task_excerpt) = 4096` exactly;
  4000 emoji truncate cleanly with no split code point.
- **N1, N2, N3, N5 all addressed** (null-domain bucket now interpreted — verified my
  orphaned cell reaches a prompt; `failures > 0 ⇒ FAILED` — verified; relative-cost deferral
  recorded in the README; `observed_at <= aggregateAsOf` filter — verified in both directions).
- **N4 open**, still non-blocking (self-heals on the next aggregate version). The
  `LIMIT`-less samples scan also remains as a scale-only concern.

I additionally reviewed the unrequested hardening rather than waving it through: the new
recursive `containsSelfRoutingField` scanner and typed `SELF_ROUTING_FORBIDDEN` code. Probed
it for false positives (legitimate output whose *values* contain "ranks"/"scoring"/"weight"
persists fine), for depth (top-level, nested-in-flag and four-deep routing keys all refused),
and for stack safety (60,000-deep adversarial nesting contained as a typed refusal, no crash,
nothing persisted). One cosmetic note only: camelCase `routingWeight` is refused by the
strict schema as `CONSUMER_CONTENT_REFUSED` rather than the more specific code.

Round-1 strong surface re-run against `9650a00` and unbroken: self-routing numeric
fingerprints identical across all hostile paths, 24-way concurrency (1 winner / 1 call / 23
typed skips / 0 throws / 0 duplicates), zero orphan STARTED receipts, null-run scope clean.

## Discipline notes

- Read-only outside my two output files across both rounds. Nothing created or modified inside
  the worktree; no commits; no board mutations. All harnesses live in the session scratchpad.
- Independence maintained: I read no other reviewer's PROG-09 output in either round.
- Self-correction logged in round 1: two of my own checks were mis-specified (a `__proto__`
  case that `JSON.parse` correctly ignores, and a batch-level `state` assertion). Neither was
  a lane defect; both were corrected and are not counted as findings.
