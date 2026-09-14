# Task 0 Sol review — round 3

Date: 2026-09-03  
Overall verdict: **REWORK**  
Scope: fresh adversarial review of the round-two findings, plus regression checks for F1–F8. No Hermes command was invoked and no board write was made.

## Blocking finding

### R3-F3 — N4 still misclassifies valid JavaScript

Verdict: **REWORK**

The proposed scanner in `task0-n4-demo-request.md:124-135,205-206,261-263` does not yet meet its own claim that it skips complete regular-expression literals and rejects only a free `require()` call.

Two syntax-valid neighboring negative fixtures were run through the exact scanner body three times. Both were rejected on all three runs (`rc=1` each time):

```ts
if (ready) /import x from ".\/identity.js"/.test(text);
loader?.require("./identity.js");
```

Observed diagnostics:

```text
stage 16 manifest scanner rejected import-from: ./identity.js
stage 16 manifest scanner rejected require(): ./identity.js
```

The first fixture was independently accepted by `new Function(...)`. The scanner treats `/` after the `if (...)` closing parenthesis as division because `regexCanStart()` returns false after every `)`; it then tokenizes the regex contents as code and finds a fictitious `import ... from`. The second fixture is a property call, not a free `require()`: the detector excludes preceding `.` but not the tokenized optional-chain punctuator `?.`.

The mandatory matrix itself did not regress: baseline manifest and all five listed negative fixtures were green, the neighboring arithmetic-division fixture was green, and all 13 required static/export/side-effect/dynamic/require positive fixtures—including options arguments and the escaped Unicode literal—were red in each of three runs. That does not cure the two demonstrated false positives.

Smallest acceptable correction: use a parser, or extend the lexer with enough grammar context to distinguish a statement-position regex after control-flow parentheses from division, and treat both `.` and `?.` as property access when deciding whether `require` is free. Add the two fixtures above to the required negative matrix and require three green runs.

## Round-two findings

- **F2 writer evidence: PASS.** `task0-writer-grant.md:5-12` now says Task 0.2 is evidence-only, current upsert is unavailable, and the persistence mechanism remains **OPEN** for Architecture/V. It calls append-only only one possible future choice and names the extra ruling obligations. The historical overreach remains in FIX-07 `DECISIONS.md`; a later correction is appended without editing prior history.
- **F3 N4 scanner: REWORK.** Exact failure above.
- **F7 board construction/release: PASS.** All 16 initial titles use `[unassigned]`; a fresh comparison found 16/16 suffixes byte-equal to the frozen SPEC first headings. Initial state is exactly 11 `todo`/unassigned and 5 `blocked`/unassigned (FIX-01, FIX-06, FIX-07, FIX-14, FIX-15). The shell block passes `bash -n` and contains 16 direct creates, 16 stable keys, 16 immediate shows, 16 full verifier calls, five explicit blocked statuses, no `--assignee`, no assign, and no promote. Readback requires exact title/body/status, null assignee, identity, creator, worktree path/kind, branch, and parents. The later release sequence requires one guarded retag-plus-assignment custody operation and exact readback before dry-run promotion. Because the inspected CLI cannot edit a live title, the current sequence stops and routes the tooling gap; plain assignment, direct database edits, and invented commands are forbidden. No early dispatch is possible from the construction block.

## F1–F8 regression results

| Finding | Verdict | Fresh evidence |
|---|---|---|
| F1 — RP-0 action | **PASS** | Recomputed 9 names and SHA-256 `51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078`. Exact-action fake-board runs accepted zero-comment posting and exact-prior no-op; conflict, duplicate, wrong identity/status, and lost-readback states exited nonzero. |
| F2 — writer mechanism | **PASS** | Evidence says mechanism OPEN; no implementation choice is smuggled in. |
| F3 — N4 | **REWORK** | Two repeatable syntax-valid false positives described above. |
| F4 — RP-3 control bytes | **PASS** | Corpus SHA-256 is `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`; exactly the three control-class cases contain actual ruled NUL/CR/bidi code points, and no other class does. |
| F5 — RP-3 action | **PASS** | Parsed 24 unique ids and 24 unique target/class pairs, exactly 8 per target and the full 8-class matrix. Exact-action fake-board runs accepted zero-comment posting and exact-prior no-op; conflict, duplicate, wrong identity/status, and lost-readback states exited nonzero. The action pins the actual byte hash and rechecks semantic coverage before any comment. |
| F6 — frozen titles | **PASS** | 16/16 initial ticket titles preserve the exact SPEC heading, including FIX-10's `` `obsctl kill` `` and FIX-14's `` `dev` ``. |
| F7 — board packet | **PASS** | Exact construction/readback counts and fail-closed release behavior above. |
| F8 — no early dispatch | **PASS** | Construction has zero assignment/promotion calls; release cannot pass its current missing atomic-retag capability gate. |

## Artifact verdicts

1. Writer grant — **PASS**.
2. OFF switch alternative A — **PASS, unchanged**; SHA-256 remains `4d9fc16b6579c0cee4d615cd1718f3723774234ee0c0fc00f22cd6879ef74ba2`.
3. Tracer alternative C — **PASS, unchanged**; SHA-256 remains `d020a96b7da2ceb430bd7ea03b540b77d538e6fd8429a6be3839c0a61a7e31bc`.
4. B2 alternative B — **PASS, unchanged**; SHA-256 remains `d5b872b791a49e1197a2f59cc85e08b55a64369ff5f267c7a0e0dcdbf28af7d2`.
5. N4 — **REWORK** for R3-F3.
6. Board packet — **PASS**.
7. RP-0 — **PASS**.
8. RP-3 corpus — **PASS**.
9. RP-3 pin — **PASS**.

## Custody and repository state

- No Hermes command or external model was used in this review. The action tests shadowed the command name with a local shell function; they did not contact a board.
- No board item, comment, edge, assignee, status, or title was created or changed. The live board was not refreshed in round 3; no newer live-state claim is made.
- `HEAD` remained `2b670d3059c60d7262cf655bd5d402c88100dff3`; the index was empty.
- The only tracked diff remained the append-only FIX-07 `DECISIONS.md` addition, and `git diff --check` passed. No frozen SPEC or product/test source was edited by this review. Nothing was staged or committed.
- This review wrote only the two authorized round-three report paths.

**TASK 0 SOL REVIEW ROUND 3: REWORK**
