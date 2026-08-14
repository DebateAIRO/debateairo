# UX-01 rev3 — Opus 5 lens (dual diamond, DR-153)

**Ticket:** `t_b2f82786` · **Ruling under review:** DR-166-A (sole remaining item) · **Worker:** Codex GPT-5.6 Sol
**Date:** 2026-08-13 · **Verdict: APPROVED — UX-01 closes**

**Method (DR-163):** every probe and mutation ran in a fresh APFS clone of the PARENT git root
`/Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`), at
`…/9d9a0a17…/scratchpad/clone3/DebateAIRO`. Clone verified byte-identical on all eight relevant
files before any work. Every mutation restored and md5-confirmed. The real tree carries only this
verdict file — all eight surface md5s re-verified unchanged at exit.

---

## Scope

Rev2 verified all six rev1 blockers CLOSED. One item remained: V's mid-flight DR-166-A amendment —
*"verify no fixture, hint text, placeholder or test constant carries 'V' as an identity; and make
one assertion prove the defaults CHANGE when the session identity changes (two different tokens →
two different owner defaults)."* At rev2 that assertion did not exist, the sole fixture was
`asker:v-session`, and MUT-I passed 73 files / 511 green.

**Rev3 is test-only.** `apps/v2-ui/app/new/defaults.tsx` and `apps/v2-ui/app/new/page.tsx` are
**byte-identical to my own rev2 snapshots** (`diff` clean; `defaults.tsx`'s 12:04 mtime is a
same-content rewrite). The entire delta is
`tests/render/ux01-new-debate-form.test.tsx`. That matches the worker's claim exactly: the
production behaviour rev2 already certified correct was not touched to manufacture a pass.

---

## 1. MUT-I — RED, via the named assertion, on the real rendered page

Re-run verbatim as my prior instance defined it: hardcode **both** owner defaults to the fixture
identity, which is now `asker:test-user-alpha`.

```diff
  export function deriveSessionAskDefaults(session: Session, now: Date = new Date()) {
    return Object.freeze({
-     decisionOwner: session.asker_id,
-     actionOwner: session.asker_id,
+     decisionOwner: "asker:test-user-alpha",
+     actionOwner: "asker:test-user-alpha",
```

```
× tests/render/ux01-new-debate-form.test.tsx > UX-01 machine-defaulted real /new flow
  > DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page

 Test Files  1 failed | 72 passed (73)
      Tests  1 failed | 511 passed | 1 skipped (513)

AssertionError: expected '<div class="screen scroll"><div class…'
  to match /<input[^>]*id="decisionOwner"[^>]*val…/
 ❯ tests/render/ux01-new-debate-form.test.tsx:271:24
```

Line 271 is the **beta** assertion:
`expect(betaHtml).toMatch(/<input[^>]*id="decisionOwner"[^>]*value="asker:test-user-beta"[^>]*>/)`.
The failing subject is rendered page HTML (`<div class="screen scroll">…`), not a return value.
Rev2's silent-green result is dead: the exact pattern DR-166-A outlawed now costs a test.

## 2. No V-flavoured identity anywhere in the UX-01 surface — confirmed

Exhaustive literal sweep of the test and both form sources. **Every** identity constant:

```
ux01-new-debate-form.test.tsx:15   "token:test-user-alpha"      :253  "token:test-user-beta"
ux01-new-debate-form.test.tsx:123  "asker:test-user-alpha"      :255  "asker:test-user-beta"
ux01-new-debate-form.test.tsx:124  "session:test-user-alpha"    :256  "session:test-user-beta"
```

`asker:v-session` / `session:v-session` / `token:v` are **gone repo-wide** — the only surviving
occurrences are in the rev1/rev2 review prose and the handoff's own account of removing them.
Placeholders are generic role prompts ("Who owns the decision this answer feeds", "Who will act on
it", "What the decision covers"); owner hints read `authenticated session asker identity`. Nothing
in the surface names a person.

**Advisory (non-blocking):** the opt-in live probe at `:279` still carries
`{ "x-user-dev-token": "v-dev" }`. That is the standing dev stack's operator credential (documented
mission-wide as `--token v-dev`), not an identity default: the test is gated behind
`UX01_LIVE_STACK=1`, asserts only on agent count / provenance / Start, and the identity it renders
comes from the server's own `/v1/session` (`asker:79ab1624…`, a hash). It encodes no person as a
default. Flagging only because DR-166-A's wording is literal; the clean fix if V wants it is to read
the token from an env var.

## 3. The assertion derives through the real rendered page — proven, not assumed

Reading the code is not enough here, so I mutated the **page seeding layer only**, leaving
`deriveSessionAskDefaults` pristine:

```diff
- setDecisionOwner((current) => current.trim().length > 0 ? current : defaults.decisionOwner);
- setActionOwner((current)   => current.trim().length > 0 ? current : defaults.actionOwner);
+ setDecisionOwner((current) => current.trim().length > 0 ? current : "asker:test-user-alpha");
+ setActionOwner((current)   => current.trim().length > 0 ? current : "asker:test-user-alpha");
```

```
✓ MUTATION decision_owner: uses asker identity, not token/session id      ← unit call, GREEN
✓ MUTATION action_owner: does not leave the former empty field            ← unit call, GREEN
✓ B4: renders the real NewDebatePage with all seed calls applied …        GREEN
× DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
 Tests  1 failed | 12 passed | 1 skipped (14)
```

