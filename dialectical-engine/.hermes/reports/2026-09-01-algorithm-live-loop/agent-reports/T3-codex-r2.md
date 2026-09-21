CODEX REVIEW T3 r2 — CHANGES · comments read through: t03-r2-2026-09-01

# T3 flagship lane — static rework verification

## Verdict

**REWORK / CHANGES. One blocking finding: B6. Round 3 is the last.** B1-B4 and N4
close; B5's M=3 receipt arm closes, but J13(b)'s separate canonical-mint obligation does
not. This is post-worker ruling content, not a surprise or retroactive worker miss: the
worker froze r2 while N1 still explicitly awaited ratification, and J13 arrived after
that marker. It nevertheless blocks approval because the r2 packet expressly requires
this seat to verify the mint mechanics.

This seat obeyed the packet's STATIC-only boundary. I ran no tests, builds, live provider
calls, or product writes. I inspected the frozen source, report, decisions, diffs, and
existing logs; runtime results below remain upstream evidence.

## Independent verification

- Packet/board/report integrity: the board is at `rework_round: 1`; the r2 worker marker
  and allowed paths resolve; `sed '$d'` reproduces the worker report SHA
  `999308851d38c3f04e3f4ad523496a8ed8caac68d59a5bc7094986b095c5aabc`.
  The r1-to-r2 history is `4476fe8`, then `7a573ef`; the four-file delta is
  `+356/-28`, `git diff --check` is empty, and the lane worktree is clean.
- **B1 closes.** The M>=2 guard at runner `:1316-1325` precedes the claim at `:1327`.
  The test pins the typed `PANEL_WEIGHTING_UNRESOLVED` code, work-item state exactly
  `{state: "READY", claimed_by: null}`, and zero calls on both doubles (`database.test.ts
  :2761-2798`). Its mono sibling explicitly rejects that code (`:2956-2970`). The
  existing RED log has the reported `ProviderCallFailedError` / `PROVIDER_CALL_FAILED`
  frame, demonstrating that the pre-fix path spent before stopping; the GREEN log says
  `2 passed | 61 skipped`.
- **B2 and J13(a) close.** One `runnerSettings()` factory supplies the eight M>=2
  fixtures with a panel policy, and the shared double answers panel legs without
  consuming the old queues. The 24/24 arithmetic recomputes: each provider retains 16
  original author/review calls and gains eight assessments of the other provider's eight
  authored nodes. Exact pins remain exact at `database.test.ts:1892-1893`, as J13(a)
  rules.
- **B3 closes.** The existing paired logs show the same test and the same failure payload:
  expected `ARCHIVED_REVIVED`, received `UNDER_REVIEW`. Base is 60/61 at line 2804;
  HEAD is 63/64 at line 3101. Three added tests account for 61 to 64, and their placement
  accounts for the +297-line move; the failure signature itself is unchanged.
