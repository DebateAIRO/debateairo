# CODE-REV-S01-C5 — blind peer review, round 1

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer,
superpowers:verification-before-completion, superpowers:systematic-debugging`
(`superpowers:receiving-code-review` — **not loaded this session, not needed**: no finding of mine
has been contested yet. If the author contests one, it is loaded before I answer.)

**Verdict: PASS** — with three non-blocking findings (**N1**, **N2**, **N3**) and five packet
notes (**P1**–**P5**). No blocking finding. Every N-finding carries a ticket line in §6
for the orchestrator to route the same day (`heartbeat-reviewer` §3).

**Seat** CODE-REV-S01-C5 · Opus 5, fresh blind session · ticket `t_f9553998` · reviewing
`t_480db823` (CODE-S01-C5) · commits `fd8250c0` (C3C4 design-fidelity follow-up, ticket
`t_9ad87d52`) and `d5e217f7` (cluster C5) · base `9dd8042e` · round 1 of max 3.
**Worktree** `.worktrees/rev-s01-c5/dialectical-engine`, detached `d5e217f7`,
`git status --porcelain` = **0** at CLAIM and **0** at handoff; `pnpm run generate:contract`
exit 0. `comments read through: 4` on `t_480db823` (CLAIM, two HEARTBEATs, READY FOR PEER REVIEW,
the orchestrator's consumption note) · `1` on `t_f9553998`.

---

## 1. Packet review (`heartbeat-reviewer` §1) — the dispatching packet, checked before the diff

`CODE-S01-C5.md` is **byte-identical to its `at-dispatch` snapshot** (`diff` → no output), so the
seat read the words below.

| Packet claim | Measured | Verdict |
|---|---|---|
| base `9dd8042e` is "C3+C4 head" | `git rev-parse --short fd8250c0^` → `9dd8042e`; `git log` shows `9dd8042e feat(consent-ui S01-C4): cookie preferences card` | **correct** |
| `layout.tsx:45-48` = `appShell`/`TopBar`/`{children}` | at `9dd8042e`: `:45 <div className="appShell">` `:46 <TopBar />` `:47 {children}` `:48 </div>` | **correct** |
| `settings/page.tsx:37-39` (AuthGate), `:52` (`AccountSettingsScreen`) | at `9dd8042e` the range `:37-39` is `export default function SettingsPage() {` / `return <AuthGate>{() => <AccountSettingsScreen />}</AuthGate>;` / `}`, and `:52` is `function AccountSettingsScreen() {`. **The packet's RANGE is correct**; the gate line itself is `:38` — see P5 | **correct** |
| `AuthGate.tsx:21-23` holds the redirect | `:22 if (!checking && !authenticated) window.location.replace("/login");` | **correct** |
| follow-up source "`reviews/CODE-REV-S01-C3C4-r1.md` §3 … lines 318–470" | N1 begins at `:318`; N7 ends at `:469`; **`:470` is the first line of N8**, which is not on the list | **P3** (below) |
| `allowed` list vs the deliverables demanded | five lane files + self-report + TOOLING-TRAPS + ticket comments; the follow-up commit's six files are granted explicitly in the "C3C4 FOLLOW-UP" section. **Every deliverable the packet demands is inside `allowed`.** | **no defect** |
| the packet's paths resolve from the seat's cwd | all absolute | **correct** |

**Two packet defects are in MY OWN packet** (`CODE-REV-S01-C5-R1.md`) — filed against the
orchestrator, not the author (`heartbeat-reviewer` §1): **P1** and **P2** in §5.

**One packet-wording defect the author already filed as D2, and I confirm as correct.** The
follow-up section's N3 headline says the token goes "in BOTH token blocks" and its own parenthesis
then says "`:root` only if that is how the C1 mode-independent six are declared". The author
followed the parenthesis. **I measured that the parenthesis is not a preference but a
constraint** — see §3, RM6.

## 2. What I verified, and how — verbatim

### 2.1 The four cluster commands, ×3 from a `.sh` under `/bin/bash` AND ×3 inline (COMMON §10.16)

Both shells recorded: script arm `/bin/bash` + `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`,
locale `C`; inline arm `/bin/zsh` + `ugrep 7.8.4 aarch64-apple-macosx`. **24 runs, 0
disagreements.** Every run at commit `d5e217f7` (§10.34's commit column).

| cmd | commit | run 1 | run 2 | run 3 | inline ×3 | WORST |
|---|---|---|---|---|---|---|
| CMD-C1 | `d5e217f7` | 0 | 0 | 0 | 0 / 0 / 0 | **0** |
| CMD-C3 | `d5e217f7` | 0 | 0 | 0 | 0 / 0 / 0 | **0** |
| CMD-C4 | `d5e217f7` | 0 | 0 | 0 | 0 / 0 / 0 | **0** |
| CMD-C5 | `d5e217f7` | 0 | 0 | 0 | 0 / 0 / 0 | **0** |

Worst line per command, verbatim (identical on every one of the six runs):

```
S01-C1 verdict=0   summary:      Tests  2 failed | 7 passed (9)   hit-list: 1 (pinned .drawerScrim line: 1)   tsc ran: 1 exit 1, diagnostics outside the pin: 0
S01-C3 verdict=0   summary:      Tests  7 passed (7)  files: Test Files  1 passed (1)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
S01-C4 verdict=0   summary:      Tests  11 passed (11)  files: Test Files  1 passed (1)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
S01-C5 verdict=0   summary:      Tests  4 failed | 38 passed (42)  files: Test Files  1 failed | 2 passed (3)   failures: 4 (unpinned: 0)  guarded-green: 2  consent-mount lines: 11 (failing: 0)  hit-list: 1   tsc ran: 1 exit 1, outside the pin: 0
```

**The author's figures reproduce byte for byte.** CMD-C5's monotone arm: `n_newfail = 0`, and the
four failures are exactly the four pinned names (BASELINE addendum 2026-09-06 20:15,
ui-overhaul's, never repaired here):

```
 FAIL  tests/render/t3-library.test.tsx > lists > renders recased native selectors and a live count for the four Your debates rows
 FAIL  tests/render/t3-library.test.tsx > lists > renders a live count for the three Public debates rows
 FAIL  tests/render/t3-library.test.tsx > lists > renders every library row as a shell/core bezel
 FAIL  tests/render/t3-library.test.tsx > lists > renders the public search-indexing disclosure once under the list and never on Yours
```

`n_keep = 2`, `n_keepfail = 0` — both must-stay-green `t3-library` tests ran and passed. The new
t9 `<n>` is **9**, unchanged, as the author states.

### 2.2 Standing gates, reported as deltas (COMMON §10.20)

- `pnpm typecheck` → exit 1, `uniq -c` by file: `8 tests/unit/s14-ui.test.ts`. **Diagnostics
  outside the pin: 0.** Delta against BASELINE.md = 0. Not "green" — the delta.
- `pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts` → `Tests 2 failed | 7 passed (9)`; the
  colour-literal hit list is exactly the one pinned `.drawerScrim` line (`n_hits = 1`,
  `n_lit = 1`).
- `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx` → `Tests 17 passed (17)`.
- **apps/ui project typecheck (COMMON §10.30) at BOTH commits.** At `d5e217f7`:
  `APPSUI_TSC_EXIT=0`. At `fd8250c0`: I reconstructed the tree in the working directory
  (`git show fd8250c0:<path>` for the two modified files, `mv` for the two added components),
  proved `git diff --name-only fd8250c0 -- apps/ui` **empty**, then measured
  `APPSUI_TSC_EXIT_AT_fd8250c0=0`. **HEAD never moved; no git write was made.**
- The four `settings/page.tsx` consumers the author added to BASELINE (D4), re-measured by me:
  `s5-session-controls` `Tests 2 passed (2)` · `s9-legacy-claim-controls` `Tests 3 passed (3)` ·
  `s10-erasure-ui` `Tests 3 passed (3)` · `evaluator-dev-menu-ui` `Tests 2 passed (2)`.

### 2.3 Boundaries — every file, and every line of `globals.css`

Eleven files, split across the two allowed lists exactly as granted:

```
fd8250c0 (follow-up)   globals.css 44 | CookiePreferencesCard.tsx 8 | lib/consent.ts 26
                       consent-bar.test.tsx 47 | consent-card.test.tsx 58 | t9-mode-tokens.test.ts 1
d5e217f7 (C5)          layout.tsx 2 | settings/page.tsx 2 | ConsentSettingsPanel.tsx 58
                       CookieConsent.tsx 157 | consent-mount.test.tsx 482
```

**No file outside either list.** `AuthGate.tsx`: `git diff --stat 9dd8042e..d5e217f7 --
apps/ui/components/AuthGate.tsx` → **0 lines** (S01-S35 confirmed). Registration shape: `register(`
/ `adult_affirmed` in the range diff → **0**. COMMON §3's no-touch surface (`apps/api/**`,
`packages/**`, `migrations/**`, `tools/**`, `apps/runner/**`, `apps/scheduler/**`,
`tests/integration/**`, `tests/unit/registration*`) → **0** files.

**All 44 changed `globals.css` lines accounted for**, by new-file line number and zone
(`code-rev-s01-c5-r1-css-block-discipline.out`): `:root` token block **4 added**
(`--shadow-knob` + its three-line derivation comment); the delimited S01 block `[7244,7615]`
**38 added, 2 removed** (`border: 1px solid var(--ink)` → `border: none`;
`box-shadow: var(--shadow-thumb)` → `var(--shadow-knob)`). **OUTSIDE both permitted zones:
NONE.** `grep -c '=== consent-ui S01 ==='` → **1** (no second block).

### 2.4 The follow-up, value by value against the design extract

`turn-10-cookie-consent.html`, read directly:

| line | design | shipped | |
|---|---|---|---|
| `:39` | `padding:10px 19px`, **no `border` property**, `transition:transform .5s cubic-bezier(.34,1.56,.64,1)`, `style-hover="transform:scale(1.04);"` | `.consentPrimary { padding: 10px 19px; border: none }` + `.consentBar .consentPrimary { transition: transform .5s cubic-bezier(.34,1.56,.64,1) }` + `:hover { transform: scale(1.04) }` | **N1/N2/N4 ✓** |
| `:130` | `padding:10px 18px`, no border, **no transition** | `.consentCardFooter .consentPrimary { padding: 10px 18px }`, motion scoped to `.consentBar` only | **N1 ✓, and the scoping is right** |
| `:121` | `box-shadow:0 1px 3px rgba(0,0,0,.3)` | `--shadow-knob: 0 1px 3px rgba(0,0,0,.3)`, `.consentKnob { box-shadow: var(--shadow-knob) }` | **N3 ✓** |

N4's reduced-motion counterpart is in the same block and names **both** selectors
(`transition: none`, `transform: none`). N6's JSDoc sentence is at the prop. N7's pin is §3 RM8.

### 2.5 Guards, under `/bin/bash` with BSD `grep` in the C locale, as fixed strings

Over `apps/ui/components/consent/` (all four files) — **every count 0**: `addEventListener`,
`Escape`, `.focus()`, `document.`, `<script`, `createPortal`, `localStorage`, `sessionStorage`,
`gtag`, `analytics.`. Colour literals in the consent components and in `lib/consent.ts`: **0**.
Colour literals inside the delimited S01 CSS block (excluding `cubic-bezier`): **0**.

**On the author's F1** — "a JSDoc mention of `.focus()` counts as a hit". Confirmed as a real
guard class and worth stating once: **S01-S45's guard is grep-shaped, so a comment that SPELLS a
banned token is a hit even when its whole meaning is that the token is absent.** The author's
reworded JSDoc ("This component never moves focus itself") carries the identical meaning and
scores 0. Every future consent-surface comment is bound by the same rule, and the cheap remedy is
in my TOOLING-TRAPS append: literal guards use `grep -F`, and prose about a banned API names the
API in words, never in call syntax.

### 2.6 My own probes — built from the SPEC, not from the author's tests

Three files, 41 cases, run with my own `--config` from `.review-scratch/` (deleted before this
verdict; promoted to `probes/`). **41 passed (41).**

- `rev-state-machine.test.tsx` (**32 passed**) — R04/R05/R06/R14/R17/R21 driven with a
  *different* seam from the author's: my `vi.mock` pass-through renders the REAL card and appends
  one extra `<button>` wired to `onDismiss`, so the dismissal travels through **a real DOM click
  and React's own event path**, not through a recorded props object. Carries **10 invalid-shape
  seeds** (`v: 2` · `essential: false` · a sixth key · a missing key · a non-boolean toggle ·
  a non-ISO instant · a local-time offset · malformed JSON · a bare string · an array), each
  asserted at the mount AND at the Settings-entry dismissal.
- `rev-copy-modes-exits.test.tsx` (**7 passed**) — SPEC §Copy rendered and DECODED (`—`, `’`,
  `·`, `→` as characters; `not.toMatch(/\\u[0-9A-Fa-f]{4}/)` over the whole body); **both modes**:
  the bar, the card and the Settings panel are **byte-identical** under
  `data-mode="terracotta"` and `data-mode="chamber"` (modulo React's `useId` counter, normalised —
  see §5 of my self-report), and no inline style carries a colour; plus the exit-route enumeration
  behind **N2**.
- `rev-a11y.test.tsx` (**2 passed**) — probed, not read: the bar is `role="region"`
  `aria-label="Cookie consent"` (never a dialog); the card is `role="dialog" aria-modal="true"`
  and **every `aria-labelledby` on the surface resolves to a present id**; the three switches
  carry `aria-label` `Essential` / `Model quality telemetry` / `Product analytics` and only
  `Essential` is `aria-disabled="true"`; `renderToStaticMarkup(<CookieConsent />)` = `""` and the
  Settings panel's server markup leaks no consent state.

**The Settings panel uses the house vocabulary, not a new one** (COMMON §9's rule): its
`<section aria-labelledby>` → `.setSectionHead` → `.setSectionTitle` → `.setSectionHint` →
`.setList` → `.setBtn` shape is `SessionControls.tsx:165-170`'s, byte for byte, and all five
classes are declared in `globals.css`. Copy is byte-exact against **V-13**'s default (a).

### 2.7 The r1 reviewer's N6 probe, run verbatim

`probes/code-rev-s01-c3c4-r1-stale-initial.test.tsx`, copied byte-identically
(md5 `953ce84b27f47f69ac27a3dbbdd224ee`, matching the promoted file and the author's stated hash),
run against this lane's shipped card:

```
 × … > documents what the card does when `initial` changes without a remount
   → second open, same mounted instance: expected [ 'true', 'true', 'false' ] to deeply equal [ 'true', 'false', 'true' ]
 ✓ … > a remount DOES pick the new initial up (the shape C5 must use)
      Tests  1 failed | 1 passed (2)
```

**The author's reading is correct.** Case 1 documents the card's stale-`initial` behaviour and is
deliberately red; case 2 is the shape `CookieConsent` uses and it PASSES. The probe therefore
cannot join `CMD-C5`'s file list, and the property belongs in the author's own suite — where it
is, and where RM4 (below) shows it bites.

## 3. Mutants — seven of mine, plus the author's M6 and M7 re-run

`code-rev-s01-c5-r1-mutants.py` (pristine copies via `shutil.copy2`, never `git checkout --`,
which stages; `git status --porcelain` printed after every restore and **empty** every time).

| # | mutant | my probe | author's `consent-mount` | other |
|---|---|---|---|---|
| **RM1** | **the entry-point discriminator the packet demands**, planted as a real implementation: a `sourceRef` set to `"settings"` by the subscription and to `"bar"` by `onChoose`, and `dismiss` returning `"silent"` when it reads `"settings"` — the v1-SPEC rule REQ-REV-01 B1 deleted | **RED** 12 failed \| 20 passed (32) — *"the ENTRY POINT must not be the discriminator: expected null not to be null"* | **RED** 2 failed \| 9 passed (11) — *"the bar returns HERE TOO"* | — |
| **RM2** | `dismiss` keys on the KEY'S PRESENCE, not the decision's validity | **RED** 10 failed \| 22 passed — *"R14 says \*valid\*, not \*present\*"* | **GREEN 11 passed (11)** | **`CMD-C5` verdict=0** |
| **RM3** | the MOUNT keys on presence, not validity | **RED** 20 failed \| 12 passed — *"an invalid stored value must re-ask"* | **GREEN 11 passed (11)** | **`CMD-C5` verdict=0** |
| **RM4** | = author's M6: `setInitial(togglesFor(readConsent()))` deleted (the N6 stale-initial defect) | **RED** 2 failed \| 30 passed | **RED** 2 failed \| 9 passed | — |
| **RM5** | = author's M7: the Settings button stops calling `requestPreferences` | **RED** 16 failed \| 16 passed | **RED** 5 failed \| 6 passed | — |
| **RM6** | `--shadow-knob` declared in the Chamber block **as well** (the packet headline's "BOTH token blocks") | — | — | **t9 RED** 3 failed \| 6 passed — *"Chamber inventory names: expected […110] to deeply equal […109]"* |
| **RM7** | the mount moved between `.appShell` and `<TopBar />` | — | **RED** 1 failed \| 10 passed | **t3-library RED 5 failed \| 10 passed (15)** — vs the pinned 4; `CMD-C5`'s `n_keepfail` arm fires |
| **RM8** | the `save-choices` overload LOOSENED to `toggles?`, and separately BOTH overloads deleted | — | — | `lib/consent.ts(218,3): error TS2578` / `(213,3): error TS2578`, **`APPSUI_TSC_EXIT=1`** both times; shipped control exit 0; **root `pnpm typecheck` sees neither** (0 outside the pin) |

**RM1 settles the B1 pin: it holds.** The realistic implementation of the defect — not just the
author's blunter `openerRef !== null` — is caught by the author's own suite.
**RM6 settles N3 and the author's D2: `:root` only is FORCED, not chosen.** `t9`'s set-equality
arm compares the Chamber block's declared names against `Object.keys(CHAMBER)`, and
`--shadow-knob` lives in `MODE_INDEPENDENT`; declaring it in both blocks fails the inventory test.
**The author's D2 ruling is ACCEPTED, measured.**
**RM8 settles N7: the pin works, and works better than claimed** — it fires on the *loosened*
overload as well as on deletion, so a partial regression is caught too.

**RM2 and RM3 are N1** — the one place where a defect in B1's own class survives every gate.

## 4. Findings

### N1 — the B1 pin discriminates *absent* from *valid*, but not *invalid* from *valid*; `CMD-C5` cannot see the difference

**Where:** `tests/render/consent-mount.test.tsx` (the whole file — no case seeds a stored value
that is present but invalid), against
`apps/ui/components/consent/CookieConsent.tsx:86-88` (the mount effect) and `:129-131` (`dismiss`).

**CLASS:** *a pin derived from a finding's NARRATIVE covers the reported instance; a pin derived
from the requirement's PREDICATE covers the class.* S01-R14 reads "the bar returns **iff no valid
`v: 1` decision is stored**". `readConsent()` answers *valid*;
`localStorage.getItem(CONSENT_KEY) !== null` answers *present*. The shipped machine calls
`readConsent()` in both places and is **correct**. The suite cannot tell the two apart, because
every case seeds `null` or a valid decision.

**Concrete inputs → wrong outcome (under the mutant, not under the shipped code).** A signed-in
visitor whose `debateai.consent` holds `{"v":2,…}` — a value this product cannot write but a
future version, a hand edit or an extension can, and the exact class V-19 generalised the
`essential !== true` ruling to. With `dismiss` keyed on presence: `/settings` → Privacy →
`Cookie preferences` → back out → **the bar never returns and no valid decision is stored.** That
is B1's own failure mode reached by a different route. With the mount keyed on presence, the same
value silences the bar from the first paint, and S01-R02's "a value whose `v` is not
`CONSENT_VERSION` is no decision: the caller re-asks" is unpinned at the machine level.

**Evidence (measured).**

```
              author consent-mount     my probe                 CMD-C5
shipped       11 passed (11)           32 passed (32)           verdict=0
RM2           11 passed (11)  GREEN    10 failed | 22 passed    verdict=0   ← byte-identical to control
RM3           11 passed (11)  GREEN    20 failed | 12 passed    verdict=0   ← byte-identical to control
```

`consent-storage.test.tsx` (C2) pins `readConsent`'s strictness, and it stays green under both
mutants — a codec test cannot see its caller. So **no suite in this repo catches RM2 or RM3.**

**Remedy — `BINDING (measured: RM2 and RM3 above; `code-rev-s01-c5-r1-rev-state-machine.test.tsx`
turns both RED with 10 and 20 failures respectively)`.** Add to
`tests/render/consent-mount.test.tsx` at least one case seeding a value that is present and
invalid, asserted at BOTH decision points — the mount and the Settings-entry dismissal. One seed
is enough to kill both mutants; my file uses ten because the predicate distinguishes ten, and the
class rule is per predicate, not per narrative. My probe is promoted and may be copied
byte-untouched (`COMMON` §10.35), or the property re-expressed in the author's own idiom.
**Non-blocking** because the shipped behaviour is correct and my 32-case probe proves it; the
finding is that nothing would keep it correct.

### N2 — the card is mounted app-wide with two dead footer props, and the only exits write a decision

**Where:** `apps/ui/components/consent/CookieConsent.tsx:145` — `onRequestPolicy={(): void => {}}`;
and `CookiePreferencesCard.tsx:143-145`, whose `Privacy notice` button calls it. Related:
`onDismiss` (`:144`) is passed to a card that wires no gesture to it.

**CLASS:** *a cluster that MOUNTS a surface makes that surface's unfinished affordances reachable,
even when the affordances belong to a later cluster.* C3 and C4 built the bar and the card; until
`d5e217f7` neither appeared anywhere in the running app. C5's `layout.tsx` mount is what puts them
in front of V.

**Concrete inputs → wrong outcome (today, in the dev stack).** Measured, not argued — the case
`C — MEASUREMENT: as mounted today the card offers no exit that is not a decision` enumerates
every control the mounted card renders and clicks each one:

- the six controls are `Essential` · `Model quality telemetry` · `Product analytics` ·
  `Privacy notice` · `Essential only` · `Save choices`;
- the three switches and `Privacy notice` **do not close the card and write nothing**;
- a click on `.consentScrim` **does not close it** (backdrop close is S02's helper, cluster C6);
- an `Escape` keydown **does not close it** (S01-S45 forbids a second listener; the one listener
  arrives with the C6 merge);
- therefore the only two exits are `Essential only` and `Save choices`, and **both write**.

So a visitor who opens the card to look at it is required to make a decision to get out, which
S01-R14's "closing the card without a decision … writes nothing" describes as reachable, and
`Privacy notice` is a rendered control that does nothing — the standing V honesty law's "no
'settings' links to nothing", now reachable on every route.

**This is not C5's to fix.** `S01-S38` ("Wire `Privacy notice` to `PrivacyPolicyModal` in
`mode="read"`") and the dismissal gestures are cluster **C6**'s, whose file surface is exactly "the
wiring lines only of `CookiePreferencesCard.tsx` / `CookieConsent.tsx`", and C6 follows the
`slice/consent-s02` merge. The author's own JSDoc says as much for `onDismiss`. Two things are
nevertheless owed:

**Remedy (a) — `ADVISORY`.** `onRequestPolicy={(): void => {}}` is the only decision in a
157-line file that carries no comment, while `onDismiss` beside it is documented at the card's
prop. One line at the call site (`:145`) naming `S01-S38` as its owner costs nothing and stops the next
reader from reading a no-op as an oversight.
**Remedy (b) — `BINDING (measured: the exit enumeration above)`, and it is the ORCHESTRATOR's, not
the author's.** V's acceptance steps for S01 that exercise a dismissal (Esc, backdrop) and the
`Privacy notice` link are **not runnable until C6 lands**, and the "UI element fully done" gate
(INSTRUCTIONS.md) requires every numbered acceptance step to be runnable before Grok 4.6 is fired.
The C6 packet must carry this measurement so the ordering is explicit rather than discovered at
acceptance time.

### N3 — the `receiving-code-review` floor has no trigger for "discharging another lens's findings outside rework"

**Where:** `heartbeat-protocol` §1, the worker row: "`receiving-code-review` (on rework)".

**CLASS:** *a floor whose trigger is a PROCESS STATE misses the situation the skill is actually
for.* The author's `SKILLS LOADED` is honest and, as the floor is written, complete: five loaded,
`systematic-debugging` and `receiving-code-review` each declared not loaded with a reason, in
§10.9's sanctioned form. The seat was on round **0** — no review of *its* work existed.

But commit `fd8250c0` exists solely to discharge **six numbered findings from another lens's
verdict** (N1/N2/N3/N4/N6/N7 of `CODE-REV-S01-C3C4-r1.md`), one of whose remedies the author
correctly **refuted with measurement** (D2 — see RM6, which confirms the author right). That is
precisely `receiving-code-review`'s subject: *"before implementing suggestions, especially if
feedback seems unclear or technically questionable — requires technical rigor and verification,
not performative agreement."* The author performed the discipline without the skill; the next seat
in the same position may not. **The gap is in the floor's wording, not in the author's compliance
— no finding against CODE-S01-C5.**

**Remedy — `ADVISORY` (a protocol edit is V's, via the orchestrator).** Change the worker row's
trigger from "on rework" to "on rework, **or when the packet hands the seat numbered findings from
any review verdict to discharge**". Two clauses, and it closes the class for every follow-up
commit this fleet will ever cut.

**On the author's `systematic-debugging` shortfall — ACCEPTED, no finding.** I checked the three
candidate frames the packet names. RED 4 (the t9 inventory failing after the map entry and before
the `:root` declaration) is a planned TDD RED, `heartbeat-protocol` §2.5, not a bug. RED 11 (the
`TS2578` frame) is the RED-first evidence for a remedy whose root cause was already diagnosed in
the finding handed to the seat — implementing a diagnosis is not debugging it. The closest call is
F1 (a JSDoc spelling `.focus()` scoring a guard hit), and there the author named the cause in one
sentence without a second hypothesis. The declaration is honest and the floor is met.

## 5. Packet notes (against the orchestrator's packets, not the author)

**P1 — `CODE-REV-S01-C5-R1.md` §4 cites `apps/ui/lib/consent.ts:213` for the `@ts-expect-error`
pin. Measured: the directive is at `:218`; `:213` is a line of JSDoc prose.** The function
`pinSaveChoicesRequiresToggles` opens at `:217`. `213` is the line number `tsc` printed in the
author's M15 output **after both overloads had been deleted** — a five-lines-shorter, mutated
tree. **CLASS, and it is the interesting part:** COMMON §10.24 already requires every `path:line`
to be measured at packet-write time; what it does not name is where the violation comes from —
**line numbers lifted out of captured tool output, which describe whatever tree produced that
output**. Remedy `ADVISORY`: add that sentence to §10.24, and produce every packet citation with a
`grep -n` on the file itself.

**P2 — `CODE-REV-S01-C5-R1.md` §1 reads "your worktree (separate, detached at `fd8250c0 (…),
d5e217f7 (…); HEAD d5e217f7`…)".** The commit-LIST template variable was substituted into the
"detached at" slot, so the packet states the worktree is detached at two commits. Cosmetic;
resolved with one `git rev-parse`. Remedy `ADVISORY`.

**P3 — the follow-up section cites `reviews/CODE-REV-S01-C3C4-r1.md` "lines 318–470" for
N1/N2/N3/N4/N6/N7.** N1 begins at `:318`, N7 ends at `:469`, and **`:470` is the first line of
N8**, which is not on the list. Remedy `ADVISORY`: `318–469`.

**P4 — a standing tension my packet leaves each seat to resolve alone.** COMMON §10.11/§10.26 keep
another lens's CONCLUSIONS unread by a blind seat; my packet §4 orders the follow-up checked "value
by value against `reviews/CODE-REV-S01-C3C4-r1.md` §3". I read §3 of that file and nothing else,
because those six findings **are the requirements of commit `fd8250c0`** and the charge is
unanswerable without them. Remedy `ADVISORY`: state the distinction in §10.26 — *a prior round's
verdict on DIFFERENT work, which a later ticket exists to discharge, is a requirements document
for that ticket and is read as one; a PARALLEL lens's verdict on the SAME work is never read.*

**P5 — two verbatim slips in the author's handoff (`heartbeat-protocol` §2.6), non-blocking.**
(a) The N7-pin line reads `APPSUI_TSC_EXIT=2`. Measured, twice, on both mutant forms:
**`APPSUI_TSC_EXIT=1`** (`lib/consent.ts(218,3)` when the overload is loosened,
`(213,3)` when both are deleted). The conclusion is unaffected — non-zero either way, with the
`TS2578` diagnostic printed — but a measured constant stated wrong is the class §2.6 exists for.
(b) §I reads "`apps/ui/app/settings/page.tsx:39` is
`return <AuthGate>{() => <AccountSettingsScreen />}</AuthGate>;`". Measured at `9dd8042e`: that
line is **`:38`**; `:39` is the closing `}`. The packet's own range `:37-39` contains it and is
correct, and the fact the author drew from it (an anonymous visitor never reaches the panel) is
right. **I made the same slip in this verdict's own §1 table by repeating the author's number
instead of measuring it, and corrected it before filing — which is P1's class from the inside.**
Remedy `ADVISORY` for both: correct them on the ticket; no re-run needed.

## 6. Tickets the orchestrator routes today (`heartbeat-reviewer` §3)

| # | Ticket | Owner | When |
|---|---|---|---|
| N1 | Add at least one present-but-invalid seed to `tests/render/consent-mount.test.tsx`, asserted at the mount AND at the Settings-entry dismissal; RM2 and RM3 must both go RED | a coding seat on `slice/consent-s01` (C6's seat can carry it — it already edits `CookieConsent.tsx`) | before the slice's Grok gate |
| N2a | One comment at `CookieConsent.tsx:145` naming `S01-S38` as `onRequestPolicy`'s owner | C6's seat | with C6 |
| N2b | Carry the exit-route measurement into the **C6 packet** and into V's acceptance ordering: the dismissal and `Privacy notice` acceptance steps are not runnable before C6 | orchestrator | at C6 dispatch |
| N3 | Widen `heartbeat-protocol` §1's `receiving-code-review` trigger to cover discharging another lens's numbered findings outside rework | orchestrator → V row (protocol docs are V's) | next protocol edit |
| P1–P4 | Packet hygiene: measure every `path:line` with `grep -n`; never lift a line number from captured tool output; fix the template substitution; state the prior-verdict-as-requirements rule in §10.26 | orchestrator | next packet cut |
| P5 | Correct `APPSUI_TSC_EXIT=2` → `1` on `t_480db823` | CODE-S01-C5 (a comment) | same day |

## 7. The author's D1 — my ruling

**The route is correct and the property survives intact; the PLAN is what must change, not the
code or the test.** S01-S30/S31/S32 say "press Esc", and three binding sentences (S01-R18, SPEC
§Out of scope, S01-S45's guard) make every literal way of satisfying that a contract violation in
this cluster — the ONE Esc listener is `modalSemantics.ts`, S02's, arriving with the C6 merge. I
verified the premise independently rather than taking it: `ls apps/ui/components/consent/` holds
four files and no helper, `addEventListener` and `Escape` score 0 across all four under BSD `grep`,
and a dispatched `keydown{key:"Escape"}` leaves the open card standing. Pinning the three
properties through `onDismiss` — the exact callback `useModalSurface` will invoke — is therefore
the only lawful seam, and it is a real one: **the property being pinned is "which state the machine
lands in when a dismissal happens", which is C5's, while "which gestures produce a dismissal" is
C6's.** I re-derived all three properties through a *different* seam (a real DOM click on a button
my own pass-through wires to the prop) and got the same answers, plus ten stricter variants; and
RM1 shows the B1 pin catches a faithfully-implemented entry-point discriminator. The author's
twelfth case, which MEASURES that Escape does nothing today, is the right shape for a premise that
will change — it is the case C6 is forced to update.

**What the docs residue `t_38c6bbf2` must read.** In `slices/S01/PLAN.md`, the acceptance clauses
of `S01-S30`, `S01-S31` and `S01-S32` replace "press Esc" with the SEAM and name the gesture's
owner: *"invoke the card's `onDismiss` — the callback `useModalSurface` drives; the Esc EVENT is
`S01-S40`, cluster C6, after the `slice/consent-s02` merge."* The properties themselves change by
not one word. The PLAN's `§Concurrency statement` already says C6 follows the merge, so this is the
correction that makes the step text agree with the dependency graph it already has — and the
author's proposed `mechanism owner:` field in the step schema is the right generalisation, because
this class recurs in every slice that consumes another slice's helper. **Edits must be
line-count-preserving or re-pin every citation (COMMON §10.31): `PLAN.md`'s step block is cited by
live packets.**

## 8. What I did NOT verify — so the next lens knows the gaps

- **Every rendered pixel.** jsdom computes no layout and paints nothing. The 2px the N1/N2 fixes
  recover, the hover spring and its reduced-motion branch, the knob shadow, the scrim's dimming and
  the card's centring are asserted as declared rule TEXT only. V's acceptance steps 1–2, 6, 14, 18.
- **The flash R06 exists to prevent.** `renderToStaticMarkup` = `""` and an empty first client pass
  are the strongest statements jsdom can make. V's step 1.
- **`--shadow-thumb`'s other consumers.** I asserted the token's value is unchanged and that the S01
  block no longer references it; I did not render `.ndSlider`.
- **The dev stack.** No browser was opened. Every figure here is jsdom, `tsc` or `grep`.
- **Anything past the C6 merge.** `modalSemantics.ts` and `PrivacyPolicyModal.tsx` are absent from
  this lane, so N2 is a measurement of TODAY and nothing more.
- **`t3-library`'s four failures on their merits.** They are another mission's, pinned by name; I
  confirmed the names and the count, not their causes.
- **`S01-S35`/R22 by test.** As the PLAN instructs, it is a read fact: `AuthGate.tsx` diff empty,
  `settings/page.tsx:39` is the gate, `AuthGate.tsx:22` is the redirect. **UNVERIFIED by test**, as
  the author also states.

## 9. Predictions (falsifiable evidence that blindness held)

I expect a second lens to reproduce the four cluster verdicts and the boundary sweep exactly —
those are mechanical and the author's figures are honest to the byte. **What I expect it to miss is
N1**, because the path to it is not the diff: it is noticing that S01-R14's condition is a
*predicate the codebase exports*, then asking what equivalence classes that predicate distinguishes
that the suite never seeds. A reviewer who builds mutants from B1's narrative — "the entry point
must not be the discriminator" — writes RM1, watches it go red, and stops satisfied; that is what
the author did, and RM1 does pass. I also expect a second lens to under-weight **N2**, because
every individual fact in it is disclosed somewhere (the card's JSDoc says `onDismiss` is C6's, the
PLAN gives `S01-S38` to C6) and only the *composition* — that C5's mount is what makes an exitless
card and a dead link reachable on every route — is new; a reviewer reading file by file will not
compose them. Conversely, I expect at least one lens to file the `onRequestPolicy` no-op as
**blocking** on the honesty law; I judged it non-blocking because C6 is the named owner, the slice
cannot reach V's acceptance gate before C6 lands, and a finding is not blocking merely because its
remedy is scheduled. If I am wrong anywhere, it is most likely there. The first thing I would check
in another lens's verdict is whether it measured `CMD-C5` **under** a mutant rather than only on
the shipped code — a cluster command's blindness is invisible from a green run.

---

`comments read through: 4` (`t_480db823`) · `1` (`t_f9553998`).
Probe kit: `.hermes/reports/consent-ui/probes/code-rev-s01-c5-r1-*` (17 files).
Self-report: `.hermes/reports/consent-ui/agent-reports/CODE-REV-S01-C5-r1.md` (filed first).
