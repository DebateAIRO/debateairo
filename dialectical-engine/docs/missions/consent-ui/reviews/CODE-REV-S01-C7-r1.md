# CODE-REV-S01-C7 r1 — blind per-cluster review of S01-C7 (slice-wide guards), the C6 follow-up and the ADR index

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review`

**Verdict: PASS** — 0 blocking, 4 non-blocking (N1…N4), 3 packet findings (P1…P3). Round 1 of max 3.

Subject: `89f653ff` · `810cfaef` · `4ddc350c` on `slice/consent-s01`; base `97859c58`, HEAD `4ddc350c`
(verified: `git rev-parse 89f653ff^` = `97859c58`).
Worktree: `.worktrees/rev-s01-c7/dialectical-engine`, detached at `4ddc350c`, `git status --porcelain`
= 0 entries on entry and on exit. `pnpm run generate:contract` run first, exit 0, tree still clean.
Probe kit: `.hermes/reports/consent-ui/probes/code-rev-s01-c7-r1-{mutants.py,cmd-c6.sh,cmd-c7.sh,f1-refsweep.sh}`
(lane from `argv[1]`; `grep -c '\.worktrees/'` = 0 in every file — COMMON §10.35).

`comments read through: all (8 on t_4c58683b, 1 on t_37e03694, 5 on t_94c9010a).`

---

## 1. Packet review (`heartbeat-reviewer` §1) — the author's packet and my own

Constants checked against the artifacts they quote, all measured in this worktree:

| Packet constant | Measured | |
|---|---|---|
| base `97859c58` | `git rev-parse 89f653ff^` = `97859c58` | ✓ |
| `PLAN.md:539-591` = §Cluster S01-C7 | `:539` heading, `:541-578` the five steps, `:580` the Clusters heading | ✓ (range over-runs by 13 lines, contains the cluster) |
| cluster row at `PLAN.md:603` | `:603` is the `**S01-C7**` row | ✓ |
| `README.md:70-89` indexes 18 ADRs | header `:70`, rows `:72-89` = 18 | ✓ |
| `CookiePreferencesCard.tsx:196` = `Essential only` | `:196` is its `<button>`, `:197` its label | ✓ |
| review package "692 lines, 3 commits, stat, full diff" | `wc -l` = 692 | ✓ |
| `consent-guards.test.tsx` 477 lines | `wc -l` = 477 | ✓ |
| dispatch snapshot identical to the live packet | `diff -u` = IDENTICAL | ✓ |
| F2's wording (from my packet) | `PLAN.md:561` = "a conditional whose test is `decision.quality` or `decision.analytics`"; `:562` = ``if (readConsent()?.analytics) {…}`` | ✓ verbatim |

**P1 — my own packet cites the dispatch snapshot by a RELATIVE name that does not resolve.**
`CODE-REV-S01-C7-R1.md:10` says `(snapshot: snapshots/packets/CODE-S01-C7.md.at-dispatch; …)`. There
is no `snapshots/` under `.hermes/planning/consent-ui/packets/`; the file lives at
`/Users/…/dialectical-engine/.hermes/reports/consent-ui/snapshots/packets/CODE-S01-C7.md.at-dispatch`.
CLASS: COMMON §10.45, already paid for once in this mission (CODE-S01-C6 F4). Remedy: **BINDING
(measured: `ls .hermes/planning/consent-ui/` prints `packets` and nothing else)** — every mission-doc
pointer in a packet is absolute, snapshots included. Ticket: packet-hygiene row for the orchestrator.

**P2 — the author's packet orders a deliverable outside its own "exhaustive" `allowed` list.**
`CODE-S01-C7.md:13` grants "comments on `t_4c58683b`"; `:25` orders "report on `t_94c9010a` (a comment,
`--author CODE-S01-C7`)". The author obeyed `:25` (comment present on `t_94c9010a`, 4828 bytes,
correctly reporting 344 diagnostics and the byte-identical restore) and thereby wrote outside the
exhaustive list. CLASS: COMMON §10.41 — one exhaustive allowed list per packet, tagged per commit and
per ticket. Not a finding against the seat. Remedy: **BINDING (measured: the `t_94c9010a` comment
exists and `t_94c9010a` appears nowhere in `:13`)**.

**P3 — the packet pins the C6 comment edit to `:82-83`, narrower than the finding's class.**
`CODE-S01-C7.md:13` allows "the `:82-83` comment wording ONLY". Discharging N8 (state the route
CLASS) required rewording `:83-87` and adding a 9-line paragraph. Resolved by COMMON §10.27 (change
what the class requires and declare the rest — the author declared it), so **no finding against the
seat**; the packet's line-pin is the defect. ADVISORY.

`allowed` vs deliverables for my own seat: verdict, self-report, scratch, TOOLING-TRAPS, probes dir,
comments on both tickets — every deliverable is inside the list. No defect.

---

## 2. What I verified, and how

### 2.1 Boundaries, and the three commits

```
$ git diff --stat 97859c58..4ddc350c
 .../apps/ui/components/consent/CookieConsent.tsx   |  20 +-
 .../docs/architecture/01-decisions/README.md       |   2 +
 .../tests/render/consent-guards.test.tsx           | 477 +++++++++++++++++++++
 .../tests/render/consent-policy-link.test.tsx      |  97 +++++
 4 files changed, 591 insertions(+), 5 deletions(-)
