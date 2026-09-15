# Self-report — CODE-REV-CROSS-01, round 1 (mission `consent-ui`)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer,
superpowers:verification-before-completion, superpowers:systematic-debugging,
superpowers:receiving-code-review`

Seat: blind code reviewer, Claude Opus 5, fresh session. Verdict PASS with 3 N-findings and 9 packet
findings. Worktree `.worktrees/rev-cross-01/dialectical-engine` @ `bd314084`, porcelain 0 at CLAIM and
0 at handoff. Wall clock: ~1h05m from CLAIM to handoff.

---

## 1. The body — what the review actually turned on

The change is 53 lines of helper and four wiring lines, and it looked settled before I started. It was
not. **The whole review turned on one question the packet could not answer: which of two orderings is
right.** Everything else — export surface, boundaries, gates, RED frames — was mechanical and produced
no finding.

The lethal detail: the work packet, V-22's default, and a prior reviewer's remedy all say
*named-control-first*, and named-first is measurably wrong in this product. It is wrong because of a
requirement written in a DIFFERENT slice (S01-R14: the returning bar is a function of the STORED
decision, not of the entry point), which makes the bar come back *underneath* the card even when the
card was opened from Settings. Three artefacts said the same wrong thing because each copied the one
before it. **The author caught it, and the correction is right; nobody upstream caught it in three
transcriptions.**

## 2. CAUSE — not "the packet was wrong", but *why* it was wrong three times

A wording was propagated by transcription (`CODE-REV-S01-C6-r1` remedy → `V-22` default → packet
§2.1) and never re-derived against the slice it constrains. COMMON §10.22 exists for exactly this and
was followed to the letter — the r1 remedy was marked `BINDING (measured: …)` — but **the measurement
it cited covered a different claim** ("the ref is attached and connected at cleanup", which is true)
than the sentence it licensed (the ORDERING, which was never measured). A `BINDING (measured: X)` tag
on a remedy whose *X* proves only part of the sentence is indistinguishable, downstream, from one that
proves all of it.

**Upgrade (cheap, mechanical):** `BINDING (measured: …)` must name the CASE that goes RED when the
remedy is wrong, not the fact the remedy relies on. If a remedy has no such case, it is ADVISORY. One
clause in COMMON §10.22, and the three transcriptions here would have stopped at the first one.

## 3. What cost the most tokens, in order

1. **The reading list, by far.** COMMON (149 lines) + INSTRUCTIONS (99) + BASELINE (49) + two packets
   + the SPEC/PLAN excerpts + the 728-line review package. Roughly 60% of my input budget before a
   single measurement. Most of it was necessary; the part that was not is the part I had to *hunt*:
   `CMD-C6` and `CMD-C7` live at `S01/PLAN.md:789-836` and `run`/`run_c9` at
   `S02/PLAN.md:1377-1417`, and my packet named them by ID only. I ran three greps to find four fenced
   blocks. **Upgrade:** a review packet that orders a command transcribed verbatim carries its
   `path:line-line` beside the ID (COMMON §10.5 already says this for product files — extend it to
   PLAN command blocks).
2. **The `git show <rev>:<path>` root trap.** The git root is one level ABOVE the project root, so
   `git show 2127c4ad:apps/ui/...` fails with `exists, but not …` while
   `git diff … -- apps/ui/...` works (pathspecs are cwd-relative, `<rev>:<path>` is not). Cost: one
   failed batch, ~3 minutes. **Already in TOOLING-TRAPS twice (`:1052`, `:2292`) — I deduped and did
   NOT re-append it.** Which is itself the finding: an entry recorded twice still cost a third seat
   three minutes, because 2,585 lines is past the length anyone reads front to back. The traps file
   needs an index by SYMPTOM STRING (`exists, but not`) that a seat greps before it debugs, not after.
3. **Finding the packet snapshot.** My packet cited `snapshots/packets/CODE-CROSS-01.md.at-dispatch`
   relatively; it is under `.hermes/reports/consent-ui/`, not `.hermes/planning/consent-ui/`. One
   wasted `find` over the wrong tree.
4. **My own probe's storage fixture.** I seeded a six-key decision object; `isDecision()` requires
   EXACTLY five keys, so the bar kept showing and one probe case failed for a reason that had nothing
   to do with the work. Cost: one re-run, ~4 minutes. Cheap, and it taught me the validator is strict
   in the way the SPEC says it is.

## 4. What I NEARLY got wrong

- **I nearly accepted the export-diff probe my packet handed me.** It says to run
  `git diff … | grep '^[-+]export'` and rule on the result. That grep prints **nothing** for this
  commit — and "nothing" is the same output for "no signature changed" and for "a member was added
  inside a type body, which carries no `export` prefix". I only noticed because I printed both type
  bodies as well. **A probe whose PASS and whose blind spot produce identical output is not a probe.**
  Had I stopped at the grep, my §1 ruling would have been right by luck.
- **I nearly filed a regression that does not exist.** The new `opener !== document.body` term fires
  for every surface, including the one consumer that omits the member, so I built a probe to catch a
  behaviour change (`focusElement(document.body)` at base vs nothing at HEAD). Measured on both
  products: identical, because jsdom's `body.focus()` is a no-op. **Refuted my own hypothesis before
  it reached the verdict** — and then had to say honestly that a real browser DOES blur on
  `body.focus()`, so the refutation is jsdom-scoped. That nuance is in §11 of the verdict, not in a
  finding, and getting it the right way round took two runs.
- **I shipped three markers with a stale comment cursor, and only caught it at the last `k show`.**
  The board had 0 comments when I claimed at 05:07; the orchestrator's DISPATCH landed on my ticket in
  the same minute, and `CLAIM`, `HEARTBEAT` and `FULLY DONE` all carried `comments read through: 0`.
  I read it after posting `FULLY DONE` and filed a CURSOR CORRECTION comment. It changed nothing —
  it restates the packet's constants, all honoured — but that is luck, not process. **CAUSE: the
  cursor is measured once, at CLAIM, and then transcribed. Every later marker copies a number nobody
  re-measured.** Upgrade, one line in COMMON §3: a marker's cursor is re-measured (`k show`) at the
  moment the marker is posted, never carried forward; the CLAIM cursor is the only one that is a
  transcription. This is the same shape as §10.24 (a cited line is measured at write time) applied to
  a number instead of a path.
- **I nearly upheld a charge my own packet made.** Charge (iii) — "the packet predicted two new cases
  where the suite gained four, COMMON §10.42 forbids count predictions". Reading §10.42's actual text
  against §2.3's and §2.4's actual text: the packet prescribed a case LIST (legal) and explicitly
  refused to predict a count FIGURE (§10.42's prescribed wording, quoted). The charge is refuted as
  worded and upheld on substance. **A reviewer handed a charge by the orchestrator is being handed a
  conclusion; it needs the same measurement as the author's claims.**

## 5. DEAD ENDS — do not re-derive these

- `document.body.focus()` in jsdom is a no-op; it does not blur. Any argument about the `body` term
  changing behaviour for existing consumers must be made in a browser, not in vitest.
- `:focus-visible` (not `:focus`) is what the S01 block styles (`globals.css:7363`), so programmatic
  focus after a pointer interaction shows no ring. The "mouse users now get a focus ring" worry is
  dead.
- `run_c9`'s merge arms cannot pass at this head and never could: `--scrim` is the mission's
  MODE-INDEPENDENT token (COMMON §7), declared once, so `grep -c -- '--scrim:'` is 1 and not 2; and
  the S02 closing marker reads `=== end consent-ui S02 ===`, which does not contain the substring the
  arm greps, so that count is 1 and not 2. Ticket `t_4f97ca86`. **The property both arms stand for
  holds** — stop re-measuring it; the derivation is in the verdict's P8.
- `CMD-C6`'s `n_s02c` arm is 0 by construction in this lane and cannot be made to count this commit
  without swapping the moving branch ref for the recorded sha `2127c4ad`. Two seats have now measured
  this independently.

## 6. Where THIS packet was unclear, exactly

- **§4, "close by Escape, by the scrim, and by the dismiss control".** There is no dismiss control:
  S01-R18 gives 10b no close glyph and the footer is exactly three buttons. I spent a probe case
  proving the absence so the charge could be answered rather than skipped. **A packet that names an
  affordance the design deleted costs a probe every time.**
- **§1's snapshot path** is relative and resolves nowhere (COMMON §10.45 requires absolute main-tree
  paths, and §10.36/§10.38 say why).
- **§4, "the sixteen-file set as pinned in `BASELINE.md` (addendum 05:10)"** — that addendum's last
  bullet is the author's claimed `185/185`. The packet's own reading list therefore delivers the
  author's headline figure before the appendix. Same for `V-DECISIONS-PACKET.md:180`, which carries
  the author's RULING. **This is the most important process defect I found** and it is P1 in the
  verdict.
- **§4's charge (iv)** asks me to "measure `n_s02c`" without saying against what; I measured it
  against both the moving ref (0) and the recorded base (1), which is what makes the remedy
  actionable.

## 7. How to make this more of a one-prompt machine

1. **Kill the leak, don't paper over it.** A blind review packet must be able to state, mechanically,
   that no document on its reading list contains the author's figures. Concretely: `BASELINE.md` gets
   a `## CLAIMED — UNVERIFIED` section that review packets exclude by name, and rows move up to the
   pinned table only when the review closes. Cost: two lines of process. Benefit: blindness becomes a
   property of the file layout instead of a hope about reading order.
