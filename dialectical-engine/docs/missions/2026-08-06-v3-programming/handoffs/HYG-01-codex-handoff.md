# HYG-01 Codex handoff — verification hardening

Worker session: `goal-019ff620-9189-7af1-9116-74797062db9e / run 73`  
Ticket: `t_4a1f8654`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3` (existing dirty working tree; no branch, commit, push, merge, reset, or other Git mutation)  
Comments read through: `2026-08-12 17:09` Codex rework acknowledgement; latest external directive is the `2026-08-12 17:08` orchestrator dual-diamond rev1 comment  
Review route: DR-153 dual diamond — Opus 5 and Grok must both greenlight.

## Inventory and attribution

HYG-01 changes:

- `tests/integration/database.test.ts` — accepted zero-real-call depth-2, two-maker runner fixture covering multi-round structure and terminal record preservation.
- `apps/runner/src/index.ts`, `tests/unit/pro01-runner-tree.test.ts` — behavior-preserving extraction of fixed-single-root projection plus an independent B2-A witness.
- `apps/v2-ui/scripts/run-node-tests.mjs`, `apps/v2-ui/scripts/node-test-manifest.json`, `apps/v2-ui/lib/scoringResponse.test.mjs`, `tests/unit/v2ui-node-runner.test.ts` — restored the maintained 31KB scoring-response Node suite, shared its manifest, enforced manifest completeness, and made execution an enforced root test.
- 49 former `apps/v2-ui/**/*.mjs` phantom test/source-contract files — content-preserving quarantine to `*.mjs.disabled`; only Next config, the runner, and the manifested scoring-response suite remain active `.mjs` files.
- `tools/check-text-control-bytes.ts`, `tests/unit/text-control-bytes.test.ts`, `package.json` — cached plus untracked/non-ignored text control-byte audit, including dotfiles and quarantined text, with unit and CLI gates.
- `tests/unit/v2ui-pages.test.ts`, `apps/v2-ui/lib/debateHeaderOverflow.ts`, `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` — complete raw-score-field exclusion plus behaviorally testable header-geometry read seam; component behavior is unchanged.
- `tests/unit/pol03-pool-resilience.test.ts`, `tests/integration/pol03-pool-resilience.test.ts`, `tests/support/testDatabase.ts` — mandatory real-DB pool-resilience ratchet and stable `lc_messages=C` fixture/assertion.
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02a-codex-handoff.md` — corrected the historical explanation to include the missing runner, not only the old compile constraint.
- `acceptance/README.md` — corrected the shipped run-envelope attribution from DR-138 to DR-159.
- `docs/missions/2026-08-06-v3-programming/handoffs/HYG-01-progress.log` and this handoff.

The repository was already heavily dirty from preceding mission tickets. HYG-01 preserved that work. Temporary mutations in `apps/runner/src/index.ts` and `NodeDetailDrawer.tsx` were restored exactly. The final runner change is a pure extraction with the same selected-root projection and typed guard, not a behavior change. The temporary `.tmp-scoring-response-test` artifact created while reproducing the dead runner was removed.

## Delivered fixture / guard evidence

### 1. Enforced M=2 depth-2 run

The fixture starts two local provider doubles, queues eight strict judgement artifacts per maker, resolves depth 2 from the run envelope, executes 16 authored calls, and reaches the real envelope-terminal serve path without composer/conformance or external model calls. It asserts 16 nodes, four round-1 expansion calls, eight round-2 expansion calls, both `UNSERVED-MAKER-POSITION` and `ENVELOPE_EXHAUSTED`, the first-configured-provider record, and zero PRESENT number slots.

Named mutation proofs, each applied to the real runner and then restored:

- `if (leg.round > 1) break;` — RED before the structural assertions at `COMPOSITION_CONTRACT_ERROR`: fewer expansion calls leave budget for a composer call, but the queued judgement artifact cannot satisfy the composer schema. The round assertions remain a later defence but were not the observed kill.
- hard-coded `resolveExpansionDepth({ depth: 1 })` — RED by the same envelope-arithmetic/composer-schema mechanism, before the structural assertions.
- replacing `preserveEnvelopeTerminalConditionMarkRecords(...)` at its call site — RED with `CONDITION_MARK_RECORD_REQUIRED` / missing preserved unserved-maker record.
- initial D (widening the served set with the guard present) — RED with `FIXED_SINGLE_ROOT_SERVE_VIOLATED`, but rev1 correctly rejected this as a self-witness because the envelope-terminal fixture never consumes `servedNodes`.

