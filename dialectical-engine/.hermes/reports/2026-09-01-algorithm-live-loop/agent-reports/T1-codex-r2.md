CODEX REVIEW T1 r2 — CHANGES · comments read through: t01-r2-2026-09-01

# CODEX REVIEW T1 r2

## VERDICT

**CHANGES. Round 3 is the last lawful rework round.** Three blocking findings and one
non-blocking packet/report finding.

J6's product change is correctly scoped and the three known duplicates are gone. D14 is
supported by matching base/HEAD UI typecheck output. N1's mutation and generation
provenance is repaired. The r2 claim still cannot pass because the broadened oracle misses
ordinary equivalent duplicate definitions and the zone report misclassifies T1-owned
architecture violations as pre-existing.

## CONVERGENCE AGAINST R1

- **r1 B1 / J6:** fixed at the three ruled sites. Budget reuses
  `ExpansionDepthSchema`; the UI gate imports min/max; the option list derives from
  `EXPANSION_DEPTH_VALUES`. No unrelated budget/UI behavior changed.
- **r1 B2:** improved but not fully fixed; see r2 B1.
- **r1 B3:** the placeholder is gone and the authoritative full suite is lawfully deferred,
  but two zone classifications are false; see r2 B2/B3.
- **r1 N1:** fixed. The two packet-required spot checks contain their claimed full
  transcripts.
- **D14:** satisfied. HEAD and base each report only
  `apps/ui/app/layout.tsx(3,8) TS2882`; the base transcript restores the four relevant source
  files and finishes clean.

## FINDINGS

### B1 — BLOCKING · The "syntax class" scanner still misses ordinary validator and comparison forms

- **WHAT:** The detector called `VALIDATOR` recognizes only `.max(5)`, and the detector
  called `COMPARISON` recognizes only expressions where `depth` precedes the literal.
  Equivalent second definitions using Zod `.lte(5)`, a refinement, or the reversed
  comparison `5 >= depth` leave the oracle green. The positive controls repeat only the
  exact spellings used by the original three violations, so they do not prove coverage of
  the named classes.
- **WHERE:** `tests/unit/s1-1-depth-contract.test.ts:244-247,294-302`.
- **FAILURE SCENARIO:** Independently applying the committed regexes to planted duplicate
  definitions produced this verbatim static output:

  ```text
  VALIDATOR_LTE=[]
  VALIDATOR_SUPERREFINE=[]
  COMPARISON_REVERSED=[]
  OPTION_SET=["OPTION_DOMAIN"]
  ```

  Thus `depth: z.number().int().gte(1).lte(5)` or
  `const ready = 1 <= depth && 5 >= depth` can reintroduce a second bound while
  `duplicateBoundSitesInShippedCode()` still equals `[]`.
- **WHY:** The r2 packet requires the scan to cover validators/comparisons/option domains,
  and goal lines 98–105 require the grep test to pin the repo-wide negative invariant. A
  control per class must discriminate the class, not only one author-selected spelling.
- **SUGGESTED FIX:** Prefer a broad non-owner `depth`+literal-5 detector with the one owning
  declaration treated explicitly, or cover validator aliases/refinements and both comparison
  operand orders. Add adversarial positive controls for `.lte(5)` and `5 >= depth`, then RED
  the final scanner against at least one alternate spelling before GREEN.

### B2 — BLOCKING · The dependency-edge "base" proof retained the T1 manifests, so two owned violations were mislabeled

- **WHAT:** The base command restored four `.ts/.tsx` files only. It did not restore
  `apps/runner/package.json` or `packages/budget/package.json`, although
  `auditArchitecture()` reads those manifests. Consequently the alleged base output still
  contains T1's new `budget -> contract` and `apps/runner -> contract` violations. Equal
  test names here do not mean an equal base signature.
- **WHERE:** `agent-reports/t01-depth.md:229-258`;
  `logs/t01/r2-base-check-four.log:1-11,61-74`;
  `logs/t01/r2-zone-final.log:1645-1658`;
  `tools/orphan-audit/src/index.ts:28,32,51-62`.
- **FAILURE SCENARIO:** The base transcript itself shows the restore list excludes both
  manifests, then reports the exact two T1-added edges. On a real base, neither dependency
  exists. The report nevertheless says the failure is pre-existing and "fails identically
  at base."
- **WHY:** Heartbeat §2.6 requires every failure to be named and classified honestly. The
  r2 report's "Zero failures are mine" is contradicted by its logs. J6 authorizes these
  dependencies, but the architecture edge law still needs the corresponding declarations;
  an already-red test does not absorb new causes introduced by this diff.
- **SUGGESTED FIX:** Update the two declared edge rows as the J6 coherence consequence, or
  obtain an explicit ruling if that tool surface must expand first. Re-run the zone and use
  a genuinely clean base fixture (or restore every manifest/config/source read by the
  probe). Correct board F18 too: it currently says `apps/ui -> contract` rather than
  `apps/runner -> contract` and repeats the disproved "signature unchanged" premise.

### B3 — BLOCKING · The exported constants create a second T1-owned architecture failure omitted from the report

- **WHAT:** At HEAD, `auditSourceRules()` adds
  `packages/contract/src/index.ts exports a numeric source literal instead of a register/law carrier`.
  The base output has only the three obs-capture failures, so this is not pre-existing. It is
  absent from the report's 13-row classification even though it is inside the named
  `scaffold.test.ts > enforces purity...` failure.
