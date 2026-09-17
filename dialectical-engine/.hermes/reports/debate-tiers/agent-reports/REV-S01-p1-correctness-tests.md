# Self-report — seat `REV-S01-p1-correctness-tests` · REV(S01) pass 1, lens correctness/tests · mission `debate-tiers`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session 2026-09-10 03:42 → 04:07 EEST, ~25 minutes wall clock, ~205k tokens. Verdict PASS with six
non-blocking findings. Worktree byte-clean at start and at handoff.

---

## 1. The cause, not the symptom

**The review package is built to let a reviewer re-read what the author already ran, and a UI slice
cannot be reviewed that way.** It shipped 7,344 lines: a 1,581-line patch and 5,500 lines of raw
`reverify-C*.log`. I opened none of the four raw cluster logs and verified every number anyway — the
shared runner prints one line per suite and a marker, which is the whole evidentiary content. Mean-
while **five of the fifteen M-lines in `DONE.md` cannot be measured in jsdom at all** (M2–M7 colour
values, M8's `.ndSelect:has(select:disabled)` outer box, M13/M15 as rendered), so the only way to
review this slice is to stand up a browser — which the package describes in prose (`dev-stack.md`)
and does not ship.

The measurable consequence: at 04:00 there were **three** `node server.mjs --dev` processes alive in
three lens worktrees (`:8795` mine, `:8797` security, `:8851` product-truth) and three hand-written
stub APIs. Three seats independently re-derived the same fixture from the same paragraph of prose,
in parallel, blind to each other. That is the single largest avoidable cost in this node, and it
scales linearly with the lens count on every UI slice.

**Second cause: `DONE.md` §3 is prose, so the assertions that "map" it are written by hand and come
out weaker than the lines.** That is finding N1 in one sentence. `DONE.md` M2 says
`--line-strong` = `rgba(41,38,31,.20)` / `rgba(242,234,217,.18)`; the assertion C5 wrote for M2 checks
that the *name* `--line-strong` appears in both mode blocks. I changed the chamber value to red and
the suite reported 8 passed. Nobody was careless — a human transcribing a measurement into an
assertion under time pressure reliably lands one level of strength too low.

---

## 2. What repeatedly cost tokens

| what | price | why |
|---|---|---|
| Browser measurement built from prose | ~20k tokens, ~6 min — **×3 seats in parallel** | `dev-stack.md` gives a recipe, not a script |
| Large computed-style dumps | ~14k tokens over 8 `javascript_tool` calls | I asked for whole property sets because I could not know in advance which property would carry the defect; a declared M-line schema would let me ask for exactly the measured properties |
| Reading the two new suites in full (658 lines) | ~9k | Unavoidable and worth it — N1, N2 and the vacuity analysis all came from reading the assertions, not the product |
| The oracle + cluster map + SPEC | ~9k | Correctly sized; the cluster map's runner post-mortem is genuinely load-bearing |
| Dead-end tool errors | ~5k, ~4 min | §4 |

What did **not** cost much, and should be copied: the three cluster runs cost ~4k tokens total
because I grepped summary lines instead of streaming vitest output, and the mutant battery cost ~2k
because it was one script that mutated, ran, restored and re-checked `git status` in a loop. Both
are the same trick — **let a script do the repetition and report only the verdict lines.**

---

## 3. What I nearly got wrong

1. **I was one paragraph from filing a blocking data-integrity finding on correct code.**
   `buildNewDebateAskConfig` sends `tier_provenance_ref: "machine:plan-tier-free"` on a **Premium**
   ask that never touched the risk tier. It is persisted `notNull` (`packages/db/src/schema.ts:119`),
   written into the runs row, and rendered verbatim to the asker in the honesty drawer
   (`AnswerHonestyDrawer.tsx:86`) beside the label "machine default from the deployment floor". I had
   the citations assembled. Then I read `SPEC-v2.md:71-95` and found R7 — added at REQ-REV pass 2 as
   finding B3 — ruling exactly this: *"The rule is on the mechanism, not on the tier."* **Near-miss
   cost: ~4k tokens, 3 minutes. Cost had I filed it: a rework node against conformant code and a
   requirements seat re-litigating a frozen requirement.**
   The mechanical lesson, which belongs in the reviewer contract: *before filing a finding against a
   literal value, grep the frozen SPEC for that literal.* One command would have saved the detour.
2. **I nearly filed a false M8 violation.** Diffing 16 computed properties across all 14 locked
   controls showed the four range sliders changing `border-top-color` from `rgb(41,38,31)` to
   `rgba(118,118,118,0.3)` when disabled — Chrome's UA rule. `DONE.md` M8 says "no colour change".
   It refuted only when I measured `border-width`/`border-style` on the box **and** on
   `::-webkit-slider-thumb` and `::-webkit-slider-runnable-track`: `0px` / `none` in both states, so
   the colour is never painted. A computed-style diff without a paintability check manufactures
   blocking findings. I predict the product-truth lens may file this one.
3. **This one I did not catch in time — I ran a pattern kill that can reach another lens's process.**
   My teardown ran `pkill -f "stub-api.mjs"`. `dev-stack.md` gives all three lenses the same recipe,
   and at least one other lens named its stub the same thing: a `node stub-api.mjs` is running right
   now (pid 52297) that is not mine. If a parallel lens had its stub up at 04:04 when I fired that
   command, **I killed it.** I cannot prove either way, and the security lens's dev server (pid
   44631, `:8797`) was alive at 04:05 and gone at 04:07 — after my port-scoped kills, which could not
   have reached it, but I will not use that to argue myself innocent of the pkill. The product-truth
   lens's server (`:8851`) is still up and untouched.
   **Cause:** a pattern kill in a fleet where every seat is handed the same file names by the same
   recipe. **Upgrade, and it is one line:** kill by port (`lsof -nP -iTCP:<port> -sTCP:LISTEN -t |
   xargs kill`) and never by `pkill -f` on a shared filename; better, have the harness of upgrade #1
   name each lens's fixture after the seat. This belongs in `TOOLING-TRAPS.md`.
