# S07 ownership ruling — the OBS-R064 false-record branch

**Seat:** ARCHITECTURE (Claude Opus, intake amendment A4) · **Mission:** 2026-08-21-observability-loop
**Date:** 2026-08-26 · **Trigger:** `CODEX BLOCKED` on `t_9f4e5bfb` (S07), blocker type `file_contract`
**Roster note (V A5 as corrected):** worked independently by this Opus seat and by Grok, blind. No Grok output was sought or read.
**Authority:** architecture decision. Not a V ruling — see §7 for the one optional V question, which does **not** gate the lane.

---

## 1. RULING (one line)

**S06 owns the false-record branch.** Not by carve-out and not by defect-rework: **it already owns it under its existing contract.** The conflict is a *criterion mis-attribution* in the slice text, not a boundary dispute. The fix is to move **one clause** from S07's RED→GREEN to S06's, and **no allowed / forbidden / readonly boundary moves anywhere in the mission.**

Route (a) and route (b) as the worker framed them are both wrong in their premise — (a) assumes the branch must be *granted* to S06, (b) assumes it must be *carved out* for S07. Neither is needed. This is framing **(c): relocate the criterion, not the region.**

---

## 2. Verification of the code claim (done independently, in the L3 worktree)

Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-3/dialectical-engine`
Branch `obs-lane-3-runner-cause`, HEAD `7a3ff39`, with S06's **uncommitted** edits to `apps/runner/src/index.ts`, `apps/runner/src/main.ts` and one new test file.

Per the V-ruled convention on `t_9f4e5bfb` (2026-08-26 13:42), **line numbers are non-normative and are quoted with the commit they are true at.**

**CONFIRMED — the defect is real and exactly as reported.** In `declareHatchetWalkingSkeletonTask`, inside the `catch (error)`:

- at **`7a3ff39`** (lane base, pre-S06): `recordTerminalFailure` call `:2514-2518`; `if (!recorded) { throw new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", dispatch.workItemId); }` at **`:2519-2521`**; `throw error;` at `:2522`.
- in the **current working tree** (post-S06): the same branch at **`:2536-2538`**, the replacement throw at **`:2537`**, `throw error;` at `:2539`.

On the `recorded === true` path the original propagates correctly. **Only the `!recorded` path destroys it.**

**CONFIRMED — S07's three allowed regions contain no record-or-rethrow site.** Read directly:
- `packages/kernel/src/index.ts:283-288` — `TypedDomainError` is causeless (`constructor(readonly code: string, message: string) { super(message); }`). Construction only.
- `packages/db/src/index.ts:14-18` `typedPoolFailure` — a pure wrap; attempts no recording. `:69-72` `createPool`'s `pool.on("error")` — memoises and `console.error`s; never rethrows.
- `apps/runner/src/index.ts:883-890` `buildSchemaRepairPacket` — builds a message array; contains no `throw` at all.

The worker's read is correct. There is **no lawful site inside S07's grant** that can make that handler propagate the original.

**CONFIRMED — it is the only such handler in product code.** Swept `apps/ packages/ tools/ acceptance/` for `recordTerminalFailure` / `if (!recorded` / `NOT_RECORDED`. The single production record-then-rethrow handler is the one above. (Residual, **out of scope, no contract touched**: `acceptance/main.ts:105-113` has the analogous shape and also loses the original — it writes `ACCEPTANCE_FAILURE_STATE_NOT_RECORDED` to stderr and swallows. `acceptance/**` is granted to **no slice** in this mission. Logged here only so it is not later mistaken for a gap in this ruling.)

---

## 3. Why S06 — the decisive finding

**The branch is inside S06's allowed region, and always was.**

S06 `allowed:` — `apps/runner/src/index.ts` region **`task-catch` (`declareHatchetWalkingSkeletonTask` `:2494-2526`)**. At `7a3ff39` the false-record branch sits at `:2519-2521` — **squarely inside `:2494-2526`**, and inside the function that names the region syntactically. Under VerticalSlices.md §1 (line 90), *"where a region is defined syntactically (a block, a function), the **syntax is authoritative**"* — the region **is** `declareHatchetWalkingSkeletonTask`, whole. The `if (!recorded)` block is part of it.

**And S06's readonly pin does not cover it.** S06's `readonly:` names `apps/runner/src/index.ts:2506` (`retries`), **`:2514` (`recordTerminalFailure`)**, `:1226-1232`. The `:2514` pin is the `recordTerminalFailure` **call** — it exists so S06 places capture *before* the call rather than replacing it. The `if (!recorded)` block at `:2519-2521` is a **separate statement, outside that pin**, and is freely writable by S06 today.

So S06 has had full, unambiguous, unshared write authority over the defective branch from the moment its contract was written. **Nothing needs to be granted.** The only thing S07 ever held here was a *sentence* — and that sentence was transcribed onto the wrong slice.

**Corroborating: the contract authors were already treating this site as S06's.** S06's own RED→GREEN is *about* this call site (`capture fires before recordTerminalFailure`), and S06's readonly list pins that exact call as a landmark. S07's contract never names the handler at all; it names it only to **forbid** it.

---

## 4. Why not route (b) — the carve-out — stated plainly

Rejected on three independent grounds; any one is sufficient.

1. **It would be the mission's first sub-declaration region.** Every region in this mission is a whole named syntactic declaration: `TypedDomainError`, `typedPoolFailure`/`createPool`, `buildSchemaRepairPacket`, `declareHatchetWalkingSkeletonTask`, `createPostgresProviderGateway`, `api.setErrorHandler`. A carve-out would hand three lines *inside another slice's function body* to a second owner. That is a **new region grammar**, invented mid-flight, and it is precisely the shape §2/§3 collapsed co-tenants into single lanes to avoid. The blocker's own framing is right that this sets a precedent — and it is a worse precedent than it looks, because it is not "two regions in one file" (that already exists lawfully as TP-9) but "two owners in one function".

2. **It breaks the review artifact.** S06 is at READY FOR PEER REVIEW. Its reviewer reads `declareHatchetWalkingSkeletonTask` as a unit. A later slice mutating three lines inside that function means **the reviewed artifact is not the shipped artifact** — the review's subject changes after the review, silently, and nothing in the diamond catches it.

3. **It routes the fix to the wrong reviewer.** S07's review reads kernel/db **error-construction** semantics. The false-record branch is **runner task-failure** semantics — Hatchet retry classification and terminal-state handling. That is S06's reviewer's competence, not S07's.

---

## 5. Why the "rework round" objection does not bind

The blocker frames (a) as *"costs a rework round on a slice with no defect of its own."* Both halves need correcting:

- **It is not a defect finding.** S06 built exactly what its contract said. The contract was incomplete. The worker is **not** charged a defect, and the rework is not a QA return — it is a **contract amendment applied before review**.
- **This is the cheapest possible moment.** S06 is READY FOR PEER REVIEW but the review has **not been performed**. No approved work is invalidated; no verdict is unwound; no merge is reopened. Every other route pays strictly more. Waiting until after S06's review, or deferring the criterion to a later slice, converts a free amendment into a genuine re-review.

**And there is no ordering inversion.** The obvious worry — that the correct fix needs S07's `cause` option (OBS-R062), which lands *after* S06 in the lane — does not hold. S06 already wires `capture?.emit(...)` in that same catch, and **`RUNNER_FAILURE_STATE_NOT_RECORDED` is already a registered stable code** (`packages/obs-capture/src/registry/index.ts:228`, S02, needs no edit). So S06 can, alone and in its current lane position, propagate the original to the caller **and** keep the record-failure alarm on the observability channel. The criterion in §6 is written to be satisfied in full by that shape. The lane order **S06 → S07 is unchanged.**

**Product-truth note (why the criterion is sound and must land).** S06's existing capture already sends the *original* error to the obs channel. The surviving defect is **propagation to the caller**: on `!recorded`, Hatchet's retry/terminal machinery and every upstream handler see a synthetic `RUNNER_FAILURE_STATE_NOT_RECORDED` instead of the real failure, so retry classification and terminal reason are computed from the wrong error. Real defect, correctly identified by the worker. It lands in S06.

---

## 6. EXACT CONTRACT TEXT TO CHANGE

Four edits. Two documents each, kept byte-identical: **`planning/VerticalSlices.md` §1** (the H5-PASSED source) and the corresponding **ticket body field** (`RED->GREEN obligation + falsifiable acceptance criterion` / `Traceability:`). The Router applies; this seat edits no ticket.

### 6.1 — S07 (`t_9f4e5bfb`), VerticalSlices.md line 166 — DELETE one clause

Delete **exactly** this substring, including its trailing `; `:

```
a handler that cannot record still propagates the original — re-throw never replaces (OBS-R064); 
```

On the ticket, the transcribed (upper-cased) form to delete is:

```
a handler that cannot record STILL PROPAGATES THE ORIGINAL — re-throw never replaces (OBS-R064); 
```

Nothing else on that line changes. S07 retains OBS-R062, OBS-R063, the `typedPoolFailure` rework, the `createPool` channel rebind, OBS-R049/R102 and OBS-R067 verbatim.

### 6.2 — S07 (`t_9f4e5bfb`), VerticalSlices.md line 167 + ticket `Traceability:` — drop R064

```
FROM: - **Trace:** OBS-R019/R049/R059/R062/R063/R064/R067/R102, C.1, **TP-9 / H4-01**.
TO:   - **Trace:** OBS-R019/R049/R059/R062/R063/R067/R102, C.1, **TP-9 / H4-01**.
```

### 6.3 — S06 (`t_5504afe0`), VerticalSlices.md line 158 — ADD to RED and to GREEN

**RED** — insert immediately after `RED — task failure emits nothing.`:

```
Additionally: when `recordTerminalFailure` returns `false`, the `if (!recorded)` branch inside `declareHatchetWalkingSkeletonTask`'s catch throws a NEW `TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", …)` that REPLACES the caught error, so the caller and Hatchet's retry/terminal machinery never see the real failure (verified live in the L3 worktree: `:2519-2521` at `7a3ff39`, `:2536-2538` post-S06 — SYNTAX IS AUTHORITATIVE, the numbers are non-normative anchors).
```

**GREEN** — insert immediately after `...retries fold into **one work unit** (RT-14/A.4).`:

```
A handler that cannot record STILL PROPAGATES THE ORIGINAL — on the `!recorded` path the error that leaves the handler is the caught `error` itself, or a wrapper whose `cause` chain contains it; the original is NEVER discarded, and the record-failure condition is NEVER signalled by discarding it (OBS-R064). The `RUNNER_FAILURE_STATE_NOT_RECORDED` signal must survive — carried on the capture channel (the code is already registered at `packages/obs-capture/src/registry/index.ts:228`, no registry edit) or as the wrapper's own code. NOTE: the wrapper shape depends on S07's `options?: { cause?: unknown }` (OBS-R062), which lands AFTER S06 in the lane; at S06's position only the direct-propagation shape is available, and it satisfies this criterion IN FULL.
```

Falsifiable as written: a `RunnerFailureRecorder` stub returning `false` must cause the handler to reject with the injected original error (or with an error whose `cause` chain reaches it), and never with a bare `RUNNER_FAILURE_STATE_NOT_RECORDED` that has no link to it.

### 6.4 — S06 (`t_5504afe0`), VerticalSlices.md line 159 + ticket `Traceability:` — add R064

```
FROM: - **Trace:** OBS-R017/R018/R024, RT-14/R34, FID-05.
TO:   - **Trace:** OBS-R017/R018/R024, **OBS-R064**, RT-14/R34, FID-05.
```

### 6.5 — Explicitly UNCHANGED

- **No `allowed:` list changes.** Anywhere. S06 keeps `task-catch` + `gateway-seam` + TP-5; S07 keeps `error-class` + `wrapper` + `buildSchemaRepairPacket`.
- **No `forbidden:` list changes.** S07's `forbidden:` **retains** `apps/runner/src/index.ts` regions `task-catch`/`gateway-seam` (S06, TP-9), verbatim. This is load-bearing: it is what keeps S07 a single-region writer in that file, and after this ruling S07's contract is internally consistent for the first time.
- **No `readonly:` list changes.** S06's `:2514` pin stands as written; it does not reach the `if (!recorded)` block.
- **No `tests:` changes.** The OBS-R064 test lands under S06's existing single glob `tests/integration/obs-l3-s06-*.test.ts` — natural home `tests/integration/obs-l3-s06-runner-binding.test.ts`, which already exists in the worktree. Partition key `obs-l3-s06-` stays disjoint from `obs-l3-s07-`. **No new glob, no §0 GLOBAL-TEST-SURFACE amendment, no `tests/support/**` edit.**
- **No TP-9 change.** `apps/runner/src/index.ts` remains: S06 = 2 regions, S07 = 1 region, same lane, ≥1600 ln apart, sequential single-writer.
- **No lane, merge-order, or gate change.** L3 in-lane order stays **S06 → S07**; merge order §4 step 3a unchanged; both stay G1.
- **Excluded zone untouched.** This ruling names no zone file and moves no zone boundary.

---

## 7. Non-disturbance check — every other slice

Swept every OBS-R064 reference across the mission tree.

| Surface | Status |
|---|---|
| **S01** (`packages/db` `obs-reexport`) | Undisturbed — different file region, different lane. |
| **S02** (`packages/obs-capture/src/registry/**`) | Undisturbed — **read only, no edit**. `RUNNER_FAILURE_STATE_NOT_RECORDED` already exists at `:228`. |
| **S05, S08, S09, S10, S11** | Undisturbed — none traces OBS-R064. S08 traces R016/R053 only. |
| **S12 / S13 (L6 inventory baseline)** | Undisturbed. The rule is "snapshot **after L3/L4/L5 land**"; both S06 and S07 are in L3, so moving a clause between them changes nothing. S07's ticket NOTE stands as written. |
| **S16 (G1 acceptance)** | Undisturbed. G1-acc-1 asserts one `JUDGEMENT_POLICY_UNRESOLVED` occurrence with `capture_point=job` and non-null refs. The added criterion is purely additive and changes no assertion. |
| `FinalPlan.md:530` (requirement→design-section coverage) | Undisturbed — maps R064 to design sections `C.1, B.2`, **names no slice**. No edit needed. |

**No other slice's contract is disturbed. Confirmed.**

**Non-contract residual (hygiene, OPTIONAL, does not gate anything).** `FinalPlan.md:153` and `Plan.md:134` carry the same R064 sentence inside the **D05d** design paragraph — the identical mis-attribution one level up, since the branch belongs to D05b's region under the TP-9 touchpoint split. These are upstream design prose, **not slice contracts**, and are superseded at slice granularity by VerticalSlices.md (the H5-PASSED artifact the tickets cite as SOURCE). Recommend a one-clause corrective note if the Router is editing those files anyway. **The unblock does not depend on it, and no lane writes these files.**

---

## 8. Is a V ruling required?

**No. This is an architecture decision and it is made here.** It moves no boundary, drops no requirement, adds no scope, invents no region grammar, and changes no lane/merge/gate. It corrects a transcription error against a contract that already assigned the territory.

Two adjacent process points, both resolved without V:

- **Does amended S06 re-enter peer review from the top?** No, provided the review has not begun — which is the state on the board (S06 `todo`, unassigned, at READY FOR PEER REVIEW handoff). The reviewer simply reviews the amended artifact once. **If the Router finds a review already in flight**, that review is void and restarts, because its subject changed. Router checks; no escalation.
- **Who may return a handed-off, unreviewed slice to its worker?** Ordinary Router routing. The §7 guard-rails bar the *worker* from ticket-splitting and self-Done; they do not reserve pre-review rework to V. V's reserved acts — merge (OBS-R129) and acceptance — are untouched.

### The one V question — OPTIONAL, non-blocking

> **Does V want the false-record branch's final shape to be the OBS-R063-style wrapper `new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", workItemId, { cause: error })` rather than direct propagation? If yes, L3's in-lane order must flip to S07 → S06, which reverses V's own epoch-1 lane dispatch naming S06 then S07 — and reordering a V-issued dispatch is V's call, not architecture's.**

**Default if V does not answer: NO.** Direct propagation plus the capture-channel alarm satisfies OBS-R064 in full at S06's current lane position, and is arguably the better product shape — "we could not record the failure state" is an *observability* alarm, not something to smuggle out through the caller's exception path. **The Router should apply §6 and release the lane immediately; do not hold S06 or S07 waiting on this question.**

---

## 9. Router action list

1. Apply §6.1 and §6.2 to `t_9f4e5bfb` and to VerticalSlices.md §1 S07 (lines 166-167).
2. Apply §6.3 and §6.4 to `t_5504afe0` and to VerticalSlices.md §1 S06 (lines 158-159).
3. Return **S06** to its same worker/session for the OBS-R064 rework — **contract amendment, not a defect return**; state that on the ticket so the worker is not charged a defect.
4. On S06 GREEN + peer review, release **S07** with a fresh authorisation noting its contract is now internally consistent and its `forbidden:` list is unchanged.
5. Post §8's V question as **FYI, non-blocking, default NO**. Do not gate on it.
