# BUILD-S01-C5 case file — ticket `t_6e2413b7`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

- Window: 2026-09-10 02:47–03:10 EEST.
- Result: commit `f6c147cc` on `slice/tiers-s01`; only the two authorized suites changed; final lane dirt 0.
- Test delta: render `20→21` (`n=1`), stylesheet `1→8` (`m=7`). Six final cluster markers were `CLUSTER_GREEN`; typecheck retained its inherited rc=1 with 0 diagnostics in either changed suite.
- S01-45: no SPEC-v2 supersession, as recorded by `DONE.md` §1.

## Findings — causes and prices

### F1 — the reading batch exceeded the transport ceiling

Cause: I parallelized several named inputs into one response without first pricing their combined output. The response truncated at about 25k tokens, so `DECISIONS.md`, the predecessor handoffs, and suite text had to be requested again in smaller slices.

Price: two extra read rounds, roughly 10–15k repeated transcript tokens, and about 2 minutes. This is the largest avoidable token cost in the seat.

Upgrade: preflight every mandated full-file read with `wc -l`, then schedule chunks below a fixed output budget and never combine a long file with other evidence. VERDICT: add this to the Codex seat bootstrap / CONFIDENCE: high / STRONGEST COUNTER: more small calls add latency when every file is genuinely short.

### F2 — “covered” was not defined at clause granularity

Cause: the packet says to add an assertion only for an M-line that has none, while several existing cases covered part of an M-line. The decisive example was M2–M7: the stylesheet case asserted `var(--token)` use, but did not prove the packet's explicit “declared in both modes” clause. M11 lacked the empty-question half, and M12 lacked the notice and frame clauses.

Price: about 5 minutes of coverage classification and roughly 6–8k reasoning tokens. The ambiguity could have produced either zero new cases or fifteen duplicative cases.

Upgrade: packets should include a generated clause inventory, with each clause marked `EXISTING <case>`, `ADD <suite>`, or `OUT OF TEST SCOPE`, plus the expected `n/m` delta. VERDICT: make the coverage manifest a packet field / CONFIDENCE: high / STRONGEST COUNTER: the author must inspect tests deeply enough that generating the manifest may move work from the seat to dispatch.

### F3 — the first token matcher treated comments as declaration boundaries

Cause: `modeTokenPresence` required a declaration to follow block start or `;`; compacted comments sat between that boundary and `--bg` / `--m-claude`. M4 and M7 therefore stayed RED after the product mutant was restored. The exact received values isolated the fault to the first declaration following a comment. Stripping comments before matching fixed the helper.

Price: six invalid targeted executions (RED/restored/neighbor for M4 and M7), one diagnostic read, one patch, and one complete rerun of both mutation cycles; about 20 seconds wall-clock and roughly 4–6k transcript tokens.

Upgrade: mutation helpers that parse text should receive known-good fixtures for first declaration, declaration after comment, and later declaration before they touch product artifacts. VERDICT: add helper-fixture preflight to the mutation template / CONFIDENCE: high / STRONGEST COUNTER: a fixture adds code that does not ship and can itself mirror the parser.

### F4 — final mapping comments landed after the first three-run gate

Cause: the first comment map grouped `M4–M6` and omitted explicit suite names. Re-reading the packet's literal `M-line → assertion(s) → suite` form showed that the final artifact needed one row per M-line. Although this was comment-only, evidence-before-completion required a fresh three-run set on the exact candidate.

Price: three redundant cluster runs, about 45 seconds, 543 KB of raw logs, and roughly 12–18k displayed tool-output tokens.

Upgrade: make the mapping-table shape a pre-verification checklist item and forbid final-gate entry until all non-behavioral deliverables are frozen. VERDICT: add a `candidate frozen` checkpoint before the three-run command / CONFIDENCE: high / STRONGEST COUNTER: a late typo correction would still force re-verification under the evidence law.

