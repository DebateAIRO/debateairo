# Spec: a preview debate always ends with an answer, even when a model or a gate gives out

Status: SPEC (orchestrator, 2026-10-12, from the live incident of run b53b9a9e on 2026-10-11). Base: 8b3201d75
(the release live on the preview, R13). Binding: owner rules (a debate is never hard-stopped; always an answer;
unbilled refusals are free; no new user-facing text without the owner's wording; hosted and local unchanged, R9 of
`2026-10-11-preview-retry-and-opener-rotation-design.md`; no migration; no new register version). Orchestrator rulings
R-a, R-b and R-c below are taken under the owner's instruction "keep going" (2026-10-11).

## Incident (code @8b3201d75)

Run b53b9a9e, five makers, depth 2. Rotation pin: writer GLM (`preview:fixture-a`), checker DeepSeek, storyteller GLM,
story checker Haiku.

1. **Roots 0-3 written.** Panels: Qwen and GLM were refused many times, each a gate-proven unbilled 429.
2. **GLM's root 4 was refused, and the gate halted.**
   - The 429 was the DeepInfra gate's 20th unbilled release of the day, so the gate halted
     (`unbilled_release_ceiling`).
   - The resend was refused before reserving: the gate answered `PREVIEW_TEST_AUTHORITY_STOPPED`.
   - The app mapped that to `RUN_COST_ENVELOPE_MONEY_REACHED` (`packages/providers/src/preview-test.ts:438-451`).
   - The gateway wrote a counted FAILED row (`packages/providers/src/index.ts:2218-2253`).
   - The `JUDGE:root:i` catch turned it into a MONEY phase stop (`apps/runner/src/index.ts:6407-6412`).
   - This is a misdiagnosis: on the preview (`DEPLOYMENT_MODE=local`) there is no run money seam
     (`apps/runner/src/main.ts:201`).
3. **Serve walked the fallback order and died.**
   - `callServeRoleWithFallback` (`:2557-2590`) followed `servePhaseFallbackOrder` (`:2482-2516`): GLM, then MiMo,
     then Qwen. The price map is empty in local mode, so the order is roster order with the checker last.
   - Each hop sent one POST and wrote one FAILED row under the same key `COMPOSER:SYNTHESIZER:INITIAL:1`.
   - `countModelAttempts` counts per call-site key, not per maker (`packages/ledger/src/index.ts:673-688`), and the
     bound is 3.
   - So the fourth hop (Haiku, whose gate was ACTIVE) was refused `CALL_BUDGET_EXHAUSTED` before sending.
   - That code escapes serve, and the work item FAILED. No answer was served.
4. **Even without the gate halt the run was doomed.** A busy GLM root gets two unbilled refusals, a 10-minute hold, a
   final retry, then HALTED, then `MAKER_POSITION_UNAVAILABLE`, which kills the run at any root index
   (`:5996-6001, 6380-6385, 6414-6419`).

## Behaviour after the fix (preview only; hosted and local byte-for-byte unchanged)

**(b) Per-maker attempt accounting.**
- `countModelAttempts` and `findExhaustedModelAttempt` filter and group by `actor_ref` when the request asks for it.
- The flag is a request field such as `attemptScope: "actor"`, set only by `withPreviewProviderCallPolicy`.
- The counting gateway passes `actorRef` (`apps/runner/src/index.ts` ~9810), and the re-claim check reads per maker.
- `countRunModelAttempts`, the run-wide ceiling, is unchanged.

**(c) A halted gate is "unavailable", not "money". This fix is app-only; the gate change is later.**
- On `PREVIEW_TEST_AUTHORITY_STOPPED`, read the gate's `/remaining` (`packages/providers/src/preview-remaining.ts`).
- If it reports `state !== "active"` or `window_open === false`:
  - throw a non-money `PROVIDER_GATE_UNAVAILABLE`;
  - no resend;
  - the FAILED row is kept (it is per-maker now, so it never blocks another maker);
  - every member behind that gate is marked unavailable for the rest of the run.
