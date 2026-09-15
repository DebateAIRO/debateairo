CODEX MERGE REVIEW T3C — CHANGES · comments read through: t3c-merge-2026-09-02
VERDICT: CHANGES — 3 findings: 2 blocking, 1 non-blocking mandatory

# T3C merge review

The `stoppingPolicy` repair is statically sound and the merge preserved both
parents without weakening an assertion. Approval is withheld because J27's
required class gate is defeatable and the final acceptance evidence is not bound
to the filed tip. The third finding is an evidence-only D24 defect; non-blocking
does not make it optional.

## Findings

### B1 — the class gate counts nested keys as composed top-level settings

Files/lines: `dialectical-engine/tests/architecture/dev-runner-provider-set.test.ts:173-191`;
`dialectical-engine/apps/runner/src/main.ts:115-134`;
`dialectical-engine/apps/runner/src/index.ts:1049-1134`.

Concrete failure scenario: add this direct optional interface member and make no
change to the constructor call:

```ts
readonly clock?: () => Date;
```

The interface half correctly adds `clock` to `optionalMembers`. The composition
half then searches the *entire* brace-balanced constructor argument with
`new RegExp(...clock\\s*:...)`; it does not restrict matches to semantic top-level
properties. `main.ts` already contains `clock: () => new Date()` at line 127,
nested inside the object passed to `observeProviderTarget` inside
`claimTimeProbe`. Therefore `composes("clock")` is true, `unaccounted` stays empty,
the four known-member and minimum-count pins stay green, and the allowlist remains
empty. The `WalkingSkeletonRunner` constructor nonetheless receives no top-level
`settings.clock` at all.

This is the exact J27 wrong outcome: a new optional member is neither composed nor
declared intentionally absent, while the closure gate passes. M2 used a fresh name
that occurs nowhere else in the literal, so it did not exercise this collision
class. Required correction: compare the interface against semantic top-level
constructor properties (including the conditional `critique` spread), then add a
collision mutant such as `clock` that must die. A TypeScript AST-based extractor is
the least brittle option; another text scan must prove its depth and spread rules.

### B2 — the final gate records fail D27 ADDENDUM-3's tip comparator

Files/lines: worker report `agent-reports/t3c-panel-policy.md:578-625`;
scratch record `scratchpad/stale.txt:1-6`; representative records
`scratchpad/t3c-logs/f-contract.log:1-2`,
`scratchpad/t3c-logs/f-typecheck.log:1-2`,
`scratchpad/t3c-logs/f-cluster-t3c-1.log:1-8`, and
`scratchpad/t3c-logs/f-zone-mine.log:1-2`.

The report labels its check the "corrected form", but it compares record mtimes
with the commit time and prints "records older than the resolved tip." D27
ADDENDUM-3's final standing form instead extracts the first
`commit=<40hex>` field from each current-round record and compares that identity
to the resolved tip. Applied to the filed `f-*.log` set, that ruled comparator
prints fifteen lines, every one `NO-STAMP`; a separate scan finds zero tree stamps.
The four D14/D16 files are empty, so they do not even identify their command or
which half they represent. The report's count of 17 includes two JSON payloads,
but neither those payloads nor the fifteen logs supplies the missing Git identity.

Concrete failure scenario: a gate runs from another checkout or detached commit
after `d2acaea6`'s commit time. Its file is newer than the commit, so the filed
mtime check accepts it and the result is promoted under the `d2acaea6` table even
though it measured a different tree. That is the stale-record class D27 prohibits.

Required correction: after B1's final content commit, capture each gate with the
full command, exit/result, `commit=<full HEAD>`, `tree=<full HEAD^{tree}>`, and
clean state. Give deliberate `44836ecf` baseline halves their own labelled prefix
and validate those against the base identity. Then run D27 ADDENDUM-3's
commit-field comparator verbatim over the current-tip prefix. Until then the
reported typecheck, contract, D14/D16, cluster, and zone outcomes are not
admissible final-tip evidence.

### N1 — the five mutant outcomes have no admissible D24 transcripts

Files/lines: worker report `agent-reports/t3c-panel-policy.md:536-559,570-576,593`;
mission ruling `DECISIONS.md:769-775,907-914`; scratch harness
`scratchpad/mutant-t3c.sh:1-58`.

The report gives a summary table for M1-M5 and says all gate records live in
`<scratchpad>/t3c-logs/`. That directory contains the final `f-*` gate logs and
zone JSON files, but no mutant transcript. The summary does not carry D24's
applied diff or exact command, literal NEW token, `pre=0 -> applied>0 ->
restored=0` gates, both-side SHA-256, restore command, and discriminating output.
The harness is capable of recording those fields; a harness without its output is
not the evidence.

Concrete failure scenario: M3 or M5 is not applied, is applied to the wrong file,
or fails for an unrelated dirty-tree state. The same report table can still say
"killed"; without the ruled transcript no reviewer can distinguish those states.
I independently confirmed statically that the current brace-anchored regex rejects
the named interface rename and that M5 removes `claimTimeProbe` from the optional
set while its known-member pin remains. That supports the source design, but it
does not turn the runtime claim "5 run, 5 killed" into admissible evidence.

