# Self-report — seat `REV-S01-p1-product-truth` · REV(S01) pass 1, lens product-truth · mission `debate-tiers`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`, 03:42 → 04:15 EEST, ~33 min wall clock. Verdict REWORK
(B1 + N1–N4). This is the case file, not the review; the review is
`docs/missions/debate-tiers/reviews/REV-S01-p1-product-truth.md`.

---

## 1. The body: what actually killed the truth in this slice

**The cause is not a careless worker. Every worker did what the gate asked. The gate asked the wrong
question.** B1 exists because `tests/render/tier01-new-plan-tier.test.tsx:346` asserts
`#maxTokens.value === "800"` and jsdom answers `"800"` while Chrome answers `"768"`. Three seats, three
green runs, an orchestrator re-verification and a mechanical M-line matrix all passed over it, because
**every one of them asked jsdom.** The oracle (`DONE.md` §3) says its M-lines are measurements of the
*rendered page*; the only instrument pointed at them was a DOM emulator that does not implement
`<input type=range>` value sanitization.

That is the murder weapon and it is reusable: **any oracle line about a rendered value, pinned by a
jsdom assertion, is unverified by construction.** M10 was the member that happened to be off-grid. The
next slice will have its own.

**Upgrade #1 — the highest-value change in this report.** When a slice is `ui: yes`, the cluster
command must include at least one assertion executed in a real browser engine against the running dev
server. Not a screenshot, not a visual diff — one headless-engine read of the properties the M-lines
name. Concretely: a `MEASURE(S)` step that boots the worktree's dev server on a free port, reads the
M-line properties through CDP, and diffs them against a generated JSON of `DONE.md` §3. It would have
produced B1 in seconds, and it would have produced N1 too. Today `REV(S)` is the *first* moment anything
in this mission touches a browser, and it is one seat's discretion whether to bother.

**Upgrade #2 — the oracle should be machine-readable.** `DONE.md` §3 is fifteen prose bullets holding
~90 property/value pairs that I transcribed by hand into probe scripts. The artboards already contain
those values as inline CSS. Emit `DONE.lock.json` alongside `DONE.md` at the `DONE(S)` gate — extracted
from the artboards, not retyped — and both the C5 seat and every REV lens diff against the same file.
That also closes the N1 hole mechanically: `white-space: nowrap` is *in the artboards* on all five id
spans; it was lost because a human transcribed seven of the eight declarations on that element into M7.
**No human should ever transcribe an artboard again. The transcription step is where fidelity dies.**

## 2. What repeatedly cost tokens — measured, in order

| cost | what happened | price | fix |
|---|---|---|---|
| **The background-tab input trap** | `computer left_click` silently delivers nothing while the tab is not fronted. Three clicks on `⚙ OPTIONS` "did nothing". I was one sentence from filing "SPEC step 6 fails: the OPTIONS panel does not open" — a **false B against an innocent seat**. | ~9 tool calls, ~25k tokens, ~5 min | It is now `browser-probes.md` §0 + §1: a mandatory method-validation block before any negative result. Put that paragraph in `TOOLING-TRAPS.md` under a heading like "A background browser tab swallows clicks and returns no error". |
| **The scaled-viewport coordinate frame** | After fronting, `resize_window` to 820×1100 (larger than the 529×321 pane) scales the render; `ref` coordinates then land on `<html>`. Same silent-nothing signature as above. | ~5 calls, ~12k tokens | Same trap entry. Use `.click()` for state transitions once validated; reserve trusted clicks for the few checks that need them. |
| **The 529×321 pane read as a layout defect** | At the pane's own viewport the consent bar covers the actions row. I nearly filed a cross-slice overlap finding. At 1440×900 all four overlaps are null. | ~4 calls, ~10k tokens | Never judge geometry at the pane's default size. `browser-probes.md` §5 says so in the file. |
| **A regex that truncated two authors' `SKILLS LOADED` lines** | My first parse reported C2 and C3 as missing the entire worker floor. Both were complete — the lines use `;` and are >1200 chars. **Two fabricated findings against two seats, avoided only by re-reading my own output.** | ~3 calls, ~8k tokens | Emit `SKILLS LOADED` as a machine-readable list (one skill name per entry, names not absolute paths). The current convention — 1.5KB of absolute paths per seat — is unparseable, unreadable, and the protocol itself says a path proves nothing. **Change the convention to bare skill names.** |
| **My stub API died mid-run** | Started with `nohup … &` from a Bash call; the tool reaped it at command end. Silent 502s later looked like an auth regression. | ~4 calls, ~9k tokens | Long-lived probe processes go through the Bash tool's `run_in_background`, never `nohup &`. Worth one line in the dev-stack recipe, which currently prescribes `nohup … &`. |
| **Re-deriving the suite runner** | The runner the package names lives at `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh`, which is **not tracked in git**, so it does not exist in a detached worktree. I retranscribed it from the cluster map. | ~2 calls, ~6k tokens | Track the runner in the repo, or ship it inside the review package. Every REV lens pays this toll, in parallel, three times over. |

**Total burned on harness archaeology rather than review: roughly 70k tokens and 12 minutes of a
33-minute run — about a third.** None of it was about the slice.

## 3. What I nearly got wrong

