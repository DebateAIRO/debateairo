# UX-02 rev1 — Opus 5 lens (dual diamond, DR-153)

**Ticket:** `t_e795a52c` · **Ruling under review:** DR-166-B (with DR-166 / DR-166-A held) · **Worker:** Codex GPT-5.6 Sol
**Date:** 2026-08-13 · **Verdict: CHANGES REQUESTED** — 3 BLOCKING, 5 ADVISORY

**Method (DR-163):** every probe and mutation ran in a fresh APFS clone of the PARENT git root
`/Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`), at
`…/9d9a0a17…/scratchpad/clone/DebateAIRO`. Clone verified green at baseline (render 26 passed /
1 skipped) before any mutation. Every mutation restored and md5-confirmed byte-identical to the
real tree afterwards:

```
page.tsx      c9add0f5d22996743fb9a65a2d8c1197   (clone == real tree)
defaults.tsx  f4908a99752fac1c10370f7ade1b230b   (clone == real tree)
ux01 test     56b268e0c4d58fa9e7ae4f4ce5a06569   (clone == real tree)
```

The standing `:3000` dev server was observed READ-ONLY (navigate, screenshot, one local
disclosure toggle). No submit, no debate created, no git operation. The real tree carries only
this verdict file.

---

## What is right — verified, not taken on the handoff's word

**The five fields are genuinely absent from the collapsed DOM, not CSS-hidden.**
`page.tsx:267-288` mounts the disclosure behind `{advancedOpen ? (…) : null}`. The collapsed
render I dumped from the real page contains exactly three control ids:

```
DEFAULT_SURFACE_IDS >>> ["topic","riskTier","budgetTier"] <<<
```

No `agentCount`, `asOf`, `decisionOwner`, `actionOwner`, `decisionScope` — no element, no
`display:none`, nothing for a broken stylesheet to expose. This is the right mechanism.

**MUT-1 (`page.tsx:47` → `useState(true)`) turns the named test RED, and only that test.**

```
× DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens
  expected … to match /<button[^>]*aria-expanded="false"[^>]*aria-controls="machineOwnedAskFields"/
Tests  1 failed | 13 passed | 1 skipped (15)
```

**The expanded assertions run against live derivations, not stale snapshots.**
MUT-3 — `defaults.tsx:21-22`, `session.asker_id` → the literal `"asker:test-user-alpha"`
(a DR-166-A person-constant) — turns the two-identity guard RED through the collapsed layout:

```
× DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
Tests  1 failed | 13 passed | 1 skipped (15)
```

So item 4 holds: the guard still bites with the fields living behind the disclosure.

**Layout-only is real.** `defaults.tsx` mtime is `2026-08-13 12:04:22` — inside the UX-01 window,
before the UX-02 claim at 14:05 — and it does not appear in `find apps/v2-ui tests acceptance
-newermt '2026-08-13 14:00'`. The only source files in that change set are
`apps/v2-ui/app/new/page.tsx` and `tests/render/ux01-new-debate-form.test.tsx`. No derivation
moved; `MachineOwnedAskFields` is still imported from `defaults.tsx` at `page.tsx:19`.

