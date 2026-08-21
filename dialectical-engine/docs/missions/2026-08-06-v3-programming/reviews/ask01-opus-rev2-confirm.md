# ASK-01 — Opus 5 lens, rev2 rework confirmation

Ticket `t_2eb80121` · board debateai-v3 · DR-180 · P8 own-findings confirmation.
Rev2 delta = `git diff 4f06fd5` at `/Users/vladmihaimiron/Documents/DebateAIRO`.
Confirmed 2026-08-14. Refers to `reviews/ask01-opus-rev1.md` (B1, A1, A4) and
`reviews/ask01-grok-rev1.md` (required-rework items 1 and 2).

**Isolation (DR-163).** Every mutation ran in `/private/tmp/ask01-confirm-clone`
(`cp -Rc` of the parent root), deleted at the end (`No such file or directory`
verified). The user's tree was read-only throughout: `defaults.tsx` sha256
`30f3d540cf3575fc83a053e1c7124672e647c97d37c3443c8a0cbb5428510417`,
`page.tsx` `dc66e8e7a16e089393e2d8bc5b009ce327b19f6c94ec78dab10f0e6175314af2`,
`ux01-new-debate-form.test.tsx` `ea5f387ff6bbad78592bca2fb2e9a98aae10f4985ad2d34c0fc96e7c76653f7b`
— identical before and after every run, and the first two match the rev1 review
receipts byte-for-byte. `git status` at the end shows the same two modified
files it showed at the start. The standing stack (PG 55432 / API 8790 / shim
8791 / grok-relay 8792 / UI 3000) was never touched — rev2 needed no live probe,
because the rework changes no product behaviour that rev1's live run already
proved.

---

## 4. Tests-only — diff audit (checked first, because a product byte here is itself blocking)

```
$ git diff 4f06fd5 --name-only
DebateAI-V3/docs/missions/2026-08-06-v3-programming/handoffs/ASK-01-codex-handoff.md
DebateAI-V3/tests/render/ux01-new-debate-form.test.tsx

$ git diff 4f06fd5 --name-only -- 'DebateAI-V3/apps/**' 'DebateAI-V3/packages/**' \
    'DebateAI-V3/web/**' 'DebateAI-V3/tools/**' 'DebateAI-V3/acceptance/**' 'DebateAI-V3/migrations/**'
(empty)
```

Two files: one test, one handoff. **Zero product-code bytes.** Independently
corroborated by digest: `defaults.tsx` and `page.tsx` still hash to the exact
values rev1 recorded before the rework existed, so the product is provably the
same artefact rev1 verified live. Untracked additions in the tree
(`reviews/dr181-*.md`) are docs from a different ticket and carry no code.

**Status: CONFIRMED — TESTS-ONLY.**

---

## 1. B1 (BLOCKING in rev1) — the DR-166-A user-relative-identity pin

### The mutation, replayed exactly

M6 as rev1 defined it: `deriveSessionAskDefaults` returns a fixed constant
instead of `session.asker_id`, with the constant chosen as `asker:test-user-alpha`
so that no *other* test can accidentally take the kill (this is the precise
variant that survived all 587 in rev1).

```diff
-    decisionOwner: session.asker_id,
-    actionOwner: session.asker_id,
+    decisionOwner: "asker:test-user-alpha",
+    actionOwner: "asker:test-user-alpha",
```

Full suite in the clone:

```
× tests/render/ux01-new-debate-form.test.tsx > UX-01 machine-defaulted real /new flow
  > DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
  → expected { risk_tier: 'standard', …(9) } to match object { …(2) }

  Tests  1 failed | 588 passed | 1 skipped (590)
```

**RED, killed by exactly the named test, and by that test alone.** In rev1 this
same mutation was `587 passed | 1 skipped — none`. The kill-power regression is
reversed.

### It proves it THROUGH THE REAL PAGE — verified element by element

`tests/render/ux01-new-debate-form.test.tsx:432–477`. Each clause of the goal's
requirement, checked against the source rather than the handoff's description:

