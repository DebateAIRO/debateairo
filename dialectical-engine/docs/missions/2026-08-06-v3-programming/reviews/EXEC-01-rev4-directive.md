# EXEC-01 rev4 directive — one blocking regression, orchestrator-verified live

**Diamond (DR-153), rev3:** Grok **APPROVED** (0 blocking). Opus 5
**CHANGES REQUESTED** (1 blocking, 6 advisory). Both must greenlight.

**This is NOT a severity disagreement like rev1.** Grok read the exact line and
described it neutrally — *"filters members by asker `riskTier`"* — without
tracing the consequence. Opus traced it. **The orchestrator then verified the
consequence live against the running API**, so you are not being asked to
adjudicate between two lenses; you are fixing a confirmed defect.

## Your three rev-1 closures HOLD. Do not touch them.

The Opus lens verified R1, R2 and R3 genuinely closed, and explicitly found
**no false factual claim in rev3**. It also confirmed the rev3 typecheck fix
still fails on a wrong typed code (checked against `@vitest/expect` internals),
and that claim sizing is genuinely fixed. Credit where due — this is a narrow
fix, not another round.

## BLOCKING — `/new` selects by the ASKER's tier; the engine resolves by the EFFECTIVE tier

**Where:** `apps/v2-ui/app/new/page.tsx:68` and `:74` —
`runCostEnvelope?.members.filter((member) => member.riskTier === riskTier)`,
where `riskTier` is the asker's pick.

**What the engine actually does:** `apps/api/src/index.ts:254-259` resolves the
envelope on `risk.effectiveRiskTier`, and
`packages/register/src/index.ts:356-365` **ESCALATES** the asker's tier to the
deployment floor whenever the policy outranks it. The acceptance deployment
ships that floor as register row `riskTier: "standard"`
(`acceptance/seed-register.ts:71`).

**Orchestrator's live proof, run against the standing API just now:**

```
POST /v1/asks  {"risk_tier":"casual", "depth_params":{"depth":1}, ...}
{"run_ref":"05ad1f79-6982-4ed4-8053-bc08753826b3","status":"QUEUED"}
HTTP=202
```

`casual` is ACCEPTED — it escalates to `standard` and the envelope resolves.
But on `/new`, choosing risk tier **casual** yields
`allowedEnvelopeMembers = []` → `depth = null` → `ready = false` → **Start never
enables**, under the false explanation *"Choose a risk tier with a ruled
run-cost envelope before starting."*

**So the form refuses an ask the engine demonstrably accepts.** It is a
REGRESSION from rev1, which posted that ask successfully. The repo's own tests
build exactly this ask: `tests/unit/v2ui-data-layer.test.ts:381-418` and
`acceptance/run-acceptance.test.ts:41` (`--risk-tier casual`).

**And the latent form is rev-1 BLOCKING-2 rebuilt through a new mechanism:**
rule `{depth 1, casual, 3}` alongside the standard member and the page would
disclose "up to 3 attempts" while the run may lawfully spend 9 — AC-76 drift,
re-created one layer up from where you fixed it.

**Why it slipped, and what that tells you about the fix:** the divergence now
lives in the PAGE's selection logic, which has no behavioural test. Your
divergence test landed one layer below it
(`tests/unit/v2ui-data-layer.test.ts:420-446`, which does fail correctly).

**Minimal close:** select the envelope member by the EFFECTIVE tier. The
`riskTier` policy row is already in the same `readDeployment` payload you
fetch. Do the selection inside a PURE FUNCTION in `lib/` — not inline in the
component — so the divergence test can finally sit where the divergence is. A
declared deferral does NOT close this one (unlike R3): it would leave a form
refusing a lawful ask in front of V's visual gate.

## Advisories — fix the cheap ones while you are in these files

1. **Page behaviour is still asserted on SOURCE TEXT**
   (`tests/unit/v2ui-pages.test.ts:62-68`). Better than rev1 (it ratchets
   against literals) but it still cannot fail on divergence. Extracting the two
   selection decisions into `lib/` pure functions closes this and the blocking
   finding together — that is why it is listed here.
2. **`exec01-rework-contract.test.ts:20` asserts `acceptance/main.ts` does NOT
   contain `claimNext(`.** That test breaks the moment someone fixes the very
   stall you declared as deferred — a test that punishes the fix. Re-express it
   so it pins the DECLARATION, not the absence of a future implementation.
3. **Non-typed rejections leave no trace at all**: `UNEXPECTED_ERROR` is honest
   and collides with no typed code, but the error is neither persisted nor
   written to stderr, and `main.ts:92-97` drops the composed reason on both
   stderr branches. Also: a typed error keeps its code but loses its
   parametrised message — DR-151 would now yield `COMPOSITION_UNRESOLVED` but
   not `"mixed"`. Record what you can without inventing.
4. **Adapter reduces a member's `depth_params` to its `depth` key**, so a
   richer ruled member would be offered by the form and then refused at submit.
   Note it or close it; do not leave it silent.

## Done when

Blocking closed with a RED that reproduces the casual-tier refusal BEFORE the
fix (reproduce-first, heartbeat v3.2.0 §4), advisories fixed or recorded, every
gate re-run and REAL output pasted — the orchestrator re-runs all of them
independently and a claimed-green gate has already been caught once in this
ticket. Update the handoff in place, then back to `review` with
`REWORK READY FOR HERMES REVIEW — EXEC-01 rev4`.
