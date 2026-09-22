# UIPREP case file — CP1 UI preparation

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the draft omits the package boundary required by its own design

**Cause.** The UI draft requires the browser-safe `@debateai/support-kb` catalog, but `apps/ui/package.json` declares only `@debateai/contract` and `@debateai/kernel`. Its lockfile importer likewise has no Support KB dependency. The package already exports browser-safe `./catalog` and `./navigation` subpaths; the UI cannot consume them as a declared workspace dependency without adding the package and lockfile entries.

**Price.** If implementation starts from the current draft, it will either fail module resolution, reach for an undeclared root dependency, or duplicate routes inside the client. Discovering this after a RED test or build would cost an avoidable edit/review cycle. Actual token usage is **UNAVAILABLE**.

**Upgrade.** Add `apps/ui/package.json` and `pnpm-lock.yaml` to the final UI allowlist. Declare `@debateai/support-kb: workspace:*`. Import only its browser-safe subpaths; never import the Node filesystem loader from the package root into the client bundle.

## Finding 2 — the current response parser erases the one error identity C3 must recover from

**Cause.** `readJson` turns every non-2xx envelope without `outcome` and `text` into the same `SUPPORT_REQUEST_UNAVAILABLE` error. The provisional NAV contract returns the exact 409 `{ error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", restart_session: true }`. Today the UI cannot distinguish that response from unrelated 409s or 503s, so `sendRequest` renders the generic degraded message.

**Price.** A naive retry in the catch block would retry unrelated failures, while a state-only `setSession(null)` followed immediately by `activeSession()` risks reusing the stale session through the current render closure. Both defects would take interaction tests to diagnose.

**Upgrade.** Parse the exact status/body pair into one private typed sentinel. Keep every other non-2xx response on the existing unavailable path. On that sentinel only, discard the stored A capability, create B directly, and resubmit the already-redacted request once. Pass an explicit attempt count; never infer retry state from asynchronous React state.

## Finding 3 — persisted conversation validation must grow with rendering

**Cause.** `StoredConversation` currently validates message id, role, and text only, then casts the whole message array. Adding `sources` and `actions` only to the live HTTP parser would allow stale or manually altered session storage to bypass the new action validation on reload.

**Price.** Two parsers could drift and a later security review would have to find the storage bypass separately.

**Upgrade.** Use one strict message parser for HTTP replies and stored assistant messages. Enforce exact source/action member shapes, known source IDs, canonical catalog action label/href for the current language and identity, no duplicate IDs, and the server maximum of three. Persist only the normalized values returned by that parser.

## Finding 4 — the existing component already gives compact/full parity

**Cause.** Both the compact branch and full `/help` branch render the same `conversation` JSX assembled in `Assistant.tsx`. `SupportWidget.tsx` and `app/help/page.tsx` only compose `Assistant`.

**Price.** Editing all three product components would increase the review surface without adding behavior.

**Upgrade.** Keep the implementation in `Assistant.tsx` and prove both modes in `tests/render/sup-01-help.test.tsx`. Leave `SupportWidget.tsx` and `app/help/page.tsx` unchanged unless the stable post-NAV interface introduces a prop that the shared component cannot derive. Preserve the current status and one-working-day SLA wording for CP3 as instructed.

## Finding 5 — browser capability exists, but the repository does not declare it

**Cause.** CUA was unavailable because the Mac was locked, yet the host already contains Playwright 1.61.1, its CLI/core, matching Chromium revision 1228, Chrome for Testing, and the executable headless shell. These live under npm and Playwright caches, not this repository's package manifest or config.

**Price.** Treating CUA failure as a global browser blocker would postpone compiled-CSS verification unnecessarily. Treating the host cache as a repository dependency would make the receipt non-reproducible on another machine.

**Upgrade.** For this mission, stamp the measured absolute driver and browser paths into the UI packet and use a temporary capture script without installing anything. Launch with ordinary certificate verification; do not set `ignoreHTTPSErrors` or a browser TLS bypass. Record the host-cache dependency as an environment limitation. A future repository-wide upgrade can declare Playwright and a checked capture script deliberately.

## Finding 6 — the unresolved recovery destination must remain visibly unresolved

**Cause.** The browser-safe catalog deliberately defines `forgot-password` with `availability: "unresolved"` and `href: null`; the resolver returns no action. The provisional server contract also returns an empty actions array for English and Romanian recovery phrases.

**Price.** Trying to make the acceptance flow green now would invite a guessed Settings, sign-in, saved-MFA, or reset endpoint and violate the owner gate.

**Upgrade.** Commit a passing closed-behavior test proving no action and zero auth/reset submission while unresolved. Keep the destination-dependent click test explicitly TODO/UNVERIFIED and gate-blocking until the owner supplies the exact destination; never count the skipped interaction as passed.

## One-prompt machine upgrade

Before dispatching UI, generate a checked interface stamp containing the exact NAV commit, 409 envelope, source/action schemas, maximum array cardinality, browser-safe imports, UI package dependency delta, and headless capture executable. The author prompt can then direct one sequence: capture the stable baseline; write render REDs; update `Assistant.tsx`; update the UI dependency and lockfile; run focused GREEN; start the existing support-preview profile; use the installed headless browser with ordinary TLS validation at full and compact viewports; save screenshots and accessibility/action receipts; signal the supervisor; and file hashes. The unresolved Forgot password destination remains a named external gate instead of a rediscovery task.

## Actual measurements

- Preparation base: `fa362c5e87abe0e6068cb8f43822d718697258f5`; committed HEAD observed later at `252f8faf46d987e1df89778eff0439ea140994d0`, with NAV changes still provisional and disjoint from UI.
- UI product files changed since PREVIEW base: none. `tests/integration/support-routes.test.ts` is currently NAV-owned.
- Likely final UI product edits: `Assistant.tsx`, its render test, `apps/ui/package.json`, and `pnpm-lock.yaml`.
- Existing headless driver: Playwright `1.61.1`; expected Chromium/headless-shell revision `1228`, browser version `149.0.7827.55`.
- Installed executable: `/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`, mode `0755`, 159,293,248 bytes.
- Browser execution: **NOT RUN**; no heavy lease, service, browser, install, or network action was used.
- Actual token usage: **UNAVAILABLE**.

