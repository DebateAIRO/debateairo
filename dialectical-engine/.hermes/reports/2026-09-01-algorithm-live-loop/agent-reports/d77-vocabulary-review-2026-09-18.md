SKILLS LOADED: superpowers:verification-before-completion

# Task 3 — BLIND review — "the site says what the code decided: supported, contested, unsupported"

**Range reviewed:** `382d9d0c..02b42592` (verified: `382d9d0c` is the direct parent of `02b42592`, and the range holds exactly one commit — `git log --oneline 382d9d0c..02b42592`). The implementer's stated work base `7bae9806` is two commits earlier; the two intervening commits (`9c51c8ab`, `382d9d0c`) are the acceptance seat's credential work and touch none of this task's five files, so the base measurements quoted in the report remain applicable.

**Method:** the packaged diff was my view of the change. Outside it I made four focused checks, each named against a risk: (1) the label ladder `deriveVerdictLabel` and the `VerdictLabelQuantity` semantics it rests on (`packages/serve/src/index.ts:1241-1381`), to judge the sentences rung by rung; (2) the retired-vocabulary sweep and the older evidence gate's reader (`apps/ui/components/SynthesisPanel.tsx:1-30`), to judge the type narrowing; (3) `tsconfig.json` `strict: true`, to judge the exhaustiveness claim in O1; (4) the recorded four-count failure list, to judge the pre-existing-red claim in O6. Test suites were not re-run, per the dispatch.

---

### Spec Compliance

**O1 — the mapping returns the engine's own three words, exhaustive, with an honest doc comment: ✅**
`apps/ui/lib/v3/labels.ts:70-76` maps `SUPPORTED→"supported"`, `CONTESTED→"contested"`, `UNSUPPORTED→"unsupported"`, lower-cased. The switch has no `default` and the declared return type is `LiveVerdictState`; with `tsconfig.json:11` `"strict": true` (hence `strictNullChecks`), a fourth label would fail to typecheck at the function ("lacks ending return statement"), so the exhaustiveness property is preserved, not merely asserted. The doc comment (`labels.ts:61-69`) now names V's ruling D77 of 2026-09-18 and "rename now", and the retired sentence that called renaming "UI-owned work for another lane" is gone.

**O2 — the false copy goes; state attribute; one true sentence per state; state-less unchanged: ✅**
The `suppressed_no_evidence` branch and both retired sentences are deleted (`apps/ui/components/VerdictBanner.tsx:73-75`); the claim language is now rendered unconditionally for every state. `data-verdict-state={verdict.verdictState}` is set on the `<section>` (`VerdictBanner.tsx:66`). The contested and unsupported sentences (`VerdictBanner.tsx:34`, `:36`) carry no number, no register key and no code name — gamma, the cuts and the disagreement threshold are all paraphrased in plain words ("too close", "came out weak"). Truth, judged rung by rung against the ladder:

- *contested* — "The run did not settle this either way: the leading position was not strong enough, the positions were too close, the judges disagreed, or part of the comparison was missing."
  - rung 0 (`packages/serve/src/index.ts:1338-1348`, margin or disagreement ABSENT): the fourth clause is true, and "ABSENT" is defined at `index.ts:1242-1253` as exactly a missing runner-up or a panel with fewer than two parseable judgements — "part of the comparison was missing" is a fair, number-free rendering of that. TRUE.
  - rung 2 (`index.ts:1359-1366`): whichever guard fired, "too close" or "the judges disagreed" is true. TRUE.
  - rung 4 (`index.ts:1375-1379`, `lowCut <= winner < highCut`): "the leading position was not strong enough" is true. TRUE.
  - The clauses are disjoined with "or", so the sentence asserts only that one of them held — it never claims the judges disagreed when they did not. It says nothing about evidence and nothing about refutation. (One ordering nit under Minor.)
- *unsupported* — "Even the leading position here came out weak once the arguments were weighed against each other — a weak case, not a disproved one."
  - rung 1 (`index.ts:1352-1357`) is the only rung returning UNSUPPORTED, confirmed by reading all five rungs. `winner` is defined as "the served root's propagated strength" (`index.ts:1270`), so "came out weak once the arguments were weighed against each other" is the below-the-low-cut fact stated without its number. Rung 1 is only reachable after rung 0 did *not* fire, so `margin` is MEASURED, which by `index.ts:1246-1248` guarantees a runner-up root exists — "the leading position" is therefore well-founded and not a presupposition the data may not support. It says nothing about evidence lookup, and "not a disproved one" actively blocks the refutation misreading. TRUE.
