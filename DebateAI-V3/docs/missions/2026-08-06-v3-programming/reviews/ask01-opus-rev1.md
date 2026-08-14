# ASK-01 — Opus 5 lens review (rev 1)

Ticket `t_2eb80121` · board debateai-v3 · DR-180 · dual diamond, Opus lens
(mutation testing + LIVE verification). Delta = `git diff 884230c` at
`/Users/vladmihaimiron/Documents/DebateAIRO`. Reviewed 2026-08-14.

Isolation (DR-163): every mutation ran in `/private/tmp/ask01-opus-clone`
(`cp -Rc` of the parent root), deleted at the end. The user's working tree was
read only — post-review `git status` and file digests are unchanged
(`defaults.tsx` sha256 `30f3d540cf35…`, `page.tsx` `dc66e8e7a16e…`, both
identical before and after every mutation). The standing stack (PG 55432 / API
8790 / shim 8791 / grok-relay 8792 / UI 3000) was never killed, restarted or
reconfigured.

---

## 0. Delta scope — the "client-side only" claim, verified first

```
DebateAI-V3/apps/v2-ui/app/new/defaults.tsx        | 164 ++++++-------------
DebateAI-V3/apps/v2-ui/app/new/page.tsx            |  55 +------
.../2026-08-06-v3-programming/decisions-ledger.md  |  22 +++
.../tests/render/ux01-new-debate-form.test.tsx     | 138 ++++++++---------
DebateAI-V3/tests/unit/v2ui-pages.test.ts          |  30 ++--
5 files changed, 176 insertions(+), 233 deletions(-)
```

**CONFIRMED.** No server-side file is touched: `apps/runner/src/index.ts`,
`apps/api/src/**`, `packages/**`, and all migrations are byte-identical to
`884230c`. The derivation is entirely client/form side, so the standing API
process predating the delta does **not** bound any conclusion below — the live
API executes exactly the code it was built from, and the form code is served
fresh by next dev's hot compile. The forbidden-work guard in the handoff
(`git diff --exit-code` on runner + kernel) reproduces clean.

---

## 1. The derivation, read against the real basis

`deriveAgentCountDefault` now returns
`min(count of distinct configured makers, deriveRatifiedMakerMaximum(deployment))`.

`deriveRatifiedMakerMaximum` inverts the Set-A envelope arithmetic
`((M·(2^(d+1)−1) + M·(M−1))·2 + 4)·3` against every `runCostEnvelope` member's
`max_model_attempts`, requires an **exact** integer solution, and requires all
members to agree.

Checked against the **live** register (`register_version 1`, row
`runCostEnvelope`, `source_ref acceptance:DR-172:V-approved`), all ten members:

| depth | live `max_model_attempts` | inverse | exact? |
|---|---|---|---|
| 1 | 60 | M=2 | EXACT |
| 2 | 108 | M=2 | EXACT |
| 3 | 204 | M=2 | EXACT |
| 4 | 396 | M=2 | EXACT |
| 5 | 780 | M=2 | EXACT |

Live `configuredProviderSet` (`acceptance:DR-177:V-approved`) names three
makers — OpenAI, Anthropic, xAI. `min(3, 2) = 2`. The derivation is a real
derivation against real deployment data, not a literal and not the configured
count. `F(2,3) = 174` reproduces the handoff's ratified-M=3 fixture exactly.

---

## 2. Mutation ledger

Method: one named mutation at a time in the clone, **full suite** each run
(`pnpm vitest run --reporter=verbose`, 588 collected: 587 + 1 skipped
live-stack gate), file restored and sha256-verified after every run.
Green baseline in the clone: `Test Files 79 passed (79) · Tests 587 passed |
1 skipped (588)`.

