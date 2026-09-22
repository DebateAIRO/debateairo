# UIPREP evidence — CP1 existing Support UI

Read-only preparation completed 2026-09-14 by `/root/preview` for ticket `t_60c153c6`. No product file, test, build, stack, browser, package installation, network resource, or service was changed or run.

## Measured lane state

- Packet base: `fa362c5e87abe0e6068cb8f43822d718697258f5` on `codex/support-conversation-cp1`.
- Committed HEAD observed after the editorial manifest landed: `252f8faf46d987e1df89778eff0439ea140994d0`.
- NAV was actively editing 14 disjoint API/database/test paths at the final inventory. Its response contract below is therefore provisional until root stamps the tested NAV/ATTEST commit.
- `apps/ui/**` and `tests/render/sup-01-help.test.tsx` had no diff from the PREVIEW base. `tests/integration/support-routes.test.ts` was NAV-owned and must not be edited by UI until NAV releases it.

## Current UI boundary

The smallest behavioral edit is centered in `apps/ui/components/support/Assistant.tsx`:

- Lines 49-55 define a scalar `SupportReply` with text, one optional link, and an optional case acknowledgement. It has no `sources` or `actions`.
- Lines 157-172 parse only outcome/text, the legacy response link, and case acknowledgement.
- Lines 181-188 collapse all unstructured non-2xx responses into `SUPPORT_REQUEST_UNAVAILABLE`, so the exact snapshot 409 cannot be distinguished.
- Lines 211-223 send the message and parse the scalar reply.
- Lines 252-294 define and read session-storage messages. The reader validates id/role/text only, then casts the array; new source/action fields need the same strict parser as live replies.
- Lines 446-465 redact and append the user request once, reuse/create a session, and map every exception to the existing unavailable response. This is the one-restart insertion point.
- Lines 535-550 build one shared conversation shell and rely on React text rendering. Lines 598-619 reuse it in compact mode; lines 627-741 reuse it in the full help desk.

`SupportWidget.tsx:102-106` and `app/help/page.tsx:7-13` only compose the shared Assistant. They need no change unless the final stable NAV interface introduces a value the Assistant cannot derive.

The current status and SLA presentation must remain unchanged in CP1. In particular, `Assistant.tsx:662-675` still shows the existing service-status block and `:719-725` says one working day. Those are deferred CP3 presentation items even though server case receipts use 48 hours.

## Catalog boundary

`@debateai/support-kb/catalog` is browser-safe: it contains no Node import, defines the closed action IDs and `SupportAction` shape at `catalog.ts:13-44`, the localized action catalog at `:83-99`, and capability-to-article relationships through `:101-223`.

`@debateai/support-kb/navigation` imports only that catalog. Its URL validator at `navigation.ts:24-38` rejects non-first-party, backslash, control, credential-like query, and unknown query/fragment forms. `resolveSupportActions` at `:71-91` maps IDs to canonical localized labels and hrefs using trusted signed-in/language/resource context.

The UI package does not currently declare this dependency. `apps/ui/package.json:14-20` lists only contract, kernel, Next, and React dependencies; the `apps/ui` importer in `pnpm-lock.yaml` likewise lacks Support KB. The final UI packet should add both files to its allowlist and declare:

```json
"@debateai/support-kb": "workspace:*"
```

The UI must import only `@debateai/support-kb/catalog` and `@debateai/support-kb/navigation`. Importing the package root would pull the Node filesystem loader toward the client bundle.

No Support KB implementation change is required for the minimal plan. The UI can validate source IDs against the closed union of `SUPPORT_CAPABILITIES[*].articleIds`, validate source objects as exact `{id,label}` text records, and render labels as React text only. It can validate each exact `{id,label,href}` action by resolving its ID through `resolveSupportActions` with the reply session's trusted `identityBound` and language, then requiring an exact canonical label/href match. Unknown, inapplicable, mismatched, duplicate, malformed, or over-three entries fail the response boundary. If reviewers require the browser to authenticate source labels against a canonical title table rather than treat them as server-owned visitor text, that title table is absent from the browser catalog and would require a separate C1 scope amendment; the current CP1 contract does not provide it.

## Provisional NAV interface to stamp before UI dispatch

At the read-only snapshot:

- `apps/api/src/support/answer.ts:48-55` defined optional `sources: readonly {id;label}[]` and `actions: readonly SupportAction[]` on `SupportAnswerResult`.
- `apps/api/src/support/index.ts:360-366` returned exactly HTTP 409 `{ error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", restart_session: true }` when the session-pinned snapshot was absent, before admission and persistence.
- `apps/api/src/support/index.ts:784-792` emitted `sources` and `actions` arrays with the existing message ID, outcome, text, escalation, and case receipt.
- Current NAV integration assertions covered the exact 409 before admission/model/write and a grounded response containing source `{ id: "getting-started-debate", label: "Start a debate" }` and action `{ id: "start-debate", label: "Start a debate", href: "/login?next=%2Fnew" }`.
- The unresolved Forgot password definition remains `availability: "unresolved"`, `href: null` at `catalog.ts:98`; `navigation.ts:52-53,66-67` resolves no such action. The provisional server response therefore has `actions: []` in both languages.

The final UI packet must replace these provisional line references with the exact tested NAV/ATTEST commit and response schema. It should also say whether arrays are required on all message replies or optional with an empty-array default; C3 should not infer that from a work-in-progress diff.

## Minimal final file contract

Required writes:

