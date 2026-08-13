# EXEC-01 — Opus 5 lens, rev 4

**Ticket:** `t_6fae713b` · **Author:** Codex (gpt-5.6-sol) · **Lens:** Opus 5 (dual diamond, DR-153)
**Date:** 2026-08-11 · **Mode:** read-only (no edits, no git, no board mutation)
**Independence:** I did not open `reviews/exec01-grok-rev4.md` (none present when I
listed the directory) and read no other lens's rev-4 material.
**Scope:** the rev-4 delta only. R1/R2/R3 were verified closed in my rev-3 verdict
and were not re-litigated; I confirmed only that the delta did not disturb them.

## Verdict

**APPROVED** — 0 blocking, 6 advisory.

The reported defect is genuinely closed for the deployment that is in front of
V's visual gate. I traced it end to end rather than trusting the handoff:

`/new` calls `selectRunCostEnvelopeMembers(members, "casual", "standard")`
(`app/new/page.tsx:71` and `:79`) → `effectiveRunCostEnvelopeRiskTier` escalates to
`standard` (`lib/runCostEnvelopeSelection.ts:13`) → the depth-1 / 9-attempt member
survives the filter → `depth = 1`, `ready = true` → POST carries
`risk_tier: "casual"`, `depth_params: {depth: 1}` (`page.tsx:106-113`) →
`apps/api/src/index.ts:254-258` resolves on `risk.effectiveRiskTier` →
`packages/register/src/index.ts:356-358` escalates `casual`→`standard` →
`resolveRunCostEnvelopeBasis` (`register:214-221`) matches `risk_tier: "standard"`
against the canonical `{depth:1}` fingerprint → 202. That is the same ask the
orchestrator observed accepted while the form refused it.

Agreement holds on the other branches the packet named, on the acceptance
deployment:

- **Floor ranks BELOW the asker** — asker `high-stakes`, floor `standard`:
  `indexOf("standard") > indexOf("high-stakes")` is false → asker kept. The
  engine's predicate is literally the same shape (`policyRank > askerRank`,
  `register:358`). Both keep `high-stakes`; the acceptance envelope has no
  `high-stakes` member, so the form shows no depth **and** the engine would throw
  `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` — the refusal is honest, not a false
  disable.
- **Floor equal to the asker** — not greater → asker kept. Agreement.
- **Floor absent (`null`)** — no escalation. This agrees with `register:357`'s
  `policyRank = -1` sentinel **for a register-row-sourced deployment**; see
  ADVISORY 3 for the wiring where it does not.
- **Floor malformed** — the adapter throws `RISK_TIER_POLICY_INVALID`
  (`lib/v3/adapter.ts:529-536`), the same typed code the engine raises at
  `register:353-355`; the form then shows `envelopeError` and offers nothing. One
  narrow exception in ADVISORY 4.
- **No tier chosen yet (`""`)** — guarded at `runCostEnvelopeSelection.ts:24` →
  `[]`, so the page discloses no attempt ceiling before a tier exists. Matches the
  engine's `z.enum` rejection.
- **AC-76 / the rev-1 BLOCKING-2 latent form** — a `{depth 1, casual, 3}` member
  sitting beside the standard member is now filtered OUT, so the page discloses
  "up to 9", which is what the run may lawfully spend. Pinned by
  `tests/unit/v2ui-data-layer.test.ts:461-465`.

Both page call sites go through the same function — the depth-normalisation
effect (`page.tsx:68-73`) and the render/ready path (`page.tsx:77-80`) — so the
depth dropdown and the Start gate cannot disagree with each other. The rev-4
handoff section contains no factual claim I could falsify; the advisory
disposition at handoff:363-367 matches the code in every particular I checked
(the `claimNext(` guard is still at `exec01-rework-contract.test.ts:20`,
`UNEXPECTED_ERROR` is still traceless at `acceptance/main.ts:71-75` and `:93-97`,
`depth_params` is still reduced at `adapter.ts:500-502`).