Rev2 closes the independent-witness hole without touching the accepted centerpiece fixture. `buildFixedSingleRootServeNodes` projects the selected root through a pure seam, and the unit test asserts the exact one-member served projection. The decisive D-prime mutation — widen the projection to both authored roots **and delete the guard** — now goes RED on the unexpected secondary served member:

```text
expected [primary, secondary] to deeply equal [primary]
Test Files  1 failed (1)
Tests       1 failed | 7 skipped (8)
```

Baseline focused GREEN:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

### 2. Dead v2-ui runner removed as phantom coverage

Initial RED reproduced the declared package script's hard failure because `scripts/run-node-tests.mjs` did not exist. The restored runner reads a shared explicit manifest for `lib/scoringResponse.test.mjs`, verifies that the suite exists, loads its TypeScript subject through `tsx`, and prints a discovery receipt. The root wrapper fails if that command fails.

```text
$ pnpm --dir apps/v2-ui test
V2_UI_NODE_TESTS_DISCOVERED=1
1..27
# tests 27
# pass 27
# fail 0
```

Recursive discovery exposed 96 stale failures across 49 unrelated legacy `.mjs` files. Rev2 preserves their contents but quarantines every one as `*.mjs.disabled`, so they no longer look active. Exactly three `.mjs` files remain: `next.config.mjs`, `scripts/run-node-tests.mjs`, and the manifested `lib/scoringResponse.test.mjs`. A root test recursively discovers every active `*.test.mjs` and requires exact set equality with `node-test-manifest.json`. Before quarantine it went RED with 15 discovered tests versus the one manifested suite; after quarantine the equality is GREEN. Adding any future unmanifested `.test.mjs` therefore fails the root gate.

### 3. Cached + untracked text control-byte audit

The scanner enumerates `git ls-files -z --cached --others --exclude-standard`, omits deleted index paths, recognizes declared text extensions/names, all dotfiles, and quarantined `.mjs.disabled` text, and rejects every C0 byte except tab/newline plus DEL. A temporary scanner mutation that ignored NUL made the pure-byte test RED on the missing `{ offset: 3, byte: 0 }` finding, then was restored. An isolated Git-repository test proves an untracked `.gitignore` is scanned. A live untracked `.hyg01-untracked-nul.md` plant in this working tree was caught and then removed:

```text
.hyg01-untracked-nul.md:1:0x00
[ELIFECYCLE] Command failed with exit code 1.
```

```text
$ pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0
```

### 4. Accumulated ratchets

- Drawer: `NodeDetailDrawer.tsx` contains zero `base_score` and zero `final_strength` tokens. Each requested mutation was inserted as executable JSX and went RED at `expect(drawer).not.toContain("base_score")`: extra-space direct access, `String(...)`, bracket access, and destructured access.
- Header: `readDebateHeaderGeometry` now accepts structural elements/styles and is behaviorally exercised with displayed/hidden children, intrinsic widths, grid layout, padding, and gaps. Adding `setHeaderActionsCollapsed(false)` after the correct setter went RED (`expected length 1, received 2`).
- POL-03 A1: temporarily changing the integration describe to `describe.skip` went RED in the enforced unit ratchet.
- POL-03 A2: before the fixture pin, the real test went RED with `expected 'en_US.UTF-8' to be 'C'`; after adding the server flag, all 44 focused tests passed.

```text
Test Files  3 passed (3)
Tests       44 passed (44)
```

## Records only

### DR-162-A N-genericity audit for the future M=3 ticket

The current `agentCount > 2` refusal is lawful under DR-159/DR-162 and remains unchanged. Beyond that cost boundary, these hidden two-maker assumptions must be generalized before M=3 can be admitted:

- `DebateMakerRole` is the closed `primary | secondary` pair; `buildMultiMakerExpansionPlan` refuses every count except two and assigns/crosses only those roles. Its round/root loop is topology-shaped, but its admission and author vocabulary are not N-generic.
- `effectiveMakerCount = critiqueSettings !== undefined && criticJudge !== null ? 2 : 1` is the deepest configuration assumption: the settings shape carries exactly one optional critique gateway, so M=3 is not representable even before the ratified-count guard is reached.
- `buildCrossRootExchangePlan` returns exactly two ordered response legs (`0→1`, `1→0`) rather than a rule over N roots.
- the runner selects only `authoredNodes[1]` as `unservedRoot`, emits one affected unserved node, and phrases the record as the served first maker plus one other maker. N>2 requires the served maker plus **all** unserved maker positions.
- `SERVED_ROOT_RULE = first-configured-provider` is deterministic at N>2, but its present record/link shape cannot disclose every unserved root.

### POL-02 sweep corrections

No POL-02 behavior was changed here. Carry these review corrections forward:

- the shipped guard handles the first error delivery; a second error can bypass the custom handler and crash, and a `reply.hijack()` variant remains outside the proof;
- the test's `aborted_by_server` bucket maps every rejection, while its status-200 assertion is dead because headers were not flushed;
- a nonexistent run in real `events()` ends cleanly, so the forced `RUN_NOT_FOUND` test does not reproduce the stale-id incident;
- raw write failures arrive as asynchronous emitter errors rather than the Fastify boundary, and `end()` does not throw;
- response backpressure is ignored because the return from `write()` is never awaited;
- second-error delivery is absent from the sweep.

ENV-01 ADV-6 is closed in documentation: the README now credits DR-159 for the shipped run-level envelope members.

### Rev1 advisory records

- ADV-1: the accepted depth-break and hard-coded-depth mutations currently die on exact envelope arithmetic and a judgement artifact reaching the composer parser, not on the later tree assertions. Enlarging the envelope/queues could change that kill mechanism; the structural assertions remain, but their RED was not directly observed in rev1.
- ADV-2: the literal `effectiveMakerCount` ternary and one-critique-gateway settings shape are recorded above as the earliest M=3 obstacle.
- ADV-3: A17 is narrowed, not class-closed. The named duplicate setter line dies, but a tsc-clean alias (`const forceExpanded = setHeaderActionsCollapsed; forceExpanded(false)`) can bypass the lexical occurrence count. The extracted geometry reader has behavioral coverage; the React state-write path still lacks a behavioral witness. This is recorded only, per the rev2 directive.

## Full gates — real outputs

### Typecheck — GREEN

```text
$ pnpm run typecheck && pnpm --dir apps/v2-ui run typecheck
$ tsc --noEmit
$ tsc --noEmit -p tsconfig.json
```

### Root unit/integration/architecture suite — GREEN

```text
$ pnpm test
Test Files  67 passed (67)
Tests       471 passed (471)
Duration    21.16s
```

This includes the real embedded-PostgreSQL database fixtures and the new two-maker end-to-end test.

### Acceptance — GREEN

```text
$ pnpm exec vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    5.78s
```

### Architecture/source audit — GREEN

```text
$ pnpm run lint
{"edgeRowsChecked":27,"violations":[]}
{"blocking":[]}
```

### Text and v2 Node gates — GREEN

```text
$ pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

$ pnpm --dir apps/v2-ui test
V2_UI_NODE_TESTS_DISCOVERED=1
# tests 27
# pass 27
# fail 0
```

### Rev2 focused blockers — GREEN

```text
$ pnpm exec vitest run tests/unit/pro01-runner-tree.test.ts tests/unit/v2ui-node-runner.test.ts tests/unit/text-control-bytes.test.ts
Test Files  3 passed (3)
Tests       13 passed (13)
Duration    863ms

$ find apps/v2-ui -type f -name '*.mjs.disabled' ...
49 files
190586 total bytes

$ find apps/v2-ui -type f -name '*.mjs'
apps/v2-ui/lib/scoringResponse.test.mjs
apps/v2-ui/next.config.mjs
apps/v2-ui/scripts/run-node-tests.mjs
```

### Patch whitespace — GREEN

```text
$ git diff --check
<no output>
```

The skeleton-repository commands named by the root `AGENTS.md` could not run because this checkout has no `tests/render-templates.sh` or `tests/lint-templates.sh`; the shell reported `No such file or directory`. No `skeleton/`, `VERSION`, or template behavior was changed by HYG-01.

## SOLID / DDD / patterns / DR-115 self-check

- SOLID: test discovery, byte scanning, DOM measurement, and DB provisioning each have one explicit seam; no unrelated service dependencies were introduced.
- DDD: production aggregates and domain vocabularies are unchanged. The only component edit is an extraction of identical geometry reads into the existing UI helper boundary.
- TDD: every new behavior-bearing guard was observed RED before GREEN; all requested survivor mutations were applied and killed.
- Pattern register: provider doubles remain test-only; the scanner is an explicit build guard; the v2 runner uses a visible manifest and discovery receipt instead of a silent glob.
- DR-115: no data, number, maker output, or fallback was invented. The M=2 integration uses local test doubles unreachable from production configuration and asserts typed-loud refusal paths.

## Deferrals, risks, and questions

- Testcontainers remains deferred by DR-121; all required DB evidence ran against real embedded PostgreSQL 18.4.
- The M=3 assumptions above are intentionally records, not behavior changes; the current >2 refusal remains the ratified cost boundary.
- The v2 runner enforces the named maintained scoring-response suite; the unrelated stale `.mjs` corpus is explicitly quarantined and protected by the manifest-completeness ratchet.
- QUESTIONS FOR V: none.
