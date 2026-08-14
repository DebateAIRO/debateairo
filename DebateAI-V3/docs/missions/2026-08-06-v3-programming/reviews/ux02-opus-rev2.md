# UX-02 rev2 — Opus 5 lens (dual diamond, DR-153)

**Ticket:** `t_e795a52c` · **Ruling under review:** DR-166-C (settling DR-166 / DR-166-A / DR-166-B) · **Worker:** Codex GPT-5.6 Sol
**Date:** 2026-08-13 · **Verdict: APPROVED** — all three rev1 blockers closed, both folded advisories closed, no new blocking finding

**Method (DR-163):** every probe and mutation ran in a fresh APFS clone of the PARENT git root
`/Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`), at
`…/9d9a0a17…/scratchpad/rev2clone/DebateAIRO`. The clone was verified green at baseline
(**74 files / 522 passed | 1 skipped (523)**) before any mutation. Eleven mutations were applied
and restored; after the last one the clone was md5-confirmed byte-identical to the real tree, and
the real tree was re-hashed at the end to confirm it never moved:

```
page.tsx      54b6cca33f6868d431e522d5d905252f   (clone == real tree, post-gates)
defaults.tsx  f4908a99752fac1c10370f7ade1b230b   (clone == real tree, post-gates)
ux01 test     db94e6fcf9fe8d41f0fe16167aa9b97b   (clone == real tree, post-gates)
```

`defaults.tsx` is `f4908a99752fac1c10370f7ade1b230b` — the exact hash I recorded in rev1 as its
UX-01-approved state. **Byte-identical; the derivation layer was not touched by rev2.**

The standing `:3000` dev server was observed READ-ONLY: navigate, DOM inspection, one topic typed
into a local textarea, one Advanced toggle, then a reload to reset. **No submit, no debate created,
no git operation.** The real tree carries only this verdict file.

---

## 1. The DR-166-C surface renders — and the dial moved, it was not copied

