# CODE-S02-C8 — self-report (mission `consent-ui`, slice S02, cluster C8)

Seat CODE-S02-C8 · Claude Opus 5 · worker · round 0 (no rework) · ticket `t_ee948194`.
Sub-lane `.worktrees/consent-s02-css/dialectical-engine`, branch `slice/consent-s02-css`,
base `511d30b6` (verified at CLAIM, `git status --porcelain` = 0 entries).
Deliverable: the ONE delimited S02 block appended at the END of `apps/ui/app/globals.css`
(405 lines) and `tests/unit/consent-s02-style-contract.test.ts` (408 lines, 8 cases).
**Commit `a035f814`** — one commit, 2 files, 813 insertions, tree clean after it.
Verdict on the worst of three runs, in both shells: `VERDICT=0 · Tests 8 passed (8)`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

---

## 1. The bodies. Four things went wrong; three were mine and all four have a named cause.

### D1 — I created two top-level rules for one selector, and my own test caught it
**Symptom:** after writing the `@keyframes` + animation section, `S02-S61` went RED with
`Expected exactly one .policyScrim rule in the S02 block, found 2`.
**Cause, named:** I wrote `animation:` as a *second* `.policyScrim { … }` rule instead of a
declaration inside the one that already existed. **This is not a test defect and I nearly
"fixed" it as one.** `declsOf()`'s exactly-one-rule invariant is load-bearing: with two
top-level rules for one selector a later one silently overrides a declaration an earlier
assertion pinned, so `expectDecl` can pass while the cascade delivers something else.
**Remedy by shape, not by instance:** every selector in the block now has exactly one
top-level rule; state variants are distinct selectors (`:checked`, `:disabled`,
`:focus-visible`, `::after`), which is what CSS already means by a variant.
**Price:** ~4 minutes, one debugging cycle, zero rounds.
**Upgrade for the next packet:** *"one top-level rule per selector inside your block"* is a
cheap, mechanically checkable law that belongs in COMMON beside the colour-literal rule. It
is the CSS analogue of single-writer, and it is the only reason a source-text style contract
means anything: without it, every `expectDecl` is a statement about the first rule, not about
the cascade.

### D2 — my own mutation harness left the tree MUTATED when a reverse anchor was not unique
**Symptom:** `AssertionError: anchor not unique (3): '  left: 20px;'` thrown *during the
restore* of mutant `S61-M4`. The forward mutation had already applied. The tree was left with
`.policyTab { left: 20px }` and no error message said so.
**Cause, named:** the harness restored by replaying the substitution BACKWARDS. A forward
anchor scoped to my block can be unique while its reverse is not: `left: 20px` occurs three
times in a 7,600-line stylesheet. This is `TOOLING-TRAPS.md:1707`'s class ("an unanchored
mutant patches the FIRST match in the FILE") arriving through the restore door instead of the
apply door — and it is strictly worse there, because a failed apply is loud and a failed
restore is silent until the next assertion.
**Remedy by shape:** the harness now snapshots the file's BYTES before each mutant and writes
the snapshot back, asserts the mutant landed (`read() != snapshot`), asserts the restore
landed (`read() == snapshot`), and resolves every anchor INSIDE the S02 block. 20 mutants ran
afterwards with zero leakage.
**Price:** ~6 minutes and one moment of real risk — had I not printed `git status` and
diffed the file after every restore, `left: 20px` would have shipped.
**Upgrade:** `heartbeat-worker` §2 says "print `git status --porcelain` after every restore".
That is necessary and NOT sufficient: `git status` says the file is modified, which it always
is mid-cluster. The arm that actually catches this is **byte equality against a snapshot**.
Recommend the skill say so: *restore by snapshot, and assert the restore, not just the apply.*