- Otherwise keep today's mapping.

**(a) A fallback that knows about gates.**
- `servePhaseFallbackOrder` skips unavailable and sat-out makers, and prefers a maker behind a different gate than the
  failing one.
- `callServeRoleWithFallback` moves on:
  - MONEY;
  - `PROVIDER_GATE_UNAVAILABLE`;
  - `MAKER_SAT_OUT`;
  - a busy failure (a `ProviderCallFailedError` whose cause is a gate-proven unbilled refusal).
- The move records ROLE_UNAVAILABLE, not MONEY.
- If no maker is left, use the existing components-only floor. Never `CALL_BUDGET_EXHAUSTED`.
- Story: `packages/story/src/writer.ts` ~528 also moves on the runner's move predicate.

**(d) A busy member sits out the rest of the run.**
- A new per-run book (e.g. `apps/runner/src/run-sit-out.ts`) is built at claim next to `bodyGatewayFor`. It wraps each
  claim-eligible maker's gateway: judges, synthesis makers and story role makers.
  - **Before a call:** if the member sits out, throw `MAKER_SAT_OUT`. Nothing is sent and no row is written.
  - **After a call:** a `ProviderCallFailedError` ending in gate-proven unbilled refusals (the call plus its 60 s
    resend) marks that MODEL busy, all of its refs. Export a generic `providerCallEndedUnbilled(error)`.
  - **A gate unavailable (c)** marks every member behind that gate.
- **Roots:** skip members that sit out. A root HALTED by unbilled-only failures, or by `MAKER_SAT_OUT`, is dropped
  into a `satOutDuringRun` list instead of `MAKER_POSITION_UNAVAILABLE`. Billed failures keep today's behaviour.
  For root 0, the next eligible member opens.
- **Cooldown:** `withCooldownRetry` returns HALTED at once for a failure made only of unbilled refusals: no 10-minute
  hold (R-a). Billed failures keep the hold.
- **Panel seats** (`packages/judgement/src/s04.ts` `runJudgePanel`): leave out members that sit out.
- **Reviews:** exclude them from reviewer choice; if none is left, use the existing UNAVAILABLE outcome.
- **Expansion children by a sat-out author:** use the existing EXPANSION_HALTED path.
- **Disclosure:** merge into the existing CRITIQUE-UNAVAILABLE record, reason
  `RUN_PANEL_REVISED:<ref>=PROVIDER_BUSY|PROVIDER_GATE_UNAVAILABLE`, and ROLE_UNAVAILABLE for moved roles. No new
  reader text (R-b).
- **Fewer than 2 members left:** end the arguing as a non-money phase stop, then serve.
- Serve must accept a gap in the middle of the root set (root 4 dropped after roots 0-3). Prove it.

## Rulings

- **R-a.** One call ending in gate-proven unbilled refusals (the call plus its resend) makes the model sit out for the
  rest of the run. Unbilled-only failures get no 10-minute cooldown.
- **R-b.** Reuse the existing disclosures; no new text.
- **R-c.** Preview only now. The likely hosted twin bug (fallback hops sharing one allowance) becomes a follow-up
  with its own test.
- **Gate change, later and separate, with the owner's yes:**
  - an `AUTHORITY_HALTED` public code;
  - the daily unbilled ceiling;
  - the in-a-row streak counting only connect failures.

## Tests (red first, through the REAL runner; harnesses: tests/integration/preview-busy-model-run.test.ts, preview-unbilled-retry-ledger.test.ts)

- **T1, the incident replay.**
  - Setup: per-model and per-request-kind gate scripts. The DeepInfra gate model counts unbilled releases and halts
    at N, answering 409 `PREVIEW_TEST_AUTHORITY_STOPPED` with `/remaining state: "halted"`.
  - Five makers at depth 2, with the same pin as the incident.
  - Expect:
    - a SERVED answer and a story;
    - no `CALL_BUDGET_EXHAUSTED` and no MONEY reason;
    - GLM's root dropped, with `RUN_PANEL_REVISED`;
    - zero DeepInfra requests after the halt;
    - the writer and checker moved to Haiku (ROLE_UNAVAILABLE).
  - Control: 8b3201d75 must fail with `CALL_BUDGET_EXHAUSTED`.
