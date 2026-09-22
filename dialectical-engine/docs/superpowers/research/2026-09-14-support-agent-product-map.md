# Support Agent product map

Inspected 14 September 2026, working-tree baseline `dbb47639` on `integration/debate-tiers`. This is an audit inventory for authoring the chatbot's reviewed knowledge, not proof of deployed availability. Model prompts should receive the visitor-safe facts derived from it, not raw code paths or internal implementation details.

**Owner correction:** “Forgot password” exists and must be invoked as navigation when the user expresses that intent. Its canonical URL/control was not found in this checkout or the bounded auth-branch search. Preserve it as an owner-confirmed feature with an integration-location discrepancy; verify and reuse the actual destination. Do not create a replacement or tell users it is absent.

## Complete page-route inventory

Eleven `apps/ui/app/**/page.tsx` files were found. Dynamic braces below describe route patterns; the chatbot must not emit a literal `{id}` or invent an identifier.

| Route | Audience / entry conditions | What the user can do | Support navigation policy / source |
|---|---|---|---|
| `/` | Anonymous or signed in; different views | Guests see the landing page; signed-in users see their library and public catalog | Safe home link. [page.tsx](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/page.tsx:18) |
| `/new` | Sign-in required | Enter a question, choose the available plan, configure permitted fields, start a debate | Safe navigation; describe sign-in prerequisite. [new/page.tsx](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/new/page.tsx:65) |
| `/debate/{run_id}` | Signed-in owner and ownership-checked API reads | Read/explore the owner's debate, inspect its state, perform available owner actions | Resolve only from trusted ownership-checked context. [owner page](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/debate/[id]/page.tsx:37) |
| `/public/debate/{public_ref}` | Anonymous access to an existing published snapshot | Read published content and export its public snapshot | Use a verified public reference; not the private run ID. [public page](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/public/debate/[id]/page.tsx:7) |
| `/help` | Anonymous or signed in | Chat, request human help, open a case by its access token; signed-in users can list their own cases | Safe static link. Case receipts are server-generated, not model-generated. [help page](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/help/page.tsx:4) |
| `/login` | Signed-out visitor; existing valid session redirects home | Email/password sign-in followed by authenticator or a previously saved MFA recovery code | Link for sign-in or applicable saved-MFA-code guidance. Do not substitute it for the owner-confirmed Forgot password flow. [login page](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/login/page.tsx:6) |
| `/sign-up` | Anonymous registration | Primary email, different recovery email, password, adult affirmation, privacy-policy acceptance; resend verification | Link and explain the steps; never collect these inputs in support chat. [SignUpFlow](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/SignUpFlow.tsx:183) |
| `/verify-email` | Valid verification-link state | Compatibility entry into mandatory MFA enrollment | Known route; never synthesize a token-bearing verification link. [alias](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/verify-email/page.tsx:1) |
| `/enroll-mfa` | Valid enrollment/verification state | Set up an authenticator, confirm it, save account-generated recovery codes, complete activation | Known route; generic bare link cannot replace the valid account-flow state. No bot-generated codes or enrollment URLs. [enrollment page](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/enroll-mfa/page.tsx:75) |
| `/settings` | Sign-in required | Session controls, browser consent preferences, legacy debate claim, account-erasure controls | Link to actual controls only. [active settings composition](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/settings/page.tsx:53) |
| `/admin/workers` | Publicly routable shell; ordinary users get no operator data | Read a static “Operator-only view” explanation | Exclude from ordinary support actions; this is not an operational worker dashboard. [page](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/admin/workers/page.tsx:1) |

The catch-all `/api/[...path]` is a backend proxy, not a twelfth page or a user-facing navigation destination. Its endpoints and all `/v1/auth/*` actions remain outside chatbot authority. [Proxy route](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/api/[...path]/route.ts).

## Links, query variants, fragments and modal entries

