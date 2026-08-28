# L2 ADDENDUM 2 — THE DECLARED-KIND PROJECTION

- **Seat:** ARCHITECTURE, Claude Opus. Fired by the Router route on `t_5504afe0` (2026-08-26 20:39) after V answered H-1/H-2/H-3. This seat writes **this file only** — no product code, no test, no ticket, no worktree, no board mutation.
- **Authority:** `authority_epoch 1`, unchanged. This document is the **sequel** to `planning/L2-ADDENDUM-PLAN.md` (hereafter **A1**) and contradicts nothing in it. Where A1 and this document both speak, A1 wins unless this document says "AMENDS A1" in those words.
- **What V already ruled, and what is therefore not relitigated here:**
  - **H-2 ANSWERED.** The declared-kind projection closes as a **second L2 addendum, before the binding wave (L3/L4/L5) merges.** V chose the timing and **delegated authorship of the closed kind list to architecture; V ratifies it before any coding.**
  - **H-3 ANSWERED — option (b).** A.5's authority predicate is **re-specified to key on gaps recorded recently within a bounded window** rather than on gaps still open. **No migration. `0035` stays reserved and unclaimed. `migrations/**` stays sealed.**
  - **H-1 ANSWERED and out of scope here.** The crypto family waits for a type-aware recipe v2 confined to non-zone paths. Not folded in, not mentioned again.
  - **V-5 ANSWERED (2026-08-26), on this document's own §9 H-4.** **(a)** All six kinds **RATIFIED as proposed**, Tier B included, ratified **now** rather than held. **(b)** **One `UNKNOWN` reason code**, not four. **(c)** **NEW, and it extends this document's scope:** §8 R-9(a) — *`apps/api` will be correlation-blind indefinitely* — was put to V and V ruled **assign it an owner now, in this addendum round**, on the reasoning that once the binding wave lands the API seams are built and closing it later means re-proving them. **§4A is that assignment.** §9 records all three as answered.
  - **V-6 ANSWERED (2026-08-26), on this document's own §9 H-5** — the one decision the API assignment surfaced. **A.4's maturity fold EXCLUDES `capture_point = 'http'`, adopted as proposed.** `S08-ctx-acc-10` **stands** as a criterion and is not struck; the client-asserted-correlation vector is **closed**, not carried as a residual. §4A.5 states the amendment; §9 H-5 records V's reasoning and the two rejected alternatives.

> **STATUS: NO OPEN HUMAN DECISION REMAINS IN THIS DOCUMENT.** Every row it ever raised — H-4(a), H-4(b), H-4(c), the V-5(c) assignment, and H-5 — is answered. Coding is gated only on the sequencing in §7.
- **Base this addendum is written against:** `obs-lane-2-capture` at **`7afdbe5`** (`feat(obs): declare capture runtime dependencies` — A1 step 1, S03a, already landed). Steps 2–4 of A1 (§6) are still ahead.
- **Inputs read in full:** `planning/L2-ADDENDUM-PLAN.md` · `t_5504afe0` body + all 15 comments · `research/POST-SYNTHESIS-RULINGS.md` (**binding overlay; wins over `research/SYNTHESIS-requirements.md`**), Batches 6–9 · `planning/{VerticalSlices,FinalPlan,Plan,S02-registry-pin-correction,S03a-contract-correction,S07-ownership-ruling}.md` · `packages/obs-capture/src/{redactor,context,emit,health,index}.ts` and `src/registry/index.ts` · `apps/runner/src/index.ts` (S06 seams, uncommitted in `.worktrees/obs-lane-3`, **read only**) · `apps/api/src/index.ts` error handler · `apps/scheduler/src/cli.ts` · `packages/providers/src/index.ts` · `migrations/{0000_s00,0034_obs_foundation}.sql`.
- **Everything asserted below as "measured" was executed by this seat.** Probe scripts live outside the repo (`$SCRATCH/kindprobe/**`); §1.8 reproduces the only non-trivial one. **Line numbers are non-normative** (mission law, V 2026-08-26) and every one quoted below is true at `7afdbe5` unless stated otherwise.

> **Reading order for the coder.** §1 (what is actually there), §2 (the list — **V-ratified; do not invent a member**), §3 (how it works), then **§4 if you are the S03c seat** or **§4A if you are the S08 seat — §4A is measured physics and two of its findings will silently defeat you if you skip it.** §5 and §6 are for the Router and for S16/S18. §7 is the merge law. §8 is what I could not close.

---

## 0. THE DEFECT, STATED ONCE

`packages/obs-capture/src/redactor.ts` hard-codes **all five correlation refs and `at_seq_watermark`** to the literal `"UNKNOWN:DECLARED_KIND_REQUIRED"`. It does so in **two places, not one** — a fact a coder must know before starting:

```
type declarations   redactor.ts:80-84, :87   readonly run_ref: typeof UNKNOWN_DECLARED_KIND;  (×6)
value assignments   redactor.ts:224-228, :231   run_ref: UNKNOWN_DECLARED_KIND,                (×6)
```

Changing only the value expressions produces a type error. Both must move together.

This is not an accident. `context.ts:3-7` says so in as many words: *"Durable projection is fail-closed until the separately ruled declared-kind gate exists; no shape matcher is a provenance decision."* **Batch 7** ruled that an `id` must name **which** id it is, from a **closed list of lawful kinds**. That list is enumerated in no artifact, and no slice owns projecting a declared kind into the durable envelope. This document enumerates the list and mints the slice.

**Why it is urgent, and worse than it looks.** S16's `G1-acc-1` requires *"exactly one occurrence … non-null `run_ref`/`work_item_ref`"*. A literal string is not null, so the criterion **passes by letter and fails by intent, silently**. §1.2 shows the vacuity is in fact one layer deeper than the packet states: the columns are `NOT NULL` in DDL, so the criterion is satisfied **before any code runs at all**.

---

## 1. MEASURED GROUND TRUTH

### 1.1 The file and the commit this addendum starts from

```
obs-lane-2-capture         7afdbe5  feat(obs): declare capture runtime dependencies   ← A1 step 1 LANDED
                           7a3ff39  feat(obs): capture package — registry, core, zone classifier, installers (L2)
                           29f370e  merge(obs): L1/S01 store foundation
obs-lane-3-runner-cause    7a3ff39  (zero commits of its own — re-verified by this seat, §7.3)
git worktree list          only obs-lane-1, obs-lane-2, obs-lane-3 exist. L4 and L5 have not started.
```

`packages/obs-capture/src/redactor.ts` is **byte-identical** at `7afdbe5` and in the L3 working tree:

```
sha256(redactor.ts) = 1af53af92dc026a38db49270d48e67123324996e29dde401a7c4ea5a2ac858b7   (both)
```

So every line citation in this document is valid for the addendum-2 base, and A1's steps 2–4 do not touch this file (A1 §1.2 excludes S03b's enumerated files by construction).

### 1.2 The schema makes `G1-acc-1` vacuous BEFORE the literal does — this corrects the packet

`migrations/0034_obs_foundation.sql`, `obs.occurrence`:

```sql
run_ref        text NOT NULL CHECK (length(btrim(run_ref)) > 0),
work_item_ref  text NOT NULL CHECK (length(btrim(work_item_ref)) > 0),
node_ref       text NOT NULL CHECK (length(btrim(node_ref)) > 0),
attempt_ref    text NOT NULL CHECK (length(btrim(attempt_ref)) > 0),
ledger_ref     text NOT NULL CHECK (length(btrim(ledger_ref)) > 0),
at_seq_watermark text NOT NULL CHECK (length(btrim(at_seq_watermark)) > 0),
```

**`SELECT count(*) FROM obs.occurrence WHERE run_ref IS NULL` can only ever be 0** — the database rejects a null and rejects an empty string. `G1-acc-1`'s "non-null" clause is therefore satisfied by the DDL, independent of the literal, independent of any code. Two consequences that must be stated so nobody re-derives them wrongly:

1. **Making the columns nullable is not available as a repair.** It needs a migration; `migrations/**` is sealed under GLOBAL-FORBID and `0035` is reserved and unclaimed (A1 §3.9, V's H-3 ruling).
2. **Therefore "absent" must be a distinguishable non-empty string, not NULL.** The mission already ratified exactly that grammar — see §1.3.

### 1.3 The three-state grammar is already ratified. This addendum implements it; it does not invent it

`FinalPlan.md:81` (and `Plan.md:68`), **OBS-R034**, verbatim:

> correlation refs three-state (value | `NOT_APPLICABLE` | `UNKNOWN:<reason>`) for `run_ref/work_item_ref/node_ref/attempt_ref/ledger_ref` (OBS-R034); cause explicit (`parent_occurrence_ref` | `NO_CAUSE` | `CAUSE_NOT_CAPTURED:<reason>` + relation, OBS-R036)

`at_seq_watermark` is **three-state like its siblings** (`FinalPlan.md:175`, C.4): *value | `NOT_APPLICABLE` (flow never observed a sequenced event) | `UNKNOWN:<reason>` (context lost)*, and is **copied from context, never queried** — no `SELECT max(at_seq)`, no read of `ledger.sequence_allocator`, no sync I/O on the error path.

The literal already in the code, `UNKNOWN:DECLARED_KIND_REQUIRED`, **conforms to that grammar**. It is a lawful `UNKNOWN:<reason>` member, not a placeholder to be deleted. §3.4 keeps it, and that choice is what lets this addendum land without breaking a single existing assertion.

### 1.4 What the capture path actually carries today

| Fact | Measured at | Consequence |
|---|---|---|
| `ObsContextFields` types all five refs as `readonly <name>?: unknown` | `context.ts:8-17` | The projector may read anything; **the type system gives no guarantee here.** §1.8. |
| `emit()`/`captureHandled()` attach `ambient_context_ref: getObsContext()` | `emit.ts:73`, `:84` | The AsyncLocalStorage store is carried **by pointer** to the flusher — the projection costs the request path nothing (IC-2 preserved by construction). |
| The queue entry holds the context object itself, not a copy | `tests/unit/obs-l2-s03b-core.test.ts:167` asserts `queued?.ambient_context_ref` **toBe** `context` | Projection at redaction time sees exactly what the seam declared. |
| The redactor already reads ambient context, for one field only | `redactor.ts:316` — `entry.ambient_context_ref?.zone_context` | The read path exists; only the projection is missing. |
| `INPUT_ALLOWLIST` = `{code, error, taxonomy_class, capture_point, disposition, source, zone_context, attempt_index}` | `redactor.ts:42-51` | **No ref name is allowlisted.** An envelope carrying `run_ref` as a payload key degrades to `fallback()` today, with zero change. This is why ambient context is the single declaration channel — enforced already. |
| `fingerprint = sha256("v1\0"+code+"\0"+taxonomy+"\0"+runtime+"\0"+package)` | `redactor.ts:202-204` | Refs are **not** fingerprint inputs. Projecting them cannot split or merge any incident. |

### 1.5 What each binding seam can ACTUALLY seed

This is the section the kind list is derived from. A kind naming an id no seam can reach is a wish, not a list.

#### S06 — `apps/runner` task-catch and gateway-seam (`t_5504afe0`, uncommitted in `.worktrees/obs-lane-3`)

**Task seam** (`declareHatchetWalkingSkeletonTask`), measured verbatim in the working tree:

```ts
return capture.runWithObsContext(Object.freeze({
  run_ref:       Object.freeze({ kind: "run",       value: dispatch.runId }),
  work_item_ref: Object.freeze({ kind: "work_item", value: dispatch.workItemId })
}), execute);
```

**Gateway seam** (`createPostgresProviderGateway`):

```ts
const ambient = capture.getObsContext();
return capture.runWithObsContext(Object.freeze({
  ...ambient,
  ...(request.runId === null ? {} : { run_ref: Object.freeze({ kind: "run", value: request.runId }) })
}), execute);
```

| In scope at the seam | Where it comes from | Disposition |
|---|---|---|
| `dispatch.runId` | Hatchet dispatch input, originating at `apps/api/src/index.ts` `startRun()` → `core.run.run_id` (`uuid`, `gen_random_uuid()`) | **kind `run`. Already declared. Already correct.** |
| `dispatch.workItemId` | dispatch input → `core.work_item.work_item_id` (`uuid`) | **kind `work_item`. Already declared. Already correct.** |
| `request.runId: string \| null` | `ProviderCallRequest` (`packages/providers/src/index.ts:33`) | **kind `run`**, and `null` is a **true absence** — a provider call outside a run genuinely has no run. |
| `attemptIndex` from `hatchetContext.retryCount()` | Hatchet runtime | **Not an id.** It is the existing `attempt_index integer` column (RT-14/A.4), already seeded and already correct. **Do not conflate it with `attempt_ref`.** |
| `input.engineRetries`, `input.workflowName` | register bound / config | Not ids. |

**S06 needs no change whatsoever.** The wire format it already writes — `{ kind, value }` under the ref's own field name — is the format §3 specifies. This is the single most load-bearing property of this addendum and §4.7 makes it a criterion.

#### S08 — `apps/api` error handler (`t_c1651ebb`)

`api.setErrorHandler((error, _request, reply) => { … })` at `apps/api/src/index.ts:160`. S08's `allowed:` is this region plus TP-3's first-import line — nothing else.

| In scope | Where it comes from | Disposition |
|---|---|---|
| `_request.session: Session` | `api.decorateRequest("session")` + the `preHandler` hook, populated by `resolveSession()` (`:131-140`) | **`{ asker_id: "asker:"+sha256(token), session_id: "session:"+sha256(token), caller_scope, … }`. FORBIDDEN AND INEXPRESSIBLE.** This is the sharpest fact in this document: **the S08 seam has an asker id and a session id sitting one property access away.** Batch 7 makes both inexpressible; §2.2 rejects both kinds by name; §3.3 rejects them at runtime; §4.7 acc-3 proves it. |
| `error` | the thrown value | Payload, not a ref. |
| `_request.params` | route-dependent, untyped | **Scanning it for something that looks like a run id is shape inference on an untyped bag. FORBIDDEN by §3.2.** *Narrowed by §4A.4 reason 2 after V-5(c): reading `params.id` **on a route template that itself names the parameter**, from a frozen allowlist of literal template strings, is reading a **server declaration**, not guessing — and that is the one lawful case. The distinction is scanning vs. reading a key the template already named.* |
| `_request.routeOptions.url` (route template) | server-defined | A **closed enumeration**, not an id. Belongs in a template parameter (S09's `route_template` vocabulary), never in a correlation ref. |
| `_request.id` (Fastify request id) | Fastify's per-instance counter | Not user-linked, but **no ref column maps to it**, and OBS-R053's "correlation id returned to the client" is better served by the envelope's existing `source_event_ref`. Design note in §8 R-9(a); not a kind. |

**Measured verdict, as of this section: the S08 ERROR HANDLER can lawfully seed NOTHING.** All five refs land `UNKNOWN:DECLARED_KIND_REQUIRED`, and **`NOT_APPLICABLE` would be a false positive claim** — an HTTP 500 on a run-scoped route *does* belong to a run; the error handler simply cannot reach it lawfully. §4.7 acc-13 pins this so nobody "improves" it by parsing params.

> **SUPERSEDED IN PART by V-5(c) — read §4A.** This section measured only the surfaces S08 owned *at the time it was written*, and correctly concluded the API was correlation-blind (recorded as §8 R-9(a)). V then ruled that hole must be given an owner now. §4A adds a **different** surface — a request-scoped `onRequest` hook, a new region of the same file — from which `run` **is** lawfully declarable on three route templates. **Nothing above is retracted:** the error handler still declares nothing, `request.session` is still forbidden, and `work_item`/`node`/`attempt`/`ledger_entry` are still unreachable anywhere in `apps/api`.

#### S10 — `apps/scheduler/src/cli.ts`, whole file, 24 lines (`t_6c5e1a6e`)

| In scope | Where it comes from | Disposition |
|---|---|---|
| `command` | `process.argv[2]`, narrowed at `:6` to exactly `"replay-self-test" \| "liveness-sweep" \| "settlement-watch"` | A **closed enumeration**. Not an id. |
| `databaseUrl` | `loadReplaySelfTestEnvironment()` etc. | **A credential. Never enters an envelope, in any form.** |
| `report`, `pool` | the job result / the pg pool | Not ids. |

Measured against `apps/scheduler/src/index.ts` (S10 `readonly`): `runLivenessSweep` sweeps **across all runs**; `runReplaySelfTest` scans served numbers across the corpus; `runSettlementWatch` folds resolver outcomes. **These jobs genuinely have no run, no work item, no node, no attempt and no ledger entry.**

**Measured verdict: S10 is the one seam where `NOT_APPLICABLE` is TRUE and valuable.** It positively declares all five absent. That is the whole reason OBS-R034 has three states rather than two: a scheduler occurrence with `run_ref = 'NOT_APPLICABLE'` says *"this failure belongs to no run"*, which is different information from *"capture lost the context"*.

#### S11 — `packages/providers/src/index.ts`, exhaustion throws `:371-385` (`t_7efcd635`)

OBS-R018 mandates emission at exactly the post-loop exhaustion throws. **What is in lexical scope THERE — not merely somewhere in `call()`:**

| In scope at `:371-385` | Where it comes from | Disposition |
|---|---|---|
| `request.runId: string \| null` | caller | **kind `run`**; `null` ⇒ `NOT_APPLICABLE`. |
| `request.subjectItemId: string` | caller | Measured: the runner's gateway passes it as `workItemId` to `countModelAttempts`, but the ledger column is `subject_item_id **text**` and other callers are unproven. **S11 must NOT declare `work_item` from it** — it must inherit `work_item_ref` from the ambient context S06's gateway seam already entered. §3.6 states the principle. |
| `lastLedgerEntryRef: string` | declared at `:203`, assigned at `:353` from `appendLedgerEntry(...)` → `ledger.ledger_entry.ledger_entry_id` (`uuid`) | **kind `ledger_entry`. Seedable today, in scope, no code move needed.** Note the sentinel default `"PROVIDER_LEDGER_ENTRY_UNRESOLVED"` — see §3.5, it is a worked example of the shape veto doing real work. |
| `lastContentRejection.ledgerEntryRef` | same | **kind `ledger_entry`**, on the `ProviderContentUnacceptedError` arm. |
| `attemptId` | **`const attemptId = randomUUID()` at `:215`, declared INSIDE the `for` body** | **OUT OF SCOPE at the exhaustion throws.** Measured, not assumed. `attempt_ref` therefore **cannot be seeded by S11 today** at the only site OBS-R018 permits. §2.1 Tier B records exactly what would make it seedable. |
| `lastContentRejection.rawArtifactRef` | `ledger.raw_artifact.raw_artifact_id` | **REJECTED — see §2.2.** `ledger.raw_artifact.raw_text text NOT NULL` holds provider output. A reference is a retrieval key for content A.7's never-store list names explicitly. |
| `request.packet: PromptPacket` | caller | **FORBIDDEN.** Prompt text. |
| `request.contractHash`, `inputHash` | `digest(JSON.stringify(attemptPacket))` | **REJECTED — see §2.2.** A hash of a prompt is a derived form of never-store content and an equality-linking key into a prompt corpus. |
| `request.providerRef`, `request.callSiteKey`, `request.role`, `request.lane` | caller | Not correlation refs. `call_site_key` belongs in `component` (A.3); `role`/`lane` are closed enums. |

### 1.6 Why `run_id` is not user-linked — and it is a grant, not a convention

This is the one kind that needs a real argument, because `core.run` **does** carry identity:

```sql
core.run ( run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
           question_line text NOT NULL, asker_id text NOT NULL, session_id text NOT NULL, … )
```

Three measured facts close it:

1. **The value carries nothing.** `run_id` is `gen_random_uuid()`. It is not derived from any user attribute. Contrast `asker_id = "asker:" + sha256(token)` (`apps/api/src/index.ts:135`) — *that* is a keyed pseudonym of a credential, which is exactly what **R-E4** omits from `obs` entirely.
2. **No obs role can join it to identity.** `0034` grants `USAGE ON SCHEMA core` to the listener/watchdog/human roles and then, in the very next statement, `REVOKE ALL PRIVILEGES ON core.run FROM debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human`. The writer role never gets `USAGE ON SCHEMA core` at all.
3. **The only obs-reachable projection is column-safe by DDL.** `obs.run_correlation_v` is `security_barrier`, `security_invoker = false`, owned by `debateai_obs_view_owner`, and selects exactly `run_id, created_at_seq, register_version, battery_version, risk_tier` — **`asker_id`, `session_id`, `question_line`, `caller_scope`, `asker_risk_tier` are excluded** (E6-08, R-E4, `FinalPlan.md:109`).

`core.work_item`, `core.node` and `ledger.ledger_entry` carry **no identity column at all** — verified by reading the full column list of each in `migrations/0000_s00.sql`. Their one-line justifications in §2.1 rest on that.

### 1.7 The registry's `id` type is the superseded design, behind a fail-shut gate

`packages/obs-capture/src/registry/index.ts` (S02's file, **read-only to this addendum**):

- `TEMPLATE_PARAMETER_TYPES = ["id","registry_code","closed_enum","bounded_int"]` (`:422-427`).
- `validateId` (`:543-551`) admits bare RFC-4122 UUIDs, `run_`+UUID, and registry codes — **by shape**. Its own doc-comment concedes: *"UUID shape cannot distinguish a lawful run/node id from an unlawful session or asker id … this validator does not establish privacy, authorization, or identifier provenance."*
- The operative protection is that **`REVIEWED_PARAMETER_SECURITY_GATES` is empty** (`:475-477`) and every seed template declares `EMPTY_PARAMETERS` (`:498-505`), so `assertParameterSecurityGates` throws `FIRST_ID_PARAMETER_REQUIRES_EXPLICIT_SECURITY_REVIEW` on the first `id` parameter anyone adds.

**Consequence, and it is a scope boundary, not an omission:** the registry's `id` **template-parameter** surface still embodies the shape approach Batch 7 superseded — but it admits nothing today because it is fail-shut. This addendum fixes the **correlation-ref** surface and deliberately does **not** reopen `registry/**`. §8 R-7 routes the parameter surface; §4.4 forbids touching it.

### 1.8 The type system does NOT protect the ambient channel — measured, not assumed

Run with the repo's own `tsc` (`node_modules/.bin/tsc`, `strict`, `es2022`, `bundler`), file `$SCRATCH/kindprobe/p.ts`:

```ts
type LawfulKind = "run" | "work_item" | "node" | "attempt" | "ledger_entry" | "at_seq";
interface Ctx { readonly run_ref?: unknown }
declare function runWith(fields: Ctx, fn: () => void): void;
declare function declaredRef<K extends LawfulKind>(kind: K, value: string): { readonly kind: K; readonly value: string };

runWith(Object.freeze({ run_ref: Object.freeze({ kind: "session", value: runId }) }), () => {});  // (A)
const bad = declaredRef("session", runId);                                                        // (B)
```

**Result — exactly one diagnostic, and it is on (B):**

```
p.ts(15,25): error TS2345: Argument of type '"session"' is not assignable to parameter of type 'LawfulKind'.
```

(A) — a hand-rolled hostile declaration flowing into an `unknown`-typed ambient field — **typechecks cleanly. Zero diagnostics.**

Two conclusions, both binding on §3 and §4:

1. **The runtime closed-list rejection is the guarantee. The type is a convenience.** Any criterion that leans on the type as the protection is wrong.
2. **The exported constructor DOES fail closed at compile time**, and its diagnostic is *predictable from this document alone* — `TS2345`, message text as above. That makes it a lawful pin under the mission's standing rule ("a pin whose expected value cannot be computed by a party that has never seen the implementation is not a pin"), and §4.7 acc-3 uses it as one.

**Not fixed, deliberately:** tightening `ObsContextFields` from `unknown` to a declared union would give (A) a compile error — but `context.ts` is S03b's file, and (measured, `Object.freeze` preserves the literal type: `Readonly<{ kind: "run"; value: string }>`) the tightening would still not reach a seam that spreads `...ambient`. Worse, it would reopen S06. **Rejected. §8 R-2.**

### 1.9 Two consequences nobody has recorded

1. **Fingerprint maturity has been silently pinned at 1.** A.4/E6-12 count *"distinct originating work units — distinct `work_item_ref`/`run_ref` after cross-source merge"*. Today every first-party row carries the same literal, so `count(DISTINCT work_item_ref)` over any set of occurrences is **1**, forever. With the seed `obs.fingerprintMaturityN = 3`, **no fingerprint can ever mature, so autonomous fixing can never be authorized from first-party data.** This is fail-closed — it is not a safety defect — but it means the D.4 fix path, which is the point of the whole mission (V-1), is unreachable until this addendum lands. §4.7 acc-9 makes it a criterion with a before/after count.
2. **The existing S03b test already pins the right half of the rule, and survives untouched.** `tests/unit/obs-l2-s03b-core.test.ts` (`:246-270`), *"does not treat shape matching as identifier provenance"*, feeds **bare strings** `"550e8400-…"` and `"run_550e8400-…"` — the exact two shapes `validateId` admits — and asserts they land on the sentinel with `fallback_minimized === false`. **That test must still pass after this addendum**, unchanged, because a bare string carries no declared kind. §4.4 turns this into the containment property that keeps S03b's contract closed.

---

## 2. THE CLOSED KIND LIST — **RATIFIED BY V (V-5(a), 2026-08-26)**

**Ratification was over these values, not over a black box, and V ratified them as proposed — all six, Tier B included** (§9 H-4). The projector rejects everything not on this list; **a member may be added only by V, and only with a named column, a named value provenance, and a named seam.** No seat, lens or reviewer may negotiate a member: a lens that believes one is wrong escalates to V.

### 2.1 ACCEPTED — six kinds, one per column, one-to-one

The one-to-one mapping is deliberate: it makes *"which id is it"* mechanically checkable, and it makes a lawful kind in the wrong field a rejection rather than a silent mis-file.

| # | Kind | Column | Identifies, exactly | Value provenance | Seam(s) that can seed it | Not user-linked because |
|---|---|---|---|---|---|---|
| 1 | `run` | `run_ref` | one `core.run.run_id` | `uuid`, `gen_random_uuid()`, minted by `startRun()` | **S06 task-catch (`dispatch.runId`) — ALREADY SEEDED** · **S06 gateway-seam (`request.runId`) — ALREADY SEEDED** · S11 (`request.runId`) | value is random, not derived from any user attribute; `core.run` is `REVOKE`d from every obs role; the only obs-reachable projection `obs.run_correlation_v` excludes `asker_id`/`session_id`/`question_line` by DDL (§1.6) |
| 2 | `work_item` | `work_item_ref` | one `core.work_item.work_item_id` | `uuid`, `gen_random_uuid()` | **S06 task-catch (`dispatch.workItemId`) — ALREADY SEEDED** · S11 inherits it from ambient, never re-derives (§1.5, §3.6) | `core.work_item` has **zero** identity columns — full column list read at `migrations/0000_s00.sql` |
| 3 | `node` | `node_ref` | one `core.node.node_id` | `uuid`, `gen_random_uuid()` | **TIER B — no seam today.** Named future seam: a per-node emission inside `apps/runner`'s node loop, which **no slice among the 32 owns** (§8 R-1) | `core.node` has zero identity columns; it references `run_id` only |
| 4 | `attempt` | `attempt_ref` | one provider attempt — `ledger.ledger_entry.attempt_id` / `ledger.raw_artifact.attempt_id` | `randomUUID()` minted per attempt at `packages/providers/src/index.ts:215` | **TIER B — S11, needs an in-contract code move:** hoist a `lastAttemptId` alongside the existing `lastLedgerEntryRef` so it survives the loop. S11's `allowed:` is the **whole file** (H5-02), so this is lawful in-contract work, **not** a scope expansion | an attempt id is minted client-side per provider call; no identity column exists on any table it appears in |
| 5 | `ledger_entry` | `ledger_ref` | one `ledger.ledger_entry.ledger_entry_id` | `uuid`, returned by `appendLedgerEntry(...)` | **S11 — seedable today, already in lexical scope at `:371-385`** (`lastLedgerEntryRef`, `lastContentRejection.ledgerEntryRef`) | `ledger.ledger_entry` has zero identity columns; no obs role holds any grant on `ledger.*` at all |
| 6 | `at_seq` | `at_seq_watermark` | the last `core.run_progress_event.at_seq` **this flow already observed in the course of its own work** | `bigint`, **copied from ambient context, never queried** (C.4, `FinalPlan.md:175`) | **TIER B — no seam today, but the seam is now NAMED AND MEASURED:** the SSE route `GET /v1/runs/:id/events` iterates progress events carrying `at_sequence`, and §4A.1 measured that the ambient context **is** visible inside that async iterator. Route-level, so **outside S08's region and owned by no slice** (§4A.3) | a monotonic sequence number of a progress event; carries no identity and no content |

**Tier A (a seam can seed it at its mandated emission site, with the identifier already in lexical scope — measured):** `run`, `work_item`, `ledger_entry`.
**Tier B (column exists, provenance named, seam named, not yet built):** `node`, `attempt`, `at_seq`.

**Why Tier B members are on the list rather than held back.** Each of the six columns is `NOT NULL`. A column with no lawful kind can never be filled, so holding a kind back means a second V round **mid-binding-wave** the moment a seam becomes able to seed it — which is exactly the cost V's timing ruling exists to avoid. A Tier B kind costs nothing at runtime: the projector accepts only what a seam declares, and no seam declares these, so they land on the sentinel and §4.7 acc-13 **pins that they do**. If V prefers the minimal list, §9 H-4(b) is the row to strike.

### 2.2 REJECTED — the rejections are as load-bearing as the acceptances

| Candidate | Why it was even a candidate | **REJECTED because** |
|---|---|---|
| `session` | `Session.session_id` is in scope at the S08 seam, one property access from the error handler | **Batch 7, verbatim: a session id "has no lawful kind to declare, so it becomes inexpressible rather than merely rejected by a regex."** Absence from this list **is** the mechanism. R-E4 forbids it in `obs` at all. |
| `asker` | `Session.asker_id`, same seam | Same ruling. Additionally measured: `asker_id = "asker:" + sha256(token)` (`apps/api/src/index.ts:135`) is a **keyed pseudonym of a credential** — precisely the design R-E4 supersedes and omits (`FinalPlan.md:82`, "no keyed pseudonyms … those columns are OMITTED entirely"). |
| `user`, `email`, `token`, `ip`, `user_agent` | the obvious rest of the identity family | A.7's never-store list names every one. **The users part of the application is deliberately not observed yet** — the accounts feature is the excluded zone (Batch 8), and no id crossing that boundary has a lawful kind. |
| `raw_artifact` | `ledger.raw_artifact.raw_artifact_id` is in scope at S11's `ProviderContentUnaccepted` arm | `ledger.raw_artifact.raw_text text NOT NULL` **holds provider output**. A.7's never-store list names "provider request/response/raw artifacts". A reference is a retrieval key for forbidden content; storing the key stores the content by proxy. |
| `contract_hash`, `input_hash` | both in scope at S11 | `inputHash = digest(JSON.stringify(attemptPacket))` — a **hash of prompt content**. Derived never-store data, and an equality-linking key into a prompt corpus. Not an identifier of anything obs may correlate. |
| `command_key` | `core.work_item.command_key text UNIQUE`, a natural key | Measured at `apps/api/src/index.ts:529`: `commandKey: \`S00:${runId}:Q1\`` — it **embeds the run id** plus a battery position, is `text` not `uuid`, and adds nothing over `run` + `work_item`. A composite text key is a free-text-shaped surface with no compensating value. |
| `claimed_by` | `core.work_item.claimed_by text` identifies the worker holding the claim | Identifies a **host or process user**. A.7's never-store list covers IP/user-agent; A1 §3.7 already rules `OBS_WRITER_IDENTITY` is the runtime name with **"no hostname, no user, nothing user-linked."** Same rule, same answer. |
| `provider_ref` / `actor_ref` | `request.providerRef` is in scope at S11 | Identifies a **third party**, not a correlation ref, and **no column maps to it**. If it is ever needed it is a `closed_enum` template parameter or a `component` attribute — never one of the five refs. |
| `call_site_key` | in scope at S11; a real, stable code-location key | **Wrong home, not wrong data.** A.3 places `call_site_key` inside the structural `component (process, package, call_site_key?, organ?)`, and A.4 already uses it as a fingerprint input. Adding it as a correlation kind would create a second, divergent home for the same fact. |
| `job_run` | S10's RT-05 start/finish receipt pair needs to correlate its two events | **No column exists**, and minting one needs a migration — sealed. The pairing belongs to S10's own design: a `closed_enum` job-name template parameter plus the receipt-pair semantics RT-05 already specifies. Routed to S10, not smuggled in here. |
| `hatchet_run_id` | dual-source correlation (`obs.source_link`, D.5) | **No ref column maps to it**, and the whole Hatchet side is blocked behind SPIKE-D1. Ingest-side correlation is `obs.source_link`'s job, not a first-party correlation ref. Routed, not dropped. |
| `spool_ref` | obs's own re-ingest key | Already has its own column, `obs.spool_receipt.spool_ref`, written by S05b (A1 §3.8). An obs-internal key is not a product correlation ref. |
| `served_number`, `answer`, `propagation_run`, `restatement`, `register_version` | real ids on real tables | **No column, no seam, no measured need.** Each fails the same three-part test the accepted six pass. Adding a kind "because the id exists" is how a closed list stops being closed. |

---

## 3. THE PROJECTION DESIGN

### 3.1 Where it runs, and why there and nowhere else

**In the redactor, inside `build()`.** Reasons, in order of force:

1. **A.7/REG-01 is a MUST:** the single shared redactor *"precedes EVERY durable-sink write — Postgres and spool alike."* Projecting there means the rule holds for both sinks **by construction**, not by two implementations agreeing.
2. **`build()` is the single funnel.** Both `redact()`'s success path and `fallback()` call it. One place, no second path to audit.
3. **IC-2 is preserved for free.** `build()` runs on the flusher, off the request path. The projection adds **zero** work to `emit()`. `emit.ts` is not touched.
4. Every alternative — a projection in the flusher, in the sink, in the spool writer, or at the seams — either duplicates the logic across two sinks or moves classification onto the request path.

### 3.2 The rule, stated so it can be implemented and reviewed independently of any code

> A field `F` ∈ {`run_ref`, `work_item_ref`, `node_ref`, `attempt_ref`, `ledger_ref`, `at_seq_watermark`} is projected into the durable envelope **if and only if** all of the following hold. Failing any one yields `UNKNOWN:DECLARED_KIND_REQUIRED`.
>
> 1. `entry.ambient_context_ref` is a non-null object. **It is the only declaration channel** — never `payload_ref`, never `handled_context_ref` (§3.6).
> 2. `entry.ambient_context_ref` has an **own** property named exactly `F`.
> 3. That property's value is a non-null object with an **own** property `kind` whose value is a **string** that is a member of the closed list in §2.1. Membership is by exact string equality against a frozen set — never a prefix, never a regex, never a `startsWith`.
> 4. That `kind` is **the one lawful kind for `F`** per §2.1's one-to-one table. A lawful kind in the wrong field is a rejection.
> 5. Exactly one of:
>    - **PRESENT** — an own property `value` whose type is `string`, which passes the shape veto of §3.5. The projected result is that string, byte-for-byte. → the column receives the value.
>    - **POSITIVELY ABSENT** — an own property `not_applicable` whose value is the boolean `true`, **and no `value` property**. → the column receives exactly `NOT_APPLICABLE`.
>
>    A declaration carrying both, or neither, is a rejection.
> 6. `zone_context` on the resulting envelope is `false`. **When `zone_context` is true, all six fields are forced to `UNKNOWN:DECLARED_KIND_REQUIRED` regardless of what was declared** (§3.7).
>
> **No step in this rule reads the *shape* of a value in order to decide *what kind it is*.** The kind is read from the declaration. Shape is consulted only in step 5, only after the kind is already known, and only to **reject** (§3.5).

### 3.3 Shape inference is forbidden. The shape check is a veto, never a vote

This is the rule the whole addendum exists to encode, and it is stated as a prohibition because a prior review in this mission found a pattern *named* "safe" that admitted a string containing a password and a card number. **Assume nothing from a name.**

- **Forbidden, absolutely:** deciding that a string *is* a run id because it looks like one. `validateId`'s own comment concedes shape cannot separate a lawful run UUID from an unlawful session UUID — they are the same 36 characters.
- **Permitted, narrowly:** after the kind is already known from the declaration, refusing a value whose shape is impossible for that kind.
- **The asymmetry is the whole point:** a shape check that can only *subtract* can never admit the wrong thing. A shape check that can *add* is a guess, and guesses admit the wrong thing.

Mechanically: the veto is applied **after** steps 3 and 4 of §3.2, and its only possible outcomes are "unchanged" or "rejected". It never selects a kind, never selects a field, and never upgrades an `UNKNOWN` to a value.

### 3.4 The three states, and why there is exactly one `UNKNOWN` reason code

| Durable value | Meaning | Produced when |
|---|---|---|
| the declared string | this occurrence belongs to that entity | §3.2 satisfied with a PRESENT declaration |
| `NOT_APPLICABLE` | **a positive claim**: this flow provably has no such entity | §3.2 satisfied with a POSITIVELY ABSENT declaration |
| `UNKNOWN:DECLARED_KIND_REQUIRED` | capture could not establish it | every other case |

**"Absent" and "present but unknown" are distinguishable, and the distinction is a positive claim that must be positively made.** An omitted field inside a present context is `UNKNOWN:…`, **never** `NOT_APPLICABLE` — silence is not a claim. A seam that means "there is no run here" must say so, as S10 does.

**One `UNKNOWN` reason code, not four — decided, with the trade recorded.** Four conditions collapse into it: no context at all; the field omitted; an unlawful or mispaired kind; a value the veto refused. Reasons, in order:

1. **It costs nothing that matters.** A mispaired or vetoed declaration is a *code* defect at a seam — caught by S03c's own unit tests (§4.7 acc-2), by the security lens reading the diff, and by the S08/S10/S11 pre-emptive note (§7.5). It is not a production condition an operator triages from durable rows.
2. **It buys total collision-freedom with A1.** §4.4 shows the consequence: **not one existing assertion anywhere in the mission changes.** A per-reason sentinel would break `S05b-acc-6` (whose probe uses *hostile* ambient refs), would change what A1's Tier-0 installer serializer must write, and would break A1 §2.3's `G5-4` deep-equality between the Tier-0 record and the redactor's own fallback output. That is three edits across two other slices' files, to buy a distinction §3.4(1) says is not needed.
3. **A varying sentinel is a one-bit channel keyed on rejected input.** Small, but it is a channel that exists only to encode what an attacker-controlled value looked like, and it buys nothing.

If V prefers per-reason codes, §9 H-4(c) names the exact three consequential edits.

### 3.5 The shape veto, precisely

| Kind | Admitted value form | Measured basis |
|---|---|---|
| `run`, `work_item`, `node`, `attempt`, `ledger_entry` | a canonical **RFC-4122 UUID** and nothing else | every one of `core.run.run_id`, `core.work_item.work_item_id`, `core.node.node_id`, `ledger.ledger_entry.{ledger_entry_id, attempt_id}` is declared `uuid` in `migrations/0000_s00.sql` — read, not assumed |
| `at_seq` | a **decimal integer string**, no sign, no leading zero beyond `"0"`, value `> 0`, ≤ `Number.MAX_SAFE_INTEGER` | `core.run_progress_event.at_seq` is `bigint` with `CHECK (at_seq > 0)`; C.4 requires it be *copied* from context, so a `bigint` or `number` in context is stringified without a query |

**Worked example that proves the veto does real work:** S11's `lastLedgerEntryRef` initialises to the literal `"PROVIDER_LEDGER_ENTRY_UNRESOLVED"` (`packages/providers/src/index.ts:203`) and keeps that value when no ledger entry was ever appended. Declared as `{ kind: "ledger_entry", value: lastLedgerEntryRef }` it is **not a UUID**, so the veto refuses it and the column reads `UNKNOWN:DECLARED_KIND_REQUIRED` rather than a nonsense correlation key. The **better** thing for S11 to do is declare `{ kind: "ledger_entry", not_applicable: true }` in that branch — §7.5 tells it so.

**If a seam ever needs a non-UUID id, that is a V row, not a widening a coder may take.** The veto is narrow on purpose.

**Known duplication, pinned rather than hidden:** `registry/index.ts:530-531` already holds a `UUID_ID_PATTERN`, but it is a module-private `const` (not exported) and the only exported wrapper, `validateId`, is deliberately wider (it also admits `run_`+UUID and every registry code). `registry/**` is read-only to this addendum, so the new module defines its own pattern. §4.7 acc-14 requires a test proving the two patterns agree on a shared corpus and that the new one is **strictly narrower** — the same discipline A1 §2.3 `G5-4` applied to the installer's duplicate serializer.

### 3.6 One declaration channel, and it is already enforced

Ambient context is the **only** channel. Two independent proofs that nothing else can smuggle a ref, **both true today with zero code change**:

- **Payload:** `INPUT_ALLOWLIST` (`redactor.ts:42-51`) contains no ref name, and `redact()` returns `fallback()` if the payload has **any** key outside it. An envelope carrying `run_ref` as a payload key already degrades to the capture-self fallback. §4.7 acc-5 pins it.
- **`handled_context_ref`:** caller-supplied per-call data of unknown provenance, never read by the projector. §4.7 acc-6 pins it.

**And the principle that governs which seam declares what:** *a kind is declared by the seam that can name the value's provenance, and inherited by inner seams through ambient context — never re-derived.* S06's gateway seam spreads `...ambient` and adds only `run_ref`; S11 inherits `work_item_ref` rather than guessing it from `subjectItemId` (§1.5). Re-deriving a ref at an inner seam is how two seams come to disagree about the same fact.

### 3.7 Zone-context occurrences carry no correlation ref, ever

When the envelope's `zone_context` is `true`, all six fields are forced to `UNKNOWN:DECLARED_KIND_REQUIRED`, whatever was declared.

- **Cost: measured zero.** No zone path enters an obs context today — the zone is `apps/api/src/{registration,mail-channel,mfa}.ts` and `packages/db/src/identity.ts`, and no run touches them.
- **Benefit: it closes a link before it can open.** A correlation ref on a zone-context occurrence would tie an accounts-feature failure to a `run_id`, and thence — for anyone holding product-DB access, which is outside obs's grant model — to `core.run.asker_id`. V's standing position is that the users part of the application is deliberately not observed yet; this keeps the ref channel consistent with that.
- Ordering note for the implementer: `zoneContext` is already computed inside `build()`'s caller and passed in, so the force is a single conditional at the end of the projection, not a second read.

### 3.8 The projection runs on the `fallback()` path too — decided, with the reason

`fallback()` calls `build()`, so it gets the projection unless it is specifically suppressed. **It is not suppressed.**

- `fallback_minimized = true` describes the **payload** — "I could not classify this event". It says nothing about the correlation, which did not come from the payload: it came from the seam's own prior declaration and was validated against a closed list.
- Suppressing it would discard exactly the information a root-cause system needs most: A1 §8 R-2 records that boot-death, redactor failure and unregistered codes all collapse into **one fingerprint**; the correlation refs are the only thing that can tell those rows apart.
- **`fallback_minimized` is NOT set by a rejected ref.** A.3's "drop and set `fallback_minimized`" governs *template parameters*; correlation refs have their own three-state mechanism (OBS-R034) which exists precisely to express "unknown" **without** minimizing. This is also what keeps `tests/unit/obs-l2-s03b-core.test.ts:269` (`expect(redacted.fallback_minimized).toBe(false)` on a context with bare-string refs) true and untouched.

### 3.9 What is NOT projected, so silence is not read as completion

- **`parent_occurrence_ref` / `cause_relation`** stay `"NO_CAUSE"` / `null`. OBS-R036's cause grammar is S07's (`t_9f4e5bfb`) and needs `obs.occurrence_id` values that only the sink knows. Not here. §8 R-4.
- **`prev_link`** stays `NULL` — A1 §3.10, unchanged.
- **`obs.occurrence_detail`** stays unwritten — A1 §3.10, unchanged.
- **The registry's `id` template-parameter type** stays as it is, fail-shut. §1.7, §8 R-7.

---

## 4. THE SLICE — **S03c, DECLARED-KIND PROJECTION (NEW)**

### 4.1 Recommendation: mint a new slice. Do NOT extend S03b

| Option | Verdict |
|---|---|
| **Extend / rework S03b** (`t_9b5ca941`) | **Refused.** (a) A1 §1.2 states in terms that *"S03b is not reopened by this addendum"* and designs every item so S03b's bytes do not change — reopening it now contradicts a document already adopted and being coded. (b) It would be classified as a **defect return**, and under V-4's law (*"charged when the worker authored it inside its own `tests:` glob"*) the missing piece is not in S03b's tests glob at all: it is the **closed kind list, which lives in no artifact**. A worker cannot be charged for failing to implement an enumeration nobody wrote. (c) S03b did not omit this; `context.ts:3-7` **documents the deferral to a gate that did not exist**. This is new scope, exactly as S05b was new scope under V-1. |
| **Mint S03c** | **Taken.** Same lane, same branch, same deliverable (D02), region-granular ownership of one file — a pattern already lawful and in use in this mission (`apps/runner/src/index.ts` carries two S06 regions and one S07 region; `apps/api/src/index.ts` carries two L4 regions). One codex session owns the L2 worktree and the slices are serialized, so a same-file two-owner split carries no concurrency hazard. |

### 4.2 Header

- **Deliverable:** **D02 (declared-kind projection part)** — the projection obligation `§P.2`'s D02 file contract implies but no slice was given. Invents no `§P` surface: `packages/obs-capture/**` is L2's own contract.
- **Lane:** **L2** · worktree `.worktrees/obs-lane-2` · branch `obs-lane-2-capture`. **Gate: G1.**
- **In-lane order:** A1 §6 step **4′** — after S05b, before the full L2 re-approval. §7.1 says why.
- **Dependencies:** A1 steps 1–4 landed (S03a `t_489ecbcc`, S02 `t_8e040ec2`, S05 rework `t_6e99d607`, S05b). S05b specifically, because four of this slice's criteria require a durable row to query.
- **Blocks:** the *meaning* of the binding wave (S06's declarations become durable only here); **S16's `G1-acc-1`**; A.4 maturity counting (§1.9).
- **`risk_tier`: HIGH.** Reason: this is the slice that decides **which identifiers may enter durable storage**. A defect here is a privacy defect, not a data-quality defect. It also writes the field A.4 counts to gate fingerprint maturity, which gates autonomous fixing. Spine floor: security/privacy adjacency + authority-gating data. **Not tierable down.**
- **Review path (matches tier):** full review diamond — three parallel **blind** Claude Opus lenses in distinct sessions (correctness+tests · **security+privacy** · product-truth+contract compliance), no lens seeing another's findings, all returning to Router simultaneously; then product-truth gate; then V acceptance. Roster **A6** in force (Opus on code review while Grok is unavailable). **The kind list is V-ratified before coding, so no lens reopens it** — a lens finding a member wrong escalates to V, it does not negotiate with the seat.
- **Traceability:** **OBS-R034** (the implemented rule) · OBS-R046/R047/R048/R054 · **R-E4** · **Batch-7 declared-kinds** · Batch-8 · A.3 · A.4 · A.5 · A.7 · **C.4** · IC-2 · RT-14 · RT-34 · G1-acc-1 · G1-acc-6 · **the V H-2 ruling**.

### 4.3 `contract.allowed` — two surfaces, one new file and one named region

| Path | Content |
|---|---|
| `packages/obs-capture/src/kinds.ts` (**new**) | the frozen closed kind list; the one-to-one kind↔field table; the declaration types; the exported `declaredRef` / `notApplicable` constructors; the shape veto; the pure `projectDeclaredRefs(context, zoneContext)` function |
| `packages/obs-capture/src/redactor.ts` **region `correlation-projection`** | defined semantically below — **never by line number** |

**Region `correlation-projection`, defined so a reviewer can locate it without the diff:**

- **R1 (type):** in `interface PostRedactionEnvelope`, the six members named exactly `run_ref`, `work_item_ref`, `node_ref`, `attempt_ref`, `ledger_ref`, `at_seq_watermark` — **their type annotations only**. No other member of that interface changes.
- **R2 (value):** in the object literal returned by `build()`, the six properties with those same six names — **their initialiser expressions only**.
- **R3 (plumbing):** exactly one added `import` (from `./kinds.js`); `build()`'s parameter object gains exactly one member (the ambient context); each of the **two** `build(...)` call sites gains exactly that one argument member.
- **R4 (re-export):** `redactor.ts` may add re-export statements for the public surface of `./kinds.js`. **This is deliberate and load-bearing** — `src/index.ts` already carries `export * from "./redactor.js"` (`:6`), so the kinds surface reaches every consumer **with zero change to the barrel**, which is S03b's file.
- **R5:** the module constant `UNKNOWN_DECLARED_KIND` may be **read** and re-exported. Its value is **never** changed.

**Everything else in `redactor.ts` is byte-frozen**, and §4.7 acc-7(b) makes that a mechanical check rather than a promise.

**`tests:`** — two globs, one partition key `obs-l2-s03c-`, disjoint from every existing glob by the filename prefix rule (`VerticalSlices.md` §0):

```
tests/unit/obs-l2-s03c-*.test.ts
tests/integration/obs-l2-s03c-*.test.ts
```

Both are needed: the rejection matrix is a unit concern; "a real correlation reference lands in a real row" requires a real Postgres with `0034` applied, provisioned exactly as `tests/integration/obs-l1-s01-foundation.test.ts:106-147` does.

### 4.4 `contract.readonly` and `contract.forbidden`

**`contract.readonly`** — may import/read, must not edit:
`packages/obs-capture/src/{index,emit,context,queue,flusher,spool,health}.ts` (S03b) · `packages/obs-capture/src/registry/index.ts` (S02) · `packages/obs-capture/src/runtime/**` (S05b) · `packages/obs-capture/install/*.ts` (S05) · `packages/obs-capture/package.json` (S03a) · `migrations/0034_obs_foundation.sql` (S01 — read as the column contract) · `tests/support/testDatabase.ts` · **`apps/runner/src/index.ts` (S06, another lane — read as the declaration-site contract, to copy S06's literal verbatim into the RED; never written).**

**`contract.forbidden`** — GLOBAL-FORBID **plus**, each with its reason and its measured consequence:

| # | Forbidden | Reason | **Measured: no edit is needed** |
|---|---|---|---|
| K-1 | `packages/obs-capture/src/index.ts` | S03b's barrel | `:6` already carries `export * from "./redactor.js"`; R4 routes the surface through it. |
| K-2 | `packages/obs-capture/src/context.ts` | S03b's | `ObsContextFields` already types all five refs `unknown` — exactly what a declared-kind projector needs. Tightening it would reopen S06 and still would not close the hole (§1.8). |
| K-3 | `packages/obs-capture/src/health.ts` | S03b's; `CAPTURE_HEALTH_CODES` and `CAPTURE_GAP_CLASSES` are closed sets | **No new gap class or health code is minted.** A rejected declaration is recorded in the durable row itself, by the sentinel — which is strictly more informative than an aggregate counter, because it carries `runtime`, `component.package` and `capture_point` with it. |
| K-4 | `packages/obs-capture/src/{emit,queue,flusher,spool}.ts` | S03b's | The projection is entirely inside `build()`. |
| K-5 | `packages/obs-capture/src/registry/**` | S02's | §1.7 — the `id` parameter type is fail-shut and admits nothing; converting it is a re-pin, routed at §8 R-7. **`TEMPLATE_PARAMETER_TYPES`, `validateId`, `FIRST_ID_PARAMETER_SECURITY_GATE` are not touched.** |
| K-6 | `packages/obs-capture/src/zone/**` (S04), `install/*.ts` (S05), `src/runtime/**` (S05b), `package.json` (S03a) | other slices' | — |
| K-7 | `tests/unit/obs-l2-s03b-*.test.ts` | S03b's glob | **Measured: nothing in it needs to change.** `:249,:267-268` feed **bare strings** and assert the sentinel — still correct. `:269` asserts `fallback_minimized === false` — still correct (§3.8). `:150,:202` use `{kind,value}` in emit/queue tests that never reach the projection. |
| K-8 | `tests/integration/obs-l2-s05b-*.test.ts` | S05b's glob | **Measured: `S05b-acc-6` remains true.** Its probe uses *hostile* ambient refs, which the projector rejects to exactly `UNKNOWN:DECLARED_KIND_REQUIRED` — the literal the criterion asserts. The single-sentinel decision (§3.4) is what buys this. |
| K-9 | `migrations/**`, `vitest.config.ts`, `tests/support/**`, `pnpm-lock.yaml`, every manifest, the 110 pre-existing test files | mission law (`0035` reserved and unclaimed; R-01; RT-30; S03a sole lockfile writer) | This slice needs no DDL, no config, no dependency. **A coder who finds themselves writing any of these has left the contract and posts a blocker.** |
| K-10 | any file under `apps/**` or `packages/**` outside `obs-capture` | lane disjointness | Including `apps/runner/src/index.ts` — S06 is correct as written. |

**Lane file contracts remain mutually disjoint by construction.** The only file S03c shares with another slice is `redactor.ts`, split by the semantic region of §4.3, in the same lane, serialized in the same session.

### 4.5 The mandatory reproduce-first RED

**Three frames, all behavioural. None inspects source text.**

- **RED-1 · a correctly declared kind is thrown away (unit).** Build the context by **copying S06's expression verbatim** out of `apps/runner/src/index.ts` (readonly read):
  ```ts
  Object.freeze({
    run_ref:       Object.freeze({ kind: "run",       value: R }),
    work_item_ref: Object.freeze({ kind: "work_item", value: W })
  })
  ```
  with `R`, `W` freshly generated UUIDs. Redact a valid registry-code envelope inside it. **Required RED signature: `redacted.run_ref === "UNKNOWN:DECLARED_KIND_REQUIRED"` and `redacted.work_item_ref === "UNKNOWN:DECLARED_KIND_REQUIRED"`.** Paste both. *The seam did everything right and the record says it knows nothing.*
- **RED-2 · it is durable, not theoretical (integration).** With S05b armed, emit the same event end to end and `SELECT run_ref, work_item_ref FROM obs.occurrence` as `debateai_obs_human`. Both are the literal. Paste the query and the rows.
- **RED-3 · the criterion is vacuous at the schema level.** Quote `G1-acc-1` verbatim. Then paste **both**:
  ```
  SELECT count(*) FROM obs.occurrence WHERE run_ref IS NULL;                    -- 0
  \d+ obs.occurrence   (or the DDL line)  run_ref text NOT NULL CHECK (length(btrim(run_ref)) > 0)
  ```
  and state in the RED comment: *"the criterion is satisfied by the DDL before any code runs; the literal is the second reason it is vacuous, not the first."*

### 4.6 Non-negotiable implementation constraints (contract, not suggestion)

1. **No shape inference anywhere.** No code path may select a kind or a field from a value's shape. The reviewer's check is a diff-wide scan for any conditional whose predicate is a pattern test **whose consequent assigns a kind or a field**. §3.3.
2. **The closed list is a frozen set compared by exact string equality.** No prefix match, no `startsWith`, no `includes`, no regex, no case folding, no trimming.
3. **`kinds.ts` has zero runtime imports.** Only `import type { ObsContext } from "./context.js";` — a type-only import that erases. §4.7 acc-11.
4. **`projectDeclaredRefs` is pure and total.** No I/O, no clock, no randomness, no throw. Every path returns six strings. A throw inside it would take the redactor's own `try/catch` and turn every event into a fallback.
5. **Own properties only.** Every property read uses `Object.prototype.hasOwnProperty.call(...)` — as `ownValue` (`redactor.ts:119-126`) already does. A prototype-polluted context must not be able to declare a kind.
6. **The value is copied byte-for-byte or not at all.** No normalisation, no lowercasing, no trimming, no re-formatting. A ref that does not round-trip byte-exactly is not a correlation key.
7. **No number, no bound, no interval is introduced by this slice.** It reads no env var and no register row.
8. **The expected kind list in the test is transcribed from §2.1 of this document, never read from `kinds.ts`.** Anti-self-certification: the test must be an **independent enumeration** the code is compared against.

### 4.7 Falsifiable acceptance criteria

Integration criteria run against a **real Postgres with `0034` applied**, provisioned exactly as `tests/integration/obs-l1-s01-foundation.test.ts:106-147`. Every criterion below is checkable by a reviewer who has never seen the implementation.

- **S03c-acc-1 · A LAWFUL DECLARED KIND REACHES THE DURABLE ROW.** Emit inside a context declaring `{kind:"run", value:R}` and `{kind:"work_item", value:W}`, `R`/`W` UUIDs the test itself generated and holds in its own variables. Exactly **one** `obs.occurrence` row, with `run_ref = R` **byte-exact** and `work_item_ref = W` **byte-exact** (compare against the test's own variables, never against anything read back from `obs`). Then `SELECT count(*) FROM obs.occurrence WHERE run_ref = R` = **1** — i.e. the column is usable as a correlation key, which is the entire point of it. *This is the criterion the addendum exists for.*

- **S03c-acc-2 · SHAPE IS NEVER PROVENANCE.** Six sub-cases. Each must yield exactly `UNKNOWN:DECLARED_KIND_REQUIRED`, and the supplied value must appear **nowhere** in any text/jsonb column of the row **nor** in the raw bytes of the spool file:
  | | Declaration | Why it must be rejected |
  |---|---|---|
  | (a) | `run_ref: "550e8400-e29b-41d4-a716-446655440000"` | a bare UUID carries no kind — **this is `tests/unit/obs-l2-s03b-core.test.ts:249,:267` verbatim and must still pass** |
  | (b) | `run_ref: "run_550e8400-e29b-41d4-a716-446655440000"` | matches `RUN_ID_PATTERN`; still no kind |
  | (c) | `run_ref: {kind:"session", value:<uuid>}` | unlawful kind |
  | (d) | `run_ref: {kind:"asker", value:"asker:"+<64 hex>}` | the **exact** shape `resolveSession` produces (`apps/api/src/index.ts:135`) |
  | (e) | `run_ref: {kind:"run"}` | lawful kind, no value, no `not_applicable` |
  | (f) | `node_ref: {kind:"run", value:<uuid>}` | lawful kind in the **wrong field** — the one-to-one pairing check |

- **S03c-acc-3 · `session` AND `asker` ARE INEXPRESSIBLE — at compile time and at runtime.**
  (i) A fixture file calling the exported constructor as `declaredRef("session", x)` fails `tsc` with **diagnostic code `TS2345`** and message text `Argument of type '"session"' is not assignable to parameter of type 'LawfulKind'.` — **measured by this seat, §1.8; a reviewer can predict this string from this document without seeing the implementation.**
  (ii) At runtime, acc-2(c) and (d).
  (iii) The frozen kind list exported by the module **deep-equals the six members transcribed from §2.1 into the test**, in that order — and the strings `"session"`, `"asker"`, `"user"`, `"email"` occur in it zero times.
  (iv) **Honest scope, asserted rather than assumed:** a companion fixture proves that a *hand-rolled* ambient object bypassing the constructor produces **no** `tsc` diagnostic (§1.8 case A). The test comment states, in these words, *"the runtime closed-list rejection is the guarantee; the type is a convenience."* A criterion that overstates the type's protection is worse than none.

- **S03c-acc-4 · POSITIVE ABSENCE IS DISTINGUISHABLE FROM UNKNOWN.** A context declaring `{kind:"run", not_applicable:true}` yields `run_ref = 'NOT_APPLICABLE'` exactly. A context declaring nothing yields `run_ref = 'UNKNOWN:DECLARED_KIND_REQUIRED'` exactly. The two strings differ; `SELECT … WHERE run_ref = 'NOT_APPLICABLE'` selects the first row and only the first; both values are non-empty (the column's `CHECK (length(btrim(run_ref)) > 0)` would reject an empty one — assert by inserting through the live pipeline, not by hand).

- **S03c-acc-5 · THE PAYLOAD CANNOT DECLARE A REF.** Emit an envelope carrying `run_ref: {kind:"run", value:R}` as a **top-level payload key**. Expected, from the existing `INPUT_ALLOWLIST` alone: the envelope degrades to `fallback()` — `code='OBS_CAPTURE_SELF'`, `fallback_minimized=true`, `run_ref='UNKNOWN:DECLARED_KIND_REQUIRED'` — and `R` appears in no column and in no spool byte.

- **S03c-acc-6 · `handled_context_ref` IS NOT A DECLARATION CHANNEL.** `captureHandled(error, { run_ref: {kind:"run", value:R} })` with **no** ambient context yields `run_ref='UNKNOWN:DECLARED_KIND_REQUIRED'` and `R` appears nowhere.

- **S03c-acc-7 · CONTAINMENT — EXACTLY ONE FILE'S BEHAVIOUR CHANGES.**
  (a) `git diff --name-only <A1 tip>..<S03c tip>` = exactly `packages/obs-capture/src/kinds.ts`, `packages/obs-capture/src/redactor.ts`, and files matching `tests/{unit,integration}/obs-l2-s03c-*.test.ts`. Nothing else, tracked or untracked.
  (b) **Byte-freeze proof.** For each of `redact`, `fallback`, `safeNow`, `safeSourceEventRef`, `isRecord`, `ownValue`, `stringMember`, `isPostRedactionEnvelope`, and the constants `INPUT_ALLOWLIST`, `CAPTURE_POINTS`, `DISPOSITIONS`, `SOURCES`, and the `fingerprint` computation: extract the declaration's source text and `sha256` it, at the base and at the tip. **Paste all thirteen pairs; every pair must be equal.** This is what proves R1–R5 were respected without anyone reading a diff narrative.
  (c) `packages/obs-capture/src/index.ts` — `git diff --exit-code` returns 0.
  (d) `tests/unit/obs-l2-s03b-core.test.ts` — `git diff --exit-code` returns 0, **and the file still passes**, the *"does not treat shape matching as identifier provenance"* test included.
  (e) `tests/integration/obs-l2-s05b-*.test.ts` — `git diff --exit-code` returns 0, **and still passes**, `S05b-acc-6`'s five-ref assertion included.
  (f) `packages/obs-capture/install/*.ts` and `packages/obs-capture/src/runtime/**` — `git diff --exit-code` returns 0. **A1's `G5-4` deep-equality between the Tier-0 record and the redactor's fallback output still holds** — re-run it and paste the result.

- **S03c-acc-8 · THE FINGERPRINT DOES NOT MOVE.** For one fixed `(code, taxonomy_class, runtime, component.package)`, the `fingerprint` hex string is **identical** whether the refs project or land on the sentinel. Measured basis: refs are not fingerprint inputs (`redactor.ts:202-204`). If this fails, every incident splits at the addendum and A.4's identity unit moves — which would be a far larger change than this slice is authorized to make.

- **S03c-acc-9 · MATURITY COUNTING BECOMES REAL (A.4 / RT-14).** Emit three occurrences from three **retries of one** work item (same `work_item_ref`, `attempt_index` 0/1/2) and three from **three distinct** work items. **All six carry `capture_point = 'job'`** — the V-6 exclusion (§4A.5) removes only `capture_point = 'http'` from the fold, so this criterion must be measured on a counted capture point or it measures the exclusion instead of the projection. Assert `SELECT count(DISTINCT work_item_ref)` = **1** and **3** respectively. **Run the same fixture against the pre-slice build and paste both numbers: they are 1 and 1.** That is the proof the defect had a second, unrecorded consequence (§1.9).

- **S03c-acc-10 · ADVERSARIAL DECLARATION — THE ATTACKER DECLARES A LAWFUL KIND.** Drive a context whose five refs each carry a **lawful** kind with a hostile value: a password, a card number, an email address, an API key, a bearer token, and a session id. Expected: the shape veto refuses every one (none is a UUID); all five land `UNKNOWN:DECLARED_KIND_REQUIRED`; **no planted token appears in any text/jsonb column of the row nor in the raw bytes of the spool file.** This is the case a validator merely *named* "safe" would fail. Assert absence by scanning the full serialized row and the raw spool bytes — **never with `toMatchObject`, which is a subset match and cannot prove absence.**

- **S03c-acc-11 · IMPORT TOPOLOGY UNCHANGED.** A runtime resolve-hook trace of `import("@debateai/obs-capture")` shows the pre-slice module set **plus exactly one module** (`src/kinds.ts`), and **zero** `pg`, **zero** `@debateai/db`, **zero** `apps/**`, **zero** `src/zone/*`. Assert on the traced graph, not on source text. IC-1/IC-2 preserved.

- **S03c-acc-12 · ZONE-CONTEXT OCCURRENCES CARRY NO REF.** With a context declaring lawful, valid `{kind:"run", value:R}` **and** `zone_context: true`, the durable row has `run_ref='UNKNOWN:DECLARED_KIND_REQUIRED'` and `R` appears nowhere. Repeat with `zone_context: false` and confirm `run_ref = R` — the pair is what proves the force is conditional and real.

- **S03c-acc-13 · THE HONEST STATE OF EVERY UNSEEDED FIELD IS PINNED.** For an occurrence produced through **S06's actual task seam**: `run_ref` and `work_item_ref` carry values; `node_ref`, `attempt_ref`, `ledger_ref`, `at_seq_watermark` are each **exactly `UNKNOWN:DECLARED_KIND_REQUIRED`**. A value appearing in any of those four means a kind was projected that no seam was authorized to declare — **that is a hard fail, not an improvement.** The same assertion for an occurrence produced through the S08-shaped path (no ambient context at all): **all six** are the sentinel.

- **S03c-acc-14 · THE DUPLICATED UUID PATTERN AGREES AND IS NARROWER.** Over a shared corpus of at least: 20 `randomUUID()` outputs, the two literals from `tests/unit/obs-l2-s03b-core.test.ts:249,:250`, `"PROVIDER_LEDGER_ENTRY_UNRESOLVED"`, `"UNKNOWN:DECLARED_KIND_REQUIRED"`, `"NOT_APPLICABLE"`, an all-uppercase UUID, a UUID with surrounding whitespace, and a UUID with a trailing newline — the new pattern accepts a **subset** of what `registry/index.ts`'s exported `validateId` accepts, and accepts **every** `randomUUID()` output. Assert the subset relation, not merely two pass lists.

- **S03c-acc-15 · TBP.** Per A1 §6.1, **including T-5 fail-closed**: run `pnpm generate:contract` before measuring and state that you did; **positively assert that zero module resolutions escaped the worktree root** (a `--traceResolution` filter for resolved paths outside the worktree root must yield the empty set); zero absolute diagnostics in every path this slice touches; observed multiset a subset of the lane-base pin. **A matching diagnostic count is not evidence of containment.** If either T-5 check cannot be performed, the measurement fails closed and the step posts a blocker.

### 4.8 Where the seat stops

`READY FOR PEER REVIEW`. **No push, no merge, no self-Done, no ticket-split, no branch or worktree operation, no database deletion.** V performs every merge and every push (OBS-R129). If the seat needs a `context.ts` change, a `health.ts` gap class, a `registry/**` edit, a migration, or an edit to any other slice's test glob, it posts a **blocker** — every one of those is a contract boundary, not a judgement call.

---

## 4A. THE API CORRELATION SEAM — OWNER ASSIGNED (V-5(c))

### 4A.0 What V ruled

§8 R-9(a) of this document reported, as the largest thing the addendum did not close: *`apps/api` will be correlation-blind indefinitely — no seam anywhere in it enters `runWithObsContext`, S08 and S09 both structurally cannot, and the surface that could is owned by no slice.*

**V-5(c) ruled: ASSIGN IT AN OWNER NOW, in this addendum round**, on the same reasoning that made the other holes cheap to close now — once the binding wave lands, the API seams are built, and closing it later means re-proving them. §8 R-9(a) is therefore **CLOSED by this section**, and this section is written to the same standard as §4.

Everything below is measured. Two probes were executed against **Fastify `5.11.2`** — the version the repo pins (root `package.json:43`, `apps/api/package.json` `dependencies`) — on the repo-pinned Node `v22.23.1`, using the repo's own `node_modules`. They live at `$SCRATCH/alsprobe/{p.mjs,p2.mjs,p3.mjs}` and §4A.1/§4A.2 reproduce them.

### 4A.1 MEASURED — where a request-scoped context can lawfully be entered

The question is not rhetorical: `packages/obs-capture/src/context.ts` exports exactly **two** functions — `runWithObsContext` (which is `AsyncLocalStorage.run`) and `getObsContext`. It exports no `enterWith`. Whether that API can establish a request-scoped context in Fastify is a physics question, and it was measured, not reasoned.

**Probe `p.mjs`** — a Fastify app with `onRequest`, `preHandler`, a handler, a throwing handler and `setErrorHandler`, each reading `ALS.getStore()`, run in three modes:

| Mode: what `onRequest` does | inside the hook | `preHandler` | handler | `setErrorHandler` |
|---|---|---|---|---|
| nothing (control) | `NO_STORE` | `NO_STORE` | `NO_STORE` | `NO_STORE` |
| **`ALS.run(store, cb)`** | store visible | **`NO_STORE`** | **`NO_STORE`** | **`NO_STORE`** |
| `ALS.enterWith(store)` | store visible | store visible | store visible | store visible |

**`ALS.run` used the obvious way does not propagate.** An async `onRequest` hook that calls `runWithObsContext(ctx, () => {…})` establishes nothing past its own callback. A seat that writes that will get a green unit test and a durable row full of sentinels — the exact defect shape this addendum exists to end.

**Probe `p2.mjs` — the shape that works, using ONLY the S03b API.** A **callback-style** hook that hands Fastify's own `done` continuation to `runWithObsContext`:

```ts
api.addHook("onRequest", (request, _reply, done) => {
  runWithObsContext(<the declaration>, done);
});
```

Measured, with `runWithObsContext` defined as exactly `(fields, fn) => ALS.run(fields, fn)`:

| Read point | store visible? |
|---|---|
| `preHandler` | **yes** |
| route handler | **yes** |
| `setErrorHandler`, ordinary throw | **yes** |
| SSE route, **every** streamed chunk after `await` | **yes** |
| SSE route, after `reply.raw.writeHead` then throw | **yes** |
| **`setErrorHandler`'s stream-abort branch** (`reply.sent \|\| reply.raw.headersSent`) | **yes** |

The last row matters most: the stream-abort branch is the one S08's contract names explicitly and the one a naive design loses.

> **CONCLUSION, and it is what makes this section cheap.** The API seam needs **no new obs-capture API, no `enterWith`, and not one byte of `packages/obs-capture/src/context.ts`.** A callback-style `onRequest` hook plus the already-shipped `runWithObsContext` reaches every point that matters, including both error-handler branches. `context.ts` stays byte-frozen and S03b stays closed.

### 4A.2 MEASURED — what is in scope at `onRequest`, and the structural guarantee it buys

**Probe `p3.mjs`**, a Fastify app declaring `api.decorateRequest("session")` exactly as `apps/api/src/index.ts:146` does, with the session assigned in `preHandler` exactly as `:147-158` does:

| Request | `request.routeOptions.url` at `onRequest` | `request.is404` | `request.params` at `onRequest` | **`typeof request.session` at `onRequest`** | at `preHandler` |
|---|---|---|---|---|---|
| `GET /v1/runs/550e8400-…` | `/v1/runs/:id` | false | `{"id":"550e8400-…"}` | **`undefined`** | `object` |
| `GET /v1/runs/abc/events` | `/v1/runs/:id/events` | false | `{"id":"abc"}` | **`undefined`** | `object` |
| `GET /v1/answers/A/nodes/N` | `/v1/answers/:id/nodes/:nodeId` | false | `{"id":"A","nodeId":"N"}` | **`undefined`** | `object` |
| `POST /v1/auth/register` | `/v1/auth/register` | false | `{}` | **`undefined`** | `object` |
| `GET /v1/nope` | **`<undefined>`** | **true** | `{"*":"v1/nope"}` | **`undefined`** | `object` |

Four findings, each load-bearing:

1. **`request.session` is `undefined` at `onRequest`.** It is populated by the existing `preHandler`, which runs strictly later in Fastify's lifecycle. **This is a structural guarantee, not a discipline: the seam that declares the correlation context cannot see the session, because at the moment it runs the session does not exist.** The rejection in §2.2 of `session` and `asker` is therefore enforced by the *lifecycle*, before the closed list is ever consulted. This is the strongest privacy property in the addendum and it was free.
2. **`request.routeOptions.url` is the ROUTE TEMPLATE, not the requested path.** `/v1/runs/:id`, never `/v1/runs/<whatever-the-client-typed>`. The template string appears **literally in the source** of `buildApi`. Keying a declaration on it means the *kind comes from code the team wrote*, never from data a caller supplied. **This is "declared kind, not shape" restated at the HTTP layer**, and it is why §4A.3 is possible at all.
3. **An unmatched route has no template** (`routeOptions.url === undefined`, `is404 === true`). A template allowlist misses safely on 404 with no special case.
4. **The zone routes match their own templates exactly** (`/v1/auth/register`, …). An allowlist keyed on templates **excludes them by construction**, not by a denylist someone must remember to maintain.

### 4A.3 MEASURED — what `apps/api` may lawfully carry: exactly ONE kind, on exactly THREE route templates

The parameter names in this API do **not** name their kind. `request.params.id` is a **run** id on `/v1/runs/*` and an **answer** id on `/v1/answers/*`. That is Batch 7's exact complaint — *"an `id` must name WHICH id it is"* — appearing verbatim in the routing table. **Only the route template disambiguates.** Full inventory, read from `buildApi`:

| Route template | what the params are | Lawful declaration |
|---|---|---|
| `GET /v1/runs/:id` | `:id` = a `core.run.run_id` | **`run` from `params.id`** |
| `GET /v1/runs/:id/events` | same (SSE) | **`run` from `params.id`** |
| `GET /v1/runs/:id/answer` | same | **`run` from `params.id`** |
| `GET /v1/answers/:id` · `/inspection` · `/ledger-digest` · `POST /v1/answers/:id/memory-link/unlink` | `:id` = an **answer** id | **NONE.** `answer` is a rejected kind (§2.2): no column, no measured need. |
| `GET /v1/answers/:id/nodes/:nodeId` | `:nodeId` = a **serve-layer node ref** | **NONE.** Measured: `packages/contract/src/index.ts:315` declares `node_id: z.string().min(1)` — an **open string**, and `readNodeProjection` is a serve-layer projection. It is **not provably a `core.node.node_id` UUID**, which is what §2.1's `node` kind names. Declaring `node` here would be a **provenance lie** the veto would then silently reject. Rejected on provenance, not on shape. |
| `POST /v1/answers/:id/investigations/:gapRef` | `:gapRef` = an investigation gap ref | **NONE.** Unrelated to `obs.capture_gap`; no kind, no column. |
| `POST /v1/asks` | the run is **minted inside** `options.application.submit(...)` and returned as `accepted.run_ref` | **NONE at `onRequest`.** Measured: the run id does not exist until after the handler's `await` returns, so it is unavailable to any hook — and unavailable precisely for the errors worth capturing, which occur before it. |
| `GET /v1/session` · `/v1/deployment` · `/v1/answers` · `/v1/dev/evaluator*` | no id | **NONE.** |
| `POST /v1/auth/register` · `/v1/auth/verify-email` · `/v1/auth/resend-verification` | the excluded zone | **NEVER, and excluded by construction** — they are absent from the allowlist. |
| unmatched (404) | no template | **NONE.** |

> **The honest, bounded answer, stated plainly because V asked for exactly this rather than for invented reach:** **`apps/api` can lawfully declare exactly one kind — `run` — and only on the three `/v1/runs/:id*` route templates.** `work_item_ref`, `node_ref`, `attempt_ref` and `ledger_ref` are **not seedable anywhere in `apps/api`** and correctly remain `UNKNOWN:DECLARED_KIND_REQUIRED` on every API occurrence. **Any future widening of this table is a V row, not a coder's judgement.**
>
> **One named future seam, recorded rather than taken:** the SSE route `/v1/runs/:id/events` iterates progress events carrying `at_sequence`, and §4A.1 measured that the ambient context **is** visible inside that async iterator. So `at_seq` (§2.1 Tier B) has a named seam — a route-level addition **no slice owns today**. Not taken here: it is outside S08's region and outside this extension's bound.

### 4A.4 Why this does not become the leak the rejections guard against

Five independent reasons, in descending order of force. The first is structural and the rest are defence in depth.

1. **The seam cannot see the session.** §4A.2 finding 1: `request.session` is `undefined` at `onRequest`. `asker_id` and `session_id` do not exist yet. Inexpressibility is enforced by Fastify's lifecycle before the closed list is consulted.
2. **The kind comes from a server-authored template, never from a value's shape.** §4A.2 finding 2. The allowlist is a frozen table of literal template strings that appear in `buildApi`'s own source. Nothing is inferred from what the caller typed. `request.params` is read **only** at a key the template already named, and never scanned, iterated, or pattern-matched. This is the difference between reading a declaration and guessing — and it is why §1.5's ruling that "`request.params` is shape inference" is now correctly narrowed: **scanning `params` for something that looks like an id is shape inference and stays forbidden; reading `params.id` on the template `/v1/runs/:id` is reading a server declaration.**
3. **The zone is excluded by construction, not by rule.** The three `/v1/auth/*` templates are simply absent from a three-entry allowlist. A denylist can be forgotten; an allowlist cannot. And §3.7's independent zone force still applies on top.
4. **The value is closed by the veto.** Only a canonical RFC-4122 UUID survives (§3.5). A caller-supplied `session:<sha256hex>` or `asker:<sha256hex>` — the exact forms `resolveSession` mints — is rejected, and lands on the sentinel.
5. **A UUID is not user-linked, by the same measured argument as §1.6.** Its value carries nothing; `core.run` is `REVOKE`d from every obs role; the only obs-reachable projection excludes every identity column.

**One thing this seam must NOT do, stated as a prohibition because it is the tempting mistake:** it must not read `request.headers`, `request.body`, `request.query`, `request.url`, `request.ip`, or any key of `request.params` other than the one its own template names. **No free text, no header, no origin, ever.**

### 4A.5 NEW FINDING — an API-declared `run_ref` is CLIENT-ASSERTED, and that is a live hole in the authority model

This is a consequence I introduced by assigning the owner, and it must not be discovered later.

**The mechanism.** `params.id` on `/v1/runs/:id` is whatever the caller put in the URL. If a genuine server fault makes that route 500, the caller controls the `run_ref` on the resulting occurrence. Measured: `resolveSession` is `sha256` of any header string (`apps/api/src/index.ts:131-140`) — the mission's own recorded threat evidence that *"it authenticates nothing"* — so the caller is effectively unauthenticated.

**Why it matters.** **A.4/E6-12 counts distinct `work_item_ref`/`run_ref` for fingerprint maturity, and maturity gates autonomous fixing.** A caller who can vary `run_ref` across repeated hits on an already-failing run route can **inflate that fingerprint's maturity at will**, moving a safety gate the fix agent depends on.

**Bounded honestly.** The attacker cannot manufacture the fault — a bogus UUID yields `404` (`run === null ? reply.status(404)`), not an occurrence; a 500 requires a real defect. So the attack accelerates the agent onto a **genuine** bug rather than a fabricated one. It is narrower than it first looks. **But a safety gate an unauthenticated caller can move is a defect in the authority model regardless of how benign this particular exploitation is**, and the mission has already ruled the analogous case: R-E6-10/RT-19 make `source=ui_client` occurrences *"structurally ineligible for fingerprint maturity, tier eligibility, and every fix path"* precisely because they are client-influenced.

**The repair, and it needs no column, no migration and no new enum member.** `source` is a closed DDL enum (`first_party|hatchet|ui_client`) and cannot gain a member. But `capture_point` already discriminates: **S08's error handler is the only producer of `capture_point = 'http'` in the entire mission.** So:

**RULED — V-6 (2026-08-26): ADOPTED AS WRITTEN.** The amendment below is law. §9 H-5 carries V's reasoning and the two rejected alternatives.

#### The amendment to A.4, stated so a reviewer who has never seen the implementation can check it

> **AMENDS `FinalPlan.md` §A.4, and `Plan.md` §A.4, in the maturity-counting sentence ONLY.**
>
> Where A.4 reads *"Fingerprint maturity (E6-12) counts distinct originating work units — distinct `work_item_ref`/`run_ref` after cross-source merge — never raw occurrence rows"*, the counted set is narrowed by exactly one predicate:
>
> > **An occurrence whose `capture_point` column equals the literal `'http'` contributes NOTHING to the distinct-work-unit count.** Its `run_ref` and `work_item_ref` are excluded from the `count(DISTINCT …)` that determines fingerprint maturity. Every other occurrence is counted exactly as before.
>
> **The exclusion is keyed on one column and one literal value: `obs.occurrence.capture_point = 'http'`.** `capture_point` is a closed DDL enum (`process|http|job|provider|db|client|detector|boundary|self`, `migrations/0034_obs_foundation.sql`), so the predicate is total, exact, and needs **no column, no migration, and no new enum member.**

**What this does NOT change — enumerated, because the scope is A.4's counting rule and nothing else:**

| Unchanged | Restated so it cannot be read as moved |
|---|---|
| The `http` occurrence itself | It is written, durable, and **keeps its `run_ref`** in full. It is available for human RCA, for incident folding and projection, for the tracer, for cross-source correlation, and for every query. **Only the maturity tally skips it.** |
| The rest of A.4 | `fingerprint_v1`'s inputs, the "no message text / no `build_ref` / no `zone_marker`" rules, the RT-14 anti-inflation rule that retries of one work item fold to one work unit, and OBS-R024's one-failure-one-incident rule are **untouched**. |
| E6-12 | The maturity threshold `obs.fingerprintMaturityN` (seed 3, FATAL→1) is **unchanged in value and in meaning**. What changed is which rows feed it, not the bar it sets. |
| The fix-agent authority ladder | A.5's three conjuncts (`KILL` absent · `ARMED` fresh · proof-of-capture-health fresh), §5's re-specified gap predicate, the D.7 auto-trip OR-list, tier eligibility, cooldowns, blast radius, and lineage bounds are **all untouched**. Maturity is one gate among several and only that one gate's input set is narrowed. |
| Every other `capture_point` | `job`, `provider`, `db`, `process`, `boundary`, `client`, `detector`, `self` count exactly as they did. |
| `source = 'ui_client'` | Already structurally ineligible for maturity, tier eligibility and every fix path (RT-19 / §K row 12). **This amendment is the same rule applied to the same problem, not a second, competing one.** |

**How a reviewer checks it, without seeing the implementation:** produce N occurrences of one fingerprint with N distinct `run_ref`s and `capture_point='http'`, and N equivalents with `capture_point='job'`; the fold reports **0** and **N**. That is `S08-ctx-acc-10`.

This is a listener-side fold rule (**S18/S20**), costs nothing at G1, and is checkable with one `SELECT`. **Recorded caveat that travels with the ruling:** the discriminator is exact **today** because S08's error handler is the sole producer of `capture_point='http'`. If a future seam emits `capture_point='http'` carrying a **server-minted** ref, the rule needs revisiting rather than silent reuse.

### 4A.6 Owner: a bounded extension of S08, not a new slice

| Option | Verdict |
|---|---|
| **Mint a new slice** | **Refused.** The hook and the error handler are two halves of one obligation — one establishes the context, the other consumes it — in **one file, one lane, one gate**. Splitting them means two seats, two reviews, and a criterion in S08 that depends on a slice that may not have landed. It would also mint the mission's third region in `apps/api/src/index.ts` under a *fourth* owner. |
| **Give it to S09** | **Refused.** S09's `apps/api` grant is one route-mount line; its subject is the client seam. A global request hook is not a client-report concern, and S09 already carries the zone-adjacency risk of TP-4. |
| **Put it in L2** | **Impossible.** `apps/api/src/index.ts` is not L2's surface; L2's lane contract is `packages/obs-capture/**`. |
| **Bounded extension of S08 (`t_c1651ebb`, L4)** | **Taken.** S08 already owns a region of this exact file plus TP-3, is already `risk_tier: high`, already has the right `tests:` glob, and **has not been dispatched** — so the extension is applied to a contract nobody has coded against yet. `apps/api/src/index.ts` stays in **one lane (L4) with three disjoint named regions**: `obs-context-hook` (S08, new) · `error-handler` (S08) · `obs-client-report-mount` (S09) — plus the `zone-route-mount region`, writable by neither. Lane disjointness is preserved exactly. |

**This is not a defect return and S08 is charged nothing.** S08 has never been dispatched; there is no work to invalidate. It is the same posture as A1 §1.5 item 3 and this document's §7.5 — a contract note applied **before** dispatch, which is the cheapest possible moment.

### 4A.7 S08 contract delta — `t_c1651ebb`. Deltas only; every field not listed is UNCHANGED

**`contract.allowed`** — gains ONE region, by semantic definition, never by line number:

> **Region `obs-context-hook`** — a single `api.addHook("onRequest", …)` registration in `buildApi`, inserted **immediately after the existing `api.decorateRequest("session")` statement and strictly before the existing `api.addHook("preHandler", …)` registration**, together with the module-level frozen route-template table it reads. **Nothing else in `buildApi` changes**, and the region is located at check time by that anchor pair, never by a line number.

Unchanged: region `error-handler` · TP-3 `apps/api/src/main.ts`.

**`tests:`** — UNCHANGED glob `tests/integration/obs-l4-s08-*.test.ts`. No new glob, no new suite.

**`contract.readonly`** — UNCHANGED, **PLUS** `packages/obs-capture/src/{context,kinds}.ts` — S08 imports `runWithObsContext` and the kind constructors and **must not author either**.

**`contract.forbidden`** — UNCHANGED (including the `zone-route-mount region`, GLOBAL-FORBID, S09's mount line, `apps/api/src/registration.ts`), **PLUS**:
- **A-1 · `request.session`, at any point inside the hook.** It is `undefined` there anyway (§4A.2); the ban makes the guarantee explicit and reviewable.
- **A-2 · `request.headers`, `request.body`, `request.query`, `request.url`, `request.ip`, `request.hostname`.** No free text, no header, no origin.
- **A-3 · any read of `request.params` other than the single key the matched template names.** No scanning, no iteration, no `Object.keys`, no pattern matching.
- **A-4 · `packages/obs-capture/src/context.ts`** — measured unnecessary (§4A.1). A seat that finds it needs `enterWith` has taken the async-hook shape instead of the callback shape and must re-read §4A.1, not widen its contract.
- **A-5 · adding a route, a `preValidation`/`preParsing`/`onSend` hook, or any second hook.** Exactly one `onRequest` hook.

**`risk_tier`** — UNCHANGED (`high`). **Reason strengthened:** the slice now registers a hook that executes **on every request to the API, including every request to the excluded zone's three routes.** Not tierable down.

**Review path** — UNCHANGED (full review diamond + product-truth gate + V acceptance). The security lens gains one charter line: *prove by execution that the hook reads nothing but `routeOptions.url` and the one named `params` key, that it declares nothing on the three zone templates, and that `request.session` is `undefined` at hook time.*

**Traceability** — gains **OBS-R034**, **Batch-7 declared-kinds**, **R-E4**, **RT-08/IC-2**, **A.4**, and **this section**.

**Non-negotiable implementation constraints:**
1. **Callback style, not async.** `(request, reply, done) => runWithObsContext(<decl>, done)`. An `async` hook calling `runWithObsContext` establishes nothing (§4A.1, measured) and is a hard fail.
2. **The allowlist is a module-level frozen table keyed on the exact template string.** Three entries. Exact string equality — no prefix, no regex, no `startsWith`.
3. **Equal work on every request (RT-08/IC-2).** The hook performs the **same** operations on every request: one `routeOptions.url` read, one lookup in the frozen table, one `runWithObsContext` call. A non-matching template enters a **shared module-level frozen empty context** — a constant, not an allocation. Only the three run templates construct an object.
4. **Total and non-throwing.** A throw in `onRequest` would change product failure semantics on every route — the exact class OBS-R014/R055/R056 forbid and A1's S05 rework exists to repair. The whole body is inside a `try`/`catch` whose `catch` calls `done()` and nothing else.
5. **The declaration uses the exported constructor** from `kinds.ts`, so the compile-time check of §1.8 applies at this seam.

### 4A.8 The mandatory reproduce-first RED

- **RED-1 · the API is correlation-blind (behavioural).** Build the real `buildApi`, force a 500 on `GET /v1/runs/<uuid>`, and observe the durable occurrence: `capture_point='http'` and **all six** ref fields exactly `UNKNOWN:DECLARED_KIND_REQUIRED`, with a real run id in the URL the whole time. Paste the row.
- **RED-2 · the obvious fix does not work (physics).** Register an **async** `onRequest` hook that calls `runWithObsContext(ctx, () => {})`, and assert `getObsContext()` is `undefined` in the `preHandler`, in the handler, **and in `setErrorHandler`**. Paste all three. *This RED exists because a seat that skips it will ship a green unit test over a durable row full of sentinels.*
- **RED-3 · the criterion.** Quote `G1-acc-1`'s replacement (§6.2) and state that no API occurrence can satisfy clause (a) before this extension.

### 4A.9 Falsifiable acceptance criteria — checkable by a reviewer who has never seen the implementation

- **S08-ctx-acc-1 · A REAL RUN REF REACHES A REAL ROW FROM THE API.** Force a 500 on each of `GET /v1/runs/:id`, `/v1/runs/:id/events` and `/v1/runs/:id/answer`, with a UUID `R` the test generated and holds. Each yields exactly one occurrence with `capture_point='http'` and **`run_ref = R` byte-exact**, compared against the test's own variable.
- **S08-ctx-acc-2 · THE STREAM-ABORT BRANCH KEEPS THE CONTEXT.** Force the SSE route to throw **after** `reply.raw.writeHead`, so `setErrorHandler` takes the `reply.sent || reply.raw.headersSent` branch. The occurrence still carries `run_ref = R`. *Measured feasible in §4A.1; this is the branch a naive design loses.*
- **S08-ctx-acc-3 · EVERY OTHER TEMPLATE DECLARES NOTHING.** For **each** remaining route template in §4A.3's inventory — the four `/v1/answers/:id*` forms, `/v1/answers/:id/nodes/:nodeId`, `/v1/answers/:id/investigations/:gapRef`, `POST /v1/asks`, `/v1/session`, `/v1/deployment`, both `/v1/dev/evaluator*`, `GET /v1/answers`, and an unmatched 404 — a forced 500 yields all six refs exactly `UNKNOWN:DECLARED_KIND_REQUIRED`. **Enumerate every template explicitly; a spot check is not this criterion.**
- **S08-ctx-acc-4 · THE ZONE ROUTES DECLARE NOTHING, AND THE REGION IS UNTOUCHED.** (a) For each of `/v1/auth/register`, `/v1/auth/verify-email`, `/v1/auth/resend-verification`, a forced 500 yields all six sentinels. (b) `resolveZoneRouteMountRegion()` resolves exactly one block with exactly the three mounts in order, and ZI-1..ZI-4 pass. (c) `git diff --exit-code <base> -- apps/api/src/index.ts` restricted to the resolved region returns 0 — **not one byte, whitespace included.** (d) **No zone file is read, imported, listed, hashed, stat-ed, or SQL-queried by any shipped S08 code or test** (Batch 8).
- **S08-ctx-acc-5 · THE SESSION IS INVISIBLE, PROVEN THREE WAYS.** (i) A probe asserts `typeof request.session === "undefined"` inside the hook on an authenticated request whose `preHandler` *would* populate it. (ii) Drive a request whose `x-user-dev-token` header is a planted canary; assert the canary, the derived `asker:<sha256>` and `session:<sha256>` appear in **no** column of the resulting row and in **no** byte of the spool file — by absence-scanning the full serialized row and the raw spool bytes, **never with `toMatchObject`**. (iii) A source-independent runtime assertion that the hook accessed no forbidden property: wrap `request` in a `Proxy` whose `get` **records** every key read and assert the recorded set is exactly `{routeOptions, params}` — **recording, not throwing**, so the evidence is the observed set rather than a lucky pass.
- **S08-ctx-acc-6 · A CLIENT-SUPPLIED NON-UUID CANNOT LAND.** `GET /v1/runs/session:<64 hex>` and `GET /v1/runs/asker:<64 hex>` and `GET /v1/runs/<a bearer token>`, each forced to 500: `run_ref` is exactly `UNKNOWN:DECLARED_KIND_REQUIRED` and the supplied string appears nowhere in the row or the spool.
- **S08-ctx-acc-7 · EQUAL WORK ON THE ZONE BRANCH (RT-08/IC-2).** With the hook installed vs removed, zone-branch response-time distributions show **no statistically resolvable delta** (sample size V's, §K row 3). This is `G1-acc-5`'s method applied to the one new always-on cost the mission adds to the request path.
- **S08-ctx-acc-8 · PRODUCT FAILURE SEMANTICS UNCHANGED (OBS-R014/R055/R056).** With the obs-capture import made to throw, and separately with the hook's body made to throw, **every** route returns the same status code and the same response body as with the hook removed. Paste a per-route table for both arms. A hook that can break a request is a worse defect than the blindness it repairs.
- **S08-ctx-acc-9 · AN EMPTY AMBIENT CONTEXT IS INDISTINGUISHABLE FROM NONE.** Redacting inside the shared frozen empty context and redacting with `ambient_context_ref: undefined` produce **deeply equal** envelopes after deleting `occurred_at` and `source_event_ref`. This is what proves entering a context on every request changed nothing for the fifteen templates that declare nothing.
- **S08-ctx-acc-10 · MATURITY EXCLUSION IS REAL (V-6 — RULED, this criterion STANDS and is not conditional).** Produce **three** occurrences sharing one fingerprint, each with a **distinct** `run_ref`, all with `capture_point='http'`; and **three** occurrences sharing one fingerprint, each with a distinct `work_item_ref`, all with `capture_point='job'`. Assert the maturity fold reports **0** distinct work units for the first set and **3** for the second. Then assert the negative control that proves the exclusion is narrow rather than broad: **each of the three `http` rows is present in `obs.occurrence` and carries its `run_ref` in full** — `SELECT run_ref FROM obs.occurrence WHERE capture_point='http'` returns the three distinct values. **Excluded from the tally, retained in the record**; a criterion that showed the rows missing would be testing the wrong thing.
- **S08-ctx-acc-11 · FILE CONTRACT.** Union of tracked + untracked changes equals exactly S08's declared `allowed:` set. The diff to `apps/api/src/index.ts` is confined to the two named regions plus the module-level table; a `sha256` of the file with those regions elided is **equal** at base and tip.
- **S08-ctx-acc-12 · TBP.** Per A1 §6.1 including **T-5 fail-closed** — `pnpm generate:contract` before measuring, and a positive assertion of zero module-resolution escapes from the worktree root.

---

## 5. THE A.5 PREDICATE REPLACEMENT (H-3)

### 5.1 The measured fact that made the old predicate vacuous

A.5's third authority conjunct requires, before every proof refresh, that *"no `obs.capture_gap` row is open"*. Measured, three ways:

1. **`CaptureGapRow` carries a non-null `closed_at`** — `packages/obs-capture/src/health.ts`, `readonly closed_at: Date`, not optional. Every first-party gap row is **inserted already closed**.
2. **The index the clause is written for can never match one.** `migrations/0034_obs_foundation.sql:262-263`: `CREATE INDEX capture_gap_open_idx ON obs.capture_gap (source, opened_at) WHERE closed_at IS NULL`.
3. **It could not be re-opened even deliberately.** `debateai_obs_writer` holds `INSERT` only; `UPDATE`/`DELETE`/`TRUNCATE` are revoked, and `obs.capture_gap` carries statement-level `reject_mutation` and `BEFORE TRUNCATE` triggers.

**A safety condition the autonomous fix-agent depends on is therefore trivially satisfied for the first-party writer.** It reads like a live check and is not one.

### 5.2 The replacement text — A.5 third bullet, as it should read

> **REPLACES**, in `FinalPlan.md` §A.5 and `Plan.md` §A.5, the clause *"no `obs.capture_gap` row is open"* wherever it appears in the proof-refresh precondition list:
>
> > **no `obs.capture_gap` row has been RECORDED RECENTLY** — evaluated as: the query below returns `0`, where `W = obs.captureGapQuietWindowMs` and `S = obs.skewToleranceMs`.
> >
> > ```sql
> > SELECT count(*) AS recent_gaps
> > FROM obs.capture_gap
> > WHERE closed_at IS NULL
> >    OR closed_at > now() - make_interval(secs => (W + S) / 1000.0)
> >    OR opened_at > now() - make_interval(secs => (W + S) / 1000.0);
> > ```
> >
> > **Fail-closed in every direction.** If the query errors, times out, cannot connect, or `W` is unset, the condition is **UNSATISFIED** — the proof does not refresh, and by A.5's standing rule *"absence and staleness always mean TRIP, never health."*
> >
> > **`obs.capture_gap` remains append-only. No DDL, no grant change, no migration. `0035` stays reserved by name and is claimed by nothing.**

### 5.3 Why this is a strict superset of the clause it replaces, and therefore can never be weaker

The `closed_at IS NULL` disjunct is **kept**. Anything the original predicate would have tripped on still trips. The re-specification only **adds** the recency terms. That property is what makes this a re-specification rather than a relaxation, and a reviewer can check it by inspection of the WHERE clause alone.

### 5.4 What it reads, and why both timestamp columns

- **`closed_at`** is when the gap became **known to the store**. It is the term that catches the case the old clause was written for and missed: a long outage during which the counter holds a pending gap in memory with an old `opened_at`, then flushes it with `closed_at = now`. An `opened_at`-only window would call that "healthy" the moment the outage ended.
- **`opened_at`** is when the **loss happened**. It is the term that catches a gap flushed late but originating inside the window.
- **Neither alone is sufficient**, so both are OR'd. A row satisfying either is recent.

### 5.5 The window's length is DERIVED, not picked

The window must be long enough that **any gap occurring while the last proof was still authoritative is still visible to the next refresh attempt.** That gives four terms, each already a named bound:

| Term | Why it is in the sum |
|---|---|
| `obs.authorityProofStalenessMs` | A proof confers authority for this long (A.5). A gap must remain visible at least that long, or it could expire from the window while the proof it should have invalidated is still standing. **This term also sets the hard floor** — see below. |
| `2 × refreshInterval` | The daemon refreshes at most once per interval. A gap landing just after a refresh must still be visible at the next one; the `2×` gives one entirely missed refresh of headroom. |
| `obs.skewToleranceMs` (RT-15) | **Measured: `opened_at`/`closed_at` are stamped by the writer process's clock** (the gap counter's own `now()`), **not** by a database default. The window must absorb the ratified split-clock skew. Applied to the query as `+ S` in §5.2, so a future-dated row is caught automatically. |
| `OBS_FLUSH_INTERVAL_MS` | The counter holds a pending gap in memory until the next sink return (A1 §3.7), so a gap can land one flush interval after it occurred. |

```
obs.captureGapQuietWindowMs  =  obs.authorityProofStalenessMs
                              + 2 × <daemon proof-refresh interval>
                              + obs.skewToleranceMs
                              + OBS_FLUSH_INTERVAL_MS
```

**Every term is an existing ratified-or-seeded bound. No absolute millisecond figure is invented here.** The only genuinely new number is the multiplier **2**, which is declared a **calibration seed** and recorded as G1 calibration evidence (`G1-acc-9` → §K row 1), exactly as every other number in this mission is. **No number in this document is ratified, and none may be cited as ratified.**

**Hard floor, asserted at runtime and failing closed:** `obs.captureGapQuietWindowMs ≥ obs.authorityProofStalenessMs`. A window shorter than the proof's own lifetime reintroduces the same vacuity in a subtler form — a gap could occur and expire from the window while the very proof it should have invalidated still holds authority. If the floor is violated, the daemon **trips**; it does not clamp and carry on.

### 5.6 Why it is not vacuous — the falsification test

**A predicate must be shown to be able to say no.** The S18 ticket gains this as an acceptance criterion:

> Insert one `obs.capture_gap` row through the **live pipeline** (drive `emit()` against a full queue, which produces `gap_class='QUEUE_FULL'`, `lost_count ≥ 1`, `closed_at` non-null — A1 §3.11 acc-7 already produces exactly this row). Then:
> - **immediately:** the predicate returns non-zero and the proof **does not refresh** → authority is absent;
> - **after `W + S` has elapsed** with no further gap: the predicate returns zero and the proof **refreshes** → authority may be granted.
>
> **Both halves are required.** A predicate that only ever says no is as useless as one that only ever says yes, and the old clause failed by only ever saying yes.

### 5.7 Ownership and application

- **Implementation owner: S18, obs-daemon (`t_220330f5`), G2.** Not S05b, not S03c, not this addendum. The predicate is evaluated by the daemon, which is ops-side and reads as `debateai_obs_watchdog`/`debateai_obs_listener` — both of which already hold `SELECT ON obs.capture_gap` (measured in `0034`'s grant block). **No grant change is needed.**
- **Text application owner: the Router**, per §10. This seat writes no plan file but this one.
- **The register row `obs.captureGapQuietWindowMs` joins the B.3 bound list** with §5.5's derivation as its `source_ref` provenance. **Unset ⇒ trip** (A.5's absence rule), never a default.

---

## 6. MAKING S16's `G1-acc-1` GENUINELY CHECKABLE

### 6.1 The criterion as it stands, and both reasons it is vacuous

`FinalPlan.md` §G1 acceptance item 1, and `VerticalSlices.md` §1 S06, verbatim:

> exactly one occurrence with `code = JUDGEMENT_POLICY_UNRESOLVED` (`apps/runner/src/index.ts:1226-1232`), `capture_point = job`, **non-null `run_ref`/`work_item_ref`**

1. **The schema reason (the deeper one):** the columns are `text NOT NULL CHECK (length(btrim(…)) > 0)`. "Non-null" is satisfied before any code exists. §1.2.
2. **The literal reason:** `"UNKNOWN:DECLARED_KIND_REQUIRED"` is a non-null, non-empty string.

Passing it today therefore proves nothing about correlation at all.

### 6.2 Replacement wording for `G1-acc-1`

> **1. Runner mis-wiring fixture (RT-34).** Driving a seeded work item to S04 through the Hatchet task path against today's `apps/runner/src/main.ts` wiring yields **exactly one** `obs.occurrence` row with `code = 'JUDGEMENT_POLICY_UNRESOLVED'`, `capture_point = 'job'`, `taxonomy_class = 'JOB_FAILURE'`, `fallback_minimized = false`, and **all five** of:
>
> - **(a)** `run_ref` is **byte-equal to the `run_id` the harness itself seeded**, compared against the harness's own variable — never against a value read back from `obs`;
> - **(b)** `work_item_ref` is **byte-equal to the `work_item_id` the harness itself seeded**, same discipline;
> - **(c)** neither value is a member of the frozen set `{'UNKNOWN:DECLARED_KIND_REQUIRED', 'NOT_APPLICABLE'}` — asserted **explicitly**, so a regression to a sentinel **fails** rather than passes;
> - **(d)** `SELECT count(*) FROM obs.occurrence WHERE run_ref = <the seeded run_id>` returns **1** — the ref is usable as a correlation key, which is what the column is for;
> - **(e)** `node_ref`, `attempt_ref` and `ledger_ref` are each **exactly `'UNKNOWN:DECLARED_KIND_REQUIRED'`** — the measured honest state of this seam. **A value in any of them is a FAIL**, because it means a kind was projected that no seam was authorized to declare.
>
> **The word "non-null" does not appear in this criterion and must never be reintroduced.** Both `NOT NULL` and the `length(btrim(…)) > 0` CHECK are DDL facts; a criterion that restates a DDL fact grades the schema, not the code.
>
> **Falsification proof — required, and pasted with the result.** Re-run the same fixture against a build in which the declared-kind projection is absent; the criterion **must FAIL at clause (a)**. The pre-addendum-2 build is exactly such a build, so **§4.5 RED-2 doubles as this proof.** A criterion whose failure has never been observed is not known to be falsifiable.

### 6.3 What a reviewer needs, and does not need

To grade `G1-acc-1` a reviewer needs: the two UUIDs the harness generated, one `SELECT`, and this document. They need **nothing** about how the projection is implemented. That is the acceptance test for the criterion itself.

---

## 7. SEQUENCING

### 7.1 Where S03c sits — AMENDS A1 §6 by inserting one step

```
  0.  RP-0 minted and RATIFIED by V                      ← custodian act; gates step 2 only
  1.  S03a addendum   (A1 §5)                            ← LANDED at 7afdbe5
  2.  S02  addendum   (A1 §4)   — recipe v1.1 + declared_gap[] re-pin
  3.  S05  rework 1/3 (A1 §2)   — fatal-boundary repair in all three installers
  4.  S05b            (A1 §3)   — runtime capture wiring
  4′. S03c            (§4 here) — DECLARED-KIND PROJECTION            ← NEW
  5.  FULL L2 RE-APPROVAL       — now SEVEN slices, not six (§7.2)
  6.  V merges L2                                        ← V's act, held by V, never a seat's
```

No step is removed, reordered, or renumbered. One is inserted.

**Why after S05b (step 4), not before.** Four of S03c's criteria — acc-1, acc-4, acc-9, acc-10 — require a **durable row to query**, and until S05b lands nothing in the product writes one. Coding S03c first would leave its durable half unproven and force it to be re-proven at S05b — the exact re-proving cost V's timing ruling exists to avoid, one slice smaller.

**Why before the re-approval (step 5).** A re-approval that grades a tree which then changes is not a re-approval.

**Why the coding is serialized, not parallel.** V's H-2 route says it plainly: one codex session owns the L2 worktree and two slices cannot be coded concurrently in it. **Only this planning artifact runs in parallel with A1's coding** — it writes no code and touches no file A1 touches (A1 has manifests, lockfile, registry, installers and `src/runtime/**`; `redactor.ts` is S03b's and is free).

### 7.2 The L2 re-approval scope becomes seven slices

A1 §7.1 lists six: **S03a · S02 · S03b · S04 · S05 · S05b**. It becomes **seven**, adding **S03c**. The security+data-safety lens (A1 §7.2 lens 2) gains one charter line, and it is the sharpest thing a lens will do on this addendum:

> **Declared-kind discipline, proven by attack rather than by reading.** The closed kind list in the code deep-equals §2.1 of `L2-ADDENDUM-2-DECLARED-KINDS.md`, transcribed independently. No id is inferred from a string's shape anywhere in the diff — scan for any predicate that tests a pattern **and whose consequent assigns a kind or a field**. A session id and an asker id are inexpressible, proven at runtime and by the `TS2345` fixture. No value that fails the veto reaches any column or any spool byte, proven by absence-scanning the full serialized row and the raw spool bytes — **`toMatchObject` cannot prove absence and is not acceptable evidence here.**

### 7.3 The L3 fast-forward window — re-verified by this seat, and still open

```
git rev-list --count obs-lane-2-capture..obs-lane-3-runner-cause  →  0     (L3 has NO commits of its own)
git rev-list --count obs-lane-3-runner-cause..obs-lane-2-capture  →  1     (L2 is one ahead, at 7afdbe5)
git worktree list                                                  →  only obs-lane-1, obs-lane-2, obs-lane-3
```

- **L3 MUST NOT COMMIT** until step 5 completes. S06's three modified/untracked files stay working-tree state or stashed. **The moment S06 commits, the free fast-forward becomes a rebase** across a branch that by then will have changed three installers, a manifest, a lockfile, the registry, `src/runtime/**` and `redactor.ts`.
- After step 5: `git -C .worktrees/obs-lane-3 stash` → **the Router** moves `obs-lane-3-runner-cause` to the addendum tip → `git stash pop`. The seat performs neither.
- **S03c costs L3 nothing extra.** It adds one commit to the same pointer move.

### 7.4 What this addendum does NOT change

- **S06's contract, its code, and its held six-item rework packet.** Measured: the declaration shape S06 already writes is the shape §3 specifies (§1.5), and §4.7 acc-7 makes `apps/runner/src/index.ts` byte-freeze a criterion. **S06 gains no item and loses none.**
- **L4 and L5 need no contract change** (neither worktree exists). They gain one pre-emptive note — §7.5.
- **Merge order.** The binding wave still branches off the L1+L2 base and merges 3a → 3b → 3c. The base is now the post-addendum-2 base.

### 7.5 Pre-emptive contract note for S08, S10 and S11 — to be appended BEFORE they are dispatched

Verbatim, for `t_c1651ebb` (S08), `t_6c5e1a6e` (S10) and `t_7efcd635` (S11). Without it all three will guess, and two of the three would guess wrong.

> **DECLARED-KIND DISCIPLINE — REQUIRED (post-L2-addendum-2).** Correlation refs reach the durable envelope **only** through `runWithObsContext`, as `{ kind, value }` under the ref's own field name, with `kind` a member of the **closed list** in `planning/L2-ADDENDUM-2-DECLARED-KINDS.md` §2.1. **Never infer an id from a string's shape. Never read `request.params`, a route parameter, or any untyped bag to find one.** The payload and `handled_context_ref` are not declaration channels and are rejected.
>
> - **S08 (`apps/api`): the ERROR HANDLER declares nothing; the new `obs-context-hook` region declares `run`, and only on three route templates.** Read **§4A in full** — it is your contract, it is measured, and two of its findings will silently defeat you otherwise: an **async** `onRequest` hook calling `runWithObsContext` establishes **nothing** (§4A.1), and the kind must key on `request.routeOptions.url` (the server-authored **template**), never on the parameter name and never on the value. Inside the **error handler** itself declare nothing: it has no id in scope, and `request.session` carries `asker_id`/`session_id`, both **inexpressible** (Batch 7) and forbidden in `obs` (R-E4). **Scanning `request.params` for something that looks like an id is shape inference and is a hard fail;** reading `params.id` on the template `/v1/runs/:id` is reading a server declaration and is the one lawful case. `work_item_ref`, `node_ref`, `attempt_ref` and `ledger_ref` are **not seedable anywhere in `apps/api`** — assert the sentinel; do not "improve" it. **`NOT_APPLICABLE` would be a FALSE claim** on any API route: a 500 on an answer route may well belong to a run; the API simply cannot reach it lawfully.
> - **S10 (`apps/scheduler/src/cli.ts`): declare `NOT_APPLICABLE` for all five**, positively, using the exported `notApplicable(kind)` constructor. Measured: the three scheduler jobs operate across the whole corpus and genuinely belong to no run, work item, node, attempt or ledger entry. This is the one seam where the positive claim is true, and it is the difference between "this failure belongs to no run" and "capture lost the context". The start/finish receipt pairing of RT-05 is **not** a correlation ref — no column exists for it; use a `closed_enum` job-name template parameter.
> - **S09 (client seam): declare NOTHING, and do not add a second hook.** S08's `obs-context-hook` is the only request-scoped declaration site in `apps/api`, and A-5 permits exactly one `onRequest` hook in `buildApi`. `POST /v1/obs/client-report` carries no lawful kind: a client-supplied correlation ref is client-asserted at its worst (§4A.5) and `source=ui_client` occurrences are already structurally ineligible for every fix path (RT-19/§K row 12).
> - **S11 (`packages/providers/src/index.ts`, exhaustion throws): declare `run` from `request.runId`** (`null` ⇒ `notApplicable("run")`) **and `ledger_entry` from `lastLedgerEntryRef`** — but declare `notApplicable("ledger_entry")` when it still holds its initial literal `"PROVIDER_LEDGER_ENTRY_UNRESOLVED"`, rather than letting the shape veto reject it. **Do NOT declare `work_item` from `request.subjectItemId`** — the ledger column is `text` and non-runner callers are unproven; inherit `work_item_ref` from ambient context instead. `attemptId` is block-scoped inside the retry loop and is **out of scope** at the exhaustion throws; hoisting a `lastAttemptId` beside `lastLedgerEntryRef` is lawful in-contract work (S11 owns the whole file) and is the only way `attempt_ref` becomes seedable. **`request.packet`, `contractHash`, `inputHash` and `rawArtifactRef` are rejected kinds — see §2.2 — and must not be declared under any kind.**

### 7.6 Where the API correlation seam lands (V-5(c))

**The contract amendment lands NOW. The code lands in the binding wave. Those are different acts and conflating them is the error to avoid.**

| Act | When | Why |
|---|---|---|
| **§4A applied to `t_c1651ebb` (S08) as a contract extension** | **Now — in this addendum round, before S08 is dispatched** | This is what V-5(c) ruled. S08 has never been dispatched, so the extension invalidates no work, charges nobody, and reaches the seat **before** it writes a line. That is the whole economy of the ruling: build it right once instead of re-proving it. |
| **The code** | **Merge order step 3b (L4), unchanged** | `apps/api/src/index.ts` is L4's surface. It cannot land in L2 — L2's lane contract is `packages/obs-capture/**` — and moving it would break lane disjointness for no gain. |

**It does NOT change the L2 re-approval's slice count. That stays at SEVEN** (A1's six + S03c, §7.2). S08 is L4; it is reviewed by its own full diamond at step 3b, exactly as its `risk_tier: high` already required. **Nothing in §4A touches the L2 branch, so nothing in §4A is graded by the L2 re-approval.**

**Dependency, and it is one-directional.** §4A's criteria `S08-ctx-acc-1`, `-2`, `-3`, `-4(a)`, `-6` and `-9` all require the projector, so **S08 must not be dispatched until S03c has landed on L2 and L4 has branched off the post-addendum base.** That ordering already holds: L4 branches off the L1+L2 base at step 3b, which is after step 5. **No new hold is introduced and the merge order does not move** — step 3a (L3) → 3b (L4) → 3c (L5) is unchanged.

**Consequence for the L3 fast-forward window: none.** §4A adds no commit to any L2 or L3 branch. The window measured in §7.3 is unaffected.

**Consequence for S16.** `G1-acc-1` (§6.2) is proven through the **runner** path and is unaffected. §4A gives S16 a second, independent proof surface it did not have — an API-path occurrence carrying a real `run_ref` — but **no S16 criterion is amended here**, because a criterion that depends on two lanes landing is harder to grade, not easier.

---

## 8. RISKS, AND WHAT COULD STILL BE MISSING

### R-1 · Three of the six columns have no seam, and one of them has no owner at all

`node_ref`, `attempt_ref` and `at_seq_watermark` land on the sentinel on **every row this mission currently produces**, and §4.7 acc-13 pins that they do. `attempt` has a named, in-contract path to being seeded (S11 hoists `lastAttemptId`). `node` and `at_seq` do not: **no slice among the 32 owns a per-node emission or a progress-watermark seed.** This is not a defect of this addendum — it is the honest state, recorded so it is not discovered at S16 or, worse, inferred from a green test. If V wants `node_ref` real, that is a new slice, and it is cheaper to say so now than after the wave.

### R-2 · The type system does not protect the ambient channel, and tightening it is refused

§1.8, measured: a hand-rolled `{kind:"session", …}` flowing into `run_ref?: unknown` produces **zero** `tsc` diagnostics. Tightening `ObsContextFields` would (a) reopen `context.ts`, S03b's file; (b) break S06's hand-rolled literal, reopening the wave; and (c) still not reach a seam that spreads `...ambient`. **Refused.** The runtime closed-list rejection is the guarantee, §4.7 acc-3(iv) says so in the test itself, and the exported constructors give the compile-time check to every seam that has not been written yet — which is all of S08, S10 and S11.

### R-3 · One `UNKNOWN` reason code collapses four conditions

Decided in §3.4 with the trade recorded, not hidden. The cost is that a durable row cannot distinguish "the seam declared nothing" from "the seam declared something unlawful". The mitigations are that S03c's unit tests *do* distinguish them, that a mispaired declaration is a code defect caught in review rather than a production condition, and that collapsing is what buys total collision-freedom with A1. §9 H-4(c) is the row if V disagrees.

### R-4 · Cause refs remain hard-coded, and the same shape of hole exists one field over

`parent_occurrence_ref` is `"NO_CAUSE"` and `cause_relation` is `null` on every row. **OBS-R036's grammar (`parent_occurrence_ref | NO_CAUSE | CAUSE_NOT_CAPTURED:<reason>` + relation) is unimplemented, exactly as OBS-R034's was before this addendum.** It is S07's (`t_9f4e5bfb`) and it additionally needs `obs.occurrence_id` values that only the sink knows, so it is a G2-shaped problem, not a redactor one. **Recorded now, so it is not the mission's third V-1-shaped hole discovered at S16.**

### R-5 · The UUID veto is a second pattern in the tree

`registry/index.ts:530-531` already holds one. `registry/**` is S02's, its pattern is module-private, and its only exported wrapper is deliberately wider. §4.7 acc-14 pins the agreement and the subset relation rather than pretending the duplication does not exist — the same posture A1 §2.3 `G5-4` took toward the installer's duplicate serializer. If S02 is ever reopened for another reason, exporting the pattern and deleting the duplicate is the right cleanup; it does not justify reopening S02 by itself.

### R-6 · A.4 maturity was silently pinned at 1, and nobody noticed

§1.9(1). Every first-party row shares one `work_item_ref`, so `count(DISTINCT work_item_ref)` is 1 forever and no fingerprint can reach `obs.fingerprintMaturityN`. **This is fail-closed** — autonomous fixing could never have been wrongly authorized — but it means the D.4 fix path, which V restated as the point of the entire mission, was unreachable. It is the same shape as V-1 and the declared-kind hole, one layer further down, and it is worth saying that **three holes of this shape have now been found by the same method: asking what the code actually does at the end of the path rather than at the start.**

**Interaction with V-6, stated so the two are not confused.** S03c unpins the count by giving job-path rows real distinct refs; V-6 (§4A.5) then excludes `capture_point = 'http'` rows from that same count. **They act on different rows and do not cancel:** maturity becomes reachable through `job`/`provider`/`db`/`process` occurrences, and remains unreachable through API-path ones — which is exactly the intent, since the API path is the one a caller can influence.

### R-7 · The registry still embodies the design Batch 7 superseded

§1.7. `TEMPLATE_PARAMETER_TYPES` still carries an open `"id"` type whose validator is a shape check that its own comment says cannot establish provenance. It admits nothing today (`REVIEWED_PARAMETER_SECURITY_GATES` empty; every seed template `EMPTY_PARAMETERS`), so it is fail-shut and not urgent. **But Batch 7's ruling is written about *template parameters*, and this mission has been applying it to *correlation refs*.** Both surfaces need it; only the refs are being fixed here. **Routed:** convert the `id` parameter type to a declared-kind parameter type on the next S02/S17 re-pin, under the same closed list. **Not smuggled in here** — it changes the registry's parameter type vocabulary, which `S02-CORRECTION` §7-R makes a V-signed act.

### R-8 · Where I believe the packet or an earlier statement was imprecise

These are corrections of statements on the record. **No ruled decision — V-1..V-4, H-1..H-3 — is contested.**

1. **"A literal string is not null" is the *second* reason `G1-acc-1` is vacuous, not the first.** The columns are `text NOT NULL CHECK (length(btrim(…)) > 0)`, so the criterion is satisfied by the DDL before any code runs. This matters operationally: a reader working from the stated reason might "fix" the criterion by making the column nullable — which needs a migration, and `migrations/**` is sealed with `0035` reserved. §6.2 fixes the criterion the only way that is available.
2. **The hard-code is in two places, not one.** `redactor.ts:224-228,:231` are the value assignments; `:80-84,:87` are the type declarations (`readonly run_ref: typeof UNKNOWN_DECLARED_KIND`). A coder changing only the values gets a type error and may reasonably conclude the design is wrong. §0 and §4.3 R1/R2 state both.
3. **A coupling the packet could not see: per-reason sentinels would have broken three things across two other slices.** V's H-2 note observes that `S05b-acc-6` *"already requires the seat to ASSERT the five refs are exactly that literal … so this second addendum has a falsifiable RED waiting for it."* True — but `S05b-acc-6`'s probe uses **hostile** ambient refs, so if this addendum minted a distinct reason code for a rejected declaration, that criterion would break, A1's Tier-0 installer serializer would have to change, and A1 §2.3 `G5-4`'s deep-equality between the Tier-0 record and the redactor's fallback would fail. **The single-sentinel decision in §3.4 is what makes the sequel free**, and it is worth stating that this was found by reading A1's criteria rather than by reasoning about this addendum alone.
4. **"No slice owns projecting a declared kind" — precise and correct, and the reason is worth naming.** S03b did not omit it; `context.ts:3-7` **documents the deferral to a gate that did not exist**. That is why §4.1 classifies S03c as new scope rather than a defect return, and why nobody is charged.

### R-9 · What could still be missing that nobody has found

Stated as open, not as covered.

- **(a) `apps/api` correlation-blindness — CLOSED by V-5(c). See §4A.** Recorded here with what actually came of it, because the original entry was wrong in one respect worth keeping visible: it said *"the natural place is uncomfortably near the zone-route-mount region."* **Measured, it is not.** The hook is registered at the top of `buildApi`, immediately after `api.decorateRequest("session")` and well before the routes; the zone routes are excluded by a three-entry template **allowlist** rather than by proximity. The entry was also right about the important thing — no slice owned it — and V assigned S08 as a bounded extension. **Two findings came out of closing it that nobody had:** an async `onRequest` hook calling `runWithObsContext` establishes nothing (§4A.1), and an API-declared `run_ref` is client-asserted and moves a safety gate — **the second of which is itself now CLOSED by V-6, not carried** (§4A.5, §9 H-5). **Residual, now the largest one here:** the API can carry `run` and nothing else, on three route templates out of seventeen — see §8 R-10.
- **(b) `install/evaluator-lib.ts` and `install/ui-client.ts` ship seams nothing calls** (A1 §8 R-9(a); `VerticalSlices.md` §6 row **G5-V1** still OPEN). Neither has any context, so neither can declare anything.
- **(c) Dual-source correlation has no kind and no column.** `obs.source_link` and `hatchet_run_id` are blocked behind SPIKE-D1. When it unblocks, the question is whether Hatchet's run id becomes a kind or stays in `source_link` — §2.2 rejects it for now, deliberately.
- **(d) The board is stale.** A1 §8 R-9(d) recorded it; it is still true — `t_1fde033d` (S01) reads `done` while `t_9b5ca941`/`t_8e040ec2`/`t_d1e18a14`/`t_6e99d607` read `todo` although all are approved and committed, and `t_5504afe0` reads `todo` after two handoffs and a full review diamond. **Board custody is not this seat's**, but a reviewer navigating by ticket status will be misled about what has been reviewed.
- **(e) Nothing in this mission asserts that a value which reaches `run_ref` is a run id *that exists*.**
- **(e) Nothing in this mission asserts that a value which reaches `run_ref` is a run id *that exists*.** The veto proves shape; the closed list proves the seam claimed a lawful kind. Neither proves the row is there. Verifying would require a `SELECT` on `core.run` from the write path — which `debateai_obs_writer` cannot do, must not do (OBS-R040), and which would put a query on the error path (OBS-R056). **Correctly not done. Recorded so nobody reads acc-1 as proving referential integrity** — it proves the seam's declaration survived to the column byte-for-byte, which is all a capture layer can honestly claim.

---

### R-10 · The API can carry ONE kind out of six, on THREE route templates out of seventeen — the ceiling, not a first step

§4A.3 is the honest measurement, and the number is worth stating baldly: after §4A lands, **fourteen of the API's seventeen route templates still produce occurrences with six sentinels**, and even the three that do not carry only `run`. `work_item`, `node`, `attempt`, `ledger_entry` and `at_seq` are **not seedable anywhere in `apps/api`**, for structural reasons rather than for want of trying: answer ids and serve-layer node refs are not the entities the kinds name (`packages/contract/src/index.ts:315` declares `node_id: z.string().min(1)`, an open string); `POST /v1/asks` mints its run *after* the handler's await; every remaining route genuinely carries no correlatable id. **Nobody should read §4A as "the API is now correlated."** It is correlated on the three run-read paths and nowhere else. Closing the rest needs route-level declarations inside handlers — a surface no slice owns, and which this addendum does not invent.

---

## 9. HUMAN DECISIONS

> **EVERY ROW THIS DOCUMENT EVER RAISED IS ANSWERED. NOTHING BELOW IS OPEN.**
> **H-4(a)/(b)/(c) → V-5** (2026-08-26) · **the API-owner assignment → V-5(c)**, executed in §4A · **H-5 → V-6** (2026-08-26). Both rows are recorded below **with V's reasoning**, so this document stands alone for a coder who has not read the routing conversation. **Coding is gated only on the sequencing in §7 — never on V.**

**Nothing here re-asks V-1..V-4, H-1/H-2/H-3, V-5 or V-6.** H-2 ruled the timing and the vehicle; H-3 ruled option (b) and authorized the A.5 text change, so §5's wording is authored under that authorization and is not a V row; §5's derived window uses only bounds already in B.3 plus one declared calibration seed, so it is not one either.

### H-4 · RATIFY THE CLOSED KIND LIST — **ANSWERED IN FULL (V-5)**

V chose the timing option and delegated the list to architecture, *"so ARCH proposes from what the code can ACTUALLY produce at each seam; V ratifies before the slice is coded."* §1.5 is the measurement; §2 is the proposal. **All three parts returned:**

**(a) The six accepted kinds — §2.1.** `run` · `work_item` · `node` · `attempt` · `ledger_entry` · `at_seq`, one-to-one with the six columns, each with its column, its exact referent, its value provenance, its seeding seam, and its measured not-user-linked justification.
**ARCH recommended: ratify as proposed. → V-5(a): RATIFIED AS PROPOSED.** All six kinds are law. The list is **closed**: the projector rejects every kind not in §2.1's table, and a member may be added only by V, and only with a named column, a named value provenance and a named seam (§2's opening rule). **No seat, lens or reviewer may negotiate a member; a lens that believes one is wrong escalates to V.**

**(b) Tier B — should `node`, `attempt` and `at_seq` be on the list now, or held until a seam exists?**
- **Cost of ratifying now:** three kinds nothing declares. Runtime cost is exactly zero — the projector accepts only what a seam declares, and §4.7 acc-13 pins that they stay on the sentinel.
- **Cost of holding:** each column is `NOT NULL` and can never be filled without a kind, so the first seam that becomes able to seed one forces **a second V round mid-binding-wave** — the cost V's timing ruling exists to avoid.
- **ARCH recommended: ratify all six now. → V-5(b) part one: TIER B RATIFIED NOW, NOT HELD.** V adopted the reasoning verbatim — every column is `NOT NULL`, so holding forces a second ratification round mid-wave. **`node`, `attempt` and `at_seq` are therefore lawful kinds today**, and §4.7 acc-13 pins that no seam declares them yet. The distinction between "ratified" and "seeded" is load-bearing and must survive into the ticket: a green test showing `node_ref` on the sentinel is the **expected** result, not an unfinished one.

**(c) One `UNKNOWN` reason code, or four?** §3.4 decides one, and §3.4's three reasons are the argument. If V prefers per-reason codes (`UNKNOWN:NO_CONTEXT`, `UNKNOWN:KIND_NOT_LAWFUL`, `UNKNOWN:VALUE_REJECTED`, `UNKNOWN:DECLARED_KIND_REQUIRED`), the **exact** consequential edits are three, all in A1's territory and all requiring a seat that has already handed off to reopen: `S05b-acc-6`'s five-ref assertion; A1 §2.3 `G5-3`/`G5-4`'s Tier-0 fallback record; and A1 §2.4's constraint that the installer writes `"UNKNOWN:DECLARED_KIND_REQUIRED"` for all five.
**ARCH recommended: one code. → V-5(b) part two: ONE `UNKNOWN` CODE, NOT FOUR.** V adopted it for the reason given — not one existing assertion anywhere changes, and that was **verified against the actual test files rather than assumed** (§4.4 K-7/K-8, §4.7 acc-7(d)(e)(f)). The recorded cost stands and is not to be quietly re-litigated by a lens: **a durable row will not say which of the four conditions produced the sentinel.** The four are distinguished in S03c's unit tests (§4.7 acc-2) and nowhere else, by design.

> **CONSEQUENCE OF V-5: the closed kind list and the sentinel grammar are RATIFIED, and coding may be dispatched the moment A1 step 4 completes.** The pre-coding ratification gate H-2 imposed is **discharged**. No further V input is required to start S03c.

### H-5 · Does an API-declared `run_ref` count toward fingerprint maturity? — **ANSWERED (V-6)**

**This row existed only because V-5(c) assigned the API owner. It was not visible before §4A was specified, and it was the one genuinely new decision this addendum raised. It is now closed.**

**The finding (§4A.5, measured).** `params.id` on `/v1/runs/:id` is caller-controlled, and `resolveSession` *"authenticates nothing"* (`apps/api/src/index.ts:131-140`, the mission's own recorded threat evidence). **A.4/E6-12 counts distinct `run_ref`/`work_item_ref` for fingerprint maturity, and maturity gates autonomous fixing.** So a caller who repeatedly hits an already-500-ing run route with distinct UUIDs can **inflate that fingerprint's maturity** — moving a safety gate the fix agent depends on.

**Bounded honestly, so V is not asked to fear the wrong thing.** The caller cannot manufacture the fault: a bogus UUID returns `404`, not an occurrence. Exploitation requires a **genuine** server defect, and the effect is to make the agent act on a real bug sooner. The harm is narrow. **But a safety gate an effectively-unauthenticated caller can move is a defect in the authority model regardless**, and the mission already ruled the analogous case: RT-19/§K row 12 make `source=ui_client` occurrences structurally ineligible for maturity, tier eligibility and every fix path, precisely because they are client-influenced.

**Asked of V:** may A.4's maturity fold **exclude occurrences with `capture_point = 'http'`** from the distinct-work-unit count, while those occurrences keep their `run_ref` for human RCA, incident grouping and listener correlation?

- **Cost of yes:** it amends A.4's ratified counting rule — which is why it is V's and not ARCH's, exactly as H-3's predicate re-specification was. **No column, no migration, no new enum member, no G1 cost.** Measured basis: S08's error handler is the **only** producer of `capture_point='http'` in the mission, so the discriminator is exact.
- **Cost of no:** the inflation vector stays open and must be recorded as a **named, accepted residual** rather than silently carried; `S08-ctx-acc-10` is struck.
- **ARCH recommended: YES.** It costs nothing, it matches a rule V has already made once for client-influenced data, and it keeps the ref useful for every purpose except the one that grants write authority.
- **Recorded caveat that travels with the ruling:** the discriminator is exact *today*. If a future seam emits `capture_point='http'` carrying a **server-minted** ref, the rule needs revisiting rather than silent reuse.

#### → V-6: ADOPTED AS WRITTEN. The amendment in §4A.5 is law.

**V's reasoning, recorded so a later reader sees why this was a straightforward call rather than a close one.** Three options were put side by side; two were rejected:

| Option | Disposition |
|---|---|
| **Record no `run_ref` from the API at all** | **REJECTED** — it would re-open the very correlation hole **V-5(c) had just ordered closed**. Closing a hole by refusing to fill the column is not closing it. |
| **Accept the vector as a recorded residual** | **REJECTED** — *a safety gate an unauthenticated caller can move is a defect regardless of how narrow the window is.* Narrowness is a reason to fix it cheaply, not a reason to carry it. |
| **Exclude `capture_point='http'` from the maturity fold** | **TAKEN.** It needs **no column, no migration, no new enum member**; it is **exact today** because S08's error handler is the sole producer of `capture_point='http'`; and **API errors still record their `run_ref` for tracing — they simply do not count toward the agent's readiness.** |

**What made it straightforward, in V's words as recorded:** ARCH's own framing that this is **consistency with the already-ruled `source = 'ui_client'` analogue rather than new law.** The mission had already decided, once, that client-influenced occurrences are report-and-count-only and structurally ineligible for the fix path (RT-19 / §K row 12). This applies the same decision to the same kind of data arriving through a different door.

**Consequences, all already applied in this document:** `S08-ctx-acc-10` **STANDS** and is not conditional (§4A.9). §4A.5's inflation vector is **CLOSED**, not carried as a residual — it appears in no residual list in §8. The amendment's precise scope, and the enumeration of what does **not** move in A.4, E6-12 or the authority ladder, is §4A.5.

**No open human decision remains in this document.** S03c is gated on A1 step 4; S08 on §7.6's ordering. Nothing is gated on V.

---

## 10. WHAT THE ROUTER APPLIES

1. **§9 H-4 is ANSWERED (V-5) — do not re-route it.** Record on the board that the pre-coding ratification gate H-2 imposed is **DISCHARGED**: the closed kind list of §2.1 and the single-sentinel grammar of §3.4 are ratified, and no further V input is required to start S03c.
2. **Mint the S03c ticket** from §4 in full — deliverable, lane, gate, `allowed`/`tests`/`readonly`/`forbidden`, dependencies, `risk_tier: high` + reason, review path, traceability, the §4.5 RED, the §4.6 constraints, and all fifteen acceptance criteria. Parent: `t_9b5ca941` (S03b). Assignee: `[codex@gpt-5.6-sol]`. Status at mint: `blocked`, gated on **A1 step 4 only** — the ratification gate is discharged. Transcribe §2.1's six-row table into the ticket **verbatim**, and carry §4.6 constraint 8 with it: the test's expected list is transcribed from this document, never read from `kinds.ts`.
3. **Amend A1 §6's execution order** by inserting step **4′** (§7.1). No step is removed or renumbered.
4. **Amend A1 §7.1**: the L2 re-approval covers **seven** slices. Append §7.2's charter line to lens 2.
5. **`t_c1651ebb` (S08), `t_3c54fdeb` (S09), `t_6c5e1a6e` (S10), `t_7efcd635` (S11)** — append §7.5 verbatim, **before dispatch**. For S09, S10 and S11 that is an acceptance note only, like A1 §1.5 item 3, and no contract changes.
5a. **`t_c1651ebb` (S08) — APPLY §4A AS A CONTRACT EXTENSION, before dispatch (V-5(c)).** This one *is* a contract change: `contract.allowed` gains the named region **`obs-context-hook`** (§4A.7, located by its anchor pair, never by line number); `contract.readonly` gains `packages/obs-capture/src/{context,kinds}.ts`; `contract.forbidden` gains A-1..A-5; the `risk_tier: high` **reason** is restated (the hook runs on every request, including all three excluded-zone routes); the security-lens charter gains §4A.7's line; traceability gains OBS-R034, Batch-7, R-E4, RT-08/IC-2, A.4. Attach §4A.8's RED and all twelve `S08-ctx-acc-*` criteria. **NOT A DEFECT RETURN — S08 has never been dispatched, `rework_round` is not incremented, and nobody is charged.** Add the dispatch gate: **S08 is not dispatched until S03c has landed and L4 has branched off the post-addendum base** (§7.6).
5b. **`t_220330f5` (S18)** — attach §4A.5's amendment as an implementation obligation on the **maturity fold** (S18/S20): the `count(DISTINCT run_ref/work_item_ref)` that feeds fingerprint maturity **excludes occurrences with `capture_point = 'http'`**, and excludes nothing else. **`t_aab2d3d2` (S16)** — record that `S08-ctx-acc-10` is a standing criterion, and that its negative control (the `http` rows are present and keep their `run_ref`) is part of it.
6. **`t_aab2d3d2` (S16)** — replace `G1-acc-1` with §6.2, including the mandatory falsification proof. Record that the word "non-null" is struck and must not return.
7. **`t_220330f5` (S18)** — attach §5 as the A.5 predicate contract: the replacement text (§5.2), the derived window (§5.5) with its hard floor, and §5.6's two-sided falsification criterion.
8. **Plan artifacts** — apply §5.2 to `FinalPlan.md` §A.5 and `Plan.md` §A.5; add `obs.captureGapQuietWindowMs` to the B.3 bound list with §5.5's derivation as its provenance and a **seed** label; apply §6.2 to `FinalPlan.md` §G1 acceptance item 1 and to `VerticalSlices.md` §1 S06 and S16; add S03c to `VerticalSlices.md` §1, to the §3 L2 row, and to §4 step 2′.
8a. **§9 H-5 is ANSWERED (V-6) — do not re-route it.** Apply §4A.5's amendment to `FinalPlan.md` §A.4 and `Plan.md` §A.4, **in the maturity-counting sentence only**, carrying §4A.5's "what this does NOT change" table alongside it so no later reader widens the exclusion beyond `capture_point = 'http'`. Record on the board that **no open human decision remains in this document.**
8b. **Plan artifacts for §4A** — add S08's `obs-context-hook` region to `VerticalSlices.md` §1 S08, to §2's shared-surface table for `apps/api/src/index.ts` (which becomes **three** disjoint named regions in one lane, plus the `zone-route-mount region` writable by neither), and to the §3 L4 row. **Do not add a touchpoint row:** the hook is a region of a file S08 already owns, not a cross-lane touchpoint.
9. **Record that `0035` remains reserved and unclaimed**, and that H-3 was closed with **no migration** — so no later reader mistakes §5 for DDL.
10. **Hold L3.** No commit on `obs-lane-3-runner-cause` until step 5 completes; then the Router moves the pointer (§7.3). S06's six-item packet stays drafted and held, and **gains nothing from this addendum** (§7.4).
11. **Nothing here authorises a push or a merge. V performs every merge and every push (OBS-R129).**