| # | Named mutation | Result | Named test(s) turned red |
|---|---|---|---|
| M1 | derive from the configured count alone (drop the `min`) | **RED** (2 failed) | `ASK-01 RED + mutations: caps configured makers at the ratified guard source without hardcoding two`; `ASK-01 live regression: configured=3 and ratified=2 makes bare Start submit two and receive acceptance` |
| M2 | hardcode `lawfulMakerCount = 2` | **RED** (1 failed) | `ASK-01 RED + mutations…` (killed by the fixture-ratified `max_model_attempts: 174` ⇒ expects 3) |
| M3 | re-add the Advanced disclosure button to `page.tsx` | **RED** (2 failed) | `DR-180 + MUTATION disclosure: renders only the DR-166-C ask surface and never renders machine controls`; `DR-180 computes every machine value without rendering the retired disclosure` |
| M4 | `tier_source` always `ASKER` (dishonest provenance on an untouched value) | **RED** (1 failed) | `DR-166-B + MUTATION collapsed-submit: creates the fully defaulted ask without opening Advanced` |
| M4b | `tier_source` always `MACHINE_DEFAULT` (erase a real asker edit) | **RED** (1 failed) | `PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT` |
| M5 | omit `decision_scope` from the submitted config | **RED** (1 failed) | `DR-166-B + MUTATION collapsed-submit…` |
| M8 | `as_of` not refreshed at submit | **RED** (1 failed) | `MUTATION as_of: refreshes untouched machine time at submit` |
| M9 | omit `agent_count` from the submitted config | **RED** (2 failed) | `ASK-01 live regression…`; `DR-166-B + MUTATION collapsed-submit…` |
| **M6** | **owners not user-relative** — `decisionOwner`/`actionOwner` return a constant instead of `session.asker_id` | **SURVIVED — 587 passed \| 1 skipped** | **none** |
| **M7** | drop the envelope **exactness** refusal (silently round up to the next M) | **SURVIVED — 587 passed \| 1 skipped** | **none** |

All four priority mutations named in the goal packet
(derivation-from-configured-only, hardcoded-2, re-added disclosure,
provenance-mutation) are killed by named tests. The handoff's P1 ledger is
reproducible for those rows.

### M6 is a regression in kill-power, proven against the baseline

M6 was replayed on the **pre-ASK-01** tree (884230c restored via `git stash`,
same clone, same command):

```
BASELINE + M6-owners-not-user-relative: RED
  tally: Tests  1 failed | 590 passed | 1 skipped (592)
  RED: tests/render/ux01-new-debate-form.test.tsx > UX-01 machine-defaulted real /new flow
       > DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
```

The old suite killed it. The new suite does not. See §3, finding B1.

### M7 — new defensive branch with no test

`deriveRatifiedMakerMaximum` refuses an envelope whose ceilings are not exactly
generated by the Set-A formula. Removing that refusal (rounding up to the next
M) passes all 587 tests. The code is *correct*; only its coverage is missing.
The branch guards a real hazard: a future envelope reseeded with rounded or
hand-edited ceilings would, without it, derive a panel **larger** than the
ratified maximum — the exact defect class ASK-01 exists to close.

---

## 3. Suite-shrink audit — 591 → 587

Measured, not assumed: `pnpm vitest list` on the baseline (591 names) and on
the delta (587 names), sorted and `comm`-diffed. **9 removed, 5 added.**

| # | Removed test | Successor | Verdict |
|---|---|---|---|
| 1 | `B1/B3 + MUTATION agent_count: derives the two configured makers and ignores routing task classes` | `ASK-01 RED + mutations: caps configured makers at the ratified guard source without hardcoding two` | **Equal-or-stronger.** The noisy 3-task-class `model_ledger` fixture is retained and the expectation is still `"2"`, so a "count the model ledger" mutation still reds; the ratified-M=3 (`174`) case is new coverage. |
| 2 | `B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled` | `DR-180 + MUTATION disclosure…` | **Correctly superseded.** Its still-valid parts migrated: `startBtn ready` un-disabled, `not.toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE")`, `value="low" selected`. |
| 3 | `DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens` | `DR-180 + MUTATION disclosure…` | **Stronger on its own subject** (absent in every state, not merely hidden) — **but two unrelated assertions rode along and were dropped with no successor.** See finding A1. |
| 4 | `keeps all five machine-owned controls editable in the real rendered form` | `keeps all five machine-owned values out of the real rendered form` | **Correct inversion**, exactly what DR-180 orders. |
| 5–9 | `binds a control the asker can actually fill for 'agent_count' / 'as_of' / 'decision_owner' / 'action_owner' / 'decision_scope'` (5 source-contract cases) | `DR-180 computes every machine value without rendering the retired disclosure`, plus the retained ready-gate test extended to carry all five machine states | **Equal-or-stronger in substance.** The replacement's own source-level check is weak (`toContain(identifier)`), but the load-bearing successor is behavioural: M5 and M9 prove the submitted payload still carries every machine field. |

