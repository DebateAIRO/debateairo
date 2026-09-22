# Public Conversational App Guide Implementation Plan v2

> **For implementation workers:** execute only the lane assigned by the orchestrator. Use `superpowers:test-driven-development` for product changes and `superpowers:verification-before-completion` before a scoped commit. The mission requires separate author, editorial reviewer, attestation, and final reviewer sessions; do not self-review or self-attest.

**Goal:** Make the existing Support surfaces a free-text EN/RO guide to all meaningful visitor-facing menus while removing Support's private-data authority and preserving the established security, response, model, and human-case contracts.

**Architecture:** The answer path remains the admitted public KB plus one redacted user turn. A first lane removes private-context UI/API/repository authority and replaces private-record requests with a fixed no-lookup refusal. Independent lanes add reviewed menu knowledge and correct the Account link; a sequenced recovery lane replaces literal whole-message matching with clause/predicate semantics. Editorial admission precedes the one final affected-suite and preview run.

**Tech stack:** TypeScript 7, React/Next.js, Fastify, Zod, Vitest, `@debateai/support-kb`, PostgreSQL ports.

**Spec:** `docs/missions/support-conversation-20260914/slices/CP1/SPEC-v5.md`. This version supersedes `PLAN-PUBLIC-GUIDE.md`; the predecessor remains sealed evidence.

## Global constraints

- Planning-review baseline: `479763da1f586a217f36204cc81138aaa81c6f81` on `codex/support-conversation-cp1`. The independently authorized PG-3 Account correction is now consumed at clean product revision `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`; this is the measured integration starting revision for the remaining lanes.
- Preserve the current Support model, strict completion envelope, response JSON, snapshot pinning, cipher-return sink, queue/spend/timeouts, degraded handling, storage encryption/shredding, and human-case workflow.
- Model context is admitted reviewed public KB plus the current redacted user text only. CP1 adds no prior-turn history.
- Do not add auth/reset/recovery execution, credential collection or validation, private data reads, raw URLs, dynamic owner links, or an unverified Forgot destination.
- Content authors leave review/owner fields blank. A distinct editorial reviewer and later attestation own admission.
- Use the current closed action resolver. Local/stateful/private controls receive prose, not fabricated links.
- The nullable `support.session.consent_own_context_at` column and historical outcome values may remain for compatibility and shredding, but runtime code must neither select nor update the column and must not produce the obsolete outcomes.
- Each lane runs its focused RED/GREEN frame after relevant changes. Run the exact final affected union and typecheck only once after attestation and composition.
- Public messages contain exactly `{text}`. The Support session stores the selected language; changing EN/RO invalidates the active session before the next message.
- Authoring may be parallel only where writes are disjoint. Every real-corpus route/service/eval frame is serialized on an exact integration revision and identifies its snapshot.

## Ordered work graph

| Lane | Deliverable | Depends on | Product-file overlap |
|---|---|---|---|
| PG-1 | Public-only Support boundary and session-language lifecycle | baseline | owns all private-context UI/API/DB/contract files; tested on integration lane before PG-2 |
| PG-2 | Menu content, status correction, catalog, component records | baseline for authoring; PG-1 composed before integration test | writes are disjoint from PG-1; real-corpus tests are serialized |
| PG-3 | Signed-in Account destination | baseline | completed independently and consumed at `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703` |
| PG-4 | Separate eight-record editorial review | PG-2 exact bytes | evidence only |
| PG-5 | Manifest admission | PG-4 PASS | manifest and attestation tests only |
| PG-6 | Recovery predicate semantics | PG-1 owns shared server file; PG-2 catalog available | route/service evidence pins pre/post-attestation corpus snapshot |
| PG-7 | Verified Forgot connector | owner supplies destination; PG-6 | small catalog/UI tests; cannot be guessed |
| PG-8A | Independent composition and working preview | PG-1, PG-3, PG-5, PG-6, applicable separate reviews | runs with Forgot unresolved/actionless; cannot claim CP1 readiness |
| PG-8B | Connector composition and CP1 readiness | owner destination, PG-7, PG-8A | focused connector checks plus minimal affected composition only |

## Integration schedule for real-corpus consumers

