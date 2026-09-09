# BASELINE — mission `debate-tiers` (the authority for every "is it green?" claim; assert the DELTA, never the absolute)

Measured 2026-09-09 by the lane setup (`.hermes/reports/debate-tiers/logs/setup-worktrees.sh`) on both lanes at `dev` @ `7f89f7b7`, fresh clones with node_modules APFS-cloned from the main tree and `generate:contract` run. Re-measure before you lean on a row; a seat whose run overlaps a re-measure re-reads this file before handoff.

## Lane `tiers-s01` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine`, branch `slice/tiers-s01`)

- HEAD `7f89f7b7` on `slice/tiers-s01`
- node_modules: 31 trees cloned; node_modules is a real dir
- `pnpm run generate:contract` rc=0; `packages/contract/generated/client.ts` PRESENT
- `pnpm typecheck` rc=1; diagnostics by file (count · file):
  - 1 apps/api/src/main.ts
  - 1 apps/api/src/support/answer.ts
  - 1 apps/runner/src/support-status-cli.ts
  - 1 tests/acceptance/obs-agent-03-fixture.ts
  - 2 tests/acceptance/obs-agent-04-fixture.ts
  - 1 tests/acceptance/obs-agent-06-fixture.ts
  - 1 tests/architecture/obs-agent-06-copy.test.ts
  - 15 tests/architecture/register-support-publication.test.ts
  - 9 tests/architecture/sup-04-mounts.test.ts
  - 2 tests/integration/obs-agent-01-delivery.test.ts
  - 1 tests/integration/obs-agent-03-fixture.test.ts
  - 1 tests/integration/obs-agent-04-gap-drill.test.ts
  - 4 tests/integration/obs-agent-04-not-wired.test.ts
  - 1 tests/integration/obs-agent-05-connection-drill.test.ts
  - 1 tests/integration/obs-agent-05-docker.test.ts
  - 3 tests/integration/obs-agent-06-status.test.ts
  - 1 tests/integration/obs-agent-06-views.test.ts
  - 8 tests/unit/obs-agent-01-discovery.test.ts
  - 1 tests/unit/obs-agent-01-status-projections.test.ts
  - 5 tests/unit/obs-agent-05-lifecycle.test.ts
  - 2 tests/unit/obs-agent-05-postgres.test.ts
  - 8 tests/unit/s14-ui.test.ts
- `tests/render/ux01-new-debate-form.test.tsx` → rc=1 · Tests  7 failed | 1 passed (8)
- `tests/unit/v2ui-pages.test.ts` → rc=1 · Tests  5 failed | 36 passed (41)
- `tests/architecture/s14-contract.test.ts` → rc=1 · Tests  3 failed | 2 passed (5)
- `tests/render/sup-04-widget.test.tsx` → rc=0 · Tests  8 passed (8) — measured 21:00 (REQ-REV-p1 N3; `logs/baseline-n3-<lane>.log`)
- `tests/architecture/sup-04-mounts.test.ts` → rc=1 · Tests  2 failed (2) = 0 passed / 2 — RED at base, inherited: "admits exactly the four product-route importers" and "keeps the root layout and every zone route structurally support-free" (the same file carries 9 typecheck diagnostics above) — measured 21:00 (N3)
- `tests/unit/evaluator-dev-menu-ui.test.ts` → rc=0 · Tests  2 passed (2) — measured 21:00 (N3)
- `tests/unit/v2ui-data-layer.test.ts` → rc=0 · Tests  57 passed (57) — measured 21:02 (REQ-REV-p1 B2; `logs/baseline-b2-<lane>.log`); line numbers cited by any SPEC are the LANE copy — the main tree's copy carries +41 lines of another mission
- `tests/unit/pol01-policy.test.ts` → rc=0 · Tests  8 passed (8) — measured 21:02 (B2)
- `git status --porcelain | wc -l` after setup / after baseline: 0 / 0

## Lane `tiers-s02` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`, branch `slice/tiers-s02`)