1. **"The OPTIONS panel does not open"** — would have been a false B1 against BUILD-S01-C3. Saved by
   installing a capture-phase listener and seeing `clicks: []`: the page never received the event. The
   discipline that saved it is the one worth institutionalising — *before reporting that something did
   not happen, prove your instrument can observe it happening.*
2. **"Two BUILD seats under-loaded their skills"** — saved by distrusting my own parser when the result
   looked too damning.
3. **"The consent bar covers Start run"** — saved by re-measuring at a real viewport.
4. **`tier_provenance_ref: "machine:plan-tier-free"` on a Premium ask.** I had this written up as a
   blocking data-integrity defect. Then I found SPEC-v2 R7's explicit ruling — "the rule is on the
   mechanism, not on the tier" — and demoted it to a recorded observation. **A reviewer who greps the
   code but not the frozen SPEC will file this.** I predicted in the review that another lens will.
5. **B1's tier.** I still hold it blocking, and I wrote the strongest counter into the finding rather
   than hiding it: no numbered acceptance step fails and the value is never sent. If the orchestrator
   or V reads it as N, the argument to overturn me is already on the page.

## 4. Dead ends — do not re-derive these

- `resize_window` above the pane size is fine for **measurement** (computed styles and
  `getBoundingClientRect` report true CSS pixels) and useless for **input**. Both, not either.
- Screenshots require the tab fronted. I chose not to steal the pane from `tab-4` (another seat's) for
  pixel work and measured properties instead — the packet asks for "rendered DOM with the real compiled
  CSS", which is exactly that. Do not burn calls trying to screenshot from the background.
- `pgrep`/`nohup`/`setsid` from the Bash tool will not keep a server alive. Only `run_in_background`.
- `grep -rn … apps` inside a worktree that has run a dev server will hit `.next/trace` and return 1.3MB.
  Always `--exclude-dir=.next --exclude-dir=node_modules`. (`.next` is gitignored, so the worktree still
  ends byte-clean — verified `git status --short | wc -l` = 0 at exit.)
- `LibraryComposer` is **not** a plan-tier regression. The risk_tier guard at `api.ts:373` throws before
  the new plan_tier guard at `:375`. Someone will re-investigate this; the answer is in the review.

## 5. Where this packet fought me — exactly

- **`allowed` vs `COMMON.md:25`.** COMMON orders any seat with a contested product question to write a
  `V-ROW: NEW` block into the slice's `DECISIONS.md`. My packet's `allowed` list is declared exhaustive
  and excludes it, and `forbidden` names "the slice's files" explicitly. I had a genuine V question (N2)
  and **no lawful place to put it.** I obeyed the packet and parked the block in my review, which means
  it only reaches V if the orchestrator notices. Filed as N4. This is a template bug, not a one-off:
  every review seat that finds a product question hits it.
- **"probe, never read" vs the duty to check the author's assertion.** §2 says build from the CLAIM, not
  the patch or its test. But B1 *is* a defect in an assertion — I could only diagnose why three green
  runs missed the browser value by reading `tier01-new-plan-tier.test.tsx:346`. The rule should say what
  I did: probe first, independently; read the author's test only after your own probe has produced a
  result, and only to explain the divergence.
- **The packet's `verification` line demands "one mount of every surface this slice shares with another
  slice or with the app shell" and never says how to enumerate them.** I found the consent bar and the
  support widget by *looking at a screenshot* and noticing unexpected chrome. A slice packet should carry
  the list — the orchestrator can generate it from the layout tree far more reliably than I can find it
  by eye.
- **Good, and worth keeping:** the packet's constants were all correct (I checked all seven), the review
  package was genuinely mechanical, and `dev-stack.md` naming what `/new` needs before it renders saved
  me a solid ten minutes of reverse-engineering `AuthGate`.

## 6. Toward the one-prompt machine

Ranked by tokens saved per unit of effort:

1. **`DONE.lock.json` generated from the artboards** at the `DONE(S)` gate. Kills hand transcription
   (N1's whole cause), gives C5 and all three lenses one instrument, and makes "does the build match
   what V accepted" a diff instead of an essay.
2. **A browser-engine assertion inside the cluster command on every `ui: yes` slice.** Kills the B1
   class — the false green that no amount of reviewer diligence reliably catches, because the reviewer
   has to guess which of ~90 property/value pairs jsdom lies about.
3. **`SKILLS LOADED` as bare skill names, not absolute paths.** ~1.5KB per seat today, unparseable, and
   the protocol already says paths prove nothing. Pure loss.
4. **Ship the runner and the surface inventory in the review package**, and track `run-suites.sh` in git.
   Three parallel lenses currently each re-derive the same two things.
5. **Fold §0–§1 of my `browser-probes.md` into `TOOLING-TRAPS.md`.** The background-tab click trap
   manufactures *false findings against innocent seats*, which is the most expensive failure this fleet
   can produce — worse than a missed defect, because it burns a rework cycle and the author's trust.
6. **Reconcile `allowed` with COMMON §4** in the packet template — one line, closes N4 permanently.

The thing this run should be judged on: the slice is genuinely good. Fourteen of fifteen M-lines match
the oracle to the pixel in both modes, all twelve acceptance steps pass, the wire is exactly right, and
twelve cluster runs are stable. The one real defect was invisible to every instrument the pipeline owns.
**Buy the instrument, not more reviewers.**