1. PG-1 and PG-2 authors may prepare independent exact-baseline commits/worktrees because their write sets are disjoint.
2. Compose PG-1 first on the current integration lane. Record the exact HEAD and run the complete PG-1 focused frame, including route/service/eval members, before PG-2 bytes are present.
3. Compose PG-2 second. Record the new exact HEAD and run its focused frame, proving all eight new/changed component records are excluded from strict production admission while the editorial manifest binding is absent.
4. PG-4 reviews those exact eight bytes. PG-5 composes the real review binding and runs admission checks at a new exact HEAD.
5. PG-6 may be authored after PG-1 stabilizes `apps/api/src/support/index.ts`. Every PG-6 route/service run records whether it uses the pre-attestation or admitted post-attestation snapshot. Its final real-corpus route frame runs after PG-5.
6. If PG-1 was tested only in an isolated worktree before PG-2 composition, rerun only PG-1 route/service members whose corpus input changed. Do not repeat UI/static/DB members whose bytes and inputs did not change.
7. PG-8A runs the exact final unaffected union once after PG-5 and PG-6 composition. PG-8B later runs only connector-focused checks and the minimal connector-affected composition set.

## PG-1: remove private-context authority

**Owner:** public-boundary author.

**Product files**

- Modify `apps/ui/components/support/Assistant.tsx`.
- Modify `apps/ui/components/support/SupportWidget.tsx`.
- Delete `apps/ui/components/support/DebatePicker.tsx`.
- Delete `apps/ui/components/support/ConsentToggle.tsx`.
- Modify `apps/api/src/support/index.ts`.
- Create `apps/api/src/support/public-guide-boundary.ts`.
- Delete `apps/api/src/support/own-context.ts`.
- Modify `apps/api/src/support/session.ts`.
- Modify `apps/api/src/support/tools.ts`.
- Modify `apps/api/src/support/templates.ts`.
- Modify `apps/api/src/main.ts`.
- Modify `apps/api/src/index.ts`.
- Modify `packages/db/src/support.ts`.
- Modify `packages/db/src/index.ts`.
- Modify `packages/contract/src/index.ts`.

**Test files**

- Modify `tests/render/sup-01-help.test.tsx`.
- Rewrite `tests/render/sup-03-consent.test.tsx` as the no-private-context UI contract while retaining the path for historical suite manifests.
- Modify `tests/render/sup-04-widget.test.tsx`.
- Create `tests/unit/support-public-guide-boundary.test.ts`.
- Rewrite `tests/integration/support-own-context.test.ts` as the no-private-authority API contract while retaining the path.
- Modify `tests/integration/support-routes.test.ts`.
- Modify `tests/architecture/sup-01-boundary.test.ts`.
- Rewrite `tests/architecture/sup-03-projection.test.ts` as a negative source/import contract while retaining the path.
- Modify `tests/unit/s7-authorization.test.ts`.
- Modify `tests/integration/support-shred.test.ts` only to distinguish retained legacy-column shredding from live access.
- Modify `tests/support-eval/run.ts`.
- Modify `tests/support-eval/cases/sup-e-01.json` through `sup-e-06.json` so class E expects the fixed public-boundary refusal and zero private/model tool calls.

**Interfaces**

Create this closed semantic boundary:

```ts
export type PublicGuideBoundary =
  | Readonly<{ kind: "PUBLIC_GUIDE" }>
  | Readonly<{ kind: "PRIVATE_RECORD_REQUEST"; language: "en" | "ro" }>;

export function classifyPublicGuideBoundary(
  text: string,
  language: "en" | "ro",
): PublicGuideBoundary;
```

`PRIVATE_RECORD_REQUEST` means a request to list, retrieve, inspect, summarize, or report a user's/account's actual records or current state. A location question such as “Where is Your debates?” is `PUBLIC_GUIDE`. The handler maps the private branch to the existing `REFUSE_ZONE` response using fixed EN/RO text; it performs no model call or private port call.

The public message body becomes a strict object with exactly `{ text: string }`; `language`, `run_id`, `latest`, and every unknown key are rejected. Session creation remains `{language}` and the stored `SupportSessionRecord.language` is the sole response-language authority. Deterministic templates, source/action labels, and model answers use `found.language`; detected text language remains diagnostic only. The session JSON omits `consent_own_context_at`. `SupportSessionPort` loses `setConsent` and `consentOwnContextAt`. The consent route leaves `SUPPORT_ROUTE_PATHS`, API authorization policy, and `contractInventory`. `SupportApplication` loses `ownContext`. `TOOL_REGISTRY` becomes exactly `answer_from_corpus`, `link_first_party`, and `refuse`.