### D3 — the first thing I typed in the test file was a typecheck failure the cluster command cannot see
**Symptom:** `pnpm typecheck` returned **9** diagnostics — the 8 pinned in `s14-ui.test.ts`
plus `TS2835` on my own `import { contrastRatio } from "../support/contrast"`.
**Cause, named:** the root `tsconfig.json` resolves modules as `node16`, which requires an
explicit extension on a relative ESM import; the repo's own precedent
(`tests/unit/t9-mode-tokens.test.ts:326`) writes `"../support/contrast.js"`. **vitest resolves
it happily**, so the suite was green for the whole S02-S64 cycle while the typecheck gate was
red. The cluster command and the typecheck gate see different worlds.
**Price:** ~3 minutes. It would have been a rework round had I run typecheck only at handoff.
**Upgrade, and this is the generalisable one:** the packet ordered typecheck as gate (2) of
five, i.e. near the END. For a cluster whose deliverable is a NEW `.ts` file under `tests/`,
the first `pnpm typecheck` should run the moment the file's imports exist, not at handoff —
the diagnostic is about the import line, so it is available before a single assertion is
written. A one-line packet instruction ("run `pnpm typecheck` once as soon as your new file
has its imports") converts a possible rework round into three minutes.

### D4 — I wrote `.policyGateHint`'s CSS one step before its test existed
**Symptom:** `S02-S65b` passed on its first run.
**Cause, named:** I wrote the rule in the same edit as `S02-S64`'s `opacity`, because both
live in the footer and I was thinking in rules rather than in steps. That is a TDD violation
— a test that has never failed proves nothing.
**Remedy:** I removed the rule, watched `S02-S65b` go RED
(`Expected exactly one .policyGateHint rule in the S02 block, found 0`), and re-derived it
**by copying `.srOnly`'s body out of the file with a regex** rather than retyping it, then
re-ran GREEN. The frame is in the handoff, labelled as what it is.
**Price:** ~3 minutes. **Upgrade:** the temptation is structural, not personal — a stylesheet
is authored in RULES and the plan is written in STEPS, and one rule can belong to two steps.
A CSS cluster's plan should say, per step, *which rules that step creates*, so the two units
line up. Steps S02-S61…S02-S65 name declarations and never rules.

---

## 2. What repeatedly cost tokens

1. **Reading a 2,224-line `PLAN.md` and a 198-line `DECISIONS.md` to extract ~40 lines that
   bind me.** The packet's line citations (`PLAN.md:1173-1272`, `:1476`, `:1485`) were exact
   and saved a full-file read — that mechanism works and should be kept. What still cost
   tokens is `DECISIONS.md`: it is append-only with **two supersession layers**, so the
   binding text for `.policyGateHint` is at `:197` and contradicts nothing but is reachable
   only after reading 196 lines of history. **Upgrade: every append-only DECISIONS file gets a
   generated `## Currently binding` tail — regenerated, never hand-written — listing the live
   answer per question with a pointer to the entry that settled it.** The history stays; the
   reader stops paying for it.
2. **The measured-value ladder was in three places and one of them is wrong.** `PLAN.md:1250`,
   `DECISIONS.md:109` and my packet all state `.70 → Terracotta 5.54`. Re-measured under three
   compositing models (rounded, floored, unrounded) it is **5.61 / 5.61 / 5.57** — never 5.54.
   `.60 → 4.13` and `.65 → 4.79 / 7.17` reproduce EXACTLY. Nothing depends on the wrong figure
   (`.65` is the smallest passing step either way) but I spent ~4 minutes proving I had not
   mis-modelled the composite. **Upgrade: a number quoted in three artifacts is a number that
   will disagree with itself; quote the COMMAND once and let the reader run it.** That is
   COMMON §10.10's corollary applied to derivations, not just to counts.
3. **Three tokens named in my packet that I do not need.** `--muted-bg`, `--muted-border` and
   `--shadow-knob` are listed as tokens "you REFERENCE". They are S01's — the first two are
   the Product-analytics tag pill, `--shadow-knob` is the consent toggle's knob shadow and is
   not even among S01-R24's ten. I spent ~5 minutes confirming `--shadow-knob` was not
   something S02 was expected to consume before deciding `--shadow-pop` (which exists at base,
   and which COMMON §7 maps `shadowBig` to) was the right token for the modal's drop shadow.
   **Upgrade: a packet's token list should be exactly the tokens that cluster references, and
   should be generated from the plan rather than assembled by hand.**

---

## 3. What I nearly got wrong

- **I nearly wrote `content: "\2713"`.** The CSS escape renders the identical glyph and is
  more portable-looking. The packet pins `content: "✓"` VERBATIM, and a source-text contract
  is about source text — the escape would have failed a byte-level review for no gain. What
  settled it was measuring the file: `globals.css:1013` already ships
  `.authBackButton::before { content: "← "; }`, so the literal glyph is the house form.
  **The general move: when two encodings are equivalent at runtime, the repo's own precedent
  is the tiebreak, and it is one grep away.**
- **I nearly folded `.policyGateHint`'s assertions into `S02-S64`** to keep the plan's stated
  `Tests 7 passed (7)`. That would have hidden a ruling (`DECISIONS.md:197`, 2026-09-07) that
  post-dates the PLAN inside a case about something else. The count moved 7 → 8 and is
  declared instead. **A count in a plan is a prediction; a ruling is a requirement. When they
  disagree, the count yields and the delta is disclosed.**
- **I nearly reported the S65 satisfiability arm as "mutant-proved".** It cannot be: it
  asserts each of the seven auth-shell class names matches ≥1 rule, and all seven rules live
  ABOVE my block, which I may not edit. It is reported as GREEN with its counts printed
  (3/2/3/2/5/2/3 of 1,285 rules parsed) and explicitly NOT as mutant-proved.

---

## 4. Dead ends, so nobody re-derives them

- **`declsOf` compared `[...hint]` to `[...srOnly]` as ORDERED entries.** A reorder of nine
  non-interacting declarations is the same treatment; the ordered form would have failed a
  correct edit. Changed to a sorted set comparison and pinned with mutant `S65b-N1`.
- **A "BROKEN arm" (`[ -n "$sum" ]`, `TOOLING-TRAPS.md:2092`) misclassifies the legitimate
  RED-at-base frame.** With the test file absent, vitest prints `No test files found` and no
  summary, so the empty-summary arm fires and calls it BROKEN — but COMMON §10.17 classifies
  that exact frame as RED-by-design *when the file does not exist*. The arm is still worth
  having; it needs a companion condition (`test -f <file>`) before it may say BROKEN.
  Recommended for the traps file and stated in the handoff.
- **`opacity` on the check glyph.** My first sketch showed/hid the `✓` with
  `opacity: 0 / 1` on `::after`. It works, and it would have put a second and third `opacity:`
  declaration into the block, which the S02-S64 extraction then has to disambiguate by
  selector. Putting `content: "✓"` on `.consentBox:checked::after` instead gives the design's
  own four declarations in ONE rule and leaves exactly one `opacity` in the block.

---

## 5. Where THIS packet was unclear, exactly

1. **§2(2) lists `--muted-bg`, `--muted-border`, `--shadow-knob` among "the tokens you
   REFERENCE".** None is needed by S02, and `--shadow-knob` is not in S01-R24's ten (it is an
   S01 rework addition). Not blocking — the sentence's substance (references are lawful,
   declarations are not) is right — but it sends a seat looking for a use.
