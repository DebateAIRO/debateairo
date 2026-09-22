CODEX REVIEW T1 r3 — CHANGES · comments read through: t01-r3-2026-09-01

# CODEX REVIEW T1 r3 — FINAL ROUND

## VERDICT

**CHANGES. One blocking residue; zero non-blocking findings. There is no round 4.** The
three r2 corrections converge under J10, but the replacement single-source oracle is still
not broad by construction: it misses duplicate depth bounds split across physical lines.
The residue is enumerated below in V-packet-row-ready form.

## CONVERGENCE AGAINST R2

- **r2 B1:** the three named evasions now discriminate: `.lte(5)`, `5 >= depth`, and the
  same-line refinement all produce RED in the worker's mutation logs. The sole owner is
  pinned by exact path and exact declaration text. A remaining layout-independent evasion is
  B1 below.
- **r2 B2 / J10(a):** fixed. `budget -> contract` and `apps/runner -> contract` are declared
  in the architecture rows. The true-base fixture restores every file changed at its
  pre-J10 HEAD, including both manifests; its architecture payload and the corrected HEAD
  payload are byte-identical.
- **r2 B3 / J10(b):** fixed. `GOAL_RULED_LAW_CARRIERS` recognizes exactly
  `EXPANSION_DEPTH_MIN` and `EXPANSION_DEPTH_MAX` in
  `packages/contract/src/index.ts`. Mutant m8 adds `EXPANSION_DEPTH_STRIDE = 2` in that same
  file and receives the expected source-purity violation. The report explicitly rejects the
  `= 1 as const` regex dodge, preserving the law's intent.
- **r2 N1 / J10(c):** fixed. The report uses `D15-DEFERRED` and places the authoritative
  suite on integration after the applicable merge batch.
- **Classification:** corrected to owned 0 / pre-existing 13 only after J10. A fresh static
  HEAD audit produced architecture 3 and source 3, exactly the three obs-capture rows in
  each recorded base payload.

## FINDINGS

### B1 — BLOCKING · The line-scoped oracle misses ordinary multiline definitions of the ceiling

- **WHAT:** `duplicateBoundSites()` splits source by newline and evaluates each line in
  isolation. `DEPTH_BOUND_LITERAL` therefore requires a physical line to contain both a
  `depth` token and the literal ceiling. A multiline Zod chain can put `depth` on its
  declaration line and `.lte(5)` on a later line; a refinement can put `d.depth >` and `5`
  on adjacent lines. Both define the same forbidden ceiling while the oracle returns no
  site. A multiline `[1, 2, 3, 4, 5]` enumeration has the same structural weakness.
- **WHERE:** `tests/unit/s1-1-depth-contract.test.ts:224-239,252-280,328-340`; the report's
  stronger claim is at `agent-reports/t01-depth.md:150-161`.
- **INDEPENDENT REPRO:** Applying the committed predicates and the exact line-splitting
  algorithm in memory, without changing the tree, produced:

  ```text
  multiline_chain []
  multiline_reversed [{"line":2,"text":"5 >= depth;"}]
  multiline_refinement []
  ```

  The missed inputs were:

  ```ts
  const depthSchema = z.number()
    .int()
    .gte(1)
    .lte(5);

  .superRefine((d, c) => {
    if (d.depth >
      5) c.addIssue({});
  })
  ```

- **WHY:** T1's DoD is the source-level invariant "No second literal 5" and explicitly
  requires a grep regression for it. The committed comment/report say a new spelling needs
  no new detector, but `source.split("\n")` makes coverage depend on formatting. The three
  r2 controls prove only same-line spellings, so a normal formatter-style chain can regress
  the bound while both single-source tests stay green.
- **SUGGESTED DISPOSITION:** Before merge, either make the oracle whitespace/layout
  independent (for example, mask the exact owning declaration and scan statement/token
  windows or an AST) and add multiline positive controls, or have V explicitly narrow the
  DoD from a repo-wide single-source rule to a same-line textual heuristic. Do not add more
  operator-specific same-line regexes.

## V DECISIONS PACKET RESIDUE — ROW READY

| residue | severity | law / impact | evidence | decision required |
|---|---|---|---|---|
| `V-T1-r3-1` | BLOCKING | T1 single-source DoD is not regression-protected across ordinary multiline formatting | `s1-1-depth-contract.test.ts:273-281` scans one line at a time; in-memory multiline `.lte(5)` and refinement probes both returned `[]` | Require a layout-independent oracle before merge, or explicitly rule that the DoD permits this blind spot |

## PACKET AND EVIDENCE REVIEW

- The worker report begins with the required r3 marker. Its declared body SHA-256
  `b7c8c7f5b1ff125b1aa7b8778301d9f167737dc13e0798752e14287f18879e7d` matches an
  independent hash of lines 3 through EOF.
- HEAD is `386efd39118fdf1bcbbd4a82fd8d0ee83507b00e`; five `T1:` commits span
  `1c9578a..HEAD`. The tree was clean and `git diff --check` emitted no output.
- Independent current audit output was:

  ```text
  EDGE_ROWS_CHECKED=28 ARCH_VIOLATIONS=3
  ARCH|apps/api -> obs-capture is not a declared edge
  ARCH|apps/runner -> obs-capture is not a declared edge
  ARCH|apps/scheduler -> obs-capture is not a declared edge
  SRC_BLOCKING=3
  SRC|packages/obs-capture/install/api.ts reads the process environment outside the register loader
  SRC|packages/obs-capture/install/runner.ts reads the process environment outside the register loader
  SRC|packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader
  ```

- Extracting the six payload rows from `r3-audit-base.log` and
  `r3-audit-head-fixed.log` and running `diff -u` produced no diff
  (`PAYLOAD_DIFF_EXIT=0`). This supports the corrected owned 0 / pre-existing 13 table.
- `r3-mut-m8-third-export.log` shows one failure / 30 passes and the exact new blocking row
  for a third numeric contract export, followed by a clean restore. The by-name map contains
  exactly two names in exactly one path.
- `D15-DEFERRED` is present at report lines 241-244 and states the amended execution
  location correctly. J10(c)'s board F18 correction names the true runner edge and removes
  the disproved unchanged-signature premise.
- No product claims or surfaces beyond the three r2 fixes were introduced by commit
  `386efd3`; it changes only the depth test and the audit implementation.

**Not verified dynamically:** Packet law prohibited Vitest, pnpm, TypeScript, builds,
installs, and git mutation. Dynamic totals and mutants were inspected in the worker's full
logs; the audit and detector checks above were read-only/static.

## PREDICTION

A suite-count lens will likely approve because all 31 committed controls pass and the three
r2 strings now turn RED. The discriminating cross-lens question is whether the oracle is
still green when the same semantic `.lte(5)` or refinement is formatted across lines. It is.
