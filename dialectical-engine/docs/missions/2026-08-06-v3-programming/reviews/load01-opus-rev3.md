# LOAD-01 — Opus 5 lens, rev3 closure (dual diamond DR-153)

Ticket `t_4020ac7b` · worker Codex GPT-5.6 Sol · handoff `handoffs/LOAD-01-codex-handoff.md`
· ruling DR-165(1). Reviewed 2026-08-13. This closes my own rev2 blockers **R1** and **R2**.

**Method (DR-163):** every probe and mutation ran in an APFS clone of the PARENT git root —
`cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`) at
`…/9d9a0a17…/scratchpad/clone/DebateAIRO`. The clone was verified byte-identical to the shared tree
before mutating and again after restoring (`diff -rq --exclude=node_modules --exclude=.next-dev
--exclude=.pgdata --exclude=.git` — **empty both times**). Every mutated file was restored from a
pre-mutation copy and md5-re-verified. Only this verdict was written to the real tree.

---

## Verdict

**APPROVED.** LOAD-01 closes.

Both rev2 blockers are genuinely closed, and closed the right way: R1 by putting the render tests in
the **root** config rather than adding another sidecar, R2 by moving the seam onto the consumer the
live stream actually calls. I re-ran my own rev2 mutation ledger against plain `pnpm test` and all
three former survivors are now RED, at exactly the failure counts the handoff claims. The five
product fixes were not touched — eight of my nine rev2 md5s are byte-identical, and the ninth
(`DebatePageClient.tsx`) changed only by the extraction R2 required, which I confirmed
behaviourally rather than by reading.

---

## 1. R1 — CLOSED. The render tests are in the enforced root gate.

Root `vitest.config.ts` (the config `pnpm test` → `vitest run` uses by default) now reads:

```ts
  resolve: { alias: [
    { find: "next/headers",    replacement: resolve(…, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(…, "tests/render/stubs/next-navigation.ts") },
    { find: "@",               replacement: resolve(…, "apps/v2-ui") },
    { find: "react",           replacement: resolve(…, "apps/v2-ui/node_modules/react") },
    { find: "react-dom",       replacement: resolve(…, "apps/v2-ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], … }
```

The JSX/React/`@/`/Next-stub configuration moved **into** the root config; it is not a second runner
anyone must remember. The sidecar is gone — `vitest.load01-render.config.ts` no longer exists
anywhere in the parent tree, and the only surviving `load01-render` strings are three lines of
historical prose in the handoff and my own rev2 verdict. There is no CI, no hook, and no Makefile
target that could have been the "real" gate instead; `.husky/*` are generic hook-runner shims.

Collection, measured in the clone:

```text
$ pnpm vitest list --filesOnly | wc -l                → 72
$ pnpm vitest list --filesOnly | grep tests/render    → tests/render/load01-debate-page.test.tsx
$ pnpm vitest list           | grep -c tests/render   → 5
```

**Correction for the record:** the orchestrator's independent confirmation was reported as
"`vitest list` shows **5 files** under `tests/render/`". That is a mis-transcription. There is
exactly **one** render test *file* containing **five** tests (`tests/render/` holds that file plus
two stub modules, which are not test files). The handoff states this correctly (`1 passed (1) /
5 passed (5)`). The substance — the render file is collected by the root gate — holds; only the
noun was wrong. Nothing in my verdict depends on the difference.

## 2. R2 — CLOSED. The assertion moved onto the event path.

Rev2's B2 test reached into the module for `debateAfterRunTerminalFailure` and called it directly,
so severing the handler's *call* survived both runners. Rev3 extracts the handler into an exported
factory that is the live stream's own consumer:

`DebatePageClient.tsx:121` — `createDebatePageRunEventConsumer(input)`, documented as "the single
event-consumption seam used by the live stream and render tests", with the terminal transition at
`:143-152`. It has exactly two references in the product: the definition, and `:529` inside the
stream `useEffect`, whose `consume(event)` at `:601` is what `contractClient.streamEvents` invokes.
The test now builds that real consumer, feeds it a `RunEventSchema.parse`d `run.terminal`, and
renders the resulting client state. It no longer names `debateAfterRunTerminalFailure` at all.

That is the fix I asked for, and the mutation below proves it.

## 3. Mutation ledger — the three rev2 survivors are now RED under plain `pnpm test`

