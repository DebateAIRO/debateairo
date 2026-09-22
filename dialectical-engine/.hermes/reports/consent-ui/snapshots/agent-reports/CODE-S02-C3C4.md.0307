# CODE-S02-C3C4 — self-report (case file)

**Seat:** CODE-S02-C3C4 · worker · Opus 5 · mission `consent-ui` · ticket `t_126a42a2`
**Lane:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02-form/dialectical-engine`, branch `slice/consent-s02-form`, base `91877847` (verified at CLAIM; matched the orchestrator's stated base).
**Scope:** clusters `S02-C3` (steps S02-S17…S02-S24, S02-S70) and `S02-C4` (S02-S25, S02-S26, S02-S27, S02-S30, S02-S31, S02-S32).
**Commits:** C3 `0928c38c` · C4 `fb44696d`
**Status:** complete. Written incrementally per COMMON §4b, updated after each cluster.

> The question this answers, verbatim from V: *"treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."*

---

## 1. What actually happened, priced

| Phase | Wall clock (approx) | Rounds/retries | Notes |
|---|---|---|---|
| CLAIM + base verification | ~1 min | 0 | Base matched; nothing to reconcile. |
| Reading (COMMON, INSTRUCTIONS, SPEC v3, PLAN 2224 lines, DECISIONS, BASELINE, TOOLING-TRAPS) | ~12 min | 0 | See §3 — this is the single biggest cost and the biggest lever. |
| C3 RED → GREEN | ~6 min | 1 self-correction (see §2.1) | No debugging: the implementation passed first try. |
| C3 refutation (9 mutants + 3 neighbours) | ~5 min | 0 | Harness in scratch; restore verified by md5. |
| C3 gates + 6 verification runs | ~5 min | 0 | Zero flake across 6 runs. |
| C4 RED → GREEN | ~5 min | 0 | Five assertions RED, one implementation pass, GREEN. |
| C4 refutation (4 mutants + 3 neighbours) | ~9 min | **2 re-runs** | §2.3 — the only real loss of the session. |
| C4 gates + 6 verification runs | ~5 min | 0 | Zero flake across 6 runs. |

**Zero rework rounds, zero blocked states, zero packet defects.** That is the headline, and §3 says why — it is not luck, it is that the PLAN pre-paid for every decision I would otherwise have had to make.

## 2. What I nearly got wrong

### 2.1 Two of my eight C3 cases passed at base — I caught it, but only because I read the pass count

My first RED run gave `9 failed | 18 passed`. My test file has 8 cases; only 6 were red. The two green ones were S02-S21's first case (`.click()` the `adult-affirmed` input) and S02-S70 (focus + activation), because **today's `.authCheck` markup already satisfies them** — the input is already a real focusable checkbox inside a `<label>`, and no dialog exists anywhere in the component. A test that is green before the change proves nothing about the change.

`PLAN.md` S02-S70 actually *declares* this ("`document.activeElement`/`checked` assertions still hold today, but … the group does not exist yet"), and the fix it implies is to scope the lookup **through the group**: I added a `groupField(name)` helper that resolves `.consentGroup .consentRow input[name=…]`, so the case is red until the structure exists, for exactly the reason the PLAN names. Second RED run: `11 failed | 16 passed`, all 8 cases red.

**Cost:** one extra vitest run, ~40 s. **Cause:** the PLAN stated the RED reason in prose but the step's *test* sentence ("call `field("adult-affirmed").focus()`") named the un-scoped selector. **Upgrade:** when a step's RED-before reason is "structure X does not exist yet", the step's test sentence should name the selector *through* X, not the bare one. This is one word in the plan and it removes a whole class of accidentally-green cases.

### 2.2 The check-square glyph nearly went into the DOM and would have broken byte-exact copy

Design 8a draws the 17×17 square as a `<span>` containing a literal `✓`. Transcribed literally, row 1's `textContent` becomes `✓I am 18 or over.` and S02-S18's byte-exact equality fails. The resolution is already in the plan — `S02-S62` pins `appearance: none` on the input plus a `content: "✓"` **pseudo-element** — but that is in cluster **C8**'s step, which a C3 seat has no reason to read. I read it only because I was checking which class names C8's selectors expect.

**Upgrade, and it generalises:** when cluster A must render markup that cluster B will style, A's steps should name the class names and say *which visual affordances are pseudo-elements*. One sentence in `S02-S17` ("the square is the input itself under `appearance: none`; the glyph is a pseudo-element, so no row gains text") would have made C8's constraint visible from inside C3. As it stands the coupling is discoverable only by reading a cluster you do not own.

### 2.3 A BROKEN mutant run printed as "the mutant was not caught" — the one thing that could have shipped a fabricated finding

Two C4 neighbouring mutants (`disabled` hard-coded `true`; the settled-value guard dropped) came back from my harness as `exit=1 … CAUGHT BY: (nothing)`. **`CAUGHT BY: (nothing)` is precisely the verdict `heartbeat-worker` §2 step 4 asks for**, so the honest-looking thing to do was write "not caught" into the handoff and move on. `exit=1` with an *empty* FAIL list is impossible for a real mutant, which is the only reason I looked.

Root cause: I passed the four test paths as an unquoted shell variable, `$F4`. **This shell is zsh, where an unquoted variable does not word-split** — vitest received one bogus filter token, printed `No test files found`, and exited 1 having run nothing. That is BROKEN, not a mutant verdict (`COMMON.md` §10.17). Re-run with the paths literal, both mutants gave `exit=0, Tests 32 passed (32)` — the same "not caught" conclusion, now actually evidenced.

**Cost:** ~3 minutes and two re-runs. **What it nearly cost:** two fabricated refutation rows (`heartbeat-protocol` §2.6), in the section whose entire purpose is to prove the tests are not green by accident. The trap's zsh half is already in `TOOLING-TRAPS.md`; its consequence inside a *mutant harness* was not, and I appended it. **Upgrade, and it is one line of code:** a mutant harness must CLASSIFY — no `Tests <n> passed|failed` summary line means BROKEN and forces a re-run; it is neither "caught" nor "not caught". The same guard belongs on the pair (nonzero exit, empty FAIL list), which is this trap's exact signature.

### 2.4 The two C4 blind spots are real, declared, and now measured

`PLAN.md`'s C4 cluster row says C4 lost its only positive control when R17 cases 4/5 moved to C7, so **`disabled` hard-coded `true` is undetectable here**. I built that mutant: `Tests 32 passed (32)`, nothing caught — the plan's claim is exact, and the detection genuinely lives in `S02-S28`/`S02-S53` in C7. Likewise the B1 settled-value guard on the privacy mirror (`checked && !nativeEvent.defaultPrevented`): nothing at the C4 stage calls `preventDefault`, so dropping it changes nothing observable here. I wrote it from the start anyway, because the packet requires it and because C7 may not edit C4's work. **Both are stated as blind spots rather than implied as coverage** — a mutant-class column that claims a detection the command does not have is worse than an empty one.

And the headline pin works exactly as measured by REQ-01: making both inputs **controlled** takes down **one** case out of 32 — `S02-S30`, R17 case 6 — and only via its second assertion (`.checked` survives the re-render). Cases 1, 2 and 3 stay green under it. Four rounds of review bought that discrimination and it reproduces.

## 3. What repeatedly costs tokens — measured on this seat

### 3.1 The reading surface is ~5,000 lines for two clusters that changed ~50 lines of product code

Measured: `COMMON.md` 152 lines, `INSTRUCTIONS.md` ~100, `SPEC.md` 757, `PLAN.md` **2,224**, `DECISIONS.md` 192 (73.5 KB — it overflowed the tool output and had to be grepped rather than read), `BASELINE.md` ~50, `TOOLING-TRAPS.md` 1,600. Of that, the material I actually acted on was: the C3 and C4 cluster sections (~360 lines), the cluster-command idiom (~60), §Per-cluster boundaries (~25), the refutation-table rows for my 15 steps (~15), §Copy's checkbox block (~4), and about 12 of COMMON's 32 amendments.

**The lever is not "write less".** The plan's density is exactly why this seat needed no rework. The lever is **navigation**: every one of those documents is addressed to *every* seat, and each seat re-derives which 8% is its own. A per-cluster **extract** — the orchestrator running one script that slices `PLAN.md` between `### Cluster S02-C3` and the next `###`, plus the matching refutation rows, plus the boundary row, into `.hermes/planning/consent-ui/packets/CODE-S02-C3C4.slice.md` — costs the orchestrator one command and saves every coding seat the same 2,000-line scan. The packet already names the line ranges; it could carry the bytes.