| Destination/control | Current behavior | Catalog treatment |
|---|---|---|
| `/?tab=yours` | Signed-in private library tab | Safe signed-in navigation |
| `/?tab=public` | Signed-in public-catalog tab | State sign-in prerequisite; guests receive the landing view |
| `/#start-a-debate` | Composer fragment exists in signed-in home only | Conditional, not a universal landing anchor |
| `/new?topic=…` | Home composer passes a question into the creation form | App-controlled prefill; avoid copying arbitrary support text or private content into model-generated URLs |
| `/#method` | Anonymous landing's methodology section | Conditional landing anchor |
| `/#transcripts` | Anonymous landing's sample section | Conditional landing anchor; sample is not the full public catalog |
| `/#pricing` | Resolves to copy containing `[PLACEHOLDER]` price/free-round text | Do not quote prices, infer a billing plan or offer it as a working checkout |
| `/login?next=%2Fnew` | Existing landing CTA | Valid safe return path |
| `/login?next=…`, `/sign-up?next=…` | Return helper permits `/`, `/new`, `/settings`, and UUID-shaped public-debate routes; other paths fall back home | Use explicit allowed destinations only; private debate and `/help` return are currently not supported by the helper |
| `/help?case=…` | Case access token is a capability | Only the existing server receipt can create it; do not expose tokens to model history or accept an arbitrary user-provided URL as authority |
| `/help#service-status` | Existing Help status section | Valid anchor; label its data as support status, not the health of every engine/model |
| `/settings#privacy` | No matching target ID found | Replace with an existing verified control/fragment or plain settings link |
| `/settings#cookies` | No matching target ID found | Same correction required |
| `/settings#consent-privacy-heading` | Heading exists in active settings | Valid signed-in preferences destination; it is not a legal-policy page |
| Privacy policy | Modal in sign-up / consent UI | Explain/open the actual modal where supported; no standalone `/privacy` page was found |
| Cookie preferences | App-wide preference opener and active settings button | Open the real preference UI; do not invent a cookie-settings page |
| Terms | No Terms page/control found in inspected routes | No invented `/terms` link |
| “Forgot password” | Owner-confirmed existing flow; canonical location unresolved in this source snapshot | Required `forgot-password` action; verify the existing URL/opener and reuse it |
| `mailto:support@dezbatere.ro` | Hard-coded Help email link | Mail link exists; inbox monitoring/delivery was not verified. Human case flow is the source-backed handoff |
| Global “Account” | Current top-bar link goes to `/login`; valid signed-in session redirects home | Navigation defect to reconcile separately; bot's settings guidance should use the real `/settings` page |

Evidence: [home tabs/composer](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/page.tsx:79), [composer prefill](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/LibraryComposer.tsx:24), [landing navigation](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/landing/LandingChrome.tsx:32), [method anchor](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/landing/LandingMethod.tsx:8), [sample anchor](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/landing/LandingSample.tsx:8), [pricing placeholder](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/landing/LandingPricing.tsx:33), [return-path rules](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/returnPath.ts:1), [Help shortcuts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/support/Assistant.tsx:727), [preferences](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/consent/ConsentSettingsPanel.tsx:35), [top bar](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/TopBar.tsx:82).

## Debate capabilities and limitations