2. **Ship the probe runner with the packet, not the trap about it.** Every review seat in this mission
   has now re-derived the same scratchpad `--config` (root = config dir, `LANE` from env, the lane's
   alias array *including* `@`). It is two TOOLING-TRAPS entries and a promoted file, and it still
   costs each seat a read and an edit. **Make it a template the packet names by absolute path with
   "copy, change `include`, done".** I did exactly that and it worked first time; the cost was finding
   the two entries that describe it.
3. **Give the reviewer the base commit's TEST files, not just the diff.** Three of my measurements
   (it()-count delta, RED-first replay, export surface) needed `git show <base>:./<path>`, and the
   `./` requirement is a trap in a nested-root repo. A review package that ships `base/` and `head/`
   trees, or simply states the two counts, removes a whole class of tooling friction from every review
   seat.
4. **Ask for a PROPERTY, not a case list.** The packet's §2.3 enumerated two cases; the correct
   implementation needs four, and a packet whose precedence is wrong cannot enumerate the case that
   falsifies it. "Pin every reachable combination of (entry point × stored decision × opener survival)
   and say how many there are" would have produced the author's own three-row table on the first pass.
5. **Three-run tables are cheap; make them free.** My `gates.sh` runs every gate ×3 with a commit
   column in one `/bin/bash` invocation and took 6 minutes unattended. Promoting *that* (lane from
   argv, gate bodies transcribed from the PLAN) as the mission's standard artefact would save every
   coding and review seat the transcription — which is also where COMMON §10.43's "transcribe
   verbatim, never paraphrase" gets violated.