### 3.2 `DECISIONS.md` at 73.5 KB cannot be read, only grepped

It exceeded the tool's output limit and was persisted to a temp file. I grepped it for my cluster ids and read ~12 entries. **A seat that greps a decisions log reads only the decisions whose text happens to contain its search terms** — the ruling that saved me (the row-markup ruling at `:91`) matched only because it contains the string `consentRow`. Had it been phrased "row two uses `aria-labelledby`", I would have missed it and re-derived it (correctly, as it happens, but at cost).

**Upgrade:** DECISIONS entries should carry an explicit `affects:` field naming the cluster ids, so a seat's first action is `grep 'affects:.*C3' DECISIONS.md` and gets a complete set rather than a lexical accident. This is a two-word change to the append format and it converts a lossy search into an exhaustive one.

### 3.3 The mutant harness is re-invented by every worker seat, and the obvious implementation is dangerous

`heartbeat-worker` §2 requires apply-mutant → RED → revert → GREEN → print `git status --porcelain`, for every assertion. The obvious revert is `git checkout -- <path>` — which, for a seat whose work is **uncommitted**, restores from the index and **destroys the work in progress**. `TOOLING-TRAPS.md` warns about the `git checkout <sha> -- path` staging variant; it does not warn about this one, which is the variant a worker mid-cluster actually reaches for.