Arithmetic reconciles: 591 − 9 + 5 = **587**. Confirmed by
`pnpm test` → `Test Files 79 passed (79) · Tests 587 passed | 1 skipped (588)`.

### The deletion the name-diff hides

A test-name diff cannot see assertions removed from a **retained** test. The
retained test `DR-166-A + MUT-I: two tokens derive two different owner defaults
through the real page` lost four assertions:

```diff
-      expect(alphaHtml).toMatch(new RegExp(`<input[^>]*id="${ownerField}"[^>]*value="asker:test-user-alpha"[^>]*>`));
-      expect(betaHtml).toMatch(new RegExp(`<input[^>]*id="${ownerField}"[^>]*value="asker:test-user-beta"[^>]*>`));
+      expect(alphaHtml).not.toContain(`id="${ownerField}"`);
+      expect(betaHtml).not.toContain(`id="${ownerField}"`);
-    expect(alphaHtml).not.toContain('value="asker:test-user-beta"');
-    expect(betaHtml).not.toContain('value="asker:test-user-alpha"');
```

What survives asserts only that `readSession` was called with each token and
that no control renders. Nothing asserts the two askers derive **different**
owner values. The test's name still promises it. This is finding B1.

---

## 4. FINDINGS

### B1 — BLOCKING · the DR-166-A user-relative-identity pin no longer kills its mutation

DR-180's own text requires "DR-166-A user-relative identities preserved", and
the goal packet's DELIVERS #1 repeats it. After the delta, mutating
`deriveSessionAskDefaults` so `decisionOwner`/`actionOwner` return a fixed
constant instead of `session.asker_id` passes **all 587 tests**. The same
mutation on 884230c is RED on `DR-166-A + MUT-I`. A load-bearing assertion was
deleted without an equal-or-stronger successor, and the handoff's evidence
table asserts the opposite:

> `DR-166-A | GREEN | two session tokens still derive distinct asker-relative owner values while neither value renders as a control`

The first half of that claim is not tested. (The **behaviour** is correct — the
live run below persisted the real asker id — so this is a coverage defect, not
a product defect.)

**Remedy (test-only, one file, no product change):** in that same test, drive
the real form's submit under each token and assert the payloads differ — e.g.
`createDebate.mock.calls[0][1].decision_owner === "asker:test-user-alpha"` and
`…[1].decision_owner === "asker:test-user-beta"`, plus the negative cross-check.
Since the controls no longer render, the submitted payload is the only place
the invariant is observable, and it restores the kill.

### A1 — ADVISORY (high) · the Options-disclosure a11y assertions have no successor anywhere

Removed with test 3 and never re-homed:

```
expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Options/);
expect(html).not.toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="additionalRunOptions"/);
expect(html).not.toContain('id="additionalRunOptions"');
```

`grep -rn "additionalRunOptions" tests/` and `grep -rn "aria-controls" tests/`
both return **zero hits** across the whole suite. These pinned a genuine a11y
rule (a collapsed disclosure must not advertise `aria-controls` for an element
it is not rendering). I rate this advisory rather than blocking because it
guards the **Options** surface, which DR-180 does not touch, no mutation in my
sweep escaped through it, and the disclosure is live-verified working. It
should be restored in the same edit as B1.

### A2 — ADVISORY · the M-guard's source and the form's source are two different things that merely agree today

The packet asks for the ratified maximum "derived from the SAME source the
M-guard enforces". The M-guard is a code literal:

```ts
const DR159_RATIFIED_MAKER_COUNT = 2;   // apps/runner/src/index.ts:430
export function assertRatifiedMakerCount(effectiveMakerCount: number): void { … }
```

The form derives from `runCostEnvelope`. These are the same *number* today (I
verified the inversion against all ten live members), and the envelope is
arguably the true basis — DR-159's own comment says the envelope arithmetic is
what caps M. But they are two independently editable places. **Drift hazard:**
reseeding the envelope to the M=3 ceilings without bumping the runner literal
would make the form derive 3 and every ask refuse again — this ticket's exact
defect, relocated. The packet forbade M-guard changes and ratification is V's,
so this is correctly out of ASK-01's scope; it belongs in whatever ticket
carries the M=3 ratification, which must move both atomically (or make the
runner read the envelope). ASK-01's own DR-162-A claim — a future ratification
flows through *the form* with zero form-code change — holds.