- HEAD `7f89f7b7` on `slice/tiers-s02`
- node_modules: 31 trees cloned; node_modules is a real dir
- `pnpm run generate:contract` rc=0; `packages/contract/generated/client.ts` PRESENT
- `pnpm typecheck` rc=1; diagnostics by file (count · file):
  - 1 apps/api/src/main.ts
  - 1 apps/api/src/support/answer.ts
  - 1 apps/runner/src/support-status-cli.ts
  - 1 tests/acceptance/obs-agent-03-fixture.ts
  - 2 tests/acceptance/obs-agent-04-fixture.ts
  - 1 tests/acceptance/obs-agent-06-fixture.ts
  - 1 tests/architecture/obs-agent-06-copy.test.ts
  - 15 tests/architecture/register-support-publication.test.ts
  - 9 tests/architecture/sup-04-mounts.test.ts
  - 2 tests/integration/obs-agent-01-delivery.test.ts
  - 1 tests/integration/obs-agent-03-fixture.test.ts
  - 1 tests/integration/obs-agent-04-gap-drill.test.ts
  - 4 tests/integration/obs-agent-04-not-wired.test.ts
  - 1 tests/integration/obs-agent-05-connection-drill.test.ts
  - 1 tests/integration/obs-agent-05-docker.test.ts
  - 3 tests/integration/obs-agent-06-status.test.ts
  - 1 tests/integration/obs-agent-06-views.test.ts
  - 8 tests/unit/obs-agent-01-discovery.test.ts
  - 1 tests/unit/obs-agent-01-status-projections.test.ts
  - 5 tests/unit/obs-agent-05-lifecycle.test.ts
  - 2 tests/unit/obs-agent-05-postgres.test.ts
  - 8 tests/unit/s14-ui.test.ts
- `tests/render/ux01-new-debate-form.test.tsx` → rc=1 · Tests  7 failed | 1 passed (8)
- `tests/unit/v2ui-pages.test.ts` → rc=1 · Tests  5 failed | 36 passed (41)
- `tests/architecture/s14-contract.test.ts` → rc=1 · Tests  3 failed | 2 passed (5)
- `tests/render/sup-04-widget.test.tsx` → rc=0 · Tests  8 passed (8) — measured 21:00 (REQ-REV-p1 N3; `logs/baseline-n3-<lane>.log`)
- `tests/architecture/sup-04-mounts.test.ts` → rc=1 · Tests  2 failed (2) = 0 passed / 2 — RED at base, inherited: "admits exactly the four product-route importers" and "keeps the root layout and every zone route structurally support-free" (the same file carries 9 typecheck diagnostics above) — measured 21:00 (N3)
- `tests/unit/evaluator-dev-menu-ui.test.ts` → rc=0 · Tests  2 passed (2) — measured 21:00 (N3)
- `tests/unit/v2ui-data-layer.test.ts` → rc=0 · Tests  57 passed (57) — measured 21:02 (REQ-REV-p1 B2; `logs/baseline-b2-<lane>.log`); line numbers cited by any SPEC are the LANE copy — the main tree's copy carries +41 lines of another mission
- `tests/unit/pol01-policy.test.ts` → rc=0 · Tests  8 passed (8) — measured 21:02 (B2)
- `git status --porcelain | wc -l` after setup / after baseline: 0 / 0

## Rules

- `tests/architecture/s14-contract.test.ts` is RED at base (3 failed / 2 passed) on BOTH lanes — inherited, never claimed; a seat whose work touches the contract states the delta on that suite explicitly (which cases, which direction).
- `pnpm typecheck` is RED at base; every gate asserts no NEW diagnostic outside the pinned files above.
- The MAIN tree is not a baseline surface: it carries 97 uncommitted entries from other missions.
- Both lanes are byte-identical to the commit; 0 dirty entries after setup and after the baseline run.
- `tests/architecture/sup-04-mounts.test.ts` is RED at base (0 passed / 2) on BOTH lanes — inherited from the support-publication work, never claimed; a gate reports it as `0/2 pre-existing` and asserts no NEW failure.
- Every suite a SPEC names has a row above (both lanes); a suite without a row is a finding against the orchestrator, measured before the first RED test of the cluster that touches it.
- The five rows added 2026-09-09 21:00–21:02 (N3 + B2) were measured by `logs/baseline-n3.sh` and `logs/baseline-b2.sh` with 0 dirty entries before and after in each lane.
- From 21:40 on this file grows ONLY at its end (`## Rows added after intake`); nothing above that heading moves again. Cite the pinned typecheck lists by lane heading and date, never by bare line number (the 21:00 mid-file inserts shifted every S02 citation by five lines — REQ-FIX-p2 finding (b)).

## Rows added after intake (both lanes at `7f89f7b7`; measured by `logs/baseline-x.sh`, 0 dirty entries before and after)