In `Assistant.tsx`, selecting EN/RO clears the active Support session capability before another send. The next send calls `createSession(selectedLanguage)` and then `sendMessage(session,text)`; it never sends a message-level language. The existing snapshot-mismatch retry creates one replacement session in the same current selected language and retries the same already-redacted text once. A second mismatch renders the existing unavailable state without a loop. Displayed prior messages may remain visible, but they are not sent as model history and the stored active capability belongs only to the newly selected language.

`PostgresSupportOwnContextRepository` and its export are removed. Support session queries stop selecting/mapping `consent_own_context_at`, and the setter SQL is removed. The database column, its migration history, shred coverage, and old outcome enum remain untouched; no migration is needed.

- [ ] Add RED assertions that Support renders no Attach debate, picker, private-context toggle, question line, run ID, latest selector, or session/device attachment claim; that the client sends exactly `{text}`; and that it never requests `/api/v1/answers`.
- [ ] Add RED API assertions that the consent route is absent; `language`, `run_id`, `latest`, and unknown keys fail schema validation; private-record prompts yield the fixed refusal; and all model/private repository spies remain zero.
- [ ] Add RED language-lifecycle assertions in `tests/render/sup-01-help.test.tsx`, `tests/render/sup-04-widget.test.tsx`, and `tests/integration/support-routes.test.ts`: an EN session answers ambiguous `Pricing` in English; switching to RO invalidates the active session and answers ambiguous `Account` in Romanian after `createSession("ro")`; `sendMessage` receives no language field; and a stale-snapshot retry creates one replacement session using the currently selected language and sends the same redacted text once.
- [ ] Add RED static assertions that the deleted symbols, tool, imports, SQL ownership query, and main wiring are absent while case ports and operational rate/encryption ports remain.
- [ ] Run the focused RED frame:

```bash
pnpm exec vitest run \
  tests/render/sup-01-help.test.tsx \
  tests/render/sup-03-consent.test.tsx \
  tests/render/sup-04-widget.test.tsx \
  tests/unit/support-public-guide-boundary.test.ts \
  tests/integration/support-own-context.test.ts \
  tests/integration/support-routes.test.ts \
  tests/architecture/sup-01-boundary.test.ts \
  tests/architecture/sup-03-projection.test.ts \
  tests/unit/s7-authorization.test.ts \
  tests/integration/support-shred.test.ts \
  --maxWorkers=1
```

Expected RED: the existing picker/consent/own-context route, types, imports, and SQL violate the new negative assertions.

- [ ] Implement the interface above and remove every live private-context caller. Keep `CaseView`, case routes, authentication, rate limits, message encryption, and shredding connected.
- [ ] Run the same focused frame. Expected GREEN: all tests pass, private spies remain zero, and shred coverage still includes the legacy column.
- [ ] Run `pnpm run support:eval` against the isolated test fixture once. Expected: rewritten class-E cases refuse without `read_own_run_state`, other classes retain their prior outcomes.
- [ ] Commit only PG-1 product/test paths and record exact hashes.

## PG-2: author the reviewed public menu corpus

**Owner:** menu knowledge author.

**Product files**

- Create `packages/support-kb/content/app-navigation.en.md`.
- Create `packages/support-kb/content/app-navigation.ro.md`.
- Create `packages/support-kb/content/debate-workspace-menus.en.md`.
- Create `packages/support-kb/content/debate-workspace-menus.ro.md`.
- Create `packages/support-kb/content/settings-help-menus.en.md`.
- Create `packages/support-kb/content/settings-help-menus.ro.md`.
- Modify `packages/support-kb/content/support-status-limits.en.md` to remove selected-debate/private-status authority and retain public `/help` service-status and limit facts only.
- Modify `packages/support-kb/content/support-status-limits.ro.md` with the same factual correction and EN/RO parity.
- Modify `packages/support-kb/recovery/components.json` with six new unreviewed records plus corrected `support-status-limits.en` and `.ro` projection/fallback records; all eight owner fields remain blank.
- Modify `packages/support-kb/src/catalog.ts`.
- Modify `packages/support-kb/src/navigation.ts` to admit only the three newly verified Settings fragments.