Four revisions in, this one is right. The advisories below are hazards and
coverage gaps, not defects — none of them makes the shipped form disagree with
the shipped engine today.

---

## ADVISORY 1 — the tier ORDER is now defined twice, and the second copy is importable-from-canonical

**Where:** `apps/v2-ui/lib/runCostEnvelopeSelection.ts:5`
```ts
const RISK_TIER_ORDER: readonly RunCostEnvelopeRiskTier[] = ["casual", "standard", "high-stakes"];
```
**Canonical:** `packages/kernel/src/index.ts:99`
```ts
export const RISK_TIERS = ["casual", "standard", "high-stakes"] as const;
```

**Answering the question directly: twice.** And not because the canonical
constant was out of reach — `apps/v2-ui` declares `@debateai/kernel` as a
workspace dependency (`apps/v2-ui/package.json:16`) and the sibling module in the
same directory tree already imports a *runtime* value from it
(`lib/v3/adapter.ts:8`, `TypedDomainError`). So `import { RISK_TIERS } from
"@debateai/kernel"` costs nothing new in the client bundle and was available. The
module whose entire justification was to stop this drift class opens by
re-declaring the vocabulary it is mirroring.

The risk-tier vocabulary now has four independent sites in this UI:

| Site | Form |
|---|---|
| `lib/runCostEnvelopeSelection.ts:5` | ordered array (**new in rev 4**) |
| `lib/api.ts:253` | `Set` (membership only, order-free) |
| `lib/v3/adapter.ts:467` | hand-written union type |
| `app/new/page.tsx:171-173` | three `<option>` literals |

**Honest severity.** I am not calling this blocking, because the *silent* failure
mode is narrower than it first looks. If a tier were **added** or **renamed** in
`RISK_TIERS`, the adapter's own validation would refuse the deployment loudly
(`adapter.ts:506` and `:529-536` throw `RUN_COST_ENVELOPE_INVALID` /
`RISK_TIER_POLICY_INVALID`) rather than mis-rank anything, and an *insertion*
preserves the relative order of the existing three. The silent divergence needs a
**reorder** of the existing tiers, or an edit to the comparison itself — and the
comparison is exactly what no test pins (ADVISORY 2). Those two advisories
compound: a duplicated ordering that no test cross-checks is how this ticket's
drift class survives into a fifth layer.

**Fix (one line, no behaviour change):** import `RISK_TIERS` from
`@debateai/kernel` and use it as the order; derive
`RunCostEnvelopeRiskTier` from kernel's `RiskTier` while you are there, which
would also single-source `adapter.ts:467`.

---

## ADVISORY 2 — the new test pins two values; it does not pin the rule, and the ranking comparison survives mutation

**Where:** `tests/unit/v2ui-data-layer.test.ts:456-466` — the only three
assertions that reach the new module, and every one of them uses the same input
pair (asker `casual`, floor `standard`).

The packet asks whether the test would catch a future drift between the UI's
escalation and the engine's. It catches **the reported drift** (page filtering by
the asker's tier) and nothing else. Three branches of the mirror are unexercised:

1. **The comparison at `runCostEnvelopeSelection.ts:13` (`>`)** is not pinned.
   Mutate it to `!==` and the suite stays green: `"standard" !== "casual"` still
   returns `standard` for both assertions. Under that mutant, asker
   **`high-stakes`** with floor `standard` is **DOWN**-graded to `standard`, so
   `/new` offers the standard depth-1 / 9-attempt member and sets `ready = true`;
   the submit posts `risk_tier: "high-stakes"`, the engine keeps `high-stakes`
   (`register:358`), and `resolveRunCostEnvelopeBasis` (`register:214-221`) throws
   `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`. A form that says ready and then fails at
   submit — the mirror image of the rev-3 defect, undetected by the suite.
   `>=` is the same story.
2. **The `null` branch (`:12`)** — no test passes a null floor. (It is
   behaviourally redundant with the `indexOf` sentinel, so this one is cheap.)
