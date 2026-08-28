# GOAL PACKET — S06 REWORK 1 — ticket `t_5504afe0`

**`rework_round: 1 of 3`. Three CHARGED items, three UNCHARGED contract amendments. One packet, one pass.**
**HELD until the L2 addendum lands and L3 fast-forwards. Do not start until the Router says the base has moved.**

## 0. Read first
1. `docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` §6.1 (typecheck, including the new fail-closed T-5).
2. Your ticket in full: `hermes kanban --board observability-loop show t_5504afe0` — `--board observability-loop` **before** the verb; never `boards switch`. It carries the three-lens code review, two blind architecture rulings, and V's rulings.

## 1. What was certified and is NOT reopened
Three blind Opus lenses reviewed S06. Certified by execution:
- **File contract exact.** A single sha256 over lines 1..2506 of `apps/runner/src/index.ts` proved S07's region byte-identical **and line-stable**. `apps/api/src/index.ts` diff exit 0. No push, no commit, no stash.
- **Zone wall clean**, traced not assumed: a runtime resolve-hook trace of the full import graph shows zero zone files, zero `apps/api`, zero `packages/db`; `src/zone/*` never loads.
- **Redaction holds under attack**: an adversarial error carrying a password, card number, asker id, email and API key in message, stack **and** cause, with hostile ambient refs, produced a durable envelope containing none of it — including when the `code` field itself was hostile free text.
- **Ids are literal declared `{kind, value}` pairs**; a diff-wide scan found no shape inference.
- **Both REDs honest and behavioural** — the OBS-R064 RED drives the real `declareHatchetWalkingSkeletonTask` through a client stub with a recorder returning false and inspects the object that actually escapes. No source-text inspection.
- **No evidence-integrity blocker.** Every checkable claim in your four handoff comments is true.
- **Typecheck settled in your favour**: your 16:48 measurement (9 / `98c8eb42…`) is TRUE and was reproduced independently. The 42 was a fresh worktree without the generated contract client, silently resolving against the parent checkout — proven by `tsc --traceResolution`, and you flagged it yourself rather than absorbing it.

**A ruling in your favour, recorded:** `recordTerminalFailure` moving `:2514 → :2531` with two spaces of added indentation is **COMPLIANT**. Line numbers are non-normative in this mission, anchors are semantic, and the amendment mandated a restructure that cannot be done without re-indenting. You disclosed the move accurately.

---

## 2. CHARGED — R1 · the hard-coded `OBS_CAPTURE_SELF`

`apps/runner/src/index.ts:2523` and `:2597`:
```ts
code: error instanceof TypedDomainError ? error.code : "OBS_CAPTURE_SELF",
```
`OBS_CAPTURE_SELF` is an **AUTHORED** registry code — the obs system's own self-report — whose sole lawful producer is the redactor's own `fallback()`, which always pairs it with `CAPTURE_SELF / self / SELF / fallback_minimized: true`. Because it **resolves**, the redactor takes the known-template branch and keeps your fields. Executed result for a plain `TypeError` out of `executeWorkItem`:

```
code=OBS_CAPTURE_SELF  taxonomy=JOB_FAILURE  capture_point=job
disposition=THROWN     attempt_index=3       fallback_minimized=FALSE
```

An ordinary product failure written durably as *"the capture subsystem failed, and this record is NOT minimized"* — asserted as trustworthy. Two consequences: the capture-health channel becomes unmeasurable, and since `fingerprint = sha256(code|taxonomy|runtime|package)`, **every untyped runner failure in the process collapses into one fingerprint** — the unit that later gates autonomous fixing. Directly against the mission's purpose.

**Required semantic:** a product call site **never** supplies `OBS_CAPTURE_SELF`. Emit the failure's own stable code, or **omit the `code` key entirely** and let the redactor read `error.code` — an architecture seat measured that omitting it is correct **both before and after** the registry re-pin, so you touch these lines once, not twice.

**Additionally: do not decide the code via `instanceof`.** Read `error.code` structurally and validate it as a string. This removes the cross-realm hazard rather than documenting it.

**No test covers this branch today** — every functional test injects a `TypedDomainError`. Your RED must be the untyped case.

## 3. CHARGED — R2 · assertion depth at the provider seam

The job test runs its entry through the **real shared redactor** (`:122-136`); the provider test asserts only the **pre-redaction queue entry** (`:305-322`). Same seam, two assertion depths — and the shallower one is where a real defect lived: `PROVIDER_CALL_FAILED` is not in the registry, so the redactor rejects the envelope and returns a capture-self fallback, and the provider seam produces **zero durable provider occurrences**. Your 16:48 claim that the seam "enqueues exactly once with `capture_point=provider`" is true of the queue and false of anything durable.

**Both seams must assert the POST-redaction envelope.** Adding that assertion turns the current green red — that is your RED.

**Blocking note:** the provider criterion **cannot go GREEN until the S02 registry re-pin merges**, which adds `PROVIDER_CALL_FAILED` to `declared_gap[]`. Implement it and leave it demonstrably **red-pending-S02** rather than weakening the assertion. The Router will confirm when S02 has landed.

