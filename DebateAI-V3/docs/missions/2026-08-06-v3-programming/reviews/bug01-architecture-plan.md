# BUG-01 — Architecture plan: the schema-failure retry seam

**Fired under DR-171** (architecture-consult law, 2026-08-13). Author: Opus 5
ARCHITECT seat. **Status: awaiting Grok authorization.** This plan writes no
product code and binds nothing until an independent Grok lens authorizes it;
only an authorized plan re-enters the coding loop as ticket scope.

Scope of the read: `docs/architecture/03-module-design.md` (§3.1 edge table,
§5.3 Seam C, §7.1–7.2, §10), `docs/architecture/05-register-skeleton.md`
(§5.1 row 9, §5.3), `docs/architecture/10-row-contracts.md` (§6.7 WEIGH),
`design-patterns.md` (P4, P10, P11, P12, P15, anti-pattern register),
`decisions-ledger.md` (DR-115, DR-121, DR-159, DR-161, DR-162-A, DR-171,
AC-76/DR-039 usages), and the live code named inline below.

---

## 1. The incident

Run `50802f65-c4f2-4a85-a150-9c4c6e867919`, 2026-08-13. The acceptance
ceremony's depth-1 debate terminal-failed with
`ACCEPTANCE_EXECUTION_FAILED:JUDGE_SCHEMA_FAILURE`, tearing down the standing
stack.

| Fact | Value |
|---|---|
| call site | `JUDGE:critic:root0:r1:p0` (the FAIR-01 critic leg, `apps/runner/src/index.ts:833`) |
| model / relay | `claude-opus-5` via the claude relay (`acceptance/claude-relay.ts`) |
| transport | HTTP **200**, artifact metadata `{"status":200,"attempt":1}` |
| artifact | persisted, `parse_status = SCHEMA_FAILED` |
| parse_error | `unrecognized_keys ["notes_absent"]` at path `["evidence"]` |
| envelope | `max_model_attempts = 42` at depth 1, `envelope_state = WITHIN`, consumption far below ceiling |
| attempts made | **1** |

The judge returned an otherwise complete judgement JSON and added **one extra
key inside `evidence`**. `judgeArtifactSchema` is `.strict()`
(`packages/judgement/src/index.ts:18-27`), the prompt itself says *"no
additional keys"* (`:105`), and the run died.

**The defect in one sentence.** The gateway already knows the artifact is
unusable — it computes that classification, writes it to the raw artifact, and
then hands the unusable content back to the caller anyway
(`packages/providers/src/index.ts:185-244`), where
`packages/judgement/src/index.ts:136` throws on the first occurrence. Retry
exists nowhere on the content-rejection path, in a run whose whole envelope
was explicitly built to absorb failed attempts.

**Why this is an architecture blocker and not a coding-loop fix (DR-171).**
The repair touches Seam C (the one interface every model call crosses), the
`providers → judgement` dependency edge, the ledger's attempt/outcome
vocabulary, and the DR-159 envelope arithmetic. Any of those improvised inside
the coding loop is a quiet architecture amendment.

---

## 2. What the architecture already says about this

The load-bearing citation is not ambiguous:

> `CallBound` is Plan.md's disposition of *"one bounded model call"* … supplied
> by register rows whose values are V's at DR-023. **Every attempt, including
> schema-failure retries, is a ledger row.**
> — `docs/architecture/03-module-design.md` §7.1 (line 899)

Schema-failure retries are a **designed-in property of the gateway's bounded
attempt loop**. They are named at Seam C, priced by `CallBound.maxAttempts`,
and recorded one ledger row per attempt. The architecture did not omit this
behaviour; the implementation omitted it. This plan is therefore a
**conformance repair, not an amendment** — which is the cheapest kind of plan
for Grok to authorize, and the claim Grok should attack first.

Second citation, from the same document's failure-typing table:

> Unparseable model output — the raw artifact is persisted **anyway**, with
> parse status and error; **parse failure and schema failure stay
> distinguishable** (AC-13, AC-92).
> — §10, line 1139

The distinction exists precisely so a caller can act differently on the two.
Today nothing acts on either.

Third, the ruled precedent for bounded regeneration followed by a typed loud
stop already exists in the register:

> `splitIterationLimit` — **2 regeneration rounds (3 attempts)**, then a typed
> *"not runnable"* abstention carrying the rejection evidence.
> — `05-register-skeleton.md` §5.1 row 9 (DR-020 knob 5)