3. **The invalid-asker guard (`:24`)** — no test passes `""`. Without it, the
   empty initial tier ranks `-1`, escalates to the floor, and the page would
   disclose an attempt ceiling before the asker has chosen a tier at all.

`effectiveRunCostEnvelopeRiskTier` is exported and never called by any test.

**What would actually be a divergence test:** drive `effectiveRunCostEnvelopeRiskTier`
and `resolveEffectiveRiskTier` (`packages/register/src/index.ts:339`) over the
same 3×4 table (three asker tiers × three floors + no floor) and assert equal
outputs. That single test pins the comparison, the null branch, **and** the tier
ordering — i.e. it closes ADVISORY 1 by construction instead of by discipline.
The root suite already imports from `@debateai/kernel`
(`v2ui-data-layer.test.ts:2`), so nothing stands in the way.

---

## ADVISORY 3 — the FLOOR's source differs between the two shipped API compositions; the UI mirrors one of them

The UI reads the floor from the deployment register row `riskTier`
(`lib/v3/adapter.ts:527-528`). That is exactly right for the acceptance runtime,
where the engine reads **the same row**: `acceptance/seed-register.ts:71` seeds
it, `acceptance/runtime-policy.ts:30,181` parses it, and
`acceptance/main.ts:265-268` feeds it to `resolveEffectiveRiskTier`. Single
source, genuinely. That is the standing stack on API 8790 / UI 3000, which is why
the blocking defect is closed for the gated path.

The other composition does not use that row at all:

- `apps/api/src/main.ts:30-39` supplies the floor from
  `environment.DEPLOYMENT_RISK_TIER` (`packages/register/src/runtime-environment.ts:39`).
- No `riskTier` register row is seeded anywhere outside `acceptance/`
  (`register.bootstrap.json` carries five version rows and none of them is
  `riskTier`), while `readDeployment` (`apps/api/src/index.ts:338-372`) simply
  serves whatever rows exist.

**Concrete failing case:** point `apps/v2-ui` at `pnpm --filter @debateai/api
start` with `DEPLOYMENT_RISK_TIER=standard`, a `runCostEnvelope` row holding a
standard depth-1 member, and no `riskTier` row. The UI sees
`deploymentRiskTier === null`, declines to escalate, filters `casual` to `[]`, and
disables Start under "Choose a risk tier with a ruled run-cost envelope before
starting" — while `POST /v1/asks` with `risk_tier: "casual"` returns 202. That is
the rev-3 defect verbatim, reproduced against the other entrypoint.

**Why this is advisory and not blocking:** the deployment in front of V's visual
gate is the acceptance runtime, where the row is the engine's own source, and the
directive explicitly prescribed this row as the fix. But "the UI's escalation
agrees with the engine" is true of one of two shipped compositions, and nothing
asserts the env var and the register row agree. The durable fix is on the engine
side, not the UI's: either make `apps/api` resolve its floor from the same
register row, or serve the resolved floor/effective tier on the deployment
projection so the UI has nothing left to mirror.

**Same family, currently inert:** the engine resolves the policy across three
levels in priority order (`parent`, `run`, `deployment` —
`packages/kernel/src/index.ts:172`, consumed at `register:324-328`). The UI
mirrors the deployment level only. Both shipped wirings pass `parent: {}, run:
{}`, so this bites nothing today; it would bite silently the day a run-level or
parent-level floor is supplied.

---

## ADVISORY 4 — a present-but-null `riskTier` row is read as ABSENT, where the engine's rule reads it as INVALID

**Where:** `apps/v2-ui/lib/v3/adapter.ts:528`
```ts
const deploymentRiskTier = riskTierRow?.value ?? null;
```
The contract types the row value as `z.unknown()`
(`packages/contract/src/index.ts:144`), so `{row_key: "riskTier", value: null}`
parses fine and collapses into the same `null` the adapter uses for "no row at
all" — the subsequent validity check at `:529-536` never sees it, and the UI
silently declines to escalate.