**Test files**

- Modify `tests/architecture/support-catalog-coverage.test.ts`.
- Modify `tests/unit/support-kb.test.ts`.
- Modify `tests/unit/support-context.test.ts`.
- Modify `tests/unit/support-navigation.test.ts`.
- Modify `tests/unit/support-recovery-components.test.ts`.
- Modify `tests/unit/support-answer-context.test.ts`.

**Catalog contract**

Add Settings actions `active-sessions`, `claim-legacy`, and `delete-account` with exact verified fragments. Keep `privacy-preferences`. Map the catalog capabilities to the three new article IDs according to `MENU-COVERAGE-v2.json`. Do not add actions for Pricing, theme, debate-local controls, state-bearing auth pages, or operator screens. Keep `forgot-password` unresolved.

Each new article has a complete public factual projection and visitor fallback in EN/RO. It describes labels, location, prerequisites, availability, and limitations. It contains no repository paths, private identifiers, state claims, user data, case data, operator detail, or invented URL. `settings-help-menus` states that Support can point to account controls but cannot revoke sessions, claim legacy debates, or delete an account. The corrected `support-status-limits` pair describes only the public `/help` status block, public availability/limits, and honest limitations; it contains no consent, ownership, selected debate, approved status projection, run state, progress, failure, or private lookup claim. The unchanged `support-cases` pair remains outside the write and review scope.

- [ ] Add RED table tests that load every `included` inventory item, ask one natural EN and RO free-text question for its family through `buildSupportKnowledgeContext`, and assert the expected article/action or prose-only action set.
- [ ] Add a RED status invariant that scans both article bodies and their exact component projection/fallback fields and fails on selected-debate/private-status authority while requiring public `/help` status and limit facts in both languages.
- [ ] Add RED negative controls for branded medical/investment topics, private list/status requests, operator routes, hidden/state-bearing routes, Pricing-as-checkout, dynamic IDs, raw URLs, and unknown actions.
- [ ] Run:

```bash
pnpm exec vitest run \
  tests/architecture/support-catalog-coverage.test.ts \
  tests/unit/support-kb.test.ts \
  tests/unit/support-context.test.ts \
  tests/unit/support-navigation.test.ts \
  tests/unit/support-recovery-components.test.ts \
  tests/unit/support-answer-context.test.ts \
  --maxWorkers=1
```

Expected RED: new article pairs/component records/actions and family retrieval are absent, and the existing status pair still asserts private selected-debate authority.

- [ ] Add the six new content files, correct the two status files and records, add capability mappings/safe actions, and leave selector algorithms and `INTENT_SIGNALS` unchanged.
- [ ] Run the same frame at the serialized PG-2 integration revision. Expected GREEN for author fixtures; strict production admission excludes all eight new/changed records because no editorial manifest binding exists yet.
- [ ] Commit only PG-2 files and publish a digest table for all eight article/component projections/fallbacks. Do not write review metadata.

## PG-3: correct Account navigation

**Owner:** UI navigation author; may run parallel to PG-1/PG-2.

**Disposition:** completed independently by GUIDE_ACCOUNT and consumed at clean revision `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`. Retain the steps below as the implemented contract. Its valid Vitest 4.1.10 command used `--maxWorkers=1` only; the rejected `--minWorkers` invocation is preserved in `E/GUIDE_ACCOUNT-red.log`, and the consumed receipt is `e828faa1e14dac49ca0378ce2a7e507041681e9a5800bc8c01c30e3d1b20305e`.

**Files**

- Modify `apps/ui/components/TopBar.tsx`.
- Create `tests/render/support-topbar.test.tsx`.

- [ ] Write a render test for the non-auth, non-debate signed-in global bar: `Account` resolves to `/settings`; New debate remains `/new`; Settings remains `/settings`; the ASKER chip has no link or data-fetch behavior. Auth paths retain their minimal auth top bar, and debate paths continue suppressing the global bar.
- [ ] Run `pnpm exec vitest run tests/render/support-topbar.test.tsx --maxWorkers=1`. Expected RED: Account currently links to `/login`.
- [ ] Change only the Account destination to `/settings`; do not add a session fetch or redesign the bar.
- [ ] Re-run the focused file. Expected GREEN.
- [ ] Commit only the two PG-3 paths.

