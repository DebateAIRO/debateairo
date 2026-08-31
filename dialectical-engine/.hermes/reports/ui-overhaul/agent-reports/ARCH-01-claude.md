# SELF-REPORT — ARCH-01 (Claude Opus 5), ui-overhaul architecture seat

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

**Seat:** ARCH-01, ticket `t_09a09884`, board `ui-overhaul`. One round, no
rework. Wrote 8 `PLAN.md`, 8 `DECISIONS.md`, 12 files under
`docs/missions/ui-overhaul/architecture/`, this report. Zero SPEC edits, zero
product code, zero git commands, zero sub-delegation.

---

## 1. THE BODY — the defect that would have killed this mission

**12 of the 78 "render pins" the SPECs name test an application this mission
does not ship.**

`tests/render/web-auth-login.test.tsx`, `web-auth-sign-up.test.tsx` and
`web-auth-enrollment.test.tsx` import from `web/`, not `apps/ui`. Measured:

```
web-auth-enrollment.test.tsx   apps/ui:0  web:4
web-auth-login.test.tsx        apps/ui:0  web:2
web-auth-sign-up.test.tsx      apps/ui:0  web:1
```

T7's and T8's frozen SPEC acceptance sections name these files as the ones to
update. A Codex seat following that instruction would have:

1. added `WELCOME BACK` to `web-auth-login.test.tsx` — **genuine RED**;
2. edited `web/components/LoginFlow.tsx` to make it pass — **genuine GREEN**;
3. filed textbook RED→GREEN evidence;
4. shipped a mission where the suite is green, the report is honest, and the
   product a user opens is **unchanged**.

Every gate in the spine would have passed. Independent review would have passed
— a reviewer checking "did the test go red then green" gets yes. The
product-truth gate is the only thing that catches it, at C8, after eight slices
of work built on the same false floor.

**CAUSE:** the repo has two Next applications (`apps/ui` = `dialectical-engine-v2ui`,
the serving tree; `web` = `dialectical-engine-web`) with parallel `page.tsx`,
`login`, `settings`, `LoginFlow`, `TopBar`. `INSTRUCTIONS.md` correctly pins
`apps/ui`. But nothing in the requirements chain checked **which tree each named
pin file actually imports**, because the SPECs name test files by their
human-readable topic ("web-auth sign-up tests") and the topic is identical in
both trees. The name `web-auth-*` even reads as a description of the auth
domain, not as a path prefix.

**PRICE IF IT HAD SHIPPED:** two slices (T7, T8) rebuilt from scratch, plus the
credibility cost of a mission whose evidence chain was formally perfect and
substantively empty. Conservatively 2 full rework rounds across 8 clusters.

**PRICE TO FIND IT:** about four minutes, once I asked the right question. The
right question was not "which files do the SPECs name" but **"which tree does
each named file import"** — one `grep -c` per file.

**THE UPGRADE:** in a repo with more than one application tree, every
requirements artifact that names a test file must record the **import target**
beside the path, and intake must run a one-line check that every named pin
resolves into the serving tree. Cost: one command. It would also have caught
this at REQ time instead of ARCH time.

---

## 2. WHAT I NEARLY GOT WRONG — three, all the same shape

### 2a. A loose matcher that under-reported by 12 files

I swept for standing tests that read `apps/ui` **as source text** with
`grep -c "readFileSync"`. Answer: **5 files**. I wrote it into the architecture
doc. Then, reading `tests/architecture/s8-publication-contract.test.ts` for an
unrelated reason, I saw `import { readFile } from "node:fs/promises"`.

The real answer is **17 of 44**. I had understated the most fragile surface in
the mission by 240%.

`readFile` vs `readFileSync` is exactly the "loose matcher" trap already recorded
in `.hermes/TOOLING-TRAPS.md` — *"match on the identifier that is actually
unique"*. I had read that file. I still did it. **Reading a trap does not
prevent it**, which is the single most useful thing I learned this round, and
the file itself already says so.