### Lane `tiers-s01`
- `tests/unit/t9-mode-tokens.test.ts` → rc=1 · Tests  2 failed | 7 passed (9) — RED at base, inherited from the UI-overhaul T9 work: "renders one accessible toggle that reads the document mode, flips it, and persists it" and "leaves no mode-inert colour literal in the four Wave-0 product files"; a gate reports `7/9 pre-existing` and asserts no NEW failure — measured 21:40 (REQ-FIX-p2 (a); `logs/baseline-x-<lane>.log`)
- `tests/render/prov01-honesty-drawer.test.tsx` → rc=0 · Tests  1 passed (1) — asserts the honesty phrase verbatim at `:41`; row V-14 decides whether the phrase moves — measured 21:40 (REQ-FIX-p2 (c))

### Lane `tiers-s02`
- `tests/unit/t9-mode-tokens.test.ts` → rc=1 · Tests  2 failed | 7 passed (9) — RED at base, inherited from the UI-overhaul T9 work: "renders one accessible toggle that reads the document mode, flips it, and persists it" and "leaves no mode-inert colour literal in the four Wave-0 product files"; a gate reports `7/9 pre-existing` and asserts no NEW failure — measured 21:40 (REQ-FIX-p2 (a); `logs/baseline-x-<lane>.log`)
- `tests/render/prov01-honesty-drawer.test.tsx` → rc=0 · Tests  1 passed (1) — asserts the honesty phrase verbatim at `:41`; row V-14 decides whether the phrase moves — measured 21:40 (REQ-FIX-p2 (c))

### Rows added 22:06 (REQ-REV-p2 N2 — the suites the requirements themselves will turn RED; measured by `logs/baseline-n2.sh`, both lanes at `7f89f7b7`)

#### Lane `tiers-s01` (lane=tiers-s01 HEAD=7f89f7b7 dirty=0; dirty after: 0)
- `tests/integration/evaluator-database.test.ts` → rc=0 · Tests  21 passed (21)
- `tests/unit/api.test.ts` → rc=0 · Tests  24 passed (24)
- `tests/unit/contract.test.ts` → rc=0 · Tests  7 passed (7)
- `tests/unit/load01-live-proof.test.ts` → rc=0 · Tests  1 passed (1)
- `tests/unit/s7-authorization.test.ts` → rc=0 · Tests  31 passed (31)

#### Lane `tiers-s02` (lane=tiers-s02 HEAD=7f89f7b7 dirty=0; dirty after: 0)
- `tests/integration/evaluator-database.test.ts` → rc=0 · Tests  21 passed (21)
- `tests/unit/api.test.ts` → rc=0 · Tests  24 passed (24)
- `tests/unit/contract.test.ts` → rc=0 · Tests  7 passed (7)
- `tests/unit/load01-live-proof.test.ts` → rc=0 · Tests  1 passed (1)
- `tests/unit/s7-authorization.test.ts` → rc=0 · Tests  31 passed (31)

### Rows added 22:32 (ARCH(S02) F-4 — inside SPEC R13's `resolveDiscoveredPanel` grep class; measured by the orchestrator, both lanes at `7f89f7b7`, 0 dirty before and after)
- lane `tiers-s01`: `tests/integration/register-version-boundaries.test.ts` → rc=0 · Tests  6 passed (6) (`logs/baseline-f4-tiers-s01.log`)
- lane `tiers-s02`: `tests/integration/register-version-boundaries.test.ts` → rc=0 · Tests  6 passed (6) (`logs/baseline-f4-tiers-s02.log`)

### Rule added (ARCH(S01) F4) — a slice's baseline covers every suite that READS a file the slice writes, not only the suites a requirement names; the rows below are the S01 read-surface sweep

### Rows added 22:40 (ARCH(S01) F4 — the 17 suites that READ an S01 write surface; re-measured by the orchestrator with `logs/baseline-rs.sh`, both lanes at `7f89f7b7`, identical to the seat's handoff numbers; 7 of 17 carry failures at base, all inherited)

