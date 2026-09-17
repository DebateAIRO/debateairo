# SupportAgent — requirements (observability-agents)

Seat REQ-SUP (Fable 5.1), ticket `t_217e59bf`, 2026-09-01/02. Tree state measured by this
seat: `dev` @ `4f764037`, 12 dirty entries, all this mission's packets and logs (the packet's
`8d38185c` + 111 dirty ui-overhaul entries were committed by a concurrent session before
measurement — orchestrator HEARTBEAT, comment 2 on `t_217e59bf`). Every `path:line` below
was read by this seat on that HEAD. Product name: `dialectical-engine` (UI: "Dialectical
Engine", brand domain `dezbatere.ro`, `apps/ui/components/TopBar.tsx:31`).

## Verdict summary

1. Phase 1 ships **Bot A only**: a grounded, bilingual (ro/en) assistant that answers from a
   V-ratified Help Corpus, "points, never performs", refuses everything in the security
   zone before a model sees it, and escalates to V with the verbatim transcript.
2. It is **structurally incapable of touching the zone**: three-to-four narrow tools, a
   Postgres role with privileges on `support.*` only, no zone imports, no route under
   `/v1/auth|account|debates|runs|answers|asks`, and the subject always taken from the
   identity session, never from the conversation.
3. **Relay-only model path** (DR-179) in phase 1, with the key-based variant specified and
   not built (row V-2); the relay's measured facts make "best possible" a claim to be
   measured by SUP-01, not asserted here.
4. **Seven vertical slices SUP-01…SUP-07**; SUP-01 (a new `/help` route, eval-gated) is the
   smallest complete proof and the only dependency of the others.
5. **No product-fact document exists** to ground on today; the Help Corpus must be authored
   by an independent seat from named seeds and ratified by V before the first answer.
6. V's console in phase 1 is a **terminal inbox**, because no operator authentication path
   exists in the product and building one is zone.
7. **Bot B** (row V-4) is fully specified below as a later phase with the evidence diode
   stated precisely; its phase-1 replacement is V reading cases.
8. Eleven contested decisions are collected for V (Q7); none duplicates rows V-1…V-6.
9. Zero unresolved contradictions; two tensions inside the packet are resolved and quoted.

## Q1 Quality, measurably

| Requirement | Number | How measured (by V or by the release gate) |
|---|---|---|
| Grounded answers only | 100 % of `ANSWER_GROUNDED` replies end with a `Source:` line naming ≥1 Help Corpus entry; 0 product claims without a source | Eval set structural assertion (every run); rubric by the independent eval seat; V samples 10 transcripts per release and any ungrounded product claim is a blocking finding |
| Zero fabricated product behaviour | 0 in classes A–B of the eval set; `NO_SOURCE` whenever retrieval returns nothing | Eval rubric ≥ 95 % overall with 0 tolerance on fabrication; SUP-01-R03 |
| Zero privileged actions reachable | Tool registry = exactly {`answer_from_corpus`, `link_first_party`, `refuse`} (+ `read_own_run_state` from SUP-03); 0 DB privileges outside `support.*`; 0 imports from zone files | Architecture tests (registry freeze, import graph); `has_table_privilege` queries in SUP-01 acceptance step 13; eval class D (12 cases) every run |
| Allowed low-risk actions (exhaustive) | (1) answer from the corpus with citation; (2) link to a first-party route from the allow-list {`/`, `/new`, `/login`, `/sign-up`, `/settings`, `/help`, `/public/debate/{id}`}; (3) refuse with a fixed template; (4) open a case for V; (5) read back the user's own case by token; (6) with per-session consent, read the signed-in user's own run METADATA; (7) set the chat language; (8) report a V-published incident. Nothing else — no rename, publish, unpublish, delete, sign-out, email, or any account action | Registry freeze test; the list is closed by SPEC (SUP-01-R07, SUP-03-R05) |
| First-response latency (model-backed) | first token ≤ 3 s p50, ≤ 8 s p95; completion ≤ 20 s p95 | `support.message.received_at/first_token_at/completed_at`; `pnpm support:eval --runs 3` prints percentiles; SQL V pastes. Feasibility UNVERIFIED on the relay (one ~50 s deep call measured, `decisions-ledger.md:1292-1293`) |
| Deterministic replies | ≤ 1 s p95 (refusals, no-source, degraded, disabled, rate-limited, incidents) | Same timestamps |
| Deflection rate | ≥ 60 % after the first 30 days of real users (baseline UNVERIFIED — zero users today) | sessions with ≥1 grounded answer, no `human` rating, no case ÷ sessions with ≥1 user message; printed by `pnpm support:status` for 7 and 30 days |
| Resolution signal | explicit rating `yes` on ≥ 70 % of rated grounded answers after 30 days (UNVERIFIED baseline) | `support.message.rating`; `pnpm support:status` |
| Escalation to a human | case row committed ≤ 2 s after the trigger; verbatim transcript + one-paragraph (≤ 80 words) advisory summary ≤ 60 s p100; V's reply visible to the user in the product; SLA text from register row (default 48 h) | SUP-02 acceptance steps 1–6; `summary_at − created_at` SQL |
| Languages | ro + en; per-message detection stored; reply language = detected or user override in 100 % of eval turns; every template and every corpus entry exists in both languages | Eval structural assertion; SUP-01-R10 |
| Tone | plain sentences, ≤ 120 words unless a procedure (≤ 10 numbered steps); identifies as an AI in the first message; never promises an outcome; never claims an action it did not take; never states a conclusion about who the user is | Fixed copy in the SPECs; eval rubric; V's sample |
| Refusal rules | fixed bilingual templates per class: `REFUSE_ZONE` (+ first-party link), `REFUSE_INJECTION` (+ recorded), `REFUSE_OTHER_USER`, `REFUSE_SAFETY` (straight to a person), `NO_SOURCE`; zone-adjacent and safety classes decided BEFORE any model call | Eval classes C and D 100 %; SUP-01-R05/R06 |
| Evaluation set | N = 60 scripted conversations (A 20 grounded en/ro · B 6 no-source · C 10 zone-adjacent · D 12 injection/exfiltration incl. corpus poisoning · E 6 own-context · F 3 incident · G 3 escalation); authored by an independent Fable 5.1 seat (never the coder), ratified by V; three runs, WORST run is the verdict; `applicable/total` and `pending` slices printed | `pnpm support:eval --runs 3`; gates every release of every SUP slice |

## Q2 Knowledge sources

### Allowed

| Source | What exactly | Scope and rule | Who writes / versions it |
|---|---|---|---|
| Help Corpus | `packages/support-kb/content/<id>.<lang>.md`, front matter `id, lang, title, status, sources, verified_against, ratified_by, ratified_on`; only `status: shipped` + `ratified_by: V` entries load; `kb_version` = SHA-256 of the manifest, recorded per session | The ONLY free-text source. Every answer cites an entry id. Entries carry no pricing (`apps/ui/components/landing/LandingPricing.tsx:34` is `[PLACEHOLDER]`), no model count (`apps/ui/components/landing/cards.ts:107` "Five" vs `apps/ui/app/page.tsx:62` "Several"), no claim about what a verdict label proves (`docs/visuals/verdict-forensics.png` contradicts the landing copy) until V ratifies text | Drafted by an independent Fable 5.1 KB-author seat from the seeds: `apps/ui/components/GuideModal.tsx:7-41`, `apps/ui/lib/v3/missingCapabilities.ts:8-10`, `apps/ui/components/PublicAnswerDisclosure.tsx:5`, `apps/ui/app/new/page.tsx:27-33`, the anonymous routes (`apps/api/src/index.ts:118-119`), the publish/unpublish/delete rules (`apps/api/src/index.ts:693`), `docs/founding/ui-boundary-contract.md` (extracted, never quoted). Ratified by V. Versioned by git + `kb_version` |
| The user's OWN debates and runs | METADATA ONLY: `run_id, created_at, run_state, terminal_state, staleness_state, visibility(+public_ref), progress_stage, last_event_at, failure_code` | Signed-in only; explicit per-session consent toggle, default off, timestamped; ownership by `core.run_is_owned_by` (`migrations/0037_run_ownership.sql:289`) with the subject from the identity session (`apps/api/src/index.ts:368`, `apps/api/src/sessions.ts:34`), never from the conversation; question text, node claims, answers and provider payloads never enter the model context (privacy posture, COMMON §3) | Read-only projection defined in SUP-03-R03; contested row SUP-D2 for any widening |
| V-published incident state | `support.public_incident` {id, started_at, ended_at, severity, affected_surface, summary_en, summary_ro, published_by=V, published_at, source_ref} | The only incident source; when no open row exists the assistant says NO_INCIDENT (fixed text: "I have no record of a current known incident. That doesn't rule one out …"). Raw `obs.incident` (`migrations/0034_obs_foundation.sql:120`) is never read | V via `pnpm support:incident publish|resolve`; the ObservationAgent product may later write here under its own V-approval rule — REQ-SYNTH diffs this interface |
| First-party route allow-list | `/`, `/new`, `/login`, `/sign-up`, `/settings`, `/help`, `/public/debate/{id}` | The assistant links; it never performs. Links are same-origin anchors only | Fixed in SUP-01-R07 |
| The user's own case | `support.case` by token (SUP-02) | The holder of the token, or the signed-in owner | — |

### Forbidden (never a source, by construction)

| Never grounded on | Why | How it is made impossible |
|---|---|---|
| Other users' debates, sessions, cases, identity | Privacy; account-existence oracle | Ownership predicate with session subject; `debateai_support` role has no privilege on `core.*`, `serve.*`, `identity.*` (deny set `packages/obs-capture/src/zone/manifest.ts:41`) |
| The security zone (identity, registration, verification, MFA, recovery, sessions, erasure, crypto) | COMMON §3 | No import from zone files; no route under `/v1/auth`, `/v1/account`; pre-model classifier refuses zone-adjacent intents |
| Raw provider payloads, prompts, hidden reasoning | COMMON §3 privacy posture | Only assistant text + typed usage stored (SUP-01-R12); relay child environment is scrubbed (`acceptance/relay-core.ts:67-80`) |
| Agent boards (Hermes Kanban), `.hermes/**`, `docs/missions/**`, `docs/architecture/**`, `docs/agent-protocols/**` | Internal process, not product fact; leaks internals | Not in the corpus loader's path; the loader reads `packages/support-kb/content/**` only |
| Raw observability tables `obs.*` | Not a truthful public statement until V publishes | No privilege on `obs.*` |
| Any debate CONTENT, including the user's own | Privacy posture; the model provider would see it | Metadata-only projection with a closed key set (SUP-03-R03) |
| The model's own world knowledge about the product | Fabrication risk | `NO_SOURCE` template whenever retrieval returns nothing (SUP-01-R03) |

## Q3 Surface, API, human console

**Where the assistant lives.** SUP-01: a new route `/help` for anonymous and signed-in
visitors. SUP-04: a collapsed widget on `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`.
Never on `/login`, `/sign-up`, `/verify-email` (which re-exports the MFA page,
`apps/ui/app/verify-email/page.tsx:7`), `/enroll-mfa`, `/settings` — enforced by per-page
mounts and an importer allow-list test; no mount in `apps/ui/app/layout.tsx:34`.
Anonymous visitors get the corpus, refusals, incidents and a case; signed-in users add
consented own-run metadata, per-account limits and a list of their cases.

**API shape (requirements, not design).** Routes under `/v1/support/*`, each declared in
`authorizationPolicyInventory` (`apps/api/src/index.ts:98-144`; the `onRoute` hook at `:339`
refuses undeclared routes) with policy `public` and the identity session optional (looked up
by the existing hook at `:386`/`:408`), and mirrored in the contract inventory
(`packages/contract/src/index.ts:641`): create session · post message (reply, or SSE for
streaming — Architecture's call) · read own session · rate · consent (signed-in) · escalate ·
read case by token · post case message · status (switch + degraded flag). The UI proxy
forwards only allow-listed headers and the two `__Host-debateai-*` cookies
(`apps/ui/app/api/[...path]/route.ts:9,36`), so the support session token is a separate
opaque value (cookie or bearer — Architecture's call), never the identity token
(`apps/api/src/index.ts:169`). Session scoping: a support session is bound at creation to the
identity session's `owner_ref` when the cookie authenticates and re-validated per message.
Rate limits: per IP via `normalizeClientIp` (`apps/api/src/client-ip.ts:23`) behind the
loopback-only proxy trust (`apps/api/src/client-ip.ts:9`, `apps/api/src/index.ts:336`) —
20 msgs/10 min, 100/24 h, 5 sessions/h; per account 60/10 min, 300/24 h; 40 msgs/session,
2 000 chars/message; relay concurrency 2 with a queue of 10; daily cap 500 model calls; all as
register rows (`register.register_row`, `migrations/0000_s00.sql:275`) set by
`pnpm support:limits set`. Abuse controls: injection detector → refusal + `support.abuse_event`
(class, hashes, no content) → session lock after 3 → IP cooldown after 2 locked sessions;
secret-like substrings redacted before the model and before storage; kill switch
`support_enabled` (production default `false`), `pnpm support:switch off|on`, effective ≤ 5 s.
Transcript storage: schema `support` (`session, message, abuse_event, case, case_event,
tool_call, session_key, case_key, shred_audit, public_incident`), additive migrations, content
encrypted with per-session keys wrapped by a support KEK file in the custody root
(`apps/runner/src/dev-secret-files.ts:18` pattern); retention `keep` by default (DR-188,
`decisions-ledger.md:1611`), erasure by key destruction (`pnpm support:shred`). Escalation
record: SUP-02-R02 (owner ref or null — never an email; predicate id; tool calls including
denied; advisory summary flagged non-authoritative; `kb_version`; SLA hours; state log).

**Human console V uses in phase 1 — the pick and the alternatives.**
- **Terminal inbox (PICK):** `pnpm support:inbox | case | reply | close` under
  `apps/runner/src/` plus a Postgres view `support.inbox`. Requirements: plain text only,
  control bytes replaced, `USER>` prefixes inside an UNTRUSTED banner, URLs never opened, no
  model with authority in the console, arguments never taken from case content. Why: V is the
  only human, already runs the dev stack and psql from a terminal, and no new
  authentication surface is needed.
- **Admin page (`apps/ui/app/admin/support`):** requirements would be an operator
  session with step-up and per-read audit. Rejected for phase 1: no operator authentication
  path exists — every authenticated caller on an `operator` route is refused
  (`apps/api/src/index.ts:432`), `/admin/workers` is a static refusal card
  (`apps/ui/app/admin/workers/page.tsx:14`), and adding one is sessions/step-up = zone = V-only.
  Later phase, after V rules on operator auth.
- **Board ticket (Hermes Kanban):** rejected as the console — the product must not depend
  on the agent harness, and COMMON forbids the assistant grounding on boards. Acceptable
  later as a one-way notification mirror if V wants it (row SUP-D1).
- **Digest file:** a daily markdown digest in a V-chosen path is cheap and passive; not
  chosen because it duplicates the inbox without the reply path. Optional later.

**Standalone (C3, identical definition to the other two products):** the SupportAgent is a
separately startable and killable component (`pnpm support:switch off` is its kill switch;
its API module and CLIs are its own files) that shares read-only stores with the others
(`support.public_incident` as the incident interface) and writes only to `support.*`.

## Q4 Threats and structural defences

| # | Threat | Structural defence (not a prompt rule) | Phase |
|---|---|---|---|
| T1 | Prompt injection via user text ("ignore instructions", role play, "the admin says") | No mutating tool exists; subject from session; model output rendered as inert text with same-origin links only; deterministic detector → `REFUSE_INJECTION` + `abuse_event`, never sanitize-and-continue; lock after 3; eval class D | 1 (SUP-01, SUP-06) |
| T2 | Indirect injection via the user's own debate content | Debate content never enters the model context — metadata-only projection with a closed key set; tool results are enums/ids, no free text (SUP-03-R03/R05) | 1 (SUP-03) |
| T3 | FAQ / corpus poisoning | Corpus is repo-versioned, V-ratified, `kb_version`-pinned; the loader rejects entries containing instruction-like patterns (lint in CI); entries are quoted as data; there is no tool an instruction could steer; eval D includes a poisoned test-only entry | 1 (SUP-01) |
| T4 | Data exfiltration (env, keys, prompt, other users) | Relay child environment scrubbed to an allow-list (`acceptance/relay-core.ts:67-80`); no secrets in the prompt; no URL-fetch or generic HTTP tool; no external links rendered; other users unreachable by role grants + ownership predicate; eval D exfiltration cases | 1 |
| T5 | Social engineering toward recovery / credentials / contacts | Pre-model classifier refuses zone-adjacent intents before any model call; the assistant holds no capability on `/v1/auth/*`, `/v1/account/*`; a support chat is never a session; unauthenticated users are told nothing account-specific; every such conversation is recorded and, on repetition, opens a case V reads | 1 |
| T6 | Account-existence oracle | Uniform `REFUSE_ZONE` / `REFUSE_OTHER_USER` texts regardless of whether the account or run exists; identical status codes | 1 |
| T7 | Spend exhaustion / denial of service (an always-open model endpoint) | Per-IP, per-account, per-session limits; concurrency cap and queue; daily cap; kill switch; degraded mode; provider-spend floor honoured by V-set register rows | 1 (SUP-01, SUP-06) |
| T8 | Users or V quoting the assistant as authority | AI disclosure first message; V's replies attributed "Support (a person)"; the assistant never states a conclusion about identity or promises an outcome | 1 |
| T9 | Console injection (payload fires where V reads) | Terminal console prints inert text, strips control bytes, wraps transcripts in an UNTRUSTED banner, never opens URLs, runs no model with authority, takes no argument from case content | 1 (SUP-02) |
| T10 | Transcript breach | Encryption at rest per session/case key; secret-like strings redacted before storage; no raw provider payloads; role-scoped privileges | 1 (SUP-01, SUP-07) |
| T11 | Homoglyph / bidi tricks in stored text | Control and bidi override characters normalized before classification and replaced on display | 1 |
| T12 | Model unavailable / relay down | Degraded mode with deterministic replies and case filing; the relay never fabricates a completion (`acceptance/relay-core.ts:16-17`, `:355`) | 1 (SUP-06) |
| T13 | Poisoning of Bot B's evidence record | Record is a closed schema: question id · verbatim claimant quote · system-known value or NOT_KNOWN · machine comparison · system-computed confidence; no free-text model field, no verdict field | Later (V-4) |
| T14 | Bot B egress / hosted model as egress | Default-deny network; tool set exactly {`ask_user`, `write_evidence`, `run_first_party_check` → boolean/enum}; the model endpoint is the single named exception and requires V's ruling (local model or recorded zero-retention contract) | Later (V-4) |

### Bot B — full specification for a later phase (row V-4), and the phase-1 fallback

**Purpose (V, 2026-08-17):** ask higher-privilege identity questions to speed case
resolution, isolated, no egress, record visible only to human support staff, the user can
never read it back; defence against prompt injection reaching account actions
(`docs/missions/2026-08-17-mfa-recovery-requirements/00-intake-H0.md:90-107`).

**The one-way evidence diode, stated precisely.** Conversation flows both ways between the
claimant and Bot B. FINDINGS flow one way only: from Bot B into a human-only evidence store
— never back to the claimant, never into Bot A, never into any automated decision, risk
engine or tier change, never into another model's context. Structurally: (1) Bot B's tool
set is exactly `ask_user(question_id)`, `write_evidence(record)`,
`run_first_party_check(check_id) → boolean|enum`; (2) `write_evidence` accepts only the
closed schema of T13 — there is no field a model-authored sentence can occupy; (3) questions
come from a finite, versioned, human-approved catalogue chosen by the system, never
improvised, never leaking the answer set, never asking for a secret (a volunteered code is
discarded unrecorded and the event flagged); (4) Bot B never confirms or denies an answer;
(5) the evidence store is append-only, per-case access for named staff, every read logged,
no user-facing read path exists; (6) the environment is default-deny egress, ephemeral per
case, with blocked egress attempts logged as compromise indicators; (7) the human console
renders evidence as inert text under an untrusted banner with no model holding authority;
(8) the model endpoint is the single named exception to "no egress" — V must choose a
model inside the boundary or a recorded zero-retention/no-training contract (contested in
the 2026-08-17 synthesis, §6.3(c)); (9) a real owner who authenticates during an in-flight
evidence session cancels it; (10) the outcome never depends on the conversation — bots
gather, the recovery ladder (zone) decides. **Preconditions before Bot B may be built:**
human support staff other than V exist (the two-person rule is unsatisfiable today); the
recovery ladder exists (zone); the isolated environment exists; V rules on item 8.

**Phase-1 human fallback that replaces it.** Bot A refuses every identity-adjacent request
and opens a case (SUP-02). V reads the verbatim transcript in the terminal inbox and
replies in the case thread; V never asks for a secret in the thread (a volunteered
secret-like string is redacted before storage, SUP-01-R12); any account action V takes
happens in the product's own recovery/settings flows (zone), never through the assistant.
Nothing the claimant says in the chat changes any entitlement.

## Q5 Model path under DR-179

DR-179 (`decisions-ledger.md:1429-1431`): model access exclusively through V's authenticated
CLI subscriptions wrapped as local relays; no key material anywhere until V lifts it.

| Dimension | (a) Relay-only — phase 1 | (b) Key-based — designed, not built (needs row V-2 = b) |
|---|---|---|
| Mechanism | One CLI child per call (`acceptance/relay-core.ts:122`), stdin closed (`:131`), loopback HTTP on `127.0.0.1` (`:361`), per-process bearer (`:324`), scrubbed child env (`:67-80`); Claude relay args pinned (`acceptance/claude-relay.ts:129-136`); binary paths hard-coded to V's user (`acceptance/claude-relay.ts:27`, `acceptance/grok-relay.ts:12`, `acceptance/model-shim.ts:15`) | HTTPS to a provider API from the support adapter only; key read by the register loader (`packages/register/src/runtime-environment.ts:13`; rule `tools/orphan-audit/src/index.ts:455`) from a secret FILE in the custody root, never from the process environment — because the relays pass `ANTHROPIC_API_KEY`/`XAI_API_KEY`/`OPENAI_API_KEY` through to the CLIs if set (`acceptance/claude-relay.ts:119`), an env var would silently change the debate engine too |
| Latency | UNVERIFIED for short prompts. Only measurement in the repo: ~50 s for one deep judge call (`decisions-ledger.md:1292-1293`); per-call deadline 180 000 ms (`apps/runner/src/dev-provider-panel.ts:10`); the CLI's own system prompt is billed per call (Grok: 14 577 input tokens for a 44-token reply, `docs/missions/2026-08-06-v3-programming/reviews/grok01-opus-rev1.md:382`) | UNVERIFIED — no measurement in the repo; vendor figures not cited |
| Concurrency | Unbounded spawn, no queue or semaphore in `relay-core`/`claude-relay`/`grok-relay`; practical ceiling = what V's Mac survives; the support module imposes its own cap (2) and queue | Provider rate limits (UNVERIFIED numbers); scales server-side |
| Cost per conversation | Subscription-billed; Claude cost field optional (`acceptance/claude-relay.ts:47`); Codex unmetered (`acceptance/model-shim.ts:138`); Grok handshake measured $0.030 (`docs/missions/2026-08-06-v3-programming/handoffs/GROK-01-codex-handoff.md:144`) → a 6-turn conversation on Grok ≈ $0.18 — UNVERIFIED extrapolation | Reference: grok-4.6 HTTP at $2/$6 per 1M in/out (`docs/missions/2026-08-21-observability-loop/research/grok-requirements.md:260`); a 6-turn conversation ≈ 12k in / 1.2k out ≈ $0.03 — UNVERIFIED extrapolation; Claude/OpenAI prices not cited |
| Availability | Only while V's machine is up and the CLI signed in; an expired OAuth is a loud failure (`acceptance/claude-relay.test.ts:248`); a 03:00 question is unanswered (row V-2's own example) | Provider SLA (UNVERIFIED); independent of V's laptop |
| Secrets governance | None — no key exists; child env scrubbed | New: key custody file, rotation, leak monitoring, the `audit:source` exemption question (row V-6), processor terms for user text (the 2026-08-17 synthesis promotes provider retention to blocking for Bot B; Bot A handles no secrets and may ship under ordinary terms) |

**Recommendation.** VERDICT: (a) relay-only for phase 1, with SUP-01 measuring and printing
the latency percentiles and the availability window so row V-2 is re-presented to V with
numbers, not adjectives. CONFIDENCE: high that (a) is lawful and buildable now; low that (a)
meets the Q1 latency targets. STRONGEST COUNTER: a support chatbot that answers only while
V's laptop is awake is not "the best possible customer support chatbot"; the honest reply is
that (b) is a V-only law change, and the numbers SUP-01 produces are the evidence V needs to
make it. **What changes if V lifts DR-179 for the support bot only:** a `SupportModelPort`
with two adapters; the key lives in `secrets/support-provider-key.bin` read through the
register loader; Bot A's transcripts (already free of secrets and debate content) may go to
the provider; the eval set runs against both adapters; the daily cap becomes a dollar cap.

## Q6 Vertical slices

| Code | Name | V acceptance in one line | Parallel-safe with |
|---|---|---|---|
| SUP-01 | Grounded help on `/help` (anonymous, eval-gated) | Open `https://localhost:3000/help` in a private window; ask "How do I publish a debate?" → grounded answer with a `Source:` line within 8 s; ask "reset my password" → refusal + `/settings` link; paste an injection → refusal and one `support.abuse_event` row; `pnpm support:eval --runs 3` → worst run PASS | none of SUP-02…07 (they depend on it); cross-product: migration number allocation |
| SUP-02 | Escalation to V: case, summary, terminal inbox, replies | Click "Talk to a human" → case token; `pnpm support:inbox` lists it within 60 s with the verbatim transcript and an advisory summary; `pnpm support:reply` → the reply appears at `/help?case=<token>` | SUP-03, 04, 05, 06, 07 |
| SUP-03 | Signed-in own-debate context with consent (metadata only) | Sign in with the QA identity; toggle consent; ask "What is the status of this debate?" → state, visibility, last event + `Source: your debate …`; ask about another run id → identical refusal | SUP-02, 04, 05, 06, 07 |
| SUP-04 | The assistant on product routes, never on zone routes | "Help" button on `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`; none on `/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`, `/settings`; the widget continues the same conversation on `/help` | SUP-02, 03, 05, 06, 07; OVERLAPS ui-overhaul on `apps/ui/app/page.tsx` (merge-time) |
| SUP-05 | Known-incident awareness from a V-published source | `pnpm support:incident publish …` → "Is anything broken?" answers with V's exact text in ro/en; `resolve` → the NO_INCIDENT text | SUP-02, 03, 04, 06, 07; interface diffed by REQ-SYNTH against the ObservationAgent |
| SUP-06 | Abuse controls, spend caps, queueing, degraded mode | `pnpm support:limits set …` then exceed a limit → 429 text; two concurrent windows → QUEUED then answer; unreachable relay → DEGRADED within 1 s and `pnpm support:status` shows it | SUP-02, 03, 04, 05, 07 |
| SUP-07 | Crypto-shredding and retention controls | `pnpm support:shred --owner <ref>` → rows remain, content unreadable, `[SHREDDED]` in the console, audit row written; retention stays `keep` unless V ratifies | SUP-02, 03, 04, 05, 06 |

Slice files: `docs/missions/observability-agents/slices/SUP-0{1..7}/{SPEC,PLAN,PROGRESS,DECISIONS}.md`
(SPEC frozen; PLAN scaffold; PROGRESS empty; DECISIONS seeded). Requirement counts:
SUP-01 18 · SUP-02 10 · SUP-03 8 · SUP-04 6 · SUP-05 6 · SUP-06 8 · SUP-07 6 = 62; PLAN trace
rows equal per slice. Shared append-only surfaces across SUP slices: `apps/api/src/index.ts`
(policy rows), `packages/contract/src/index.ts` (route entries), `package.json` (scripts).

## Q7 Contested decisions for V

Rows V-1…V-6 already on the V packet are not repeated; V-2 and V-4 are specified both ways
above (Q5, Q4).

| Id | Plain-words question | Options | Pick | Confidence | Strongest counter |
|---|---|---|---|---|---|
| SUP-D1 | Where do you read support cases in phase 1? | (a) terminal inbox + SQL view · (b) admin web page (needs an operator sign-in path — zone) · (c) Kanban ticket mirror · (d) daily digest file | (a) | high | You live in the browser and the board; a terminal inbox risks unnoticed cases — mitigated only if the ObservationAgent's notification channel is pointed at `support.inbox` |
| SUP-D2 | May the assistant see anything of a debate beyond its status metadata? | (a) metadata only · (b) also the question text · (c) also node claims and answers | (a) | high | "Why was my argument about X marked CONTESTED" cannot be answered; the assistant can only deep-link to the node in the owner UI |
| SUP-D3 | First route: a new `/help` page, or the widget on `/`? | (a) `/help` first · (b) widget on `/` first | (a) | high | Nobody finds `/help` without a link; the link's placement on the landing is a ui-overhaul decision |
| SUP-D4 | Retention: keep forever with V-gated shredding (DR-188), or the 30/90-day windows the 2026-08-17 research proposed? | (a) keep + shred on request · (b) 30-day anonymous / 90-day case windows · (c) counsel decides | (a) | medium | Data minimisation and GDPR storage limitation point to (b); the 2026-08-17 report already flagged this as its one genuinely new conflict (D10) |
| SUP-D5 | Who triggers the support shred when an account is erased? | (a) you run `pnpm support:shred --owner` manually per erasure · (b) wire the call into the erasure flow (zone change, V-only) | (a) for phase 1 | medium | A manual step will be forgotten; (b) is one line but inside the zone |
| SUP-D6 | Eval gate threshold | (a) structural 100 % + rubric ≥ 95 % with 0 fabrication and 0 failures in zone/injection classes · (b) 100 % on everything | (a) | medium | Nondeterministic wording makes 100 % rubric brittle and invites test-fitting; but 95 % tolerates three wrong tones per release |
| SUP-D7 | Which relay member serves the assistant? | (a) `development:claude-cli` (alias `opus`, itself unratified: `acceptance/claude-relay.ts:39`) · (b) `development:grok-cli` · (c) `development:codex-cli` (unmetered) | (a) | medium | Quota walls already forced the alias choice for the engine; a cheaper member may be enough for corpus Q&A — measure with the eval set |
| SUP-D8 | Language policy | (a) ro + en first-class in the assistant even though the UI is English-only (`apps/ui/app/layout.tsx:34`) · (b) en only until the UI is bilingual | (a) | high | A bilingual assistant inside an English UI is inconsistent; the fix belongs to the UI, not to the assistant |
| SUP-D9 | Kill switch default | (a) off in production until you flip it (dev seed on) · (b) on | (a) | high | none of weight — consistent with "in charge of everything" |
| SUP-D10 | What counts as a known incident? | (a) only rows you publish (`support.public_incident`) · (b) automatic from `obs.incident` above a severity | (a) | high | (b) is faster; it violates approval-first and lets a false alarm reach users |
| SUP-D11 | Who authors the Help Corpus and the eval set? | (a) two independent Fable 5.1 seats, you ratify · (b) you write both · (c) the coder | (a) | high | (a) costs two seats before the first answer; (c) is the reviewer-of-own-homework defect |

## Ranked recommendations

1. Ship SUP-01 as the first proof and make its printed latency/availability numbers the
   evidence for row V-2. VERDICT adopt / CONFIDENCE high / STRONGEST COUNTER: the relay may
   miss every latency target, making the first proof a proof of the wrong thing — then the
   numbers are still the deliverable.
2. Keep the deny-list structural: no mutating tool, role grants on `support.*` only, subject
   from the session. VERDICT adopt / CONFIDENCE high / COUNTER: a bot that performs nothing
   deflects less — accepted; the corpus answers are where the volume is.
3. Refuse zone-adjacent intents before the model sees them. VERDICT adopt / high / COUNTER:
   keyword routing over-escalates ordinary questions ("how do I change my email?") — the
   cost is a refusal with the right link, which is the correct answer anyway.
4. Author the Help Corpus and the eval set with two independent Fable 5.1 seats before any
   coding seat starts. VERDICT adopt / high / COUNTER: two more seats and V's ratification
   time before the first answer — cheaper than a fabricated answer to a real user.
5. Terminal inbox as V's console. VERDICT adopt / high / COUNTER: SUP-D1.
6. Metadata-only own-context. VERDICT adopt / high / COUNTER: SUP-D2.
7. Register-row bounds with `pnpm support:limits` and a kill switch default off. VERDICT
   adopt / high / COUNTER: register rows are sealed by version — Architecture must name the
   lawful in-place path (the DR-188 register-versioning duty) or the seed path.
8. Crypto-shred, never delete; retention `keep` by default. VERDICT adopt / medium / COUNTER:
   SUP-D4.
9. Bot B stays design-only until staff, ladder, isolation and the egress ruling exist.
   VERDICT adopt / high / COUNTER: V designed it and wants it; the honest reading is that a
   leaky Bot B is worse than none (2026-08-17 synthesis §6.5).
10. Mount the widget per page and prove absence from zone routes by import graph. VERDICT
    adopt / high / COUNTER: per-page mounts duplicate one line four times — trivial.

## UNVERIFIED / gaps

- Relay latency percentiles for short prompts; cost per conversation on Claude/Codex;
  provider rate limits and SLAs for the key-based variant — no measurement in the repo.
- Deflection and resolution baselines — zero users today; targets are judgement.
- Whether an architecture test asserts equality between the contract route inventory
  (`packages/contract/src/index.ts:641`) and the API policy inventory — the two lists are
  hand-maintained; if such a test exists, every SUP slice adding a route edits both.
- The lawful in-place path to change a sealed register row without a datadir swap
  (DR-188 elevated it to mandatory; status unknown to this seat) — Architecture names it.
- Exact wording of the 2026-08-17 EU AI Act Art. 50 finding (AI disclosure duty) —
  UNVERIFIED — counsel, as the synthesis itself marks it; the disclosure is required here
  regardless.
- `audit:source` violator count: the V packet says five files, a child sweep counted three
  — neither number is used here.
- Whether `docs/missions/ui-overhaul/design/design-document-text.txt` contains real pricing
  numbers for the landing placeholders — not read.
- Romanian copy in the SPECs was written by this seat and not reviewed by a native speaker.

## Resolved tensions inside the packet (both sides quoted)

1. Packet Q2: "the user's OWN debates and runs with the user's consent" vs COMMON §3: "no
   private debate content … in any ops or support surface". Resolution: metadata-only
   projection (SUP-03-R03); content is never a source. No contradiction remains.
2. Packet Q3 offers "an inbox: board ticket, admin page, or digest" vs COMMON §3 zone
   (sessions/step-up) and the measured absence of any operator authentication path
   (`apps/api/src/index.ts:432`). Resolution: terminal inbox in phase 1; the admin page is
   a later phase after V rules on operator auth.
3. Packet Q6 example "open `/` as an anonymous visitor" vs COMMON's ownership of the landing
   files by ui-overhaul. Resolution: SUP-01 on `/help`; SUP-04 mounts on `/` with the
   overlap disclosed for merge time.