**THE UPGRADE:** a sweep should be expressed as a **regex over the concept**
(`\breadFile(Sync)?\(`), never a literal over one spelling — and the sweep should
be re-run and its count re-quoted at the moment it is written into the artifact,
not remembered from ten tool calls earlier.

### 2b. A self-review that printed "clean" without running

My placeholder/identifier self-review used
`F="a/*.md b/*.md"; grep -n PATTERN $F`. zsh passed the whole string as one
literal filename. ugrep printed a *warning* to stderr and exited non-zero, my
`|| echo "  clean"` fired, and I got:

```
=== 1. placeholder scan ===
  clean
```

**A self-review that cannot fail is not a self-review.** This is TOOLING-TRAPS'
*"'Ran and failed' is not the same as 'ran'"* in a new costume, and it is the
second time in one session I reproduced a trap I had read.

**THE UPGRADE:** any check whose failure mode is "prints clean" must first print
`N` — the number of files it actually opened. My corrected run opens with
`files under review: 28`. If that line reads `0`, the "clean" below it is a lie
and you can see it.

### 2c. Nearly designing around a limitation that does not exist

I probed jsdom, found `getComputedStyle(el).background` returns the literal
`"var(--bg)"` and `.backgroundColor` returns transparent, and concluded that
token verification needed a static CSS parser — a whole new mechanism, written
from scratch, for eight slices to share.

Then I probed one level further:
`getComputedStyle(documentElement).getPropertyValue("--bg")` returns `#F9F6F1`,
and setting `data-mode="chamber"` re-cascades it **live**. jsdom honours
attribute-selector cascade for custom properties perfectly. And
`tests/unit/pda-s03-keyboard-accessibility.test.ts` was **already** injecting the
real `globals.css` into jsdom and reading computed style — the pattern shipped
months ago.

I was one probe away from writing a bespoke CSS parser that the repo did not
need. **PRICE AVOIDED:** a new test-infrastructure module, its review, and the
maintenance of a second way to read the same stylesheet.

**THE UPGRADE:** when a probe says "the tool cannot do X", probe the adjacent
capability before designing around the gap — and grep the repo for anyone
already doing X. The answer here was in a file I had already opened.

---

## 3. DEAD ENDS — recorded so nobody re-derives them

1. **`apps/ui/app/tokens.css` imported from `globals.css`.** The obvious shape.
   Fatal: jsdom does not follow `@import`, and a standing test injects
   `globals.css` **by path**. A separate token file is invisible to that test and
   to every token test built on it — the values read as empty and the assertions
   pass vacuously. This is precisely the "orphan `tokens.css` = RED" failure the
   T9 SPEC warns about, arriving through the harness rather than the browser.
   Tokens go at the top of `globals.css`. (ADR-001)
2. **Asserting resolved colours via `getComputedStyle(el).backgroundColor`.**
   Returns `rgba(0, 0, 0, 0)` for any `var()`-valued property in this repo's
   jsdom. Such an assertion can only pass by accident. Use
   `getPropertyValue('--token')` on the document element. (ADR-006)
3. **"Gold is reserved for reasoning & verdict" read as mode-independent.** The
   design's own `accentsFor(dk)` gives reasoning `#3D5A80` (slate blue) in
   Terracotta and gold only in Chamber. The closing note describes Chamber. A
   coder who reads only the note paints light-mode REASONING chips gold.
4. **Trusting the mission compass's palette.** `INSTRUCTIONS.md` lists cream
   `#E7E2D8` / `#f0eee6` and ink `#111111`. The first two are the *design
   document's own page and stage chrome*; the third does not occur as a colour
   anywhere in the rendered export. The real palette is a 16-key token function
   on line 388 of the original bundle.

---

## 4. WHAT REPEATEDLY COST TOKENS