4. **I assumed the render suite's rejected session was harmless and then checked anyway.** The suite
   forces `readSession` to reject (`tier01-new-plan-tier.test.tsx:60`), so the session-defaults effect
   never runs in any of the 21 cases. Had that effect written `riskTier`/`budgetTier`/`depth`, the
   entire Free lock would have been untested against production behaviour. It writes only
   `decisionScope` and `asOf` (`page.tsx:103-115`). Cheap check, catastrophic if skipped — a fixture
   that disables a mount effect hides everything downstream of it.

---

## 4. Dead ends — do not re-derive these

- **`sed` with `\{0,1200\}` fails on macOS**: `RE error: maximum repetition exceeds 255`. Use python
  for any extraction longer than 255 characters. Cost me 2 calls.
- **The board `.txt` files in the review package are not the JSON shape `json.load` expects** for a
  `comments` array; grep them as text. Cost me 1 call returning nothing.
- **`/` will not render `LibraryComposer` without a confirmed server session** (`app/page.tsx:81`),
  so the second `createDebate` caller cannot be exercised in a browser behind a stub that sets no
  session cookie. Do not chase the cookie/CSRF pair — settle it with a temporary in-worktree vitest
  probe (copy in, run, delete, verify clean). 2 calls instead of an unbounded chase.
- **jsdom does not sanitize `input[type=range].value` to the step ladder; Chrome does.**
  `#maxTokens` is `"800"` in jsdom and `"768"` in the browser (min 128, step 128). Finding N2, and a
  general warning: any range-input value assertion passing in jsdom is unverified until a browser
  sees it.
- **`pkill -f "PORT=8795"` matches nothing** — env assignments are not part of a process's argv. Kill
  by port (`lsof -t`) instead. That pkill was theatre; the port-scoped kills did the work. Its
  sibling `pkill -f "stub-api.mjs"` was worse than theatre — see §3.3: in a fleet where three seats
  build the same fixture from the same recipe, a pattern kill on a shared filename reaches across
  lanes. **Never `pkill -f` a filename in this fleet.**
