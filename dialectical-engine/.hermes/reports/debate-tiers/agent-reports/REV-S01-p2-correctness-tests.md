# Self-report — seat `REV-S01-p2-correctness-tests` · REV(S01) lens correctness/tests, pass 2 (scoped)

Mission `debate-tiers` · ticket `t_f8494fff` · session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886` ·
worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine`
detached at `53b903d2`, 0 dirty at CLAIM and 0 dirty at handoff · 05:24 → 05:41 EEST, ~17 min wall clock.

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 1. The body: what actually happened on this slice

The victim is not a bug. It is a **ratified decision that died without a death certificate**.

`docs/missions/debate-tiers/slices/S01/DECISIONS.md:12` ratified, at the REQ node, how a locked gauge
is locked: *"The native `disabled` attribute on the existing controls"* — and its recorded rationale
was, in the same row, *"a disabled control drops out of the tab order without extra code"*.
`DECISIONS.md:217` then bound the two concurrent build nodes to that vocabulary: *"The locks:
`.ndSegItem:disabled`, `.ndSlider:disabled`, `.ndSteerInput:disabled`, `.ndSelect:has(select:disabled)`
(MOCK F1 — **no page-side hook needed**)."*

REV pass 1's product lens then filed N3 (`t_7f4df45a`): the lock explanation is unreachable by
keyboard, *because* `disabled` leaves the tab order. That finding and `DECISIONS.md:12` are in direct
contradiction — the finding attacks the exact property the decision was chosen FOR. FIX(S01) F1
resolved the contradiction by reversing the ratified decision on its own authority: native `disabled`
out, `aria-disabled` + `aria-describedby` + an inline `FREE_LOCK_STYLE` in. Its READY comment names
the consequence honestly (*"the disabled/aria-disabled seam goes to REV p2"*) but contains the strings
`DECISIONS`, `ratified`, `tab order` and `V-ROW` **zero times**. The reversal was never surfaced as a
decision; it was surfaced as a seam for a reviewer to judge.

**CAUSE, not symptom:** there is no rule in the protocol that says *a finding that contradicts a
ratified DECISIONS row is a V row, not a FIX*. So a FIX seat facing that contradiction has exactly two
legal-looking moves — obey the decision and leave the finding, or obey the finding and silently kill
the decision — and it will pick the second, because its packet lists the finding and not the decision.
Every downstream cost in this review traces back to that missing rule.

The second-order damage is mechanical and is my blocking finding: the stylesheet still carries the
`:disabled` lock rules (`globals.css:6264-6270`) that **nothing on the page can match any more**, and
the style contract still pins them (`tests/unit/tier01-style-contract.test.ts:159-164`) under a comment
claiming to assert the ratified M8 treatment. I proved it bites both ways — deleting the dead CSS turns
the gate RED with zero product effect (render suite still 22/22), and breaking the real M8 value
(opacity .45 → .9) leaves the gate GREEN at 8/8.

## 2. What we must upgrade — five rules, each cheap, each bought with real damage

1. **A finding that contradicts a ratified DECISIONS row is a V row, not a FIX.** The FIX packet must
   carry the DECISIONS rows that govern the surface it touches, and a seat that must reverse one stops
   and writes `V-ROW: NEW`. Cost of not having it: this entire pass-2 blocking finding, plus a pass 3.
2. **Promoted probes must be portable, and promotion must enforce it.** The five security probes and
   their vitest config hard-code `/…/.worktrees/rev-s01-p1-security/…`, and **that worktree is still
   parked at `f6c147cc`, the pass-1 head**. The package told me to re-run every promoted probe at
   `53b903d2`; obeying that instruction literally would have measured the pre-FIX tree and reported a
   confident, worthless green. Promotion should rewrite the lane root to a `$LANE` placeholder, or ship
   one `run-probes.sh` that takes the worktree as argument. This cost me ~20 minutes and three failed
   harness attempts — the single largest line item of the run.
3. **A test that asserts a property must be shown to measure it.** The mission has now hit this class
   twice on one slice: pass-1 correctness N1 (*pins token NAMES, not values*) and my B1 (*pins CSS no
   element can match*). Both are the same disease — an assertion whose stated property and whose actual
   subject have drifted apart. The mechanical cure is already in this repo's vocabulary: every
   `PROPERTY` comment owes one mutation that makes it RED. Make that a BUILD-node deliverable, not a
   reviewer's discovery.
