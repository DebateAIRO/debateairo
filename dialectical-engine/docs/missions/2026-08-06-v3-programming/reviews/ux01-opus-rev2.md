# UX-01 rev2 — Opus 5 lens (dual diamond, DR-153)

**Ticket:** `t_b2f82786` · **Rulings under review:** DR-166 + DR-166-A · **Worker:** Codex GPT-5.6 Sol
**Date:** 2026-08-13 · **Verdict: CHANGES REQUESTED**

**Method (DR-163):** every probe and mutation ran in a fresh APFS clone of the PARENT git root
`/Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`), at
`…/9d9a0a17…/scratchpad/clone2/DebateAIRO`. Clone verified byte-identical on all eight relevant
files before any work. Every mutation restored and md5-confirmed. The standing stack was **not**
restarted — GET-only HTTP on `:8790`, no submits. The acceptance suite booted its own embedded
Postgres in `mkdtemp` directories on ephemeral ports, touching nothing standing. The real tree
carries only this verdict file.

---

## The six rev1 blockers: all six CLOSED

### B1 — CLOSED. Correct carrier, verified on the live deployment.

`defaults.tsx:37-83` now reads the `configuredProviderSet` register row and counts distinct
`maker` values. Live read-only probe:

```
$ curl -H "x-user-dev-token: v-dev" http://127.0.0.1:8790/v1/deployment
register_version      1
configuredProviderSet acceptance:DR-140:V-approved
distinct makers       Anthropic, OpenAI
DERIVED agent_count   2
riskTier              standard (acceptance:DR-133:V-approved)
model_ledger length   0          ← rev1's carrier, still empty
```