2. **§2(8) orders "add a test case" for `.policyGateHint`; `PLAN.md:1270` pins
   `Tests 7 passed (7)`.** Both cannot hold. The packet is later and more specific, so the
   count is 8 — but a seat that resolved it the other way would have buried the ruling.
   **The cluster GUARD is unaffected** (it requires `Tests [1-9][0-9]* passed` with no
   `failed`, never a specific number), which is the only reason this was cheap.
3. **"RED first per step" is not satisfiable for two of the seven steps and the packet does
   not say so.** `S02-S60` (no colour literal, no token declaration) and `S02-S65` (no
   containing-block property) are ABSENCE assertions: against an empty block, and against a
   stylesheet that is already correct, they are green the moment they are written. `PLAN.md`
   says so for `S02-S65` ("GREEN before and after at base") and NOT for `S02-S60`. Both are
   proved by mutants instead, and both are labelled. **Upgrade: a plan should mark each step
   `RED-first` or `guard (mutant-proved)`.** That is a one-word column and it removes the
   choice between a false RED frame and an unexplained green one.

---

## 6. How to make this more of a one-prompt machine

1. **Ship the cluster's `run.sh` WITH the packet, not as prose the seat retypes.** I
   transcribed the `run()` function out of `PLAN.md:1376-1388` into a scratch `.sh`. It is
   identical every time, it is the thing §10.16 demands be run from a file, and retyping it is
   pure risk. The orchestrator writing `<scratch>/<seat>/run.sh` at dispatch removes a
   transcription step from every coding seat in the fleet.