- **`display: inline-flex` computes to `flex`** on a flex item (blockification). Not a deviation from
  `DONE.md` M7; do not file it.

---

## 5. Where THIS packet fought me, exactly

- **`:20` — the lens gloss.** *"Your lens is correctness-tests (correctness/tests ·
  security/data-safety · product-truth)"*. That parenthetical is the reviewer contract's list of all
  **three** parallel lenses, pasted into one seat's lens line. Read literally by a blind seat it
  triples the scope — three lenses' work at three times the tokens, in a seat forbidden to read the
  other two. I resolved it against §1 and the ticket title. Filed as N5.
- **`:15-16` vs `:17`/`:20` and `probes.md:5` — the packet forbids the duty it orders.** `allowed` is
  exhaustive and `forbidden` says "everything else — in particular the slice's files"; probe 3 says
  *"mutate the product in YOUR worktree, watch the named assertion go RED, restore"*. Only the
  dispatch prompt reconciled them. **Four of my six findings came out of the mutant battery**, so a
  seat that resolves this the other way loses most of the review's value. Filed as N6. The `allowed`
  list needs the temporary-mutant exception written into it, with the restore-and-verify obligation.
- **`:17` — "one mount of every surface this slice shares".** "Surface" is undefined. I read it three
  ways — a CSS class family, a shared module, a route — and did all three, because guessing wrong is
  how a cross-slice defect survives nine green clusters. The orchestrator already knows the answer:
  it wrote the cluster map. **Name the surfaces in the packet.**
- **`:10` names the artboards but never says to count anything in them.** `DONE.md` M8's three
  occurrence counts (10 / 14 / 15) are the most mechanically checkable claim in the entire oracle and
  the only place where the artboards can falsify the build in one command. I found them by reading
  M8 closely, not because the packet pointed at them.

---

## 6. What to upgrade — the one-prompt machine

1. **Ship the fixture, not the recipe.** One `rev-ui-harness.sh <port>` beside `run-suites.sh`:
   boots the stub API and the lens's own dev server, waits for `/new`, prints the computed-style
   table for every selector `DONE.md` names, in both modes, and tears itself down. Saves ~20k tokens
   and ~6 minutes **per lens per UI slice** — ~60k tokens on this node alone. This is the highest-
   leverage change available and it is one file.
2. **Make `DONE.md` §3 machine-readable.** One TSV row per M-line — selector, property, terracotta
   value, chamber value. Then C5 *generates* its assertions instead of transcribing them, and the
   reviewer diffs declared-vs-rendered with one command. **N1 becomes structurally impossible**, and
   so does the whole class of "the assertion is one level weaker than the measurement".
3. **Slim the review package.** Ship the runner's summary lines and keep raw vitest output behind a
   path. I verified everything from 200 lines of the 7,344 shipped.
4. **Two new lines in the reviewer contract**, both earned by §3 above: *before filing against a
   literal value, grep the frozen SPEC for that literal*; *before filing a colour or border finding,
   prove the property is painted*. Two greps that between them prevent two false blocking findings —
   and a false blocking finding costs a full FIX node plus the next REV pass.
5. **Give the three lenses one shared, read-only fixture.** Blindness must hold on *judgment*, not on
   *infrastructure*. Three worktrees, three dev servers and three stub APIs buy nothing that one
   pre-booted fixture with three separate measurement scripts would not.
6. **A packet-check rule for the contradiction in N6**: if a packet's `forbidden` list intersects any
   duty its own `## The work` section or its probes order, fail the packet at generation. Rule 9
   already retroactively failed the C5 packet; this is the same shape and cheap to detect.

## 7. Honest shortfalls

I loaded exactly the four skills my packet named and nothing further from Superpowers —
`systematic-debugging` would have been the natural fifth when I was chasing the provenance and the
slider-border candidates, and I worked those by hand instead. I did not measure `:3000` at CLAIM
time, so I cannot state what its condition was when I started; I have recorded that gap and the exact
reason my teardown commands could not have reached it rather than assuming either way.