| Cost | Amount | Cause | Fix |
|---|---|---|---|
| Reading the spine | 2006 lines, ~4 large reads | `debateai-heartbeat-protocol.md` is the mandated first read and is 106 KB. Perhaps 15% of it was actionable for an architecture seat: §7 feedback edges, §10 caps, the TDD/DDD laws, v3.3.0 items 11–16. The rest is router and verifier law I cannot act on. | The skill split already exists and works — `heartbeat-architecture` is 87 lines and was worth every one. The **spine** should carry a per-role index at the top: "ARCHITECTURE: read §5.5, §7, §10, §11, v3.3.0 items 11–16." The role contract routes to a skill; nothing routes *within* the spine. |
| The design bundle | 1.28 MB, one line | `design-document-original.html` is a single 1.28 MB line. Reading it was impossible; I found the entire token system with `awk 'NR==388' \| tr '\\' '\n' \| grep -nE "const tokensFor"` — about 300 bytes of output that settled the whole token deliverable. | **The token map should have been extracted at REQ time.** A 16-key colour function is requirements-grade information; leaving every downstream seat to re-mine a 1.28 MB minified line is a cost multiplier. Ship `design-tokens.json` beside the design document. |
| `cd` drift in Bash | 4 failed calls, ~2 min | The Bash tool persists working directory across calls. I `cd`-ed into the design directory and the next three relative-path calls failed, one of them silently writing a file to the wrong directory before I caught it. | Never `cd`. Use absolute paths, or `cd <abs> && …` in one statement with the whole body inside the `&&` chain. |
| Re-deriving what shipped | moderate | I spent real effort designing card anatomy, connectors, view toggles and set-aside behaviour before discovering `Thread`/`Split`/`Tree`/`Map`, `Show set-aside paths`, `↻ Regenerate`, `ROLE_PALETTES` → `var(--pro-line)`, and a 69-token `:root` block all already ship. | **Read the target files before reading the design.** I did it in the other order. An "already true, do not rebuild" inventory belongs at the top of every re-skin mission's compass. |

**The single biggest saving I found:** `apps/ui/app/globals.css` already has a
semantic token layer — 69 custom properties, 521 `var()` consumers, 120 literals.
The overhaul is a **redefinition** of that layer plus one dark-mode block, not a
new design system. That one fact turns "restyle 8 screens" into "rewrite ~100
lines of CSS variables, then fix 120 literals", and it is why the
test-migration column has **zero REPLACE** entries.

---

## 5. WHERE THE PACKET WAS UNCLEAR — exactly

1. **"tests/render/** (72 tests, 18 files)".** Measured: **78 tests**, 18 files
   (`vitest list tests/render/`). A stale constant. It cost nothing because I
   measured it, but a seat that quoted it into an acceptance would have shipped
   an unmeetable count.
2. **"the per-cluster verification command confirmed runnable" (§2.8) vs
   `heartbeat-architecture` §4 "you run no product tests".** Direct tension. I
   resolved it by using `vitest list` (enumerates without executing test bodies)
   and `command -v` — which proves the command resolves and the paths exist
   without running product tests. **The packet should say which form of
   "confirmed" it wants.** I have marked every command's *colour* as UNVERIFIED
   on purpose; that is the worker's RED-before-GREEN evidence, not mine.
3. **The planning-graph gate is unreachable from my contract.**
   `heartbeat-architecture` §2 requires a mission graph at
   `.hermes/reports/<mission>/mission-graph.svg`, and spine v3.2.0 item 5 makes
   V's yes on that image **gate programming**. My §3 `allowed` list contains
   `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md` and nothing else
   under `.hermes/reports/`. I did not write it — crossing a file contract to
   satisfy a skill is still crossing a file contract. **`dispatch-order.md`
   contains the whole graph in table form** (32 clusters, 6 waves, per-lane write
   surfaces, merge order); rendering it as SVG needs one line added to some
   seat's `allowed`. Flagging rather than silently skipping, per §2.7.