4. **Class remedies must land on the branch they govern.** `F20_S1` (`t_e74b5bf1`, closed) synced the
   stale `.codex` skills in `79fb2183`. `79fb2183` is **not an ancestor of `53b903d2`**, and the lane
   still carries the tracked v3.1.0 / spine-3.0.0 `.codex/skills/heartbeat-protocol/SKILL.md` — 341
   diff lines from the v4.0.0 authority. Both FIX seats read superseded law, and the next Codex seat
   dispatched into this lane for pass 3 will read it again. A ticket closed on a commit that never
   reaches the surface is not a closed ticket.
5. **Pair counts are not a regression check.** Ten of this slice's suites have non-zero expected
   failures. A suite can swap which tests fail and keep its pair identical. I checked the failing test
   **names** on both sides (30 names, byte-identical sets) — that took one scripted run and is the only
   thing that makes `CLUSTER_GREEN` mean what everyone reads it as meaning. Put name capture in
   `run-suites.sh` and the whole fleet gets it for free, forever.

## 3. What repeatedly cost tokens

- **Probe harness resolution: ~20 min, 3 dead runs, the run's biggest cost.** The probe files live in
  `/private/tmp`, outside the pnpm workspace, so bare specifiers (`@debateai/contract`, `@debateai/api`,
  `zod`) do not resolve from the importing file's directory. Moving the vite `root` did not fix it —
  resolution is per-importing-file. Only explicit `resolve.alias` entries to
  `node_modules/@debateai/<pkg>/<its exports entry>` worked. **This is a permanent, mission-wide tax and
  the fix is one committed file**: a `vitest.probe.config.ts` template in
  `.hermes/reports/<mission>/probes/` with the aliases already written and the lane root as a variable.
  Every reviewer in this fleet is re-deriving it from zero.
- **Two incompatible probe conventions in one promoted set.** The security lens's probes use absolute
  lane paths; the correctness lens's `probe.test.ts` uses relative `../../apps/ui/...` that only resolve
  from inside the worktree's `tests/` tree. Neither is documented. I had to read both and repair both.
- **Reading the whole `tier01-new-plan-tier` harness bootstrap to write one fixture.** Unavoidable
  today, and it is pure repetition: every render-lens reviewer on this app re-reads the same jsdom +
  `vi.mock("next/navigation") / AuthGate / @/lib/api` preamble. Extract it to
  `tests/render/support/newPageHarness.ts` and reviewers spend their tokens on assertions instead.
- **`grep -o` with a wide `[^"]{0,220}` window blew up ugrep** ("exceeds complexity limits") on the
  board comment dumps, twice, costing two round-trips. Board text is UTF-8 with `·` separators; use
  `python3` for context extraction on ticket JSON, never a bounded-window regex.

## 4. What I NEARLY got wrong

**I nearly reported a control that does not exist as a missing control.** My own fixture listed the
budget pills as `budgetTier-low / -standard / -high`. Three probes went RED on `budgetTier-standard`,
and the shape of the failure — one id, missing everywhere, only under Free — looked exactly like a real
lock defect. The real option set is `low / **medium** / high` (`page.tsx:36-40`). I caught it only
because I made it a rule to read the source before writing any finding up. Had I trusted my own probe's
RED the way reviewers are told to trust RED, I would have filed a fabricated blocking finding against a
seat that did nothing wrong. **The lesson is narrow and worth keeping: a reviewer's own fixture is
evidence about the fixture until its identifiers are checked against the source.**

I also nearly mis-priced P1. My `driveLikeABrowser` helper is RED against the pre-FIX page — but that
RED is an artifact: assigning `.value` and dispatching bypasses native `disabled` in jsdom, which a real
browser would never permit. Reported as a discriminator it would have been a false claim that the
pre-FIX page leaked values. It is a *confirmation* probe at the FIX head and I labelled it that way.

## 5. DEAD ENDS — do not re-derive these

