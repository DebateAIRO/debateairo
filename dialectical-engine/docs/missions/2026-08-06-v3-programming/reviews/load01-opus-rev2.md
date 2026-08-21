# LOAD-01 — Opus 5 lens, rev2 confirmation (dual diamond DR-153)

Ticket `t_4020ac7b` · worker Codex GPT-5.6 Sol · handoff `handoffs/LOAD-01-codex-handoff.md`
· ruling DR-165(1). Reviewed 2026-08-13. This confirmation covers **all five** rev1 blockers
(GROK-B1 + OPUS-B1..B4), since both lenses blocked rev1.

**Method (DR-163):** every probe and mutation ran in an APFS clone of the PARENT git root —
`cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`) at
`…/9d9a0a17…/scratchpad/clone/DebateAIRO`. Clone verified against the shared tree before
mutating (`diff -rq --exclude=node_modules --exclude=.next-dev --exclude=.pgdata`): the only
difference was `logs/load01-grok-rev2.log`, the concurrent Grok lens's own live log. Every
mutated file was md5-restored and re-verified. Only this verdict was written to the real tree.

**DR-163-A:** no `codex exec` / worker CLI was in flight. The Grok lens (`~/.grok/bin/grok -p
/goal`, pid 29525) is running concurrently — hence the clone. Standing Next dev server (pids
2273/2283/2289) and acceptance stack (pids 74634/74640/74654) were neither restarted nor touched.

**Canary — both reproduce exactly:**

```text
vitest run                                   Test Files  71 passed (71) · Tests  494 passed (494)
vitest run --config acceptance/vitest.config.ts
                                             Test Files   9 passed (9)  · Tests   35 passed (35)
vitest run --config vitest.load01-render.config.ts
                                             Test Files   1 passed (1)  · Tests    5 passed (5)
```

---

## Verdict

**CHANGES REQUESTED — 2 BLOCKING.**

Every one of the five code fixes is **substantively real**. I confirmed each by execution, not by
reading the handoff. The engineering is right: the fabricated 40% bar is gone and replaced by
typed state words, the mid-session terminal genuinely flips the debate, ownership is genuinely
integration-pinned against real Postgres, the production Hatchet task genuinely records a typed
terminal, and the page guard is genuinely behavioural.

What blocks is **enforcement, not engineering**. The render config the rev1 review prescribed was
built but never wired into any gate — it is HYG-01's dead runner exactly. Three of the five
blockers (OPUS-B1, B2, B4) are guarded **only** by that orphan runner. I restored all three rev1
defects and `pnpm test` stayed **494/494 green**. And rev2 *deleted* the rev1 regex that had been
covering B4, so B4 is now strictly **less** protected in the enforced suite than it was at rev1.

---

## 1. What is genuinely fixed (all five — verified by execution)

### GROK-B1 — production terminal recording: REAL

Verified at the production task site, not the acceptance dispatcher.
`apps/runner/src/index.ts:1394-1415`:

```ts
      } catch (error) {
        const recorded = await input.failures.recordTerminalFailure({
          runId: dispatch.runId, workItemId: dispatch.workItemId,
          reason: runnerTerminalFailureReason(error)
        });
        if (!recorded) throw new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", dispatch.workItemId);
        throw error;
      }
```

`runnerTerminalFailureReason` (`:1378-1382`) maps to `RUNNER_EXECUTION_FAILED:<code>` or
`RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR` — a public typed reason, no private diagnostic leak.
`apps/runner/src/main.ts` supplies the **real** repository (`failures: new WorkItemRepository(pool)`),
so the standing bootstrap — not the ceremony — carries the recorder. The failure-to-record case
escalates rather than silently swallowing, which is stronger than the EXEC-01 precedent required.
**A test kills the hang, and it is in the enforced suite** (M-G1 below).

### OPUS-B1 — no fabricated progress: REAL

