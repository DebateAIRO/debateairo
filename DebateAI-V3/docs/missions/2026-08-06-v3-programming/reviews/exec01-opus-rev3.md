# EXEC-01 — Opus 5 lens, rev 3

**Ticket:** `t_6fae713b` · **Author:** Codex (gpt-5.6-sol) · **Lens:** Opus 5 (dual diamond, DR-153)
**Date:** 2026-08-11 · **Mode:** read-only (no edits, no git, no board mutation)
**Independence:** I did not read `reviews/exec01-grok-rev3.md`. Two of its lines
surfaced incidentally in a repo-wide grep for `UNEXPECTED_ERROR`; nothing in this
verdict derives from them.

## Verdict

**CHANGES REQUESTED** — 1 blocking, 6 advisory.

**All three rev-1 findings are genuinely closed.** I re-derived each against the
code rather than the handoff, and each holds:

- **R1 CLOSED.** `acceptance/main.ts:71-75` binds the caught error and composes
  `ACCEPTANCE_EXECUTION_FAILED:<TypedDomainError.code>`. The DR-151 scenario now
  survives: a run that dies on `COMPOSITION_UNRESOLVED` records that code in
  `core.work_item.terminal_reason` (`text`, no truncation —
  `migrations/0000_s00.sql:108`) and it reaches the SSE payload and the UI banner
  unaltered (`apps/api/src/index.ts:441-444`, `DebatePageClient.tsx:551-553`).
  `tests/unit/acceptance-dispatcher.test.ts:36-51` fails if the code is dropped —
  it is a real behavioural test, not a tautology.
- **R2 CLOSED as scoped.** Both literals are gone. `/new` holds no `1` and no `9`
  for depth or attempts; every displayed number traces to
  `deployment.register.rows` through `runCostEnvelopeFromDeployment`
  (`apps/v2-ui/lib/v3/adapter.ts:484-531`) with typed refusals and no fallback.
  Grepped `apps/v2-ui` for `useState(1)`, `max={1}`, `model attempts`: the only
  survivors are register-derived interpolations (`app/new/page.tsx:336,395`).
- **R3 CLOSED.** The exact window is named — process death after claim → item
  stays `CLAIMED` → UI waits forever, no reaper — with why it is out of scope and
  what closes it (handoff:195-197). No unqualified "no silent stalls" claim
  survives anywhere in the handoff or progress log (grepped).

**Spot-checks of the handoff's remaining claims, per the packet's calibration.**
The one that mattered most: *"A wrong typed code still fails the assertion"*
about the rev-3 typecheck fix. **True.** `@vitest/expect@4.1.10` matches an
asymmetric matcher against the thrown object itself (`dist/index.js:1590-1592`)
and `ObjectContaining.asymmetricMatch` compares each sampled property by value
(`:852-870`), so `expect.objectContaining({ name, code })` genuinely constrains
both. The claim about claim sizing is also true (`acceptance/main.ts:191-196`:
`claimMs = longestDeadline × max(members.max_model_attempts)` = 540 s, versus one
60 s call before — rev-1 ADVISORY-1 is fixed, not just recorded). The carry-forward
advisories are each either fixed or recorded in the deferrals section; rev-1's
ADVISORY-6 ("until normal expiry/recovery") is corrected to what is actually
true. I found no false factual claim in this revision.

What blocks is new, and it lives inside the ~15 lines R2's fix added.

---

# BLOCKING

## BLOCKING-1 — `/new` picks the envelope member by the ASKER's tier; the engine resolves it by the EFFECTIVE tier. A casual ask is now unstartable from the form.

**Files:** `apps/v2-ui/app/new/page.tsx:68`, `:74-75`, `:398-402`
**Against:** `apps/api/src/index.ts:254-259` · `packages/register/src/index.ts:356-365`
**Law:** AC-76/DR-039 — the UI's model of a ruled value must not diverge from the
engine's; and the goal packet's own standard that the form must not misstate what
the register rules.

The page filters ruled members by the tier the asker picked:

```tsx
const allowedEnvelopeMembers = runCostEnvelope?.members.filter((m) => m.riskTier === riskTier) ?? [];
```