V has already ruled this exact shape for another organ: retry a bounded number
of times, then fail loudly carrying the evidence. This plan proposes the same
shape, which means it invents no policy.

### Constraints this plan is bound by

| Constraint | Source | Binding effect here |
|---|---|---|
| **DR-115** no scaffolded data; typed loud failure over defaults | decisions-ledger:175; design-patterns anti-pattern register | after N rejections the run **still fails loudly**; no fabricated, defaulted or salvaged judgement, ever |
| **AC-76 / DR-039** no invented numbers | `04-api-contract.md:59`; `00-overview.md:755`; decisions-ledger:699, 808 | the retry bound may not be a source literal; an unruled value is a register row put to V |
| **DR-121** no Docker family | decisions-ledger:311, 547 | nothing in this plan needs a container; the acceptance stack stays as it is |
| **DR-162-A** the algorithm is N-generic | decisions-ledger:1011 | the fix may not be special-cased to a maker, a relay, or the call site that failed |
| **Edge table rows 1–27** | 03 §3.1 | `providers` may import `kernel`, `register`, `ledger`; `judgement` may import `providers`. No new edge is needed or created |
| **P4 / Seam C** one gateway, artifact persisted unconditionally, ledger row per attempt, writes outside any write txn | design-patterns P4; 03 §5.3, §7.2 | the retry loop stays inside the one gateway; the two writes keep their current shape |
| **P10** append-only ledger, named hashes each hashing one thing | design-patterns P10; ADR-0006 | `input_hash` must be recomputed per attempt if the packet changes |
| **P12** unknown member ⇒ loud typed failure, never coercion | design-patterns P12 | forbids the tolerate-and-strip option as a silent path |
| **§10** every caught failure typed and ledgered; the interface never parses prose to learn a fact | 03 §10 | the gateway's exhaustion must be a **typed carrier with structured fields**, never a message the caller string-sniffs |
| **DR-159 (B1-B)** retry-tolerant ceilings, failed/timed-out attempts charged to the envelope, 3 attempts per call site | decisions-ledger:922 | retries are already priced; the ceiling is a LIMIT, not a spend |

---

## 3. The chosen seam

### 3.1 Where retry belongs: `packages/providers` — the gateway's existing attempt loop

**Ruling:** the retry-on-content-rejection decision belongs inside
`OpenAICompatibleProviderGateway.call`'s existing `for` loop
(`packages/providers/src/index.ts:156-263`), driven by the caller's already-
declared acceptance predicate (`ProviderCallRequest.classifyContent`, `:31-34`).

Five reasons, in the order Grok should test them:

1. **The architecture names it there.** 03 §7.1: schema-failure retries are
   attempts under `CallBound`. `CallBound` is the gateway's parameter and
   nobody else's.
2. **No new information crosses a boundary.** The gateway *already* calls
   `classifyContent`, *already* receives `SCHEMA_FAILED` + the parse error, and
   *already* writes both to `raw_artifact` (`:189-218`). Every input the retry
   decision needs is present at that line today. Moving the decision anywhere
   else means re-deriving facts the seam already holds.
3. **Ownership (DDD, 03 §4).** `judgement` owns the WEIGH invariants of
   context 4 (10-row-contracts §6.7) — what a judgement *is*, how τ reduces,
   which judgement is selected. It does not own model-call attempt policy;
   that is Seam C's, and the attempt budget is `budget`'s. Putting a retry loop
   in `judgement` puts a provider concern inside an appraisal context.
4. **Budget correctness.** `createPostgresProviderGateway`
   (`apps/runner/src/index.ts:1418-1449`) already derives the per-call-site
   remaining budget from the ledger and passes `remaining` into the loop. A
   retry *inside* the loop consumes that budget by construction. A retry
   *outside* it (a second `Judge.judge()` call) re-enters the wrapper, which
   re-reads the ledger — surviving, but only by accident, and it multiplies the
   loop by an outer loop nobody priced.
5. **N-genericity (DR-162-A).** There are exactly six gateway call sites —
   `packages/judgement/src/index.ts:92` and `:169`, and
   `apps/runner/src/index.ts:1135`, `:1191`, `:1210` — spanning eight call-site
   key families (`JUDGE`, `JUDGE:root:secondary`,
   `JUDGE:${role}:root*:r*:p*`, `JUDGE:cross-root:*`, `JUDGE:review:*`,
   `COMPOSER:*`, `CONFORMANCE:*`, `POST_COMPOSE_R9:*`). All six have the same
   defect. One seam fixes all eight families for every maker and every organ;
   a fix in `judgement` fixes five of eight and leaves the composer path
   (`apps/runner/src/index.ts:199-205`, which throws
   `COMPOSITION_CONTRACT_ERROR` on first sight) exactly as broken.

