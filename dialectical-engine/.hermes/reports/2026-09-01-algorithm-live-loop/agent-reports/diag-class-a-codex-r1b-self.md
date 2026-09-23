CODEX REVIEW DIAG-CLASS-A r1b — CHANGES · comments read through: diag-class-a-r1b-2026-09-07

Counts: **2 required changes; 1 residual packet premise charge; 2 original packet charges cleared.** Companion self-review, not a second independent review.

SKILLS LOADED: superpowers:using-superpowers (including the Codex tool reference), superpowers:verification-before-completion, codex-security:assess-patch-risk (including its rubric and schema). Worker-only implementation skill duties were treated as evidence about the worker's process, not instructions to modify this checkout.

## The body

The rework repairs the actual double-read emission in DEV and restores all four missing TLS diagnostics. Its final evidence has usable custody. What remains is a mismatch between two claims and the source: the S04 backing vocabulary is called sealed although it is exported and unfrozen; two template inputs are called free although their private helpers have only literal callers.

The review therefore returns CHANGES for one implementation requirement and one audit correction. It does not reopen tokenUnlock, demand expansion to the legacy failureKind field, or request changes to the 152-entry DEV set.

## Causes and evidence

**F1: membership storage needs the same runtime scrutiny as the candidate value.** I traced the alias at s04.ts:272 to the export at :316. The helper takes a single primitive snapshot, which repairs the original read/return issue. However, its membership decision still depends on exposed mutable application state. The precise limitation matters: I found no current production writer to that array, and a plain remote string cannot mutate it. The finding is conditional static evidence against the stated fixed-alphabet contract. No reproduction was run.

My earlier r1 instruction recommended checking the list without identifying the list's runtime mutability. That was incomplete review guidance. The worker satisfied the most obvious reading of that instruction. The next instruction is narrower and actionable: own the canonical vocabulary privately in the granted helper, keep public spellings and note behavior, and observe independence from changes to the exported list. This does not require a wider source grant.

The existing S04 accessor control also needed careful call-order reading. It is the note's failureKind expression that consumes the first getter result. The helper receives the next value and falls back. That is useful coverage, but is not a test of successful helper membership followed by an unsafe helper reread. I did not equate its title with its discriminator.

**F2: caller resolution was applied inconsistently.** The TLS prefixes were resolved to their two literal callers. The same operation was not applied to requireMatch's label or serviceBlock's service. Both are private helpers with two fixed callers. Their exclusion from the DEV set remains correct because their messages include colons. Boundedness and grammar compatibility are separate questions; combining them created two unsupported follow-up claims.

My independent check used base Git blobs for the literal inventory, then a parser walk of all 53 template expressions across 26 files. The 152-code equality is real. The six error-constructor candidates are complete for this tree. I did not report success-output templates or newline wrappers as missing joiner codes, or demand a generic source-analysis framework as part of this lane.

**F4 and custody: re-extract before attributing.** I recomputed failed names from raw FAIL headings and compared tip, pre-commit source and selected base artifacts. I separately compared the older dev manifest: its unit slice includes two failures already documented as disappeared. This prevents the shorthand “dev-known set plus one” from becoming a false literal set-equality claim.

I inspected mutate.sh and stamp-check.sh before assessing the trap entry. Normal mutant runs append; the comparator chooses the first stamp. Every current mutant has one final-tip header, a real intended test result and hashes matching its immutable source. All six archived original mutant records also remain internally complete. The earlier review's custody finding is not negated by the append mechanism, but overwritten numbered gate paths cannot be treated as preserved original artifacts.

## Dead ends and self-charges

- My first parser inventory ran from the package subdirectory with a root-prefixed path filter, yielding zero files. I rejected the empty result, reran from the worktree root with full-tree Git paths, obtained 26 files and 53 expressions, and inspected the complete output. No zero-file result was used as evidence.
- Some batched reads exceeded the tool's combined display budget. I reread the worker report, self-report and required original-verdict portions separately. The dispatch was also compared byte for byte with the fully read amended worker packet and is identical. Future reviews should keep individual evidence reads below the combined output cap.
- I did not run the optional focused unit files. Saved final-head project evidence was sufficient to check the reported outcomes; rerunning unchanged passing tests would not resolve the static backing-array defect or the caller-domain misclassification.
- I did not assign a time or token cost to these detours: neither was separately measured. No manufactured elapsed-time accounting is included.
- The severity wording is deliberately scoped. The patch-risk rubric's “critical” likelihood category applies to a failed required property; it is not a critical-severity vulnerability claim. The report explicitly states the absence of a demonstrated production writer or external exploitation path.