## PG-4: separate editorial review

**Owner:** separate editorial reviewer; no product writes.

- [ ] Verify the exact eight PG-2 component bytes—six new menu records plus corrected `support-status-limits.en` and `.ro`—against the current public UI labels/routes in `MENU-COVERAGE-v2.json` and the public `/help` status surface.
- [ ] Review EN/RO semantic parity, prerequisites, placeholder/local/stateful limitations, public-only wording, human-case separation, and absence of private/internal claims.
- [ ] Emit per-component PASS/REWORK with exact SHA-256 bindings. Do not infer owner ratification.
- [ ] If any component is REWORK, return only the failing component IDs/strings to the original content author; repeat review on changed exact bytes.

## PG-5: admit editorially reviewed menu components

**Owner:** attestation author, distinct from PG-4 reviewer.

**Product files**

- Modify `packages/support-kb/reviews/manifest.json` by copying the actual PG-4 reviewer identity, date, report path, and exact eight component hashes.
- Modify `tests/unit/support-recovery-attestation.test.ts` only for the eight real review bindings and new total.

- [ ] Add a strict-corpus RED proving all eight new/changed records are excluded before manifest vNext.
- [ ] Copy the real review bindings; leave owner fields blank.
- [ ] Run:

```bash
pnpm exec vitest run \
  tests/unit/support-recovery-attestation.test.ts \
  tests/unit/support-recovery-components.test.ts \
  tests/unit/support-kb.test.ts \
  --maxWorkers=1
```

Expected GREEN: all eight records are admitted, every corpus record remains separately bound, and any projection/fallback/catalog/review byte change alters `kbVersion` or fails admission.

## PG-6: replace literal recovery matching with predicate semantics

**Owner:** server recovery author. Start after PG-1 because `apps/api/src/support/index.ts` is shared.

**Product files**

- Create `apps/api/src/support/recovery-intent.ts`.
- Modify `apps/api/src/support/security-guidance.ts`.
- Modify `apps/api/src/support/classify.ts`.
- Modify `apps/api/src/support/index.ts`.

**Test files**

- Create `tests/unit/support-recovery-intent.test.ts`.
- Modify `tests/unit/support-security-guidance.test.ts`.
- Modify `tests/unit/support-classify.test.ts`.
- Modify `tests/unit/support-credentials.test.ts`.
- Modify `tests/integration/support-routes.test.ts`.
- Modify `tests/unit/support-response-policy.test.ts` only to preserve the final credential-value sink checks.

**Interface**

```ts
export type PredicatePolarity = "AFFIRMATIVE" | "NEGATED" | "ABSENT";

export type RecoverySemantics = Readonly<{
  language: "en" | "ro";
  navigation: PredicatePolarity;
  credentialOperation: PredicatePolarity;
}>;

export function analyzeRecoverySemantics(
  text: string,
  languageHint: "en" | "ro",
): RecoverySemantics;
```

Normalize with NFKC, normalize straight/typographic apostrophes, tokenize Unicode words and clause punctuation, and split coordinated/adversative clauses before assigning predicates. Use bounded category lexicons for recovery subjects, navigation predicates, credential/reset operations, modal auxiliaries, and negators. Determine polarity within the predicate's clause and modal chain. Never use a message-wide `contains negation` bypass. Classification consumes `RecoverySemantics`; tests and HTTP do not expose it.

- [ ] Generate RED property tables from subject × predicate × polarity × modality × clause order × EN/RO. Include every previously observed phrase as a regression seed, plus paired benign controls and actual credential-value hostile controls.
- [ ] Add route RED tests for visible behavior: positive navigation, operation-only refusal, mixed refusal plus navigation, negated operation plus navigation, and solely negated/unrelated mention. Assert canonical stored/HTTP text, actions, and zero model/auth/reset/recovery calls.
- [ ] Run:

```bash
pnpm exec vitest run \
  tests/unit/support-recovery-intent.test.ts \
  tests/unit/support-security-guidance.test.ts \
  tests/unit/support-classify.test.ts \
  tests/unit/support-credentials.test.ts \
  tests/unit/support-response-policy.test.ts \
  tests/integration/support-routes.test.ts \
  --maxWorkers=1
```

Expected RED: adjacent modal, negation, apostrophe, and conjunction transforms expose the current whole-message regex behavior.