Each mutation applied alone to the pristine clone, run with the bare enforced command, then restored
and md5-verified before the next.

| # | rev2 status | mutation | rev3 `pnpm test` | killer |
|---|---|---|---|---|
| M-O1 | SURVIVED 494/494 | restore `total ? … : complete ? 100 : 40` + `label: "Models arguing"` (delete the `pct: null` early return) | **KILLED — 3 failed / 496 passed (499)** | all three QUEUED/CLAIMED/RUNNING render assertions |
| M-O2b | SURVIVED **both** runners | sever only the consumer's call — `if (next.terminalFailure !== null) { void debateAfterRunTerminalFailure; }`, function left intact and exported at `:92` | **KILLED — 1 failed / 498 passed (499)** | `renders a mid-session run.terminal failure as failed with no live progress` |
| M-O4b | SURVIVED 494/494 | delete the `else if (result.kind === "not_found") { notFound(); }` branch entirely from `page.tsx` | **KILLED — 1 failed / 498 passed (499)** | `behaviorally throws Next notFound for a genuinely nonexistent id` |

Every count matches the handoff's claimed numbers exactly. M-O2b is the important one: the pure
function is still present, exported and unmodified — only the wiring was cut — and the enforced
suite goes red. That is precisely the case that survived both runners at rev2.

## 4. Canaries and baselines — all reproduce

```text
pristine  pnpm test                                    Test Files 72 passed (72) · Tests 499 passed (499)
pristine  vitest run --config acceptance/vitest.config.ts
                                                       Test Files  9 passed (9)  · Tests  35 passed (35)
canary    OR 1=1 in the ownership predicate            1 failed | 71 passed (72) · 1 failed | 498 passed
          → LOAD-01 run projection ownership boundary > returns 401 to anonymous callers and 404 to a foreign asker
canary    recorder short-circuit (`const recorded = true`)
                                                       1 failed | 71 passed (72) · 1 failed | 498 passed
          → LOAD-01 production Hatchet terminal recording > records a typed terminal before rethrowing a mid-review failure
```

Both rev2-killed mutations remain killed — the enforcement rework did not trade old coverage for
new. Supporting gates also clean in the clone: `pnpm typecheck`, `pnpm --dir apps/v2-ui typecheck`,
`pnpm lint` (`violations: []`, `blocking: []`), `pnpm audit:text-bytes`
(`REPOSITORY_TEXT_CONTROL_BYTES=0`).

## 5. Enforcement-only — the five fixes were not touched

Eight of the nine files whose md5s I recorded at rev2 are **byte-identical**:

```text
30867fcbc5799cbeaeeabfa1a7fd6ae8  apps/api/src/index.ts                      unchanged
0743de8d8fa20b382b88e2b1ed2fe9b8  packages/db/src/index.ts                   unchanged
1f301578afd9da53ebb195a0c6039e46  apps/v2-ui/lib/serverApi.ts                unchanged
ec760aadd0036dd2ae89aca1b0205d18  apps/v2-ui/lib/v3/adapter.ts               unchanged
98531ab09373b5a8da34eec4e881e454  packages/contract/src/index.ts             unchanged
62e836ad1a5e1301065e2aa19b85dc70  apps/v2-ui/app/debate/[id]/page.tsx        unchanged
95a0378a1a08aef18f42396caaf36e38  apps/runner/src/index.ts                   unchanged
54150dbb996914d328c0db263f7f1652  apps/runner/src/main.ts                    unchanged
f4d1bfc8af74dc1ec1821e060b7b4d7a → d1f8094d8c8286598d931dafd25c8e10
                                  apps/v2-ui/app/debate/[id]/DebatePageClient.tsx   CHANGED (R2)
```

So GROK-B1 (production terminal recording), OPUS-B3 (ownership) and OPUS-B4 (the page guard) are
provably untouched at the byte level — their fixes are exactly what I confirmed by execution at
rev2. The single changed file is the one R2 *required* to change, and the change is the extraction:

- `debateAfterRunTerminalFailure` still sits at `:92-99` with the same body I quoted at rev2
  (`status: "failed"`, `run_state: "FAILED"`, typed `completion`) — B2's fix intact.
- The B1 fix is intact at `:784-789` — the `total === 0 && !complete` early return still yields
  `{ pct: null, label: statusLabel(debate.run_state ?? "generating") }`, and the render at
  `:1228-1240` still omits track, fill and count when `pct === null`.
