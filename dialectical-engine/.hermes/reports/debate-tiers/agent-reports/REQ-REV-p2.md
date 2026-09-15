# Self-report — seat REQ-REV-p2 · node REQ-REV pass 2 of 3 · mission `debate-tiers`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**The run.** 21:43:31 → 21:58:01 EEST, **14m30s wall clock**, ~**221k tokens**, one session, zero
retries, zero blocked tool calls, 22 tool calls total. Verdict PASS with 4 N-findings and 3 packet
defects. Main tree `d1ec351b`, 97 dirty entries before and after; I wrote exactly the two files in my
`allowed` list and nothing else.

This is the cheapest node this mission has run, and it is worth saying why before anything else: **the
packet was scoped to eight numbered charges over a diff, not to "review the requirements".** Pass 1
read two whole SPECs and re-derived 42 citations to reach REWORK. Pass 2 re-walked four closures and
reached PASS in a quarter of the tokens. That ratio is the finding. Everything below is about
preserving it.

---

## 1. The cause, not the symptom

**The mission's dominant cost is not thinking. It is re-establishing where the truth currently lives.**

Three separate times in fifteen minutes I had to work out which copy of a fact was authoritative:

1. **`git status` vs the freeze commit.** My charge 1 says to run
   `git status --short docs/missions/debate-tiers` to see what REQ-FIX wrote. It returns **empty** —
   the orchestrator committed the whole mission tree as `d1ec351b` at 21:42:50, **40 seconds before
   dispatching me**. The packet was written against an untracked tree and dispatched against a tracked
   one. I lost ~4 minutes and ~18k tokens establishing that the empty output meant "committed" and not
   "REQ-FIX wrote nothing", then rebuilding the check from `git show --stat` + mtimes + the quotation
   comparison.
2. **`v2ui-data-layer.test.ts` in two places.** Lane `:742-767`, main tree `:783-807`, +41 lines of
   another mission. Every packet in this mission carries a warning about it, which is the tell: a
   warning repeated in four documents is a design defect, not a documentation success.
3. **`BASELINE.md` at three different shapes in one hour.** Five rows inserted mid-file at 21:00–21:02,
   two rows appended at the end at 21:40, and an append-only-at-end rule written at 21:40 to stop the
   bleeding. My **N1** exists purely because the 21:40 append made four sentences elsewhere false.

**The cause is that this protocol has no notion of a document VERSION that a citation can name.** It
has append-only files, freeze markers, and `SPEC-v2.md` beside `SPEC.md` — three different mechanisms,
each invented at the moment it was needed, none of which lets a seat say "as of X". So every seat pays
a re-verification tax on every number it inherits, and every fold by the orchestrator silently
invalidates sentences written twenty minutes earlier.

**The upgrade.** One rule, mechanically checkable, cheaper than all three mechanisms combined:

> **A citation into a mission document names a value or an anchor, never a line.** `BASELINE.md`
> `t9-mode-tokens` **7/9** — not `BASELINE.md:95`. `S01/SPEC-v2.md` **R19** — not `:174`.

The SPECs already do this for requirements — `grep -rn 'SPEC-v2\.md:[0-9]'` over the mission tree
returns **nothing**, every pointer is `R7`, `R19`, `§3` — and that is exactly why re-pointing after the
v1→v2 supersession cost REQ-FIX nothing and cost me nothing to verify. The same discipline applied to
`BASELINE.md` would have deleted my N1 and REQ-FIX's finding (b) outright. Two findings, two passes of
attention, one rule.

## 2. What repeatedly cost tokens — priced

| Cause | Price, this seat | Price, cumulative |
|---|---|---|
| `git status` invalidated by the freeze commit 40s before dispatch (P1) | ~4 min, ~18k | first occurrence; will recur on every seat dispatched after any freeze |
| Reading the pass-1 verdict in full (425 lines) to re-walk four findings | ~35k | unavoidable **and worth it** — see §4 |
| Re-resolving citations I could have been handed | ~25k | ~12 `sed`/`awk` ranges across 9 files; every REV pass pays this |
| `BASELINE.md` shape-churn (N1) | ~8k | REQ-FIX paid it once as its finding (b); I paid it again as N1; a pass 3 would pay it a third time |
| REQ-FIX's own reported cost for the same class of defect | — | **~8 min, ~25k** recovering `SPEC.md` after the packet told it to re-freeze in place |
| Reading skills (4 × SKILL.md) | ~12k | fixed cost, correctly paid, not a target |

**The single largest avoidable line is the third one.** I re-resolved roughly a dozen `path:line`
ranges — `apps/api/src/index.ts:1195-1231`, `packages/critique/src/index.ts:320-360`,
`apps/ui/lib/api.ts:352-400`, `defaults.tsx:40-85`, `contract/src/index.ts:105-120`, the lane copies of
three test files — **and the REQ-FIX handoff §4 already listed every one of them as "ALL VERIFIED"**.
I re-ran them anyway, correctly: `heartbeat-reviewer` §2 says probe, never read, and a reviewer who
takes the author's word is the failure mode this node exists to prevent.