Live `/new`, read off the real DOM (not the handoff's word):

```
DEFAULT_SURFACE_IDS >>> ["topic","riskTier","budgetTier","treeDepth"] <<<
depthControlCount   >>> 1 <<<
machineryPresent    >>> [] <<<
```

Top to bottom the page now paints exactly V's ruled surface: **question · risk tier · composition
budget tier · Tree depth · Start**, with `Advanced` and `Options` both collapsed beneath. The dial
is the real DR-157 selector carrying V's ratified range — the live envelope populates all five
rungs (`1 — up to 42 … 5 — up to 402 model attempts`), so the "At depth 1" line V was shown in the
screenshot that produced DR-166-B now has a visible control next to it.

**Not a second copy.** The diff of `page.tsx` against its pre-UX-02 state shows the identical
`optionRow` block deleted from inside the `Options` panel (`optionsOpen ? …`) and re-inserted on
the default surface — same `id="treeDepth"`, same `allowedEnvelopeMembers` mapping, same
`disabled={allowedEnvelopeMembers.length === 0}`, differing only in indentation. The `DR-115
honesty` comment and the Options-panel hint were updated in the same move to stop claiming depth
is carried from there. `grep` finds one `id="treeDepth"` in the file; the live DOM counts one
collapsed and **one expanded** (checked both).

The five machinery fields remain genuinely unmounted when collapsed — no element, no
`display:none`. Expanding Advanced adds exactly `machineOwnedAskFields`, `agentCount`, `asOf`,
`decisionOwner`, `actionOwner`, `decisionScope` and nothing else.

---

## 2. B2 — CLOSED. The dead-button hole is sealed.

`advancedDisclosureStateSlot` and `openAdvanced()` are gone from the harness. The expanded path now
evaluates the real component element tree, finds the button whose text contains `Advanced`, and
invokes its **production `onClick`** (`test:177-189`).

**MUT-2** — `page.tsx`, `onClick={() => setAdvancedOpen((value) => !value)}` → `onClick={() => { /* dead */ }}`:

```
× B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled
  expected … to match /<button[^>]*aria-expanded="true"[^>]*…/
× B2/B5 (absent risk floor) · × B2/B5 (absent envelope) · × DR-166-A + MUT-I
× B5 honest absence · × keeps all five controls editable
FOCUSED     Tests  6 failed | 9 passed | 1 skipped (16)
FULL SUITE  Test Files  1 failed | 73 passed (74)
            Tests  6 failed | 516 passed | 1 skipped (523)
```

In rev1 this exact mutation left **521/521 green**. It now takes down six tests and the full suite.

**A1 retired, verified both directions.** **MUT-5** — swap the adjacent `optionsOpen` /
`advancedOpen` declarations: `15 passed | 1 skipped (16)`. **MUT-5b** — insert an unrelated
`useState` *above* `advancedOpen` (the worse inverse hazard I named in rev1):
`15 passed | 1 skipped (16)`. Six false REDs became zero. The magic index is gone.

---

## 3. B3 — CLOSED. The collapsed path is now guarded, and the payload assertion has teeth.

`DR-166-B + MUTATION collapsed-submit` (`test:326-350`) renders with `advanced` never set, asserts
`startBtn ready` with no `disabled`, asserts `machineOwnedAskFields` is absent, then pulls the real
`form.onSubmit` off the evaluated tree and awaits it.

**MUT-4** — `ready` gated on `advancedOpen &&`:

```
× DR-166-B + MUTATION visible-by-default   (startBtn ready → startBtn disabled)
× DR-166-B + MUTATION collapsed-submit
Tests  2 failed | 13 passed | 1 skipped (16)
```

In rev1 this stayed green through the whole 74-file suite. It is now caught twice.

I did not take the payload assertion on faith either — two independent payload mutations, each of
which a weak `toHaveBeenCalled()` check would have missed:

| mutation | result |
|---|---|
| `depth: selectedEnvelopeMember!.depth` → `depth: 1` | `× collapsed-submit` — 1 failed \| 14 passed \| 1 skipped |
| `decisionScope` → `"team"` | `× collapsed-submit` — 1 failed \| 14 passed \| 1 skipped |

The test drives from the never-opened state and pins the whole ask: `risk_tier`, `composition_budget_tier`,
`depth`, `agent_count: 2`, both asker-relative owners, `decision_scope: "personal"`, an ISO-round-tripping
`as_of`, plus `push("/debate/run%3Anew")`.

**Confirmed on the live app too.** With only a question typed and `Advanced` never touched:

```
COLLAPSED_START >>> {"className":"startBtn ready","disabled":false,"advancedOpen":false} <<<
```

---

## 4. A2 / A3 — CLOSED, and each is now mutation-guarded

`aria-controls` is emitted only while its region is mounted, on **both** toggles, and `Options`
gained `aria-expanded`. Live DOM, collapsed and expanded:

```
collapsed  Advanced  aria-expanded="false"  aria-controls=absent
           Options   aria-expanded="false"  aria-controls=absent
expanded   Advanced  aria-expanded="true"   aria-controls="machineOwnedAskFields"  → resolves: true
           Options   aria-expanded="false"  aria-controls=absent
```

Every one of these is pinned. Each mutation below produced `1 failed | 14 passed | 1 skipped (16)`:

- restoring rev1's unconditional `aria-controls` on **Advanced** (the dangling reference) → RED
- unconditional `aria-controls` on **Options** → RED
- deleting `aria-expanded` from **Options** → RED
- reverting the helper copy to rev1's *"Type the question and click Start…"* → RED

The copy now reads *"Choose your risk tier, composition budget tier, and depth, then click Start.
Machine-owned fields remain editable under Advanced."* — which is the DR-166-C surface described
accurately, so A3's contradiction is gone.

**B1 is pinned, not merely delivered.** I wrapped the default-surface depth row back inside
`{optionsOpen ? … : null}` — re-burying the dial exactly as rev1 had it:

```
× DR-166-B + MUTATION visible-by-default: expected … to contain 'id="treeDepth"'
Tests  1 failed | 14 passed | 1 skipped (16)
```

The ruled surface cannot silently regress again.

---

## 5. Canaries and gates — all hold

**MUT-1** (`advancedOpen` → `useState(true)`) still RED, and harder than in rev1 —
`8 failed | 7 passed | 1 skipped (16)`.

**DR-166-A guard** (`defaults.tsx:20-21`, `session.asker_id` → the person-constant
`"asker:test-user-alpha"`) still RED through the collapsed layout:
`× DR-166-A + MUT-I` — `1 failed | 14 passed | 1 skipped (16)`.

Gates, all re-run in the clone at fully restored state:

```
pnpm exec vitest run                       Test Files 74 passed (74)
                                           Tests 522 passed | 1 skipped (523)
pnpm exec vitest run --config acceptance/  Test Files 9 passed (9)   Tests 35 passed (35)
pnpm exec tsc --noEmit --pretty false      exit 0
pnpm --filter dialectical-engine-v2ui typecheck   exit 0
pnpm --filter dialectical-engine-v2ui test        # tests 27 / pass 27 / fail 0
pnpm lint                                  { "blocking": [] }
git diff --check                           exit 0
vitest list  ux01-new-debate-form          15 collected + 1 runIf-skipped, exit 0
```

**UI-02d pins — all seven green by name:** tree, thread, outline, split, map, drawer maker props,
and the typed-absence / accessible-name case. `Tests 7 passed (7)`.

**Layout-only holds for rev2.** The only source files touched since the rev1 review are
`apps/v2-ui/app/new/page.tsx` and `tests/render/ux01-new-debate-form.test.tsx`. `defaults.tsx`
keeps its 12:04 mtime and its UX-01-approved md5.

---

## Non-blocking notes (do not gate closure)

- **N1 — cosmetic.** `page.tsx:327` carries a stray six-space indent on `{optionsOpen ? (` left
  over from the move. `git diff --check` is clean; purely visual.
- **N2 — the duplicate-dial case is unguarded.** The collapsed assertion is
  `toContain('id="treeDepth"')`, which would also pass if a *second* depth control were added. The
  tree today has exactly one (verified by diff and by live DOM count, collapsed and expanded), so
  this is a latent gap, not a defect. A `match(/id="treeDepth"/g)?.length === 1` would close it.
- **N3 — the dial's usability is not pinned.** The collapsed test asserts the control is present,
  not that it is enabled or populated; a permanently-`disabled` dial would pass. Live renders it
  enabled with all five ruled rungs.
- **N4 — rev1's A4 stands unchanged.** The three single-field `MUTATION decision_owner /
  action_owner / decision_scope` cases remain decorative (a hard-coded person-constant satisfies
  them); the DR-166-A guarantee still rests solely on the two-token case, which does bite.
  Pre-existing to UX-02, untouched by rev2, flagged only so it is not mistaken for depth.

---

## Verdict

**APPROVED. UX-02 closes.**

Every one of my rev1 blockers is closed by mechanism, not by assertion, and I confirmed each by
re-running the original mutation:

- **B1** — the depth dial is on the default surface, **moved** out of `Options` rather than
  duplicated (one control, proven by diff and by live DOM count), and re-burying it now goes RED.
  The delivered surface is exactly DR-166-C: question · risk tier · budget tier · depth dial · Start.
- **B2** — the dead-`onClick` mutation that kept 521 green now fails six tests and the full suite;
  the harness clicks the production handler, and A1's hook-order coupling is gone in both
  directions.
- **B3** — `ready` gated on `advancedOpen` now fails twice; the behavioural submit drives from the
  never-opened state and its payload assertion is proven to bite on two independent payload
  mutations. Confirmed on the live app: question typed, Advanced never touched, `startBtn ready`.
- **A2 / A3** — folded and each independently mutation-guarded.

The canaries (MUT-1, the DR-166-A two-identity guard) still bite, the baseline is the
orchestrator-verified 74 files / 522 passed + 1 skipped, UI-02d's seven pins are green by name,
and `defaults.tsx` is byte-identical to the state UX-01 was approved on. Nothing here should
delay V's visual gate.