`DebatePageClient.tsx:753-756` now returns `{ pct: null, label: statusLabel(debate.run_state …) }`
when the walk finds no child work, and the render at `:1200-1209` omits the track, fill and count
entirely when `pct === null`. I re-rendered the **real** component under `react-dom/server` with my
own probe (not the worker's assertions), for each state:

```text
QUEUED   <div class="progressStrip"><span class="progressLabel">Queued</span></div>
CLAIMED  <div class="progressStrip"><span class="progressLabel">Claimed</span></div>
RUNNING  <div class="progressStrip"><span class="progressLabel">Running</span></div>
         "Models arguing": false · "40%": false · progressTrack: false
         progressFill: false · any width:N% style: false
         question line present: true
```

Zero fabricated percentage, and the three states are now **visibly distinct**. That incidentally
closes rev1 **A4** — the typed `QUEUED | CLAIMED | RUNNING` is no longer collapsed and discarded.

### OPUS-B2 — mid-session terminal flips the debate: REAL

`debateAfterRunTerminalFailure` (`:92-99`) sets `status: "failed"`, `run_state: "FAILED"` and a
typed `completion`; the `run.terminal` handler calls it (`:501-509`). Rendered:

```text
--- mid-session loud stop ---
status / run_state : failed / FAILED
contains "Generating"    : false
contains progressStrip   : false
contains "Models arguing": false
failure banner present   : true   ("Debate generation failed: NODE_REVIEW_UNAVAILABLE")
pill                     : class="pill " (not pillGen)
```

No failure banner beside a live bar; no dead reconnect loop. The rev1 B2 symptom is gone.

### OPUS-B3 — ownership integration-pinned: REAL

`tests/integration/database.test.ts:194-245` drives a **real migrated PostgreSQL** fixture through
the **real Fastify** `buildApi` and the **real** `RunRepository.readLoadingProjection`: anonymous →
401, foreign token → 404, owner → 200 `{ state: "QUEUED" }`. It terminalizes its work item in
`finally` so it cannot contaminate the later global `claimNext` test. Both of my rev1 mutations now
go red **in the enforced suite** (M-O3a, M-O3b below).

### OPUS-B4 — page 404 guard behavioural: REAL (as written)

`tests/render/load01-debate-page.test.tsx:70-75` invokes the actual async server component and
asserts `rejects.toThrow("NEXT_NOT_FOUND")` plus a `notFound()` call count. The test is correct.
It is the runner that is the problem — see R1.

---

# BLOCKING

## R1 — the render config is a dead runner; B1, B2 and B4 are unenforced

**The enforced suite cannot see the render tests.** Root `vitest.config.ts`:

```ts
include: ["tests/**/*.test.ts"],     // .test.ts only
```

The render file is `tests/render/load01-debate-page.test.tsx` — **`.tsx`**. The glob does not match
it. `pnpm test` is `vitest run`, i.e. the root config. Collected file list confirms it:

```text
$ vitest list --config vitest.config.ts --filesOnly | grep -E 'tests/render|\.tsx'
(no output — exit 1)
71 files collected, none under tests/render/
```

**Nothing anywhere runs the render config.** Its only occurrences in the entire parent tree are
three lines of handoff prose and the config's own self-reference:

```text
$ grep -rn "load01-render" . --exclude-dir=node_modules --exclude-dir=.git
handoffs/LOAD-01-codex-handoff.md:23   (prose)
handoffs/LOAD-01-codex-handoff.md:37   (prose)
handoffs/LOAD-01-codex-handoff.md:133  (a manual command line)
vitest.load01-render.config.ts:6,7,14  (itself)
```

No `package.json` script, no CI workflow (there are none), no husky hook, no Makefile, no
acceptance config. The handoff itself lists it *outside* the gate block, as a hand-run command.

The baseline arithmetic is the tell: rev1 was 70 files / 493 tests, rev2 is 71 / 494 — rev2 added
exactly **one** file and **one net** test to the enforced suite. That one file is
`tests/unit/load01-production-terminal.test.ts` (GROK-B1). The five render tests contribute nothing
to any gate.

**Measured consequence — the three rev1 defects restored, suite green:**

| # | finding | mutation | enforced `pnpm test` | orphan render config |
|---|---|---|---|---|
| M-G1 | GROK-B1 | recorder call → `const recorded = true` | **KILLED** 493/494 | survives |
| M-O1 | OPUS-B1 | restore `pct … : complete ? 100 : 40` + `"Models arguing"` | **SURVIVES 494/494** | killed (3 failed) |
| M-O2 | OPUS-B2 | `debateAfterRunTerminalFailure` returns debate unchanged | **SURVIVES 494/494** | killed (1 failed) |
| M-O2b | OPUS-B2 wiring | handler stops calling the transition (fn kept) | **SURVIVES 494/494** | **SURVIVES** |
| M-O3a | OPUS-B3 | `AND (run.asker_id = $2 OR 1 = 1)` | **KILLED** 493/494 | survives |
| M-O3b | OPUS-B3 | drop the 401 guard on `GET /v1/runs/:id` | **KILLED** 493/494 | survives |
| M-O4 | OPUS-B4 | `if (0) notFound()` | **SURVIVES 494/494** | killed (1 failed) |
| M-O4b | OPUS-B4 | delete the `not_found` branch **entirely** | **SURVIVES 494/494** | killed (1 failed) |

Both B3 mutations were killed by
`tests/integration/database.test.ts > LOAD-01 run projection ownership boundary`.

So the handoff's claim — *"five demanded mutations killed; render 5/5"* — is **literally true and
load-bearing on nothing**. Under the only suite any gate executes, **three of the five survive**.
A 40%-full bar on a QUEUED run, a failure banner beside a live spinner, and an eternal spinner for
a nonexistent id can all be reintroduced with `pnpm test` reporting 494/494.

**M-O4b is the sharpest case, and it is a net regression.** Rev2 *deleted* rev1's page-source
regex (rev1 `load01-run-projection.test.ts:36-42`; the current file ends at the SQL assertions).
Nothing in the enforced suite now references `page.tsx`'s guard at all — the sole `not_found`
mention is one layer below, at the data layer (`v2ui-data-layer.test.ts:477`). At rev1 the regex
was weak but it did kill deletion of the branch. At rev2 I deleted the whole branch and the suite
stayed green. **B4 is less protected than before the rework.**

**Fix:** make the render tests part of the enforced suite. Either add `tests/**/*.test.tsx` to the
root config's `include` and fold in the render config's `resolve.alias` / `oxc` settings (a vitest
`projects`/workspace entry is the clean form), or add an explicit gate script that the mission's
gate list names and runs. Whichever route: the acceptance criterion is that M-O1, M-O2 and M-O4
each turn `pnpm test` red. Re-state the gate block with the render tests inside the 494 number.

## R2 — even once wired, the B2 *wiring* is untested (M-O2b)

`tests/render/load01-debate-page.test.tsx:57-68` reaches into the module for
`debateAfterRunTerminalFailure` and calls it directly, then renders the result. That proves the pure
function's output. It does **not** prove the component ever invokes it.

I kept the function fully intact and exported, and removed only its call from the `run.terminal`
handler:

```ts
      } else if (event.event_type === "run.terminal") {
        if (next.terminalFailure !== null) {
          void debateAfterRunTerminalFailure;      // ← was setDebate(… debateAfterRunTerminalFailure …)
        }
        setError(next.terminalFailure === null ? null : `Debate generation failed: …`);
      }
```

That is the **exact rev1 B2 defect** restored — banner set, `debate.status` never leaves
`"generating"`, live bar keeps running. Result:

```text
enforced  vitest run                              Test Files 71 passed · Tests 494 passed   SURVIVES
render    vitest run --config …render.config.ts   Test Files  2 passed · Tests   7 passed   SURVIVES
```

Both runners green. This one is not fixed by wiring R1 — the assertion itself is at the wrong seam.

**Fix:** drive the transition through the code path that consumes the event, so that severing the
handler goes red. Applying the `run.terminal` event through the reducer/handler the component
actually uses, then asserting the rendered result, is enough; asserting the extracted function in
isolation is not.

---

# ADVISORY

**A1 — rev1 A1 is still open and still unpinned.** `serverApi.ts:89` mapping *any*
`ContractHttpError` to `not_found` (rather than only `NOT_FOUND`) remains unkilled by any suite. An
API restart mid-generation would render a hard 404 on V's live debate — V's original defect. The
handoff still claims "transport failure → retryable pending state"; that claim still has no fixture.

**A2 — the terminal reason is now real, and the handoff should say so.** Rev1 A6 noted
`TOTAL_REVIEW_COVERAGE_UNSATISFIED` was invented. Rev2's production path emits
`RUNNER_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE` and the render test uses the live code. But
`load01-run-projection.test.ts` still fixtures the synthetic string. Harmless; worth aligning.

**A3 — rev1 A2/A3 (`bool_or(FAILED)` over-reporting, `ELSE 'RUNNING'` absorbing two stuck states)
are untouched.** Not re-litigated as blocking; still worth a stated property.

**A4 — `tests/render/` is untracked but not gitignored.** Correct for a V-gated lane; noting it so
the wiring change in R1 does not land with the test files themselves uncommitted.

---

## Real-tree integrity

```text
30867fcbc5799cbeaeeabfa1a7fd6ae8  apps/api/src/index.ts
0743de8d8fa20b382b88e2b1ed2fe9b8  packages/db/src/index.ts
1f301578afd9da53ebb195a0c6039e46  apps/v2-ui/lib/serverApi.ts
ec760aadd0036dd2ae89aca1b0205d18  apps/v2-ui/lib/v3/adapter.ts
98531ab09373b5a8da34eec4e881e454  packages/contract/src/index.ts
62e836ad1a5e1301065e2aa19b85dc70  apps/v2-ui/app/debate/[id]/page.tsx
95a0378a1a08aef18f42396caaf36e38  apps/runner/src/index.ts
54150dbb996914d328c0db263f7f1652  apps/runner/src/main.ts
f4d1bfc8af74dc1ec1821e060b7b4d7a  apps/v2-ui/app/debate/[id]/DebatePageClient.tsx
```

Clone md5s match the real tree on all nine after restoration; pristine reruns in the clone give
71/494 and render 5/5. The real tree's `git status --porcelain` went 299 → 300 during the review;
the single added entry is `reviews/load01-grok-rev2.md`, the concurrent Grok lens's own verdict.
Nothing in the shared tree was mutated by me; the standing stack was neither restarted nor touched.

## Bottom line

The rework is good engineering. All five defects are genuinely repaired in the product code, and I
confirmed every one by execution rather than by trusting the handoff — including re-rendering the
real component for QUEUED, CLAIMED and RUNNING, and re-running both of my `OR 1=1` and dropped-401
mutations against the real Postgres fixture. B1's fix is better than what I asked for: it spends the
typed run state instead of discarding it.

It cannot ship because the proof does not hold the code. The render harness — the thing I prescribed
— was built correctly and then left off every gate, so the three findings that depend on it are
protected by a runner nothing executes; I reintroduced all three defects with `pnpm test` reporting
494/494 (R1). Rev2 also removed the weak regex that used to cover B4, leaving that guard with less
enforced coverage than it had at rev1. And B2's assertion is at the wrong seam: the handler can stop
calling the transition entirely and both runners stay green (R2).

Wire the render tests into the enforced suite until M-O1/M-O2/M-O4 turn `pnpm test` red, move the B2
assertion onto the event path, and this passes my lens.

— Opus 5 lens, rev2
