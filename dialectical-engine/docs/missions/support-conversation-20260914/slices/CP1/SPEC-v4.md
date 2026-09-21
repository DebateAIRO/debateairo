# Checkpoint 1 specification v4 — public conversational app guide

ui: yes

Status: **implementation amendment ready for review**. This document does not accept CP1. `SPEC-v3.md` remains governing except where the requirements below expressly replace it. The owner-confirmed Forgot password entry still has no verified destination, so CP1 remains blocked on that dependency.

## Objective

The existing compact Support widget and full `/help` assistant accept ordinary free-text English or Romanian questions about every meaningful visitor-facing app menu and feature. Answers use only separately reviewed public product facts plus the current redacted user message. Support never reads private account, debate, run, answer, or case data, never performs credential or account operations, and never exposes a destination outside the closed first-party action catalog.

## Governing boundary

### CP1-R22 — public knowledge only

Support's answer path may consume:

1. the session-pinned, peer-reviewed public knowledge snapshot and capability catalog;
2. the current request after the existing redaction and length controls; and
3. operational values needed server-side for authentication, rate limits, spend, encryption, queueing, abuse prevention, and response persistence, provided those values never enter model context or visitor-visible answer text.

It may not retrieve or accept private account fields, a user's debate list, run identifiers, questions, claims, answers, progress, failures, visibility, case bodies, case tokens, device/IP/session details, or human-case summaries as answer context. Consent does not enlarge this boundary.

Remove the Support debate picker, private-context consent toggle, stored or initial context selection, `run_id`/`latest` request fields, consent endpoint, own-context handler/port/service/repository/main wiring, and `read_own_run_state` tool. A request to list, inspect, or report private records receives a fixed public-boundary refusal without a private lookup or model call. Questions about where a menu is located remain eligible public guide questions.

Human case submission, lookup, replies, and case lists remain a separate Help workflow. Their records and tokens never enter the guide model or future conversation history.

### CP1-R23 — free-text menu coverage

Pills and suggested questions are optional composer shortcuts. CP1 behavior is defined by natural single-turn text. The meaningful menu inventory is `MENU-COVERAGE.json`; every included item must map to exactly one of:

- a separately reviewed EN/RO public fact plus a verified static same-origin action;
- reviewed prose that tells the user how to find an in-page, stateful, private-owner, or local control without inventing a link; or
- an honest excluded/unavailable explanation.

The required families are landing navigation and theme, the global bar, signed-in library tabs and composer, new-debate controls, debate views and utilities, Settings sections, Help and human-case separation, authentication prerequisites, and the operator exclusion. Cosmetic controls are outside this inventory.

Pricing is described as the current placeholder, never as a checkout. Dynamic owner debate destinations remain prose. A public debate link requires a validated public reference. Verification, MFA enrollment, and other state-bearing pages do not receive generic actions. The operator page remains excluded.

### CP1-R24 — reviewed guide provenance

New menu facts are authored as three complete bilingual article pairs: `app-navigation`, `debate-workspace-menus`, and `settings-help-menus`. Exact model projections and visitor fallbacks remain ineligible until a distinct editorial reviewer records PASS for their exact bytes and a later attestation step binds that review into the production manifest. Owner-ratification fields remain blank until real owner acceptance. Content authors must not self-attest.

The catalog exposes only verified actions. New static Settings actions may target the existing `#active-sessions-heading`, `#consent-privacy-heading`, `#legacy-run-claim-heading`, and `#account-deletion-heading` fragments. Theme, Replay, Workspace, Honesty, Scoring, Thread, Split, Tree, and Map are prose navigation because they are local controls. The landing `#pricing` placeholder is prose only.

### CP1-R25 — Account destination

The visible Account destination in the signed-in global bar opens `/settings`, which is the current account-management surface. The existing Settings icon may remain. The identity chip is presentation only and is never a Support data source. A render contract must pin the Account label and destination.

### CP1-R26 — recovery semantics by visible behavior

CP1-R06 is replaced. Recovery handling uses a bounded clause-level deterministic analysis rather than growing a list of complete literal phrases. It normalizes Unicode and apostrophes, tokenizes EN/RO clauses, assigns recovery subject, navigation predicate, credential/reset operation predicate, polarity, and modality per clause, then applies this visible contract:

| Request class | Visible result | Action after destination verification | Calls |
|---|---|---|---|
| positive recovery navigation | concise reviewed recovery guidance | exactly one `forgot-password` | no model, auth, reset, or recovery call |
| positive credential/reset operation only | fixed credential-operation refusal | none | no model, auth, reset, or recovery call |
| positive operation plus positive navigation | refusal plus safe recovery guidance | exactly one `forgot-password` | no model, auth, reset, or recovery call |
| negated operation plus positive navigation | safe recovery guidance; no false refusal | exactly one `forgot-password` | no model, auth, reset, or recovery call |
| solely negated or unrelated recovery mention | ordinary knowledge path; no recovery diversion | none | normal bounded path only |

Negation attaches to the predicate in its clause, including modal forms such as “must not”, “unable to”, Romanian equivalents, typographic apostrophes, and explicit “not asking” constructions. It is not a message-wide bypass. Generated class-transform tests must combine subject, predicate, polarity, modality, conjunction, and EN/RO forms; witnessed strings remain regression rows but do not define the parser.

Until the canonical Forgot destination or opener is verified, positive classes return the fixed guidance/refusal with no action. This is safe interim behavior and remains checkpoint-blocking. Settings is never substituted. The existing prohibition on generating, collecting, echoing, transforming, validating, or submitting credential values remains unchanged.

### CP1-R27 — compatibility and unchanged interfaces

The public message response, model, strict draft envelope, snapshot pinning, canonical cipher-return sink, queue/spend/timeout/degraded behavior, case workflow, and outcome database enum remain unchanged. The obsolete nullable `support.session.consent_own_context_at` column and historical own-context outcomes may remain for backward-compatible storage and shredding, but no live application code may read or write the column or produce those outcomes. No migration is required in this checkpoint.

Bounded history, pronoun resolution, greeting behavior, and language continuity remain CP2 work after explicit CP1 acceptance. CP1 sends no prior turns to the model.

## Acceptance

### CP1-A12 — inventory and free text

For every `included` item in `MENU-COVERAGE.json`, natural EN and RO free-text questions select an admitted reviewed source and return either the declared closed action or the declared prose-only behavior. Tests cover each family through the real corpus selector and answer service, not catalog constants alone. Pills are not clicked in these tests.

### CP1-A13 — no private-context authority

Static caller checks and injected API/UI tests prove:

- Support renders no debate picker, question line, run ID, latest selector, private-context consent, or attachment claim;
- the Support client sends only `text` on a message request;
- `run_id`, `latest`, and the former consent route are rejected or absent from the public contract;
- the private repository/service/tool imports and main wiring are absent;
- no `/api/v1/answers` request originates from Support; and
- private record requests cause zero private database/tool/model calls.

The unused database column may still be shredded, but no runtime query selects or updates it.

### CP1-A14 — public-only model payload and case isolation

Capture the actual answer-model request for benign menu questions and adversarial private-data/injection requests. The only variable user material is the current redacted text. The system material contains admitted public projections, public capability labels, policy, and request-local aliases only. It contains no owner reference, private question/answer/status/event/failure, run ID, account/device/IP/session value, case content, case token, repository path, canonical internal ID, or hidden route. Human case submit/list/read tests continue to pass separately, and their records never appear in the captured model request.

### CP1-A15 — closed navigation

Every returned action resolves from the closed catalog and current trusted request context. Unknown actions, raw URLs, external/protocol-relative/backslash destinations, token-bearing paths, missing fragments, dynamic private IDs, unverified state-bearing links, and the placeholder Pricing anchor resolve to no action. The four verified Settings fragments and signed-in Account `/settings` behavior are pinned by tests.

### CP1-A16 — recovery matrix

The five recovery classes in CP1-R26 pass paired EN/RO examples, generated predicate transformations, punctuation/apostrophe variants, conjunction order, benign controls, and credential-value hostile controls. Assertions inspect returned text, actions, stored canonical text, model/auth/reset/recovery spies, and call counts. Internal intent names are not acceptance oracles. Historical failures retain their original labels in evidence.

### CP1-A17 — regression and review gates

Each implementation lane runs its focused RED/GREEN checks once per relevant byte change. After separate editorial PASS and manifest admission, run the exact final affected suite union once and one attributed typecheck. A final preview exercises full and compact Support in EN/RO with the live reviewed snapshot, verifies no private picker or context request, and captures the menu/recovery matrix. No checkpoint may be called complete until separate correctness/security review passes and the Forgot destination is verified and connected.

## Exclusions and unresolved dependency

CP1 does not add conversation history, private-data retrieval, case-to-model context, operator actions, a replacement recovery flow, credential operations, dynamic owner links, or a new Support interface/model. The canonical Forgot password destination remains unresolved. Authoring and implementing every independent item above does not satisfy CP1-A05 until that destination is supplied, tested, and reviewed.
