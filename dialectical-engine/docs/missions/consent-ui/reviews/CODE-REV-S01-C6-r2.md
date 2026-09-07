# CODE-REV-S01-C6 — round 2 verdict (mission `consent-ui`, slice S01, cluster C6)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`
`superpowers:receiving-code-review` — **not loaded this session, not needed: no finding of mine was contested** (COMMON §10.9's honest form; §10.39 binds a seat discharging *another* lens's findings — I am measuring my own r1 B1, not discharging it).

**Verdict: PASS** — **B1 is DISCHARGED**, all four elements measured. Three non-blocking findings
(**N7, N8, N9**), none against the shipped code: N7 is a coverage gap in the new regression net,
N8 a false sentence in the source comment and the handoff, N9 a self-contradicting TOOLING-TRAPS
append. Round 2 of max 3. **No round 3 is required by this verdict.**

**Work under review:** ticket `t_f46592b6`, seat CODE-S01-C6-REWORK-R1. One commit `97859c58`
on `slice/consent-s01`, parent `ab449cba` (the commit I reviewed in round 1).
**My worktree:** `/Users/…/.worktrees/rev-s01-c6-r2/dialectical-engine`, detached at `97859c58`.
`git status --porcelain` = **0 entries** at CLAIM and at handoff; `pnpm run generate:contract`
exit **0**, tree stayed clean.
**Probe kit promoted BEFORE this verdict:** `.hermes/reports/consent-ui/probes/code-rev-s01-c6-r2-*`
(10 files; `.worktrees/` in executable text = **0** after stripping comments, COMMON §10.35).

---

## 1. Packet review (`heartbeat-reviewer` §1)

**The dispatching packet** is `.hermes/planning/consent-ui/packets/CODE-S01-C6-REWORK-R1.md`;
`diff -q` against `snapshots/packets/CODE-S01-C6-REWORK-R1.md.at-dispatch` → **byte-identical**,
so the seat read these words. **My own** packet is likewise byte-identical to its snapshot.

**Every quoted constant checked against the artifact it claims to quote** (`git show`/`awk`, in
my worktree). **All resolve exactly — no drift, a clean improvement on the original C6 packet's
P5 which I filed in round 1.** COMMON §10.24 held.

| Citation (against `ab449cba`) | Measured | |
|---|---|---|
| `policyOpen` at `CookieConsent.tsx:89` | `:89 const [policyOpen, setPolicyOpen] = useState(false);` | OK |
| the false-premise comment at `:80-87` | `:80-87`, ending `a line no test can pin` | OK |
| `openCard` at `:114-119` | `:114 const openCard = useCallback(…` → `:119 }, []);` | OK |
| round-1 verdict B1 = `lines 87–152` | `### B1` at `:87`, `### B2` at `:153` | OK |
| N5 correction `PrivacyPolicyModal.tsx:118,:122` | `:118` scroll, `:122` resize | OK |
| `PLAN.md` §Cluster S01-C6 `:471-538` | `:471` is the cluster heading | OK |
| review package "219 lines" | `wc -l` = **219** | OK |

**`allowed` vs deliverables.** The packet grants `CookieConsent.tsx`,
`consent-policy-link.test.tsx`, the self-report, TOOLING-TRAPS and comments.
`git diff --name-only ab449cba..97859c58` returns **exactly the two product files and nothing
else**. **One genuine packet defect** — the packet orders the promoted probe re-run (COMMON
§10.10) and grants no path from which vitest can run it. That is the author's P1; it is a
**packet finding, not the seat's**, and I have measured a remedy that needs no grant at all
(**N9**).

**Author's `SKILLS LOADED` vs the worker floor** (`heartbeat-protocol` §1 + COMMON §10.9/§10.39):
seven declared — `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`,
`receiving-code-review`, `test-driven-development`, `systematic-debugging`,
`verification-before-completion` — the full floor plus §10.39's `receiving-code-review` (they
were discharging a verdict), declared as loaded **in this session** per §10.9. **No shortfall.**
I cannot grep another session's transcript; the orchestrator's body grep found 7/7 (comment 10)
and I cite that rather than claim it. Self-report present, **153 lines**, meets the §5 bar
(cause, priced findings, a "nearly got wrong" section, dead ends, packet findings).