So the fix is not "trust the handoff". It is: **stop making the verification manual.** A
`citation-check.sh` that takes a mission document and re-resolves every `path:line` in it against the
tree (and against a named base commit for lane files) would have collapsed ~25k tokens of `sed` into
one command with a pass/fail per citation, for me *and* for REQ-FIX *and* for pass 1, which spent an
entire section on 42 of them. `packet-check.sh` already exists for packets. **This is the same tool,
one directory over, and it is the highest-leverage script this protocol is missing.**

## 3. Where the packet fought me — exactly

Three places, all reported as P1–P3 in the verdict. The two that matter:

- **P2 is a genuine contradiction between two binding documents, and I want it recorded as such.**
  `heartbeat-reviewer` §7: *copy any probe worth keeping into `.hermes/reports/<m>/probes/` yourself
  ("I will copy it at exit" has failed before)*. My packet's `allowed` is **exhaustive** and lists two
  files, neither under `probes/`. `heartbeat-protocol` §6 forbids crossing the file contract. I obeyed
  the packet and inlined every probe command verbatim in verdict §4 — the right call, but I want the
  next seat to not have to make it. **Either the allowed list gains `probes/<SEAT>-*`, or §7 gains
  "unless your packet's allowed list excludes it".** A seat that has to adjudicate between two binding
  documents mid-run is a seat spending tokens on governance instead of the work.
- **P1's deeper form.** The packet's §2 verification told me to compare `SPEC.md` v1 "byte-identical to
  what the pass-1 verdict quotes" — and *that* check worked beautifully: 13/13 quoted ranges landed on
  the sentence they name, which is stronger evidence than a `git diff` would have been, because it
  proves the *semantic* content survived and not merely the bytes. **The packet contained both a
  broken check (charge 1's `git status`) and an excellent one (§2's quotation comparison) for the same
  question.** Delete the first; promote the second; it is the technique that actually works on an
  untracked tree, and it should be the standard way a reviewer verifies a frozen file.

## 4. What I nearly got wrong

Three, honestly.

- **I nearly filed a false B3 regression.** I was ~80% convinced that
  `tests/render/ux01-new-debate-form.test.tsx:155-170` — which asserts `tier_source: "ASKER"` — would
  flip to `MACHINE_DEFAULT` once R2 preselects Free and R4 disables the risk-tier pills, turning a
  green case red and refuting R7's "R19 keeps green". I had the finding half-drafted. Then I read the
  helper: `chooseRiskTier` (`:122-129`) invokes the pill's **`onClick` prop directly**, bypassing the
  DOM entirely, so `riskTierWasEdited` still becomes true. **The refutation cost me one `grep -A 14`
  and would have cost the mission a rework pass.** The lesson is the one the reviewer contract already
  states and I nearly violated: *build your probe from the CLAIM, not from the patch* — and read the
  test **helper**, not just the assertion. Assertions lie about their own preconditions.
- **I nearly tiered N2 as blocking.** Three `tests/unit/api.test.ts` cases go red under S02's R3, and
  none of the six affected suites has a `BASELINE.md` row — the exact shape of pass 1's B2, which was
  blocking. What stopped me: v1's `SPEC.md:142-143` already said "each of those five suites is run and
  reported", so **no v2 sentence created it**, and my packet says an out-of-scope finding is legal only
  when a v2 sentence created it. Plus `BASELINE.md:88` already obliges the orchestrator to close it.
  Blocking would have spent the mission's **last** rework pass on six baseline rows a script produces
  in a minute. **The scope rule in my packet is what made that call cheap and defensible — it is the
  best sentence in the packet and it should be in every scoped-review packet template.**
- **I nearly accepted "the folds closed" on the strength of the rows existing.** They do exist
  (`BASELINE.md:95-96`, `:99-100`). It was only when I grepped `BASELINE` across the SPEC-v2 files for
  a different reason that I saw R19 still says t9 "has no `BASELINE.md` row yet". **A fold is not
  closed when the fact is fixed; it is closed when every sentence that asserted the old fact is fixed.**
  That is N1, and it is the rule I would add to the orchestrator's fold procedure verbatim.

## 5. Dead ends — do not re-derive these

- **`MAKER_INVENTORY_UNSATISFIED` is asserted by no test.** `grep -rn` over `apps packages tests` finds
  exactly two hits: the throw at `packages/critique/src/index.ts:336` and a registry list at
  `packages/obs-capture/src/registry/index.ts:164`. Making it unreachable under R6 turns **no** suite
  red. I spent tokens confirming this; nobody else needs to.