I rendered the **real `NewDebatePage`** against that live response in my own independent probe
(not the worker's assertions):

```
agentCount     <input id="agentCount" … value="2"/>
asOf           <input id="asOf" … value="2026-08-13T11:24"/>
decisionOwner  <input id="decisionOwner" … value="asker:79ab16246810c1e3ac…"/>
actionOwner    <input id="actionOwner"  … value="asker:79ab16246810c1e3ac…"/>
decisionScope  <input id="decisionScope" … value="personal"/>
riskTier/budget <option value="standard" selected=""> | <option value="low" selected="">
startBtn       <button type="submit" class="startBtn ready">     ← no disabled
banner present false
```

DELIVERS #1 and #6 are now delivered **where V meets them**: V types a question and Start is live.
The false banner is gone.

### B2 — CLOSED, and the split has teeth.

`page.tsx:78-102` gives the envelope, provider-set and risk-floor derivations three separate
try/catch domains; the session read is a separate promise. **MUT-J** (re-coupling agent-count and
risk into one try/catch — rev1's exact defect) goes RED:

```
× B2/B5: an absent risk floor leaves provider and envelope derivations intact without fabricating risk
× B5: renders honest field-local absence and stays disabled; fabricated fallback values die
  Tests  2 failed | 10 passed | 1 skipped (13)
```

### B3 — CLOSED. The derivation is the engine's own vocabulary, line for line.

`deriveAgentCountDefault` mirrors `readDeploymentMakerCapability`
(`packages/critique/src/index.ts:242-289`) exactly: same row key, same `kind` check, same
`requiredDistinctMakers` integer≥1 check, same per-provider `providerRef`/`adapterKind`/`maker`
validation, same distinct-maker `Set`, same sort, same `configuredProviderSet@{version}:{source_ref}`
provenance format. Task-class routing outcomes no longer participate — the fixture
(`ux01-new-debate-form.test.tsx:113-117`) now deliberately loads `model_ledger` with noisy
JUDGE/COMPOSER/CRITIC rows that the derivation must ignore, and asserts `agentCount: "2"`.

The manufactured-refusal risk is gone: derived `2` equals `DR159_RATIFIED_MAKER_COUNT`
(`apps/runner/src/index.ts:213`), which `assertRatifiedMakerCount` requires exactly. The default no
longer walks V into V's own original failure.

### B4 — CLOSED. **MUT-G** (rev1's mutation, re-run verbatim) now goes RED.

Deleted all six default-seeding calls in `page.tsx` (`setAgentCount`, `setRiskTier`,
`setDecisionOwner`, `setActionOwner`, `setDecisionScope`, `setAsOf`):

```
 Test Files  1 failed | 72 passed (73)
      Tests  4 failed | 507 passed | 1 skipped (512)
× B2/B5: an absent risk floor …    × B2/B5: an absent run envelope …
× B4: renders the real NewDebatePage with all seed calls applied and Start enabled
× B5: renders honest field-local absence …
```

Rev1's silent-green result is dead. The render suite mounts the real `NewDebatePage`
(`ux01-new-debate-form.test.tsx:129-138`), runs its effects and asserts on rendered HTML — LOAD-01's
precedent, followed.

### B5 — CLOSED. **MUT-H** (rev1's mutation) now goes RED.

Fabricated `setAgentCount("2")` + `setAgentCountDefaultError(null)` in the provider-derivation catch:

```
 Test Files  1 failed | 72 passed (73)
      Tests  1 failed | 510 passed | 1 skipped (512)
× B5: renders honest field-local absence and stays disabled; fabricated fallback values die
```

The DR-115 path is guarded.

### B6 — CLOSED, and stronger than ordered.

`ux01-new-debate-form.test.tsx:12` pins `process.env.TZ = "UTC"`. Passes in every zone I tried,
including half- and quarter-hour offsets:

```
TZ=UTC               Tests 12 passed | 1 skipped (13)
TZ=America/Los_Angeles   Tests 12 passed | 1 skipped (13)
TZ=Asia/Kolkata (+05:30) Tests 12 passed | 1 skipped (13)
TZ=Pacific/Chatham (+12:45) Tests 12 passed | 1 skipped (13)
```

---

## BLOCKING — DR-166-A's ordered assertion does not exist, and a person-constant passes the suite

V's mid-flight amendment required, in terms: *no default may encode V or any named person as a
constant*, and **one assertion must prove defaults CHANGE when the session identity changes (two
tokens → two different owner defaults)**.

**That assertion is absent.** Repo-wide grep across `tests/`, `apps/v2-ui/` and the handoffs finds
no two-token, second-session, or identity-change case. The suite carries exactly **one** session
fixture (`ux01-new-debate-form.test.tsx:121-127`), and its identity is `asker:v-session` —
V-flavoured. `UX-01-progress.log` contains no DR-166-A entry; the handoff never mentions the
amendment. It appears to have been missed rather than declined.

The gap is not cosmetic. **MUT-I** — replacing the two owner derivations with a hardcoded
person-constant, the precise pattern DR-166-A outlawed:

```diff
-    decisionOwner: session.asker_id,
-    actionOwner: session.asker_id,
+    decisionOwner: "asker:v-session",
+    actionOwner: "asker:v-session",
```

```
 Test Files  73 passed (73)
      Tests  511 passed | 1 skipped (512)
 tsc --noEmit  exit 0
```

**A default that hardcodes one person's identity passes the entire enforced suite and the
typechecker.** Every existing owner assertion (`:211`, `:215`, `:239`) compares against that same
fixture identity, so all three keep passing. This is exactly the regression V ordered a guard
against, and there is none.

To be fair to the worker: the **shipped production code is behaviourally correct**. I wrote the
missing assertion myself and it passes on the real page —

```
IDENTITY A (fresh mount)  decisionOwner value="asker:alice" | actionOwner value="asker:alice"
IDENTITY B (fresh mount)  decisionOwner value="asker:bob"   | actionOwner value="asker:bob"
```

— and the live render shows the real asker hash, not "V". So this is a **missing guard, not a
shipped defect**. But the guard is the deliverable V named, and without it nothing stops the next
edit from reintroducing the constant.

**Ordered:** add the two-token assertion to `tests/render/ux01-new-debate-form.test.tsx` — two
distinct session identities through the real rendered page, asserting two *different* owner
defaults — and change the fixture identity off `asker:v-session` to a neutral one (e.g.
`asker:alice`), so the fixture itself stops being the vector that lets MUT-I through. Re-run MUT-I
and show it RED.

### Related, found while probing: owner defaults are sticky across an identity change

The seeding guard is `current.trim().length > 0 ? current : defaults.decisionOwner`
(`page.tsx:116-118`). Within a mounted form whose session resolves to a **different** asker, the
previous asker's identity is retained:

```
BEFORE switch  decisionOwner value="asker:alice"
AFTER  switch  decisionOwner value="asker:alice"   ← session now returns asker:bob
```

The `useEffect` re-runs on `[token]`, but the non-empty guard wins. Today this looks unreachable —
`AuthGate` only moves token `null → value`, never value → different value — so I am **not** blocking
on it. It is, however, precisely the live defect the ordered assertion is shaped to catch, and it is
worth deciding deliberately: preserving a user's typed edit and preserving a *previous user's
identity* are the same line of code.

---

## Item 5 — QUESTION FOR V: present, and the implementation matches a lawful path

The A5 guidance is satisfied on both halves:

- **riskTier** defaults to the deployment floor as a cited machine fact —
  `riskTierProvenance: "deployment riskTier floor (acceptance:DR-133:V-approved)"`
  (`defaults.tsx:85-97`), rendered as a `Machine default:` hint. This is the permitted path.
- **budget tier** takes the "carried with an explicit QUESTION FOR V" option. The made-up
  "unique least registered tier" algorithm is gone. `low` is now a plain user-owned initial value
  (`PROVISIONAL_COMPOSITION_BUDGET_DEFAULT`, `defaults.tsx:11`) carrying a code-level
  `QUESTION FOR V` comment, and the form discloses it in the UI: *"Provisional default pending V
  ruling; editable user-owned value"* (`page.tsx:245`). The handoff carries the question in full.

Both match. No objection.

---

## Item 6 — Canary: clean

| Gate | Result |
|---|---|
| Baseline suite (clone) | **73 files / 511 passed + 1 skipped (512)** — worker's claim verified |
| Acceptance | **9 files / 35 passed (35)**, 0 failures |
| Root `tsc --noEmit` | exit 0 |
| `dialectical-engine-v2ui` `tsc --noEmit` | exit 0 |
| Live opt-in render test | passes against standing `:8790` |

**LOAD-01 surfaces untouched.** `tests/render/load01-debate-page.test.tsx` md5 `57dffe73…` —
byte-identical to the rev1 baseline. All adjacent surfaces predate the rev2 claim window
(09:21–09:25): `load01-debate-page.test.tsx` 08:16, `DebatePageClient.tsx` 08:23,
`app/debate/[id]/page.tsx` 08:24, `DebatePageGate.tsx` 01:29, `runner/src/index.ts` 08:01,
`lib/api.ts` 2026-08-11, `runCostEnvelopeSelection.ts` 2026-08-11. The M-guard is unchanged and
unweakened.

---

## Advisories

**A2 (rev1) has now materialized.** `apps/v2-ui/lib/api.ts:275-276` still hardcodes
`tier_source: "ASKER"` and `tier_provenance_ref: "asker:ui-selection"` (file untouched since
2026-08-11). Rev1 filed this conditionally — *"once B1/B2 are fixed"*. They are now fixed, so the
risk tier reaching `POST /v1/asks` is a **machine-derived deployment floor posted as an asker's own
selection**. The UI cites the real source honestly; the persisted ask record does not. Not a UX-01
regression — the contract (`packages/contract/src/index.ts:109`) admits only `"ASKER"`, so this needs
a contract member, not a UI patch. Recommend the orchestrator route it as its own ticket.

**'V' in hints.** `decisionScopeProvenance: "V ruling DR-166"` (`defaults.tsx:26`, `:232`) names V.
I read this as a *citation of the ruling's author* rather than an identity default — the value it
explains is the generic `"personal"` — so I am not blocking. Flagging it because DR-166-A's language
is broad and this is V's call, not mine.

**A3 (rev1) stands.** Auto-filling `riskTier` still arms the depth effect, which selects
`members[0].depth` — depth 1 on the live standard-tier envelope, the shallowest ruled run. DR-166
ruled nothing about depth. Unchanged from rev1; still V's call.

---

## Verdict

**CHANGES REQUESTED.**

All six rev1 blockers are genuinely closed, and I confirmed each against the mutation that exposed
it: MUT-G and MUT-H both go RED, the timezone test survives four zones including quarter-hour
offsets, the carrier is the engine's own `readDeploymentMakerCapability` vocabulary, the derivations
fail independently under MUT-J, and — the thing that actually mattered — the live deployment now
renders a filled form with **Start enabled and no banner**. The lane's purpose is met on the
deployment V will use. Canary, acceptance and LOAD-01 containment are all clean.

The single outstanding item is DR-166-A, the amendment V issued mid-flight. Its ordered assertion —
two identities, two different owner defaults — was not written, and its absence is load-bearing:
hardcoding one person's identity into the owner defaults passes 73 files / 511 tests and the
typechecker (MUT-I). The production behaviour is already correct; only the guard is missing. Write
the assertion, move the fixture identity off `asker:v-session`, show MUT-I RED, and this closes.

*Opus 5 lens · isolated clone · all mutations restored and md5-verified · real tree carries only this file.*