| Task | What can be stated from current source | What must not be promised |
|---|---|---|
| Browse debates | Signed-in users have private/public library tabs; anonymous users can open shared published links | A guest home catalog identical to the signed-in library |
| Start from home | The current composer passes legacy configuration, which fails V3 validation and falls back to `/new?topic=…` | Successful direct creation from home in this snapshot |
| Create on `/new` | Actual V3 ask form submits current required fields | A support message itself starts a debate |
| Free plan | Fixed settings; risk, budget, depth and steering controls disabled | User-editable Free risk/budget/depth/steering |
| Premium plan | Both plan cards are selectable in this prototype; Premium enables the relevant controls | A paid subscription entitlement, checkout or billing validation that this source does not implement |
| Model roster | Current plan catalog has two Free models and three Premium models; availability is enforced by API/catalog | “Always five frontier models”, a user-configurable roster or guaranteed deployment availability |
| Premium legacy options | Depth mode, scrutiny, branching width, concurrency and token controls are displayed but explicitly not sent in the V3 contract | That changing these values changes the run |
| Read/explore a debate | Tree, Thread, Split and Map workspace views; inspect nodes, displayed scores and honesty/source information | Claiming every historical guide view or backend action is implemented just because copy mentions it |
| Scores/reviews/verdicts | Display graph-backed results and their absence/limitations honestly | A score proves truth, all verdicts always exist, or a missing score equals zero |
| Per-node feedback/scoring actions | Current client exposes typed unavailable responses / disabled controls | Functional V2 scoring feedback or per-node scoring endpoint |
| Challenge / flag a selected claim | Visible owner interaction currently changes local scrutiny/investigation state | A durable challenge or spawned rebuttal run; those handlers issue no request |
| Investigation recommendations | Existing answer-gap investigation can be recorded through its wired callback | That the generic disabled “Start investigation” button is a working execution control |
| Memory controls | Answer-level unlink-memory action is wired in the owner surface | That support can inspect memory contents or perform the operation for the user |
| Regenerate a node | Declared unavailable; controls disabled/client rejects | That regeneration will run |
| Generation history/version comparison | Backend history is absent in the inspected client path; failed history loads can appear empty | Reliable prior-version comparison or that an empty panel proves there were never older versions |
| Adaptive depth approval | Unavailable in current V3 action client | That clicking an approval changes execution |
| Export owner answer | JSON export appears only with a served answer and readable ledger digest | Markdown export, exporting unfinished results or an unrestricted data export |
| Export public answer | Exports the published JSON snapshot | Private artifacts or the owner's entire debate data |
| Publish / unpublish | Owner controls require account-page step-up and acknowledgement; public/private state changes through authenticated API | Support performs publication or accepts the password/authenticator input in chat |
| Delete private debate | Own private debate only; reauthentication required; a published debate must first be unpublished | Direct deletion of another user's debate or deletion while still published |
| Public snapshot | Anonymous reading with disclosure; historical publications may have a more limited snapshot | Owner controls/data, automatic live updates from private state, or assured removal of third-party copies after unpublishing |
| Sign in from public page | Can authenticate and return to the public route | “Unlock challenge/regenerate/flag” merely by signing in to someone else's published view |
| Deployment settings | Ordinary settings page is account controls; operator projection is defined but not mounted | User edits to models, routing, deployment versions or monthly spend caps |

Evidence: [V3 ask validation](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/api.ts:373), [plan controls](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/new/page.tsx:184), [Free restrictions](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/new/page.tsx:237), [unsent options](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/new/page.tsx:335), [plan roster](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/packages/contract/src/plan-tiers.ts:7), [plan admission](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/api/src/index.ts:1209), [unavailable actions](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/v3/missingCapabilities.ts:7), [graph scores](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/v3/adapter.ts:669), [local Challenge handlers](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/debate/[id]/DebatePageClient.tsx:1444), [record investigation / unlink memory](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/app/debate/[id]/DebatePageClient.tsx:723), [history loading](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/NodeDetailDrawer.tsx:121), [owner JSON export](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/v3/answerExport.ts:46), [public JSON export](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/v3/publicAnswerExport.ts:9), [publication/deletion controls](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/PublicationControl.tsx:46), [public limitations](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/PublicHonestyDrawer.tsx:52), [public unlock copy](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/PublicDebateOverview.tsx:155).

## Account actions: explain and link, never perform in support

| User need | Current product entry / fact | Assistant boundary |
|---|---|---|
| Forgot password | Existing flow confirmed by owner; integration location must be verified | Offer its exact existing link/opener; no password or code in chat, no reset submission |
| Sign in | `/login`, then mandatory second step | Explain; never collect login credentials |
| Lost authenticator but retained password and saved recovery code | `/login` → credentials → **Use a recovery code** | Direct there only for this situation; never display/request the saved or replacement code |
| Register | `/sign-up`, primary and different recovery emails, password, adult/policy confirmations | Link only; no account-existence checks |
| Verify registration / enroll MFA | Valid email link → verification/enrollment flow; security inputs stay there | Never generate or echo the token URL, authenticator seed or account-generated codes |
| Resend verification | Existing sign-up flow | Explain location; never claim the chatbot sent a verification email |
| Review/revoke sessions / sign out | `/settings` session controls, with fresh authentication where required | Explain the actual controls; no bot-side revocation |
| Browser cookie preferences | Existing preference UI, also reachable from settings | Explain browser-local choice; current consent record does not itself demonstrate analytics/cookie gating |
| Claim legacy debates | `/settings` legacy claim asks for a prior access token in that interface | Do not request, store or repeat that token in support |
| Account deletion | `/settings`, fresh authentication and exact confirmation; scheduling/cancellation controls | Explain without collecting credentials, accepting confirmation in chat or scheduling deletion |
| Change email / regenerate active MFA / change deployment settings | Not present as active ordinary controls in this inspected settings view | Do not route to a nonexistent setting; describe only separately verified target-product capabilities |