The engine draws that line differently: `resolveRegisterValue` keys on
`Object.hasOwn` (`packages/register/src/index.ts:325`), so a present-but-null row
IS the policy value, and `register:353-355` throws `RISK_TIER_POLICY_INVALID`.
So for a register-row-sourced deployment the UI treats as "no floor" what the
engine's own rule declares a malformed deployment.

Unreachable in both shipped wirings (acceptance's `z.literal("standard")` and
`apps/api`'s `z.enum` each refuse to boot first), so this is robustness, not a
live defect. One-line fix: `riskTierRow === undefined ? null : riskTierRow.value`
and let the existing check throw. Related: the handoff's inventory line 10 says
"absent/malformed policy is loud and has no literal fallback" — true of
`runCostEnvelope`, not of the `riskTier` floor row, whose absence is silent by
design. Not a false claim, but the sentence covers two rows with one predicate.

---

## ADVISORY 5 — rev-3 advisories: recorded honestly; one cheap ratchet still missing

The packet asks for fixed-or-recorded, and the disposition at handoff:363-367 is
honest on all four. Verified against the code, not the prose:

1. **Page behaviour on source text — genuinely improved.** The two selection
   decisions are now behavioural (`lib/runCostEnvelopeSelection.ts`), and
   `tests/unit/v2ui-pages.test.ts:62-68` is reduced to a wiring check. **The
   ratchet is one-sided, though:** it asserts the page *contains* both selectors
   but not that it *lacks* an inline asker-tier filter, so a future edit could
   re-add `members.filter((m) => m.riskTier === riskTier)` alongside the imports
   and stay green. `expect(newPage).not.toMatch(/riskTier === riskTier/)` closes
   it.
2. **`exec01-rework-contract.test.ts:20`** (`not.toContain("claimNext(")`) is
   unchanged and still breaks whoever fixes the declared stall. Consciously
   deferred at handoff:364 with the reason given — acceptable under the packet's
   terms, and correct discipline for a narrow rework. It should not survive the
   ticket that ships the reaper.
3. **Non-typed rejections still leave no trace** — `acceptance/main.ts:71-75`
   maps to `UNEXPECTED_ERROR` without persisting or logging the error, and
   `:93-97` still drops the composed reason on both stderr branches. Recorded at
   handoff:365.
4. **`depth_params` reduced to `depth`** — `adapter.ts:500-502`, recorded at
   handoff:366 with the right consequence named (a richer ruled member would be
   offered and then loudly refused at submit, since `resolveRunCostEnvelopeBasis`
   fingerprints the whole object at `register:213-216`).

---

## ADVISORY 6 — `lib/v3/adapter.ts` is grep-opaque (two NUL bytes), and it is a delta file

`apps/v2-ui/lib/v3/adapter.ts:595` uses two literal NUL characters as key
separators:
```ts
const key = `${entry.model_id}\0${entry.model_version}\0${entry.provider}`;
```
(written as raw `0x00` bytes, not as `\0` escapes). It is the **only** file in the
repository with embedded NULs — I scanned every `.ts/.tsx/.mjs/.js` outside
`node_modules`. Consequence: `file(1)` classifies the module as `data` and grep
treats it as binary, so `grep -n "riskTier" apps/v2-ui/lib/v3/adapter.ts` prints
**nothing** unless you pass `-a`. During this review that first read as "the
symbol is absent from the adapter".

The line predates rev 4 and is not part of the delta — but the file is
(handoff:10), and this is a repo whose review discipline leans hard on source-text
scanning. Writing the separator as the escape `\0` produces a byte-identical
runtime key and restores the file to plain text. Zero behavioural risk.

---

## What I did not do

I did not re-run any gate — the orchestrator's independent rev-4 run is the
evidence of record. I read no other lens's rev-4 verdict. I did not re-derive
R1/R2/R3; my rev-3 verdict stands on those and the delta does not touch them.