- *supported*: no sentence, and the render test asserts neither of the other two leaks in.
- state-less: `stateSentence` is `null` when `verdictState` is undefined (`VerdictBanner.tsx:59`) and React omits a `data-*` attribute whose value is `undefined`, so the markup is byte-identical to the previous state-less render (the old `suppressed` flag was also false in that case). ✅

**O3 — the older evidence gate survives untouched: ✅**
`suppressionReason` and `evidencePresence` are still on `VerdictSummary` (visible unchanged in the diff hunk at `apps/ui/lib/types.ts:614-615`). `types.ts:434` — the gate's own `"endorsed" | "endorsed_with_caveat" | "suppressed_no_evidence"` union inside `Synthesis.verdict_gate` — is not in the diff. `SynthesisPanel.tsx` is not in the diff; I read it and its `view.verdictGate?.state === "suppressed_no_evidence"` at line 27 is typed from `Synthesis["verdict_gate"]` (`SynthesisPanel.tsx:14`), i.e. from the untouched union, so the narrowing cannot produce a TS2367 there.

**O4 — tests, RED first, all five properties: ✅**
The render test drives the REAL component through `renderToStaticMarkup`. (a) claim language asserted for all three states (`tests/render/t11-verdict-banner.test.tsx:61`, `:75`, `:88`); (b) both retired sentences asserted absent in all three (`:65-66`, `:78-79`, `:92-93`); (c) `data-verdict-state` asserted per state (`:59`, `:73`, `:86`); (d) each honest sentence asserted present for its own state (`:76`, `:89`) and absent for both others (`:63-64`, `:77`, `:90`) — all four absences present; (e) distinctness by `Set` size and exact array (`:98-99`). A fifth test pins the state-less render (`:103-111`). The quoted RED frames are internally consistent: every line number the report cites for a RED or a mutant (`59, 63, 73, 86, 89, 92, 100, 110`) lands on exactly the assertion the report says it does in the committed file.

**O5 — sweep: ✅ (independently re-run)**
`grep -rn "endorsed_with_caveat\|suppressed_no_evidence\|\"endorsed\"" apps tests packages acceptance --include='*.ts' --include='*.tsx'` returns exactly the four hits the report lists, with the report's classification correct in each case: `apps/ui/components/SynthesisPanel.tsx:27` and `apps/ui/lib/types.ts:434` are the older evidence gate; `types.ts:603-604` are prose inside the new `LiveVerdictState` doc comment. Nothing remains in `tests/`, `packages/` or `acceptance/`.

**O6 — three-run gate and both typechecks: ✅ attested, ⚠️ not independently re-run**
Per the dispatch I did not re-run the suites. What I could check from the record, I did: the five `tests/unit/v2ui-pages.test.ts` failures the report names match `.hermes/reports/2026-09-01-algorithm-live-loop/closing-runs/four-count-4f83405f-failures.txt:136-140` name-for-name. The 3×4 run table and the two exit-0 typechecks rest on the implementer's word.

**Allowed writes: ✅** The diff touches exactly the five briefed files. No CSS, nothing under `packages/`, `acceptance/`, `apps/runner/`, and `SynthesisPanel.tsx` untouched.

---

### Strengths

- **The hard part — truth at every rung — was actually done, not asserted.** The unsupported sentence's "the leading position" is the case in point: it is only safe because rung 1 is unreachable while `margin` is ABSENT, which is three inference steps away from the sentence. It holds. Likewise "a weak case, not a disproved one" closes the exact misreading a reader is most likely to make of the word "unsupported", and neither sentence mentions evidence, which is the false thing the old copy said.
- **The rename made the false copy unreachable before the branch was deleted.** Narrowing `verdictState` turned `=== "suppressed_no_evidence"` into a non-overlapping comparison, so the compiler — not the author's judgement — forced the deletion. That is why the single-commit argument in the report is right rather than convenient: either half alone is red at its own tip.
- **The state-less path is genuinely unchanged, and is pinned by its own new test** (`tests/render/t11-verdict-banner.test.tsx:103-111`), including `not.toContain("data-verdict-state")`. This is the case most likely to be broken silently by an attribute addition, and it is the one the M5 mutant attacked.
- **`Record<LiveVerdictState, string | null>`** (`VerdictBanner.tsx:31`) makes `supported: null` an explicit decision rather than a missing key, so adding a fourth state fails at the table as well as at the switch.
- **The sweep, the classification, and the pre-existing-red names are all accurate** — I re-ran the sweep and checked the recorded failure list, and both matched exactly. The report does not overstate them.