---

## 2. B1 — DISCHARGED. All four elements measured.

### (1) `setPolicyOpen(false)` is the FIRST statement of `openCard`. **CONFIRMED.**
`apps/ui/components/consent/CookieConsent.tsx:126-132`:
```
126:  const openCard = useCallback((opener: HTMLElement | null): void => {
127:    setPolicyOpen(false);
128:    openerRef.current = opener;
129:    setInitial(togglesFor(readConsent()));
130:    setOpens((count) => count + 1);
131:    setSurface("card");
132:  }, []);
```

### (2) The comment no longer rests on the CSS premise. **CONFIRMED, and its facts are true — I re-measured all three myself rather than reading them.**
The block is now `:74-96`; the substantive rewrite is `:80-95`. It states the true reason
(per-open state; the card can be closed under an open policy) and **records the old premise as
false**. Its three factual claims, measured by `probes/code-rev-s01-c6-r2-css-premise.sh` under
`/bin/bash` with a known-GOOD synthetic control proving the pattern satisfiable (`1`):

| claim | measured |
|---|---|
| `globals.css` carries no `.policy*` rule | `n_policy_rule_lines=0` — and stronger, `.policy` **never occurs at all** in 7615 lines (`n_any_dot_policy=0`) |
| `--z-policy-*` declared and unconsumed | declared `globals.css:94` (`--z-policy-scrim: 77; --z-policy-card: 78;`); `var(--z-policy-` = **0** in `globals.css` and **0** anywhere under `apps/ui` |
| the card's own scrim is `position: fixed; inset: 0` | `.consentScrim` at `globals.css:7384-7393` — `position: fixed; inset: 0; z-index: var(--z-consent-scrim)` |

The `:7384-7393` range the test comment cites is **exact** (rule opens `:7384`, closes `:7393`).

### (3) The two close-under-policy routes are pinned, plus the control — and the round-1 oracle INVERTS. **CONFIRMED.**
New cases at `consent-policy-link.test.tsx:424` (scrim route) and `:460` (Settings + `Save
choices`); the control at `:392` ("does not bring the policy back with a reopened card").

**The round-1 oracle re-run at HEAD `97859c58`** — `probes/code-rev-s01-c6-r1-policy-flag.test.tsx`,
byte-identical (`md5 4ab2d7ec879bbddd61a6ee956efe766b` both sides), run through my own runner.
**`Tests 2 failed | 2 passed (4)`, exit 1.** What each prints, as charged:

| oracle case | at `ab449cba` | at `97859c58` | print |
|---|---|---|---|
| RECORDS … no `.policyScrim` rule exists | pass | **pass** | unchanged — the CSS still does not exist |
| a click on the CARD's scrim … STRANDS the flag | pass | **FAIL — inverted** | `STRANDED FLAG: the policy comes back with a card the visitor opened fresh: expected null not to be null` @ `:106:11` |
| same stranding through the SETTINGS entry | pass | **FAIL — inverted** | `STRANDED FLAG again, through a different route: expected null not to be null` @ `:139:76` |
| CONTROL: policy closed normally, reopen is clean | pass | **pass** | the clean path was never affected |

Exactly the two stranding cases flipped and neither the CSS-fact case nor the CONTROL did —
which is the inversion the author claimed, reproduced independently.

### (4) Delete the restored line in scratch → the new cases RED. **CONFIRMED.**
Mutant **MK** planted with `python3` on an exact string (`diff` proves non-no-op: `127d126`),
restored with `cp` + `diff -q`:

| | author suite | round-1 oracle |
|---|---|---|
| HEAD `97859c58` | `Tests 13 passed (13)` | `Tests 2 failed \| 2 passed (4)` |
| **MK** (line deleted) | **`Tests 2 failed \| 11 passed (13)`** — both new cases named | back to `Tests 4 passed (4)` (defect restored) |

Named RED under MK: `opens a CLEAN card after the card was closed by its scrim under an open
policy` · `opens a CLEAN card after the card was settled by Save choices under an open policy`.
**A full red/green cycle in both directions.** `git status --porcelain -- apps/ui tests` = 0
after every restore.

### Class sweep — the five per-open members, re-derived by me, not read.
`grep -nE 'useState|useRef'` over the component returns **exactly five members; there is no
sixth.**

| member | line | written at every open | affected? |
|---|---|---|---|
| `policyOpen` | `:97` | **`:127` `setPolicyOpen(false)`** | **was the sole affected member — fixed** |
| `openerRef` | `:110` | `:128` assigned | no |
| `initial` | `:63` | `:129` recomputed from **storage** | no |
| `opens` | `:72` | `:130` monotonic; the card's `key` at `:186` → fresh mount | no |
| `surface` | `:60` | `:131` — it IS the transition | no |

**And a stronger structural fact the sweep did not claim: `setSurface("card")` occurs EXACTLY
ONCE in the file, at `:131`, inside `openCard`.** The other three `setSurface` sites (`:113`
mount effect, `:146` `settle`, `:161` `dismiss`) can never produce the card surface. So
`openCard` is the **sole entry** to the card, and the reset there is **total over every close
route — including routes nobody pinned**. That is why the shipped fix is right, and it is the
property the suite should have asserted (**N7**).

---

## 3. Findings

### N7 — NON-BLOCKING. The two new cases pin two route INSTANCES, not the route CLASS: a per-route counterfeit fix scores 13/13 on the shipped suite.

**File:line.** `tests/render/consent-policy-link.test.tsx:424` and `:460` (the two pins);
`apps/ui/components/consent/CookiePreferencesCard.tsx:196` (the unpinned third route);
`CookieConsent.tsx:191` (`onEssentialOnly` → `settle`).

**Concrete inputs → wrong outcome.** The card footer carries **three** controls
(`CookiePreferencesCard.tsx:192,196,199`): `Privacy notice`, **`Essential only`** and
`Save choices`. `Essential only` calls `onEssentialOnly` → `settle` — the same close class as
`Save choices` — and is not among the pinned routes. Mutant **MR-E**, which I built for exactly
this: delete the reset from `openCard` and instead place it in `dismiss` (covers the scrim route)
**and in the `onSave` lambda only** (covers `Save choices`) — a shape a seat could plausibly
write when told "fix the two routes".

**Evidence — the mutant matrix** (`probes/code-rev-s01-c6-r2-mutate.py` +
`-mutant-run.sh`, each restored by `cp` + `diff -q`, tracked porcelain 0 after every one):

| mutant | author suite | my `r2-route-class` probe |
|---|---|---|
| NONE (HEAD) | `13 passed (13)` | `4 passed (4)` |
| **MK** line deleted | `2 failed \| 11 passed (13)` | `3 failed \| 1 passed (4)` |
| **MN** reset moved to LAST statement of `openCard` | `13 passed (13)` | `4 passed (4)` |
| **MD** reset in `dismiss` only | `1 failed \| 12 passed (13)` | `3 failed \| 1 passed (4)` |
| **MR-E** per-route fix for exactly the two PINNED routes | **`13 passed (13)` — SURVIVES INTACT** | **`3 failed \| 1 passed (4)` — CAUGHT** |

**The author's three mutant claims (MK 2/11, MN equivalent, MD 1/12) all reproduce exactly** —
their table is accurate, and **MN really is an equivalent mutant** (React batches the four
setState calls of one event into a single commit; confirmed on two independent suites). My
round-1 remedy said "restore it as the FIRST statement"; **that word was mine and it is not
observable** — the author was right to declare MN rather than write a test for it.