### F5 — the raw-log mandate and stdout mandate are easy to wire incorrectly

Cause: the required runner appends each captured vitest frame to `$LOG`, while the wrapper must print only summaries. Redirecting the runner's own stdout to that same file with `>` would leave a non-append descriptor able to overwrite data appended by the runner. I instead captured markers in memory, appended them after raw frames, and printed only rc, markers, failures, and summaries.

Price: about 3 minutes of shell data-flow reasoning; no lost evidence. The final three raw logs are 181 KB each.

Upgrade: publish one executable canonical runner that accepts a log path and suite triples, rather than asking every seat to reconstruct redirection semantics. VERDICT: centralize the capture-first runner / CONFIDENCE: high / STRONGEST COUNTER: a shared runner becomes another repository surface whose version must be pinned per mission.

### F6 — an accidental scratch-runner line was caught before execution

Cause: the initial scratch patch contained a stray `unordered_grep` line unrelated to the packet. A source inspection before execution caught it, so no verification receipt was polluted.

Price: one patch round and under 1 minute; near-zero runtime cost, but it would have made marker output noisy and non-verbatim if missed.

Upgrade: run `sh -n` plus a literal runner-body diff against the packet before the first cluster run. VERDICT: automate scratch-runner conformance / CONFIDENCE: high / STRONGEST COUNTER: syntax checking alone cannot detect a syntactically valid stray command, so the body diff is the material part.

## What I nearly got wrong

- I nearly treated existing `var(--token)` use as proof that each token existed in both modes. The packet's explicit two-declaration rule prevented that false coverage claim.
- I nearly accepted M12 from “panel exists” alone; the notice could have vanished and the test would still pass.
- I nearly reported the first M4/M7 RED frames as valid mutant evidence. The required restore→GREEN step exposed that the helper, not the mutant, was responsible.
- I nearly left the mapping as grouped prose rather than a mechanical one-row-per-M-line map.

## Dead ends worth deleting from future runs

- One large parallel read for all named inputs: it truncates and forces duplicate reading.
- A declaration regex that assumes comments disappear during whitespace compaction: they do not.
- Running the three-run gate before comments, report-independent metadata, and mapping rows are frozen.
- Redirecting runner stdout and its direct `$LOG` appends through different file-position modes on the same file.

## Packet ambiguities and defects

1. The exhaustive `allowed` list excludes product files, while refutation duty explicitly requires temporary product mutants. I treated the more specific mutation instruction as authorization for reversible product edits only, restoring and printing status after each. Exact unclear locations: packet §2 `allowed`/`forbidden` versus §3 first paragraph and charge 3.
2. “READY handoffs of the two suites' authors: the last comment” resolves to orchestrator `CONSUMED` comments, not the authors' READY comments. The last comments were still useful summaries, but the noun phrase and selector disagree. Exact location: packet §1 inputs.
3. The self-report path is duplicated in the `allowed` list. Exact location: packet §2.
4. The log instruction does not specify whether `$LOG` is raw-vitest-only or must also contain runner markers. Exact locations: packet §2 verification, charge 5, and the F3 fold quoted in the packet. I retained both raw frames and markers in each final log.

## One-prompt-machine upgrade

Generate a machine-readable goal packet containing: exact read slices and byte budgets; ticket cursor; branch/HEAD/dirt assertions; allowed read/write/mutant surfaces separately; M-clause coverage manifest; mutation recipes with restore traps; expected post-edit suite pairs; canonical runner invocation; typecheck extractor; commit allow-list; report schema; and READY schema. A bootstrap command should refuse to proceed when any constant differs, and should emit CLAIM, evidence indexes, commit metadata, and READY from the same structured record.

VERDICT: make the packet executable data with rendered Markdown for humans / CONFIDENCE: high / STRONGEST COUNTER: over-encoding judgment can hide genuine contradictions, so the seat must retain a first-class `DISPUTE/UNVERIFIED` escape rather than auto-coercing mismatches.