1. `apps/ui/components/support/Assistant.tsx` — strict reply/storage parsing, canonical source/action normalization, accessible rendering, and exact one-restart behavior.
2. `tests/render/sup-01-help.test.tsx` — behavioral RED/GREEN for parsing, rendering, parity, storage, and one restart.
3. `apps/ui/package.json` — add the browser-safe Support KB workspace dependency.
4. `pnpm-lock.yaml` — add the matching `apps/ui` importer entry only.

Conditional writes already present in the draft:

- `tests/integration/support-routes.test.ts` only if the stable NAV commit lacks a specific API/UI parity assertion. The provisional NAV diff already covers the exact 409, source/action objects, and no-work-before-409 boundary, so UI should normally consume it as a regression test after release.
- `SupportWidget.tsx` and `app/help/page.tsx` only if stable contract forwarding proves necessary. Current composition does not require it.

No new component, catalog implementation file, browser config, or screenshot script is necessary. A temporary capture script can live outside the product tree and write only UI evidence artifacts.

## Exact implementation outline

1. Extend `SupportReply` and `ConversationMessage` with normalized `sources` and `actions` arrays while retaining every existing field.
2. Create one closed parser used by HTTP replies and stored assistant messages. Require arrays when the stamped NAV contract requires them; otherwise default only absent fields to empty. Reject nonarrays and any member with missing/extra keys, unknown source/action IDs, nontext labels/hrefs, duplicate IDs, more than three members, or a noncanonical action label/href. Do not render partial members from a malformed envelope.
3. Keep response text in ordinary React children. Render source labels as a named text list with no href. Render actions as native same-origin anchors inside the existing assistant message shell, with the canonical localized label as visible text and accessible name. Do not add Markdown, HTML parsing, `dangerouslySetInnerHTML`, external targets, or auth/reset callbacks.
4. Introduce one private error for status 409 plus the exact two-key body. Every mismatched body/status and every unrelated 409 continues to the existing unavailable behavior.
5. In `sendRequest`, redact once and append the user message once. On the exact snapshot error only, synchronously remove the stale persisted capability, set the state session to null, call `createSession(language)` directly, store B, and call `sendMessage(B, sameRedactedRequest, ...)` once. Pass or close over an explicit `retried=false/true`; a second exact 409 produces one existing unavailable assistant reply and no third call. Never use `activeSession()` immediately after `setSession(null)` because it can see A through the old render closure.
6. Preserve own-context selection on the retry, preserve conversation text, and ensure session storage contains no A token/session after restart. If fresh session creation returns an existing terminal reply, render it and stop without a message retry.
7. Leave language controls, disclosures, human escalation, case receipts, rating, consent, focus behavior, status, and SLA presentation unchanged.

## Targeted RED/GREEN matrix

Add render tests for:

- two or three reviewed sources and actions in English and Romanian, with exact ordering and canonical first-party hrefs;
- identical source/action output and accessible names in compact and full-page modes;
- HTML/Markdown-looking text and labels rendered as literal text, with no injected element or external anchor;
- nonarray, missing/extra-key, unknown-ID, duplicate, over-three, mismatched-label, and mismatched-href rejection without partial rendering;
- persisted message revalidation, proving crafted stored actions cannot bypass the live parser;
- stored A session: message A receives the exact 409, A is cleared, B is created once, and the same redacted request is sent to B once; assert one visible user turn, two message calls, one create call, and no A capability in storage;
- second exact 409: no C session, no third message call, and one existing unavailable reply;
- an unrelated 409: zero restart calls and existing unavailable behavior;
- unresolved English/Romanian Forgot password: empty actions and zero auth/reset submissions. Keep the destination-click test explicit TODO/UNVERIFIED and blocking until V supplies the exact destination;
- unchanged disclosure, case receipt, human escalation, rating, language, compact close/focus, and current status/SLA behavior.

After the stable handoff and heavy lease, capture the existing render baseline first, then the focused UI suite from `PLAN.md:155-157`, UI typecheck, supported stack, and both viewports. Do not rerun a passing suite without a relevant edit or failure.

## Installed browser/capture capability

The repository has no `playwright.config.*`, no declared Playwright package, and no checked screenshot runner. The host does have a complete matching installed toolchain:

- Playwright driver package: `/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`, version `1.61.1`.
- CLI symlink: `/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/.bin/playwright` -> `../playwright/cli.js`.
- Driver browser manifest requires Chromium and headless-shell revision `1228`, browser version `149.0.7827.55`.
- Installed Chromium: `/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app` with `INSTALLATION_COMPLETE` and `DEPENDENCIES_VALIDATED` markers.
- Installed headless shell: `/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`, Mach-O arm64 executable, mode `0755`, 159,293,248 bytes, with matching completion/validation markers.
- Installed ffmpeg revision `1011` is available for capture support.

This is sufficient for a later temporary Node/Playwright capture without downloading or installing software. The capture must use the live compiled-CSS support-preview URL, omit `ignoreHTTPSErrors`, omit browser flags that bypass certificate errors, and save full-page and compact screenshots plus DOM/accessibility/action receipts under the allowed `UI-` evidence prefix. If ordinary browser trust fails, record it; do not click through an interstitial or install a CA. Because the driver lives in an npm cache rather than the repository, this capability is host-specific and should be stamped again at final dispatch.

## Limits

- No browser or service was launched, so this is capability evidence, not a browser result.
- NAV interfaces and line numbers are provisional until its tested commit and ATTEST handoff.
- The exact Forgot password destination remains unresolved. No action or reset flow may be invented.
- Full signed-in browser behavior may still need a safe pre-existing test fixture; no credential entry is authorized by this preparation.
- Actual model-token usage is **UNAVAILABLE**.