**CLASS.** *A regression net written as one case per enumerated route, for an invariant whose
fix is at a single entry point — so the net cannot see a fix scoped to the enumerated routes.*
**Sweep:** three card-close routes exist (scrim → `dismiss`; `Save choices` → `settle`;
`Essential only` → `settle`). Pinned: 2. Unpinned: 1. **All three are GREEN at HEAD** — I drove
each of them (`r2-route-class.test.tsx`, `4 passed (4)`), so **there is no code defect here.**

**REMEDY — `ADVISORY`** (the shipped code is correct; this changes WHEN, not WHETHER, per
`heartbeat-reviewer` §3): add ONE case asserting the sole-entry property rather than a third
route — e.g. that the card footer's control set is exactly
`["Essential only","Privacy notice","Save choices"]` and that a reopen after **any** of them is
clean. My `probes/code-rev-s01-c6-r2-route-class.test.tsx` is a working draft (its
`enumerates the card's closing surface` case is that guard). **Ticket this against C7 or the
S01 slice ticket, not a round 3.**

**A trap I hit and record so nobody repeats it:** my first draft of these cases called
`root.render()` a second time with a different root element to bring the Settings panel in. That
**remounts `CookieConsent` and resets `policyOpen` for free**, masking the stranding — two cases
passed against MR-E, the mutant they were written to catch. Mount the panel from the start and
never re-render the tree. (Recorded in the probe's own comment.)

### N8 — NON-BLOCKING. The route enumeration is stated as complete in the source comment and asserted as complete in the handoff; it is not.

**File:line.** `apps/ui/components/consent/CookieConsent.tsx:82-83` — *"the CARD can be closed
while the policy still stands over it — **by the card's own backdrop, and by `Save choices`**"*;
and the rework handoff §10, which goes further: *"the two reachable routes are **exactly** the
card's own backdrop and `Save choices`"*.

**Concrete inputs → wrong outcome.** A visitor opens the card, opens `Privacy notice`, clicks
**`Essential only`** (`CookiePreferencesCard.tsx:196`, in the same footer, equally unobstructed —
no `.policy*` CSS exists in this lane). That is a third route in exactly B1's class. The handoff
sentence is false as written; the comment's list reads as exhaustive and is not.

**Evidence.** `grep -nE 'onSave|onEssentialOnly|onDismiss|<button'` over
`CookiePreferencesCard.tsx` → three footer buttons at `:192,:196,:199` plus the scrim handler at
`:125`; `CookieConsent.tsx:191` wires `onEssentialOnly` to `settle`. Driven live in
`r2-route-class.test.tsx` cases 1–2 (green at HEAD).

**CLASS.** *An enumeration written from the reviewer's two measured examples rather than from the
component's actual control surface* — my round-1 B1 named two routes because two sufficed to
prove the defect, and the enumeration propagated as if it were the whole set. **This is my
finding against my own round-1 wording as much as the author's transcription**, and the general
rule is COMMON §2.2: *a reported finding is a SAMPLE of a class, never the whole class.*

**REMEDY — `BINDING (measured: the three-button grep above at HEAD 97859c58, and
r2-route-class.test.tsx cases 1–2 driving Essential only under an open policy, green)`:** two
words in the comment — "…by the card's own backdrop, and by **either** footer control that
settles it" (or "…by any control that closes the card") — and a correction line on the ticket for
the handoff sentence. **No code change; no round 3.** The comment is inside the author's allowed
surface, so this is a one-line edit whenever C7 or the slice next touches the file.

### N9 — NON-BLOCKING. The new TOOLING-TRAPS entry contradicts an existing one 283 lines above it, and recommends the riskier of two remedies.

**File:line.** `.hermes/TOOLING-TRAPS.md:2248-2258` (the author's P1 append) against
`:1965-1974` (CODE-REV-S01-C3C4 r1).

**Concrete inputs → wrong outcome.** `:2253-2258` states the requirement and the file contract
*"can only both be satisfied by copying the probe to a transient `tests/<dir>/`"* and recommends
*"packets … grant one scratch path under `tests/`, marked 'never committed'"*. `:1965-1974`
already says the opposite and gives the mechanism: *"A promoted probe **can** be run verbatim
from the scratchpad without writing anything into the lane … a scratchpad vitest config with
`test.root` pointing at the scratch directory and an exact-string `resolve.alias`"*. The author
cited `:1570` for the `include` fact and did not find `:1965`. A seat that greps for `include` or
`probes/` lands on `:2248` and puts a never-committed file inside the product test tree — where
`vitest.config.ts`'s `include` **does** glob it, so any concurrent whole-suite run picks it up.

**Evidence — I ran the refutation, twice, in both shapes:**
1. **The author's P1 mechanism is REAL** (I did not take it on faith):
   `pnpm exec vitest run .review-scratch/probes/oracle-policy-flag.test.tsx` →
   `No test files found, exiting with code 1` / `filter: .review-scratch/…` /
   `include: tests/**/*.test.ts, tests/**/*.test.tsx, acceptance/**/*.test.ts`. The CLI positional
   is a **filter**, not a path. *(And note the false-green: piped to `tail`, `$?` reads **0** while
   vitest says code 1.)*
2. **The remedy does not need `tests/`.** With `--config` pointing at a config I own, the
   byte-identical oracle ran **from the scratchpad, entirely outside the lane**
   (`probes/code-rev-s01-c6-r2-probe-runner.config.ts`, `LANE` from the environment):
   `Tests 2 failed | 2 passed (4)` — the same inversion — with
   `git status --porcelain -- apps tests packages acceptance` = **0** and
   `git status --porcelain -- tests` = **0**. `md5` identical to the promoted kit both sides.

**CLASS.** *A 2267-line traps file with no index and no contradiction check: a seat greps for the
SYMPTOM's vocabulary, misses the entry filed under different words, re-derives a worse answer and
writes it down as law.*

**REMEDY — `BINDING (measured: the two runs above at HEAD 97859c58 — filter-not-path, and a
byte-identical out-of-lane run leaving 0 porcelain and 0 files under tests/)`:** amend `:2248-2258`
to cross-reference `:1965` and replace *"can only"* with the runner; **ship the runner instead of
the advice** — `probes/code-rev-s01-c6-r2-probe-runner.config.ts` is now promoted and takes `LANE`
from the environment, so the next packet naming a probe names the runner beside it and **grants no
path under `tests/` at all**. Ticket against the orchestrator/docs residue (`t_38c6bbf2` is the
existing docs-residue ticket).

### Round-1 findings the packet excludes from re-review (§4: "say only whether the rework touched any of them")
**It touched none of them.** `git diff --stat ab449cba..97859c58` over the relevant paths is
empty for all of them: **B2** — `modalSemantics.ts` **untouched** (empty diff-stat), so R18's bar
direction remains UNMET and routed (`t_c1068d6f`/V-22); **N1** — `PLAN.md` untouched, the
`CMD-C6` defect stands (§4 below); **N2/N3/N4/N5/N6** — packet/record findings, no file in this
commit. **N4 re-verified as a side effect** (the rework added a long comment to a guarded file):
`CookieConsent.tsx` and `CookiePreferencesCard.tsx` carry `addEventListener` **0**, `.focus()`
**0**, `Escape` **0**, comments included; known-GOOD control — S02's `PrivacyPolicyModal.tsx`
carries `addEventListener` **2** at `:118,:122`. **The rewritten comment introduced no guard
token.**

---

## 4. What I verified, and HOW (verbatim)

**Nothing else changed.** `git log --oneline ab449cba..97859c58` = **one commit**; `97859c58^` =
`ab449cba`, so **`ab449cba` was not amended**. `git diff --name-only` = exactly
`CookieConsent.tsx` + `consent-policy-link.test.tsx`. `globals.css`, `packages/**`, `apps/api/**`,
`migrations/**`, `tools/**`, `apps/runner/**`, `apps/scheduler/**` and `modalSemantics.ts`: **all
empty diff-stats**. Diff lines matching `register\(|adult_affirmed`: **0**. `globals.css` blocks:
`=== consent-ui S01 ===` **1**, `=== consent-ui S02 ===` **0**.

**No existing case weakened — proved mechanically, not asserted.**
`it()` names, `ab449cba` vs HEAD: `diff` = **`10a11,12`** — two ADDITIONS, zero deletions, zero
modifications. `expect(` count **74 → 91**. **Zero `expect(` lines removed or altered anywhere in
the file.** And in BOTH files, **every removed line is a comment** (test file: all `//`;
component: all JSDoc `*` lines) — the only executable change in the entire commit is the added
`setPolicyOpen(false);`.

**`CMD-C6` ×3 from a `.sh` under `/bin/bash` AND ×3 inline in the tool shell (zsh) — all six
byte-identical** (extracted programmatically from `PLAN.md:792-809`, **0 non-ASCII bytes**):
```
S01-C6 verdict=1   summary:      Tests  13 passed (13)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in 9cc81351318cdb10acb655dbb34eef4f87e19676..HEAD touching them: 1, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
```
No §10.40 divergence — this command writes its four paths literally, so zsh's word-splitting trap
does not reach it. **Every arm passes except `n_s02c`, which is my own round-1 N1.**

**The `44744d8d` arm, as charged — `n_s02c` = 0 and the whole command goes GREEN ×3:**
```
S01-C6 verdict=0   summary:      Tests  13 passed (13)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in 44744d8d33337b7110f0885b94124ccd5a5eb83d..HEAD touching them: 0, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
```
| `A` in `git log --oneline A..HEAD -- <4 S02 paths>` | `n_s02c` | ancestor of HEAD? |
|---|---|---|
| `44744d8d` — the SHA actually merged | **0** | yes |
| `9cc81351` — the live `slice/consent-s02` tip the command re-derives | **1** | no |
| `92828aa5` — the merge itself | **0** | yes |

The one counted commit is `92828aa5`, **the merge itself**, and
`git diff --stat 44744d8d..HEAD` over the four S02 paths is **EMPTY**. **`CMD-C6`'s RED is the
COMMAND's defect and not the code's** — my round-1 N1, now measured by three seats
independently. `n_s02c` is still **0 against the merged SHA after the rework commit**, which is
the committed form of the guard: **the rework touched no S02-owned file.**

**`CMD-C5` ×3 `/bin/bash` and ×3 inline — all six byte-identical, verdict 0:**
```
S01-C5 verdict=0   summary:      Tests  4 failed | 58 passed (62)  files: Test Files  1 failed | 2 passed (3)   failures: 4 (unpinned: 0)  guarded-green: 2  consent-mount lines: 31 (failing: 0)  hit-list: 1   tsc ran: 1 exit 1, outside the pin: 0
```
The four failures are exactly the pinned `t3-library > lists` set (`n_newfail`=0), pre-existing,
another mission's (BASELINE 2026-09-06 20:15).

**Standing gates, reported not folded in (COMMON §10.20):**

| gate | measured at `97859c58` | delta vs BASELINE |
|---|---|---|
| `cd apps/ui && npx tsc --noEmit -p tsconfig.json` | **exit 0**, 0 output lines | required 0 — met (§10.30) |
| `pnpm typecheck` (root) | exit 1, **8 diagnostics, all `tests/unit/s14-ui.test.ts`** (2×TS2307, 2×TS18046, 2×TS2339, 2×TS7006), **0 outside the pin** | **0** |
| `t9-mode-tokens` | `Tests 2 failed \| 7 passed (9)`; hit list **exactly 1** — the pinned `.drawerScrim` `color-mix` literal at `globals.css:6116`; the two failures by name | **0** |
| the ten `tests/render/consent-*.test.tsx` ×3 | exit 0, **`Tests 121 passed (121)`, `Test Files 10 passed (10)`**, 0 FAIL lines, all three runs identical | 119 → 121 = **+2**, exactly the two new `it()`s (§10.42) |

**A definitional note on "the ten consent suites":** there are **eleven** consent suites on disk —
ten `tests/render/consent-*.test.tsx` plus `tests/unit/consent-privacy-policy-data.test.ts`. The
author's (and the packet's) "ten" is the render set, `121 passed (121)`. All eleven together ×3:
exit 0, **`Tests 127 passed (127)`, `Test Files 11 passed (11)`**, 0 FAIL lines (121 + the unit
file's 6). Both figures are green; the number is a naming convention, not a discrepancy.

## 5. What I did NOT verify

- **Nothing in a browser.** All jsdom + source. jsdom performs no layout, so the *pointer*
  reachability of every route rests on the measured CSS facts (no `.policy*` rule exists), not on
  hit-testing. **V's acceptance in the dev stack is the authority**, and it is the direction that
  matters most for N7/N8: once S02's stylesheet lands, some of these routes may become
  unreachable by pointer — which changes the coverage argument, never the code, since the reset
  sits at the sole entry.
- **B2's remedy.** Out of C6's surface and routed (`t_c1068d6f`/V-22); `modalSemantics.ts` is
  untouched by this commit and I did not re-audit it.
- **The author's transcript.** I cannot grep another session; the `SKILLS LOADED` check cites the
  orchestrator's body grep.
- **The design extracts** (`design/turn-10-cookie-consent.html`). This commit changes one line of
  logic and adds two cases — no markup, copy or token moved — so I probed behaviour and
  boundaries, not design fidelity.
- **`prefersReducedMotion()` and the whole-slice `CMD-C7`** — C7's, not this cluster's.

## 6. Predictions (falsifiable evidence that blindness held)

I read no other lens's verdict on this work; the only prior verdict I read is my own round 1,
which the packet makes my requirements document (COMMON §10.26 addendum).

**What I expect another lens got wrong.** First, **`n_s02c` again** — a lens measuring it from
the tool shell against the live ref gets `1` and may write it up as a regression the rework
introduced; it is the merge commit surfacing against its non-TREESAME parent and it predates
both commits. Second, and most likely: **a lens will accept the "two reachable routes" sentence**
(it appears in the source comment, the handoff and my own round-1 B1 — three mutually confirming
places, all tracing to the same two examples) and never open `CookiePreferencesCard.tsx` to count
the footer buttons. Third, I expect a lens to try to file **MN** (reset moved to the end of
`openCard`) as an unpinned mutant; it is equivalent, and filing it would push the author to write
a test asserting statement order, which carries no behaviour. Fourth, a lens that runs my
route-class cases without mounting the Settings panel from the start will get a **false green**
from the remount and conclude the two pins are sufficient.

**What I expect another lens found that I did not.** Design fidelity of the 10b/10c markup, and
anything about `prefersReducedMotion`; I deliberately scoped to the rework.

**What I would check first with another hour.** Whether `openSurfaceCount()`'s module-level
`surfaceStack` leaks across test FILES under `fileParallelism: false` when a suite fails
mid-case — still open from round 1 — and whether S02's `PrivacyPolicyModal` has its own member of
B1's class now that the pattern is named twice.

---

`comments read through: 11` (ticket `t_f46592b6`); `comments read through: 2` (ticket `t_119c6c19`).
Self-report filed at `.hermes/reports/consent-ui/agent-reports/CODE-REV-S01-C6-r2.md` (NEW file)
BEFORE this verdict was posted. Probe kit at `.hermes/reports/consent-ui/probes/code-rev-s01-c6-r2-*`
(10 files) promoted BEFORE this verdict. Scratch deleted; `git status --porcelain` = 0.
Nothing pushed, merged, marked Done or edited in the work under review; no subagent dispatched.