### A3 — ADVISORY · "healthy" is not modelled

DR-180 says "configured-**and-healthy** providers". No provider-health signal
exists in the contract or register today; `configuredProviderSet` carries none.
The derivation uses the configured count, which is the closest available basis,
and the `min` cap keeps the result lawful regardless. Naming it so the word
"healthy" in the ledger is not mistaken for shipped behaviour.

### A4 — ADVISORY · M7's untested refusal branch

See §2. One test — an envelope member whose `max_model_attempts` is not an exact
Set-A value must throw `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` — closes it.

### A5 — ADVISORY (pre-existing, outside this delta) · persisted tier provenance is renamed at the server boundary

The form submits `tier_source: "MACHINE_DEFAULT"`,
`tier_provenance_ref: "machine:deployment-floor"`. The live run persisted
`tier_source = ASKER`, `tier_provenance_ref = MACHINE_DEFAULT`: the server's
`resolveRisk`/`preserveSubmittedTierSource` records the *resolution level* in
`tier_source` and parks the submitted `tier_source` in `tier_provenance_ref`,
discarding the form's descriptive ref string. The machine-vs-asker distinction
does survive to storage, so PROV-01 honesty is preserved in substance. This is
server-side (`apps/api/src/main.ts` + `packages/**`), untouched by ASK-01, and
reproduces on the pre-ASK-01 ACC-01 baseline row — flagged for the mission, not
charged to this ticket.

### A6 — ADVISORY · new coupling: an envelope fault now also disables the agent-count default

`deriveAgentCountDefault` now throws when `runCostEnvelope` is absent or
unparseable, where before it did not. Benign today (the form is already
disabled when the envelope is missing, and the retained test pins
`startBtn disabled`), but it widens the blast radius of an envelope fault from
"no depth choice" to "no ask at all".

---

## 5. LIVE verification — V's exact one-click flow

The miss on the record was probing with hand-built payloads instead of driving
V's flow. This section drives the flow.

**T0 · SSR probe (as instructed).** `curl 'http://127.0.0.1:3000/new?topic=…'`
with cookie `debateai:user-dev-token=v-dev` → `HTTP 200, 17181 bytes`;
`Advanced` occurrences: **0**; `machineOwnedAskFields`: **0**. *Honest
limitation:* `/new` sits behind `AuthGate`, which reads the token from
`localStorage` client-side, so the SSR body is the token-unlock state — it can
prove the absence of Advanced but **cannot** show the DR-166-C surface. SSR
alone was therefore insufficient evidence and I escalated to the real browser
rather than report a green from a page that renders no form.

**T1 · authenticated live render** (browser at :3000, token `v-dev` in
`localStorage` + cookie, real hot-compiled form code):

```json
{
  "href": "http://localhost:3000/new?topic=ASK-01%20live%3A%20does%20bare%20Start%20work%3F",
  "advancedCount": 0,
  "machineOwnedAskFields": 0,
  "controlsPresent": { "riskTier": true, "budgetTier": true, "treeDepth": true,
                       "agentCount": false, "asOf": false, "decisionOwner": false,
                       "actionOwner": false, "decisionScope": false },
  "buttons": ["Options ▼ [optionsToggle]", "Start debate → [startBtn ready]", "Cancel [btnGhost]"],
  "hint": ["Choose your risk tier, composition budget tier, and depth, then click Start.",
           "Machine default: deployment riskTier floor (acceptance:DR-133:V-approved)",
           "At depth 1, this run may spend up to 60 model attempts against the configured CLI subscriptions (register v1)."]
}
```

No Advanced disclosure in any state; all five machine control ids absent; the
DR-166-C surface (question · risk · budget · depth · Start) present; **Start is
`startBtn ready`, not disabled**; default depth is 1.

**T2 · the one-click probe.** Real pointer/mouse event sequence
(`pointerdown → mousedown → pointerup → mouseup → click`) dispatched on the
Start button at its own client rect — the page's own `onSubmit` built the
payload, no payload was authored by me. Click at `2026-08-14T12:15:14.895Z`.
Result: the app router navigated to
`http://localhost:3000/debate/1428bc84-7654-493e-a9c0-5165b31f48ca`
with **no error box** — i.e. `POST /v1/asks` returned its accepted envelope
(`api.post("/v1/asks") … reply.status(202)`), not
`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`.

