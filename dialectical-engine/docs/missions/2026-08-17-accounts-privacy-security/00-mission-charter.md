# Mission Charter — Individual Accounts, Privacy-by-Design, and Secure Operations

**Status:** ACTIVE (Wave 1 running, 2026-08-17)
**In-scope tree:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` — the TypeScript engine (Fastify API, embedded Postgres, Next.js UI, CLI relays). **This is the product.**
**Out of scope:** everything outside this tree.

> **Provenance note.** This charter descends from `00-mission-launch-prompt.md`
> (V, 2026-08-17), preserved verbatim under `archive-python-tree/`. That launch
> prompt targeted the now-deleted Python/FastAPI app. **Every law, catalog item,
> and blocking question below is carried over unchanged; only the stack and
> scope sections are rewritten** for the real target. The Wave 1 artifact
> produced against the Python tree is archived as historical reference — its
> *findings* are obsolete, its *method and question set* are not.
>
> **Naming law (V, 2026-08-17):** there is no "V2" and no "V3". The product is
> **dialectical-engine**.

---

## 1. Role and posture

Act as a senior security architect, privacy engineer, and technical program planner.

You are not legal counsel. Identify every point requiring review by qualified Romanian/EU privacy counsel. Do not present legal interpretations as guaranteed compliance.

Write for two audiences at once: engineers who must implement the next approved slice without guessing, and security/privacy/legal reviewers who must see evidence, owners, residual risk, and counsel flags.

Prefer the smallest design that closes the stated risks. The capability catalog is the program of record, not a mandate to build every control in the first implementation.

**V's standing posture (2026-08-17, verbatim):** *"All I want is to have a secure application. only MY application. No Pen testing, no cybersecurity attack on anyone. Just our app."* This mission is **defensive-only**: it hardens this product on V's own machine. Adversarial injection tests are **design-only artifacts** until V greenlights them per phase; they are self-tests of this app, never actions against any third party.

---

## 2. Scope lock

### Product under study

**dialectical-engine** — a local-first, multi-model AI debate harness:

- **Fastify API** (`apps/api`) — ask admission, answer/inspection/ledger projections, live run events
- **Runner** (`apps/runner`) — the debate algorithm: panel discovery, independent roots, cross-house review, tree expansion, judging, propagation, serve-gate composition
- **Embedded PostgreSQL** — schemas `core`, `ledger`, `serve`, `register`, `scorecard`, `memory`, `evidence`, `evaluator`
- **Next.js UI** (`apps/ui`) — ask surface, debate reading surface, admin/worker views
- **CLI relays** (`acceptance/`) — model access exclusively through locally installed, user-authenticated CLIs (**DR-179: no API keys**), each spawned in an empty scratch directory with a contained environment (**CONT-01, V's security law 2026-08-17**)
- **Register + ledger culture** — every operational constant is a ruled, append-only register row with provenance; every model call is receipted twice (raw artifact + ledger entry)

**Current identity model — corrected by S1 evidence, and deliberate.** There is no authentication today: `resolveSession` (`apps/api/src/index.ts:113-123`) accepts **any non-empty string** and derives an identity namespace from its SHA-256 digest; nothing is compared against a stored secret, because no secret exists. This is **provisional by design** — the contract itself mandates `provisional_identity_model: z.literal(true)` (`packages/contract/src/index.ts:149-155`).

**V's recorded rationale (2026-08-17):** *"We had no authentication due to how we needed to first build the algorithm. Now we add the authentication."* Identity was deferred deliberately so the debate algorithm could be built and proven first. This mission is that deferred work arriving on schedule — **not remediation of an oversight**.

What this means for the design: the **tenancy seam already exists and is proven**. Every owned resource filters on `core.run.asker_id` in SQL, with integration tests against real Postgres showing a foreign asker receives 404 (`tests/integration/database.test.ts:617-651`, `acceptance/ceremony.test.ts:475-480`). The work is to put a real, verifiable principal behind that column — not to invent ownership from scratch. Treat registration, sessions, ownership, authorization, privacy controls, and migration of existing runs as a foundational change, but one landing on prepared ground.

### Inspect before you claim

Verify every current-state sentence against the live tree. Cite file and line, and where relevant the endpoint, table, register row, env var, or test. **Starting facts are leads, not evidence.**

| Lead | Where to look first |
|---|---|
| Shared dev token, no accounts | `apps/api/src/index.ts` session/auth handling; `SESSION_REQUIRED` |
| Personal data locations | `packages/db/src/schema.ts` (8 schemas, ~50 tables); `core.run`, `serve.answer`, `ledger.raw_artifact` |
| Register as the law surface | `packages/register/src/index.ts`; `register.register_row`; `core.reject_mutation()` trigger |
| Relay containment already shipped | `acceptance/relay-core.ts` (scratch cwd + env), `acceptance/model-shim.ts` (codex flags) |
| Data-preservation law | DR-188 in `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` |
| Client storage / UI surface | `apps/ui/` — routes, token handling, any storage keys |
| Test corpus | `tests/`, `acceptance/*.test.ts` — ~730 root tests |

Extend those systems. Do not invent a parallel auth, logging, or identity stack beside them. **Auth events must land in the existing ledger; auth constants must become ruled register rows.**

### Explicit non-goals

- No product code, no applied migrations, no dependency changes during planning waves.
- No claim that a control makes the product "GDPR compliant", "prompt-injection proof", or "end-to-end encrypted".
- No secrets, personal data, TOTP seeds, session tokens, model prompts, or provider payloads in logs or planning examples.
- No offensive security work of any kind against anyone.

---

## 3. Operating laws

These beat completeness. If a law and a catalog item conflict, follow the law and record the item as deferred, substituted, or counsel-gated.

1. **Inspect the repository before architectural claims.** Cite files and endpoints for every current-state finding. If the tree cannot be inspected, stop.
2. **Smallest sufficient design wins.** Kitchen-sink controls (external KMS, JIT production access, eight staff roles, full privacy centre) are options, required only when evidence plus V's answers show the product needs them now.
3. **Classify every control** as exactly one of: legal requirement; security requirement; recommended risk reduction; product decision; optional future enhancement.
4. **Hard-stop on blocking questions.** Produce a wave, then stop. Never design a target architecture on guessed answers. Blocked branches stay marked `BLOCKED` with alternatives, never a fake chosen design.
5. **Primary sources or UNVERIFIED.** For legal/standards claims, fetch the current primary source (GDPR/EUR-Lex, EDPB, Romanian ANSPDCP, Law 190/2018, ePrivacy, DSA if public hosting applies, ENISA, NIST, OWASP ASVS/API/GenAI). Record URL, retrieval date, short quote. Otherwise mark `UNVERIFIED — counsel`. Never cite training memory as EUR-Lex.
6. **No compliance theater.** No "SCC certified". Pseudonymised ≠ anonymous. No "end-to-end encryption" for content the server or an LLM must process in plaintext. Consent is not the default lawful basis.
7. **DSAR is not DSA.** Distinct regimes, distinct counsel items.
8. **Record assumptions explicitly.** Ask only questions whose answers change the architecture or legal analysis.
9. **Preserve existing debate functionality.** Call out every compatibility risk, including the shared-token migration and the pinned-panel/register/ledger contracts.
10. **Deny-by-default authorization.** UI hiding is not authorization. Object-level authorization tests against IDOR/BOLA are required for every object that will have an owner or visibility state.
11. **Containment over prevention promises.** Show that successful instruction manipulation still cannot reach secrets, the database, privileged tools, or another user's data.
12. **No checklist fill.** A thin section is a failure. Missing evidence → `UNKNOWN`, the search performed, and the blocker. Never invent file paths, vendors, lawful bases, or transfer mechanisms.
13. **Register-and-ledger discipline (this tree's own law).** New security constants become **ruled register rows with provenance**; new security-relevant actions become **ledger-receipted events**. Auth must not become the one subsystem that governs itself by hard-coded values.

---

## 4. Objective

An implementation-ready, evidence-based plan for: secure individual accounts; privacy-by-design; auditable administration; safe public debate; GDPR operations appropriate to the actual operator and launch shape; international transfers for vendors actually used; and isolation of LLM execution.

Every catalog requirement maps to one or more of: a control in the chosen design, a smaller substitute, an explicit deferral with residual risk, a product decision, or a counsel-review item — each with tests, evidence artifacts, an owner role, and residual risk.

---

## 5. Execution waves

**Wave 1 — Inventory, threat model, and decisions.** Executive summary and highest-risk findings; current-state architecture and trust boundaries; cited repository findings; data-flow diagram; draft data inventory (ROPA rows only where evidenced); threat model (users, administrators, workers/relays, model providers, database operators, attackers, insiders, compromised dependencies); gap analysis (current → risk → target → evidence, distinguishing required-now from required-if-public); decisions and clarifying questions that block architecture. **Then stop.**
→ `wave-1-current-state.md`

**Wave 2 — Target architecture and specifications.** Opens only after V's answers. Target architecture with alternatives; authentication/session/MFA/recovery/lifecycle spec; RBAC and object-ownership matrix; encryption and key management (data-classification driven); database-access and audit architecture; LLM isolation and injection containment; public debate/pseudonymity/moderation/deletion semantics; privacy centre and DSAR workflow; cookie/storage inventory and consent; vendor/DPA/SCC/transfer matrix; retention and deletion propagation; incident response and breach notification; counsel review list; residual-risk register.
→ `wave-2-target-architecture.md`

**Wave 3 — Phase 1 implementation roadmap.** Opens only after Wave 2 is accepted. Phased roadmap; Phase-1 test strategy and traceability matrix; migration, rollback, and operational runbook requirements. Detailed vertical slices **only for Phase 1**; later phases get a short charter.
→ `wave-3-phase-1-plan.md`

---

## 6. Capability catalog

Carried over verbatim in substance from the launch prompt (`archive-python-tree/00-mission-launch-prompt.md` §6), which remains the authoritative long form. Summarised headings:

- **A. Identity and account security** — registration/login, verified email, immutable internal user IDs, system-generated pseudonyms, memory-hard password hashing, authenticator-app TOTP, hashed one-time recovery codes, enrolment confirmation, reset/recovery threat analysis, rate limiting and credential-stuffing protection, enumeration resistance, full session lifecycle, HttpOnly cookies over localStorage bearers, CSRF appropriate to the session architecture, change confirmations, security notifications, phishing-resistant MFA for admins where feasible, **no security questions**. TOTP-vs-WebAuthn comparison for privileged accounts is **required**; choosing WebAuthn is not.
- **B. Authorization and ownership** — role set (anonymous, registered user, moderator, support/privacy operator, security auditor, database operator, administrator, worker/service identity), collapsed to what exists at launch with a documented growth path; per-object authorization for viewing/creating/publishing/regenerating/deleting/exporting/DSAR/user-management/audit-viewing/model-and-worker-config/production-data; deny-by-default server-side; IDOR/BOLA tests. Reuse and harden existing service identity.
- **C. Public debates and pseudonyms** — private by default (**V ruled: yes**), affirmative publish action with indexing warning, pseudonyms that never expose email/internal id/auth identifiers, separately protected pseudonym↔account mapping, pseudonym scope decision, account-deletion semantics for public content, redaction/tombstoning, moderation/reporting/blocking/appeals if public, handling for doxxing, third-party and special-category data, illegal material, harassment, minors. Pseudonymised data is **personal data**.
- **D. Encryption and key management** — data-classification driven: TLS in transit including internal connections; encryption at rest for database, volumes, object storage, backups; field-level envelope encryption for selected attributes; encrypted TOTP seeds; password and recovery-code hashing; key hierarchy and separation; key custody; rotation and version migration; key backup and DR; revocation and compromise response; separation of data and keys; secret scanning; prohibition on secrets in source control, images, logs, prompts, model payloads, client bundles. Identify which fields need application-level encryption versus hashing, tokenisation, minimisation, or not collecting.
- **E. Database and privileged access** — replaces any vague "database three-factor" idea with: separate service and human identities; no shared credentials; least-privilege roles; SSO and phishing-resistant MFA for human production access; short-lived credentials; network isolation; just-in-time privileged access; approval for high-impact operations; break-glass with alerting and mandatory review; rotation and revocation; read-only where possible; separation of duties; access reviews. Tamper-evident audit logging capturing actor and identity type, session/request correlation id, action, target resource type and id, UTC timestamp, source context, authorization decision, success/failure, and privileged-access justification — **never** passwords, tokens, TOTP seeds, raw prompts, debate text, provider payloads, or unnecessary personal data. Define retention, access, integrity protection, off-system replication, alerting, review cadence, and deletion/legal-hold policy.
- **F. LLM and prompt-injection security** — all user input, debate content, retrieved content, model outputs, and provider responses are untrusted data. Target invariants: no model or subprocess has database credentials or application secrets; no model can issue arbitrary queries; no subprocess inherits the full application environment; models receive only minimum per-job data; model output cannot directly execute tools, SQL, shell, templates, HTML, or administrative operations; future tools are allowlisted, schema-validated, user-authorized, least-privileged, separately mediated; providers receive only documented fields after required disclosure; provider training/retention/region/subprocessor settings documented. Design process isolation, environment allowlists, filesystem isolation, outbound allowlists, structured prompts separating instructions from data, size/encoding validation, sanitisation, output schema validation, URL/citation validation, rate and resource limits, monitoring, kill switches, and an adversarial test corpus (**design-only until V greenlights**). Show blast radius after successful injection, not a promise it cannot occur. **Note: CONT-01 already shipped process-level containment for relay CLIs — extend it, do not duplicate it.**
- **G. Privacy and GDPR operations** — draft data inventory and ROPA per evidenced processing activity (purpose, controller/processor role, data-subject categories, data categories and sensitivity, source, lawful-basis candidate requiring validation, systems and locations, recipients and subprocessors, transfers and mechanism, retention and deletion, safeguards, owner, DPIA/LIA/DPA/SCC/TIA references). Consent is not the default basis. User-facing privacy centre (account/profile data, security info in safe form, debates, consent history, active sessions, connected services, export, correction, deletion, restriction/objection, contact and complaint routes). Operational DSAR workflow for access, rectification, erasure, restriction, objection, portability — proportional identity verification, receipt and deadline tracking, one-month default with documented extension, exception and legal-hold review, search across databases/logs/caches/backups/analytics/support/providers, machine-readable export, deletion evidence, processor notification, dual-control for high-risk disclosure or an explicit single-operator residual risk, audit trail that does not duplicate unnecessary personal data. Single-operator deployments may size this as an operator runbook plus a minimal user export/delete path.
- **H. Cookies and consent** — inventory every cookie, storage item, SDK, analytics request, and client-side mechanism; classify strictly-necessary/preferences/analytics/marketing; block non-essential storage and calls until valid consent; accept/reject/granular with equal prominence; record consent version, categories, timestamp, withdrawal; withdrawal as easy as acceptance. **If only essential storage exists, recommend an informational notice, not a deceptive banner.**
- **I. International transfers and vendors** — register of hosting, email, analytics, monitoring, backups, support, and every model provider actually used: entity and role, data received, purpose, region, subprocessors, retention, training use, DPA availability, adequacy/DPF/SCC module or other mechanism, TIA need, incident-notification commitments, DSAR and deletion support. Determine separately whether a DPO or EU representative is legally required — do not assume either.
- **J. Operations and assurance** — retention and deletion policy; privacy notice; terms and acceptable use; DPIA screening and draft DPIA if indicated; incident-response plan; breach assessment and notification workflow; backup restoration tests; DR objectives; access-review schedule; vulnerability management; dependency and container scanning; SAST/DAST/secret/IaC scanning; penetration-test scope (**V's own product only, on V's authorization**); OWASP ASVS/API acceptance criteria; LLM red-team plan (**design-only until greenlit**); security headers, CSP, CORS, CSRF, SSRF, injection, upload, deserialisation defenses; monitoring and alerting without sensitive payload collection.

---

## 7. Slice contract

Each implementation slice (Wave 3+) includes: goal and risk addressed; exact affected components and likely files (evidenced in this tree — never invented); schema and migration changes; API and UI changes; dependencies; failure and rollback behavior; unit, integration, end-to-end, security, and migration tests; measurable acceptance criteria; audit/compliance evidence produced; observability without sensitive logging; deployment and rollback instructions; unresolved legal or product decisions; estimate as relative size, not a calendar promise.

---

## 8. Phase order

| Phase | Purpose |
|---|---|
| 0 | Inventory, threat model, legal decisions, data classification, DPIA screening, architecture decisions |
| 1 | Individual identities, secure sessions, ownership model, private/public visibility, migration off the shared dev token |
| 2 | MFA, recovery, administrative identities, RBAC, object-level authorization |
| 3 | Database hardening, encryption/key management, audit system, secrets isolation, backup controls |
| 4 | LLM process isolation extension, minimal prompt payloads, provider controls, injection containment, adversarial tests (greenlit per phase). May parallel Phase 2 once ownership exists. |
| 5 | Privacy centre, consent, ROPA operations, retention automation, DSAR export/deletion/redaction, processor propagation |
| 6 | Public participation, pseudonyms, moderation, abuse controls, public-content deletion semantics |
| 7 | Assurance, own-product penetration testing, incident exercises, production readiness, legal review |

**Design-order constraint:** visibility defaults and account-deletion semantics must be defined in Wave 2 *before* Phase 5 erasure is specified, or the privacy centre gets rewritten.

---

## 9. Control-mapping rule

```text
Item: <catalog id and name>
Class: legal | security | recommended | product | optional
Launch fate: implement | substitute | defer | counsel-gate | not-applicable
Substitute or deferral reason: <one or two sentences>
Evidence: <file, source URL, or UNVERIFIED>
Owner role: <role that will exist at launch>
Residual risk: <what remains if this fate is chosen>
```

A catalog item may be deferred. It may not disappear.

---

## 10. Questions that block architecture

### ANSWERED by V (2026-08-17) — binding

| # | Question | V's ruling |
|---|---|---|
| **Q4** | Debates private or public by default? | **Private by default.** Publishing is a deliberate act with a warning that content becomes publicly accessible and may be indexed. |
| **Q12** | What happens to public debates after account deletion? | **Crypto-shredding, with amendment: public debates REMAIN on the app; a user may delete their own PRIVATE debates whenever they wish.** Erasure of personal data = destroy the user's key / sever identity, not destroy the public record. Reconciles DR-188 with erasure rights. `UNVERIFIED — counsel` on sufficiency. |
| **Q19** | Launch shape? | **Private hosted → public later.** Registration-gated hosted service first; public-participation machinery designed now, built in a later phase. |
| **MFA channel** | How is user-side 2FA delivered? | **WhatsApp** (V steer, 2026-08-17: *"2FA user side must be done via what's app"*). Binding for the **user-facing** factor. Wave 2 must design it and resolve the four collisions below; administrator MFA remains a separate comparison (catalog A). |

### ⚠ The WhatsApp-2FA ruling creates four collisions Wave 2 must resolve (flagged, not decided)

V's steer is binding. But it collides with four of V's *own* standing laws, so Wave 2 must present the smallest lawful design plus alternatives, and V rules again on each:

1. **vs. data minimisation (V's own mission requirement: "only work with user data that is truly needed").** WhatsApp 2FA requires collecting and storing a **phone number** — a strongly identifying, often cross-service-linkable identifier, arguably more sensitive than email. TOTP requires **no new personal data at all**. Wave 2 must justify the phone number's necessity per purpose, or minimise it (e.g. store only a hash + last digits, never in logs/exports).
2. **vs. DR-179 (no API keys).** There is no keyless path to WhatsApp: the WhatsApp Business Platform (Meta Cloud API) or any Business Solution Provider requires a long-lived API token/credential held by the server. `UNVERIFIED — vendor docs must be fetched in Wave 2.` Either DR-179 gains an explicit carve-out for the messaging channel, or the design cannot be built as ruled.
3. **vs. GDPR transfers and the vendor-register law.** WhatsApp is **Meta** — a US-headquartered processor. Phone numbers plus message metadata leave the system to Meta and any BSP (Twilio/360dialog/etc.). This mandates a DPA, an adequacy/DPF/SCC determination, and a transfer impact assessment. `UNVERIFIED — counsel.` It also makes the service dependent on a vendor for **login**, which is an availability risk the local-first architecture has so far avoided.
4. **vs. authentication strength.** Messaging-channel one-time codes are materially weaker than authenticator-app TOTP or WebAuthn: they are **phishable in real time** (a relay page simply asks the victim for the code), and they inherit **WhatsApp-account-takeover risk**. Standards bodies (NIST SP 800-63B on out-of-band authenticators) treat messaging channels as restricted; `UNVERIFIED — primary source must be fetched in Wave 2.`

**Orchestrator's recommended shape for Wave 2 to evaluate (not a decision):** WhatsApp as the *default user-facing* factor V asked for, **plus** an authenticator-app TOTP option any user may enrol instead (zero extra personal data, works offline, immune to vendor outage), **plus** hashed one-time recovery codes for both. Administrator accounts compared separately per catalog A. This honours the steer while keeping a keyless, vendor-free path alive for users who want it — and keeps login working if Meta's API is down.
| **Q20** | Scope | **dialectical-engine only.** |
| — | Security posture | **Defensive-only, V's own product. No pen-testing of anyone else.** |

### OPEN — blocking Wave 2

1. **Q1** — Which legal entity will operate the service?
2. **Q2** — Which countries served at launch?
3. **Q3** — Are minors allowed?
4. **Q5** — May users submit personal or special-category data in debate questions? (questions flow to model providers)
5. **Q6** — Which model providers enabled at launch? *(evidenced today: Anthropic, OpenAI, xAI via local CLIs)*
6. **Q7** — Are provider requests retained or used for training? (per provider)
7. **Q8** — Will email delivery (verification, security notices) use an external vendor?
8. **Q9** — Authentication self-built into the API, self-hosted IdP, or hosted IdP? **(V explicitly held this open)**
9. **Q10** — Production database and hosting platform? *(today: embedded Postgres on V's machine)*
10. **Q11** — Where will production data, backups, logs, and keys live?
11. **Q13** — Must a pseudonym stay stable across all public debates, or rotate/per-debate?
12. **Q14** — Any analytics or marketing technologies planned?
13. **Q15** — Acceptable recovery if a user loses both TOTP and recovery codes?
14. **Q16** — Which staff roles will have production access? *(today: one operator)*
15. **Q17** — What retention periods does the business actually need?
16. **Q18** — Consumer-facing, enterprise-facing, or both?

---

## 11. Quality bar

Implementable by engineers, reviewable by security, privacy, and legal specialists. Every requirement maps to controls, tests, evidence artifacts, owners, and residual risks. Unknowns stay unknown.

Forbidden unless the precise technical or legal meaning is demonstrated in the same paragraph: *GDPR compliant · prompt-injection proof · end-to-end encrypted · SCC certified/compliant · anonymous (when only pseudonymised)*.

If a wave is thin, later waves cannot repair it by sounding complete. Redo the wave.