I used a snapshot-and-`cp` harness (`scratchpad/CODE-S02-C3C4-r0/mutate.sh`) and verified the restore by `md5` on all three files, not by eyeball. **Upgrade:** that harness is ~20 lines and belongs in the worker skill or in `.hermes/` as a shared script, with the `git checkout` trap recorded. Every worker seat in this fleet is paying to write it, and the cheap wrong version silently eats a cluster's work.

## 4. Dead ends — recorded so nobody re-derives them

1. **Do not scope a "does structure exist" case through the bare input name.** `document.querySelector('input[name="adult-affirmed"]')` resolves against the *pre-edit* markup too. Scope through `.consentGroup`. (§2.1)
2. **Do not put the `✓` glyph in the DOM.** It breaks `textContent` byte-equality on both rows. It is a CSS pseudo-element (`S02-S62`). (§2.2)
3. **Row 2 cannot be a `<label>`** — settled in `DECISIONS.md:91`, and the reason is the HTML content model, not preference. Do not "simplify" it back to a label; `aria-labelledby` is load-bearing.
4. **The three `field("adult-affirmed").checked = true;` lines are byte-identical**, so no line number can name one of them and inserting at the first shifts the other two. A single `replace_all` on the line *including its trailing newline* is the correct edit; verify with the 3/3 count arms **and** by mapping each hit back to its enclosing `it(...)` title (`awk` one-liner in the handoff).

## 5. Findings raised (full text in the board handoff on `t_126a42a2`)

**Packet defects: none.** The base commit matched, every one of the nine pre-edit count arms matched its stated base value, every cited anchor text was present exactly once, and no file I was required to produce was missing from the `allowed` list. This packet was correct as written.

Non-blocking findings, each with a location:

- **F1 · `PLAN.md` `S02-S70` / `S02-S21` — the step's test sentence names an un-scoped selector while its RED clause depends on scope.** `PLAN.md:568` says "call `field("adult-affirmed").focus()`"; `:583` gives the RED-before reason as "the group does not exist yet". Written literally the case is GREEN at base (measured: my first RED run was `9 failed | 18 passed`, not 11/16). Remedy applied: a `groupField()` helper resolving `.consentGroup .consentRow input[name=…]`. Class, not instance: **any step whose RED reason is "structure X does not exist" must name its selector through X.**
- **F2 · The C3↔C8 coupling is invisible from inside C3.** `S02-S17`'s markup ruling (`PLAN.md:453`) does not say the 17px square's `✓` is a CSS pseudo-element; that is only in `S02-S62` (`PLAN.md:1217`, the glyph rule at `:1225`), which C8 owns. The design extract (`turn-8a-checkbox-group.html:3,7`) draws the glyph as `<span>✓</span>`, and transcribing it literally breaks `S02-S18`'s two byte-exact `textContent` equalities. One sentence in `S02-S17` closes it.
- **F3 · Intermediate dead control, by design, declared.** Between C3 and C7 the `Privacy Policy` control (`apps/ui/components/SignUpFlow.tsx`, `.consentPolicyLink`) is a `<button type="button">` with no handler. C7 wires it (`S02-S51`). Rendered as a button rather than the design's `<a href="#10c">` because an anchor to a non-existent target would violate the standing honesty law and is the mutant `S02-S51` exists to catch. Not a defect; recorded so a reviewer reading the C3 commit alone does not file it.
- **F4 · Pre-existing React warning in the shared auth suite, not mine.** `stderr | tests/render/auth-flow-integration.test.tsx > … > moves password success into a dedicated authenticator screen with a recovery alternative`: *"A component is changing an uncontrolled input to be controlled."* That case renders **`LoginFlow` only** (`tests/render/auth-flow-integration.test.tsx:123`), whose controlled inputs are at `apps/ui/components/LoginFlow.tsx:178,196,242`. My diff touches `SignUpFlow.tsx` and three test files and nothing else (`git diff --stat 91877847..HEAD`). I did **not** re-measure it on a pristine base, so I state the mechanical argument rather than a dated claim: no file in my diff is rendered by that case.
- **F5 · The mutant harness is per-seat, and the obvious implementation eats the cluster.** See §3.3. Belongs in the worker skill or `.hermes/`.

## 6. Toward the one-prompt machine

1. **Ship the per-cluster PLAN extract with the packet** (§3.1). Highest-value single change; it is mechanical, it is the orchestrator's, and it removes the largest fixed cost every coding seat pays.
2. **Give DECISIONS entries an `affects:` cluster list** (§3.2). Converts grep-luck into exhaustive retrieval.
3. **Ship the mutant harness** (§3.3), and add the uncommitted-work `git checkout --` trap to `TOOLING-TRAPS.md`.
4. **State the pseudo-element/DOM boundary in the markup step, not only in the CSS step** (§2.2).
5. **When a step's RED reason is "structure does not exist", write the step's selector through that structure** (§2.1).

What this mission already does right, and should not be "simplified": pinning the *implementation shape* (R17's uncontrolled+mirror) with a measured probe rather than an argument; recording measured-dead idioms as dead; the `Test Files <n> passed (<n>)` third arm; the three-run law; and the chain rule. Every one of those removed a decision I would otherwise have had to make, and the seat's zero-rework result is the direct consequence.
