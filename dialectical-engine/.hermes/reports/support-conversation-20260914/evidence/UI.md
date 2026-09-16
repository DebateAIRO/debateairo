# UI evidence

- Ticket/session: `t_36e6e01e` / `/root/preview`
- Input product revision: `58fbaa7d5535dad89b479b98776cf2b8e88b978e`
- Scoped UI commit: `1ed6c29d327db535259bb428eb181e1e97081c99`
- Status: READY FOR PEER REVIEW; CP1 acceptance is not claimed.

## Implemented contract

The existing full Help desk and compact Support widget now consume the browser-safe `@debateai/support-kb/catalog` and `@debateai/support-kb/navigation` exports. The UI package declares that direct workspace dependency and the lockfile changes only its importer.

Support message responses accept absent `sources` and `actions` only for legacy terminal shapes, defaulting each to an empty immutable array. Present arrays are bounded to three entries. Sources require exact `{ id, label }` keys, a nonempty escaped label, a unique ID, and membership in the closed catalog article-ID set. Actions require exact `{ id, label, href }` keys, a unique ID, and exact equality with the browser-safe resolver under the trusted session identity and language. Malformed, extra-key, duplicate, unknown, over-limit, or context-mismatched objects fail closed. Stored assistant messages are projected through the same checks before restoration, so session storage cannot bypass the response boundary.

Both surfaces render response text and server-owned source labels as React text children. Sources use an accessible list and actions use a labelled navigation region with native same-origin anchors. The existing citation shell, disclosure, status, SLA, language, rating, human handoff, privacy/context, case-receipt, and degraded presentation remain in place.

Only the exact 409 body `{ "error": "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", "restart_session": true }` starts recovery. The assistant removes stale session A from durable state, creates B, and retries the same already-redacted current request exactly once. A second exact mismatch removes B and produces the existing unavailable message; an unrelated or extended 409 never takes this branch. The visible transcript keeps one user turn.

Forgot-password EN/RO requests stay within Support and currently render no action because the verified product destination remains unresolved. No password, authentication, recovery, credential, or reset operation was added.

## Verification frames

- Exact post-NAV baseline at `58fbaa7d`: 5 files / 169 tests passed in the normal listener-capable execution mode (`UI-baseline-cluster-normal.log`). The earlier sandbox frame stopped on listener `EPERM` and is environmental only.
- Meaningful RED before implementation: 1 file failed; 21 new assertions failed while 31 existing assertions passed and the pending Forgot click remained TODO (`UI-red-render.log`).
- First GREEN attempt failed at module resolution because the UI package did not yet expose the new direct workspace dependency (`UI-green-render-r1.log`). The final render frame passed 52 tests with 1 TODO (`UI-green-render-final.log`).
- A new second-mismatch storage assertion failed because fresh B remained durable after its mismatch (`UI-red-second-mismatch-storage.log`); after the bounded fix, the targeted case passed (`UI-green-second-mismatch-storage.log`).
- Final required cluster: 5 files / 194 tests passed with 1 TODO (`UI-green-cluster-final.log`).
- Final UI package TypeScript check after the last product edit passed (`UI-tsx-typecheck-final.log`). This is the TSX evidence; repository typecheck excludes the component.
- Repository typecheck remained red with 76 diagnostics. Machine comparison to immutable `b7ca2c413bf3242ce18e29a397dc9a3aa9228893` found 73 exact baseline diagnostics plus 3 of the same diagnostics at moved lines, with 0 introduced and 0 baseline-only (`UI-root-typecheck.log`, `UI-typecheck-comparison.json`). This is an attributed inherited failure, not a full PASS.
- `git diff --check` was clean. The scoped commit contains exactly four files and the worktree was clean immediately afterward.

## Boundary mutation evidence

- Suppressing action rendering failed all 4 full/compact EN/RO assertions (`UI-mutant-render-actions.log`).
- Omitting canonical href equality failed the forged-href assertion (`UI-mutant-action-href.log`).
- A neighboring status-text mutation did not affect that href assertion (`UI-neighbor-mutant-action-href.log`).
- Every mutation was restored before the final render and cluster frames.

## Browser and runtime evidence

The supported `support-preview` stack reached `DEV_AUTH_STACK_READY=https://localhost:3100:RUNNER_REGISTERED` and remains active for the next integrated review. Existing default listeners were preserved. The installed host Playwright 1.61.1 and Chromium headless-shell 1228 used a new isolated profile. The browser opened `https://localhost:3100` without `ignoreHTTPSErrors`, `-k`, a custom CA override, or any global trust change; `tls_bypass` is recorded as false.

The browser loaded the real Next application and compiled CSS. Support API responses only were synthetic and are marked `synthetic_api: true`; this evidence does not establish live model or answer quality. The final capture passed and the four screenshots were visually inspected. Full and compact views in EN and RO each showed the expected grounded response, two ordered sources, one canonical action, and intact established layout. At 390 px, the Romanian source/action labels wrap within their existing card without clipping or overlap. The action was focused and activated with keyboard Enter, reaching `https://localhost:3100/login?next=%2Fnew`.

The synthetic browser stale-session trace observed exactly A message -> create B -> B message. Both message bodies were already redacted, only one user turn was visible, A was absent from storage, and B was present. The receipt stores no headers, capabilities, real credentials, or raw rejected completion text. Expected unauthenticated 401 console entries and the injected stale 409 are recorded as HTTP errors; the successful UI assertions distinguish them from browser failures.

The first browser attempt used `networkidle`, which is unsuitable for the Next development client. A second attempt waited for server-rendered markup but acted before hydration. The bounded diagnostic proved script resources loaded and a language state transition worked after hydration. The final harness retries that visible state transition, settles the cookie bar through its ordinary Essential-only control, and waits for the existing message animation before capture.

## Dependency custody and limits

`pnpm install --offline --frozen-lockfile` first refused a non-interactive purge prompt. Retrying with the UI filter and `CI=1` recreated the worktree root dependency tree, reused 67 local packages, downloaded 0, then stopped because the local store lacked `@types/react@19.2.18`. No network install or version change occurred. The lane was restored only from the already-installed source checkout: its root `node_modules` was APFS-cloned, each of the 31 existing workspace `node_modules` directories was cloned to the matching worktree path, and the normal worktree-local UI symlink `apps/ui/node_modules/@debateai/support-kb -> ../../../../packages/support-kb` was added. Node resolved the browser-safe package entry, tests and typecheck passed, and the failed partial dependency backup was removed. The generated symlink and dependency trees are ignored worktree state and are not committed.

Real-relay/manual Support-answer behavior was not exercised by this UI node. Root plans a separately labelled, post-security-fix creation/Settings/export EN/RO smoke through the actual API. The exact first-party Forgot-password destination and actual Forgot click remain UNVERIFIED and gate-blocking. Actual usage UNAVAILABLE.
