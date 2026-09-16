# [claude@opus-5] W10 · a length failure must say it was a length failure

```yaml
state:
  ticket: W10
  risk_tier: medium          # changes failure classification and two sealed cost rows; no change to any served answer
  status: done
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict]
    human_review: no
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: token-audit-2026-09-03
```

Source: `../audits/token-budget-reasoning.md`. Measured, not estimated.

## 1 · Read `finish_reason`

`finish_reason` appears nowhere in the repository. A response cut off at `max_tokens` returns
partial `content`, fails `classifyStructuredContent`, and is recorded as `PARSE_FAILED` —
indistinguishable from a model that wrote bad JSON.

**Charge:** carry `finish_reason` through `responseSchema` and classify `length` as its own
status. RED first: a fake provider returning `finish_reason: "length"` with truncated content
must be recorded as a length failure and not as a schema failure.

## 2 · Stop appending on a truncation retry

`buildSchemaRepairPacket` (`apps/runner/src/index.ts:1250`) appends a correction message and
reuses the same bound. For a length failure that makes attempt 2 strictly worse: longer input,
identical `max_tokens`, same schema to satisfy. All three attempts burn producing the same
failure, and the run reports `COMPOSITION_CONTRACT_ERROR`.

**Charge:** the outcome is that a truncation must not be retried into the identical truncation.
The seat chooses the mechanism (D58).

## 3 · The SYNTHESIZER and EVALUATOR have no bounds of their own

They borrow COMPOSER and CONFORMANCE — two organs T9 retired. Both carry `deadlineMs: 60_000`
while the JUDGE, which answers about a single node, carries `180_000`. The synthesizer reads
the whole digest and writes the served answer; the evaluator reads digest, label and candidate
and must return a reasoned objection.

**Charge:** mint sealed SYNTHESIZER and EVALUATOR cost rows. Deadline no shorter than the
judge's. Leave `tokenCeiling` at 2048 for now — item 1 makes a hit visible, and the first
approved live run reports `usage.completion_tokens` per attempt, so the ceiling gets set from
data instead of from an estimate.

## Not in scope

The digest byte budget and its `DIGEST_CANNOT_EXIST` ladder are correct and stay. The
byte-versus-token denomination mismatch is recorded in the audit as latent, not fixed here.

## 2026-09-16 continuation
Moved `queued` → `done` by RECORDS(CONT-T19). Landed by **Task 15** in two ranges:
`90610345..7ff995cd` (clusters C1–C3 and fix round 1) and `35dc4c15..c1c08bd7` (fix round 2).
`finish_reason` is carried on every recorded attempt and `length` is classified **`LENGTH_EXCEEDED`**,
never `PARSE_FAILED`; a truncation re-sends the **ORIGINAL** packet under a linearly raised bound
(2048 → 4096 → 6144) instead of the appending repair; `synthesizerCallBound` and `evaluatorCallBound` are
minted through T16's sealed-register mechanism (migration `0064`, measured as the next free number) with
`deadlineMs = max(180_000, judge)`, are REQUIRED at the type level, and are **spent at both call sites** —
round 0 had minted them and consumed them nowhere, because the packet's allowed list omitted `main.ts` and
`dev-runner-policy.ts`. The sealed envelope 106 was proved unchanged. Orchestrator's review: **ACCEPTED**
(13 files / 282 / 0 ×3; both typechecks 0; `audit:source` byte-identical; four mutants killed) — SDD
ledger :129–:132. STRENGTH: entailed.
**Round 2 exists because the FINAL GATE found a reader the sweep could not see:**
`tests/architecture/register-support-publication.test.ts:369` pinned `toHaveLength(47)` and the two new
sealed rows made it 49. A count pin carries no symbol, so neither limb of the WHO-READS-THIS-STRING law
could reach it. Fixed at `35dc4c15`; the law gained a third limb (grep the PRODUCER, then check each hit
for a size assertion).
**Ruling recorded with it (D73 ADDENDUM 1, V row):** a truncation before a parseable body is a LENGTH
failure and retries under a raised bound; a non-length strict-schema failure still throws at
`responseSchema.parse` (the D71 boundary is kept). **Cost consequence for V:** a truncating call's worst
case becomes 12 288 tokens instead of 6 144.
**Class members NOT fixed here, each now its own ticket with its seal named:** `T-W10-A` (judgement),
`T-W10-B` (the consumer provider path), `T-W10-C` (stale "fifteen" prose), `T-W10-D` (the source-purity
regex). Member C (`apps/api/src/support/model.ts`) WAS fixed, at `af895e4a`.

**Record note from RECORDS(CONT-T19), left deliberately rather than worked around.** Appending the
history above makes `bash tools/board-lint.sh` report:
`W10-call-budget-truthfulness.md: floor trigger present but risk_tier=medium (must be high)`.
**The lint is right about the substance and the ticket was mis-tiered from the start.** W10's own tier
comment reads *"changes failure classification and two sealed cost rows"* — the floor rule's pattern
matches `sealed row`, not `sealed cost rows`, so the wording missed the trigger by one word while the
work squarely met it: W10 landed a migration and two sealed register rows.
Two things follow, and neither is this seat's to do. (1) `risk_tier` is **outside** the RECORDS(CONT-T19)
write contract, which permits only the `status:` line and this appended comment — so the one-word
correction to `high` is left to the board's owner. (2) The lint itself has a defect worth its own look:
`tools/board-lint.sh:30-33` greps the WHOLE FILE, history included, and applies a **pre-work** risk gate
to a ticket that is already `done`. Rewording this comment to dodge the pattern would have been the
`F-W10-D-PURITY-REGEX` antipattern — clearing a row by reshaping the text — so it was not done.