Evidence: [login](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/LoginFlow.tsx:62), [MFA-code choice](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/LoginFlow.tsx:289), [sessions](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/SessionControls.tsx:77), [legacy claim](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/LegacyRunClaimControls.tsx:23), [erasure controls](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/AccountErasureControls.tsx:49), [browser consent implementation](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/consent.ts:1).

The source-level recovery-start API is evidence of a partial backend integration, not the verified Forgot password destination. Current auth-source tests even exclude `forgot` copy, reinforcing the need to reconcile this checkout with the owner's existing feature. Do not keep that exclusion test if it contradicts the verified intended UI. [Contract recovery method](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/packages/contract/src/client.ts:376), [source test](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/authRoutes.source-test.mjs:37), [parity test](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/tests/architecture/auth-front-door-parity.test.ts:79).

## What Support itself can and cannot do

Support can explain reviewed product facts, provide safe app navigation, display team-published incident information, and create an asynchronous human case. With a signed-in session, explicit conversation consent and ownership checks, it can inspect only debate status metadata. The status projection is a closed set: run ID/time/state, terminal/staleness state, visibility/public reference, progress stage, last event time and failure code. It cannot read debate questions/claims/answers, other users' records, auth secrets or account security state. [Status projection](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/api/src/support/own-context.ts:10).

Conversation retention/erasure is handled by existing support-key/shredding operations. Do not claim automatic deletion after a fixed number of days unless the actual deployed policy says so. “Talk to a human” creates a case; it is not a telephone call. The current server uses 48 hours for case SLA while Help says one working day, so copy must use a single verified source. [Case SLA](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/api/src/support/index.ts:165), [help promise](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/components/support/Assistant.tsx:722).

## Knowledge corrections before broader conversation is enabled

| Current article / copy | Required correction |
|---|---|
| `getting-started-debate` | Distinguish actual `/new` creation from home prefill; explain plan-dependent controls |
| `risk-tier-choice`, `budget-tier-choice`, `debate-topic-and-description` | Explain which inputs are fixed under Free and editable under Premium |
| `guide-how-it-works` | Replace Markdown export with conditional JSON export; do not promise durable Challenge or reliable generation history/version comparison |
| `unsupported-capabilities` | Add local-only Challenge, unavailable history and unsent legacy options; keep existing unavailable-action facts |
| Publishing/unpublishing/deletion articles | Explain owner-only prerequisites and secure account-flow reauthentication; Support never handles credentials |
| Public-browsing articles | Distinguish anonymous shared public links from the signed-in home catalog |
| Account/recovery coverage | Add the existing Forgot password entry after location verification, plus separate saved-MFA-code guidance and actual settings tasks |
| Help topic suggestions/counts | Derive from reviewed content; no decorative counts or immediate-refusal prompts |
| Help health/privacy/SLA copy | Use measured data and actual destinations/policy; remove unsupported implications |
| Landing model counts, pricing, Challenge and public unlock claims | Do not ingest as product truth; reconcile copy separately or explicitly describe the current limitations |

The complete current corpus has **12** topics in **24** EN/RO files. Its loader checks structure, review metadata and pair completeness, but not whether referenced features still exist. New corpus articles alone will remain unreachable until the answer-service regex eligibility gate is removed. [Corpus loader](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/packages/support-kb/src/index.ts), [retrieval gate](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/api/src/support/answer.ts:90).