**T3 · what the server actually persisted** (read-only query against the
standing PG 55432, `core.run`):

```
run_id                = 1428bc84-7654-493e-a9c0-5165b31f48ca
question_line         = ASK-01 live: does bare Start work?
asker_id              = asker:79ab16246810c1e3ac00038d7a6ec974350887f773c05dcc97bcec519810a037
caller_scope          = ASKER
as_of                 = "2026-08-14T12:15:14.891Z"
risk_tier             = standard
tier_provenance_ref   = MACHINE_DEFAULT
composition_budget_tier = low
depth_params          = {"depth":1}
agent_count           = 2
envelope_basis        = {"source_ref":"acceptance:DR-172:V-approved","derived_from":{"risk_tier":"standard","depth_params":{"depth":1}},"register_row_key":"runCostEnvelope","register_version":1,"max_model_attempts":60}
register_version      = 1
ask_contract          = {"action_owner":"asker:79ab…a037","decision_owner":"asker:79ab…a037","decision_scope":"personal","steering_presets":[],"steering_annotations":[]}
```

`agent_count = 2` from a bare Start with **three** configured makers — the
derivation, live. `as_of` is the submit instant (4 ms before the click
timestamp I recorded, i.e. refreshed at submit, not at page load). Owners are
the real asker id — DR-166-A holds in behaviour. `decision_scope = personal`.
All five machine values persisted, none rendered.

**T4 · let it run; confirm serve.**

```
15:15:57 {"state":"RUNNING"}   …   15:21:51 {"state":"RUNNING"}
15:22:21 {"run_ref":"1428bc84-7654-493e-a9c0-5165b31f48ca",
          "question_line":"ASK-01 live: does bare Start work?",
          "state":"SETTLED","terminal_reason":null,"hold_until":null}

GET /v1/runs/1428bc84-…/answer → HTTP 200
answer_id: 1922f806-8a97-4b7b-aaf5-49895c7632a4
composed: [{"segment_id": "hypothesis", "text": "Hypothesis: A bare “Start” command works in the ASK-01 live environment.", …}, …]
```

Panel and budget actually served:

```
=== MAKERS + MODEL CALLS (live run) ===
  Anthropic | acceptance:claude-cli | claude-opus-5 | calls: 8
  OpenAI    | acceptance:codex-cli  | gpt-5.6-sol   | calls: 12
TOTAL model attempts: 20 (envelope ceiling for depth1/standard = 60)
root nodes (panel size served): 2
nodes: 8 (depth 0–1)
```

Two makers, two roots, 20 attempts against a 60 ceiling, one run — within the
budget granted. xAI is configured but correctly capped out by the ratified
maximum. **V's exact failing flow now works end to end: one click, accepted,
settled, served.**

---

## 6. Gates (clone, delta applied)

```
pnpm test        → Test Files  79 passed (79)
                   Tests  587 passed | 1 skipped (588)      [expected 587|1 ✓]
pnpm vitest list → 587                                       [✓]
pnpm run typecheck                    → tsc --noEmit          (clean)
pnpm --filter dialectical-engine-v2ui typecheck → tsc --noEmit -p tsconfig.json (clean)
pnpm run lint    → {"edgeRowsChecked": 27, "violations": []}
                   {"blocking": []}
```

The 1 skipped test is the opt-in `UX01_LIVE_STACK` read-only live gate, as the
handoff states.

---

## 7. Disposition

The product is right. The derivation is a real derivation against the real
ratified basis, the Advanced tab is gone from every state, the machine values
are still computed and persisted with honest provenance, and V's one-click
bare Start is verified working live end-to-end — accepted, settled, served,
with a derived panel of 2 drawn from 3 configured makers. Eight of ten
mutations, including all four the packet names, are killed by named tests.

It is blocked on one thing: removing the superseded DR-166-B tests took the
DR-166-A user-relative-identity pin down with them, and I proved by replay that
the pre-ASK-01 suite killed that mutation while this one does not. DR-180
names DR-166-A as a thing it preserves; the suite must still be able to say so.
The fix is test-only, in one file, and does not touch product code.

- **BLOCKING:** B1.
- **Advisory:** A1 (restore alongside B1), A2, A3, A4, A5 (pre-existing,
  mission-level), A6.

VERDICT: BLOCKING