- The line-number drift is consistent with a pure extraction and nothing else: the consumer factory
  added ~34 lines at `:109-155`, and rev2's `:753-756` / `:1200-1209` landed at `:768-790` /
  `:1228-1240`.

I did not take this on structure alone. M-O1 and M-O2b are the behavioural proof that both fixes are
still live in the changed file: had the extraction silently altered either, the pristine baseline
would not be 499/499 green while both mutations go red.

---

# ADVISORY (none blocking)

**A1 — the residual R2 seam: the component's *subscription* is still unpinned.** R2 as I framed it
is closed — severing the handler's call is now caught. One level deeper is not. I replaced the
component's consumer with a no-op, keeping the factory intact and exported:

```ts
    void createDebatePageRunEventConsumer;
    const consume = (_event: RunEvent) => {};
```

`pnpm test` stayed **72 files / 499 passed**. So the enforced suite proves the consumer behaves
correctly and that the consumer is what the stream calls *by construction* (one call site, `:529`),
but not that the effect subscribes it. I am not blocking on this: it is a strictly smaller and more
visible surface than the rev2 defect — cutting it kills the entire live UI rather than one terminal
case, and pinning it properly needs a mounted-component harness with a stubbed stream, which is a
larger apparatus than this finding warrants. Worth a stated property if the render harness ever
grows a jsdom mount.

**A2 — `tests/render/` is still untracked (rev2 A4 restated, now sharper).** `git ls-files
tests/render/` is empty; the directory is untracked and not gitignored, while `vitest.config.ts` —
which *is* tracked and *is* modified — now depends on those files. If the config lands without the
test files, the suite silently drops to 71 files and the three guards vanish with **no failure**.
The whole lane is uncommitted (302 porcelain entries), so this is normal for the mission's staging
discipline, but the config and the tests must land in the same commit.

**A3 — a narrower runner still exists in `package.json`.** `"test:s00": "vitest run tests/unit
tests/integration tests/architecture"` excludes `tests/render`. It is not the mission gate
(`pnpm test` is), and it predates this lane, so it is not the HYG-01 dead-runner pattern — but it is
the one path that would re-open R1 by accident if a gate list ever names it.

**A4 — rev2's A1 remains open and unpinned.** `serverApi.ts:89` still maps *any* `ContractHttpError`
to `not_found` rather than only `NOT_FOUND`, so an API restart mid-generation would still render a
hard 404 on a live debate — V's original defect. Byte-identical to rev2 (`1f301578…`), no fixture
covers it. Out of LOAD-01's scope as ruled; carry it forward rather than lose it.

**A5 — rev2's A2/A3 unchanged.** `bool_or(FAILED)` over-reporting and `ELSE 'RUNNING'` absorbing two
stuck states are untouched. Still worth a stated property; still not blocking.

---

## Real-tree integrity

Clone md5s match the real tree on all nine files after restoration, and the full `diff -rq` of clone
against the shared tree is empty. The pristine clone reruns give 72/499 and acceptance 9/35. The
real tree's `git status --porcelain` count was 302 at review start and 302 at review end (this
verdict is the 303rd once written). No `codex exec` or worker CLI was in flight; the standing Next
dev server and acceptance stack were neither restarted nor touched. Nothing in the shared tree was
mutated by me.

## Bottom line

Rev2's engineering was right and its enforcement was hollow. Rev3 fixes exactly that and nothing
else — and it fixed it in the shape I asked for rather than the shape that would have been easier.
The render tests went into the **root** config instead of gaining a second sidecar, so there is one
runner and `pnpm test` is the whole truth. The sidecar was deleted rather than left to rot as
HYG-01's next dead runner. And R2 was not papered over by asserting harder on the same wrong seam:
the handler became a real, single, exported consumption seam that the live stream itself calls, so
cutting the wiring — with the function left perfectly intact — now turns the enforced suite red.

I restored all three of my rev2 survivors and watched `pnpm test` fail on each, at the exact counts
claimed. I re-ran both mutations that were already dying and they still die. The five product fixes
are byte-identical except where R2 forced a change, and that change is behaviourally proven not to
have disturbed either fix it touches.

The proof now holds the code. **APPROVED.**

— Opus 5 lens, rev3