- [ ] Implement the analyzer and map its closed result to existing deterministic guidance/refusal outcomes. With the unresolved catalog entry, positive/mixed navigation emits guidance and no action; it never falls back to Settings.
- [ ] Re-run the focused frame. Expected GREEN across generated classes, hostile values, benign controls, and sinks.
- [ ] Commit only PG-6 files.

## PG-7: connect the owner-verified Forgot destination

**Blocked input:** the owner must provide or identify the existing canonical URL/opener. Elapsed time is not an answer.

**Files after verification**

- Modify `packages/support-kb/src/catalog.ts` to change only `forgot-password` from unresolved to the verified destination/opener.
- Modify `packages/support-kb/src/navigation.ts` to resolve only that recorded destination instead of the current unconditional `null`.
- Modify `tests/unit/support-navigation.test.ts` to pin resolver eligibility and reject substitutes.
- Modify `tests/render/sup-01-help.test.tsx` and `tests/render/sup-04-widget.test.tsx` to click the action in both surfaces.
- Modify `tests/integration/support-routes.test.ts` to prove exactly one action and zero auth/reset/recovery calls.

- [ ] Record the source evidence for the existing destination.
- [ ] Add RED tests that fail while `href` is null and that explicitly reject `/settings`, saved-MFA recovery, external URLs, and invented routes.
- [ ] Connect the verified destination/opener without creating a recovery flow.
- [ ] Run the four affected files once. Expected GREEN: positive and mixed requests expose exactly one canonical action; negated/unrelated requests expose none; clicking performs navigation only.

## PG-8A: independent composition, review, and working preview

**Dependencies:** PG-1, PG-3, PG-5, PG-6 and their applicable separate reviews. PG-7 is deliberately not a dependency.

**Final Vitest union (33 files):** retain the existing 25-file LIVE_P2 union and add the eight new/previously outside members:

```text
tests/render/sup-03-consent.test.tsx
tests/render/sup-04-widget.test.tsx
tests/render/support-topbar.test.tsx
tests/unit/support-public-guide-boundary.test.ts
tests/unit/support-recovery-intent.test.ts
tests/unit/s7-authorization.test.ts
tests/architecture/sup-01-boundary.test.ts
tests/architecture/sup-03-projection.test.ts
```