| Required | Where | Verified |
|---|---|---|
| two **bare-Start submits** | `submitBareStart()` calls `renderRealNewDebatePageState()` (which `import`s the real `apps/v2-ui/app/new/page.js`), finds the real `form` element and invokes **its own** `onSubmit` — no payload authored by the test | YES |
| under **two different auth tokens** | `pageMocks.authToken` set to `token:test-user-alpha` then `token:test-user-beta`; `readSession` is a per-token map returning distinct `asker_id`s; `hooks.reset()` before each so the second render is fresh state | YES |
| each submitted `createDebate` config carries **its own asker's** owners | `createDebate` called twice; `alphaConfig` matched to `asker:test-user-alpha`, `betaConfig` to `asker:test-user-beta`, and the call's third arg pinned to the matching token so the pairing cannot be crossed | YES |
| values **distinct between tokens** | explicit `not.toBe` cross-checks on both `decision_owner` and `action_owner` — the invariant rev1's replacement had dropped | YES |
| machine-control ids **still absent** | loop over all five (`agentCount`, `asOf`, `decisionOwner`, `actionOwner`, `decisionScope`) against both rendered HTMLs | YES — **stronger than the 884230c original**, which checked only the two owner ids |

The observation point is `createDebate`, i.e. the submitted payload — exactly the
remedy rev1 prescribed, and the only place the invariant is observable now that
the controls do not render. `buildNewDebateAskConfig` and the whole page submit
path are real code, not stubs; only the API client is mocked.

### Grok's item 2 — handoff prose vs. actual assertions

Grok blocked partly because the handoff claimed more than the test proved.
Checked line by line against the assertions above:

- Inventory (`ASK-01-codex-handoff.md:22`): "drives two bare-Start submissions
  through the real page under alpha and beta auth tokens, then proves each
  `createDebate` config carries its own asker's distinct `decision_owner` and
  `action_owner` while all five machine-control IDs remain absent" — **accurate,
  clause for clause.**
