# UI-02a Codex handoff — rev2 percentage score presentation

Ticket: `t_d4d7d993` · worker: Codex GPT-5.6 Sol · session: `kanban-run-60`

Current disposition: `REWORK READY FOR HERMES REVIEW — UI-02a rev2`. Grok rev1 approved. Opus rev1's sole blocking finding B1 and directed advisories A3, A1, and A7 are closed. The orchestrator supplied and discharged the earlier browser-evidence block in its 2026-08-11 15:37 ticket comment.

## Rev2 delivered

- B1: replaced the two raw NUL source bytes in `apps/v2-ui/lib/v3/adapter.ts` with TypeScript `\u0000` escapes. The delimiter is still U+0000 at runtime; it was not changed to a printable character.
- A3: introduced executable `v3NodeScoreDetails`, and made `NodeDetailDrawer` consume it. Its behavioral test uses the original failure value `0.41000000000000003` and requires `≈41%`, so a raw-float drawer regression now fails for the right reason.
- A1: scoring banner copy now points readers to each badge tooltip and claim drawer. It no longer names a nonexistent per-node section in the Honesty drawer.
- A7: provenance assertions now use `v3ScorePercentage(number.value).text`, not `${number.value * 100}%`.
- Preserved the already-approved typed absence, percentage rule, provenance, and V3-versus-V2 endpoint decision unchanged.

## Frozen formatter and byte-identity proof

The formatter region hash was captured before rev2 and checked afterward:

```text
before 59049c36b5ea379ee09de2478b5f5ad1bdcf4b9c9222efc23d0650b6691a48a4
after  59049c36b5ea379ee09de2478b5f5ad1bdcf4b9c9222efc23d0650b6691a48a4
```

Actual source/textability output:

```text
raw_nul_count=0
escaped_nul_count=2
apps/v2-ui/lib/v3/adapter.ts: Java source, Unicode text, UTF-8 text
306:export function v3ScorePercentage(value: number): Readonly<{ text: string; detail: string }> {
336:      percentage: v3ScorePercentage(node.base_score.value),
344:      percentage: v3ScorePercentage(node.final_strength.value),
358:  const percentage = v3ScorePercentage(number.value);
```

The behavioral identity-key test proves the runtime result for fields `a`, `b`, `c` is byte-for-byte `61 00 62 00 63` (`Buffer` hex `6100620063`) and equals `a\u0000b\u0000c`. The same test proves the delimiter keeps otherwise ambiguous field triples distinct.

## Rev2 TDD RED → GREEN

RED, before production changes:

```text
$ npx vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  2 failed (2)
Tests  5 failed | 66 passed (71)
TypeError: v3NodeScoreDetails is not a function
expected banner reason to match /badge tooltip/i
TypeError: modelLedgerIdentityKey is not a function
expected drawer source to contain v3NodeScoreDetails(v3)
expected adapter source not to contain raw U+0000
```

GREEN, after the smallest directed changes:

```text
$ npx vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  2 passed (2)
Tests  71 passed (71)
Duration  325ms
```

## Every required gate — real output

Root TypeScript:

```text
$ npx tsc --noEmit
[no output]
exit 0
```

V2 UI TypeScript:

```text
$ cd apps/v2-ui && npx tsc --noEmit -p tsconfig.json
[no output]
exit 0
```

Full Vitest, including real embedded PostgreSQL integration suites:

```text
$ npx vitest run --reporter=dot
Test Files  60 passed (60)
Tests  416 passed (416)
Duration  18.65s
exit 0
```

Architecture audit:

```text
$ npx tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
exit 0
```

Source audit:

```text
$ npx tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}
exit 0
```

Diff hygiene:

```text
$ git diff --check
[no output]
exit 0
```

## Remaining rev1 advisories — recorded, out of scope

- A2: banner's “each card” wording is exact for the default tree/canvas view, while thread/split/map do not receive V3 score nodes. Extending those views is outside this scores-only rework.
- A4 (historical, corrected by HYG-01): the repaired insights-strip branch had only source-wiring coverage. Its helper did not compile under the ad-hoc NodeNext command, AND the declared package test runner `scripts/run-node-tests.mjs` did not exist, so the 31KB scoring-response behavioral suite could not run at all. HYG-01 restored the runner, loads the TypeScript helper through `tsx`, and wires the suite into root Vitest.
- A5: other `LabeledNumber` displays in `AnswerHonestyDrawer` still use raw notation for different quantities. A cross-surface notation decision is outside UI-02a rev2.
- A6: a tiny positive score can display as `≈0%`; the approximation mark and exact probability detail distinguish it from exact zero. The formatter was explicitly frozen after exhaustive external verification.
- A8: neighboring V2 `formatScorePercent` clamps/defaults numbers, but UI-02a does not import it and tests forbid its use in V3 badges. Repairing that unrelated formatter is outside scope.

Grok's separately numbered advisory about non-probability/non-finite direct formatter inputs is also unchanged: the served contract parse rejects non-finite values, and changing presentation policy for finite out-of-range numbers would be a new product decision.

## Files changed in the Codex pass

- `apps/v2-ui/lib/v3/adapter.ts`
- `apps/v2-ui/components/DebateCanvas.tsx` (first-pass documentation alignment)
- `apps/v2-ui/components/NodeDetailDrawer.tsx`
- `tests/unit/v2ui-data-layer.test.ts`
- `tests/unit/v2ui-pages.test.ts`
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02a-progress.log`
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02a-codex-handoff.md`

Maker/model attribution remains UI-02b scope. Pre-existing unrelated dirt and dev-server-owned `.next-dev` artifacts remain untouched. No commit, push, merge, branch/reset operation, production build, or service restart was performed.

Comments read through: `2026-08-11 16:04` Codex exact `REWORK READY FOR HERMES REVIEW - UI-02a rev2` marker, after orchestrator rev2 verification.
