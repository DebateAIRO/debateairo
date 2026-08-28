# GOAL PACKET — S02 REGISTRY ADDENDUM — ticket `t_8e040ec2`

**CONTRACT AMENDMENT, NOT A DEFECT RETURN. `rework_round` is NOT incremented. You are charged nothing.**
**GATED ON RP-0 (`t_4deda7ab`) — a custodian act reserved to V. Do not start until the Router confirms RP-0 carries a ratified hash.**

## 0. Read first
1. `docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` **§4** (your contract) and **§6.1** (typecheck). Authoritative.
2. `docs/missions/2026-08-21-observability-loop/planning/S02-registry-pin-correction.md` **§3.2a** — recipe **v1.1**, recorded there with the Router's read-only verification.
3. Your ticket and RP-0: `hermes kanban --board observability-loop show t_8e040ec2` and `… show t_4deda7ab` — `--board observability-loop` **before** the verb; never `boards switch`.

## 1. S02 HAS NO DEFECT. This is a recipe gap, and it is not yours.
Your registry reproduced its pin faithfully — `derived` 276, `declared_gap` 7, `authored` 2, verified by an architecture seat as **exactly** the pinned contents. What was wrong is the **recipe**, which lives in a `docs/` artifact no lane owns.

Recipe v1's `direct` pass matches only literal `new TypedDomainError("CODE",`. It is structurally blind to a code declared by a **subclass**. `packages/providers/src/index.ts` contains **zero** occurrences of `new TypedDomainError` — it declares its codes through class declarations — so two real, reachable product codes were invisible to the pin.

**The observable consequence, measured through the live redactor:**
```
input  code=PROVIDER_CALL_FAILED
output code=OBS_CAPTURE_SELF  taxonomy=CAPTURE_SELF  capture_point=self
       disposition=SELF  attempt_index=null  fallback_minimized=true
```
versus the registered control:
```
input  code=CALL_BUDGET_EXHAUSTED
output code=CALL_BUDGET_EXHAUSTED  taxonomy=PROVIDER_EXHAUSTED
       capture_point=provider  fallback_minimized=false
```
So the provider seam produces **zero durable provider occurrences** — the exact outcome §4.2's `declared_gap` partition was pinned to prevent, namely *"an unexplained `fallback_minimized`"* instead of a ratified fact.

## 2. What changes — two files, and nothing else
- `packages/obs-capture/src/registry/index.ts` — the `DECLARED_GAP_CODES` array only.
- `tests/unit/obs-l2-s02-registry.test.ts` — the gap literal and its length only.

`contract.allowed`, `contract.forbidden` and `tests:` are otherwise **unchanged**. `contract.readonly` is amended so the pinned value you must reproduce is **RP-0's**, superseding the stale `d1e9b67d…`. `Traceability` gains **OBS-R011** and **RP-0**.

## 3. `declared_gap[]` goes 7 → 9. The two new members:
```
PROVIDER_CALL_FAILED
PROVIDER_CONTENT_UNACCEPTED
```
Full expected payload, nine members, `LC_ALL=C sort -u`:
```
EVALUATOR_DOMAIN_MODEL_ID_INVALID
EVALUATOR_DOMAIN_MODEL_VERSION_INVALID
EVALUATOR_DOMAIN_PROVENANCE_INVALID
EVALUATOR_DOMAIN_PROVIDER_INVALID
EVALUATOR_DOMAIN_RUN_ID_INVALID
PROVIDER_CALL_FAILED
PROVIDER_CONTENT_UNACCEPTED
SCORECARD_TASK_CLASS_AMBIGUOUS
SCORECARD_TASK_CLASS_UNRESOLVED
```

## 4. YOU TRANSCRIBE THE HASH. YOU DO NOT COMPUTE IT.
The `declared_gap` sha256 in your test is **transcribed verbatim from RP-0**. Do not derive it, do not recompute it, do not "check" it by regenerating and comparing — **the seat that implements must not be the seat that ratifies**, and a pin computed by the implementer is not a pin. If your implementation and RP-0's value disagree, that is a **finding**: stop and post a blocker.

**Router computed no hash either.** Router verified only that recipe v1.1's `subclass` pass, written independently from the rule, reproduces the 115-file scope and yields **exactly** those two codes. The union and its hash are the custodian's.

## 5. WHAT MUST NOT CHANGE — this is the load-bearing constraint
- **`derived[]` is untouched**, and the ratified `code_seed` hash `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451` **must still reproduce**. Registering the new codes into `derived[]` was **explicitly rejected** because it would break that hash and make it unreproducible from the frozen tree.
- Mapping either code to an already-registered code was **rejected as falsification** — it defeats OBS-R011.
- The `^OBS_` namespace fence must still hold: `assertRegistryCodePartitions` must still throw on any `^OBS_` member outside `authored`. Neither new member matches, so the fence is untouched — assert it anyway.
- The **crypto family stays out**, by V's ruling (H-1): it needs a type-aware rule and a widened class rule would harvest excluded-zone `Error` subclasses. See §3.2a's closing paragraph. Do not extend the pass.

## 6. RED — reproduce-first, mandatory
Run the **live shared redactor** on `{ code: "PROVIDER_CALL_FAILED", taxonomy_class: "PROVIDER_EXHAUSTED", capture_point: "provider", disposition: "THROWN", source: "first_party" }` and show the resulting envelope is `OBS_CAPTURE_SELF` / `CAPTURE_SELF` / `self` / `fallback_minimized: true` — **the code the product actually throws is invisible in the durable record.** Paste it. Run the `CALL_BUDGET_EXHAUSTED` control alongside so the difference is attributable to registry membership and nothing else.

## 7. GREEN
1. `validateRegistryCode` is TRUE for both `PROVIDER_CALL_FAILED` and `PROVIDER_CONTENT_UNACCEPTED`.
2. `DECLARED_GAP_CODES` has **9** members and reproduces **RP-0's** sha256; `derived[]` still reproduces `65ba47df…`.
3. The same redactor call now yields `code=PROVIDER_CALL_FAILED`, `taxonomy_class=PROVIDER_EXHAUSTED`, `capture_point=provider`, `fallback_minimized=false`.
4. A provider exhaustion and an untyped job failure produce **different fingerprints**. Today both collapse to one value — **that single number is the falsifier**; paste it before and after.
5. `assertRegistryCodePartitions` still throws on any `^OBS_` member outside `authored`.
6. **Enumerate the set in the test, not just its hash** — ratification is over the values, not over a black box.

## 8. Typecheck (§6.1)
Measure at your lane base and state it. **`TYPECHECK-BASELINE.md`'s count-0 pin at `80362d0` is VOID — measured in a dirty checkout. Do not cite it.** T-5 is fail-closed: `pnpm generate:contract` before measuring, then **positively assert zero module-resolution escape** from the worktree root. Escape is silent; a matching diagnostic count is **not** evidence of containment. Report your own resolution number and **do not absorb any discrepancy** you cannot explain.

## 9. Where you stop
Two files. No push, no merge, no Done, no ticket-split, no worktree or branch operation, no database action. End at **READY FOR PEER REVIEW** on `t_8e040ec2` with the RED, all six GREEN clauses, and the transcribed hash's provenance stated explicitly. Then stop.