## Packet audit

P1's original ancestry/type mistake is corrected, but the phrase “sealed list” still misdescribes the runtime export. That residual premise charge is shared with my prior guidance. P2 is cleared by the widened producer/consumer read grant, and P3 is cleared by the explicit inventory correction in the amendment. The worker's two false free-tail classifications are its audit finding, not new packet instructions. No permission or scope clarification was needed to finish this review.

## Landing

The fresh isolated merge-tree computation returned exit 0 and tree `b023ef918142faf4554806ba781777ba0d63b44e`, equal to the final tip. Temporary object writes were confined to a disposable directory and removed; no checkout, index, ref or repository object-store write was made.

Only the two requested reviewer files are delivered. No implementation, test, board, DECISIONS, worker report, worker log or tool was edited. The formal recommendation remains **revise / revise** until the two required changes are addressed.

## Not verified

No fresh project tests, mutants, live provider/database/TLS operations, browser flow or disclosure reproduction were performed. Runtime malicious mutation of the shared vocabulary is a static conditional finding, not a measured production event. Intermediate appended transcripts and every original r0 numbered gate are not available as separate preserved artifacts. Exact passing behavior under the package-declared Node version and the worker's separate at-tip neighboring exit-0 run were not established.

## Structured patch-risk assessment

The following JSON was validated using the installed skill's validator through standard input; exit 0. It is embedded here to honor the two-file output limit.

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a",
    "sourceType": "commit_range",
    "base": "1fc2dece2775ca77c56a57fd93e1d656a019c24b",
    "head": "f5236484b37b7f4b0baced2bed5d1d1c12b39a3d",
    "changedFiles": [
      "dialectical-engine/.hermes/TOOLING-TRAPS.md",
      "dialectical-engine/apps/runner/src/dev-auth-stack.ts",
      "dialectical-engine/apps/ui/lib/v3/tokenUnlock.ts",
      "dialectical-engine/packages/judgement/src/s04.ts",
      "dialectical-engine/tests/unit/dev-auth-stack.test.ts",
      "dialectical-engine/tests/unit/judgement-s04.test.ts",
      "dialectical-engine/tests/unit/v2ui-data-layer.test.ts"
    ],
    "sha256": "dc1f91ca14d3d99a290dafd13a4d59287bc19566affdf2fbb2bf71e6109e5eb1"
  },
  "recommendation": "revise",
  "workflowLabel": "revise",
  "impact": {
    "rating": "moderate",
    "rationale": "Diagnostic confidentiality and code identity affect bounded runner, panel and UI consumers; panel reasons enter persisted payloads."
  },
  "regressionLikelihood": {
    "rating": "critical",
    "rationale": "The fixed-alphabet requirement is still conditionally violated: s04.ts:272 aliases an exported unfrozen array, so membership can expand with changes to exposed application state. This rubric rating describes a failed required property, not observed or remote exploit severity."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "Saved final-head focused gates pass three times each and nine intended mutants discriminate. They do not test independence from mutation of the backing vocabulary. Typecheck identity holds, while typecheck and the broader suite still exit 1 with inherited failures.",
    "exactHeadChecksPassed": false
  },
  "recoverability": {
    "rating": "easy",
    "rationale": "Narrow source/test/docs changes with no migration or dependency; reverting restores code behavior but cannot remove diagnostic text already persisted."
  },
  "confidence": {
    "rating": "high",
    "rationale": "Immutable diff and tree bound; callers, direct boundaries, producer enumeration, all mutant hashes and saved gate outcomes checked independently. Runtime disclosure was not measured."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "runJudgePanel is a supported callback API consumed by the runner; the DEV formatter feeds the stack CLI; tokenUnlockFailureMessage feeds the debate page."
  },
  "statusQuoRisk": {
    "rating": "moderate",
    "rationale": "Base retains raw unclassified panel and token messages and accepts arbitrary DEV-shaped error messages."
  },
  "autoMergeExclusions": [
    "public_contract",
    "persistent_state",
    "other"
  ],
  "affectedRuntimeRoots": [
    "Runner panel diagnostic payload",
    "Development auth stack CLI",
    "Debate page token failure banner"
  ],
  "importantCallers": [
    "packages/judgement/src/s04.ts:285 runJudgePanel",
    "apps/runner/src/index.ts:2695 panel note serialization",
    "apps/runner/src/dev-auth-stack-cli.ts:51 error formatter",
    "apps/ui/app/debate/[id]/DebatePageClient.tsx:564 token banner"
  ],
  "riskDrivers": [
    "Membership backing array is exported and unfrozen.",
    "Two finite template caller domains are misreported as free input.",
    "Saved whole-unit suite and typecheck are not globally green."
  ],
  "protectiveFactors": [
    "DEV membership and emission use one primitive snapshot.",
    "All four TLS codes have exact prefix/suffix citations and an exact-output control.",
    "Token classified suffix is byte-identical to base.",
    "All nine current mutant transcripts bind the final head and original/restored source hashes."
  ],
  "materialBoundaries": [
    {
      "id": "panel-reason",
      "invariant": "Every reason must remain within the fixed original seven kind literals, two provider codes and fixed fallback, with FX-HR-H6 for the existing separate note kind.",
      "runtimeRoot": "Runner panel note serialization at apps/runner/src/index.ts:2699",
      "counterexample": "A caller changes the exported membership array and a member rejects with a corresponding added kind. The helper consults the changed array and returns a value outside the original fixed domain.",
      "legitimateControl": "With the list unchanged, TIMEOUT is preserved, its proper prefix falls back, and a changing getter cannot cause an unchecked second helper read to be emitted.",
      "result": "contradicted"
    },
    {
      "id": "dev-code",
      "invariant": "Emit only known source-derived codes or fixed fallbacks while preserving cause order and four-link depth.",
      "runtimeRoot": "Development auth stack CLI",
      "counterexample": "Unknown code-shaped message or changing Error.message accessor is classified using only the captured primitive; unknown strings become DEV_UNRECOGNIZED.",
      "legitimateControl": "Four TLS prefix/suffix combinations retain their exact identities; existing known chains keep order and depth.",
      "result": "supported"
    },
    {
      "id": "token-text",
      "invariant": "Unclassified errors use fixed text and pre-existing classified text remains unchanged.",
      "runtimeRoot": "DebatePageClient token error banner",
      "counterexample": "An unclassified error carrying arbitrary message text returns only the fixed sentence at tokenUnlock.ts:46.",
      "legitimateControl": "The entire classified suffix matches base bytes, supported by saved classified-message controls.",
      "result": "supported"
    }
  ],
  "validation": [
    {
      "name": "Saved final-tip focused unit gates",
      "status": "passed",
      "protects": "Three runs each: judgement-s04 22/22, dev-auth-stack 22/22, v2ui-data-layer 59/59; every exit 0."
    },
    {
      "name": "Saved typecheck identity",
      "status": "passed",
      "protects": "All three eight-line diagnostic streams equal untouched baseline SHA256 50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120; actual tsc exits remain 1."
    },
    {
      "name": "Saved mutants A-I",
      "status": "passed",
      "protects": "Six intended kills, three intended survives; exact-head stamps, anchors, restoration and hashes independently verified."
    },
    {
      "name": "Saved final-tip wider unit suite",
      "status": "failed",
      "protects": "17 failed, 2322 passed, 2339 total; 10 failed files of 124 including one collection failure. Failed names equal selected base and adjusted dev-known set plus corpus count."
    },
    {
      "name": "Fresh independent producer enumeration",
      "status": "passed",
      "protects": "145 literal codes plus three component exits plus four TLS codes exactly equal the committed 152. All 53 base template expressions inspected; two worker classification errors identified."
    },
    {
      "name": "Fresh stamp comparator",
      "status": "failed",
      "protects": "23 records, 8 deliberate historical/unstamped exceptions; all 15 delivery records stamp the final tip."
    },
    {
      "name": "Fresh isolated merge-tree",
      "status": "passed",
      "protects": "No conflicts against base; result b023ef918142faf4554806ba781777ba0d63b44e matches final HEAD tree."
    },
    {
      "name": "Live integration or disclosure reproduction",
      "status": "skipped",
      "protects": "Not performed; no production mutation of the exported failure-kind list or real disclosure is claimed."
    }
  ],
  "unknowns": [
    {
      "summary": "No observed production caller mutates the exported kind array; remaining formatter invariant failure is conditional static evidence.",
      "decisionCritical": false
    },
    {
      "summary": "Saved runs use Node v25.7.0 instead of package-declared 22.23.1; live deployment and supported-version behavior were not separately measured.",
      "decisionCritical": false
    },
    {
      "summary": "Original intermediate appended logs and original r0 gate/audit records are not all retained; final transcripts and archived original mutant sections are independently verifiable.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": []
}
```

REWORK: changes — private fixed S04 membership and corrected template-domain evidence are still required; the DEV snapshot, TLS restoration and final-run custody are cleared.
