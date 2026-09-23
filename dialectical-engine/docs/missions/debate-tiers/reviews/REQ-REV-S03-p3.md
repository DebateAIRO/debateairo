# REQ-REV(S03) pass 3 — the cap · scoped blind re-review of `slices/S03/SPEC-v3.md` and the packet `REQ-FIX-S03-p3.md`

- **Seat:** REQ-REV-S03 · **node:** REQ-REV, pass 3 of 3 — THE CAP · **ticket:** `t_d99f6df3` · **date:** 2026-09-13
- **cwd (every command):** the S03 lane — `git rev-parse --short HEAD` = **`9a000c37`**, `git status --porcelain | wc -l` = **0**, read-only throughout
- **Scope (the packet's):** B1(p2) as ADDRESSED · the new R33 · the N1–N3(p2) folds · my own pass-2 §8 predictions and probes re-run against v3. Requirements unchanged since v1/v2 were reviewed in those passes and are not re-litigated.
- **Probes (mine, this pass):** `.hermes/reports/debate-tiers/probes/REQ-REV-S03/p3-v3-deciding-measurements.sh` + `.out` · `p3-runtime-refresh-callsite.out`. Earlier probes re-run, never edited.
- **Never done:** no git write · no stack or provider call · no `.local/**` read · nothing opened on V's desktop · no file under review edited.

## 1. Verdict

**PASS — pass 3 of 3.** Zero blocking findings, two non-blocking folds.

**The slice can go to ARCH on this SPEC.** `SPEC-v3.md` is the SPEC of record; no requirement in it
leaves two builds true, no acceptance step is unrunnable, and the slice is vertical — one file V edits,
one command that applies it, one page that shows the result, one refusal that names what is missing.

B1(p2) is closed on both members, and closed the right way: the seat did not argue with the finding, it
**re-derived the answer from the product** and produced a measurement stronger than my own
recommendation. I tried to refute that measurement and instead confirmed it, and found one supporting
fact the seat did not cite (below). `## 9` carries no V row: nothing at this cap needs V.

## 2. What I verified, and how

| Claim under test | Method | Result |
|---|---|---|
| **The tie-break.** `isExactProviderRuntimeRefresh` admits a targets-only change at the same register version | read `apps/runner/src/dev-api-environment.ts:310-318` | **true** — the loop `continue`s on `PROVIDER_DISCOVERY_TARGETS_JSON` and `SUPPORT_MODEL_TARGET_JSON` and compares every other key exactly |
| …and that function is actually reached | `grep` + `sed -n '488,500p'` | **true, and stronger than the seat claimed**: it is the **first** predicate of the `publishExactFile` reuse check at `:493`, ahead of `isExactPublishedRegisterRefresh` at `:495`. The seat cited only the definition; the call site is what makes Build A the path the product already takes |
| R31's "forced shape" | read `apps/runner/src/dev-provider-panel.ts:103-122` | **true** — `DEV_CLI_PROVIDER_PANEL_TARGET_INVALID` unless (healthy **and** credentialed) or (sentinel-model **and** uncredentialed); `healthyProviderRefs` excludes exactly the sentinel-model targets. "Configured but absent from the healthy panel" is a shape the product already enforces |
| R33's necessity | read `apps/api/src/provider-discovery.ts:125-145`, `:40-50` | **true** — the resolver probes every target in `input.targets` with no exemption, and auth is set only when present, so without R33 a keyless machine would POST unauthenticated to two third parties every freshness window |
| R33 is holdable by a suite | same read | **true** — `fetchImplementation` is injectable (`:125`), so "zero outbound requests for an uncredentialed slot" is assertable without a network |
| `authorization_header` optional on a target | `packages/providers/src/index.ts:165-180` | **true** |
| N2(p2): `PLAN_TIER_ROSTERS` must survive | `tests/architecture/tiers-s02-rosters.test.ts:6`, `:78`, `:204-210` | **true** — imported at `:6`, asserted at `:205`/`:209`, and its **name** is the scan selector at `:78` (`const selectors = ["PLAN_TIER_ROSTERS"]`). Deleting the export would gut three of four cases; "4 kept + 1 new = 5/5" is right |
| Counts in the handoff | `wc -l`, `grep -c` | **485 / 454 / 346 / 95 / 98 / 33 — all exact** (pass-2's N4 retired: this handoff measured at write time) |
| `SPEC.md` **and** `SPEC-v2.md` frozen | `git diff 32add5db --` both paths | **empty** — byte-identical |
| `allowed` list | freeze diff `32add5db..54ad268b` | 8 files: the seat's 5 (INSTRUCTIONS, SPEC-v3 new, PLAN, DECISIONS, its self-report) + 3 the orchestrator's (COMMON, this packet, LEDGER). No product file, no PROGRESS.md, no frozen SPEC, no intake, no V packet, no verdict |
| Hygiene | greps | banned words: only `PLAN.md:17-19`, the ban list quoted as law (the packet excludes it); `ui: no` at line 3; supersession at line 4; PLAN trace **R1…R33 with no gap**; DECISIONS 274 lines, 9 pass-3 rulings; no live text anywhere still carries v2's collapsed clause |

## 3. B1(p2) — CLOSED, both members

**Member (i), `/new`.** R23 now names the five surfaces separately (`:279-293`), and the subtraction is
attached to **exactly one** of them: `:288` *"**→ the discovered-and-HEALTHY panel:** every entry
**minus** each slot absent under R31. This is the only surface the subtraction applies to, and it is the
surface S02's admission filter reads (R15)."* `/new` is `:291` *"every entry, always — never minus
(R16)"*. I re-composed the merge-day path: no key file → R31(a) → exit 0, both Free slots stay
configured, one warning each → `/new` lists both Free ids (R16 + R23.5) → a Free ask reaches
`evaluateAskAdmission`, whose filter matches on `model_id` and finds neither (their targets carry the
sentinel and are excluded from `healthyProviderRefs`) → `422 ASK_PLAN_TIER_MODEL_UNAVAILABLE` naming
`free` and both ids. **The merge-day 422 appears and step 2 stays key-free.** Both are now carried in
the acceptance table with R23.5 cited by number.

**Member (ii), the register / `api.env` / discovery targets — one build, not two.** Build A is adopted
and five requirements now say the same thing: R14 `:167` *"on every machine — whether or not a key for
that entry exists"* · R23.1–3 *"every entry, always"* · R24 `:314` *"A key appearing or disappearing is
not an entry-set change and publishes no version"* · R31 `:263` *"every entry in the file keeps its slot
in the configured set"* · R32 *"all five slots are configured and published"*. **Is there still a second
build? No.** Build B is not merely unchosen, it is now contradicted by name at four places, and the
deciding fact is a property of the product rather than a preference: a key arriving changes only that
target's model and authorization header inside `PROVIDER_DISCOVERY_TARGETS_JSON`, which is the one key
`isExactProviderRuntimeRefresh` skips — a same-version runtime refresh, reached first in the reuse chain
at `:493`. Under B the same event would publish a register version caused by no file edit, which R14.2
and R24 forbid in so many words.

**R31's rewording was the right diagnosis.** My pass-2 §8 predicted ARCH would build B off the phrase
*"every other entry's slot is configured and served"* because of its proximity to the thing being
implemented. The seat reworded exactly that phrase for exactly that reason, and grounded the new shape
in the panel builder's own throw rather than in a choice.

## 4. R33 — an observable, and the closure of a finding rather than new scope

**Ruled: IN, not a V row.** R33 (`:301`) answers the counter I raised at pass 2 against Build A. Three
checks:

- **Observable, not a mechanism in disguise.** The requirement states an outcome — *"zero outbound
  requests to `api.openai.com` and `api.z.ai` — not at startup and not on any probe-freshness window"* —
  and says in as many words that the mechanism (skip the probe for a sentinel-model target, or record it
  ABSENT without a call) is ARCH's. A suite can hold it without a network: `fetchImplementation` is an
  injected input of the resolver (`apps/api/src/provider-discovery.ts:125`), so "never called for an
  uncredentialed target" is a plain assertion.
- **No contradiction.** R13 is scoped to *"each Free entry whose key is present"*, so a credentialed
  probe still runs. R31(b) needs a request, and only for a credentialed slot. S02's admission reads the
  healthy panel and is untouched. The support seam is excluded by name (R26).
- **Not new scope.** It adds no surface, no screen, no token and no V decision; it forecloses an
  unauthenticated call to a third party that Build A would otherwise have made every freshness window.
  A requirement that exists only because a reviewer's counter was correct is the closure of that
  finding. Same reasoning by which the positive limb was ruled IN at pass 2.

## 5. N folds — all three retired, checked one by one

- **N1(p2) — retired.** R11 `:144-150` splits its six refusals into *"five, refusable by a FILE value"*
  and *"one, refusable only by an OBSERVATION"*, and says why (an R3 CLI entry has only `cli` and
  `model`). R20 class 6 `:243` is now *"R11's **FIRST FIVE** refusals"*. R28 demands *"six file fixtures
  — one per R20 shape class — plus one panel-build case for R11's sixth refusal"*. **Class list, fixture
  count and refusal list agree: six classes, seven tests, and the seventh is not a file fixture.**
- **N2(p2) — retired.** R27's `tiers-s02-rosters` row now states case 1's fate explicitly (*"KEPT and
  re-fixtured"*) and the load-bearing fact behind the arithmetic: `PLAN_TIER_ROSTERS` survives as an
  export of `@debateai/contract` fed from `config/models.yaml` at load time — *"what R8 removes is the
  id literals in its source, not the export"*. I verified the three places that would break otherwise
  (`:6`, `:78`, `:205`/`:209`). **4 kept + 1 new = 5/5**, not 3+1.
- **N3(p2) — retired.** R8 `:110-111` names one suite for the positive limb and adds
  *"`tests/architecture/tier01-roster.test.ts` does **NOT** carry this limb"*; R27's `tier01-roster` row
  repeats it. **Exactly one suite.**
- (Pass-2 N4 and N5 were the handoff's counts and COMMON's constant; both are fixed — every count in
  this handoff re-measured true, and COMMON §6 was corrected by the orchestrator.)

## 6. Non-blocking findings (folds; neither gates ARCH)

- **N1(p3) — R33's measurable form names two hosts.** The rule's first clause is general (*"No request
  leaves this machine for a slot that has no credential"*), but the sentence a test would be written
  from names `api.openai.com` and `api.z.ai` (`:302`). The point of this slice is that V adds makers by
  editing the file; a suite written to the two literal hosts would not catch a third maker V adds
  tomorrow. One line for BUILD: assert the rule per **uncredentialed slot**, not per host.
- **N2(p3) — INSTRUCTIONS' global rule is corrected 72 lines below itself.** Line 18 still reads *"Each
  slice's binding spec is `slices/<S>/SPEC-v2.md`"*, and the clause scoping it away from S03 is at
  `:90`. The slice table at `:16` does point at `SPEC-v3.md`, so a reader following the table — the
  normal path — lands correctly; a reader who stops at the prose rule does not.

## 7. Charges, answered

1. **Packet review.** `REQ-FIX-S03-p3.md`'s constants check out against their sources (tickets
   `t_19ed95ac`, `t_d8d52693`, the three fold tickets, base `9a000c37`, the verdict's section offsets,
   the product lines it cites). Its `allowed` list is exhaustive and was obeyed. All six handoff counts
   re-measured exact. Both frozen SPECs byte-identical. **No packet defect found this pass.**
2. **B1(p2)** — closed on both members; no second build. §3.
3. **R33** — observable, no contradiction, not new scope. §4.
4. **N1–N3(p2)** — all three retired, each checked against the product or the suite. §5.
5. **Predictions, `ui:`, banned words, contradictions, trace.** Pass-2 §8 scored in §8 below. `ui: no`
   re-checked and correct: v3 adds no element and no token; R33's observable is a network fact, R31's
   warnings are command output, `/new` still changes in data only. Banned words: none in any criterion.
   Contradiction sweep over what changed: none found — R14, R23, R24, R31, R32 read the same way, and
   R33 sits against R13/R31/R26 without conflict. §0 supersedes S02 SPEC-v2 R1 and keeps S02 R3–R10 live
   through R15. SPEC↔PLAN trace both ways: 33 rows, R1–R33, no gap, no orphan.
6. **Tiering, final.** Zero B. Nothing goes to V from this pass. **The slice goes to ARCH.**

## 8. Predictions from pass 2, scored

- *"The disagreement will be about member (ii), not member (i)"* — **held in shape.** Member (i) was
  mechanical for the seat; member (ii) took the measurement and most of the ADDRESSED comment. No
  disagreement survived, because the seat adopted A rather than contesting it.
- *"ARCH, left alone with v2, would build B — because R31's 'every other entry's slot is configured and
  served' sits three lines from the thing it is implementing, while R14's 'five slots at merge' is
  eighty lines away"* — **held, and confirmed by the seat in writing**: it reworded that exact phrase
  and cited the prediction as the reason. This is the most useful thing either of my prediction
  paragraphs has done across three passes: it named a sentence's *proximity* as the defect, and the
  fix was to move the meaning, not the words.
- *"No one else will notice N1(p3)'s ancestor"* — **untestable**: it was my own finding, ticketed and
  folded, so no independent reader was ever given the chance.

**What I would check first if I were the next lens (ARCH-REV):** whether ARCH's entry→`provider_ref`
derivation keeps R14.2 true for the *rename* case — the same entry edited in place (a `model:` change on
a keyed slot) must not silently become a different ref and republish the register. v3 pins refs "stable
across restarts" for the same file; it does not say what a one-line `model:` edit does to the ref, and
acceptance step 6 is exactly that edit. It is ARCH's to answer, and R14.1 gives it the room — but it is
the first place I would look for a second build.

## 9. Rows for V

**None.** This pass found nothing blocking, so nothing is escalated. Rows **V-34** (the OpenAI key),
**V-36** (the four-line Free entry), **V-37** (`glm-5.3-flash` over `glm-5.3`) and **V-38** (a missing
key or a failing probe starts the stack with the slot absent) keep their binding defaults, and v3 is
written to every one of them; **V-35 is ANSWERED** and folded into R7. R31 still carries the single
sentence naming what moves if V rules V-38 the other way, so V can change that ruling later at the cost
of one block, not one slice.