2. **Ship the mutation harness too.** Every coding seat in this mission has written its own,
   each has met a different one of the same three traps (encoding no-op, unscoped anchor,
   unsafe restore), and each has paid for it. One `mutate.py` taking `(anchor, replacement,
   expect_caught)` and owning "prove it landed / snapshot-restore / scope to your block"
   turns the refutation duty from an exercise in shell discipline into an exercise in
   choosing good mutants — which is the part that needs a mind.
3. **Give a CSS cluster a "measure the artboard once" step.** Every number in this block came
   from two HTML extracts. I read them once and transcribed carefully; a seat under time
   pressure would transcribe from the PLAN's prose restatement, which is a copy of a copy.
   **A generated `design-extract.json` (selector → declaration list, produced from the
   artboard) would make the style contract a DIFF against the design rather than a list of
   assertions a human typed twice.** That is the single biggest available upgrade for
   design-fidelity work in this repo, and it makes the Grok element gate mechanical.
4. **Pin the "nothing above your block changed" check as a first-class arm.** I proved it with
   `git show HEAD:<path>` compared byte-for-byte against everything above the opening marker
   (164,567 == 164,567). That is a two-line check, it is the exact statement of the
   single-writer contract, and it is stronger than any diff review. It belongs in the cluster
   command of every seat that appends to a shared file.
5. **Two shells, one verdict, every time.** Running the guard inline (ugrep 7.8.4, UTF-8) and
   from a `.sh` under `/bin/bash` (BSD grep 2.6.0-FreeBSD, LC_ALL=C) cost one extra command
   and is the only reason I can assert the guard is not a locale accident. Keep it mandatory.

---

## 7. Residuals and findings handed up (all non-blocking, none fixed here)

- **F1** `PLAN.md:1250` / `DECISIONS.md:109`: the `.70` Terracotta contrast figure is `5.54`;
  re-measured `5.61` (rounded composite), `5.61` (floored), `5.57` (unrounded). `.60` and
  `.65` reproduce exactly. The pinned choice is unaffected.
- **F2** Packet §2(2) names `--shadow-knob`, `--muted-bg`, `--muted-border` as tokens S02
  references; S02 references none of them. `--shadow-knob` is not among S01-R24's ten.
- **F3** Packet §2(8) vs `PLAN.md:1270`: 8 cases, not 7. Declared, guard unaffected.
- **F4** `TOOLING-TRAPS.md:2092`'s BROKEN arm misfires on the lawful `No test files found`
  RED-at-base frame; it needs a `test -f` companion. Appended to the traps file.
- **F5** `apps/ui/app/globals.css:885-902` still carries `.authCheck` and `.authCheck input`,
  the vocabulary the sign-up 18+ row used before S02-C3 replaced it with `.consentGroup`.
  Measured: `git grep -n "authCheck" -- . ':!*globals.css' ':!docs/*'` returns **no hit under
  `apps/` or `tests/`** (the only hits are archived CSS/DOM dumps under `.hermes/reports/`
  belonging to two other missions). Dead CSS, and it sits ABOVE my block, so it is out of
  contract — named for a ticket, not touched. Same measurement incidentally shows
  `.authCheckEmail` (`:802`, `:1017`, `:1038`, `:1046`, `:1055`, `:3516`, `:3525`) has no
  consumer either; that one predates this mission and is not S02's finding to own.