#### Lane `tiers-s01` (lane=tiers-s01 HEAD=7f89f7b7 dirty=0; dirty after: 0)
- `tests/render/bug02-debate-effects.test.tsx` → rc=0 · Tests  4 passed (4)
- `tests/render/evaluator-dev-menu-controls.test.tsx` → rc=0 · Tests  1 passed (1)
- `tests/render/load01-debate-page.test.tsx` → rc=0 · Tests  2 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "LOAD-01 real debate-page render > T21 renders HOLDING with its honest remaining time and no error ba" · "LOAD-01 real debate-page render > renders a mid-session run.terminal failure as failed with no live "
- `tests/render/t1-canvas.test.tsx` → rc=0 · Tests  5 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "card anatomy > renders nested shell/core bezels and token-typed stance tabs for PRO and CON cards 27" · "card anatomy > keeps BASE, FINAL, and an accessible Details control on one card 27ms" · "card anatomy > maps all completed review outcomes and absence to four distinct compact states 30ms" (+2 more)
- `tests/unit/s10-erasure-ui.test.ts` → rc=0 · Tests  3 passed (3)
- `tests/unit/v2ui-ownership.test.ts` → rc=0 · Tests  3 passed (3)
- `tests/architecture/s7-authorization-contract.test.ts` → rc=0 · Tests  1 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it fro"
- `tests/architecture/s8-publication-contract.test.ts` → rc=? · Tests  1 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "Accounts S8 publication architecture > ships the deliberate controls and public-only reader in the U"
- `"COMPONENTS_ONLY" ? "COMPONENTS_ONLY" : "COMPOSED"
+     };
+     const detail = debateDetailFromAnswer(projectable);
+     return {
+       // An answer-only publication carries no argument graph. The adapter would
+       // still synthesise a root from the question line, which would light up the
+       // reading-mode controls over a tree that was never published — so the tree
+       // is dropped and the workspace shows its own empty state instead.
+       detail: debate.answer.tree_included ` → rc=? · Tests  NO TESTS LINE
- `true ? detail : { ...detail, tree: null },
+       nodesById: contractNodesById({ nodes: debate.answer.nodes ?? [] })
+     };
+   }, [debate]);
+
+   // S14's dual gate, public edition: the label must never outrun the bytes.
+   // buildPublicAnswerExport ships exactly what the public envelope carries, so
+   // the label says that and nothing more.
+   const publicExport = useMemo<AnswerExport>(() => {
+     const built = buildPublicAnswerExport(debate);
+     return {
+       available: true,
+       href: built.href,
+       filename: built.filename,
+       label: "Export the published snapshot",
+       toast: "Exported the published snapshot"
+     };
+   }, [debate]);
+
+   return (
+     <>
+       <DebatePageClient
+       id={debate.public_ref}
+       initialDebate={projection.detail}
+       initialAnswer={null}
+       initialError={null}
+       publicMode
+       publicNodesById={projection.nodesById}
+       publicExport={publicExport}
+       publicOverview={({ onDetails, onRead }) => (
+         <PublicDebateOverview debate={debate} onDetails={onDetails} onRead={onRead} />
+       )}
+       renderPublicHonesty={(close) => (
+         <PublicHonestyDrawer answer={debate.answer} onClose={close} />
+       )}
+       />
+       <SupportWidget />
+     </>
+   );
+ }
+

 ❯ tests/architecture/s8-publication-contract.test.ts:169:20
    167|     for (const page of [applicationPublic + applicationPublicClient]) {
    168|       expect(page).toContain("readPublicDebate(id)");
    169|       expect(page).toContain("PublicAnswerDisclosure");
       |                    ^
    170|       for (const forbidden of ["readInspection", "readLedgerDigest", "…
    171|         expect(page).not.toContain(forbidden);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Start at  22:38:52
   Duration  128ms (transform 18ms, setup 0ms, import 26ms, tests 15ms, environment 0ms)

MISSING-OR-FAILED
rc=0
` → rc=0 · Tests  1 failed | 4 passed (5)
- `tests/architecture/role-token-map.test.ts` → rc=0 · Tests  3 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "R2-C1 design-derived role to token-family oracle > 'DebateMap root hub' binds its 'reasoning accent'" · "R2-C1 design-derived role to token-family oracle > 'DebateCanvas agreed review mark' binds its 'agre" · "R2-C1 design-derived role to token-family oracle > 'DebateCanvas disputed review mark' binds its 'di"
- `tests/render/consent-bar.test.tsx` → rc=0 · Tests  7 passed (7)
- `tests/render/consent-card.test.tsx` → rc=0 · Tests  11 passed (11)
- `tests/render/consent-cross-slice.test.tsx` → rc=0 · Tests  7 passed (7)
- `tests/render/consent-guards.test.tsx` → rc=0 · Tests  7 passed (7)
- `tests/render/consent-policy-link.test.tsx` → rc=0 · Tests  14 passed (14)
- `tests/render/t3-library.test.tsx` → rc=? · Tests  4 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "lists > renders recased native selectors and a live count for the four Your debates rows 50ms" · "lists > renders a live count for the three Public debates rows 42ms" · "lists > renders every library row as a shell/core bezel 37ms" (+1 more)
- `"yours" ? 4 : 3);
       |                           ^
    375|       for (const row of rows) {
    376|         const core = row.querySelector<HTMLElement>(':scope > [data-be…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  tests/render/t3-library.test.tsx > lists > renders the public search-indexing disclosure once under the list and never on Yours
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/render/t3-library.test.tsx:397:94
    395|
    396|     expect(publicMatches.length).toBe(1);
    397|     expect(publicList.querySelector(".recentList")?.nextElementSibling…
       |                                                                                              ^
    398|     expect(yoursMatches.length).toBe(0);
    399|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 11 passed (15)
   Start at  22:38:59
   Duration  1.53s (transform 173ms, setup 0ms, import 95ms, tests 959ms, environment 384ms)

MISSING-OR-FAILED
rc=0
` → rc=0 · Tests  4 failed | 11 passed (15)
- `tests/unit/consent-s02-style-contract.test.ts` → rc=0 · Tests  10 passed (10)
- `tests/unit/pda-s03-keyboard-accessibility.test.ts` → rc=0 · Tests  2 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "public debate navigation keyboard accessibility > computes a grouped control treatment and a non-col" · "public debate navigation keyboard accessibility > computes a grouped control treatment and a non-col"