- **T2: GLM refuses every call after claim, with no halt.** Expect:
  - exactly one GLM call (2 POSTs) after the first refusal, then none;
  - no 10-minute holds;
  - the run is served;
  - no `MAKER_POSITION_UNAVAILABLE`.
- **T3:** three FAILED rows by three makers at one key, then a fourth maker still sends. The re-claim check reads per
  maker.
- **T4:** `STOPPED` plus a halted `/remaining` gives `PROVIDER_GATE_UNAVAILABLE`, not MONEY.
- **T5:** hosted and local are unchanged. The existing hosted cases still pass; with nobody sitting out, the money
  fallback order is unchanged.

## Review amendments 2026-10-12

Rulings taken after the review of the first build (orchestrator, 2026-10-12). Where they differ from the sections
above, these win.

- **R-d. Only a vendor's refusal makes a model busy.** One unbilled refusal says the model is busy: the gate's
  `PROVIDER_REFUSED_UNBILLED` (the vendor answered 429 or "overloaded" and the gate proved it unbilled).
  - The app maps it to its own class, `PreviewVendorRefusedUnbilled` (a `PreviewUnbilledRefusal`), in
    `packages/providers/src/preview-test.ts`.
  - The predicate `providerCallEndedVendorRefusedUnbilled(error)` replaces the generic `providerCallEndedUnbilled`
    named in (d). It is true only when the call's last attempt (its 60-second resend) was the vendor's refusal.
  - The gate's own two unbilled refusals stay plain `PreviewUnbilledRefusal`s:
    - `CONCURRENCY_LIMIT_REACHED`: the gate's slots were full;
    - `PROVIDER_NOT_REACHED`: the connection failed before anything was sent.
  - They are still free: REFUSED rows, not counted, and the one 60-second resend, as today.
  - They do NOT make the model sit out, and they do NOT halt at once. They keep today's 10-minute cooldown hold and
    the final retry.
- **Finding 3. A review ends the arguing only when someone really sat out.**
  - `reviewEndsForMembersSatOut` (`apps/runner/src/run-sit-out.ts`) decides when the review guard ends the arguing as
    MEMBERS_SAT_OUT. That needs at least one member of the reviewer seats to sit out, and no reviewer of another
    maker left.
  - A node that never had a reviewer of another maker keeps today's `DIFFERENT_MAKER_REVIEWER_UNAVAILABLE`.
- **Finding 4. The book decides "halt at once".**
  - `withCooldownRetry`'s `haltsAtOnce` is now the run's book (`RunSitOutBook.haltsAtOnce`). The failure must be of
    a sit-out kind AND it must have come through that book's own gateway for a member that now sits out.
  - A busy failure from a gateway the book never wrapped keeps the hold and the final retry.
- **Tests added for these rulings and for the review's test gaps:**
  - T1 pins the exact `RUN_PANEL_REVISED` reason, derived from what the run did: GLM and Qwen PROVIDER_BUSY, DeepSeek
    and MiMo PROVIDER_GATE_UNAVAILABLE.
  - T1 reaches the "fewer than 2 left" path, and pins what it leaves: one authored root, a SINGLE-LINEAGE record
    naming the members, `body_stop` null and `points_without_review` 1.
  - A runner-level test proves the re-claim check counts per maker (`byActor`). It fails when `byActor` is removed.
  - T3: the sending maker's own rows at its bound are still refused `CALL_BUDGET_EXHAUSTED`, with 0 POSTs.
  - The CRITIQUE-UNAVAILABLE reason is pinned exactly when nobody sat out. A second test exercises the
    `CLAIM_PANEL_REVISED:…|RUN_PANEL_REVISED:…` join.
  - A source pin proves `apps/runner/src/main.ts` sets `runResilience` on the preview only.