---

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **`apps/ui/lib/types.ts:592-593` — the wire-shape comment now overstates.** It still reads that `VerdictSummary` "matches coordinator/app/scoring/verdict.py's verdict_summary() wire shape exactly", six lines above a `verdictState` (`types.ts:613`) that has just been narrowed to three words nobody has confirmed the Python producer emits — the report's own UNVERIFIED section says the V2 coordinator was not inspected. The behaviour on a stale word is fine (it passes through to `data-verdict-state`, no sentence, no crash, no false copy), but a maintainer reading that comment will believe the narrowed union is the wire truth. Fix: one clause on that comment noting `verdictState` was renamed on D77 and may lag the producer. The file is inside the allowed writes.

2. **`apps/ui/components/VerdictBanner.tsx:34` — the contested sentence leads with the alternative most often false.** Rung 2 fires before rung 3's high-cut test (`packages/serve/src/index.ts:1359-1366`), so a winner at or above the high cut that is merely tie-adjacent prints CONTESTED — and the reader's first clause is "the leading position was not strong enough", which is false in that case. The sentence stays true because the four clauses are disjoined with "or", so this is not a correctness defect; it is anchoring. Putting "the positions were too close, the judges disagreed" first, or carrying `rung`/`trigger` onto `VerdictSummary` when the banner is wired (the implementer's concern 5, correctly ticketed to the UI program), removes it. This is owner copy inside a stated veto window, so it is the owner's call.

3. **Refutation-matrix gap against the "one mutant per new assertion" law.** The brief's Step 4 names four mutants and the report ran six, so Step 4 is over-satisfied — but three substantive new assertions have neither a mutant nor an unmasked RED frame: `tests/render/t11-verdict-banner.test.tsx:76` (`toContain(CONTESTED_SENTENCE)` — the single most load-bearing assertion in the task; M3 reddens `:63`, not `:76`, and both RED stages failed at `:73` above it), `:88` (the claim language now shown for UNSUPPORTED — green by stage 2 because the rename had already made the old branch unreachable), and `:109` (`not.toContain("data-verdict-state")`). All three are plainly falsifiable by reading the component, so the behaviour is not in doubt; the evidence chain is.

4. **`tests/render/t11-verdict-banner.test.tsx:31-33` — a retired state word arriving at runtime has no test.** The report measured it by temporary probe (concern 7) and then removed the probe to keep the O5 sweep clean; the trade-off is defensible, but the graceful-degradation property is now recorded only in prose. If it is ever wanted as a test, the retired word can be spelled by concatenation so the sweep does not see it.

5. **`apps/ui/components/VerdictBanner.tsx:31-44` — the doc comment says "A state with no entry renders no sentence", but the `Record<LiveVerdictState, …>` is total, so no in-type state can lack an entry.** The sentence is about runtime-foreign values; as written it may lead a maintainer to think the table is partial. One word fixes it ("a state outside this union").

6. **`verdictUnlockHint` is now a class name with no user** (its only use was the deleted branch), and `suppressionReason`/`evidencePresence` now have no reader anywhere. Both are correct consequences of O2/O3 rather than defects, and both were reported. Noted here only so a later orphan audit does not read them as a regression.

---

### Assessment

**Task quality: Approved**

The requirement that mattered — that every sentence be true of every ladder rung that can print its state — was met on the merits, and I verified it rung by rung against `deriveVerdictLabel` rather than taking the report's table for it; the unsupported sentence in particular is true for a non-obvious reason (rung 1 is unreachable while the margin is ABSENT, so "the leading position" always has a runner-up behind it), and it says nothing about evidence, which is exactly the falsehood the task existed to remove. Scope, the older evidence gate, the sweep and the state-less render all check out, with no write outside the allowed list; the six Minors are documentation accuracy, clause ordering inside owner-vetoable copy, and an evidence-chain gap on three assertions whose behaviour I could confirm by reading.
