# CODE-REV-S01-C1C2 — round 1 verdict (blind per-cluster code review, mission `consent-ui`)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`

`superpowers:receiving-code-review` — **not loaded this session, not needed: no finding of mine is
contested yet** (COMMON §10.9's honest form). It is loaded the moment the author contests one.

**Verdict: PASS**

**Seat:** CODE-REV-S01-C1C2 · reviewer · claude-opus-5, fresh blind session · ticket `t_c7a758f6` · **round 1 of max 3**
**Under review:** CODE-S01-C1C2, `t_8d084df2`, clusters S01-C1 + S01-C2, commits `91a090ea` (C1) and `87b50e1e` (C2) on `slice/consent-s01`
**My worktree:** `.worktrees/rev-s01-c1c2/dialectical-engine`, detached at `87b50e1e`, `git status --porcelain` = **0 entries at entry and at exit**. `pnpm run generate:contract` run first, exit 0, tree unchanged.
**Findings:** 0 blocking · 5 non-blocking (N1–N5). Every N-finding names its CLASS and marks its remedy per COMMON §10.22. Per `heartbeat-reviewer` §3, non-blocking sets WHEN, never WHETHER: each carries a ticket line in §7.

---

## 1. Why PASS

The cluster pair delivers what the SPEC asks, and it survives hostile re-running:

- Both cluster commands are **verdict 0 on the worst of three runs, in both shell environments**
  (COMMON §10.16) — 12 runs total, no variance.
- **Every constant re-derives from the design**, by executing the design's own `tint()`/`mkCat()`
  rather than reading them (§3.3).
- **The twelve category strings deep-equal the design decoded**, in the design's order, with the
  correct codepoints and zero literal `\uXXXX` escapes (§3.4).
- **The four contrast pins reproduce exactly** from an independent WCAG 2.2 implementation of mine
  (§3.5) — the SPEC's one `UNVERIFIED` item is now measured, twice, by two parties.
- **File surface is exact**: 5 paths, all inside the packet's `allowed` list, nothing outside (§3.1).
- **The author's own handoff numbers all reproduced on the first attempt.** No claim in it was
  found overstated.

The five findings are about the **predicate and the perimeter**, not the implementation. Three are
packet/PLAN defects filed against the orchestrator (`heartbeat-reviewer` §1), not against the
worker who obeyed the packet.

---

## 2. Packet review (`heartbeat-reviewer` §1 — the packet is in my scope, and its author cannot review it)

I reviewed `.hermes/planning/consent-ui/packets/CODE-S01-C1C2.md` before the diff.

| Checked | Result |
|---|---|
| base commit `2b670d30` | ✅ `git merge-base 2b670d30 87b50e1e` → `2b670d30` |
| commits `91a090ea`, `87b50e1e`; HEAD `87b50e1e` | ✅ both present, C1 first, no amend |
| `:root` lines **5-97**, chamber **99-158** at base (COMMON §10.24) | ✅ measured on `2b670d30:…/globals.css` → `5::root {`, `97:}`, `99:html[data-mode="chamber"] {`, `158:}`. Exact. |
| review package "1049 lines" | ✅ `wc -l` = 1049 |
| every mandatory deliverable inside `allowed` | ✅ including the ADR, which the packet correctly adds to the PLAN's surface |
| the ADR filename constant vs `COMMON.md` §10.23 | ✅ `ADR-0021-consent-storage-contract.md`, and the packet correctly overrides the PLAN |
| packet paths resolve from the seat's cwd | ✅ |
| author's `SKILLS LOADED` vs the worker floor | ✅ in shape — see §5 |

**Packet defects found: N3, N4 below.** The author reported four itself; I confirmed all four and
promote two to numbered findings (the other two — the nested-backtick commit-message sentence and
the parenthetical embedded inside a path in `allowed` — are real hygiene defects, already recorded
in the author's handoff, and I endorse them without renumbering).

---

## 3. What I verified, and HOW — verbatim outputs

### 3.1 File surface and block discipline

```
$ git diff --name-only 2b670d30..87b50e1e
dialectical-engine/apps/ui/app/globals.css
dialectical-engine/apps/ui/lib/consent.ts
dialectical-engine/docs/architecture/01-decisions/ADR-0021-consent-storage-contract.md
dialectical-engine/tests/render/consent-storage.test.tsx
dialectical-engine/tests/unit/t9-mode-tokens.test.ts
```
Five paths, all in `allowed`. No-touch surface (`apps/api|packages|migrations|tools|apps/runner|apps/scheduler`): **EMPTY**.
Forbidden-for-this-cluster (`components/`, `layout.tsx`, `settings/page.tsx`, `tests/support/contrast.ts`): **EMPTY**.
`TEXT_TOKENS` / `LINE_TOKENS`: **untouched**; `expect(measuredRows).toBe(34)` still present ×1.
Registration request shape: added lines matching `register\(|adult_affirmed` = **0**.

`globals.css` block discipline — exactly one of each block, and **every hunk inside them**:
```
count of ^:root lines                 : 1        5::root {   109:}
count of ^html[data-mode="chamber"]   : 1      111:html[...]  174:}
$ git diff -U0 2b670d30..87b50e1e -- apps/ui/app/globals.css | grep -E '^@@'
@@ -12,0 +13,2 @@      @@ -29,0 +32,2 @@      @@ -55,0 +60,2 @@      @@ -78,0 +85,6 @@
@@ -105,0 +118,2 @@ html[data-mode="chamber"] {      @@ -120,0 +135,2 @@ html[data-mode="chamber"] {
```
New lines land at 13, 32, 60, 85 (inside `:root` 5-109) and 118, 135 (inside chamber 111-174).
Blocks grew +12 / +4 = **+16**, matching the stat. `grep -c 'consent-ui S01 ==='` = **0** — the S01
delimited block is correctly **not** opened here (C3 owns it).

### 3.2 The two cluster commands, ×3 from a `.sh` under `/bin/bash` AND ×3 inline (COMMON §10.16)

Commands copied verbatim from `PLAN.md`'s fenced blocks (`:658-677`, `:683-700`), never from the
table. Kits filed at `probes/code-rev-s01-c1c2-r1-cmd-c{1,2}.sh`.

**`CMD-C1` — script (`/bin/bash`), runs 1/2/3:**
```
S01-C1 verdict=0   summary:      Tests  2 failed | 7 passed (9)   hit-list: 1 (pinned .drawerScrim line: 1)   tsc ran: 1 exit 1, diagnostics outside the pin: 0
S01-C1 verdict=0   summary:      Tests  2 failed | 7 passed (9)   hit-list: 1 (pinned .drawerScrim line: 1)   tsc ran: 1 exit 1, diagnostics outside the pin: 0
S01-C1 verdict=0   summary:      Tests  2 failed | 7 passed (9)   hit-list: 1 (pinned .drawerScrim line: 1)   tsc ran: 1 exit 1, diagnostics outside the pin: 0
```
**`CMD-C1` — inline, runs 1/2/3:** identical, plus the term breakdown `n_fail=2 n_pin=2 n_inv=1 n_invfail=0` on every run.

**`CMD-C2` — script (`/bin/bash`), runs 1/2/3:**
```
S01-C2 verdict=0   summary:      Tests  6 passed (6)  files: Test Files  1 passed (1)   ADR Status:Proposed lines: 1, debateai.consent mentions: 4   tsc ran: 1 exit 1, diagnostics outside the pin: 0
S01-C2 verdict=0   summary:      Tests  6 passed (6)  files: Test Files  1 passed (1)   ADR Status:Proposed lines: 1, debateai.consent mentions: 4   tsc ran: 1 exit 1, diagnostics outside the pin: 0
S01-C2 verdict=0   summary:      Tests  6 passed (6)  files: Test Files  1 passed (1)   ADR Status:Proposed lines: 1, debateai.consent mentions: 4   tsc ran: 1 exit 1, diagnostics outside the pin: 0
```
**`CMD-C2` — inline, runs 1/2/3:** identical.

**THREE-RUN WORST CASE, AS I MEASURED IT: `S01-C1` worst = 0 · `S01-C2` worst = 0`**, in both
environments. The author's three-run tables are confirmed, figure for figure. The `t9` delta is the
BASELINE pair exactly (`2 failed`, both pinned, `n_pin=2`), the hit list is the single
`.drawerScrim` line, and the inventory test is present and passing (`n_inv=1`, `n_invfail=0`).

### 3.3 Token derivation — re-derived by EXECUTING the design, not reading it

Probe: `probes/code-rev-s01-c1c2-r1-design-derivation.mjs`. It loads `design-data.js` into a
`new Function`, calls the design's own `tint()` for both modes, **and cross-checks against the
values `mkCat()` itself computes for the Essential and Product-analytics records** — two independent
routes to the same numbers.

| Token | design `tint()` | design `mkCat()` record | shipped CSS (T / C) |
|---|---|---|---|
| `--ok-soft` | `rgba(62,122,78,0.28)` / `rgba(134,181,141,0.35)` | same | `rgba(62,122,78,.28)` / `rgba(134,181,141,.35)` |
| `--ok-edge` | `rgba(62,122,78,0.55)` / `rgba(134,181,141,0.55)` | same | `rgba(62,122,78,.55)` / `rgba(134,181,141,.55)` |
| `--muted-bg` | `rgba(110,103,92,0.1)` / `rgba(156,144,122,0.14)` | same | `rgba(110,103,92,.1)` / `rgba(156,144,122,.14)` |
| `--muted-border` | `rgba(110,103,92,0.4)` / `rgba(156,144,122,0.5)` | same | `rgba(110,103,92,.4)` / `rgba(156,144,122,.5)` |

**All four match.** The only difference is the alpha's leading zero — the design's JS template
literal renders `.28` as `0.28`, and SPEC R24 / PLAN S01-S01 explicitly mandate the leading-dot
form (`never 0.28`). `.28 === 0.28`. **This is compliance, not drift**, and I record it because a
naive string diff reports it as four failures.

The six mode-independent tokens are declared in `:root` only and in **neither** chamber block —
correct for `MODE_INDEPENDENT`:
```
--scrim = rgba(10,8,6,.42)  (in chamber? false)      --z-consent-bar = 45   (false)
--z-consent-scrim = 75 (false)   --z-consent-card = 76 (false)
--z-policy-scrim = 77  (false)   --z-policy-card = 78  (false)
```
`--scrim` re-derived independently against `turn-10-cookie-consent.html:49`:
`<div style="position:absolute; inset:0; background:rgba(10,8,6,.42);">`. **Exact.**
The five z-values match SPEC R08's table and the measured ladder.

### 3.4 The twelve category strings, diffed against the decoded design

My probe P6 deep-equals `COOKIE_CATEGORIES` against `cookieCats` evaluated from `design-data.js` —
**not** against the author's fixture. **PASSES.** Codepoints per field, measured:

```
cat0.detail  [U+00B7,U+00B7,U+2014]     cat1.description [U+2019]     cat1.detail [U+2014,U+00B7]
cat2.detail  [U+2014,U+00B7]            all others: ascii
literal six-char \uXXXX escapes in consent.ts: 0
```
P7 checks `locked`/`defaultOn` against `mkCat`'s own positional `(on, locked)` arguments at
`design-data.js:88-90` → `[[true,true],[false,true],[false,false]]`. **PASSES.** No shipped test
does this; the author's fixture restates the flags rather than deriving them.

### 3.5 The contrast pins — recomputed independently, not read

`tests/support/contrast.ts:3-5` does throw on any non-`#RRGGBB` argument, so the S01-S03 RED
premise is real. I reimplemented WCAG 2.2 luminance and the compositing rule from scratch in Python:

```
Terracotta --muted-bg over --core -> #EFECE7   (author pins #EFECE7)
  --muted #6E675C on #EFECE7 = 4.743   (author pins 4.743, floor 4.5)
Chamber    --muted-bg over --core -> #2A251F   (author pins #2A251F)
  --muted #9C907A on #2A251F = 4.833   (author pins 4.833, floor 4.5)
Toggle ON/OFF Terracotta: #3E7A4E vs #EFE9E0 = 4.246  (author pins 4.246, floor 3)
Toggle ON/OFF Chamber   : #86B58D vs #221D17 = 7.171  (author pins 7.171, floor 3)
```
**All four exact to three decimals.** The SPEC's one `UNVERIFIED` hand-over (§Token mapping) is now
measured by two independent parties. I endorse the author's decision to pin to three decimals rather
than to the floor: a floor-only assertion passes at 4.743 and at 20.0, and the PLAN's `accept` asks
for "four ratios that match these values".

### 3.6 My own mutants (built from the SPEC property, not from the author's patch)

| # | Mutant | Result |
|---|---|---|
| **REV-C1-a** | delete `--ok-soft`/`--ok-edge` from the **chamber block only** — a mode-bearing token present in one mode | **CAUGHT.** `verdict=1`, `Tests 3 failed | 6 passed (9)`. The guard genuinely enforces "the same mode-bearing key set in both modes"; the author's mutant B deleted a declaration outright, which is the weaker case. |
| **REV-C1-b** | `--scrim` → `rgba(10,8,6,.62)` **agreed in both the CSS and the test map** | **NOT CAUGHT.** `verdict=0`. This is the non-catch `PLAN.md:1115` *declares* for S01-S01, now demonstrated for a token the slice introduces rather than an inherited one. **Not a finding** — I re-derived the shipped value by hand against the artboard (§3.3), and V acceptance steps 6 and 13 cover `--scrim` and the z-ladder behaviourally. Recorded so no later lens re-files it. |
| **REV-T1** | `decidedAt: new Date().toISOString()` → `Date.now()` (a real TS2322) | typecheck arm **BLIND**; caught by the vitest arm's ISO regex. |
| **REV-T2** | an exported helper nothing calls, returning `decision.quality` as `string` (what C5's future wiring looks like) | **ESCAPES ALL THREE ARMS** → **N3**. |

Every mutant applied to a byte-identical `cp` backup and restored by `cp` + `md5 -q` equality;
`git status --porcelain` = **0** after each restore and at exit.

### 3.7 The seven SPEC-property probes I wrote

`probes/code-rev-s01-c1c2-r1-spec-properties.test.tsx` — measured at `87b50e1e`:
`Tests 3 failed | 4 passed (7)`. P1, P2, P4 fail → **N1, N2**. P3 (the ruled case), P5, P6, P7 pass.

### 3.8 Leakage — probed, not assumed

`vitest.config.ts:19` sets `fileParallelism: false`, so a leaked key survives into later files.
Run in **both orderings** in one worker against the BASELINE-pinned suite:
```
consent-storage + auth-flow-integration : exit 0   Test Files 2 passed (2)   Tests 23 passed (23)
auth-flow-integration + consent-storage : exit 0   Test Files 2 passed (2)   Tests 23 passed (23)
```
23 = 6 + 17. **No leakage in either direction**, and the `Test Files 2 passed (2)` arm confirms
COMMON §10.13's silent-path-drop did not occur. `auth-flow-integration` holds its BASELINE 17/17.

### 3.9 The ADR — transcribes, invents nothing, and *nearly* matches the code

I diffed `ADR-0021-consent-storage-contract.md` against `SPEC.md` R01-R05/R23/R28 and
`DECISIONS.md` §Storage / §Tokens-and-copy. **Every one of the nine rows in its "Options considered"
table traces to a `DECISIONS.md` line** (three keys per category; the packed string; the versioned
key name; `firstDecidedAt`+`updatedAt`; the epoch integer; carrying booleans forward; omitting
`essential`; keeping the surface up on a failed write; inlining the category copy). Decisions 1-6,
the five Consequences and the Constraints table all trace to SPEC requirements. **No third source,
and no new decision** — the step's own bar. House shape followed (`# ADR-0021 — …`, `| Field | Value |`
with `| **Status** | **Proposed** — V ratifies.`, `## Context` / `## Decision` / `## Consequences`).

One mismatch, folded into **N1**: the ADR's Decision 3 restates R03 verbatim ("absent, unparseable,
not an object, or **missing** any of the five members") and therefore does **not** describe the
predicate the code actually implements.

---

## 4. Findings

### N1 — the validity predicate for a stored record is stated three different ways, and `readConsent()` accepts two shapes R01 forbids

**CLASS:** *a stored record that contradicts R01's declared shape is treated as a valid decision.*
**File:** `apps/ui/lib/consent.ts:255-265` (`isDecision`), with `SPEC.md` R01/R03 and
`ADR-0021…md` "Decision 3" as the other two statements of the same rule.

Three texts, three predicates:

| Source | What it says a valid record is |
|---|---|
| `SPEC.md` R01 | "exactly these five members and no others"; `decidedAt` is "the UTC ISO-8601 string produced by `new Date().toISOString()`" |
| `SPEC.md` R03 / ADR Decision 3 | rejects "absent, unparseable, not an object, or **missing** any of the five members" |
| `isDecision()` | `v===1` ∧ `essential===true` ∧ `typeof quality==='boolean'` ∧ `typeof analytics==='boolean'` ∧ `typeof decidedAt==='string'` |

The author swept member (d) of this class — `essential` present but not `true` — disclosed it, and
the orchestrator ruled the conservative reading stands. **That ruling was not carried to the rest of
the class** (`heartbeat-protocol` §2.2: fix the CLASS, not the instance). Two members remain open:

**Concrete inputs → wrong outcome** (probe P1, P2, `Tests 3 failed | 4 passed (7)`):

```
P1  localStorage['debateai.consent'] =
      {"v":1,"essential":true,"quality":true,"analytics":false,
       "decidedAt":"2026-01-01T00:00:00.000Z","rogue":"injected"}
    readConsent() -> {"v":1,"essential":true,"quality":true,"analytics":false,
                      "decidedAt":"2026-01-01T00:00:00.000Z","rogue":"injected"}
    R01: "exactly these five members and no others". A six-member record is accepted, and the
    rogue member is handed to the caller inside a value typed `ConsentDecision`.

P2  decidedAt = "yesterday"                -> ACCEPTED as a valid decision
    decidedAt = ""                          -> ACCEPTED
    decidedAt = "1788723500905"             -> ACCEPTED
    decidedAt = "2026-13-45T99:99:99Z"      -> ACCEPTED
    R01: decidedAt is "the UTC ISO-8601 string produced by new Date().toISOString()".
    On a consent record the timestamp is the evidentiary member: a record whose `decidedAt`
    cannot be parsed cannot answer "when was consent given".

P3 (control) essential:false -> null. The ruled case IS correctly implemented. PASSES.
```

**Why NON-blocking.** Nothing in the product writes this key but this module — the ADR's own last
consequence says so, and a future `v:2` writer is rejected by the version check before the member
check. So no product path reaches either shape today; they arrive only from DevTools, a hand edit,
or an extension. Every hook the frozen SPEC states is satisfied. The cluster's deliverable is
correct for every specified call.

**Remedy — `BINDING (measured: probes/code-rev-s01-c1c2-r1-spec-properties.test.tsx, P1 and P2,
`Tests 3 failed | 4 passed (7)` at 87b50e1e)`.** The CLASS binds; the exact wording below is the
shape I measured, and an author who refutes it does so with pasted output (COMMON §10.22):

1. Extend `isDecision` to the whole class — `Object.keys(record).length === 5` and a
   `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` test on `decidedAt` (the regex the SPEC's own
   R01 hook already names, and which `consent-storage.test.tsx:535` already defines as `ISO_UTC_MS`).
2. Add the two cases to `consent-storage.test.tsx`'s R03 table, RED first.
3. Restate the predicate **once** in the ADR's Decision 3 so the repo-wide record matches the code.

**Does the SPEC text need a V row? YES — and one row closes all three members at once.** `SPEC.md`
is FROZEN, so this cannot be an edit; it is a `SPEC-v4` or a V row, and a V row is cheaper. Proposed
text, ready to paste:

> **Row V-8 (proposed by CODE-REV-S01-C1C2, r1).** *Question:* R01 states the record's shape
> ("exactly these five members and no others"; `decidedAt` is `new Date().toISOString()`'s output)
> and R03 states the rejection rule ("absent, unparseable, not an object, or **missing** any of the
> five members"). The two do not compose: a record with a sixth member, or with a malformed
> `decidedAt`, satisfies R03 and violates R01, and the ADR restates only R03's half.
> *Default (binding until V rules), extending the orchestrator's 2026-09-06 ruling from its instance
> to its class:* **a stored value is a decision iff it parses to a non-array object with exactly the
> five members, `v === 1`, `essential === true`, `quality` and `analytics` boolean, and `decidedAt`
> matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`. Anything else re-asks.** *Cost:* ~4 lines
> in `isDecision`, 2 test cases, 1 ADR sentence. *Counter:* a stricter read re-asks a visitor whose
> record was corrupted by something outside our control — which is the conservative reading of
> consent, and the same reading R02 and R03 already take.

### N2 — `decisionFor`'s optional `toggles` turns a C5 wiring mistake into a type-legal silent denial of consent

**CLASS:** *an optional parameter whose absence is indistinguishable from a deliberate negative answer.*
**File:** `apps/ui/lib/consent.ts:310-316`.

```
P4  decisionFor("save-choices")            // toggles omitted — legal TypeScript
    -> {"v":1,"essential":true,"quality":false,"analytics":false,
        "decidedAt":"..."}                 // a full DENIAL, silently
```
`toggles?.quality === true` coerces `undefined` to `false`. R04 row 4 says `Save choices` writes
"current toggle" for both members — it has no reading under which an *absent* toggle set means
"off". C5 wires this call; if it forgets the argument, a visitor who deliberately left Model quality
telemetry ON has that recorded as OFF, and **nothing catches it**: not the root typecheck (blind to
this file — N3), not the `apps/ui` typecheck (the call is type-legal), not `CMD-C2` (which never
calls it that way). V acceptance step 7 *would* catch it, which is why this is non-blocking rather
than blocking — but it would catch it three clusters later, in V's own time.

**Why NON-blocking.** Every call the SPEC specifies is correct; the defect is latent and lands in a
future cluster. Flagging it now is the cheap moment.

**Remedy — `ADVISORY`.** The shape is the author's or ARCH-S01's call; I measured the defect, not
the fix. The cheapest form that makes the compiler the guard is a discriminated argument, e.g.
`decisionFor(c: "accept-all" | "essential-only"): ConsentDecision` plus
`decisionFor(c: "save-choices", toggles: ConsentToggles): ConsentDecision` as overloads, so
`decisionFor("save-choices")` stops compiling. An accepted alternative is to keep the signature and
add a C5-side pin; either way the class is "absence must not read as denial", and that binds.

### N3 — PACKET/PLAN: `CMD-C2`'s typecheck arm cannot see either file the cluster creates, and returns verdict=0 with a live type error in `consent.ts`

**CLASS:** *a cluster guard whose arm structurally cannot observe the cluster's own deliverable.*
**Filed against:** the orchestrator's packet and `PLAN.md:683-700` (`CMD-C2`), **not** against
CODE-S01-C1C2, which obeyed the packet, ran the compensating check itself, and disclosed the hole
as its unexpected finding 1. This is the confirmation `COMMON.md` §10.30 asks for.

**This is the author's concern 1, and it is CONFIRMED — by measurement, in the failure direction.**

```
$ pnpm exec tsc --noEmit --listFiles      # root project, 1468 files
apps/ui/lib/consent.ts          -> 0
tests/render/consent-storage.test.tsx -> 0
any tests/render/*.tsx at all   -> 0
other apps/ui/lib/*.ts reached  -> 17
```
Mechanism: root `tsconfig.json` **excludes** `apps/ui` and its `include` takes `tests/**/*.ts`, not
`.tsx`. `exclude` prunes the `include` glob, **not the transitive import graph** — so 17 other
`apps/ui/lib/*.ts` files are still pulled in by `tests/**/*.ts` importers and the arm reports a
healthy "0 diagnostics outside the pin". `consent.ts` is outside the 17 **only because its sole
importer is a `.tsx` file.** That is why the hole is invisible to inspection.

**Measured in the failure direction** (`probes/code-rev-s01-c1c2-r1-typecheck-blindspot.sh`) — a
type error of exactly the shape C5's future wiring will produce:

```
ARM 1  root pnpm typecheck  -> exit 1, diagnostics OUTSIDE the pin = 0        <-- CMD-C2's arm: BLIND
ARM 2  cd apps/ui && npx tsc --noEmit -p tsconfig.json
       -> lib/consent.ts(202,3): error TS2322: Type 'boolean' is not assignable to type 'string'
ARM 3  S01-C2 verdict=0   summary: Tests 6 passed (6)  files: Test Files 1 passed (1)
       ADR Status:Proposed lines: 1, debateai.consent mentions: 4
       tsc ran: 1 exit 1, diagnostics outside the pin: 0
```
**`CMD-C2` PASSES with a live TS2322 in the file the cluster exists to produce.**

**Why NON-blocking.** The delivered artifact *is* type-clean: I ran the compensating check on the
committed tree — `cd apps/ui && npx tsc --noEmit -p tsconfig.json` → **exit 0, 0 diagnostics**, with
`--listFiles | grep -c 'apps/ui/lib/consent.ts'` = **1** confirming membership. The defect is in the
guard, not in the code, and it produced no defective artifact here.

**Remedy — `BINDING (measured: probes/code-rev-s01-c1c2-r1-typecheck-blindspot.sh; ARM 1 = 0 outside
the pin, ARM 2 = TS2322, ARM 3 = verdict=0)`.** Two parts:

1. **`COMMON.md` §10.30's scope is off by one cluster.** It reads "from C3 on"; **C2 is already
   affected**, as measured above. Correct it to name the rule rather than a number: *the arm applies
   to every cluster whose deliverable `pnpm exec tsc --noEmit --listFiles` does not list.* One
   command decides it; a cluster number needs a correction later, which is what happened.
   For C2 the arm is **retroactively satisfied** — the author ran it, exit 0 — so no rework follows.
2. Add the arm as a **captured, exit-code-checked** sub-command (COMMON §10.19 — `tt=$?` plus a
   "proves it ran" term), not a bare invocation, to `CMD-C3`…`CMD-C7`.

**Residual the remedy does NOT close, and the author is right to name it:** `tests/render/*.tsx` is
in **no** TypeScript project at all — root excludes `.tsx`, and `apps/ui`'s project does not reach
outside `apps/ui` (`--listFiles | grep -c consent-storage.test.tsx` = **0** in *both* projects).
Render-test types are checked by nothing. Repo-wide, larger than this mission; ticket it separately.

### N4 — PACKET/PLAN: `PLAN.md` names two different ADR paths, and the guard reads the path from the document that is wrong about it

**CLASS:** *a deliverable path stated in more than one place, one of which is stale.*
**File:** `PLAN.md:1102` (§DDD) says `docs/architecture/01-decisions/ADR-consent-storage-contract.md`
— **unnumbered** — while `PLAN.md:284` (S01-S47), `:598` (the cluster row), `:686` (`CMD-C2`'s
`cat`) and `:997` (§Boundaries) all say `ADR-0021-consent-storage-contract.md`. Confirmed by grep;
the author reported it and I verify it stands.

The author's own observation is the sharp part and I promote it: **`CMD-C2` `cat`s the path it is
*given*, so a seat that had taken §DDD's name would have produced a differently-named file and the
guard would have reported `n_adrst=0` — caught, but only because that term happened to exist.** A
guard cannot detect a path error using the document that is wrong about the path.

**Why NON-blocking.** The packet's ORCHESTRATOR CORRECTION governs and the author followed it; the
right file exists at the right path.

**Remedy — `ADVISORY`.** Correct `PLAN.md:1102` to a pointer at `S01-S47` rather than a second
statement of the name, at the next lawful ARCH edit (`COMMON.md` §10.23's standing rule).

### N5 — `ADR-0021` is absent from the ADR register it exists to be findable in

**CLASS:** *a repo-wide artifact that ships outside the index whose purpose is to find it.*
**File:** `docs/architecture/01-decisions/README.md:70-89`.

```
$ grep -c 'ADR-0021' docs/architecture/01-decisions/README.md
0
$ ls docs/architecture/01-decisions/ | tail -3
ADR-0018-deployment-topology.md   ADR-0021-consent-storage-contract.md   README.md
```
19 ADR files on disk, 18 register rows. The whole argument of `S01-S47` is that this contract
outlives the mission and must not be documented only inside a closed mission's folder — an unlisted
ADR reintroduces exactly that failure one level up.

**Why NON-blocking.** The ADR itself is correct and complete; the register is not in any coding
seat's `allowed` list, correctly, and no step assigns the row to anyone.

**Remedy — `ADVISORY`** (whose it is, is the orchestrator's call): add the register row, either as
an orchestrator edit or as a step in the last S01 cluster. The same gap will exist for S02's
`ADR-0022-shared-modal-semantics.md` — **fix the class now, once, for both.**

---

## 5. The author's `SKILLS LOADED`, checked against the worker floor (`heartbeat-reviewer` §5)

Declared: `superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker,
superpowers:test-driven-development, superpowers:verification-before-completion`, plus
`systematic-debugging` — *"not loaded this session, not needed: nothing broke"* — and
`receiving-code-review` — *"not applicable, this is round 0"*.

**Shape: correct.** The worker floor's two unconditional skills are both present; the two
conditional ones (`systematic-debugging` on *any bug*, `receiving-code-review` on *rework*) are
declared in COMMON §10.9's honest form, and both conditions genuinely did not fire: every RED in the
handoff is a designed TDD RED that went GREEN on first implementation, and this is round 0.
I verified each RED's *premise* is real — `tests/support/contrast.ts:3-5` does throw
`TypeError: Expected an #RRGGBB colour` on any `rgba(` argument, and the module genuinely did not
exist before `87b50e1e`.

**`UNVERIFIED` by me, by construction:** whether the five named skills were *loaded* rather than
named. §10.9 assigns that transcript grep to the orchestrator; a reviewer cannot read another seat's
transcript. See my self-report §4.4 — this duty is currently assigned to a seat that structurally
cannot discharge it.

**Self-report bar:** filed at `.hermes/reports/consent-ui/agent-reports/CODE-S01-C1C2.md`, 280 lines,
with priced findings, near-misses, dead ends, packet defects and an explicit ruling request. **Meets
the bar** — it is a case file, not a diary.

---

## 6. What I did NOT verify — so the next lens knows the gaps

1. **That the author's five named skills were loaded rather than named.** Structurally out of reach
   (§5). Orchestrator's grep.
2. **That the RED frames were WATCHED, in the order claimed.** I verified every RED's premise is
   real; commit history cannot prove the ordering of a live session.
3. **Stacking behaviour of the five z-tokens.** jsdom computes no stacking. → V acceptance step 13.
4. **Real-bundle module identity** for `requestPreferences` / `subscribeToPreferenceRequests`. jsdom
   mounts one module registry, so a double-instance failure is invisible here. → V steps 9-10. The
   PLAN calls this the single largest thing it cannot prove and I agree.
5. **Whether a decision survives in React state after a refused write.** The suite asserts *no
   throw*, a weaker claim. `UNVERIFIED beyond the no-throw property`, as the PLAN already states.
6. **Any rendered component, and any a11y claim.** C1 and C2 create **no component** — `NOT
   APPLICABLE`; my packet's §2 charges "render the component in jsdom" and "a11y claims probed, not
   read" are template charges this cluster pair cannot answer. Substituted: a jsdom read of both
   token blocks via the shipped `tokenContract()` harness, plus my own seven-property suite.
7. **`--scrim` and the five z-values against a shipped assertion.** None exists (REV-C1-b proves it);
   I re-derived them by hand instead (§3.3). Covered behaviourally by V steps 6 and 13.

---

## 7. Tickets these findings require (`heartbeat-reviewer` §3 — non-blocking sets WHEN, never WHETHER)

| # | Ticket | Owner | When |
|---|---|---|---|
| N1 | Extend `isDecision` to R01's whole shape (5-member cardinality + ISO `decidedAt`); 2 RED-first cases; 1 ADR sentence; **and route proposed row V-8** | CODE-S01 (a later cluster or a C2 follow-up) + orchestrator for the V row | before the slice's Grok gate |
| N2 | Make `decisionFor("save-choices")` unable to compile without toggles, or pin it C5-side | ARCH-S01 to choose the shape, C5's coding seat to land it | with C5 |
| N3 | Correct `COMMON.md` §10.30's scope from "from C3 on" to the `--listFiles` rule; add the arm as a captured, exit-checked sub-command to `CMD-C3`…`CMD-C7`. **Separate ticket:** `tests/render/*.tsx` is in no TS project | orchestrator | before C3 is dispatched |
| N4 | `PLAN.md:1102` → pointer at `S01-S47`, not a second path statement | next lawful ARCH edit | next ARCH touch |
| N5 | Register rows for `ADR-0021` **and** `ADR-0022` in `docs/architecture/01-decisions/README.md` | orchestrator | before the slice closes |

Round 1 of max 3. This verdict is a PASS, so no rework round opens and no V DECISIONS PACKET row is
required by the cap — the V row in N1 is a *content* row, not a round-4 escalation.

---

## 8. Predictions (falsifiable evidence that blindness held)

I have read no other lens. What I expect the others got wrong, and what I would check first:

1. **I expect at least one other lens to have reported the typecheck blind spot as CONFIRMED
   without measuring it in the failure direction** — quoting `tsc --listFiles | grep -c` = 0 and
   stopping there. That proves the *file* is unseen; it does not prove the *guard* passes. The
   difference matters, because a first mutant (`decidedAt: Date.now()`) IS caught by the vitest arm,
   which makes the hole look theoretical. **Check first: does their verdict contain a `CMD-C2`
   verdict=0 line captured with a type error present? If not, their confirmation is weaker than it
   reads.**
2. **I expect the class sweep of the `essential: false` ruling to be the most likely miss.** The
   orchestrator handed every reviewer the ruling, and a ruling handed to you is the easiest thing to
   check and tick. The question the ruling *implies* — "what else in R01 does the predicate not
   enforce?" — requires writing a probe rather than reading the code. **Check first: does their
   verdict mention a six-member record or a malformed `decidedAt`?** If it says only "the ruling is
   correctly implemented", it stopped at the instance, which is the §2.2 failure the protocol names.
3. **I expect the four token values to be reported as verified by reading `design-data.js` rather
   than by executing it**, and I expect nobody else to have cross-checked `locked`/`defaultOn`
   against `mkCat`'s positional `(on, locked)` arguments — the shipped test restates those flags, it
   does not derive them. A reader who diffs the strings by eye will also probably not notice that the
   design's `tint()` emits `0.28` where the SPEC mandates `.28`, and may either miss a real drift or
   file a false one.
4. **I expect N2 (`decisionFor`'s optional `toggles`) to be missed entirely.** Nothing points at it:
   the author did not disclose it, no SPEC hook covers it, `CMD-C2` is green, both typecheck arms are
   satisfied, and it only bites in a cluster that does not exist yet. It surfaces only from writing
   probes against R04's *words* ("current toggle") rather than against the author's four test cases.
5. **I expect nobody to have run the leakage check in both orderings.** The author measured it one
   way and reported it convincingly; the cheap independent version is two files in one worker, twice.
6. **Where I am most likely wrong myself:** rating N1 non-blocking. If a later lens argues that a
   GDPR consent record accepting an unparseable `decidedAt` is blocking regardless of reachability,
   that is a defensible read and I would want the argument. My reasoning is in §4/N1: no product path
   writes such a record, and every hook the frozen SPEC states is satisfied.

---

`comments read through: 2` (on `t_8d084df2`) · `comments read through: 1` (on `t_c7a758f6`, my own CLAIM)
