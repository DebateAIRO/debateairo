# Public Conversational App Guide Implementation Plan

> **For implementation workers:** execute only the lane assigned by the orchestrator. Use `superpowers:test-driven-development` for product changes and `superpowers:verification-before-completion` before a scoped commit. The mission requires separate author, editorial reviewer, attestation, and final reviewer sessions; do not self-review or self-attest.

**Goal:** Make the existing Support surfaces a free-text EN/RO guide to all meaningful visitor-facing menus while removing Support's private-data authority and preserving the established security, response, model, and human-case contracts.

**Architecture:** The answer path remains the admitted public KB plus one redacted user turn. A first lane removes private-context UI/API/repository authority and replaces private-record requests with a fixed no-lookup refusal. Independent lanes add reviewed menu knowledge and correct the Account link; a sequenced recovery lane replaces literal whole-message matching with clause/predicate semantics. Editorial admission precedes the one final affected-suite and preview run.

**Tech stack:** TypeScript 7, React/Next.js, Fastify, Zod, Vitest, `@debateai/support-kb`, PostgreSQL ports.

**Spec:** `docs/missions/support-conversation-20260914/slices/CP1/SPEC-v4.md`

## Global constraints

- Baseline: `479763da1f586a217f36204cc81138aaa81c6f81` on `codex/support-conversation-cp1`.
- Preserve the current Support model, strict completion envelope, response JSON, snapshot pinning, cipher-return sink, queue/spend/timeouts, degraded handling, storage encryption/shredding, and human-case workflow.
- Model context is admitted reviewed public KB plus the current redacted user text only. CP1 adds no prior-turn history.
- Do not add auth/reset/recovery execution, credential collection or validation, private data reads, raw URLs, dynamic owner links, or an unverified Forgot destination.
- Content authors leave review/owner fields blank. A distinct editorial reviewer and later attestation own admission.
- Use the current closed action resolver. Local/stateful/private controls receive prose, not fabricated links.
- The nullable `support.session.consent_own_context_at` column and historical outcome values may remain for compatibility and shredding, but runtime code must neither select nor update the column and must not produce the obsolete outcomes.
- Each lane runs its focused RED/GREEN frame after relevant changes. Run the exact final affected union and typecheck only once after attestation and composition.

## Ordered work graph

| Lane | Deliverable | Depends on | Product-file overlap |
|---|---|---|---|
| PG-1 | Public-only Support boundary | baseline | owns all private-context UI/API/DB/contract files |
| PG-2 | Menu content, catalog, component records | baseline | disjoint from PG-1 except no overlap; may run in parallel |
| PG-3 | Signed-in Account destination | baseline | `TopBar.tsx` only; may run in parallel |
| PG-4 | Separate editorial review | PG-2 exact bytes | evidence only |
| PG-5 | Manifest admission | PG-4 PASS | manifest and attestation tests only |
| PG-6 | Recovery predicate semantics | PG-1 and PG-2 catalog | sequenced because it updates `apps/api/src/support/index.ts` |
| PG-7 | Verified Forgot connector | owner supplies destination; PG-6 | small catalog/UI tests; cannot be guessed |
| PG-8 | Composed verification and preview | PG-1 through PG-7, separate reviews | no product edits unless a measured failure requires a new scoped fix |

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

The public message body becomes exactly `{ text: string }`. The session JSON omits `consent_own_context_at`. `SupportSessionPort` loses `setConsent` and `consentOwnContextAt`. The consent route leaves `SUPPORT_ROUTE_PATHS`, API authorization policy, and `contractInventory`. `SupportApplication` loses `ownContext`. `TOOL_REGISTRY` becomes exactly `answer_from_corpus`, `link_first_party`, and `refuse`.

`PostgresSupportOwnContextRepository` and its export are removed. Support session queries stop selecting/mapping `consent_own_context_at`, and the setter SQL is removed. The database column, its migration history, shred coverage, and old outcome enum remain untouched; no migration is needed.

- [ ] Add RED assertions that Support renders no Attach debate, picker, private-context toggle, question line, run ID, latest selector, or session/device attachment claim; that the client sends exactly `{text}`; and that it never requests `/api/v1/answers`.
- [ ] Add RED API assertions that the consent route is absent, extra `run_id`/`latest` keys fail schema validation, private-record prompts yield the fixed refusal, and all model/private repository spies remain zero.
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
  --maxWorkers=1 --minWorkers=1
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
- Modify `packages/support-kb/recovery/components.json` with six unreviewed component records and blank owner fields.
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

Add Settings actions `active-sessions`, `claim-legacy`, and `delete-account` with exact verified fragments. Keep `privacy-preferences`. Map the catalog capabilities to the three new article IDs according to `MENU-COVERAGE.json`. Do not add actions for Pricing, theme, debate-local controls, state-bearing auth pages, or operator screens. Keep `forgot-password` unresolved.

Each article has a complete public factual projection and visitor fallback in EN/RO. It describes labels, location, prerequisites, availability, and limitations. It contains no repository paths, private identifiers, state claims, user data, case data, operator detail, or invented URL. `settings-help-menus` states that Support can point to account controls but cannot revoke sessions, claim legacy debates, or delete an account.

- [ ] Add RED table tests that load every `included` inventory item, ask one natural EN and RO free-text question for its family through `buildSupportKnowledgeContext`, and assert the expected article/action or prose-only action set.
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
  --maxWorkers=1 --minWorkers=1
