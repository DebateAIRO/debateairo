# CODE-REV-S02-C3C4 — round 1 verdict (mission `consent-ui`, blind per-cluster code review)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`
(all five loaded in THIS session with the Skill tool, bodies read. `superpowers:systematic-debugging` was loaded before I root-caused the P10b failure, not after. `superpowers:receiving-code-review` — **not loaded this session, not needed because no finding of mine has been contested yet**; it is loaded the moment one is, per COMMON §10.9's honest form.)

**Verdict: PASS** — with three non-blocking findings (N1 · N2 · N3) and one packet finding (P1). Every N-finding demands a fix; the tier sets only WHEN. Round 1 of max 3.

- **Under review:** seat CODE-S02-C3C4, ticket `t_126a42a2`, commits `0928c38c` (C3) and `fb44696d` (C4) on `slice/consent-s02-form`, base `91877847`.
- **My worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine`, detached at `fb44696d`. `git status --porcelain` = 0 entries at CLAIM and 0 at exit. `pnpm run generate:contract` run first, exit 0.
- **Probe kit:** `.hermes/reports/consent-ui/probes/code-rev-s02-c3c4-r1-*` (20 files), copied before this verdict per COMMON §10.26.

---

## 1. The three-run cluster tables — AS I MEASURED THEM, in my own worktree

Guard transcribed from `PLAN.md:1377-1389` (`run()`), ASCII terms only. Run **from a `.sh` under `/bin/bash`** and **inline**, three runs each, per COMMON §10.16.

```
grep flavour in the .sh under /bin/bash : grep (BSD grep, GNU compatible) 2.6.0-FreeBSD
grep flavour INLINE                     : ugrep 7.8.4 aarch64-apple-macosx +neon/AArch64
HEAD: fb44696d  porcelain: 0
```

**S02-C3** — `run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts`

| run | shell | SUMMARY | FILES | vt | guard | VERDICT |
|---|---|---|---|---|---|---|
| 1 | .sh /bin/bash | `Tests  28 passed (28)` | `Test Files  3 passed (3)` | 0 | 0 | 0 |
| 2 | .sh /bin/bash | `Tests  28 passed (28)` | `Test Files  3 passed (3)` | 0 | 0 | 0 |
| 3 | .sh /bin/bash | `Tests  28 passed (28)` | `Test Files  3 passed (3)` | 0 | 0 | 0 |
| 1 | inline | `Tests  28 passed (28)` | `Test Files  3 passed (3)` | 0 | 0 | 0 |
| 2 | inline | `Tests  28 passed (28)` | `Test Files  3 passed (3)` | 0 | 0 | 0 |
| 3 | inline | `Tests  28 passed (28)` | `Test Files  3 passed (3)` | 0 | 0 | 0 |

**WORST RUN: VERDICT=0 (GREEN), `Tests 28 passed (28)` / `Test Files 3 passed (3)`.** `FAIL` line count 0 on every run. Both shells agree line for line.

**S02-C4** — `run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts`

| run | shell | SUMMARY | FILES | vt | guard | VERDICT |
|---|---|---|---|---|---|---|
| 1 | .sh /bin/bash | `Tests  32 passed (32)` | `Test Files  4 passed (4)` | 0 | 0 | 0 |
| 2 | .sh /bin/bash | `Tests  32 passed (32)` | `Test Files  4 passed (4)` | 0 | 0 | 0 |
| 3 | .sh /bin/bash | `Tests  32 passed (32)` | `Test Files  4 passed (4)` | 0 | 0 | 0 |
| 1 | inline | `Tests  32 passed (32)` | `Test Files  4 passed (4)` | 0 | 0 | 0 |
| 2 | inline | `Tests  32 passed (32)` | `Test Files  4 passed (4)` | 0 | 0 | 0 |
| 3 | inline | `Tests  32 passed (32)` | `Test Files  4 passed (4)` | 0 | 0 | 0 |

**WORST RUN: VERDICT=0 (GREEN), `Tests 32 passed (32)` / `Test Files 4 passed (4)`.** Zero variance across six runs. Author's C4 figures reproduce exactly. Author's C3 figure is `27`, not `28` — see **N2**; it is not a fabrication.

---

## 2. Findings

### N1 — the B1 settled-value guard is CORRECT, NECESSARY and INSUFFICIENT; C7 cannot rely on `onChange` to re-sync the mirror after a cancelled click

**Class (this is what binds):** *a React state mirror whose only writer is an event that React suppresses after a cancelled activation.* Both consent mirrors are members. Sweep, per member:

| member | `SignUpFlow.tsx` | affected? |
|---|---|---|
| `privacyAccepted` (guarded handler) | `:227-231` | **YES** — this is the input C7 will cancel clicks on |
| `adultAffirmed` (plain handler) | `:212` | latent only — nothing cancels clicks on row 1 (R04: it is a plain toggle), so unreachable by design |

**File:line.** `apps/ui/components/SignUpFlow.tsx:227-231`
```
onChange={(event) =>
  setPrivacyAccepted(
    event.currentTarget.checked && !event.nativeEvent.defaultPrevented
  )
}
```

**The guard IS there, and it IS right.** Measured against the shipped component (`code-rev-s02-c3c4-r1-probes.test.tsx` P10a; `…-tracker.test.tsx`): after a click whose default is prevented, the DOM box is `false` and the mirror is `false`. Removing the guard (mutant `m11_no_b1_guard`) flips P10a — the mirror records `true` while the box is visibly unticked, i.e. **`Create account` enables with the privacy box empty**, a consent-integrity defect. So the guard makes the failure mode fail CLOSED instead of OPEN. That is the right direction and the author wrote it unprompted.

**Concrete inputs → wrong outcome.** With any C7 row handler that calls `preventDefault()` (which R05 REQUIRES — "the handler calls `preventDefault()` on that path"):
1. user clicks the privacy row → modal opens, box stays unticked, mirror `false`. ✔ correct
2. user acknowledges / dismisses, then clicks the box for real → **DOM `checked = true`, mirror still `false`, `Create account` STAYS DISABLED.** ✘

**Evidence, verbatim** (`…-tracker.test.tsx`, React 19.2.8 + jsdom 30.0.1, deterministic):
```
--- GUARDED (shipped privacy handler) ---
onChange fired: currentTarget.checked=true defaultPrevented=true -> mirror=false
after cancelled click: DOM=false mirror=false
after genuine  click: DOM=true  mirror=false        <-- one onChange for TWO clicks
--- PLAIN (shipped adult handler) ---
onChange fired: currentTarget.checked=true defaultPrevented=true -> mirror=true
after cancelled click: DOM=false mirror=true
after genuine  click: DOM=true  mirror=true         <-- also one onChange for TWO clicks
--- CONTROL (nothing cancelled) ---
onChange fired: ... -> mirror=true      click 1: DOM=true  mirror=true
onChange fired: ... -> mirror=false     click 2: DOM=false mirror=false
```
Exactly ONE `onChange fired:` line for two clicks under BOTH handler shapes, versus two under the control. **The second click fires no `onChange` at all, and this is independent of the handler body** — so it is not a defect IN the guard, it is a defect the guard cannot reach.

**Mechanism (root-caused, not inferred).** jsdom's pre-click activation toggles `checked` to `true` before dispatch; React's `ChangeEventPlugin` sees its tracked value change, fires `onChange`, and **updates `inputValueTracking` to `"true"`**; jsdom then runs the canceled-activation steps and reverts `checked` to `false`. Tracker `"true"` vs DOM `false` — desynchronised. The next click drives the DOM `false → true`, React compares against the tracker, sees no change, and dispatches nothing. The same sequence exists in a real browser; this is React's mechanism, not a jsdom artefact.

**Materiality here: NONE.** At `fb44696d` no code anywhere calls `preventDefault()` on these rows, so the path is unreachable and every C3/C4 property holds. **This is why it is N and not B.**

**Remedy — BINDING (measured: `code-rev-s02-c3c4-r1-recovery.test.tsx`, 4/4 passed, deterministic).** Four hypotheses measured against the shipped component:

| # | recovery | `Create account` after the next genuine click |
|---|---|---|
| R0 | none | **disabled — the defect** |
| R1 | `input.checked = false` (plain assignment, through React's INSTANCE setter) | **enabled — works** |
| R2 | a synthesised `.click()` from the acknowledgement handler | disabled — does NOT work |
| R3 | `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"checked").set.call(node,false)` | disabled — does NOT work (it bypasses the instance setter React hooks) |

**What C7 must do, and what it must not.** (a) The acknowledgement path sets the mirror **explicitly, in the same handler that sets `input.checked`** — never by synthesising a click and never by waiting for `onChange`. (b) Any handler that cancels a click on `privacy-accepted` re-syncs with the R1 assignment in that same handler. (c) C7's mirror arms on `S02-S49/S50/S51/S54/S55/S56/S71` must include **a case that cancels a click and THEN ticks the box for real, asserting the button ENABLES** — no arm in the PLAN as written does this, and it is the arm that catches R0.

**Ticket:** route to the C7 seat's packet as a named, pre-measured constraint (it is already half-named in `PLAN.md:1475`'s mutant list: "the acknowledgement setting the DOM but not the R17 mirror, so `Create account` never enables" — this finding shows that is not a hypothetical mutant, it is the default behaviour). **Nothing for CODE-S02-C3C4 to change.**

---

### N2 — the C3 three-run table's `Tests 27 passed (27)` does not reproduce at the delivered HEAD

**Class:** *a per-cluster measurement stated without the commit it was taken at, in a handoff where a LATER cluster edits a file the EARLIER cluster's command runs.* Sweep: C3's command runs `auth-flow-integration.test.tsx`, which C4 edits → affected. C4's command is measured at the final HEAD → not affected. One member, one instance.

**File:line.** Ticket `t_126a42a2`, handoff §3, the S02-C3 table (six rows, all `Tests  27 passed (27)`).

**Concrete inputs → wrong outcome.** A reviewer, a CI job or a rework seat runs the C3 command at the delivered HEAD `fb44696d` and reads `Tests 28 passed (28)` against a handoff that says 27 six times. That is a fabrication signature, and it costs whoever hits it the time to disprove it.

**Evidence — both measured by me, same worktree, same command:**
```
at 0928c38c (C3's own commit) : Test Files  3 passed (3) / Tests  27 passed (27)
at fb44696d (delivered HEAD)  : Test Files  3 passed (3) / Tests  28 passed (28)
```
**Not a fabrication.** The author states the derivation in the same section (`27 = 8 + 17 + 2`) and states `18` for the same file under C4, so the arithmetic is disclosed and traceable. The defect is presentational.

**Remedy — ADVISORY.** The three-run table gains a `commit` column; where a later cluster in the same handoff edits a file an earlier cluster's command runs, the earlier command's figure at the FINAL head is stated beside it. **No code change. No re-run required** — I have already measured both numbers and they are in this verdict.

---

### N3 — `type="button"` on `.consentPolicyLink` is load-bearing, chosen by the seat, and pinned by NOTHING in any cluster

**Class:** *a load-bearing attribute the seat chose (not transcribed from SPEC/PLAN), cited in the handoff to a step that does not assert it.* Sweep over the four constants the author discloses as self-chosen in handoff §8:

| self-chosen constant | pinned by a test? | affected? |
|---|---|---|
| `.consentBox` | no — author declares it (N1 of their §7.1) | no, C8 owns the selector and the author flagged it |
| `.consentText` | yes — `consent-signup-group.test.tsx` selects it | no |
| `.consentPolicyLink` | yes — same file selects it | no |
| **`type="button"`** | **no test anywhere** | **YES** |
| `id="signup-privacy-consent-text"` | resolved dynamically, deliberately unpinned | no — correct |

**File:line.** `apps/ui/components/SignUpFlow.tsx:234`
`<button type="button" className="consentPolicyLink">Privacy Policy</button>`

**Concrete inputs → wrong outcome.** An untyped `<button>` inside a `<form>` is `type="submit"` per HTML. A later seat (C7 wires this control; C8 restyles around it) deletes or reorders the attribute → after C7, with both boxes ticked, **a click on `Privacy Policy` submits the registration form in addition to opening the modal: the account is created by a click on a policy link.** That is a consent-integrity outcome, not a cosmetic one.

**Evidence.**
- Mutant `m09_no_type_button` (drop `type="button"`): **S02-C3 VERDICT=0 `Tests 28 passed (28)`, S02-C4 VERDICT=0 `Tests 32 passed (32)`** — survives both cluster commands untouched.
- My own probe catches it: `code-rev-s02-c3c4-r1-probes.test.tsx` P8 → `an untyped <button> in a form defaults to submit: expected 'submit' to be 'button'`.
- **The handoff's citation is wrong.** §8 says «`type="button"` so it cannot submit the form (S02-S57)». `PLAN.md:1049-1056` (S02-S57) pins *the modal being rendered outside the `<form>`* and its property is about controls **inside the modal** — a different control on a different surface. Grep for anything pinning this control's type: `PLAN.md:1008` (S02-S51) names `<button type="button">` only inside a prose selector description, and its asserted property is dialog-present / box-false / button-disabled. **Nothing asserts the attribute.**
- **Honest limit:** the *behaviour* is NOT demonstrable in this harness. `code-rev-s02-c3c4-r1-typebutton.test.tsx` reports `register called times = 0` under BOTH the intact and the mutated component, because jsdom does not implement form submission from a button activation. The hazard is the HTML standard's, not something I measured. I am not claiming a measured behavioural failure.

**Remedy — BINDING (measured: `m09` survives both cluster commands; P8 flips it).** Add ONE assertion to `tests/render/consent-signup-group.test.tsx`'s S02-S18 case (which already reaches the control):
`expect(control!.getAttribute("type")).toBe("button");`
Assert the **attribute**, never the submit behaviour — jsdom cannot see the behaviour, so a behavioural arm would be an unsatisfiable guard in the sense of COMMON §10.16. **Whether now or in C7 is the orchestrator's routing call; that it is fixed is not optional.** Separately, handoff §8's S02-S57 citation should be corrected in the record.

---

### P1 — packet finding (against the orchestrator's packet, not the author)

`CODE-REV-S02-C3C4-R1.md` was **accurate on every constant I checked**: base `91877847`, HEAD `fb44696d`, both commit shas, the review package at 578 lines, the dispatch packet **byte-identical to its `.at-dispatch` snapshot** (COMMON §10.32 working as designed), and the `allowed` list covering every deliverable it demands. Zero defects of the kind §1 of `heartbeat-reviewer` hunts.

**The one gap.** The packet orders «work ONLY in your detached worktree … (run `pnpm run generate:contract` first)» while its reading list is absolute paths into the MAIN tree. The worktree at `fb44696d` contains **no `docs/missions/consent-ui/` at all** — the mission docs are untracked/main-tree-only — so a seat's first relative `ls` there returns `No such file or directory` and reads as "wrong worktree". **Remedy — ADVISORY:** one sentence in COMMON §8 or the review packet template — "mission docs live only in the main tree: read them by absolute path, run every command in the lane". Costs a line; saves every review seat the same beat of doubt.

---

## 3. What I verified, and HOW

**Probe-not-read: every claim below is from a fixture I wrote from the SPEC's properties, or a command I ran.** I did not read the other lens's verdict (`reviews/CODE-REV-S02-C1C2-r1.md`) — blindness held.

### 3.1 My own jsdom probe kit — `code-rev-s02-c3c4-r1-probes.test.tsx`, 15 cases
Built from `SPEC.md` R01/R02/R03/R04/R17/R18/R19 and the design extract, not from the author's tests. Copy constants transcribed by me from `docs/missions/consent-ui/design/turn-8a-checkbox-group.html:4,8`.

```
✓ P1a  an assigned .checked survives a React re-render on BOTH inputs
✓ P1b  neither input carries a checked attribute in the DOM
✓ P2a  .click() on both boxes ENABLES the button (the gate opens at all)
✓ P2b  a mirror that DISAGREES with the DOM cannot let register through (FormData is truth)
✓ P2c  mirrors false but DOM true still registers (the existing suite's idiom)
✓ P3   register is called only when BOTH FormData reads are 'on'   [4 combinations]
✓ P4   register receives exactly four positional arguments
✓ P5   both inputs are real, natively focusable checkboxes with no role override
✓ P6   each input's accessible name is exactly its design sentence
✓ P6b  the privacy idref names a real element, and that row is not a <label>
✓ P7   the two rows' text nodes are exactly the design sentences, with no glyph character
✓ P8   the Privacy Policy control is type=button; clicking it neither submits nor toggles
✓ P9   one <form>, one .consentGroup, two rows, adult first
✓ P10a a preventDefault'd click leaves BOTH the DOM box and the mirror false
× P10b after a cancelled click, a LATER uncancelled click still moves the mirror   -> N1
      Tests  1 failed | 14 passed (15)
```

Against the charges in §4 of my packet, one by one:

- **Uncontrolled inputs** — P1a/P1b pass; the mutant `m01_controlled` (add `checked={…}` to both) is caught by **S02-S30 ALONE**, 1 failed / 32, cases 1/2/3 unmoved. That reproduces REQ-01's measured matrix to the case.
- **The two mirrors compute ONLY `disabled`** — **P2b is the discriminating probe.** Drive the mirrors true via `.click()`, then set `privacy-accepted.checked = false` behind React's back: the button still reads enabled (stale mirror) and **`register` is still not called**. The mirrors reach nothing but `disabled`.
- **`FormData` truth at submit** — P2c (mirrors false, DOM true → registers) and P3 (all four combinations) and P4 (four positional args, `["person@example.test","correct horse battery staple","recovery@example.test",true]`).
- **The R18 refusal never reaching `client.register`** — P3, and mutant `m08_no_refusal` is caught (1 failed / 32, by the added case alone).
- **Native focusability, BOTH inputs** — P5. `nodeName=INPUT`, `type=checkbox`, no `tabindex` attribute, `tabIndex === 0`, no `role`, `required === true`, `.focus()` lands on the input itself. **The author's S02-S70 case checks `adult-affirmed` only; I checked both. `privacy-accepted` passes.**
- **The accessible name** — P6/P6b. jsdom implements no accname algorithm, so I wrote the two HTML-AAM branches by hand (aria-labelledby → concatenate referenced subtrees; else the label ancestor). `adult-affirmed` → `I am 18 or over.` `privacy-accepted` → `I agree to the Privacy Policy, including that my debates may be published publicly.` Both **exactly the design sentences**. The privacy row is confirmed NOT a `<label>`, which is why `aria-labelledby` is the correct mechanism.
- **Cases 4/5 are C7's** — confirmed absent: `consent-signup-gate.test.tsx` holds exactly four `it(...)`, all expecting `disabled === true`, and its header comment routes 4/5 to `consent-signup-modal.test.tsx`. **The privacy box toggles natively in this cluster** — P2a ticks it with `.click()` and it sticks.

### 3.2 Mutant campaign — 11 mutants, both cluster commands each, hard revert between
`code-rev-s02-c3c4-r1-mutants.sh` / `.out`. `git checkout HEAD -- <src>` after each; `porcelain(SRC)=0` printed after every revert.

| mutant | S02-C3 | S02-C4 | caught? |
|---|---|---|---|
| m01 controlled inputs | GREEN | **RED 1/32** (S02-S30 alone) | YES |
| m02 `disabled={true}` hard-coded | GREEN | GREEN | **NO — pre-declared, see below** |
| m03 delete the `.consentGroup` wrapper | **RED 6/28** | **RED 6/32** | YES |
| m04 drop `required` from privacy | **RED 1/28** | **RED 1/32** | YES |
| m05 remove `aria-labelledby` | **RED 1/28** | **RED 1/32** | YES |
| m06 restore the old 18+ wording | **RED 2/28** | **RED 2/32** | YES |
| m07 handler reads the mirror, not FormData | **RED 4/28** | **RED 4/32** | YES |
| m08 remove the R18 refusal | **RED 1/28** | **RED 1/32** | YES |
| m09 drop `type="button"` | GREEN | GREEN | **NO → N3** |
| m10 rename `adult-affirmed` | **RED 12/28** | **RED 15/32** | YES |
| m11 remove the B1 settled-value guard | GREEN | GREEN | **NO → N1** |

**m07 reproduces REQ-REV-01 B2 exactly:** the three pre-existing submit cases go red (`renders the non-enumerating registration state…`, `keeps registration failures generic…`, `keeps resend failures generic…`) — the FormData-vs-mirror truth question is pinned by the existing suite, as the SPEC predicted.

**m02 is DECLARED, and the declaration is accurate.** `PLAN.md:1472` states in its own words: «**What this command can NO LONGER detect, stated rather than implied:** a `disabled` hard-coded `true` — every case left in this cluster expects `disabled === true`, so the cluster has no positive control». I planted it and confirmed it survives. Detection lives in C7 (`S02-S28` in its new home, independently `S02-S53`). **Not a finding against this seat** — and my P2a is the positive control the cluster lacks, which is why I ran it.

### 3.3 The author's F1 charge — fully discharged, in its strongest form
**Not "are the selectors scoped?" but "is any assertion green at base?".** I reverted `SignUpFlow.tsx` to `91877847` and ran both new files:

```
× ... × 12 lines ...
 Test Files  2 failed (2)
      Tests  12 failed (12)
```
**12 of 12 RED at base. Zero green-at-base assertions in either new file.** The `groupField()` / `.consentGroup .consentRow` scoping fix holds, and the "delete the group" mutant (m03) additionally fails 6 of 8 group cases. The author's own sweep of the class is correct.

### 3.4 The author's F2 charge — the `✓` glyph
**The component's text nodes are exactly the design's strings, with no glyph character.** P7 asserts row textContent byte-equality AND that neither `✓` (U+2713) nor `✗` (U+2717) appears anywhere in `.consentGroup`'s text. Row 1 = `I am 18 or over.`, row 2 = `I agree to the Privacy Policy, including that my debates may be published publicly.` The design draws the glyph in a separate square `<span>` (`turn-8a-checkbox-group.html:3,7`); the component styles the input itself as the square (`className="consentBox"`), which is what `PLAN.md:1223-1225` (S02-S62) already specifies — `appearance: none` on the input plus a `content: "✓"` rule. **The author's markup is the shape ARCH fixed, not an improvisation.**

### 3.5 The author's F4 charge — measured and DATED (the author left it UNVERIFIED)
Same worktree, `SignUpFlow.tsx` and `auth-flow-integration.test.tsx` both checked out at `91877847`:
```
BASE 91877847 : stderr | ... > moves password success into a dedicated authenticator screen with a recovery alternative
                A component is changing an uncontrolled input to be controlled. ...
                Test Files 1 passed (1) / Tests  17 passed (17)
HEAD fb44696d : (byte-identical warning, same test)
                Test Files 1 passed (1) / Tests  18 passed (18)
```
**PRE-EXISTING at base `91877847`, dated 2026-09-07 by me. Exactly one occurrence at base and exactly one at HEAD** — the diff neither introduced it nor added a second. It is the LoginFlow case. The author's mechanical argument was right; it is now a measured claim.

### 3.6 The S02-S22 insertion charge
```
base 91877847 : field("adult-affirmed").checked = true;  at :324 :448 :466   count 3
HEAD fb44696d : field("adult-affirmed").checked = true;  at :324 :449 :468 :494   count 4
                field("privacy-accepted").checked = true; at :325 :450 :469 :515  count 4
```
**Three insertions, each on the line immediately after a base occurrence (324→325, 449→450, 468→469).** The 4th pair (`:494` adult / `:515` privacy) belongs to the ONE added R18 case, whose two arms deliberately leave the other box unticked. **Count arms 3/3, and the one added case and nothing else.**

### 3.7 Standing gates — reported, never folded into the guard (COMMON §10.20)

| gate | measured in my worktree | delta vs `BASELINE.md` |
|---|---|---|
| **G1** `pnpm typecheck` | exit 1 · ran-arm `grep -cE '^\$ tsc --noEmit$'` = **1** · **8** diagnostics, all in `tests/unit/s14-ui.test.ts` · **outside the pin: 0** | **0** — reported as "no diagnostic outside the pin", never "green" |
| **G1b** `cd apps/ui && npx tsc --noEmit -p tsconfig.json` (COMMON §10.30) | **exit 0** | the arm that actually sees the `.tsx` changes |
| **G2** `t9-mode-tokens` | exit 1 · `Tests 2 failed \| 6 passed (8)` · FAIL lines = **2**, exactly the two pinned NAMES · colour-literal hit list counted at **1**, the pinned `.drawerScrim` element at `globals.css:6096` | **0** |
| **G3** `v2ui-node-runner` | exit 0 · `Tests 2 passed (2)` | green, R21 guard intact |
| **R21 direct** | `grep -ciE 'localStorage\|sessionStorage\|terms\|privacy notice'` on `SignUpFlow.tsx` = **0** each | — |

### 3.8 File surface, `globals.css` discipline, R19
`git diff --name-only 91877847..fb44696d` = **exactly four files**, all inside the cluster's `allowed` list:
`apps/ui/components/SignUpFlow.tsx` · `tests/render/auth-flow-integration.test.tsx` · `tests/render/consent-signup-gate.test.tsx` · `tests/render/consent-signup-group.test.tsx`.
**`globals.css` untouched** (C8's, and no S02 block exists yet — correct). **`packages/**` untouched (R19)**; `client.register(...)` remains four positional arguments, confirmed by P4 (`register.mock.calls[0]` has length 4) and by mutant coverage. `grep -c 'authCheck'` = 0, `grep -c 'consentRow'` = 2 — both count arms as `S02-S17` specifies.

### 3.9 The author's `SKILLS LOADED` vs the worker floor
`superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging` — **the full worker floor**. `superpowers:receiving-code-review` is declared in COMMON §10.9's exact honest form («NOT loaded this session — not needed because this is round 0, not a rework»). **No shortfall, no fabrication finding.** Self-report present at `.hermes/reports/consent-ui/agent-reports/CODE-S02-C3C4.md` (105 lines) and it clears the bar: it names causes (the zsh word-splitting BROKEN-run trap, §7.3), prices them, names dead ends, and declares what C4 cannot prove (MC5, MC6) instead of hiding it.

---

## 4. What I did NOT verify

1. **Anything a real browser does.** The `✓` pseudo-element actually rendering on an `<input>` (a replaced element — generated content on it is historically unreliable, and C8 has no `.tsx` in its surface so a sibling span is not available to it), the 17×17 geometry, focus rings, `Space` toggling the box (jsdom 30.0.1 produces `clickEventsSeen=0` for Space on a focused checkbox — the author and the PLAN both say so), and both modes. **All of it is V's acceptance, steps 1-2 and 14.**
2. **The N3 hazard's behaviour.** jsdom does not submit a form from a button activation, so I could not demonstrate the submit; I verified the attribute and said so.
3. **C7, C8, C5, C6 and S01.** I reviewed C3/C4's commits only. N1's remedy is a prediction about C7 grounded in measurement, not a review of C7.
4. **Whether C8's selectors will match `.consentBox` / `.consentText` / `.consentPolicyLink`.** C8 is unwritten; the author flagged all three as self-chosen, which is the right handling.
5. **Screen-reader behaviour.** I computed the accessible name by hand from HTML-AAM's two branches; no AT and no accname library was involved. Whether announcing an interactive `Privacy Policy` inside the name is *useful* is `S02-S20`'s own declared V-only question.
6. **`authRoutes.source-test.mjs`'s internals** beyond its green result through `v2ui-node-runner`.
7. **The other lenses' verdicts** — deliberately unread.

---

## 5. Predictions (falsifiable evidence that blindness held)

I expect the other lens on this cluster set to have confirmed the same green cluster tables, the same clean file surface and the same standing-gate deltas — those are mechanical and hard to get wrong.

**What I expect it to have MISSED: N1.** It requires distrusting a line the packet frames as already-settled ("verify it is there"), then building a fixture that does something no cluster command does — attaching a `preventDefault` listener that does not yet exist in the codebase and clicking TWICE. A lens that verifies presence, confirms the guard's stated purpose, and reports "present and correct" will call that charge discharged and stop. The tell in another verdict would be the words "the guard is present" with no `preventDefault` fixture and no second click; if it does have one, I predict it stopped at the first click (which passes) and never ran the second.

**I also expect N3 to have been missed**, because the author's handoff cites `S02-S57` for it and a reviewer who follows the citation into `PLAN.md:1049` finds a step that reads as if it covers exactly this — it does not; it covers controls inside the modal. This one is caught only by planting the mutant, not by reading.

**Where I would check the other lens hardest:** any claim that the `disabled={true}` mutant is a NEW blocking finding (it is declared at `PLAN.md:1472` and I confirmed the declaration is accurate), and any claim that `Tests 27 passed (27)` is a fabrication (it reproduces at `0928c38c`; it is a missing commit label, N2).

**Round 1 of max 3.** PASS — no rework round opens, so no V DECISIONS PACKET row is required from this verdict. N1 and N3 are routed as tickets; N1 belongs in the C7 packet, N3 in whichever cluster the orchestrator elects.

`comments read through: t_5aa0df1c 1 (my own CLAIM) · t_126a42a2 4 (the author's CLAIM, two HEARTBEATs and READY FOR PEER REVIEW; no other author has commented on either ticket)`