```

Per commit: `89f653ff` = `CookieConsent.tsx` + `consent-policy-link.test.tsx`; `810cfaef` =
`consent-guards.test.tsx` (added) only; `4ddc350c` = the ADR `README.md` only. Nothing outside the
packet's `allowed` surface. `git log 97859c58..4ddc350c -- tsconfig.json apps/ui/app/globals.css`
= **0 commits** — both untouched, so `globals.css` block discipline is trivially intact
(`n_blocks` = 1 in every `CMD-C7` run). `git diff 97859c58..4ddc350c | grep -E '^\+.*(register\(|adult_affirmed)'`
= **no output**: the registration request shape is untouched (COMMON §3).

**`CookieConsent.tsx` is comment-only, proved not claimed.** All 20 changed lines (5 `-`, 15 `+`) lie
inside the `policyOpen` JSDoc; filtering the `-U0` diff for lines that do not begin with `*`, `//` or
`/*` after trimming leaves **0 lines**.

### 2.2 `CMD-C7` ×6 — 3 from a `.sh` under `/bin/bash`, 3 inline in zsh (COMMON §10.16(a))

Transcribed from the FENCED block at `PLAN.md:815-832`. Worst run = every run; the two shells agree
on every arm:

```
S01-C7 verdict=0   summary:      Tests  76 passed (76)  files: Test Files  6 passed (6)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
```

`Test Files 6 passed (6)` is live — no path silently dropped (COMMON §10.13). This reproduces the
author's 12-run table exactly.

### 2.3 `CMD-C6` ×6 — same two arms — and the `n_s02c` measurement against `44744d8d`

```
S01-C6 verdict=1   summary:      Tests  14 passed (14)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in e8bf065829ffe572cee2598803bb3505fe129f4e..HEAD touching them: 1, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
```

`verdict=1` in all six runs comes SOLELY from `n_s02c`; `vt=0`, the summary is green, `Test Files 1
passed (1)`, `st=0`, the working-tree `s02` diff is empty, `n_tcran=1`, `tt=1`, `n_tc=0`.
Against the pinned merged sha the arm is clean:

```
n_s02c(44744d8d) = 0   commits: 'none'
counted against the moving ref: 92828aa5 merge(consent-ui S01-S36): slice/consent-s02 @ 44744d8d into slice/consent-s01
git diff --stat 44744d8d 92828aa5 -- <the four S02 paths>  ->  EMPTY (TREESAME)
```

**F1 CONFIRMED, with a sharper mechanism than the author's.** A ref sweep
(`code-rev-s01-c7-r1-f1-refsweep.sh`) gives the exact predicate:

```
parents of 92828aa5: d5e217f7 44744d8d
n_s02c(44744d8d)          = 0   [ancestor-of-HEAD]
n_s02c(9cc81351)          = 1   [NOT-ancestor-of-HEAD]
n_s02c(a035f814)          = 1   [NOT-ancestor-of-HEAD]
n_s02c(0dc569e9)          = 1   [NOT-ancestor-of-HEAD]
n_s02c(e8bf0658)          = 1   [NOT-ancestor-of-HEAD]
n_s02c(slice/consent-s02) = 1   [NOT-ancestor-of-HEAD]
```

The arm is satisfiable **iff the resolved ref is an ancestor of HEAD**, which is exactly the sha that
was merged. "The ref moved" is the symptom; "the ref is no longer an ancestor" is the cause, and it
makes the one-token fix (`s02tip=44744d8d`) provably correct rather than plausibly correct. No real
S02-file violation exists: the range diff touches no S02 file and the merge is TREESAME to its S02
parent on all four paths. Routed to `t_38c6bbf2` (PLAN).

### 2.4 The four guards — every N7 mutant re-planted by me, in my own worktree

Harness: `cp` snapshot → anchor asserted UNIQUE → md5 asserted CHANGED → run → restore by `cp` →
`diff -q` → `git status --porcelain` (COMMON §10.44; never `git checkout`). Every restore printed
`IDENTICAL` and every post-restore porcelain printed `0 entries`. 22 mutants planted.

**S01-S42** — `style={{ borderColor: "#A8823E" }}` on the bezel → `Tests 1 failed | 6 passed (7)`:

```
AssertionError: colour literals in the files this slice adds:
+   "apps/ui/components/consent/CookieBar.tsx:38: <div className=\"consentBarBezel\" style={{ borderColor: \"#A8823E\" }}>",
 ❯ tests/render/consent-guards.test.tsx:156:87
```