```

Expected RED: article pairs/component records/actions and family retrieval are absent.

- [ ] Add the six content files, component records, capability mappings, and safe actions without changing selector algorithms or `INTENT_SIGNALS`.
- [ ] Run the same frame. Expected GREEN for author fixtures; production admission must still exclude the new component records because no editorial manifest exists yet.
- [ ] Commit only PG-2 files and publish a digest table for all six article/component projections. Do not write review metadata.

## PG-3: correct Account navigation

**Owner:** UI navigation author; may run parallel to PG-1/PG-2.

**Files**

- Modify `apps/ui/components/TopBar.tsx`.
- Create `tests/render/support-topbar.test.tsx`.

- [ ] Write a render test for the non-auth, non-debate signed-in global bar: `Account` resolves to `/settings`; New debate remains `/new`; Settings remains `/settings`; the ASKER chip has no link or data-fetch behavior. Auth paths retain their minimal auth top bar, and debate paths continue suppressing the global bar.
- [ ] Run `pnpm exec vitest run tests/render/support-topbar.test.tsx --maxWorkers=1 --minWorkers=1`. Expected RED: Account currently links to `/login`.
- [ ] Change only the Account destination to `/settings`; do not add a session fetch or redesign the bar.
- [ ] Re-run the focused file. Expected GREEN.
- [ ] Commit only the two PG-3 paths.

## PG-4: separate editorial review

**Owner:** separate editorial reviewer; no product writes.

- [ ] Verify the exact six PG-2 component bytes against the current public UI labels and routes named in `MENU-COVERAGE.json`.
- [ ] Review EN/RO semantic parity, prerequisites, placeholder/local/stateful limitations, public-only wording, human-case separation, and absence of private/internal claims.
- [ ] Emit per-component PASS/REWORK with exact SHA-256 bindings. Do not infer owner ratification.
- [ ] If any component is REWORK, return only the failing component IDs/strings to the original content author; repeat review on changed exact bytes.

## PG-5: admit editorially reviewed menu components

**Owner:** attestation author, distinct from PG-4 reviewer.

**Product files**

- Modify `packages/support-kb/reviews/manifest.json` by copying the actual PG-4 reviewer identity, date, report path, and exact component hashes.
- Modify `tests/unit/support-recovery-attestation.test.ts` only for the six real review bindings and new total.

- [ ] Add a strict-corpus RED proving all six new records are excluded before manifest vNext.
- [ ] Copy the real review bindings; leave owner fields blank.
- [ ] Run:

```bash
pnpm exec vitest run \
  tests/unit/support-recovery-attestation.test.ts \
  tests/unit/support-recovery-components.test.ts \
  tests/unit/support-kb.test.ts \
  --maxWorkers=1 --minWorkers=1
```

Expected GREEN: all six records are admitted, every corpus record remains separately bound, and any projection/fallback/catalog/review byte change alters `kbVersion` or fails admission.

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
  --maxWorkers=1 --minWorkers=1
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

## PG-8: composed verification, review, and preview

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

- [ ] At the final reviewed revision, run the exact 33-file union once by taking the 25-file `files` array from `.hermes/reports/support-conversation-20260914/evidence/LIVE_P2-required-suites.json`, appending the eight paths above, and passing that array unchanged to `pnpm exec vitest run ... --maxWorkers=1 --minWorkers=1`. Persist the exact argv and per-file membership in a machine-readable receipt before execution.
- [ ] Run `pnpm run typecheck` once. Compare its output to the attributed 76-diagnostic intake baseline (`ATTEST_P2-typecheck-final2.log`, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`). Require byte identity or a line-by-line attribution proving zero diagnostics in changed paths; any new changed-path diagnostic is a failure.
- [ ] Run `pnpm run support:eval` once against isolated fixtures and confirm class E is the fixed public-boundary refusal with zero private tool calls.
- [ ] A separate correctness/security reviewer checks the composed diff for public-only payloads, prompt-injection resistance, credential operations, closed actions, corpus provenance, and case isolation.
- [ ] Start only the repository-supported disjoint preview. In both `/help` and compact widget, ask EN/RO natural questions for every inventory family, one private-record request, one prompt-injection request, and the five recovery classes. Capture visible text/actions and API call counts. Do not use private records or real credentials.
- [ ] Verify the Support UI contains no Attach debate/private consent/private list and that pills remain optional shortcuts to the same free-text path.
- [ ] Mark the implementation `READY FOR USER VERIFICATION` only after all automated/review/preview checks pass. Do not call CP1 complete while Forgot remains unresolved or before explicit owner acceptance.

## Acceptance trace

| Requirement | Primary implementation | Primary evidence |
|---|---|---|
| CP1-R22 / A13 / A14 | PG-1 | UI, API, negative source/import, captured model-context and case-isolation tests |
| CP1-R23 / A12 | PG-2 | machine menu inventory plus real-corpus EN/RO tables |
| CP1-R24 / A17 | PG-2, PG-4, PG-5 | six component digests, separate editorial report, manifest admission tests |
| CP1-R25 / A15 | PG-3 | `support-topbar.test.tsx` and closed resolver checks |
| CP1-R26 / A16 | PG-6, PG-7 | generated clause/predicate matrix, visible route/sink/call assertions, verified connector |
| CP1-R27 | PG-1, PG-8 | compatibility assertions, shred test, final union/typecheck |

## Frozen decisions

- Keep the existing Support interface and runtime model.
- Keep CP1 single-turn; public-only history is CP2.
- Keep human cases separate and functional.
- Retain the obsolete nullable database column and historical outcomes without live readers/writers; do not add a migration merely to remove them.
- Use three compact bilingual menu articles, not an article per cosmetic control.
- Use safe Settings fragments and prose for local/private/stateful controls.
- Correct Account to `/settings` without adding a new session fetch.
- Replace recovery literal-patch growth with one bounded clause/predicate analyzer.
- Never guess the Forgot password destination.