- **B4 closes.** The M=3 fixture gives A and B the same family, assigns B a higher tau
  (0.9 versus A's 0.5), and applies the sealed 0.5 repeated-family multiplier. The final
  receipt assertion at `database.test.ts:2947` pins selected `row.tau` to A's 0.5; without
  the discount B's 0.9 would win. The mutant log trips the earlier intermediate-weight
  assertion first, so the log alone does not reach the outcome pin, but the shipped
  source does pin the final outcome distinctly.
- **B5's panel arm closes.** The same real-database fixture has one surviving non-author
  voice and one typed `PARSE_FAILURE`, asserts exactly two notes including the author's
  `PRODUCER_GRADING_FORBIDDEN` refusal, persists `PANEL-PARTIAL`, excludes the all-failed
  sibling mark, and continues reduction. The existing mark-deletion mutant log fails
  with `expected [] to include 'PANEL-PARTIAL'`. B6 below is the separate J13(b)
  canonical-vocabulary defect.
- **N4 closes.** The ceremony double uses escape-safe `restatement_text` classification
  and returns named `PROVIDER_DOUBLE_UNSCRIPTED_CLASS` for a recognized class without a
  matching scripted response; it no longer takes another class's FIFO head. The database
  double also replaces the dead quoted-fragment classifier.
- **Scope:** the r1-to-r2 delta is limited to the runner guard, the database/coherence
  fixtures, the ceremony double, and related tooling-trap notes. No unrelated product
  surface or migration changed.

Fresh static probe, output verbatim:

```text
$ git diff --name-only 7bf9193..HEAD
dialectical-engine/.hermes/TOOLING-TRAPS.md
dialectical-engine/acceptance/ceremony.test.ts
dialectical-engine/apps/runner/src/index.ts
dialectical-engine/tests/integration/database.test.ts
$ rg -n 'PANEL-PARTIAL' dialectical-engine --glob '!node_modules/**'
dialectical-engine/apps/runner/src/index.ts:152:export const PANEL_PARTIAL_MARK = "PANEL-PARTIAL" as const;
dialectical-engine/tests/integration/database.test.ts:2817:   *     voices that parsed — confirm-item 5's middle arm, marked PANEL-PARTIAL.
dialectical-engine/tests/integration/database.test.ts:2924:      expect(row.disagreement.marks).toContain("PANEL-PARTIAL");
$ git diff --quiet 7bf9193..HEAD -- dialectical-engine/packages/kernel/src/index.ts dialectical-engine/packages/contract/src/index.ts dialectical-engine/packages/serve/src/index.ts dialectical-engine/tests/unit/t4-way-of-knowing.test.ts
canonical-mint-delta=NONE
$ rg -q 'PANEL-PARTIAL' dialectical-engine/packages/kernel/src/index.ts
kernel-member=ABSENT
```

## Findings

### B6 — J13(b)'s canonical `PANEL-PARTIAL` mint is absent

**File/line:** `dialectical-engine/apps/runner/src/index.ts:152,1651-1655,1682-1685`;
`dialectical-engine/tests/integration/database.test.ts:2896-2925`;
`dialectical-engine/packages/kernel/src/index.ts:67-118`;
`dialectical-engine/packages/contract/src/index.ts:2,11`;
`dialectical-engine/packages/serve/src/index.ts:806-812,1502-1505`.

**Scenario:** run the now-covered M=3 partial-panel arm, then consume the result through
the canonical condition-mark machinery. The runner writes `PANEL-PARTIAL` only into the
untyped `ledger.reduced_judgement.disagreement.marks` JSON, and the test queries that raw
JSON directly. The value is absent from kernel `CONDITION_MARKS`; consequently the
contract's `z.enum(CONDITION_MARKS)` does not admit it, the serve condition-record union
does not name it, and no answer/node condition-mark projection emits it. Any attempt to
feed the value to the canonical projection parser would reject it rather than disclose
it.

J13(b) and J13(c) are cumulative, not alternatives. Clause (c) ratifies the existing
receipt as the acceptance proof surface. Clause (b) separately requires the value to be
minted under T4's **mid-list, schema, projection** discipline. The r2 diff touches none of
the canonical mint files, and the only product occurrence is the runner-local constant.

**Required for final round 3:** add `PANEL-PARTIAL` to the canonical kernel vocabulary in
a safe mid-list position that preserves the DR-176 positional tail; prove
`ConditionMarkSchema` accepts it; admit and emit it through the condition-mark projection
at the ruled node/answer scope; and add a real projection assertion while retaining the
good raw-receipt M=3 proof. Recompute/report the evidence gate because the repair will
invalidate r2's “no kernel/contract touch, so D16 does not gate” scope statement.

## Not independently verified

- No suite, typecheck, database fixture, mutant, build, or provider call was rerun; the
  packet prohibited them. Worker runtime claims remain upstream evidence.
- D15 full-suite proof remains deferred to the integration batch.
- I did not inspect the 1,959-line spine.

## PREDICTIONS

I predict another lens will approve B5 after seeing the raw
`reduced_judgement.disagreement.marks` assertion and will read J13(c)'s
receipt-as-surface clause as replacing, rather than accompanying, J13(b). I predict a
second lens will notice that `ConditionMarkSchema` imports `CONDITION_MARKS` and assume
the new runner-local string therefore enters the enum automatically; the decisive first
check is the kernel array, where the member is absent. In round 3, the likeliest exact
miss is adding the kernel member and schema proof but omitting the serve record/admission
and real answer-or-node projection assertion. Finally, I predict the worker may retain
the r2 “D16 does not gate” sentence after the required kernel edit; gate recomputation
should be checked before interpreting any final green evidence.