#### Lane `tiers-s02` (lane=tiers-s02 HEAD=7f89f7b7 dirty=0; dirty after: 0)
- `tests/render/bug02-debate-effects.test.tsx` → rc=0 · Tests  4 passed (4)
- `tests/render/evaluator-dev-menu-controls.test.tsx` → rc=0 · Tests  1 passed (1)
- `tests/render/load01-debate-page.test.tsx` → rc=0 · Tests  2 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "LOAD-01 real debate-page render > T21 renders HOLDING with its honest remaining time and no error ba" · "LOAD-01 real debate-page render > renders a mid-session run.terminal failure as failed with no live "
- `tests/render/t1-canvas.test.tsx` → rc=0 · Tests  5 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "card anatomy > renders nested shell/core bezels and token-typed stance tabs for PRO and CON cards 29" · "card anatomy > keeps BASE, FINAL, and an accessible Details control on one card 29ms" · "card anatomy > maps all completed review outcomes and absence to four distinct compact states 31ms" (+2 more)
- `tests/unit/s10-erasure-ui.test.ts` → rc=0 · Tests  3 passed (3)
- `tests/unit/v2ui-ownership.test.ts` → rc=0 · Tests  3 passed (3)
- `tests/architecture/s7-authorization-contract.test.ts` → rc=0 · Tests  1 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it fro"
- `tests/architecture/s8-publication-contract.test.ts` → rc=? · Tests  1 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "Accounts S8 publication architecture > ships the deliberate controls and public-only reader in the U"
- `"COMPONENTS_ONLY" ? "COMPONENTS_ONLY" : "COMPOSED"
+     };
+     const detail = debateDetailFromAnswer(projectable);
+     return {
+       // An answer-only publication carries no argument graph. The adapter would
+       // still synthesise a root from the question line, which would light up the
+       // reading-mode controls over a tree that was never published — so the tree
+       // is dropped and the workspace shows its own empty state instead.
+       detail: debate.answer.tree_included ` → rc=? · Tests  NO TESTS LINE
- `true ? detail : { ...detail, tree: null },
+       nodesById: contractNodesById({ nodes: debate.answer.nodes ?? [] })
+     };
+   }, [debate]);
+
+   // S14's dual gate, public edition: the label must never outrun the bytes.
+   // buildPublicAnswerExport ships exactly what the public envelope carries, so
+   // the label says that and nothing more.
+   const publicExport = useMemo<AnswerExport>(() => {
+     const built = buildPublicAnswerExport(debate);
+     return {
+       available: true,
+       href: built.href,
+       filename: built.filename,
+       label: "Export the published snapshot",
+       toast: "Exported the published snapshot"
+     };
+   }, [debate]);
+
+   return (
+     <>
+       <DebatePageClient
+       id={debate.public_ref}
+       initialDebate={projection.detail}
+       initialAnswer={null}
+       initialError={null}
+       publicMode
+       publicNodesById={projection.nodesById}
+       publicExport={publicExport}
+       publicOverview={({ onDetails, onRead }) => (
+         <PublicDebateOverview debate={debate} onDetails={onDetails} onRead={onRead} />
+       )}
+       renderPublicHonesty={(close) => (
+         <PublicHonestyDrawer answer={debate.answer} onClose={close} />
+       )}
+       />
+       <SupportWidget />
+     </>
+   );
+ }
+

 ❯ tests/architecture/s8-publication-contract.test.ts:169:20
    167|     for (const page of [applicationPublic + applicationPublicClient]) {
    168|       expect(page).toContain("readPublicDebate(id)");
    169|       expect(page).toContain("PublicAnswerDisclosure");
       |                    ^
    170|       for (const forbidden of ["readInspection", "readLedgerDigest", "…
    171|         expect(page).not.toContain(forbidden);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Start at  22:39:11
   Duration  128ms (transform 18ms, setup 0ms, import 26ms, tests 14ms, environment 0ms)

MISSING-OR-FAILED
rc=0
` → rc=0 · Tests  1 failed | 4 passed (5)
- `tests/architecture/role-token-map.test.ts` → rc=0 · Tests  3 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "R2-C1 design-derived role to token-family oracle > 'DebateMap root hub' binds its 'reasoning accent'" · "R2-C1 design-derived role to token-family oracle > 'DebateCanvas agreed review mark' binds its 'agre" · "R2-C1 design-derived role to token-family oracle > 'DebateCanvas disputed review mark' binds its 'di"
- `tests/render/consent-bar.test.tsx` → rc=0 · Tests  7 passed (7)
- `tests/render/consent-card.test.tsx` → rc=0 · Tests  11 passed (11)
- `tests/render/consent-cross-slice.test.tsx` → rc=0 · Tests  7 passed (7)
- `tests/render/consent-guards.test.tsx` → rc=0 · Tests  7 passed (7)
- `tests/render/consent-policy-link.test.tsx` → rc=0 · Tests  14 passed (14)
- `tests/render/t3-library.test.tsx` → rc=? · Tests  4 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "lists > renders recased native selectors and a live count for the four Your debates rows 50ms" · "lists > renders a live count for the three Public debates rows 40ms" · "lists > renders every library row as a shell/core bezel 37ms" (+1 more)
- `"yours" ? 4 : 3);
       |                           ^
    375|       for (const row of rows) {
    376|         const core = row.querySelector<HTMLElement>(':scope > [data-be…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  tests/render/t3-library.test.tsx > lists > renders the public search-indexing disclosure once under the list and never on Yours
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/render/t3-library.test.tsx:397:94
    395|
    396|     expect(publicMatches.length).toBe(1);
    397|     expect(publicList.querySelector(".recentList")?.nextElementSibling…
       |                                                                                              ^
    398|     expect(yoursMatches.length).toBe(0);
    399|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 11 passed (15)
   Start at  22:39:18
   Duration  1.52s (transform 176ms, setup 0ms, import 95ms, tests 961ms, environment 374ms)

MISSING-OR-FAILED
rc=0
` → rc=0 · Tests  4 failed | 11 passed (15)
- `tests/unit/consent-s02-style-contract.test.ts` → rc=0 · Tests  10 passed (10)
- `tests/unit/pda-s03-keyboard-accessibility.test.ts` → rc=0 · Tests  2 ⎯⎯⎯⎯⎯⎯⎯ — RED at base, inherited: "public debate navigation keyboard accessibility > computes a grouped control treatment and a non-col" · "public debate navigation keyboard accessibility > computes a grouped control treatment and a non-col"

### Rows added 23:04 (ARCH-REV-S02-p1 N10 — the remaining members of SPEC R13's `resolveDiscoveredPanel` grep class; measured by the orchestrator, both lanes at `7f89f7b7`, 0 dirty before and after; `logs/baseline-n10-<lane>.log`)
- lane `tiers-s01`: `tests/unit/dr181-ceiling.test.ts` → rc=0 · Tests  3 passed (3) · `tests/unit/dr184-review-resilience.test.ts` → rc=0 · Tests  6 passed (6) · `tests/unit/register-s09.test.ts` → rc=0 · Tests  3 passed (3)
- lane `tiers-s02`: `tests/unit/dr181-ceiling.test.ts` → rc=0 · Tests  3 passed (3) · `tests/unit/dr184-review-resilience.test.ts` → rc=0 · Tests  6 passed (6) · `tests/unit/register-s09.test.ts` → rc=0 · Tests  3 passed (3)