### 3.2 Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| **Retry inside `Judge.judge()`** (loop around `this.provider.call`) | violates 3.3 and 3.5 above; produces a loop-inside-a-loop whose worst case is `outer × maxAttempts` and which no ratified number prices; leaves composer/conformance unfixed; puts provider policy in context 4 |
| **Retry in `apps/runner`** (the orchestration shell) | the runner is a shell that already re-enters the gateway wrapper per call; a retry here re-does the whole judgement leg (classification, prompt build) to fix a provider-level rejection, and each organ would need its own copy — AC-85's "no behaviour in two places" |
| **Retry in Hatchet / engine redelivery** | P11 law 9 — engine retries consume the same attempt budget and are register values; but redelivery re-runs the *whole work item*, and `findExhaustedModelAttempt` (`packages/ledger/src/index.ts:470`) would correctly terminal-fail it on redelivery. Engine retry is not a content-repair mechanism. DR-121 also has Hatchet deferred |
| **A new "repair" module / service** | a new module with a new edge, for behaviour the existing seam already computes. P1: an absent edge is a prohibition; adding one to avoid using an existing seam is the wrong direction |

### 3.3 The mechanism, precisely

**A. Acceptance is declared, never inferred.** The retry fires **only** when
the caller supplied `classifyContent` and it returns `PARSE_FAILED` or
`SCHEMA_FAILED`. Callers that declare no predicate keep byte-identical
behaviour — the fallback `contentParseStatus` (`:131-138`) classifies the
artifact for the record only and must **never** trigger a retry, or every
plain-text caller silently starts spending three attempts. This is the single
most important guard rail in the design and it gets its own test.

**B. A rejected attempt is a failed attempt.** In the loop, after the raw
artifact is persisted and the transport checks pass, if the declared predicate
rejected the content: append the `MODEL_CALL` ledger row with
`outcome = 'FAILED'` and `raw_artifact_ref` set to the rejected artifact, then
`continue` to the next attempt. `FAILED` is an existing member of
`LEDGER_OUTCOMES` (`packages/kernel/src/index.ts:185`) and of the DDL CHECK
(`migrations/0000_s00.sql:164`). **No new vocabulary member, no migration, no
contract change, no UI change.**

*This also repairs a latent honesty defect:* today a schema-rejected attempt
writes `outcome = 'OK'` (`packages/providers/src/index.ts:221-235`) — the
ledger asserts the call succeeded while the artifact was unusable. The
artifact's `parse_status` says otherwise. The two records disagree today.

**C. Repair is contracted, not improvised.** For attempts ≥ 2 the caller may
supply a **repair packet builder** declared beside `classifyContent`:

```
readonly buildRepairPacket?: (rejected: {
  readonly rawText: string;
  readonly parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED";
  readonly parseError: string;
}) => PromptPacket;
```

Three laws bind it:

1. **The repair template is part of the pinned contract.** `contract_hash`
   freezes identity/rubric/prompt/schema (AC-10, 03 §7.1). The repair turn's
   wording therefore lives in the organ's own contract text and bumps the
   organ contract hash **once, at ship time** — not per attempt. `contract_hash`
   is identical across all attempts of one call.
2. **The only interpolated variable is the machine-produced parse error.** The
   repair turn quotes the schema violation back and re-states the schema. It
   may **never** suggest a value, a score, or a completion. Suggesting content
   is leading the judge toward a fabricated answer — DR-115's exact prohibition
   reached by a new route.
3. **The gateway may not invent a repair turn.** With no builder declared, the
   retry re-sends the identical packet. The gateway never authors prompt text.

**D. `input_hash` becomes per-attempt.** `inputHash` is currently hoisted out
of the loop (`packages/providers/src/index.ts:152`). A repair packet differs
from the base packet, so the hash must be computed **inside** the loop from
that attempt's packet. Leaving the hoist would make two ledger rows with
different inputs claim one `input_hash` — P10's "named hash columns each hash
one thing", broken.