- **WHERE:** `packages/contract/src/index.ts:111-112`;
  `tools/orphan-audit/src/index.ts:477-478`;
  `logs/t01/r2-zone-final.log:1670-1682` versus
  `logs/t01/r2-base-check-four.log:86-97`;
  `agent-reports/t01-depth.md:223-249`.
- **WHY:** The goal explicitly requires an exported contract constant, while the existing
  architecture audit rejects every exported numeric source literal outside
  `packages/published-arithmetic`. The implementation therefore exposes a real law-vs-audit
  conflict that must be reconciled, not classified away.
- **SUGGESTED FIX:** Route/authorize the necessary architecture-audit coherence change and
  recognize only these exact goal-ruled contract exports as law carriers; do not exempt the
  whole contract package. RED the architecture assertion with the constants present, make
  that narrow exception GREEN, and report the resulting zone signature accurately.

### N1 — NON-BLOCKING · The r2 packet/report cites superseded D13 placement and omits the required deferred label

- **WHAT:** The packet names D13 but omits later ruling D15. The report therefore says the
  authoritative full suite runs in this lane worktree before integration merge. D15 amends
  that location to the integration branch after a disjoint merge batch. The packet also
  requires explicit `D13-DEFERRED`, but that label does not appear.
- **WHERE:** `packets/t01-codex-r2.md:13-16,24-25`;
  `DECISIONS.md:295-302`;
  `agent-reports/t01-depth.md:194-199,270-279`.
- **WHY:** The later ruling governs and evidence handoffs must name where the outstanding
  authoritative run actually occurs. This does not invalidate J6 behavior, but it leaves
  the report and dispatch record stale.
- **SUGGESTED FIX:** Amend the report to an explicit `D15-DEFERRED` (not stale
  `D13-DEFERRED`) statement: authoritative `pnpm test` is judge-run serially on integration
  after the applicable merge batch. Future packets that cite the DECISIONS tail must include
  later amendments to the rulings they name.

## PACKET REVIEW

The r2 packet has four elements, both writable paths are valid, its J6/D14 anchors resolve,
and I obeyed its no-test/no-build/no-git-change rule. Its material packet defect is N1: it
calls D13 governing after D15 has amended D13's execution location. The board also remained
at `changes_requested` while the rework marker was presented directly; the explicit r2
dispatch supplied the review authority, so I did not treat that mirroring lag as another
finding.

## EVIDENCE CHECKED

- `git diff 1c9578a..HEAD`, `git diff --name-status`, and commit log: four `T1:` commits,
  HEAD `7ccd1a7`; nine changed files; tree clean; `git diff --check` exit 0.
- J6 scope diff: only `packages/budget/{package.json,src/index.ts}` and
  `apps/ui/app/new/page.tsx` changed under budget/UI, and each change is necessary to import
  or consume the contract source. `tests/unit/v2ui-pages.test.ts` was coherently retargeted
  from the forbidden literal to the derived domain.
- Independent current-tree static re-run of all three committed detector patterns:

  ```text
  VALIDATOR_SCAN_EXIT=1
  COMPARISON_SCAN_EXIT=1
  OPTION_DOMAIN_SCAN_EXIT=1
  VALIDATOR=["VALIDATOR"]
  COMPARISON=["COMPARISON"]
  OPTION_DOMAIN=["OPTION_DOMAIN"]
  NEG_RECURSION=[]
  NEG_OTHER=[]
  NEG_FLOOR=[]
  ```

  Exit 1 from each `rg` means no current shipped-code match. The alternate-syntax controls
  in B1 refute completeness of the regression oracle despite that clean current tree.
- `r2-red-singlesource.log`: 1 failed / 21 passed, `R2_RED_EXIT=1`, with all three original
  J6 sites named. `r2-cluster-final-run{1,2,3}.log`: 22/22 and `EXIT=0` in 3/3.
- D14: `r2-uitsc-head.log` and `r2-uitsc-base.log` each contain exactly the same TS2882 CSS
  import error and exit 1; the base transcript restores its source surface cleanly.
- N1 spot checks: `r2-mut-m6-ui-comparison.log` contains mutation diff, 1/21 RED,
  `VITEST_EXIT=1`, restore, empty porcelain, and `RESTORED_CLEAN=0` (shell success);
  `r2-generate-contract-diff.log` contains snapshot, generation, `GEN_EXIT=0`, diff, and
  `DIFF_EXIT=0`.
- Root typecheck log reports exit 0. Zone log reports 13 failed / 1292 passed and exit 1.
  Comparing the exact scaffold failure payloads exposed B2 and B3; counts/test names alone
  would not.
- DECISIONS lines 222–245, 265–274, and 295–302: D13, J6, D14, and the D15 amendment.

**Not verified:** By packet law I ran no Vitest, pnpm, TypeScript, build, install, or git
mutation command. Dynamic claims above were checked only against worker logs; the scanner
re-run was a read-only static grep/regex probe.

## PREDICTIONS

I predict another lens will accept the scanner because its three original-site mutants go
RED, but will not try a validator alias or reversed operands. I also predict a suite-focused
lens may compare only failed test names and accept "pre-existing," missing that the failure
arrays gained three T1-owned items. The first cross-lens checks should be the exact
`scaffold.test.ts` Received arrays and whether the base fixture actually reverted every
manifest the architecture audit reads.
