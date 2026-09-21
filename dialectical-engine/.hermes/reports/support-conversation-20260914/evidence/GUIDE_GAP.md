# GUIDE_GAP — public conversational app-guide assessment

- **Node / ticket:** GUIDE_GAP / `t_2c5f0117`
- **Reviewer:** `/root/baseline`, native session `01a09ef7-e096-7c31-9b35-806840028cf0`
- **Reviewed on:** 2026-09-17
- **Stable product revision:** `479763da1f586a217f36204cc81138aaa81c6f81` (clean when inspected)
- **Source revision:** `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- **Result:** `GAPS_CONFIRMED_IMPLEMENTATION_NEEDED`

This is a bounded gap assessment, not a CP1 verdict or acceptance. It reviews committed navigation, public knowledge/catalog coverage, and Support's private-data wiring. It excludes the active FEEDBACK_FIX3 author's changing context, guidance, and test files.

## Required product boundary

Support should be a conversational guide to the app: it may use reviewed public product facts, verified public routes, and the bounded text the user types into the conversation. It may explain prerequisites and limitations, but it must not retrieve, display, or reason over private account, debate, run, answer, or case data. Authentication, rate limiting, abuse controls, encrypted conversation storage, and human handoff can retain the minimum operational metadata they need, but those fields must not enter the answer-model context or be presented as permission for the guide to inspect private app data.

The current answer-model path is already narrower than the surrounding product. `apps/api/src/support/answer.ts:212-220` builds reviewed public KB context for the current query with empty history, and `:282-287` sends the model that system context plus one redacted user message. No private run context or prior conversation is supplied to that model call. This is a useful base to preserve.

The surrounding Support feature still violates the newer public-only requirement:

- `apps/ui/components/support/DebatePicker.tsx:44-63` fetches `/api/v1/answers`, reads private question lines and run references, and renders them inside Support.
- `apps/ui/components/support/ConsentToggle.tsx:7-35` offers consent for Support to see debate status. Consent does not satisfy the new rule because the guide must have no private retrieval authority.
- `apps/ui/components/support/Assistant.tsx:299-300,394-449,559-590,705-717,727-744` persists a private-context selection, sends `run_id` or `latest`, renders an Attach a debate control, and tells users that session/device details are attached automatically.
- `apps/ui/components/support/SupportWidget.tsx` forwards initial debate context; debate pages mount the widget with a run ID.
- `apps/api/src/support/index.ts:501-630`, `own-context.ts`, `apps/api/src/main.ts:500-530`, and `packages/db/src/support.ts:92-205` recognize private-status requests and wire ownership-bound reads of run state, visibility, progress, recent events, and failures. That deterministic branch does not call the answer model, but Support itself still receives and reads private app data.

The narrow correction is to remove the debate picker and private-context consent from Support; remove stored/initial `ownContext` and `run_id`/`latest` request fields; remove or make unreachable the Support own-context endpoint/branch, port, service, repository, main wiring, and private tool-call records; and replace misleading attachment copy. A schema column can remain temporarily if removal is migration-risky, but no live Support code may read it or use it to reach core private records.

Human support remains separate. Case lookup, the user's own case list, and a redacted transcript supplied to a human workflow may remain auxiliary Help-page functions. Case bodies, tokens, receipts, or status must never be injected into the answer model or future conversational history. Identity binding and device/IP/session metadata may remain server-side for security and rate control, never as answer-model input.

## Current public-guide inventory

The app exposes 11 page-route patterns: `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`, `/help`, `/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`, `/settings`, and `/admin/workers`. The current catalog has 15 actions and 12 capabilities, backed by 38 bilingual content files / 19 article IDs. Every route has a disposition, but route coverage is not the same as complete guidance for user-visible menus.

| Surface | Visible destinations and controls | Current guide position | Gap / required behavior |
|---|---|---|---|
| Anonymous landing | Home/brand, Method, Transcripts, Pricing, Start a round, theme | Home/start/method/transcript facts exist | Add honest Pricing guidance (placeholder, not checkout) and local theme guidance. Keep anchors first-party and exact. |
| Global signed-in bar | Home, Account, New debate, identity chip, theme, Settings | Home/new/settings exist | Resolve the misleading signed-in Account link to `/login`, or describe the actual behavior honestly; add theme guidance. Do not treat the identity chip as a private-data source. |
| Signed-in home | Your debates, Public debates, start composer | Actions exist for tabs/composer | Guide navigation without reading either list. For an owner debate, say Home → Your debates → choose it; never accept/derive a private run ID. |
| New debate | Topic, Free/Premium, risk, budget, depth, steering, Settings, Cancel | Strong bilingual creation/prerequisite coverage | Preserve honest plan limitations and the fact Support cannot submit or mutate a debate. |
| Debate workspace | Thread, Split, Tree, Map, Scoring, Library, Replay, Workspace, Honesty, Export, How it works; publish/challenge/delete paths | Tree, export, publishing, challenge and deletion are partly covered | Add single-turn menu-label guidance for Replay, Workspace, Scoring diagnostics, Honesty and exact view names. Describe local controls and availability conditions; do not fabricate direct links or read the debate. |
| Settings | Active sessions, Privacy, Claim legacy, Delete account | Broad Settings/Privacy articles exist | Add menu-specific bilingual discovery and safe static anchors for all four sections. Explain prerequisites and page ownership; Support never performs revocation, claim, or deletion. |
| Help | Full/compact guide, topic primers, service status, cookies, report-bug primer, email, human case lookup/list | Free-text input works; primers seed text | Explain that pills only prime the composer. Distinguish public guide answers from human case UI and report-bug handoff. Do not ingest case data. |
| Auth | Sign in, sign up, email verification, MFA enrollment, Forgot password | Sign-in/up covered; state-bearing verification/MFA intentionally have no generic action | Explain prerequisites without guessing state-bearing links. Forgot remains incomplete until its canonical first-party destination/opener is verified. |
| Operator | `/admin/workers` | Excluded/operator-only | Continue to say it is unavailable to ordinary users; never expose an operator action. |

Meaningful CP1 additions are the missing menu families above, not every cosmetic synonym. A compact bilingual menu index plus targeted terms in the reviewed KB/catalog is sufficient. Only static same-origin routes/fragments and verified public references may become actions. Dynamic private owner destinations must remain prose navigation; public debate references may be actions only after validation.

## Free text, conversation, and recovery

The composer already accepts arbitrary text (`Assistant.tsx:727-748`), and topic buttons call `primeComposer`; pills are optional prompts rather than the guide's interface contract. CP1 must prove that natural single-turn EN/RO questions about each meaningful menu reach reviewed guidance without relying on a pill.

The answer-model request currently has no prior turns. That means follow-ups such as “Where is that?” cannot reliably resolve their referent. Bounded same-session ordinary user/assistant history, follow-up clarification, greetings, and language continuity remain CP2 work after CP1 acceptance. Future history must exclude private app/account records, case data/tokens, security metadata, and credential material.

Recovery safety must be specified by user-visible behavior rather than an internal intent label:

- A benign recovery question should receive concise guidance plus exactly the verified first-party Forgot action once that destination exists. It must not call a recovery/auth endpoint or submit a reset.
- A mixed request such as “give/reset my password and show me recovery” may correctly combine a firm refusal to provide, collect, or operate on credentials with the same safe navigation action. A general credential refusal must not suppress safe navigation.
- A negated or unrelated mention such as “I did not forget my password” must not divert into recovery guidance or show a recovery action. A false positive can be safe from credential compromise and still fail correctness/usability.
- Until the canonical destination/opener exists, fixed guidance with no link, no action, and no credential operation is a safe interim response, but it does not complete CP1. Never guess a route.

These cases should assert rendered text, actions, and observed calls: no password/code echo or solicitation, no reset/auth operation, exactly one canonical action for positive/mixed intent after verification, and no action for negated/unrelated mentions, in EN and RO. Cover the semantic classes with varied syntax, including modal negation (“must not perform”, “is unable to perform”, and Romanian equivalents); do not make acceptance depend on enumerating another finite list of literal phrases or on a classifier's private intent name.

## Narrow implementation sequence

1. Remove Support's private-context UI, request fields, service/repository wiring, and ambiguous attachment copy. Keep human cases and operational security controls separated from the public answer path.
2. Add reviewed EN/RO facts and search terms for the missing meaningful menu labels. Extend the closed catalog only with verified static first-party destinations/openers; use honest prose for local/stateful controls.
3. Resolve the signed-in Account destination/copy and, independently, the owner-blocked Forgot destination. Neither should be guessed inside Support.
4. Add CP1 table cases for single-turn free-text discovery, private-authority absence, closed actions, prompt injection, recovery mixtures/negations, and human-case isolation.
5. Keep follow-up history and conversational continuity in CP2 after CP1 acceptance.

## Acceptance evidence

- Generate a current inventory of meaningful visible menu labels from the stable components. Every entry maps to a reviewed EN/RO fact and one of: a verified safe route/opener with prerequisites; guidance for an in-page/local control with no fabricated link; or an honest unavailable/excluded explanation.
- Exercise natural EN/RO paraphrases for landing, global navigation, home/library, creation, debate views/utilities, settings subsections, Help/human cases, and auth states directly through free text.
- Assert all response actions resolve through the closed catalog. Reject raw model URLs, unknown fragments, private owner IDs/references, tokens, and unverified destinations.
- Assert Support UI makes no `/api/v1/answers` request and exposes no debate list, question line, run ID, latest-run selector, or attach-debate control. Reject `run_id` and `latest` in the public guide request schema. Assert no Support own-context database/service call occurs.
- Capture the answer-model request and prove it contains only reviewed public KB context plus the current redacted user text. It contains no owner reference, debate question/claims/answer, private status/event/failure, account/device/IP/session field, or human-case content/token.
- Keep human case submission/lookup functional as a separate flow, while proving its case records and tokens are absent from the answer-model request.
- Cover adversarial instructions that ask for private records, hidden routes, credentials, or actions outside the catalog; responses must not expand sources/actions, invoke account/private tools, or override the public-guide boundary.
- Cover the recovery positive/mixed/negated matrix above. Judge visible refusal/guidance/actions/calls, not whether a private classifier assigned a particular internal label.

## Limits

No private user data was read. No product/source/Git/index file was changed. No tests, build, install, service, browser, HTTP, model, auth, reset, or provider traffic ran. The 19 inspected stable files and their byte hashes are recorded in `GUIDE_GAP-stable-files.sha256`. The unresolved Forgot destination was not investigated again. Active FEEDBACK_FIX3 outputs were not consumed. Usage is `UNAVAILABLE`.