- [ ] At the final independently composed revision, run the exact 33-file unaffected union once by taking the 25-file `files` array from `.hermes/reports/support-conversation-20260914/evidence/LIVE_P2-required-suites.json`, appending the eight paths above, and passing that array unchanged to `pnpm exec vitest run ... --maxWorkers=1`. Persist exact argv, membership, HEAD and admitted `kbVersion` in a machine-readable receipt before execution. Vitest 4 in this repository rejects `--minWorkers`; do not include it.
- [ ] Run `pnpm run typecheck` once. Compare its output to the attributed 76-diagnostic intake baseline (`ATTEST_P2-typecheck-final2.log`, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`). Require byte identity or a line-by-line attribution proving zero diagnostics in changed paths; any new changed-path diagnostic is a failure.
- [ ] Run `pnpm run support:eval` once against isolated fixtures and confirm class E is the fixed public-boundary refusal with zero private tool calls.
- [ ] A separate correctness/security reviewer checks the composed diff for public-only payloads, prompt-injection resistance, credential operations, closed actions, corpus provenance, and case isolation.
- [ ] Start only the repository-supported disjoint preview. In both `/help` and compact widget, ask EN/RO natural questions for every inventory family, ambiguous `Pricing` in EN and `Account` in RO after a selector change, one private-record request, one prompt-injection request, and the five recovery classes. Capture visible text/actions, selected session language, session replacement count and API call counts. Do not use private records or real credentials.
- [ ] Verify the Support UI contains no Attach debate/private consent/private list and that pills remain optional shortcuts to the same free-text path.
- [ ] Record exactly `WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED` if the independent checks pass. The preview must show fixed recovery guidance/refusal with no Forgot action. Do not call CP1 ready, complete, accepted, or `READY FOR USER VERIFICATION`.

## PG-8B: connector composition and checkpoint readiness

**Dependencies:** the owner's verified existing destination/opener, PG-7, PG-8A, and separate final review. This node remains blocked without the destination and does not ask the owner again.

- [ ] Compose PG-7 at an exact revision and record the verified destination evidence without exposing state-bearing tokens.
- [ ] Run the focused connector set once:

```bash
pnpm exec vitest run \
  tests/unit/support-navigation.test.ts \
  tests/integration/support-routes.test.ts \
  tests/render/sup-01-help.test.tsx \
  tests/render/sup-04-widget.test.tsx \
  --maxWorkers=1
```

Expected: positive and mixed requests return exactly one canonical Forgot action; negated/unrelated requests return none; full and compact clicks navigate only to the verified first-party destination; all auth/reset/recovery operation spies remain zero.

- [ ] Run only the minimal connector-affected composition checks identified by the PG-7 diff. Do not repeat the 33-file unaffected union or typecheck when no corresponding bytes changed.
- [ ] Have the separate final reviewer consume PG-8A plus connector evidence. Only then may the implementation be marked `READY FOR USER VERIFICATION`; owner acceptance remains a later explicit event.

## Acceptance trace

| Requirement | Primary implementation | Primary evidence |
|---|---|---|
| CP1-R22 / A13 / A14 | PG-1 | UI, API, negative source/import, captured model-context and case-isolation tests |
| CP1-R23 / A12 v2 | PG-2 | corrected machine menu inventory plus real-corpus EN/RO tables |
| CP1-R24 v2 | PG-2, PG-4, PG-5 | eight component digests, separate editorial report, manifest admission tests |
| CP1-R25 / A15 | PG-3 | `support-topbar.test.tsx` and closed resolver checks |
| CP1-R26 / A16 | PG-6, PG-7 | generated clause/predicate matrix, visible route/sink/call assertions, verified connector |
| CP1-R28 / A13 v2 | PG-1 | strict body, stored session language, selector invalidation and one same-language stale retry |
| CP1-R29 | composition schedule | exact revision/snapshot receipts around PG-1, PG-2, PG-5 and PG-6 frames |
| CP1-R30 / A17 v2 | PG-8A, PG-8B | independent working preview status followed by destination-dependent readiness |
| CP1-R27 | PG-1, PG-8A | compatibility assertions, shred test, final unaffected union/typecheck |

## Corrected delta scope arrays

These arrays are the exhaustive additions caused by GUIDE_PLANREV B1–B4. The complete lane ownership remains the per-lane file lists above.

```json
{
  "B1_independent_gate": {
    "productPaths": [],
    "testPaths": [
      "tests/unit/support-kb.test.ts",
      "tests/unit/support-context.test.ts",
      "tests/unit/support-navigation.test.ts",
      "tests/architecture/support-catalog-coverage.test.ts",
      "tests/unit/support-response-policy.test.ts",
      "tests/unit/support-classify.test.ts",
      "tests/unit/support-security-guidance.test.ts",
      "tests/unit/support-model.test.ts",
      "tests/unit/support-escalation.test.ts",
      "tests/integration/support-routes.test.ts",
      "tests/integration/support-metrics.test.ts",
      "tests/integration/support-degraded.test.ts",
      "tests/integration/support-relay-reservations.test.ts",
      "tests/render/sup-01-help.test.tsx",
      "tests/integration/support-config-convergence.test.ts",
      "tests/integration/support-own-context.test.ts",
      "tests/integration/support-shred.test.ts",
      "tests/unit/support-answer-context.test.ts",
      "tests/unit/support-redaction.test.ts",
      "tests/integration/support-cases.test.ts",
      "tests/unit/support-credentials.test.ts",
      "tests/unit/support-model-references.test.ts",
      "tests/unit/support-text-views.test.ts",
      "tests/unit/support-recovery-components.test.ts",
      "tests/unit/support-recovery-attestation.test.ts",
      "tests/render/sup-03-consent.test.tsx",
      "tests/render/sup-04-widget.test.tsx",
      "tests/render/support-topbar.test.tsx",
      "tests/unit/support-public-guide-boundary.test.ts",
      "tests/unit/support-recovery-intent.test.ts",
      "tests/unit/s7-authorization.test.ts",
      "tests/architecture/sup-01-boundary.test.ts",
      "tests/architecture/sup-03-projection.test.ts"
    ],
    "connectorTestPaths": [
      "tests/unit/support-navigation.test.ts",
      "tests/integration/support-routes.test.ts",
      "tests/render/sup-01-help.test.tsx",
      "tests/render/sup-04-widget.test.tsx"
    ],
    "note": "connectorTestPaths form PG-8B after the destination exists; PG-8A never waits on them"
  },
  "B2_status_pair": {
    "productPaths": [
      "packages/support-kb/content/support-status-limits.en.md",
      "packages/support-kb/content/support-status-limits.ro.md",
      "packages/support-kb/recovery/components.json",
      "packages/support-kb/reviews/manifest.json"
    ],
    "testPaths": [
      "tests/unit/support-kb.test.ts",
      "tests/unit/support-context.test.ts",
      "tests/unit/support-recovery-components.test.ts",
      "tests/unit/support-recovery-attestation.test.ts",
      "tests/unit/support-answer-context.test.ts"
    ],
    "editorialRecords": [
      "app-navigation.en",
      "app-navigation.ro",
      "debate-workspace-menus.en",
      "debate-workspace-menus.ro",
      "settings-help-menus.en",
      "settings-help-menus.ro",
      "support-status-limits.en",
      "support-status-limits.ro"
    ]
  },
  "B3_serialization": {
    "productPaths": [],
    "orderedFrames": [
      "PG-1 route/service/eval members at exact PG-1 HEAD before PG-2",
      "PG-2 focused real-corpus members at exact unadmitted PG-2 HEAD",
      "PG-5 admission members at exact admitted HEAD",
      "PG-6 route/service members with recorded pre/post-attestation kbVersion",
      "PG-8A exact final 33-file union after PG-5"
    ]
  },
  "B4_session_language": {
    "productPaths": [
      "apps/ui/components/support/Assistant.tsx",
      "apps/api/src/support/index.ts"
    ],
    "testPaths": [
      "tests/render/sup-01-help.test.tsx",
      "tests/render/sup-04-widget.test.tsx",
      "tests/integration/support-routes.test.ts"
    ]
  },
  "inventory": {
    "productPaths": [],
    "planningPaths": [
      "docs/missions/support-conversation-20260914/slices/CP1/MENU-COVERAGE-v2.json"
    ]
  }
}
```

## Review finding to correction map

| Finding | Corrected anchors | Failure control | Passing observable |
|---|---|---|---|
| B1 | work graph PG-8A/PG-8B; CP1-R30/A17 v2 | making PG-8A depend on PG-7 or emitting readiness while actionless fails plan validation | working preview can pass independently; only PG-8B can declare readiness |
| B2 | PG-2 product list/content contract; PG-4; PG-5; B2 arrays | either status component retaining consent/selected-debate language or fewer than eight review bindings fails strict admission | exact eight corrected/new records reviewed and admitted; `support-cases` unchanged |
| B3 | integration schedule; PG-8A receipt | a route/service/eval result without exact HEAD and `kbVersion`, or PG-2 composed before PG-1 frame, is invalid evidence | serial PG-1 → PG-2 unadmitted → PG-5 admitted → PG-6/final frames |
| B4 | PG-1 message/language contract; B4 arrays | accepting message `language`, retaining session on selector change, or retrying in old language fails | strict `{text}`, stored session language, invalidation, one same-language retry |
| Inventory | `MENU-COVERAGE-v2.json` `help-free-text` | action-bearing `existing-ui-workflow` row fails action-rule check | row is `safe-static-action` for verified `/help` |
| Vitest argv | every plan command and PG-8A | any argv containing `--minWorkers` fails the light command-contract check | commands preserve membership and use supported `--maxWorkers=1` only |

## Frozen decisions

- Keep the existing Support interface and runtime model.
- Keep CP1 single-turn; public-only history is CP2.
- Keep human cases separate and functional.
- Retain the obsolete nullable database column and historical outcomes without live readers/writers; do not add a migration merely to remove them.
- Use three compact bilingual menu articles, not an article per cosmetic control.
- Use safe Settings fragments and prose for local/private/stateful controls.
- Correct Account to `/settings` without adding a new session fetch.
- Replace recovery literal-patch growth with one bounded clause/predicate analyzer.
- Use the session's stored language for text-only message responses; selector changes replace the active session.
- Run real-corpus consumers serially at recorded exact revisions/snapshots.
- Separate independently verifiable working preview from destination-dependent CP1 readiness.
- Never guess the Forgot password destination.