The API resolves the envelope by the **effective** tier, after the deployment
floor is applied:

```ts
const risk = this.settings.resolveRisk(ask.risk_tier, ask.tier_provenance_ref);
const envelopeBasis = await this.settings.resolveEnvelopeBasis({
  depthParams: ask.depth_params, riskTier: risk.effectiveRiskTier });
```

and `resolveEffectiveRiskTier` **escalates** when the deployment policy outranks
the asker (`packages/register/src/index.ts:356-365`, `RISK_TIERS =
["casual","standard","high-stakes"]`). The acceptance deployment ships exactly
that floor: register row `riskTier: "standard"` (`acceptance/seed-register.ts:71`),
wired at `acceptance/main.ts:139-153, 259-263`. The only envelope member is
`{depth 1, standard, 9}` (`acceptance/seed-register.ts:173-183`).

**Concrete failing case, live today, no register change needed.** V opens `/new`
and picks risk tier **casual** — the first real option in the dropdown
(`page.tsx:166`). `allowedEnvelopeMembers` is `[]`, so `depth` is set to `null`
(`:69`), `selectedEnvelopeMember` is `null`, `ready` is false (`:81`), and the
Start button never enables. The page explains: *"Choose a risk tier with a ruled
run-cost envelope before starting."* That sentence is false. Submit the identical
ask to the API directly and it is served: casual escalates to standard
(`tierSource: DEPLOYMENT_POLICY`), `assertMakerAdmission("standard", …)` passes on
the two-maker deployment, `resolveRunCostEnvelopeBasis({depth:1}, "standard")`
finds the member, 202, run executes. The repo's own tests exercise exactly this
ask: `tests/unit/v2ui-data-layer.test.ts:381-418` builds a valid `risk_tier:
"casual"`, `depth: 1` ask through `createDebate`, and
`acceptance/run-acceptance.test.ts:41` covers `--risk-tier casual` in the
ceremony CLI. The form can no longer produce the ask its own data layer is tested
to build.

This is a regression introduced by this rework: before it, `/new` posted depth 1
with whatever tier was chosen and the casual run succeeded. (For high-stakes the
new gate is an improvement — the server would refuse there — so the omission is
one-directional, not the whole idea.)

**The latent form is the AC-76 harm proper.** The moment a member is ruled at a
tier *below* the deployment floor — say `{depth 1, casual, 3}` beside
`{depth 1, standard, 9}` — a casual asker is shown *"up to 3 model attempts"*
(`page.tsx:395`) while the run escalates to standard and may lawfully spend 9.
That is the same silent misstatement of V's ruled spend that rev-1's BLOCKING-2
was about, rebuilt through a different mechanism. It is not reachable in the
acceptance runtime today only because `acceptance/runtime-policy.ts:38-46` pins
the row to a single-member tuple and would refuse to boot (see ADVISORY-6) — an
accident of a different guard, not a property of this code.

**Why it slipped:** the divergence now lives in the page's selection logic, and
that logic has no behavioural test. The directive's "a test that FAILS when the
register and the UI disagree" was delivered one layer below it
(`tests/unit/v2ui-data-layer.test.ts:420-446`, which does genuinely fail on
adapter/API divergence — fixture depth 2 / ceiling 12 projects exactly). The page
itself is still guarded only by source text (`tests/unit/v2ui-pages.test.ts:62-68`).

**Minimal close.** Select members by the effective tier — the higher-ranked of the
asker's tier and the deployment `riskTier` row, which is already in the same
`readDeployment` payload the envelope comes from (`apps/api/src/index.ts:371-373`
returns every register row). Do it in `runCostEnvelopeFromDeployment` or beside
it, so the pure projection can be tested; then the divergence test finally sits
where the divergence is. If V would rather not replicate the floor rule in the
browser, the honest alternative is an API-side projection of the effective tier —
but a declared deferral does **not** close this one, because unlike R3 the
declaration would leave a form that refuses a lawful ask in front of V's visual
gate.

---

# ADVISORY

## ADVISORY-1 — The page's register-derived behaviour is still asserted on source text

**File:** `tests/unit/v2ui-pages.test.ts:62-68`