**E. Exhaustion is a typed carrier, not a string.** Replace
`throw new Error("PROVIDER_CALL_FAILED")` (`:264` — an untyped throw, already
contrary to 03 §10) with a typed error exported from `packages/providers`,
extending `TypedDomainError` and carrying structured fields:

```
code: "PROVIDER_CALL_FAILED"          // transport exhaustion (unchanged meaning)
code: "PROVIDER_CONTENT_UNACCEPTED"   // every attempt produced content the caller rejected
fields: { attempts, lastParseStatus, lastParseError, lastRawArtifactRef, lastLedgerEntryRef }
```

Callers branch on `instanceof` + `code` — a type check, never prose parsing
(03 §10; the anti-pattern register's "string-sniffed errors"). Home: it is
defined in `providers`, which `judgement` already imports (edge row 11).
`kernel` is the alternative home and is **not** recommended: the failure
belongs to the seam, and kernel's job is the ruled vocabularies.

**F. The terminal outcome is unchanged.** `Judge.judge` catches
`PROVIDER_CONTENT_UNACCEPTED` and throws
`TypedDomainError("JUDGE_SCHEMA_FAILURE", lastParseError)` exactly as today —
so the acceptance reason string stays
`ACCEPTANCE_EXECUTION_FAILED:JUDGE_SCHEMA_FAILURE`
(`acceptance/main.ts:71-75`), the same typed code, now carrying the **last**
attempt's parse error and reached only after the bound is spent. `Judge.review`
does the same with `NODE_REVIEW_SCHEMA_FAILURE`. Nothing downstream learns a
new word.

### 3.4 File-level touch list

| File | Change | Notes |
|---|---|---|
| `packages/providers/src/index.ts` | the seam: honour the declared predicate inside the loop (`:185-244`); ledger `FAILED` + `continue` on rejection; per-attempt `inputHash` (move `:152`); optional `buildRepairPacket` on `ProviderCallRequest` (beside `:31-34`); typed exhaustion carrier replacing `:264` | the only file where behaviour changes |
| `packages/judgement/src/index.ts` | declare `buildRepairPacket` for `judge` (`:92-133`) and `review` (`:169-202`); translate the typed carrier at `:135-136` and `:204-205` into the **same** typed codes | no change to what a judgement is |
| `packages/judgement/src/index.ts:25` | tighten `claim_type: z.unknown().optional()` → `z.enum(CLAIM_TYPES).optional()` | folds the second, non-retryable throw path (`:143-145`, a bogus `claim_type` caught **after** the gateway returned) into the retryable predicate. Same typed code, now repairable |
| `apps/runner/src/index.ts` | declare predicates (and repair builders) at the composer (`:1135`), conformance (`:1191`) and R9 (`:1210`) call sites; `parseContent` (`:199-205`) becomes the predicate body rather than a post-return throw | the DR-162-A limb: makes the fix organ-generic, and makes composer/conformance artifacts record honest `SCHEMA_FAILED` status for the first time |
| `tests/unit/provider.test.ts`, `tests/unit/judgement.test.ts`, `tests/unit/judgement-s04.test.ts`, `tests/integration/database.test.ts` | the obligations in §7 | enforced suite is `tests/**/*.test.ts` (`vitest.config.ts`) |

**Not touched:** `packages/kernel` (no vocabulary member added),
`packages/budget`, `packages/ledger`, `packages/contract`, `web/`,
`migrations/` (**no DDL migration**), `register.bootstrap.json`, and the
DR-159 numbers.

---

## 4. Attempt and envelope accounting

**The accounting already works and needs no new code.** This is the second
claim Grok should attack, so here is the proof chain:

| Counter | Query | Outcome filter? |
|---|---|---|
| run envelope consumption | `BudgetRepository.countRunModelAttempts`, `packages/budget/src/index.ts:246-253` | **none** — every `MODEL_CALL` row counts |
| pre-call envelope guard | `assertModelAttemptAllowed`, `packages/budget/src/index.ts:265-273` | reads the same count against the pinned basis |
| per-call-site remaining | `LedgerRepository.countModelAttempts`, `packages/ledger/src/index.ts:501-515`, consumed at `apps/runner/src/index.ts:1433-1446` | **none** |
| redelivery exhaustion check | `findExhaustedModelAttempt`, `packages/ledger/src/index.ts:470-499` | **none** — groups by `call_site_key`, `HAVING count(*) >= maxAttempts` |

Every attempt — accepted, transport-failed, timed out, or content-rejected —
is one `ledger_entry` row with `action_kind = 'MODEL_CALL'`, and all four
counters are outcome-blind. This is exactly DR-159 clause 3's ruling
(*"failed and timed-out model calls are charged to the envelope"*). A
schema-rejected attempt already writes its row today, so **envelope
consumption for the failing scenario does not change at all**; what changes is
that the loop continues, and each further attempt writes its own row and is
charged the same way.

**Distinct ledger recording of each attempt** (nothing to add):

- `attempt_id` — fresh `randomUUID()` per iteration (`providers:157`);
- `raw_artifact` — one row per attempt, with `parse_status` and `parse_error`
  (`migrations/0004_s04.sql:12-21` already CHECKs that a `SCHEMA_FAILED`
  artifact carries a non-blank `parse_error`);
- `metadata_json` — already carries `{status, attempt}` (`providers:212`);
- `ledger_entry` — one row per attempt, ordered by the dedicated sequence
  allocator (`at_seq`/`sequence`, P10), same `call_site_key`, same
  `contract_hash`, **different `input_hash` when a repair packet was used**;
- reconstruction key: `(run_id, subject_item_id, contract_hash, call_site_key)`
  ordered by `sequence` gives the attempt chain for any call site.

**Worst case is unchanged.** Per call site the ceiling was and remains
`CallBound.maxAttempts` (3 in the acceptance register row,
`acceptance/seed-register.ts:165-167`). Content rejections consume the **same**
three that transport failures could already have consumed; they do not add a
multiplier. The composer's `maxRecompose = 2` loop is a different loop at a
different `call_site_key` (`COMPOSER:${attempt}`) and is unaffected — its
worst case (3 compose attempts × 3 gateway attempts) is what today's code
already permits for transport failures.

**Two downstream consumers of `outcome` are affected by the OK→FAILED
relabel** and must be named in the ticket:

1. `packages/battery/src/terminal.ts:1032-1035` — DR-139's terminal evaluator
   counts `MODEL_CALL … AND outcome = 'OK'` per call-site family as evidence
   an owed check executed. After the fix a rejected attempt no longer counts
   as an executed judge/composer/conformance call. This is **more** honest and
   is the desired direction (DR-139(4)); it needs a test, not a redesign.
2. `packages/ledger/src/index.ts:452-468` `findSuccessfulCommandArtifact`
   filters `outcome IN ('OK','BLOCKED')` but on `action_kind = 'SERVE'` — it
   never sees `MODEL_CALL` rows. **Unaffected.** Verified, not assumed.

---

## 5. The retry bound

**Recommendation: invent no number. The bound is the existing, already-ratified
`CallBound.maxAttempts`.**

- 03 §7.1 places schema-failure retries under `CallBound` by name.
- DR-159 clause 3 ratified *"each call site independently permits 3
  attempts"*, with no restriction to transport failures, and priced the
  ceilings on that basis (42 / 66 / 114 / 210 / 402).
- The value is already a register row, already resolved through the register
  loader, and already applied per call site:
  `acceptanceOrganCostBounds.organs.{JUDGE,COMPOSER,CONFORMANCE}.maxAttempts`
  (`acceptance/seed-register.ts:161-171`, schema at
  `acceptance/runtime-policy.ts:18-38`, consumed at `acceptance/main.ts:198-200`).
- Under AC-76/DR-039, **re-using a ratified number is not inventing one**. No
  new literal appears anywhere in this plan.

**What is genuinely V's, and therefore a packet row rather than my decision:**
whether one shared per-call-site bound may be spent on content rejections, or
whether V wants a *separate* schema-repair sub-bound (e.g. "at most 1 of the 3
attempts may be a content repair"). That would be a **new number with no ruled
basis** — it must arrive as a register row with value `— none stated`, never a
literal. See VROW-1 and VROW-3.

**One pre-existing register defect this plan inherits and must not deepen.**
DR-159 recorded ratification risk A-2: *"the 3× attempt bound comes from env
vars (`apps/runner/src/main.ts:26-28`) invisible to the envelope row."* That is
still true on the Hatchet runner path — `JUDGE_MAX_ATTEMPTS` and friends are
`process.env` reads, which the anti-pattern register forbids outside the
register loader. The acceptance path is already clean (register-sourced). This
plan **does not fix A-2** (it belongs to the envelope-seeding ticket) but it
does make the bound load-bearing for a second failure class, which raises A-2's
severity. Named here so the authorizer sees it; recorded as an adjacent
finding in §10.

---

## 6. The strictness question

The judge tried to annotate that evidence notes were **absent** and was killed
for it. That is not a malfunctioning model; it is a model reaching for an
honesty the schema has no slot for. Three dispositions were weighed.

| Option | What it does | Assessment |
|---|---|---|
| **A. Keep `.strict()` + bounded repair retry** *(recommended)* | schema unchanged; a violating artifact is persisted with its error, quoted back to the model, retried within the ruled bound, and after exhaustion the run fails loudly with the last error | consistent with P12 (unknown member ⇒ loud typed failure, never coercion), P3 (parse, don't validate), DR-115, and the ruled `splitIterationLimit` shape. **Loses no information**: AC-13 persists the rejected artifact's full `raw_text`, so what the model tried to say survives in the ledger forever |
| **B. Tolerate-and-strip unknown keys** (`.strip()`) | zod silently drops `notes_absent`; the judgement proceeds | **Rejected.** It is coercion at exactly the boundary P12 forbids it. The dropped key is discarded silently, so contract drift becomes invisible — a judge quietly emitting extra keys forever is never surfaced. Against DR-115's culture: not fabrication, but the same family — the system would present a judgement as conforming when it did not conform |
| **C. Widen the schema** to admit an evidence-notes / evidence-absence field | the judgement contract gains a place to say "no evidence here" | **Not mine to decide.** It changes what a judgement *is*, changes `contract_hash`, potentially reaches the reducer and the served surface. It is a value/contract question — VROW-2 |

**Recommendation: A.** Ship A now; C stays open for V independently of this
ticket, because A is correct whether or not C ever lands (a repair loop is
needed for every other schema violation regardless of what the schema says).

**The honest finding underneath, which V should see** (VROW-2): the judge's
`evidence` object is `{quality: number, relevance: number}` only
(`packages/judgement/src/s04.ts:95`). A judge with no evidence in front of it
has no way to say so and must emit two numbers anyway. Under DR-115's culture
that is a real pressure toward a fabricated number, and this incident is the
first observed instance of a model pushing back against it. Naming it is the
architect's job; ruling it is V's.

---

## 7. Test obligations (mutation-proof, P1)

Every assertion below names the mutation it kills. The enforced suite is
`tests/**/*.test.ts` (`vitest.config.ts`); the handoff must paste `vitest list`
showing collection (P2).

**`tests/unit/provider.test.ts`** (extends the existing `FX-HR-H1` describe)

| # | Assertion | Mutation it kills |
|---:|---|---|
| T1 | predicate rejects attempt 1, accepts attempt 2, `maxAttempts: 2` ⇒ call resolves with attempt 2's content; **two** raw artifacts (`SCHEMA_FAILED`+`parse_error`, then `PARSED`); **two** ledger rows (`FAILED`, then `OK`) | deleting the `continue` (i.e. today's behaviour: return the rejected content) |
| T2 | the rejected attempt's ledger row carries `outcome = 'FAILED'` **and** a non-null `raw_artifact_ref` | labelling the rejected attempt `OK` (today's bug); or dropping the artifact link, orphaning the evidence |
| T3 | every attempt rejected ⇒ throws the typed carrier with `code = 'PROVIDER_CONTENT_UNACCEPTED'`, `attempts === bound.maxAttempts`, and `lastParseError` equal to the **last** attempt's error | throwing a bare `Error`; throwing after one attempt; carrying the **first** error instead of the last |
| T4 | **no** `classifyContent` supplied + non-JSON content ⇒ exactly **one** attempt, one ledger row, byte-identical to today | treating the `contentParseStatus` fallback's `UNPARSED` as a rejection — the mutation that would silently triple every plain-text caller's spend |
| T5 | with a repair builder: attempt 2's ledger `input_hash` **differs** from attempt 1's, and `contract_hash` is **identical** across both | leaving `inputHash` hoisted at `:152` (P10 breach); varying `contract_hash` per attempt (AC-10 breach) |
| T6 | without a repair builder: attempt 2's packet and `input_hash` are **identical** to attempt 1's | the gateway authoring its own repair prompt text (DR-115 / AC-10 breach) |

**`tests/unit/judgement.test.ts` / `judgement-s04.test.ts`**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T7 | **the regression vector**: a judge artifact identical to the incident's — complete, plus `notes_absent` inside `evidence` — is classified `SCHEMA_FAILED` by the declared predicate | switching `judgeArtifactSchema` from `.strict()` to `.strip()`/`.passthrough()` (option B smuggled in): the test asserts **rejection**, so tolerate-and-strip fails it |
| T8 | gateway exhaustion ⇒ `TypedDomainError` with code exactly `JUDGE_SCHEMA_FAILURE`, message containing the **last** parse error | swallowing into a defaulted/salvaged judgement (DR-115); renaming the typed code (would break `ACCEPTANCE_EXECUTION_FAILED:JUDGE_SCHEMA_FAILURE` continuity); reporting the first error |
| T9 | same for `Judge.review` ⇒ `NODE_REVIEW_SCHEMA_FAILURE` | fixing only the judge leg and leaving XREV's review leg on the old path |
| T10 | `claim_type: "bogus"` is a **schema rejection** (retryable), not a post-return throw | reverting `z.enum(CLAIM_TYPES).optional()` to `z.unknown().optional()` |

**`tests/integration/database.test.ts`** (real Postgres, per 03 §12)

| # | Assertion | Mutation it kills |
|---:|---|---|
| T11 | a call site burning 2 rejected + 1 accepted attempt ⇒ `countRunModelAttempts` = 3 **and** `countModelAttempts` for that call site = 3 | adding `AND outcome = 'OK'` to either counter — the single mutation that would make retries free and turn a bounded loop into an unbounded one |
| T12 | after exhaustion at a call site, `findExhaustedModelAttempt` returns that call site's last attempt (so redelivery terminal-fails without re-calling, P11 law 3) | making rejected attempts invisible to the exhaustion check — the run would loop forever across redeliveries |
| T13 | `battery/terminal.ts`'s `judge_calls` counts **only** accepted attempts | leaving the rejected attempt at `OK`, inflating DR-139's executed-check evidence with an artifact nobody could use |

**`tests/architecture/*`**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T14 | `LEDGER_OUTCOMES` membership unchanged; `raw_artifact` `parse_status` CHECK unchanged; no new migration | minting a new outcome/condition member for "retried", which would ripple into DDL, contract and UI |
| T15 | the dependency-edge assertion still passes with no new edge | adding a `providers → judgement` (or any new) edge to carry the repair contract |

---

## 8. Live verification (P3)

The packet must name what is verified against the **running** system, and
disclose honestly where live verification is impossible.

1. **Before-state, available now and lawful:** over run
   `50802f65-c4f2-4a85-a150-9c4c6e867919`, the query
   `SELECT e.call_site_key, e.outcome, a.parse_status, a.parse_error, e.sequence
   FROM ledger.ledger_entry e LEFT JOIN ledger.raw_artifact a ON a.raw_artifact_id = e.raw_artifact_ref
   WHERE e.run_id = … AND e.action_kind = 'MODEL_CALL' ORDER BY e.sequence`
   must show `JUDGE:critic:root0:r1:p0` with **one** attempt, `parse_status =
   SCHEMA_FAILED`, `outcome = OK` — the defect and the outcome disagreement,
   on the record.
2. **After-state:** the same query over a fresh depth-1 acceptance run with the
   fix, showing the run reaching a served answer and every call site's attempt
   chain.
3. **The honest limit, stated in the packet:** a schema failure **cannot be
   summoned on demand** from a real model, and forcing one onto the live path
   would be scaffolded data (DR-115). If the new live run produces no content
   rejection, the packet **says so explicitly** and the retry behaviour rests
   on T1–T3 and T11–T13. A green live run is evidence of **no regression**,
   not evidence the retry fired. Any packet claiming otherwise is
   over-claiming.
4. **Never acceptable:** a fixture, stub, or forced malformed response injected
   into the live acceptance path to demonstrate the loop.

---

## 9. NON-goals (explicitly out of this plan's scope)

1. **No schema widening.** Option C is V's (VROW-2), not this ticket's.
2. **No tolerate-and-strip.** Option B is rejected on P12/DR-115 grounds.
3. **No change to the terminal outcome.** After the bound is spent the run
   still terminal-fails with `JUDGE_SCHEMA_FAILURE` carrying the last
   `parse_error`. No salvage, no partial judgement, no default τ.
4. **No new number.** No new literal, no new register row proposed as ratified;
   unruled options go to V as rows with value `— none stated`.
5. **No new kernel vocabulary member, no DDL migration, no contract change, no
   UI change.**
6. **No degrade-instead-of-die.** 03 §10 line 1141 says an unjudged node that
   *does* have a persisted raw artifact is **not** a gate failure — "no arrow,
   a typed record, and the answer serves" (AC-11 × AC-21), and P15's bulkhead
   says the same for panel members. Today one exhausted judge call kills the
   whole run. At depth 1 that may be right (an unjudged root position leaves no
   answer); at depth 5 it discards 62 healthy nodes. This is a **real
   architecture question that this plan deliberately does not answer** —
   VROW-4. Fixing retry first is correct sequencing either way: with retry in
   place the degradation path is reached far less often, and the question can
   be ruled on its merits rather than under incident pressure.
7. **No Docker, no Hatchet work** (DR-121); no change to the acceptance stack's
   topology; no restart of the live stack by this seat.
8. **No fix to DR-159 risk A-2** (env-var attempt bounds on the Hatchet runner
   path) — named in §5 and §10, owned by the envelope-seeding ticket.
9. **No special-casing** to `JUDGE:critic:root0:r1:p0`, to Anthropic, to the
   claude relay, or to any maker count (DR-162-A).

---

## 10. Adjacent findings — reported, not fixed here

1. **`battery/terminal.ts:1032` matches `call_site_key = 'JUDGE'` exactly**, so
   the multi-maker call-site families (`JUDGE:root:secondary`,
   `JUDGE:critic:*`, `JUDGE:cross-root:*`, `JUDGE:review:*`) are invisible to
   DR-139's `judge_calls` evidence count. Pre-existing, orthogonal to this bug,
   should become its own ticket.
2. **Composer and conformance artifacts currently record `parse_status =
   'PARSED'` even when they violate their organ contract**, because those call
   sites declare no predicate and fall through to `contentParseStatus`
   (`providers:131-138`). The §3.4 generalization fixes this as a side effect;
   worth calling out because it means today's artifact record is honest only
   for the judge organ.
3. **`providers:264` throws an untyped `Error`**, contrary to 03 §10's standing
   rule. This plan types it as part of the same edit — minimal scope, and
   leaving it untyped would force the caller to string-sniff, which is
   forbidden.
4. **DR-159 risk A-2 is now load-bearing for two failure classes** (§5).

---

## 11. V DECISIONS PACKET

Rows for V. None of these is decided by this plan; the implementation
proceeds on the recommended reading only if the authorizer agrees the reading
is already ruled (VROW-1) — the rest are independent of ticket scope.

| Row | Question | Architecture's reading | Cost if V rules otherwise |
|---|---|---|---|
| **VROW-1** *(confirmation, not a new number)* | Does DR-159's ratified *"each call site independently permits 3 attempts"* cover **content-schema rejections** as well as transport failures, sharing one bound? | **Yes.** DR-159 clause 3 states no restriction, and 03 §7.1 puts schema-failure retries under `CallBound` by name. Worst case per call site is unchanged; the ceilings need no revision | if V rules the bounds are transport-only, a **new** per-call-site repair bound must be ratified before the fix ships (VROW-3) |
| **VROW-2** *(value / contract)* | The judge's `evidence` object can only emit two numbers; it has no way to say *"there is no evidence here."* The incident is a model reaching for that. Keep `.strict()` as-is, or widen the judgement contract to carry evidence-absence? | recommend **keep strict now**; widening is V's and is independent of the retry fix | widening changes `contract_hash`, the reducer's inputs and possibly the served surface — its own ticket |
| **VROW-3** *(register row, value `— none stated`)* | If VROW-1 is ruled the other way: how many of a call site's attempts may be spent on content repair? | **no ruled basis exists** — this would be a register row (`schemaRepairAttempts`, scope deployment, consumer `providers`), never a literal (AC-76/DR-039) | blocks the fix until ratified |
| **VROW-4** *(architecture + value)* | Must one exhausted judge call site kill the whole run, or should the node degrade to unjudged (no arrow + typed record) and the answer serve? 03 §10 (AC-11 × AC-21) and P15 point at degradation; today's code kills the run | **out of scope here**; loud death is preserved by this plan. Raised because it scales badly: at depth 5 one bad leaf discards 62 healthy nodes | a separate ticket with its own condition-mark and serve-surface consequences |

---

**PLAN READY FOR GROK AUTHORIZATION**
