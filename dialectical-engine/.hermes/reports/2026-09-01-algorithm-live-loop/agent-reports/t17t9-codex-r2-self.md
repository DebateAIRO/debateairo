CODEX REVIEW T17T9 r2 — APPROVE · comments read through: t17t9-rework1-2026-09-05

## Decision and cause

**APPROVE; 0 BLOCKING / 3 FOLLOW-UP**, detailed in [the main review](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r2.md). The follow-ups concern pre-existing non-T16 provenance, the downstream V packet's two-versus-six assertion instruction, and packet/report bookkeeping. None is a blocking regression in this patch.

The changed fixture now measures what it claims for M=2/depth=1. I verified the six call-site keys and 106 total directly in retained output, then checked why repair attempts cannot increase that total: repair changes the packet inside the same bounded provider loop. The round helper fails explicitly on unreadable input, and the test checks the bound before reaching the retained red assertion.

The production fix is appropriate at the composition seam. Requiring the field makes the original typed omission a compiler error; preserving the runtime guard covers deliberate casts and untyped callers. Consolidating the other reads preserves their valid settings while making deployment provenance testable in one reader. That is within the contract, although the worker's blanket “no behavior change” needs the qualification that invalid or incomplete registers now refuse earlier.

## Strongest counter

The strongest reason to withhold approval is that five of the six originally named tests still fail, and this reviewer did not independently rerun the database-backed suites. I did not convert those reds into a success claim. The decision rests on their identified, separate causes; the corrected maximum-path artifact; nine matching committed hashes; source tracing; and fresh typecheck and wiring checks. Requiring unrelated fixtures to merge with this prerequisite would not strengthen the verified production change.

## What I nearly got wrong

I initially treated “all five” as potentially exhaustive of every acceptance register read. The actual catalog has exactly five T16 families, all covered, but the composition map and scoring operator sit outside it and still accept another deployment's non-empty provenance. That is follow-up debt, not evidence that the worker missed a sixth T16 family.

I also distinguished six run-level sites from two role kinds. The V decision packet has corrected the 106 arithmetic but still recommends making the assertion expect two. That is the same unit-of-count ambiguity that could send the next worker toward another wrong fixture edit.

Two review commands required correction: an initial collision diff ran from the package directory with repository-prefixed paths and returned nothing; I reran it from the repository root and inspected both actual shared-file diffs. A guessed composition-reader filename did not exist; a symbol search located the implementation in `packages/register/src/index.ts`. Neither empty result was treated as evidence of absence. Some large batched output was truncated; I reread the production diff, relevant provider/loop bodies and log details in smaller selections.

## Work and limits

- Read the reviewer packet in full before beginning the review; used no sub-agents and no mutating Git operations.
- Checked the nine-file range, final manifest against both worktree and committed bytes, all 29 r2 record summaries, relevant full log sections, worker/dispatch history, provider budget path, five-family catalog, caller roots and W3/T1 overlap hunks.
- Fresh results: typecheck exit 0; wiring guard 2/2; exact-source helper probe 3 valid rounds plus 10 invalid inputs; diff whitespace check clean.
- The logs' `CLEAN-STATE` marker is tracked-status evidence, not a per-run content digest. The manifest matches the final commit; I have not claimed the precommit suites were fresh post-commit executions.
- Created only the two authorized reviewer reports. No source, board, ticket, trap file or decision packet was edited. Working tree was clean before and after the checks.

## Disagreements with r1

None on facts. R1's corrected 106 maximum for this fixture is confirmed, as are its provenance count and type-closure repair sites. The broader omission class still contains four optional fields, as the worker now discloses. I have not promoted r1's prediction of fully green downstream acceptance tests into a verified result.

## Packet audit

Defect #10's unreachable original six-green demand is admitted and dispatch 2 gives a workable rework scope. The reviewer packet's dispatch path is wrong; the actual file is under `packets/dispatches/`. Nine total files and three downstream causes are correct, but the worker still mislabels the index change as r1 and confuses total changed lines with net deletion in `main.ts`. Both tooling traps exist in the main shared checkout, not the lane, consistent with the worker's disclosure; future contracts should give that absolute append target.

## Not verified

No fresh database suite, complete acceptance run, live provider work, full cluster, fresh lint/source audit, declared-Node-version run or actual branch merge. The compile omission mutant was read as an artifact rather than recreated. CLI compatibility with incomplete historical databases and non-TypeScript external consumers was not demonstrated. The non-T16 provenance finding is static.

## PREDICTIONS

1. The exact fixture again records 106 and fails at the old seven-site list; schema repairs share the same bound rather than raising the count.
2. A typed deployment omission fails compilation, while the deliberate omission cast still reaches the runtime refusal.
3. Normal integration preserves both the required-field change and T1's separate depth-bound change; whole-file conflict resolution could erase one unnecessarily.
4. The separate fixture repairs remove the observed first failures but may reveal later assertions; the next reviewer must measure that outcome.

MERGEABLE: yes — the r1 blocking defect is corrected and the production patch can merge while its separate fixture, decision-record and provenance follow-ups remain explicit.