**This is the decisive result.** Every unit-level owner assertion survives a page that hardcodes a
person, and only the DR-166-A assertion dies. The guard is bound to `NewDebatePage`'s rendered
output, not to the derivation function. It also confirms the page really re-reads per identity —
`expect(readSession).toHaveBeenCalledWith("token:test-user-alpha" | "token:test-user-beta")` both
hold, and the two mounts assert on `alphaHtml` / `betaHtml` separately with mutual exclusion
(`not.toContain` in both directions).

## 4. Canary — rev2's closures hold; nothing else moved

| Gate | Result |
|---|---|
| Baseline (clone, pristine) | **73 files / 512 passed + 1 skipped (513)** — orchestrator figure matched |
| **MUT-G** (delete all six seed calls) | **RED — 5 failed / 507 passed** (was 4 at rev2; the new assertion adds the fifth) |
| **MUT-H** (fabricate `setAgentCount("2")` in the provider catch) | **RED — 1 failed / 511 passed**, at the B5 test |
| Restore → full suite | 73 files / 512 + 1 skipped — clean |
| Acceptance | **9 files / 35 passed (35)**, 0 failures — identical to rev2 |
| Root `tsc --noEmit` | exit 0 |
| `apps/v2-ui` `tsc --noEmit` | exit 0 |

**Acceptance suite untouched:** `diff -rq` of the whole `acceptance/` tree against the real tree is
identical apart from live `.pgdata` runtime state; every acceptance source file predates the rev3
window (latest `run-acceptance.ts` / `xrev01-depth1-proof.ts` at 00:24, vs. rev3's 11:30–12:05).

**LOAD-01 containment holds.** `tests/render/load01-debate-page.test.tsx` md5 `57dffe73d284…` —
byte-identical to the rev1 and rev2 baselines. The M-guard is unchanged and unweakened.

---

## Advisories carried forward (all pre-existing, none blocking)

**Owner defaults remain sticky across an in-mount identity change.** Re-probed at rev3 and it
still reproduces — and it is worth being precise about what happens:

```
BEFORE  <input id="decisionOwner" … value="asker:test-user-alpha"/>
AFTER   <input id="decisionOwner" … value="asker:test-user-alpha"/>   ← token now beta
readSession calls: [["token:test-user-alpha"],["token:test-user-beta"]]
```

The effect **does** re-run and **does** fetch the beta session; the non-empty guard
(`page.tsx:116-118`) then discards the answer. The new assertion uses two fresh mounts, which is
exactly what V ordered ("two different tokens → two different owner defaults"), so this is not a
shortfall against DR-166-A. It stays unreachable today because `AuthGate` only moves the token
`null → value`, never value → different value. I declined to block on it at rev2 and decline again;
raising it to a blocker now would be moving the goalposts on an item never ordered fixed. But the
line that preserves a user's typed edit is the same line that preserves a *previous user's
identity*, and that deserves a deliberate decision rather than inheritance.

**A2 stands and is now live.** `apps/v2-ui/lib/api.ts:276-277` still posts
`tier_source: "ASKER"` / `tier_provenance_ref: "asker:ui-selection"` (file untouched since
2026-08-11). With B1/B2 fixed, the risk tier reaching `POST /v1/asks` is a machine-derived
deployment floor recorded as an asker's own selection. Not a UX-01 regression — the contract
(`packages/contract/src/index.ts:109`) admits only `"ASKER"`, so this needs a contract member, not a
UI patch. Recommend the orchestrator route it as its own ticket.

**`"V ruling DR-166"` in the decision-scope hint** (`defaults.tsx:26`, rendered at `:232`). Same
reading as rev2: a citation of the ruling's author for a generic value (`"personal"`), structurally
the same as the production register's own `acceptance:DR-140:V-approved` source_ref. It is V-as-
author, not V-as-identity. Not blocking; still V's call if the literal reading is preferred.

**A3 stands.** Auto-filling `riskTier` arms the depth effect, which selects `members[0].depth` —
depth 1 on the live standard-tier envelope. DR-166 ruled nothing about depth. Unchanged; V's call.

---

## Verdict

**APPROVED.**

The one item is closed, and closed on its merits rather than by assertion-fitting. The two-identity
guard V ordered now exists, runs two distinct identities through the **real** `NewDebatePage`, and
has teeth in both directions: hardcoding the person-constant in the derivation (MUT-I) kills it, and
hardcoding it one layer up in the page seeding kills it *while every unit-level owner assertion
stays green* — which is the proof that it is a page-level guard and not a restatement of the
function. The fixture is neutral (`test-user-alpha` / `test-user-beta`), no V-flavoured identity
survives anywhere in the surface, and the production code is byte-identical to what rev2 already
certified correct, so no behaviour was traded for the guard. MUT-G and MUT-H are still red, the
baseline is 73 / 512 + 1 skipped, acceptance is 9 / 35 untouched, both typecheckers are clean, and
LOAD-01 is unmoved.

Three standing advisories (owner stickiness, A2's `tier_source`, A3's depth) are pre-existing, were
non-blocking at rev2, and remain non-blocking here — but A2 in particular is now live and should be
routed as its own ticket.

*Opus 5 lens · isolated clone · all mutations restored and md5-verified · real tree carries only this file.*
