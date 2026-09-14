# Task 0 Sol review — round 4

Date: 2026-09-03  
Overall verdict: **PASS**  
Scope: final N4 re-review plus F1–F8 regression and custody checks. This approves the corrected request for custodian execution; it does not claim that the unedited demo's stage 16 or the full demo has run successfully.

## N4 verdict

**PASS.** The TypeScript AST scanner removes both round-three false positives without reopening the earlier bypasses.

### Executable path and parser resolution

- The exact Node body from `task0-n4-demo-request.md:51-157` was extracted and executed, rather than reimplemented for the test.
- The complete proposed shell `case` block passed `bash -n` in a loop context. With the real manifest it exited 0 and left `_viol` empty from both the repository cwd and `/tmp`, in each case receiving the explicit absolute product root. The current demo derives `PRODUCT_ROOT` as an absolute path at `observability-demo.sh:62`, so the invocation contract matches the real script.
- Product-root resolution is cwd-independent in the tested tree. Bare `typescript` resolves to the installed `typescript@7.0.2` version entry, which does not expose `createSourceFile`; the bounded fallback saw two `typescript@*` candidate directories and selected the first usable compiler parser, installed TypeScript `5.9.3` with `createSourceFile`.
- Parser resolution is capped at 32 candidate directories. A relative root, an absolute root with no usable parser, and an absolute root with 33 candidate directories all failed closed with exit 2 and the expected stop diagnostic. No cwd-relative parser lookup is used by the fallback.

### Exact 18 RED / 7 GREEN matrix

Three independent runs of the exact scanner produced:

```text
round 1: positives_red=18/18 negatives_green=7/7 mismatches=0
round 2: positives_red=18/18 negatives_green=7/7 mismatches=0
round 3: positives_red=18/18 negatives_green=7/7 mismatches=0
```

The 18 positives cover both quote styles for static import and export-from, side-effect imports, import-equals external-module syntax, dynamic imports, ordinary free `require`, optional free `require?.`, extra call arguments, string escapes, and no-substitution template operands. AST inspection correctly applies only to import/export declarations, external module references, the `ImportKeyword` call shape, and an Identifier expression named `require`.

The seven specified negatives cover path strings, safe `require` operands, regex literals containing import/require text, the statement-position regex from round three, and optional-member `loader?.require`. Additional neighboring probes behaved correctly:

```text
ordinary member loader.require(zone literal): GREEN
arithmetic division: GREEN
escaped static-import string: RED
escaped free-require string: RED
escaped dynamic-import no-substitution template: RED
escaped optional-free-require no-substitution template: RED
```

This directly verifies that member and optional-member calls are not mistaken for free `require`, while both ordinary and optional free calls are caught. Regex and division syntax remain data/expression syntax, not fictitious imports.

### Syntax and resource bounds

The exact scanner returned:

```text
parse diagnostic: exit 2
exactly 1 MiB valid source: exit 0
more than 1 MiB: exit 2 (input exceeds 1048576 bytes)
more than 100000 AST nodes: exit 2 (node count exceeds 100000)
parser absent: exit 2
more than 32 parser candidates: exit 2
```

The byte bound is checked before parsing, parse diagnostics are rejected before traversal, and the node bound is enforced during the AST walk. Errors are fail-closed because any nonzero Node result appends the manifest to `_viol` in the surrounding shell block.

## F1–F8 regression

| Finding | Verdict | Fresh evidence |
|---|---|---|
| F1 — RP-0 | **PASS** | Shell syntax passed; the nine-name hash recomputed as `51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078`; `0:0`/`1:1` preflight and exact `1:1` postcondition remain present. |
| F2 — writer mechanism | **PASS** | Writer evidence still says the mechanism remains **OPEN**, and append-only is only an Architecture/V option with named follow-on obligations. |
| F3 — N4 | **PASS** | Full executable evidence above. |
| F4 — RP-3 bytes | **PASS** | Corpus SHA-256 remains `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`; 24 unique ids and 24 target/class pairs; exactly the three control-class cases contain ruled control/bidi code points. |
| F5 — RP-3 pin | **PASS** | Shell syntax passed; action still pins the actual hash, validates the complete 8×3 matrix and semantic complement, and retains `0:0`/`1:1` idempotent preflight plus exact readback. |
| F6 — frozen titles | **PASS** | All 16 `[unassigned]` initial titles remain byte-equal to their frozen SPEC first headings. |
| F7 — board packet | **PASS** | Shell syntax passed; 16 creates, 16 stable keys, 16 immediate readbacks, 11 `todo`, and the same five hard-blocked tickets. Construction has no assignee argument. Release still stops at the atomic retag/assign tooling gap. |
| F8 — no early dispatch | **PASS** | Construction contains no assign or promote call; promotion remains downstream of the unavailable guarded retag-plus-assignment operation and its exact readback. |

The accepted ruling packets are unchanged from the prior independent review:

- OFF switch alternative A: `4d9fc16b6579c0cee4d615cd1718f3723774234ee0c0fc00f22cd6879ef74ba2`
- tracer alternative C: `d020a96b7da2ceb430bd7ea03b540b77d538e6fd8429a6be3839c0a61a7e31bc`
- B2 alternative B: `d5b872b791a49e1197a2f59cc85e08b55a64369ff5f267c7a0e0dcdbf28af7d2`

## Custody and repository state

- No Hermes command or external model was used. No board was read or written in round four; no ticket, comment, edge, title, assignee, or status changed.
- `HEAD` remained `2b670d3059c60d7262cf655bd5d402c88100dff3`; the index remained empty. Nothing was staged or committed.
- The only tracked diff remained the two-line append in FIX-07 `DECISIONS.md`; `git diff --check` passed. No frozen SPEC, demo, product source, or test source was edited by this review. The only file under the untracked `tools/obs-listener` surface remains the reviewed RP-3 corpus.
- The full demo remains correctly marked unmeasured because `OBS_DEMO_DATABASE_URL` is unset and the custodian-owned demo has not received this request yet.
- This review wrote only the two authorized round-four report paths.

**TASK 0 SOL REVIEW ROUND 4: PASS**
