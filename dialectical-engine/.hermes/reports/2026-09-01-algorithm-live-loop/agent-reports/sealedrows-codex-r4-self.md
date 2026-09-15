CODEX REVIEW SEALEDROWS r4 — CHANGES · comments read through: sealedrows-rework3-2026-09-04

# SEALEDROWS CODEX r4 — reviewer self-case

Finding counts: **1 BLOCKING (→ V) · 2 FOLLOW-UP (→ ticket) · 1 new packet defect beyond the admitted AST premise**.

## Outcome

`CHANGES`, high confidence. The worker genuinely repaired the seeder dataflow, restored schema/prompt agreement, narrowed NOT-RUN for every supplied abort class, preserved the suite failure set, and disclosed both judgment calls. The remaining blocker is narrower: runtime substitution proves what both seeders hash, but no behavioural test proves what the runner sends. The attempted substitute for that half is another raw-source matcher, and comments can satisfy every one of its positive strings while live code sends something else.

## Causes, not symptoms

1. **“Positive” was confused with “semantic.”** `toContain` and `matchAll` assert desired strings rather than banning undesired ones, but they still operate on raw text. They cannot distinguish code from comments or equivalent TypeScript forms.
2. **The behavioural proof stops at the module boundary.** Mocking the named export makes both seeders follow a sentinel, which is strong. The evaluator call is not exercised, so its half of “hashed is sent” falls back to lexical evidence.
3. **The mission tools communicate in prose.** v4's class is correctly narrow today, but its discriminator is a human sentence rather than a stable reason code. The consequence is fail-closed and therefore follow-up, not V-blocking.
4. **The packet required access it simultaneously forbade.** Runtime derivation of private schema keys and a no-other-runner-edit scope cannot both hold. The worker chose the smallest safe exception and disclosed it; the contradiction is the packet author's defect.

## The counterexample that determined the verdict

I evaluated the exact predicates from `f-sealedrows-a-conformance-extractor.test.ts` against an in-memory runner candidate that:

- keeps the shipped prompt bytes under a differently named local;
- re-exports that local as `EVALUATOR_CONTRACT_TEXT`;
- puts the exact accepted system-message and `export const` fragments in one comment; and
- sends an unrelated identifier in the live evaluator packet.

All five current runner predicates returned true. The remaining tests also keep their expected inputs: the imported named export still has the pinned bytes, schema/prompt agreement still reads that export, and both seeders still follow the mocked export. The live provider message alone is wrong. This is the same quiet comment-decoy class that motivated deleting the locators, now moved into the test intended to keep it deleted.

The opposite-direction probes were also decisive. Correct multiline seeder initialization, a correct aliased import, a correct reordered system-message object, and a correct one-line constant definition all fail at least one exact-form predicate. The check is a whitelist of one spelling, not an executable statement of the dataflow property.

## What I nearly got wrong

- I nearly approved after the worker's six RED/GREEN attack directions. Those attacks cover the known locator spelling and add/rename/remove drift; none changes the runner call while feeding decoy text to the source assertions.
- I nearly treated “fails closed” as “not a finding.” The sentence coupling cannot create a false kill, but it can make a valid collision unusable and should be ticketed.
- I nearly called the schema export either harmless or blocking. `private: true` bounds it to the workspace, and only the test imports it today, but package entry export still makes the full parser representation an internal runtime API. Follow-up is the proportional bucket.
- I nearly charged the worker for violating the runner scope. Reading AMENDMENT 4 as a whole showed that its required runtime check needed access to a private declaration while its contract forbade the necessary edit. The worker disclosed the one-word exception; the contradiction is in the packet.
- I did not repeat my r3 mistake of treating the TypeScript API as remembered fact. A fresh import confirmed 7.0.2, no top-level or unstable-AST `createSourceFile`, and Program/Project behind `typescript/unstable/sync`.

## Checks that support the classifications

- Exact predicate probe: all current runner source predicates accept the comment-decoy/alias-export wrong form; harmless equivalent forms are rejected.
- Drift logic: runtime declared keys versus an exact parsed prompt list fails add, rename, and remove; the retained attack log agrees.
- Mission tool: fresh read-only runs classify 1 valid collision as NOT-RUN, five invalid fixtures as INVALID, and reproduce r3 `7/1/1` plus r4 `7/1/0` with exit 0.
- Suite artifacts: base `1505/1518`; current three times `1533/1546`; identical 13-name md5 `9c28c8f4a3d1c891b78141b73e0aad76`; every artifact has its terminal summary and exit.
- Provenance: HEAD `f9754701`, empty porcelain, both diff-check ranges clean, and 5/5 precommit hashes equal the committed blobs.
- Surface: `@debateai/runner` is private but exports the entire index; repository search finds `evaluatorVerdictSchema` consumed only by the new test.

## Severity ledger

| Item | Classification | Why |
|---|---|---|
| Runner-send exact-form source guard | **BLOCKING (→ V)** | admits hashed prompt A / sent prompt B with all tests green |
| Refusal-sentence coupling | **FOLLOW-UP (→ ticket)** | valid NOT-RUN can become INVALID, but never falsely credited |
| Full Zod schema package export | **FOLLOW-UP (→ ticket)** | real internal API widening, bounded by private workspace use |
| Schema/prompt add/rename/remove | closed | runtime set equality restores the lost invariant |
| Seeder source-locator bypass | closed | both deployments must follow the mocked sentinel |
| Known v3 abort over-admission | closed | all supplied invalid shapes now exit 1 |

## Price

The blocking repair is conceptually small but needs the right seam: exercise the evaluator with a provider spy and inspect the packet, or use a real syntax/symbol model. Another source matcher would repeat the lane's central failure. The two follow-ups can be carried independently and do not justify withholding otherwise correct product code once V disposes B1.

## Packet audit

The packet correctly retracts the cheap TypeScript-AST premise; direct module inspection confirms its correction. AMENDMENT 4 has one further defect: its runtime-declared-schema requirement conflicts with its instruction that no third runner-index concern be edited. The worker's disclosed one-word export was the smallest sound way through that conflict, so I did not turn the packet's contradiction into a worker blocker. I found no other material misstatement in the amendment.

## Not verified

- No fresh suite/build/typecheck was created in this static review.
- No database-backed or live provider path was run.
- No other lane's mutation campaign was fed to v4.
- No Program-based TypeScript AST prototype was built.
- The counterexample was not written into the lane; the current predicates were executed against it in memory.

## PREDICTIONS

1. The phrase “positive exact form” will attract an approval unless the reviewer explicitly asks whether raw text can tell comments from code.
2. The worker's dataflow test will be correctly praised and then overgeneralized to the unobserved runner-send half.
3. The schema export debate will polarize around “private means harmless” versus “export means blocker”; a narrow internal-module cleanup is the practical answer.
4. If V authorizes a final correction, a provider-spy assertion will be shorter and more durable than standing up TypeScript 7's unstable Program API.