```ts
expect(newPage).toContain("getRunCostEnvelope");
expect(newPage).toContain("maxModelAttempts");
expect(newPage).not.toContain("useState(1)");
expect(newPage).not.toContain("up to 9 model attempts");
```

This is strictly better than the rev-1 version — it now ratchets *against* the
literals instead of freezing them, and the file header honestly explains that the
root suite has no DOM renderer. But it still cannot fail on divergence: a page
that called `getRunCostEnvelope` and then rendered "up to 9 attempts" (different
wording) or clamped depth to a literal passes all four assertions. The fix is not
a DOM renderer — it is extracting the two decisions the page makes (which members
are allowed for a given asker tier; which member is selected) into pure functions
in `lib/`, where they can be tested against a fixture register. BLOCKING-1 is the
bug that placement would have caught.

## ADVISORY-2 — A non-typed rejection still leaves no diagnosable trace anywhere

**File:** `acceptance/main.ts:71-75`

`ACCEPTANCE_EXECUTION_FAILED:UNEXPECTED_ERROR` names the class honestly — it does
not fabricate a typed code, and `UNEXPECTED_ERROR` collides with none of the 146
`TypedDomainError` codes in the repo (grepped), so nothing today can misread it as
observed. Two residual points:

1. The error itself is discarded. Not persisted (defensible — the handoff cites
   message sensitivity) *and* not written to stderr, though the same method writes
   stderr twice for lesser events (`:93`, `:96`). A `TypeError` from a plumbing
   bug in the dispatch path therefore records "something non-typed happened" and
   nothing more.
2. Typed errors keep the code but lose the parametrised message. The DR-151
   diagnosis needed *"No ratified composition for **mixed**"*; rev 3 records
   `…:COMPOSITION_UNRESOLVED` and the claim type is gone. Materially better than
   rev 1 — the class is recoverable and the row exists — but the discriminating
   detail still is not, anywhere.

Note the convention risk for whoever extends this: the suffix slot is now
positional, so a future code containing `:` (none do today) or a second synthetic
token would make `terminal_reason` genuinely ambiguous. Nothing parses it today —
the UI renders the whole string — so this is a convention to record, not a live
defect.

## ADVISORY-3 — The two stderr branches drop the reason they were about to record

**File:** `acceptance/main.ts:92-97`

`if (!recorded)` writes `ACCEPTANCE_FAILURE_STATE_NOT_RECORDED` without the
composed reason, and the outer `.catch(() => …)` still binds no error, so a
persist failure writes a constant and discards the cause. Reachable benignly (a
throw after `settle` already won — `runner/src/index.ts:972-977` — makes the
guarded UPDATE match zero rows), which is why this is advisory: the item is `DONE`,
not stalled. But in that branch the observed typed code — the entire point of R1 —
is computed and then thrown away. Including `reason` in both writes is one string
interpolation.

## ADVISORY-4 — The R3 guard fails when someone fixes the defect it documents

**File:** `tests/unit/exec01-rework-contract.test.ts:20, 22-28`

`expect(acceptanceMain).not.toContain("claimNext(")` asserts the *absence of the
reaper* in the file where a bounded startup sweep would most naturally go, so the
future fix breaks this test. And two assertions pin exact handoff prose in the
enforced root suite, so re-wording a mission document turns the suite red. The
intent is right — the declaration should not be quietly deleted — but the shape
repeats the pattern I blocked on in rev 1: a test that ratchets against the fix.
Asserting the declaration's presence is the load-bearing half; the `not.toContain`
is not.

## ADVISORY-5 — The adapter reduces a member's `depth_params` fingerprint to its `depth` key

**Files:** `apps/v2-ui/lib/v3/adapter.ts:499-517` · `packages/register/src/index.ts:209-223`

`resolveRunCostEnvelopeBasis` matches members by a **canonical-JSON fingerprint of
the whole `depth_params` object**, and the register schema types it as
`z.record(z.string(), z.unknown())`. The UI reads only `depth_params.depth` and
posts `{ depth }` (`apps/v2-ui/lib/api.ts:279`). So a ruled member carrying any
additional depth parameter would be offered in the form and then refused at submit
with `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`. Loud, so advisory — but the form would
be presenting an option it cannot fulfil. Related nit: the projection does not
require a non-empty `source_ref`, while the server-side reader treats that as
`RUN_COST_ENVELOPE_PROVENANCE_MISSING` (`packages/register/src/index.ts:189-191`).

