# Spec: a busy model never blocks a preview debate

Status: SPEC (orchestrator, 2026-10-11 ~19:30 UTC), from a live incident. Base: 8e81c6b5e (the release on the
preview, R12). Owner instruction (2026-10-11, in chat): investigate properly and come back only with a working
debate. The owner's standing rules apply: a debate is never hard-stopped; unbilled refusals are free (R1, R4 of
`2026-10-11-preview-retry-and-opener-rotation-design.md`); no migration and no new register version for this fix.

## Incident

- 19:15 UTC the owner's five-AI ask (depth 2) was refused with `ASK_PLAN_TIER_MODEL_UNAVAILABLE` ("a model this plan
  needs is not available right now").
- Cause chain (code @8e81c6b5e):
  - `apps/api/src/index.ts:4280-4293` `evaluateAskAdmission` refuses when ANY roster model is missing from the
    discovered panel.
  - Discovery (`apps/api/src/provider-discovery.ts:71-109`) probes every target in parallel, once, with no retry.
  - A gate-proven unbilled refusal (gate 409 `PROVIDER_REFUSED_UNBILLED` → `PreviewUnbilledRefusal`,
    `packages/providers/src/preview-test.ts:428-441`) becomes ABSENT `PROVIDER_PROBE_FAILED`
    (`packages/providers/src/provider-probe.ts:139-141, 163-172`), and the "unbilled" fact is lost.
  - GLM is probed TWICE at the same moment, because two reviewed refs (`preview:fixture-a`, `preview:fixture-b`) are
    both `zai-org/GLM-5.3-Flash` (`preview-models.ts:172-179`).
- DeepInfra has answered HTTP 429 to GLM-5.3-Flash on 8 of the last 9 calls.
  - That includes 5 single calls in a row, 40 s apart, between 19:19 and 19:26.
  - The other three DeepInfra models and Haiku answer every time.
  - DeepInfra docs: a 429 under the 200-concurrent limit means the model is busy.
  - The status page shows GLM-5.3-Flash "operational".
  - This is outside our control.

## Behaviour after the fix (preview only; hosted and local unchanged)

1. **One probe per model per discovery round.**
   - Targets with the same (baseUrl, model, adapter kind, probe controls) are probed once.
   - That one observation is written as one `core.provider_probe` row per ref, each with its own `probe_id`.
2. **One 60-second resend on a gate-proven unbilled refusal at ask time and at claim time.**
   - Applies to the API discovery probe and to the runner's claim probe (`apps/runner/src/main.ts:426-446`,
     `observeProviderTarget`).
   - Uses the same rule as debate calls (owner ruling 5 / R4).
   - Reading of the sealed `panelDiscoveryPolicy.probe_max_attempts: 1` (never edited): an unbilled refusal is not
     an attempt (R1).
   - The first observation is recorded as ABSENT with failure code `PROVIDER_PROBE_UNBILLED_REFUSAL`. The column is
     free text, so no migration is needed.
   - A billed failure gets no resend.
3. **A busy model sits out instead of blocking the debate.**
   - On the preview, a roster model missing from the panel does not refuse the ask when two things hold:
     - every probe of that model in this round ended in a gate-proven unbilled refusal (busy);
     - the remaining panel still satisfies the existing maker admission (`assertMakerAdmission`, at least the same
       minimum it enforces today; never fewer than 2 makers, which rotation needs).
   - The run's frozen panel then holds only the members that answered.
   - The rotation pin's eligible models come from that panel, so no job is pinned to the busy model.
   - The runner seats only the panel. It already drops members absent at claim and discloses that
     (`CLAIM_PANEL_REVISED`, `CRITIQUE-UNAVAILABLE`).
   - A model missing for any other reason (billed failure, wrong model, not served by the gate) still refuses the ask
     exactly as today.
4. **Estimate.** Unchanged in method. It prices the panel the ask actually admits; prove it by test.
5. **Disclosure.**
   - If the code already has a reader-visible way to say "AI X was unavailable and sat out", use it for the
     ask-time case.
   - Otherwise none is added in this fix; listing it as a follow-up is enough.
   - No new user-facing text without the owner's wording approval.

## Must be proven by tests (red first, through the REAL paths)

- Ask path:
  - Build the six reviewed targets with `createPreviewGuardedFetch` over the real budget RPC ports, against a
    Unix-socket stub answering 409 `{"error":"PROVIDER_REFUSED_UNBILLED"}` for GLM, then
    `createProviderDiscoveryResolver` → `evaluateAskAdmission` with the five-model preview config and an injected
    sleep.
  - (i) One GLM POST per round, not two.
  - (ii) GLM [409, OK] → admitted with five, one 60 s sleep, an ABSENT `PROVIDER_PROBE_UNBILLED_REFUSAL` row then a
    HEALTHY row.
  - (iii) GLM [409, 409] → admitted with FOUR (no GLM in the panel or the rotation pin), not refused.
  - (iv) GLM billed failure (HTTP 500 body) → no resend, ask refused as today.
  - (v) Hosted config unchanged.
- Runner, the key proof: a run admitted with four (GLM absent) is driven to a served answer and a story by the real
  runner over embedded Postgres, with scripted provider replies, at depth 2. Base it on the existing full-run
  integration tests in `tests/integration/database.test.ts` or `tests/integration/story-end-to-end.test.ts`.
  - Check the JSON-mode needs: GLM is the only `jsonObject: true` row (`preview-models.ts:130-131`). Find every step
    that needs JSON mode and prove it works, or falls back, without GLM.
- Claim probe: [409, OK] keeps the member.

## Out of scope (reported separately)

- `GET /v1/account/legal-status` → `DEPENDENCY_SQL_42_ACCESS_OR_SYNTAX`: the preview's API login most likely lacks
  `debateai_billing_runtime` (migration 0094). The fix is the principal provisioner re-run, which needs the owner's
  yes and rotates passwords. This is infrastructure, not code.
- Why GLM-5.3-Flash refuses: DeepInfra's side. The owner may check their DeepInfra dashboard (Account: limits,
  usage limit).