## 4. CHARGED — R3 · the one unguarded call

`apps/runner/src/index.ts:2509` — `hatchetContext?.retryCount?.()` sits **outside every `try`**. If the SDK accessor throws, the task rejects *before* `executeWorkItem` runs, with no capture and no `recordTerminalFailure`. It is the one place the slice's otherwise-careful "observability never changes product semantics" discipline has a gap, and S06 introduced the line.

## 5. UNCHARGED AMENDMENT — A1 · OBS-R064 also covers a REJECTING recorder

Confirmed by execution: with a recorder that **throws** rather than returning false, the escaping error is the recorder's own, the original `JUDGEMENT_POLICY_UNRESOLVED` is **discarded**, and only one capture exists — no `RUNNER_FAILURE_STATE_NOT_RECORDED` alarm.

An architecture seat ruled this **inside** OBS-R064: the amendment says a handler that cannot record the failure must still propagate the original error, and a rejecting recorder propagates *its own* rejection and destroys the original — the identical harm by a different mechanism. It is inside your allowed region and one `try`/`catch` away. **Uncharged** — the branch is outside R064's literal words and pre-existed at your base.

## 6. UNCHARGED AMENDMENT — A2 · total gateway-seam coverage

`assertModelAttemptAllowed` and the `CALL_BUDGET_EXHAUSTED` throw sit **outside the inner `try`** and emit nothing. Both codes **are** already registered — so the cases that would redact cleanly today are precisely the ones excluded. Ownership was contested between two architecture seats; the Router resolved it on mechanics: **both throws are in `apps/runner/src/index.ts` inside your already-granted gateway-seam region, and S11's contract is confined to `packages/providers/src/index.ts`, so S11 cannot reach them.**

**Amended criterion:** the gateway seam captures **every** failure exit of `call()` — the provider-exhaustion throw, `CALL_BUDGET_EXHAUSTED`, and the `assertModelAttemptAllowed` refusal — each exactly once, each with its own code, none swallowed.

## 7. UNCHARGED AMENDMENT — A3 · re-key the install-first evidence

The L2 addendum **deletes the `unhandledRejection` registration** from all three installers — it was superseding Node's crash-on-rejection, so a boot failure survived and exited 0 in silence. Your install-first proof currently keys on that listener and **will break**. A reviewer read the exact assertions in your worktree (read-only, no writes):

- `tests/integration/obs-l3-s06-runner-binding.test.ts:378` — `if (unhandled < 1 || uncaught < 1) throw new Error("RUNNER_INSTALLER_NOT_FIRST")`. `unhandled` is now **0**, so the stub throws `RUNNER_INSTALLER_NOT_FIRST` instead of `DB_IMPORT_AFTER_RUNNER_INSTALL`.
- `:426-429` — `toMatchObject({ message: "DB_IMPORT_AFTER_RUNNER_INSTALL", unhandled: 1, uncaught: 1 })` fails on **both** `message` and `unhandled`.

**The install-first property is still provable** — re-key it on `listenerCount("uncaughtExceptionMonitor") >= 1` and, once the addendum has landed, `listenerCount("exit") >= 1`, both observed **before `@debateai/db` evaluates**. Do not weaken it to a source-text check.

## 8. Base change — MANDATORY before GREEN is measured
L3 fast-forwards onto the L2 addendum. R2 and A3 **cannot pass on the current base**. The Router performs the pointer move and will tell you the new base commit; your three uncommitted S06 files are stashed and reapplied around it. **Do not commit on `obs-lane-3-runner-cause` before that** — L3 having zero commits of its own is what makes the move free.

## 9. Unchanged
Every `allowed` / `forbidden` / `readonly` / `tests` entry stands verbatim. TP-9 stands. The S06 → S07 order stands. Merge order and gates stand. `Traceability` gains **OBS-R011**.

## 10. GREEN — the one invariant that catches R1, R2 and every future recurrence, at BOTH seams
> **`redacted.code === queued.payload_ref.code` OR `redacted.fallback_minimized === true`.**
> The durable record either carries the code that was emitted, or truthfully declares itself degraded. Never a third thing.

## 11. Typecheck (§6.1)
Measure at the **new** lane base after the fast-forward, and state it. **`TYPECHECK-BASELINE.md`'s count-0 pin at `80362d0` is VOID — measured in a dirty checkout. Do not cite it.** T-5 is fail-closed: run `pnpm generate:contract` before measuring and say you did, then **positively assert zero module-resolution escape** from the worktree root — escape is silent, and a matching diagnostic count is **not** evidence of containment.

## 12. Where you stop
No push, no merge, no Done, no ticket-split, no worktree or branch operation, no database action. End at **READY FOR PEER REVIEW** on `t_5504afe0` with every RED frame and the GREEN invariant demonstrated at both seams. **Disclose every tuning constant you choose.** Then stop.