- **`--m-gemini` / `--m-qwen` / `--m-default` are not missing.** `modelMeta` can now emit all six dot
  tokens where the old `modelIdentity` emitted three. All of them are declared in BOTH mode blocks
  (`globals.css:40-41` and `:146-147`). There is no latent unresolved-token dot. (~2 min)
- **The locked pills cannot submit the form.** Removing native `disabled` from a `<button>` inside
  `<form>` normally makes it a submit button; here every pill already carries `type="button"`
  (`page.tsx:455`, `:189`, `:330`, `:413`). No accidental submit. (~2 min)
- **The form's `onKeyDown` is not a lock bypass.** It ignores everything but Ctrl/Cmd+Enter and then
  calls `submit`, which returns early on `!ready` (`page.tsx:141-175`). Focusing a now-focusable locked
  control and pressing Enter does nothing new. (~2 min)
- **The B1 step-grid class has exactly one member and it is fixed.** All four sliders swept:
  `treeDepth` 1..5/1/2 · `branchingWidth` 1..4/1/2 · `concurrency` 1..6/1/3 · `maxTokens` 128..4000/32/800.
  Every value and every max sits on its own grid. No second member to hunt.
- **The FIX moves nothing on the API/contract surface.** 78 promoted probe tests, 75/3 identical on both
  sides, same three red names. C2 is the known pre-existing T4 (`t_77100e37`). Do not re-run these
  against a FIX that touches only `page.tsx` and `globals.css`.

## 6. Where THIS packet fought me, exactly

- **`packet:10` misdescribes its own input.** It calls the S01-p2 package *"(diff vs base, every cluster
  command + three-run table, the cluster map, the acceptance oracle, the dev-stack recipe)"*. The
  S01-p2 directory carries only `diff-f6c147cc..53b903d2.patch` — a diff vs the **pass-1 head**, not
  base — and carries no cluster map and no dev-stack recipe; those are in S01-p1, as that package's own
  README says. The packet describes the pass-1 package while pointing at the pass-2 directory. I lost a
  cycle looking for a base diff that was never there.
- **`packet:9` vs `COMMON:3` disagree on cwd.** The packet says the worktree; COMMON says the repo root
  is *"the cwd for every command"*. The packet is right for a detached-worktree review seat and I used
  it, but COMMON's line is stated as universal and it is not. Say "your lane" in COMMON.
- **`packet:17` demands "one mount of every surface this slice shares with another slice or with the app
  shell" for EVERY lens, including mine, but `README:20` scopes my lens to items 1, 2, 4, 5, 6 and the
  seam's (c)/(d) *at the test level*, and gives the real DOM in both modes to the product lens.** Two
  documents, two scopes, and the more expensive one is in the packet. I followed the README's scope and
  said so; a seat that followed the packet would have duplicated the other lens's entire browser pass.
- **The pass-2 scope says "every promoted pass-1 probe re-run at `53b903d2`" and ships `probes-p1.txt`,
  a bare list of 17 absolute paths with no recipe** — six of which are `.log`/`.txt` artefacts that
  cannot be "run" at all, and five of which silently point at another lane's tree. "Re-run these" is not
  an executable instruction in this state.

## 7. Toward the one-prompt machine

Three of this run's four upgrades are the same shape: **a fact was true somewhere and the seat that
needed it could not see it.** The decision was in `DECISIONS.md` and the FIX packet did not carry it.
The stale protocol was fixed in `79fb2183` and the branch did not carry it. The probe's lane root was
true in the security lane and the promoted copy carried it anyway, frozen.

The one-prompt machine does not need more instructions in packets. It needs **the packet generator to
compute closure over the surface being touched** — for each file in `allowed`, the DECISIONS rows that
govern it, the open findings that name it, and whether every class remedy claimed closed is an ancestor
of the head being dispatched. All three are one `git merge-base --is-ancestor` and two greps. Every one
of them is a question a seat cannot answer from inside its own reading floor, which is exactly why the
scheduler must answer it before the seat starts.

And one thing to *stop* doing: promoting probes as frozen absolute-path snapshots. A probe whose lane
root is baked in is not reusable evidence — it is a landmine that reports green from the wrong tree.
Promote a probe as a script that takes the worktree as its first argument, or do not promote it.