4. **Superpowers' `brainstorming` HARD-GATE vs the One-Prompt Machine law.**
   `brainstorming` forbids any implementation action until "your human partner
   has approved". The spine forbids an architecture node from addressing V
   outside the design-question surface, and the packet authorizes me to write.
   I read the peer-review diamond as the approval gate and proceeded, routing
   the genuinely V-owned choices to `open-questions.md` with defaults. **This
   collision will recur for every seat that loads `brainstorming`**, and the
   protocol should say so once instead of each seat re-adjudicating it.

---

## 6. HOW TO MAKE THE CODING MORE EFFICIENT

1. **Freeze class names and `data-*` attributes at ARCH time, in writing.** This
   single rule is why 32 of the 44 standing test files need no edit (12 RETARGET,
   32 KEEP, 0 REPLACE). A re-skin that
   renames classes converts every standing assertion into rework, and the seat
   doing the renaming is never the seat that pays.
2. **Make the verification mechanism part of the plan, not the coder's problem.**
   `tests/support/tokenContract.ts` and `tests/support/contrast.ts` are written
   ONCE, by the foundation cluster, with signatures fixed in an ADR. Eight slices
   consume them. Without that, eight seats each invent a way to assert "the mode
   toggle works", and six of those ways will be `getComputedStyle().background`,
   which cannot work here.
3. **Ask "which standing tests READ what this cluster WRITES" for every cluster.**
   Write-surface disjointness answers "will two seats collide". It does not
   answer "will one seat break something that watches it". Those are different
   questions and TOOLING-TRAPS already records a mission losing a round to the
   second one. Every command in `dispatch-order.md` carries its slice's
   regression set for exactly this reason.
4. **One writer for the token file, first, alone.** 32 clusters against a
   4080-line stylesheet with two seats editing `:root` is the one collision this
   mission cannot absorb.
5. **Name the serial chains explicitly.** Four clusters write
   `LoginFlow.tsx`; three write `app/page.tsx`; two each write
   `DebateCanvas.tsx` and `NodeDetailDrawer.tsx`. Each is ordered with a stated
   reason. A dispatch order that only lists waves silently invites parallel edits
   to the same hunk.

---

## 7. THE ONE-PROMPT MACHINE — five upgrades, cheapest first

1. **Intake asserts that every named test file resolves into the serving tree.**
   One command. Would have caught §1 at REQ time, one loop earlier, at a
   fraction of the cost. *This is the highest-value item in this report.*
2. **Every counted claim in a packet carries its command.** "72 tests, 18 files"
   should read "78 tests, 18 files (`vitest list tests/render/`, 2026-08-31)".
   A number with a command attached is re-derivable and ages loudly; a bare
   number ages silently and gets quoted into an acceptance.
3. **Every sweep reports `N of N` with N measured *at write time*.** Not
   remembered from earlier in the session. Both of my near-misses (§2a, §2b)
   were counts that were stale or never computed, and both printed a
   confident-looking number.
4. **Requirements ships machine-readable design facts.** A `design-tokens.json`
   extracted once at REQ time replaces N seats independently mining a 1.28 MB
   minified line, and removes the class of error where the compass paraphrases a
   palette (§3.4) and every downstream seat inherits the paraphrase.
5. **Add a per-role index to the spine.** The skill split fixed the role
   *contracts*; the 2006-line spine is still read whole by every seat. Ten lines
   at the top mapping role → sections would cut the mandatory read by most of
   its length without removing a single rule.

---

## 8. WHAT WENT WELL — so it is repeated

- **The three-file read order gate worked.** Reading the architecture contract
  before touching anything is why `PLAN.md` has no line cap in my output, why
  every DECISIONS row names who ruled, and why I did not edit a frozen SPEC when
  I found four things wrong with them.