byte-identical to the author's frame. My additions: `oklch(0.7 0.1 90)` on the same element → caught
(the regex's first alternative); an `rgba(41,38,31,.10)` const in `apps/ui/lib/consent.ts` → caught
(a file the author never mutated); a **sixth file** `consent/ZzProbeSixth.tsx` carrying `#A8823E` →
caught, naming `ZzProbeSixth.tsx:1` — the run-time directory derivation is real, not decorative.

**S01-S43** — `transition: opacity .18s ease;` on `.consentBar` with no counterpart → `1 failed |
6 passed (7)`, `[ '.consentBar' ]`. **The coverage direction** (the same transition WITH `.consentBar`
added to the reduced-motion rule) → `Tests 7 passed (7)`: this is a COVERAGE guard, not an ABSTINENCE
guard, and the author's insistence on that second observation is correct. My addition: the same
transition nested inside the block's `@media (max-width: 719.98px)` rule → **caught** (`.consentBar`),
so the recursive descent through non-reduced-motion at-rules works.

**S01-S44 arm 1** — `const plausibleReady = true;` → caught, `CookieConsent.tsx:107`.
**S01-S44 arm 2** — `if (readConsent()?.analytics) { document.body.dataset.consentAnalytics = "on"; }`
→ caught, `CookieConsent.tsx:123` — byte-identical to the author's frame.

**S01-S45 arm 1** — the `useEffect` keydown listener in `CookiePreferencesCard.tsx` → caught, naming
the file and the token. My addition: the same listener planted in **`PrivacyPolicyModal.tsx`** →
**caught** (`PrivacyPolicyModal.tsx:4`), which is the positive proof the author's U2 needed: that
file IS in the scan and passes today only because its listeners are `scroll`/`resize`.

**S01-S45 arm 2 — the arm S01 declared UNVERIFIABLE is verifiable from a detached review worktree,
and it holds.** `addEventListener("keydown"` → `addEventListener("keyup"` in `modalSemantics.ts`:

```
× … > keeps the ONE Esc-and-focus implementation inside the shared helper
   → the shared helper still owns the document-level keydown listener: expected false to be true
 ❯ tests/render/consent-guards.test.tsx:369:7
```

**The six neighbours the author says are correctly NOT caught — I confirmed all six**, each
`Tests 7 passed (7)`: `borderColor: "var(--gold)"` · `transition:` inside a CSS comment · a
`transform` on an unnamed consent selector · `const telemetryReady = true;` · the same boolean read in
a data position under a new receiver · a `resize` listener in the card. Plus `#A8823E` planted in
S02's `modalSemantics.ts` → **not caught**, which is S01-S42's by-name exclusion working.

### 2.5 Transcription fidelity (COMMON §10.43) — diffed against `PLAN.md:539-591`

| Guard | PLAN | Test | |
|---|---|---|---|
| S01-S42 regex | `:545` `/oklch\(\|#[0-9a-f]{3,8}\b\|\brgba?\(/i` | `:154` | **byte-identical** |
| S01-S44 arm 1 regex | `:561` `/gtag\|googletagmanager\|analytics\.\|segment\|mixpanel\|posthog\|amplitude\|plausible\|datadog\|sentry\|<script/i` | `:242` | **byte-identical** |
| S01-S45 token list | `:569` five tokens + `modalSemantics.ts` excluded AND required to contain each | `:330-335`, `:365-374` | **identical set, no widening** |
| S01-S42 file list | five files; directory-derived; S02's two excluded BY NAME | `:57-61`, `:75-79` | matches, and the exclusion is by name |
| S01-S43 | mechanical set difference | `:387-408` | matches |

**Ruling on the author's C2 (the S01-S43 longhand widening): ACCEPTED.**
`MOTION = /(?:^|[;{}\s])(?:animation|transition)(?:-[a-z-]+)?\s*:/` is a strict SUPERSET of the
PLAN's two shorthand spellings — it can only ever flag more, never less — and it is disclosed in the
file. Measured to change nothing today: the S01 block declares motion in exactly two places
(`transition: transform .5s cubic-bezier(.34,1.56,.64,1)` and the reduced-motion `transition: none`),
both shorthand. It does not over-fire on `.transitional:hover`-shaped selectors (the boundary class
and the `\s*:` anchor exclude them), which is why the guard is green today.

### 2.6 Ruling on the author's F2 — the receiver, and whether the property survives

**Which receiver the guard pins: none — and that is the point.** `stored = /\??\.(quality|analytics)\b/g`
matches the two property names under ANY receiver (`decision.`, `readConsent()?.`, `stored.`,
`choice.`, `toggles?.`), and the PLAN's carve-out ("outside the card's own toggle rendering and the
R04 write") is re-expressed mechanically as "the occurrence sits in a DATA position — the value of an
object-literal property of the same name, or the operand of a `typeof` shape check". **The property
survives, and is strictly better served than by the PLAN's literal wording**: the literal wording is
green against the mutant the same paragraph orders it to be RED against (measured: `grep -c 'decision\.quality\|decision\.analytics'` over the five
files returns 0 in all five, so a literal transcription would have been unfalsifiable as well as
unsatisfying — the only `decision.` in the set is prose in a JSDoc at `apps/ui/lib/consent.ts:83`), while the widened guard goes RED on the named mutant (`CookieConsent.tsx:123`,
measured) and stays green on a data-position read under a new receiver (measured). F2 is a real,
would-have-been-blocking PLAN defect, correctly diagnosed, correctly widened, and correctly reported
instead of absorbed. It belongs on `t_38c6bbf2`.

**Ruling on F3 (verbatim vs mutant-RED, when they conflict): the MUTANT wins, and the wording is
filed as a plan defect the same hour** — COMMON §10.43 exists to stop a packet WIDENING a guard into
unpassability, not to make a plan's own demonstration unreachable; a guard that cannot go RED against
the mutant its own paragraph names is unfalsifiable, and an unfalsifiable guard is the one thing
§10.16 forbids outright. Suggested COMMON sentence, adopting the author's: *"if a guard as worded
cannot catch the mutant named beside it, pin the PROPERTY, report the wording as a plan defect on the
PLAN's ticket, and disclose the widening with the measurement that shows it changes nothing today."*

### 2.7 The C6 follow-up (`89f653ff`) — counterfeit MR-E re-planted

MR-E (reset deleted from `openCard`, written into `dismiss` + the `onSave` lambda ONLY):

```
      Tests  1 failed | 13 passed (14)
 × … > opens a CLEAN card after EVERY route that closes it under an open policy
   → Essential only: and it is CLEAN — no policy the visitor did not ask for: expected <div class="policyBezel" …(3)>…(1)</div> to be null
 ❯ tests/render/consent-policy-link.test.tsx:587:9
```

The `13 passed` reproduces the r1 reviewer's 13/13 exactly: MR-E leaves both pinned route cases green
and only the new case sees it, on the `Essential only` route — the route N7 named. Also measured:
MN (the reset moved to the LAST statement of `openCard`) → `14 passed (14)`, correctly **not** caught;
MK (reset deleted outright) → `3 failed | 11 passed (14)`, the new case failing on its FIRST route,
i.e. on the class; M4TH (a fourth footer control) → `2 failed | 12 passed (14)`, the footer
control-set half firing with `expected [ 'Privacy notice', 'Not now', …(2) ]`. N8's rewording is
comment-only and states the CLASS; the superseded enumeration is recorded, not silently deleted.

### 2.8 The ADR commit (`4ddc350c`)

Exactly two rows added after `0018`, in the existing minted-row format, nothing else in the file
changed (the whole diff is `+2/-0`). Titles are byte-identical to the ADR files' own H1s:
`ADR-0021 — The browser-local consent record: one key, one versioned object, re-ask on anything else`
and `ADR-0022 — One shared modal-semantics module, and the Esc stack`. C5's third-column wording
("minted by the **`consent-ui`** mission (slice S01/S02)") is a reasonable transposition of the four
existing "minted by **DR-nnn**" rows for a mission that has no DR; no packet constant governs it.

### 2.9 Standing gates, re-measured here (never folded into a cluster guard — COMMON §10.20)

- `pnpm typecheck`: exit 1, **8 diagnostics, all `tests/unit/s14-ui.test.ts`**, **0 outside the pin**
  — delta against BASELINE.md = zero. `git diff --stat 97859c58..4ddc350c -- tsconfig.json` = empty.
- `cd apps/ui && npx tsc --noEmit -p tsconfig.json`: **exit 0, 0 diagnostics, 0 bytes of output** (§10.30).
- `t9-mode-tokens`: exit 1, `Tests 2 failed | 7 passed (9)`, the two pinned names, hit list exactly
  one line — `…/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);`
  (BASELINE permits the number to shift as the slice appends CSS).
- `auth-flow-integration`: exit 0, `Tests 18 passed (18)` (≥ the 17+ bar).

### 2.10 The author's `SKILLS LOADED` against the worker floor

Declared: `using-superpowers, heartbeat-protocol, heartbeat-worker, receiving-code-review,
test-driven-development, verification-before-completion`; `systematic-debugging` declared **not
loaded this session — not needed because nothing broke**, which is §10.9's sanctioned honest form and
§10.25's required alternative to a waiver. **I judge no RED frame in this run to be a bug in the
floor's sense**: every RED was a deliberately planted mutant behaving as designed, and F2 was a
document defect found by reading, not by debugging. The one candidate — the aborted plant on a
non-unique anchor — was a harness misfire root-caused in one step and written up as a trap. No finding.

### 2.11 U1–U3 and the TOOLING-TRAPS appends, one line each

- **U1 (ADR index gap 0018 → 0021): TRUE and ticketable.** `docs/missions/translation/INSTRUCTIONS.md:62`
  claims 0019 ("the next free number is **ADR-0019**") from inside a halted mission's folder, and
  `ls docs/architecture/01-decisions/ | grep -c '0019\|0020'` = 0 — the README's own numbering
  resolution (`## 2.`, `:161`, the resolution list at `:176-190`) is the right home for one bullet.
- **U2 (`PrivacyPolicyModal.tsx:118,122` registers scroll/resize, not keydown): TRUE, and now proved
  in the positive direction** — a keydown planted in that file IS caught (§2.4), so the file is
  scanned and passes for the stated reason. Ticketable as a line in S02's DECISIONS.
- **U3 (no suite reads the ADR README): TRUE** — `grep -rl '01-decisions' tests/` = 0 files; the only
  two tests touching `docs/architecture` read `10-row-contracts.md` and `05-register-skeleton.md`.
  Commit 3 is inert to every gate. Not ticketable; correctly stated so nobody hunts a moved count.
- **Append 1 (an aborting mutant harness prints the UNMUTATED result): TRUE, and load-bearing** — it
  is why my own harness asserts anchor uniqueness, which caught a 4× anchor in `modalSemantics.ts`
  inside the hour. Ticketable: no; keep.
- **Append 2 (COVERED vs ABSENT guards share a RED): TRUE and generalisable** — I reproduced both
  directions (§2.4). Keep as written.
- **Append 3 (a guard naming the EXAMPLE's spelling cannot catch its own mutant): TRUE** — this is
  F2's class and the cheapest plan-review check in the mission. Ticketable: yes, as a plan-review step.
- **Append 4 (macOS `cat` has no `-A`): TRUE but DUPLICATE** — already at `TOOLING-TRAPS.md:1046`.
  See N4.
- **Append 5 (zsh runs backticks inside a double-quoted kanban body): TRUE, measured, and the most
  valuable of the five** — I read the damage from the consumer side (the spliced `ls` output sits
  inside U1's sentence in the stored body) and the correction comment restores all four sites
  verbatim. Ticketable: yes — COMMON §2's CLI block should carry the `"$(cat file)"` rule.

---

## 3. Findings

**No blocking findings.**

### N1 — S01-S45 arm 1 is a LITERAL TOKEN LIST, and two realistic spellings walk through it
`tests/render/consent-guards.test.tsx:330-335` (the `banned` array), transcribed verbatim from
`PLAN.md:569`. Concrete inputs → wrong outcome, both measured in this worktree against the shipped
guard:
- `const focusProbe = (el: HTMLElement): void => { el.focus({ preventScroll: true }); };` in
  `CookiePreferencesCard.tsx` → `Tests 7 passed (7)`. A second focus implementation written with the
  standard `preventScroll` option is invisible to a guard that bans the string `.focus()`.
- `const KEYDOWN_PROBE = "key" + "down"; document.addEventListener(KEYDOWN_PROBE, () => {});` →
  `Tests 7 passed (7)`.
CLASS: **a guard whose acceptance is a token list is weaker than the property it serves, and nothing
in the artifact says by how much.** Addressee: the PLAN (`S01-S45`), not the seat — COMMON §10.43
ordered verbatim transcription, and the author obeyed. Remedy: **ADVISORY** — add `.focus(` (open
paren, no close) to the token list, or record the two evasions beside the `accept:` line so a later
seat does not read the list as the property. Ticket: `t_38c6bbf2` (PLAN corrections), with F2.

### N2 — S01-S44 arm 2's per-line shape test has a measured evasion (disclosed by the author)
`tests/render/consent-guards.test.tsx:281-297`. Input:
`const cfg = { analytics: readConsent()?.analytics ? loadIt() : skipIt() };` in `CookieConsent.tsx`
→ `Tests 7 passed (7)`. This is a real control-position use of the stored boolean; it slips past
because the text preceding the occurrence on the SAME line matches `dataPosition("analytics")`.
The author states this limit in the case's own comment ("a line-shape limit, not a claim about the
property"), so it is disclosed, not hidden — but a disclosure in a comment is not a ticket.
CLASS: same as N1 (approximation read as property). Remedy: **ADVISORY** — either test the shape
against the whole line rather than the prefix, or record the evasion beside `PLAN.md:561`.
Ticket: `t_38c6bbf2`.

### N3 — S01-S42's scan does not follow S01 into `apps/ui/lib/`
`tests/render/consent-guards.test.tsx:57-61`: the scan is `apps/ui/lib/consent.ts` (hard-coded) plus
the `components/consent/` directory. Input: a new S01 file `apps/ui/lib/consentProbeSixth.ts`
containing `export const REVIEWER_PROBE_LIB = "#A8823E";` → `Tests 7 passed (7)`, unscanned. The
directory clause that makes a sixth COMPONENT safe (measured working, §2.4) has no counterpart for
`lib/`. Addressee: the PLAN (`S01-S42`'s `accept:`). Remedy: **ADVISORY** — derive the `lib/` half
from a `consent*` glob too, or state in the `accept:` line that `lib/` is a named singleton.
Ticket: `t_38c6bbf2`.

### N4 — the `macOS cat has no -A` trap entry is a duplicate
`.hermes/TOOLING-TRAPS.md:2364` repeats `:1046` ("macOS `cat` has no `-A`"), in a file that is 2408
lines and is the first thing every seat reads. The new entry adds one fact (`cat -et` is the
equivalent). Remedy: **BINDING (measured: `grep -n 'cat -A\|cat has no' .hermes/TOOLING-TRAPS.md`
prints `:1046` and `:2364`)** — fold the `cat -et` sentence into `:1046` and delete the second entry;
and add a dedupe grep to the append ritual. Ticket: orchestrator, TOOLING-TRAPS hygiene.

---

## 4. What I did NOT verify

- **Anything a browser decides.** `prefers-reduced-motion` actually suppressing the transition, both
  modes live, and S01-R26/R27's visual half are V's acceptance steps; jsdom reads `globals.css` as
  bytes. The S01-S43 guard proves the RULE EXISTS and NAMES the carrier, never that the browser
  honours it.
- **That the author's twelve `CMD-C7` runs and twelve `CMD-C6` runs happened as tabulated.** I ran
  twelve of my own and got identical figures; that is consistent with the claim, not proof of it.
- **Slice S02**, beyond the two files S01's guards read, and beyond restoring `modalSemantics.ts` and
  `PrivacyPolicyModal.tsx` byte-identical after mutating them here.
- **The t_94c9010a remedy.** I confirmed the measurement was posted and `tsconfig.json` is in no
  commit; the separate-tests-project ruling is the orchestrator's and is outside this cluster.
- **Non-determinism beyond six runs per command.** Everything was identical; I did not vary pool size,
  `fileParallelism` or machine load.

## 5. Predictions (falsifiable — evidence that blindness held)

I expect a parallel lens to have re-run the five N7 mutants and stopped there, and to have taken the
S01-S45 second arm as unverifiable on the author's and the PLAN's word (`PLAN.md:570`, and the test's
own comment) rather than mutating `modalSemantics.ts` in its own disposable worktree — that arm is
the single most likely gap in another verdict, and it takes 3 seconds to close. I expect the same lens
to have accepted "the ref moved" as F1's mechanism instead of measuring the ancestry predicate, which
matters because it is what makes the one-token fix provably right. I expect at least one lens to file
the S01-S45 evasions (or the S01-S44 line-shape hole) as findings against the SEAT rather than against
the PLAN, which would be wrong: COMMON §10.43 ordered verbatim transcription and the author obeyed it.
And I expect nobody else to have checked whether the guards follow S01 into `apps/ui/lib/` (N3), or to
have noticed that `t_94c9010a` is ordered by the packet but absent from its exhaustive `allowed` list
(P2). If a lens reports a BLOCKING finding on this diff, the first thing I would check is whether its
mutant was planted against a UNIQUE anchor and whether the file actually changed — `'  return ('`
occurs twice in `CookiePreferencesCard.tsx` and Python's `str.replace` is global.

`comments read through: all.`