## 8. Price of each finding

| finding | how it was found | wall clock |
|---|---|---|
| P4 (packet precedence unsatisfiable) | mutant M4 + one probe case | ~12 min |
| P5 (`n_s02c` degenerate) | one `git log` before the gates ran | ~2 min |
| P8 (merge-arm constants) | reading the gate log, then two greps | ~4 min |
| N2 (survived ≠ focusable) | invented from the SPEC property; two probe cases | ~15 min |
| N1 (unpinned Settings+stored case) | the packet named it; my probe confirmed the behaviour | ~5 min |
| N3 (ADR narrower than code) | comparing the ADR sentence to the cleanup line by line | ~6 min |
| P6 (charge refuted) | reading §10.42's text against §2.3/§2.4's text | ~5 min |
| dead ends 1 and 2 | two probes and a stylesheet grep | ~12 min |

The two most valuable findings (P4, N2) cost 27 minutes between them and both came from **inventing a
fixture the packet did not ask for**. Everything the packet asked for verbatim produced zero findings
and confirmed the author. That ratio is the argument for keeping the "build your own probe" clause at
the top of the reviewer contract.

## 9. Artefacts on disk

- verdict `docs/missions/consent-ui/reviews/CODE-REV-CROSS-01-r1.md`
- this file `.hermes/reports/consent-ui/agent-reports/CODE-REV-CROSS-01-r1.md`
- probe kit `.hermes/reports/consent-ui/probes/code-rev-cross-01-r1-*` (3 probe files, 3 runner/driver
  scripts, 5 logs; lane from `argv`/`LANE`, §10.35 checked with a comment-excluding grep — see the
  trap below)
- `.hermes/TOOLING-TRAPS.md` **2564 → 2585**, append-only, 2 new entries; the `git show <rev>:<path>`
  trap was deduped out (already at `:1052` and `:2292`).
- Lane: no writes. `git status --porcelain` = 0 at CLAIM and 0 at handoff; every mutant and every
  RED-first revert snapshotted with `cp` and restored with `cp` + `diff -q`, never `git checkout --`.

**comments read through: 4** on `t_3315d8b1` (0 at CLAIM; the ORCHESTRATOR DISPATCH landed in the same
minute and was read after the FULLY DONE marker — CURSOR CORRECTION posted, nothing in it changes a
finding); **7** on `t_c1068d6f`, all read in the appendix step only.