**Item 5 — the behaviour itself is correct.** I drove the real form's `onSubmit` from the
never-opened collapsed state in my own probe (not the worker's assertions):

```
SUBMITTED_CONFIG >>> {"topic":"Should cities replace private cars with shared transit?",
 "config":{"risk_tier":"standard","composition_budget_tier":"low","depth":2,"agent_count":2,
 "decision_owner":"asker:test-user-alpha","action_owner":"asker:test-user-alpha",
 "decision_scope":"personal","as_of":"2026-08-13T11:20:01.287Z"}} <<<
```

Question + Start, disclosure never touched, produces the complete valid ask. Start renders
`class="startBtn ready"` with no `disabled` in the collapsed render. **The product does the right
thing. Nothing in the repo guards it — see B3.**

**Gates re-run clean in the clone at restored state:** root `tsc --noEmit` exit 0; full vitest
`74 files / 521 passed | 1 skipped`; acceptance `9 files / 35 passed`; UI-02d's seven render pins
all green by name; `vitest list` collects 15 cases in the UX-01/UX-02 file.

---

## BLOCKING

### B1 — The delivered default surface is not the surface V ruled. The gap was not disclosed.

DR-166-B: *"the default surface is: QUESTION, the depth dial (V's own DR-157 selector), and
START."* The ticket restates it: *"the default form surface is QUESTION + the depth dial + START,
nothing else visible."*

What actually paints on the live `:3000` `/new`, top to bottom:

1. "What should we debate?" + the question textarea ✅
2. **Risk tier** — a select, with `Machine default: deployment riskTier floor (acceptance:DR-133:V-approved)` (`page.tsx:214-235`)
3. **Composition budget tier** — a select, with `Provisional default pending V ruling; editable user-owned value` (`page.tsx:236-257`)
4. `Advanced ▼` (`page.tsx:258-266`)
5. `Options ▼` (`page.tsx:295-297`)
6. "At depth 1, this run may spend up to 42 model attempts…" (`page.tsx:430-434`)
7. Start debate / Cancel

**No depth dial.** The `treeDepth` select lives at `page.tsx:357-378`, inside the `Options` panel
(`page.tsx:299`), closed by default. V is told the run will happen "At depth 1" and is given no
visible way to change it — while DR-157's ratified 1..5 range is the thing V personally ruled.

Two separate misses, and they need separating:

- **Risk tier + composition budget still visible:** correctly *deferred*. The packet ordered
  Codex to note rather than decide, and the handoff notes it (`UX-02-codex-handoff.md:105`).
  That is compliant — but see A5: it is what V will actually see.
- **The depth dial missing:** **not deferred, not mentioned anywhere.** The handoff has no line
  about the depth dial. Half of a two-part named DELIVERS was silently dropped. The Options panel
  predates UX-02, so this is not a regression Codex introduced — it is a deliverable Codex did not
  notice was in the ticket.

Concretely: V boots the app for the visual gate, sees two machine-default selects with provenance
strings (the exact pattern of the screenshot that produced DR-166-B) and no way to pick a depth.
The ticket cannot pass the gate it was written for.

**Fix:** lift the depth control (`page.tsx:357-378`) out of `Options` onto the default surface as
V's DR-157 dial, and put the question of risk tier / composition budget to V in one sentence
rather than leaving it to the gate to discover.

---

### B2 — The Advanced disclosure has *zero* coverage. A dead button keeps all 521 tests green.

`tests/render/ux01-new-debate-form.test.tsx:32`

```ts
openAdvanced() { slots[advancedDisclosureStateSlot] = true; },
```

The expanded state is reached by writing `true` into hook slot 2 directly. The button's
`onClick` is never invoked by any test. So:

**MUT-2** — `page.tsx:263`, `onClick={() => setAdvancedOpen((value) => !value)}` →
`onClick={() => { /* dead */ }}`:

```
tests/render/ux01-new-debate-form.test.tsx   Tests  14 passed | 1 skipped (15)
FULL SUITE                                   Test Files  74 passed (74)
                                             Tests  521 passed | 1 skipped (522)
```

Every gate in the handoff stays green with the disclosure permanently unopenable. The ticket's
entire deliverable is "a disclosure that opens"; the accepted evidence cannot tell a working one
from a broken one. My own probe (`onClick()` invoked, then re-render) goes RED on MUT-2 and green
on production — that probe is the missing test.

**Fix:** in the expanded path, read the Advanced button's `onClick` off the evaluated element tree
and call it, instead of poking `slots[2]`. That kills MUT-2 and simultaneously retires A1.

---

### B3 — "Question + Start without ever opening Advanced" — the whole point — is untested.

No test asserts Start is ready in the collapsed render, and no test in the repo drives `submit`
from any state. The default-hidden test (`test:260-267`) checks only that the five ids are absent.

**MUT-4** — `page.tsx:145`, gate readiness on the disclosure:

```ts
const ready =
  advancedOpen &&           // MUT-4
  topic.trim().length > 6 && …
```

Result: Start is permanently disabled until the user opens Advanced — the precise inversion of
DR-166-B — and:

```
tests/render     Test Files  3 passed (3)    Tests  26 passed | 1 skipped (27)
FULL SUITE       Test Files 74 passed (74)   Tests 521 passed | 1 skipped (522)
```

Nothing catches it. The expanded test's `startBtn ready` assertion (`test:256`) is satisfied
because Advanced is open there.

**Fix:** two assertions. (a) In the collapsed test, `expect(html).toMatch(/<button type="submit"
class="startBtn ready"(?![^>]*disabled)/)`. (b) A behavioural case that invokes the form's
`onSubmit` from the never-opened state and asserts `createDebate` receives the full config —
`agent_count: 2`, asker-relative `decision_owner`/`action_owner`, `decision_scope: "personal"`,
an ISO `as_of`. My probe does exactly this and passes against production; it is ~25 lines.

---

## ADVISORY

### A1 — The render harness is coupled to `useState` declaration order.

`test:23` — `const advancedDisclosureStateSlot = 2;`. **MUT-5**: swap the two adjacent
declarations at `page.tsx:46-47` (`optionsOpen` / `advancedOpen`) — a semantics-preserving
refactor with zero behavioural change:

```
Tests  6 failed | 8 passed | 1 skipped (15)
```

Six false REDs for a no-op edit, and the inverse hazard is worse: inserting any `useState` above
`advancedOpen` silently retargets `openAdvanced()` at a different piece of state. Fixing B2 by
clicking the real button removes the magic index entirely.

### A2 — `aria-controls` dangles when collapsed; the sibling toggle has no ARIA at all.

`page.tsx:262` sets `aria-controls="machineOwnedAskFields"` on the collapsed button, but that id
does not exist until the disclosure opens (`page.tsx:268`) — a broken AT reference in the default
state. Meanwhile the visually identical `Options` toggle at `page.tsx:295-297` carries neither
`aria-expanded` nor `aria-controls`. Two same-looking disclosures, two different contracts.

### A3 — The instructional copy argues with the surface it sits on.

`page.tsx:212`: *"Type the question and click Start. Machine-owned fields remain editable under
Advanced."* — rendered directly above two machine-defaulted selects the user is being shown. As
long as B1's risk/budget question is open, this line reads as a claim the page contradicts.

### A4 — Three of the UX-01 single-field "MUTATION" cases are decorative.

`test:220`, `test:224` assert `deriveSessionAskDefaults(session).decisionOwner === "asker:test-user-alpha"`
— which is *also* the value a hard-coded person-constant returns for this fixture. Under MUT-3
both stayed green; only the two-token case (`test:269-294`) killed it. The DR-166-A guarantee does
hold, but it rests on exactly one test, and the three named mutations advertise coverage they do
not carry. Pre-existing to UX-02; flagged so it is not mistaken for depth.

### A5 — Flag to V explicitly rather than letting the gate find it.

Codex's non-decision on risk tier / composition budget was ordered by the packet and is correct
process. But the two survivors render with `Machine default: deployment riskTier floor
(acceptance:DR-133:V-approved)` — the same visible-machine-provenance pattern that produced
DR-166-B. If they belong behind Advanced too, that is one line of ruling; if they are genuine user
choices, that is also one line. Either way it should reach V as a question, not as a surprise on
the screenshot.

---

## Verdict

**CHANGES REQUESTED.** The named deliverable — the five DR-166 fields off the default surface,
genuinely unrendered, prefilled and editable and provenance-hinted behind `Advanced`, with the
DR-166-A guard intact and the collapsed submit producing a complete ask — is **built correctly**.
I verified each of those against the real components, with mutations, and against the live app.

What blocks is the other half and the proof:

- **B1** the ruled default surface was delivered half-way (depth dial absent, undisclosed);
- **B2** the disclosure toggle can be dead with 521/521 green;
- **B3** the collapsed submit path — the reason the ticket exists — has no guard at all, and a
  one-token change makes Start permanently unreachable without tripping a single gate.

B2 and B3 are small, mechanical test additions. B1 needs one product move plus one question to V.
Nothing here suggests reworking the disclosure itself.