- **`heartbeat-architecture` §3 (refute your own plan) changed the output.**
  Writing "and one mutant it would NOT catch" for every cluster forced me to
  admit the contrast cluster does not cover `--muted` on `--con-bg`, and that
  `T1-C3-1` asserts `before ≠ after` rather than a direction. Both are now
  stated boundaries instead of assumptions a reviewer would have to find.
- **Superpowers' `writing-plans` "no placeholders" rule** is why every HOW block
  carries real signatures and real commands rather than "ARCH finalizes". The
  count of `ARCH finalizes` placeholders remaining across 8 PLANs is 0.
- **Measuring before pinning.** I computed contrast for all 26 token/surface
  pairs *before* choosing 4.5:1 and 3.0:1. Five Terracotta accents fail the
  design's raw hex, one of them (gold on shell, 2.94:1) below even the non-text
  floor. Had I pinned the number first and measured later, I would have written
  an acceptance the design cannot meet and discovered it in round 2, in a
  reviewer's finding, against a coder who did nothing wrong.

---

## AMENDMENT 1 (2026-08-31) — the wave-0 coder found a real defect in my ADR-001, and it was the same failure I had already written up twice

`ADR-001` shipped ONE repo-wide colour-literal sweep and made "residual 0" T9-C3's
acceptance, on the asserted premise that only **two** class members lived outside
`globals.css`. Both halves were wrong. The wave-0 Codex seat blocked at preflight,
**before writing a line**, with a grouped `47 across 12 files` count and the exact
right diagnosis: those files belong to later clusters, so the acceptance was
satisfiable only by violating one-writer-per-file. An acceptance that reports RED
in every state of the code — including a correct implementation — is worse than no
acceptance, and I had written that sentence myself, about someone else's gate,
in §2 of this report. **PRICE: one coder preflight cycle, one micro-amendment
round, zero code written against a wrong target — the cheapest possible place to
pay it, entirely because the seat validated its contract before its first edit
rather than after.** Re-measuring myself confirmed the coder exactly (156 repo-wide
/ 113 wave-0 / 43 later-cluster after two false-positive classes are excluded), and
turned up a **second** defect it had not been asked to find: six of those files —
`DebateMap`, `DebateSplit`, `DebateThread`, `DebateOutline`, `ModelPresentation`,
`lib/scrutiny.ts`, carrying 28 literals — belonged to **no cluster at all** in my
dispatch order. My component map covered every *designed* surface and silently
skipped the components that only inherit tokens. **THE CAUSE, and it is the same
one as §2a and §2b: I named the class correctly and published an instance count I
had not enumerated.** Three times in one mission — `readFileSync` vs `readFile`, a
self-review that printed "clean" without running, and now this — all the identical
shape: a confident number that was never measured at the moment it was written.
While re-measuring I nearly committed the fourth: my first tightened regex
(`oklch\(\s*[0-9.]`) dropped three REAL members, the `oklch(${…})` template
literals in `DebateMap.tsx:58-60`, because I tightened until the count looked
clean instead of reading what fell out — the diff between the two match sets is
the only reason I caught it. **THE UPGRADE, and it is now the one thing I would
put above everything in §7: an oracle is not a specification, it is a
measurement, and it must be RUN — at its real scope, with its output diffed
against the previous run — in the same edit that publishes its number. A count
written from memory is a claim; a count written from a command that just ran is
evidence. Everything else in this report is downstream of that distinction.**
Filed alongside: AN2 (my handoff said 41 DECISIONS rows; the true figure is 47,
Grok's count was right and mine was wrong — all eight files now carry a tally
footer that a reviewer can check with one `grep -c`) and AN3 (ADR-005 cited 26
measured contrast rows against 16 published; the complete table of **34 rows,
0 failures** is now published in `token-inventory.md`, and ADR-005 cites it
rather than keeping a second count).

---

## AMENDMENT 2 (2026-08-31) — my contract shipped a type that does not compile, and the gate that should have caught it did not exist