Required correction: retain durable D24 transcripts for the complete post-B1
campaign at the final stamped tip, including the new collision mutant. Ticket:
`F-T3C-MERGE-N1` — mandatory evidence repair before approval.

## Static verification record

- Read the dispatch packet in full before the diff, then J27 first, J20, J21,
  J25, D28, D31, D27 ADDENDUM-3, both lane tickets, the complete worker report
  and self-report, all r1-r3 verdicts, both reviewer/protocol contracts, and the
  complete `44836ecf..HEAD` eight-file diff. Per packet I ran no tests, builds,
  typechecks, contract generation, database fixtures, mutants, provider calls,
  Git mutation, checkout, merge, or revert.
- Read-only Git metadata returns HEAD
  `d2acaea66b4419a7f2c70f070b531539eee7d026`, tree
  `4a4303a18a25f543e2e6fd068efc23c891e1995e`, and empty porcelain. The merge
  commit is `31c2a8ababadfb6d5c388134b3be71958e9e45ec`, with parents `332a8eb9...`
  and `44836ecf...`. The parent changes from common base `e040b1ee...` have zero
  path overlap, and the merge has zero combined-diff hunks. The final
  `44836ecf..HEAD` diff is eight files, `+730/-79`, with zero mode changes and
  no `git diff --check` output.
- At `44836ecf`, `main.ts` passes `judgementPolicy`, `runDeathPolicy`, and
  `verdictLabelPolicy`, but not `stoppingPolicy`; `dev-runner-policy.ts` has no
  adaptive-stopping reference. The runner gates every multi-maker work item on
  the missing setting before claim. At merge commit `31c2a8ab`, T3C's panel and
  probe composition is present and `stoppingPolicy` is still absent, so the
  reported `ADAPTIVE_STOPPING_UNRESOLVED` control flow is statically reproduced.
- Commit `5ee89ee9` imports T7's existing reader, extends the existing provenance
  family check, returns the reader's already-frozen value verbatim, and adds the
  one constructor property. It changes no T7 algorithm body or register value.
  The post-merge test delta is additive; `apps/runner/src/index.ts` is unchanged,
  leaving guard order J12 at line 1920 -> T7 at 1930 -> T11 at 1948.
- A non-mutating reverse-patch check of `5ee89ee9` against the filed tree exits 0.
  Its forward numstat is four files, `+34/-1`, so the reverse is the reported
  four files, `+1/-34`. Removing it leaves `stoppingPolicy` in the interface but
  absent from the constructor literal, which the present class gate reports as
  unaccounted unless an intentional-absence reason is added.
- The current interface has fourteen direct `readonly ...?:` members and all
  fourteen are in fact composed by the shipped constructor; the allowlist is
  empty. The interface-name brace anchor is present. The source checks for M1,
  the report's fresh-name M2, both rename shapes, M5, nested return members, and
  keys wholly outside the constructor argument behave as described. B1 is the
  untested nested-key collision inside that argument.
- Structural counting gives 33 `CONDITION_MARKS`. The only three literal 33 pins
  are `s14-ui.test.ts:120`, `dr174-resilience.test.ts:205`, and
  `obs-l2-s02-registry.test.ts:418`; all read 33. No fourth exact cardinality pin
  was found.
- The stored cluster payloads report T3C 14/14 three times, T6 19/19, T10 15/15,
  T11 20/20, and T7 63/63. The zone JSON payloads say mine 1450 total / 1436
  passed / 14 failed and base 1449 / 1435 / 14; their failure-name set difference
  is empty both ways. These are upstream recorded outcomes, not reviewer reruns,
  and B2 states why their final-tip attribution remains unproved.
- Removing report line 2 and hashing the rest reproduces
  `c8258678f8752198c6ced9e5f2b84214370af10730a2592f015452de723235a9`.
  The packet path and both writable deliverables resolve; no mandatory output is
  outside the allowed list. I found no separate packet-owned constant or path
  defect beyond the gate/evidence claims addressed above.

## Not independently verified

STATIC-only means I did not independently establish any compiler, Vitest,
PostgreSQL, generation, D14/D16, mutation, or historical revert outcome. I did
not reproduce the two merge-commit RED arms at runtime. Their control-flow cause
is present in the immutable source, but the final runtime acceptance claims remain
upstream testimony until B2 and N1 are repaired.

## PREDICTIONS

I predict another lens will repeat M2 with a unique `futureUnwiredPolicy` name and
approve the class gate without noticing that composition is searched below depth
1; `clock` should falsify that conclusion while leaving the constructor unwired.
I also predict a report-first lens will accept all post-commit mtimes as provenance
and miss that D27 ADDENDUM-3 emits `NO-STAMP` for every `f-*.log`. The first
cross-lens checks should be the optional-`clock` collision and the corrected
commit-field comparator; expected results are a falsely green class gate and
fifteen rejected records.