- **`ASK_PLAN_TIER_MODEL_UNAVAILABLE` does not exist in the repo today.** Zero hits. The code is new.
- **`evaluateAskAdmission` has exactly one production caller** (`apps/api/src/index.ts:1284`) and four
  direct test calls, all in `tests/unit/api.test.ts` (`:137`, `:159`, `:169`, `:179`). R13's grep
  predicate is already complete; re-running it finds nothing new.
- **`type AskConfig = Record<string, unknown>`** (`apps/ui/lib/api.ts:330`). This single line is why
  R13's optional-member pin is free and R21 stays satisfiable. Any future argument about the
  `buildNewDebateAskConfig` → `createDebate` typing starts and ends here.
- **`tests/architecture/s7-authorization-contract.test.ts:173-186` is a non-member** of B2's class: it
  slices the contract source between `export const AskRequestSchema` and `export type AskRequest` and
  asserts the absence of `decision_owner` / `action_owner` / `caller_scope`. `plan_tier` introduces
  none of them.
- **`prov01-honesty-drawer.test.tsx:40-42` asserts a fixture, not a derivation.** R7's change to
  `tier_provenance_ref` cannot reach it. Only a change to `apps/ui/lib/v3/labels.ts:6` can — which is
  row V-14.
- **S01 §2 Acceptance is byte-identical in v1 (`:148-182`) and v2 (`:232-266`).** `diff` is empty. So
  `DONE.md`'s v1 pointers are harmless *today*; do not spend a pass proving it twice (N4).

## 6. The one-prompt machine — what actually moves the needle

Ranked by measured leverage, not by appeal.

1. **`citation-check.sh` — the missing sibling of `packet-check.sh`.** Re-resolve every `path:line` in
   a mission document against the tree, and against a named base commit for lane paths. Pass 1 spent a
   whole section on 42 citations; REQ-FIX spent a handoff paragraph re-measuring ~40; I spent ~25k
   tokens on ~12. **That is three seats doing the same mechanical work by hand across one planning
   node.** One script, ~30 lines, retires the whole category and makes "all citations resolve" a gate
   instead of a claim.
2. **Cite values and anchors, never lines, in mission documents.** Kills N1, kills REQ-FIX's finding
   (b), kills the drift that pushed `V-12`'s `BASELINE.md:40` to `:45`. The SPECs already prove it
   works — zero `SPEC-v2.md:<line>` citations exist anywhere, and the v1→v2 supersession therefore cost
   nobody anything.
3. **Freeze the mission tree BEFORE writing the packets that reference it, not after.** The 40-second
   gap between `d1ec351b` and my dispatch is the whole of P1. A freeze commit whose SHA the packet
   quotes turns "what did the seat write?" into `git show --stat <sha>` — one command, no ambiguity,
   and it works on the tree the seat actually stood in.
4. **Baseline every suite any requirement NAMES, before the first ARCH node — not when a reviewer
   notices.** This mission has now measured baselines in three waves (setup, 21:00–21:02 after pass-1
   N3/B2, 21:40 after REQ-FIX) and my N2 finds a **fourth** wave still owed for six suites. Each wave
   costs a fold, a re-read and a stale-sentence sweep. The extraction is mechanical: `grep` every suite
   path out of every SPEC, diff against `BASELINE.md`'s rows, measure the difference. Do it once, at
   intake, and again automatically whenever a SPEC is re-frozen.
5. **Keep scoping review passes to numbered charges over a diff.** 14m30s and ~221k tokens versus
   pass 1's full read, for a verdict with the same evidentiary standard. **The charges did the
   scoping, and the charge that saved the most was the scope rule itself** — *a finding outside the
   scope below is legal only when a v2 sentence CREATED it*. It let me identify N2 as real and
   simultaneously know it was not mine to block on, in one sentence, without a paragraph of agonising.
   Put that rule in every scoped-review packet.
6. **Give the reviewer the author's `SKILLS LOADED` evidence, or stop asking.** Two consecutive REQ-REV
   passes have now filed the same UNVERIFIED: pass 1 could not check REQ's line, I cannot check
   REQ-FIX's bodies. The floor was *named* correctly both times, so the check has caught nothing twice
   — but it costs a paragraph in every verdict. Either the orchestrator extracts the skill-body
   evidence into the handoff it already extracts (it extracted `REQ-FIX-p2-handoff.md` for me; adding a
   line is free), or the charge moves to the orchestrator, who can read the transcript.

**The compounding one, if only one lands:** items 1 and 2 together. Roughly a third of this node's
tokens, and a visible fraction of pass 1's and REQ-FIX's, went into establishing that numbers written
minutes earlier still pointed at what they claimed. That is not review work. It is bookkeeping the
machine should do, and it is the difference between a protocol that scales to eight parallel seats and
one where every seat re-audits the last seat's arithmetic.