The Wave-0 blind review (`t_4ccac5c4`, 20:57) returned REWORK on one blocking
finding, and **the blocking finding is mine**. `ADR-002` published
`export function ModeToggle(): JSX.Element;` with no `JSX` import. React 19
removed the global `JSX` namespace; installed `@types/react` is 19.2.18; the
line is `error TS2503`. The worker implemented my contract character for
character and shipped a file that does not compile, with `ignoreBuildErrors:
false` making `next build` red on the same line. **The worker is not at fault
and the ADR is the defect** — that is the reviewer's phrasing and it is correct.

**PRICE: one rework round on Wave 0, the foundation every other cluster
inherits.** Cheap only because a blind lens ran a compiler the mission's own
gates never ran.

**The deeper failure is not the type — it is that I published a type expression
I never compiled.** Everything else in this report is about measuring numbers
before publishing them; a type signature is a claim of exactly the same kind,
and I exempted it without noticing. The standing rule is now in `ADR-002`: any
type expression an ADR publishes as a contract must have been compiled under the
workspace tsconfig before publication. Before amending, I compiled all three
candidate forms against the installed types in an isolated probe — and first
confirmed the probe FAILED on the broken form, because a green probe that cannot
go red proves nothing.

**AM2/C is the finding I would put in front of V.** The packets mandated
`pnpm run typecheck` and called it "repo-wide". Root `tsconfig.json` excludes
`apps/ui` and `web`. **The mission's only compile gate could not open a single
file the mission writes**, and it exited 0 the whole time. That is worse than
having no gate: a gate that cannot fail stops anyone from looking. `ADR-006` now
carries a compile-gate law — every gate NAMES its tsconfig, every `apps/ui`
cluster runs the workspace compile at 0-new, and the baseline is a list of exact
error lines rather than a count, because a count silently absorbs a new error the
moment an old one is fixed.

**And the baseline itself repeated the AF-1 defect, one level down.** The packet
told me to baseline exactly one pre-existing error; the reviewer recorded
`layout.tsx CLEAN`. The tree emits **three** `error TS` lines. The third —
`layout.tsx(3,8) TS2882`, a side-effect `import "./globals.css"` for which
`next/types/global.d.ts` declares `*.module.css` but not plain `*.css` — is
pre-existing and structural (byte-identical at `55b18ee^`, same line in `web/`).
Baselining only the packet's single error would have produced a gate stuck at 1
forever: **an unsatisfiable acceptance, for the third time in three amendments,
inside the amendment written to stop unsatisfiable acceptances.** I baselined
both, published the evidence, and routed the one-line permanent fix rather than
taking new product scope.

**What I nearly got wrong, again a measurement artifact.** Reproducing the
reviewer's M2 mutant, both the old and new oracles appeared to catch it — which
would have made the N2 finding wrong and the amendment unnecessary. The cause
was mine: I ran `rg` against a single file, and `rg` omits the path prefix in
that mode, so a filter keyed on `globals.css:NNN:` matched nothing. Re-run with
the real repo path shape, the reviewer is exactly right and the old window was
blind. **A filter that keys on a path must be exercised with a path** — the
harness's own shape, not a convenient stand-in. One tool call from filing "the
reviewer is mistaken" against a correct finding.

**The through-line across all three amendments, stated once.** AF-1: a count I
did not enumerate. AM1's near-miss: a matcher tightened until the count looked
clean. AM2: a type I did not compile, and a boundary encoded as a round number
85 lines stale. Every one is the same act — **publishing an artifact whose
correctness I asserted instead of executed.** The remedy that would have caught
all four is one line: *anything an ARCH document publishes as executable — a
command, a count, a type, a boundary — must be run, at its real scope, in the
same edit that publishes it, and its output pasted in.* Every command in this
amendment was verified that way, including the fail-loud guard, which I tested
on a deliberately renamed token block to confirm it actually fires.