- Evidence row (`:44`): "two bare-Start submits through the real page call
  `createDebate` twice: alpha carries alpha `decision_owner`/`action_owner`, beta
  carries beta values, the two tokens' values differ, and all five
  machine-control IDs are absent from both renders" — **accurate.** The rev1
  claim it replaces ("two session tokens still derive distinct asker-relative
  owner values") is now backed rather than asserted.
- Mutation ledger (`:132`) states the mutation and its RED tally `1/17/1`; my
  focused run reproduces `1 failed | 17 passed | 1 skipped (19)`.

**Status: B1 CONFIRMED-CLOSED.** Grok's required-rework item 1 and item 2 are
satisfied on the same evidence; its block resolves with mine.

---

## 2. A4 / M7 — the envelope-exactness refusal branch

New test `M7: refuses a run-cost envelope ceiling that is not an exact Set-A
maker maximum` (`:232–252`) feeds a `runCostEnvelope` whose depth-2 ceiling is
`109` and asserts both the code and the exact message.

Arithmetic independently checked, not taken from the handoff:
`ratifiedEnvelopeAttempts(2,1)=54`, `(2,2)=108`, `(2,3)=174`. `109` sits between
the M=2 and M=3 ceilings, so it is genuinely inexact and the search must land on
`candidate=3` and refuse. The fixture is a real discriminator, not a value that
trivially throws earlier for some other reason.

Mutation — remove the refusal so the derivation silently rounds up to the next M
(the exact defect class the branch guards):

```diff
-    if (ratifiedEnvelopeAttempts(Number(depth), candidate) !== Number(ceiling)) {
-      throw new TypedDomainError(
-        "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
-        "The deployment runCostEnvelope does not encode a ratified maker maximum."
-      );
-    }
```

```
× M7: refuses a run-cost envelope ceiling that is not an exact Set-A maker maximum
  → expected function to throw an error, but it didn't
  Tests  1 failed | 588 passed | 1 skipped (590)
```

**RED, single kill, correct test.** In rev1 this mutation passed all 587.

**Status: A4 / M7 CONFIRMED-CLOSED.**

---

## 3. A1 — the a11y contract

**Which option was taken: restoration, not retirement.** The handoff does not
retire the disclosure's a11y contract; it re-homes it on the surviving surface.
That is the honest choice available, and the honest one to make — rev1's A1
explicitly said these assertions guard the **Options** disclosure, which DR-180
never retired. Retiring them under a DR-180 citation would have been the
dishonest reading, and it was not taken.

New test `R3: the surviving Options disclosure exposes aria-controls only while
its panel exists` (`:330–347`). All three assertions rev1 found orphaned are
back, one of them tightened, plus a positive open-state contract that never
existed before:

| rev1 orphaned assertion | R3 | Delta |
|---|---|---|
| `/<button[^>]*aria-expanded="false"[^>]*>Options/` | `:332`, with `class="optionsToggle"` required | tighter |
| `not.toMatch(/…aria-expanded="false"[^>]*aria-controls="additionalRunOptions"/)` | `:333` | verbatim |
| `not.toContain('id="additionalRunOptions"')` | `:334` | verbatim |
| *(none)* | `:345–346` open state: `aria-expanded="true"` **with** `aria-controls`, and a matching panel id | **new** |

rev1's grep evidence is reversed: `grep -rn "additionalRunOptions" tests/` and
`grep -rn "aria-controls" tests/` returned **zero hits** at rev1 and now return
four and three respectively, all in this test.

Not taken on faith — mutated in both directions on the real `page.tsx`:

| A11y mutation | Result |
|---|---|
| `aria-controls={optionsOpen ? "additionalRunOptions" : undefined}` → `aria-controls="additionalRunOptions"` (closed disclosure advertises a panel it does not render — the original hazard) | **RED** — `expected … not to match /<button[^>]*aria-expanded="false"[^>]…/` |
| drop the `aria-controls` prop entirely (open disclosure loses the relationship) | **RED** — `expected … to match /<button[^>]*aria-expanded="true"[^>]…/` |

Both `1 failed | 17 passed | 1 skipped (19)`. The pin is load-bearing in both
directions, not a tautology over markup that happens to exist.

**Status: A1 CONFIRMED-CLOSED** (restored and strengthened; handoff prose at
`:24` and `:46` matches the assertions).

---

## Suite delta — 587 → 589, nothing else moved

The rework's own shrink audit, run the same way rev1 ran it: `pnpm vitest list`
on `4f06fd5`'s test file and on rev2's, sorted and `comm`-diffed in the clone.

```
rev1: 587 names        rev2: 589 names
removed: (none)
added:   M7: refuses a run-cost envelope ceiling that is not an exact Set-A maker maximum
         R3: the surviving Options disclosure exposes aria-controls only while its panel exists
```

**Zero removals.** The DR-166-A test was strengthened in place under its existing
name, so no name-diff blind spot is being relied on this time — and the
strengthening is proven by the M6 kill above, which is the only evidence a
name-diff cannot fake.

---

## 5. Gates (clone, rev2 applied, product tree restored and digest-verified)

```
pnpm test        → Test Files  79 passed (79)
                   Tests  589 passed | 1 skipped (590)      [expected 589|1 ✓]
pnpm vitest list → 589                                       [✓]
pnpm run typecheck                              → tsc --noEmit                 (clean)
pnpm --filter dialectical-engine-v2ui typecheck → tsc --noEmit -p tsconfig.json (clean)
pnpm run lint    → {"edgeRowsChecked": 27, "violations": []}
                   {"blocking": []}
git status --porcelain -- apps packages tools acceptance web  → (empty, post-restore)
```

The 1 skipped test is the opt-in `UX01_LIVE_STACK` read-only live gate, as before.

---

## Residuals — carried, not blocking

- **A2 (M-guard literal vs. envelope inverse) and A3 ("healthy" not modelled)**
  are now explicitly owned by **DR-181** (ledger `:1463`), V's ruling that
  retires the ratified-maker-count concept, the M-guard and every future ceiling
  ratification in favour of health-script discovery. Both advisories are
  superseded work items with a named home; neither was ASK-01's to fix.
- **A5** (server renames tier provenance at the boundary) and **A6** (an envelope
  fault now also disables the agent-count default) stand exactly as rev1 filed
  them — untouched by a tests-only delta, correctly so.
- **Nit, no action needed:** the handoff says rev2's "sole tracked diff" is the
  test file; the handoff itself is also tracked and modified. The claim's
  substance — no product file changed — is true and independently verified above.
- **Nit:** M6 is killed by asserting owners equal each session's `asker_id`; a
  hypothetical mutation deriving owners from the auth token string would still
  pass. That mutation is still user-relative identity, so it is outside the
  defect class DR-166-A names. Recording it for completeness, not as a gap.

---

## Disposition

Every finding I raised in rev1 is closed by a test that kills the mutation which
escaped it, and the delta that closes them contains no product code. B1's
successor proves the invariant through the real page's own submit path under two
tokens, with the distinctness cross-check rev1 found missing and a wider
absence check than the pre-ASK-01 original. M7's refusal branch and the Options
a11y relationship are both mutation-proven in both directions. The suite grew by
exactly the two tests those fixes require and lost nothing. Gates are green at
589 | 1.

Grok's rev1 block rests on the same defect as my B1 and its two required-rework
items are satisfied by this same delta; it resolves here.

- **B1 — CONFIRMED-CLOSED**
- **A4 / M7 — CONFIRMED-CLOSED**
- **A1 — CONFIRMED-CLOSED** (restored on the surviving surface, strengthened)
- **Tests-only — CONFIRMED**
- **Gates — GREEN**
- **STILL-OPEN: none of mine.** A2/A3 superseded by DR-181; A5/A6 stand as filed.

VERDICT: APPROVE