## ADVISORY-6 — The acceptance runtime still pins the envelope to literals one layer down

**File:** `acceptance/runtime-policy.ts:38-46`

```ts
runCostEnvelope: z.object({
  members: z.tuple([z.object({
    depth_params: z.object({ depth: z.literal(1) }).strict(),
    risk_tier: z.literal("standard"),
    max_model_attempts: z.literal(9)
  }).strict()])
})
```

This is a **loud** pin, not a silent fallback, so it is not the AC-76 violation R2
closed — and it is pre-existing and outside this ticket. Recording it because it
changes what the UI fix buys: the moment V rules the second envelope member that
DR-149(2)/DR-150(5) say PRO-01 and PANEL-01 are blocked on, `/new` will adapt but
`readAcceptanceRuntimePolicy` will refuse to boot the acceptance runtime. Whoever
picks up that unblock should expect to change this schema in the same commit.

Also still true and still worth stating once: the architecture audit cited as
evidence covers neither `apps/v2-ui` nor `acceptance` (rev-1 ADVISORY-7), so
`{"edgeRowsChecked":27,"violations":[]}` is green and silent about the two
directories carrying this diff.

---

# Cleared on inspection

- **Composed reason is unambiguous today.** No `TypedDomainError` code in the repo
  contains `:` (146 codes, grepped); `terminal_reason` is `text`, so nothing
  truncates; and no consumer parses it — `liveEvents.ts:89-95` carries it whole and
  `DebatePageClient.tsx:551-553` renders it whole. No typed code is implied for an
  untyped error (ADVISORY-2 notes the convention risk only).
- **No path out of dispatch swallows a cause silently.** Runner rejection → typed
  code persisted; the two failure-to-persist branches write distinct stderr markers
  (ADVISORY-3 is about their *content*, not their existence); `NO_WORK` is declared.
- **Absent/malformed envelope refuses loudly and the refusal reaches the user.**
  `RUN_COST_ENVELOPE_UNAVAILABLE` / `RUN_COST_ENVELOPE_INVALID` (adapter:486-525),
  surfaced in a visible error block (`page.tsx:391-392`) that sits outside the
  collapsed Options panel; Start stays disabled; no literal fallback anywhere.
- **The new dispatcher tests fail for the right reason.** `:36-51` asserts the
  observed code; `:22-33` asserts the honest non-typed class; `:6-20` proves the
  dispatch returns before the runner settles.
- **Carry-forward advisories.** Claim expiry: **fixed** (`main.ts:191-196`).
  Settle-watch hot spin: **recorded** — still unbounded `setImmediate`
  (`run-acceptance.ts:166-178`), declared as deferred. Synthetic terminal at
  `created_at_seq`: **recorded** — still `apps/api/src/index.ts:443`, declared,
  and still unreachable with one work item per run. Evidence rows: **corrected** —
  the handoff now says expiry performs no recovery. Silence was the unacceptable
  option and none of them is silent.
- **Reproduce-first.** R1's pasted RED is a genuine expected/received divergence.
  R3's RED demonstrates the missing declaration. R2's RED (*"expected page source
  to contain getRunCostEnvelope"*) is again a symbol-absence RED rather than a
  reproduction of the drift — the rev-1 ADVISORY-5 pattern, and the same gap
  ADVISORY-1 describes. Not re-raised as a finding; noted so the pattern is seen.

## Bottom line for the orchestrator

The three rework items are closed on the merits, the gates the author claims match
what I could verify from source, and the dispatcher work is now genuinely better
than rev 1 rather than differently worded. One defect blocks: R2's fix taught the
form to read the register but not the deployment floor that sits between the
asker's tier and the ruled member, so `/new` refuses a casual ask the API would
serve, and would misstate the ceiling outright if a sub-floor member is ever ruled.
The close is small and belongs in the pure projection, where it also finally gives
R2 the divergence test the directive asked for.
