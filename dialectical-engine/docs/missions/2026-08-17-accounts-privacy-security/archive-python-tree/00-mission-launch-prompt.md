# Mission Launch Prompt — Individual Accounts, Privacy-by-Design, and Secure Operations

**Status:** READY TO LAUNCH  
**Opened:** 2026-08-17  
**Mode:** Planning only. Do not implement product code.  
**In-scope tree:** `/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine`  
**Out of scope unless a later human ruling says otherwise:** `DebateAI-V3`, other DebateAIRO apps, and all worktrees.

This file is the mission. Give the entire file to the planning agent. Do not paste a section. Do not start implementation from this file.

---

## 1. Role and posture

Act as a senior security architect, privacy engineer, and technical program planner.

You are not legal counsel. Identify every point that requires review by qualified Romanian/EU privacy counsel. Do not present legal interpretations as guaranteed compliance.

Write for two audiences at once:

- engineers who must implement the next approved slice without guessing;
- security, privacy, and legal reviewers who must see evidence, owners, residual risk, and counsel flags.

Prefer the smallest design that closes the stated risks. The capability catalog below is the program of record, not a mandate to build every control in the first implementation.

---

## 2. Scope lock

### Product under study

Dialectical Engine is a local-first, multi-model debate platform in this tree:

- FastAPI coordinator
- SQLAlchemy persistence, currently SQLite
- Next.js web application
- Distributed workers invoking local model CLIs and external model APIs
- Public debate list and detail pages
- Authenticated debate creation, settings, regeneration, and administration
- Persisted topics, claims, generated arguments, rendered prompts, evidence, synthesis, model metadata, worker metadata, configuration, and operational records

The existing human auth path uses a shared bearer token stored in browser `localStorage`. It does not yet have individual user accounts. Treat registration, sessions, ownership, authorization, privacy controls, and migration of existing debates as a foundational architectural change, not an isolated UI feature.

### Inspect before you claim

Verify every current-state sentence against the live tree. Cite the file and, where relevant, the endpoint, table, env var, or test. Starting facts below are leads, not evidence.

Leads to verify, not copy:

| Lead | Where to look first |
|---|---|
| Shared browser bearer | `web/` localStorage key `dialectical:userToken`; coordinator auth helpers; `scripts/acceptance_check.py` |
| No individual user accounts | coordinator models, migrations, auth dependencies |
| Worker identity already exists | `worker/app/main.py`; coordinator worker registration/heartbeat; `blocked_auth` |
| SQLite default | `DIALECTICAL_DATABASE_URL`; `~/.dialectical/db.sqlite3`; Alembic under `coordinator/migrations/` |
| Prompt/token log redaction already started | `web/lib/observability/logger.ts` and coordinator/worker logging |
| Hosting/transfer work already sketched | `Cloudflare_TODO.md`, `Romarg_TODO.md`, `deploy/` |
| Large existing test corpus | `coordinator/tests/`, `web/tests/`, `worker/tests/` |

Extend those systems. Do not invent a parallel auth, logging, or identity stack beside them.

### Explicit non-goals for this mission

- No product code, schema migrations applied to live data, or dependency changes.
- No planning or redesign of `DebateAI-V3`.
- No claim that a control makes the product “GDPR compliant,” “prompt-injection proof,” or “end-to-end encrypted.”
- No secrets, personal data, TOTP seeds, session tokens, model prompts, or provider payloads in logs or planning examples.

---

## 3. Operating laws

These laws beat completeness. If a law and a later catalog item conflict, follow the law and record the catalog item as deferred, substituted, or counsel-gated.

1. **Inspect the repository before architectural claims.** Cite files and endpoints for every current-state finding. If the tree cannot be inspected, stop.
2. **Smallest sufficient design wins.** Default to the least complex control that meets the stated risk. Kitchen-sink controls (external KMS, JIT production access, eight staff roles, full privacy centre, public moderation suite) are options. They become required only when Wave 1 evidence plus human answers show the product is a public multi-user service that needs them now.
3. **Classify every control** as exactly one of: legal requirement; security requirement; recommended risk reduction; product decision; optional future enhancement.
4. **Hard-stop on blocking questions.** Produce Wave 1, then stop. Do not design a target architecture on guessed answers. If a later wave is launched without answers, keep every blocked branch marked `BLOCKED` and give alternatives, not a fake chosen design.
5. **Primary sources or UNVERIFIED.** For legal or standards claims, fetch the current primary source (GDPR/EUR-Lex, European Commission, EDPB, Romanian ANSPDCP, Law 190/2018, ePrivacy/cookie rules, DSA if public hosting applies, ENISA, NIST, OWASP ASVS, OWASP API Security, OWASP GenAI/LLM). Record URL, retrieval date, and a short quote. If the source was not fetched, mark the claim `UNVERIFIED — counsel`. Do not cite training memory as EUR-Lex.
6. **No compliance theater.** Do not call the company “SCC certified” or generally “SCC compliant.” SCCs are contractual transfer safeguards for specific relationships. Do not call pseudonymised data anonymous. Do not use “end-to-end encryption” for content the server or an LLM must process in plaintext. Do not use consent as the default lawful basis for every activity.
7. **DSAR is not DSA.** A DSAR is a GDPR data-subject request. The Digital Services Act is a separate regime that may apply if the service hosts public user-generated debates, reporting, and appeals. Treat them as distinct counsel items.
8. **Record assumptions explicitly.** Ask only questions whose answers would change the architecture or legal analysis. The blocking-question list in §10 is mandatory; other questions need a one-line justification or they stay unasked.
9. **Preserve existing debate functionality.** Call out every compatibility risk, including the shared-token migration and existing worker identity.
10. **Deny-by-default authorization.** UI hiding is not an authorization control. Object-level authorization tests against IDOR/BOLA are required in the plan for every object that will have an owner or visibility state.
11. **Containment over prevention promises.** Do not promise prevention of all prompt injection. Show that successful instruction manipulation still cannot reach secrets, the database, privileged tools, or another user’s data.
12. **No checklist fill.** A thin section is a failure. If evidence is missing, write `UNKNOWN`, the search performed, and the blocker. Do not invent file paths, vendors, lawful bases, or transfer mechanisms.

---

## 4. Objective

Produce an implementation-ready, evidence-based plan for:

- secure individual accounts;
- privacy-by-design;
- auditable administration;
- safe public debate, only if Wave 1 shows public multi-user participation is in scope;
- GDPR operations appropriate to the actual operator and launch shape;
- international transfers for vendors that will actually be used;
- isolation of LLM execution.

The plan must be implementable by engineers and reviewable by security, privacy, and legal specialists. Every requirement in the catalog must map to one or more of: a control in the chosen design, a smaller substitute, an explicit deferral with residual risk, a product decision, or a counsel-review item. Each mapping needs tests, evidence artifacts, an owner role, and residual risk.

---

## 5. Execution waves

Run one wave per invocation unless the human explicitly opens the next wave and supplies the required inputs.

### Wave 1 — Inventory, threat model, and decisions (this launch)

**Goal:** establish what exists, what is dangerous, and what cannot be designed yet.

Produce, in this order, in one artifact:

1. Executive summary and highest-risk findings.
2. Current-state architecture and trust-boundary diagram.
3. Current-state repository findings with exact file references.
4. Data-flow diagram showing every place user content and metadata travel.
5. Draft data inventory. Full ROPA rows only where the operator, systems, and vendors are evidenced; otherwise mark fields `BLOCKED` or `UNVERIFIED — counsel`.
6. Threat model covering users, administrators, workers, model providers, database operators, attackers, insiders, and compromised dependencies.
7. Gap analysis: current state → risk → required target state → evidence. Distinguish required-now from required-if-public-multi-user.
8. Decisions and clarifying questions that block architecture. Include every question in §10, with any answer already evidenced from the repo, and every remaining answer left blank for the human.

Then stop.

**Wave 1 is complete when** the artifact exists, every current-state claim is cited or marked `UNKNOWN`, §10 is fully listed, and the last section is a human-answer packet rather than a chosen target architecture.

**Do not produce** target architecture, RBAC matrices, encryption specs, phased implementation slices, or vendor compliance conclusions in Wave 1 except as options attached to a blocking question.

Write Wave 1 to:

`docs/missions/2026-08-17-accounts-privacy-security/wave-1-current-state.md`

Keep it tight. Target: long enough to cite the real system, short enough that a human can answer the questions in one sitting. Prefer diagrams plus tables over essays.

### Wave 2 — Target architecture and specifications

Open only after the human returns the §10 answers, or explicitly authorizes named assumptions.

Produce:

9. Proposed target architecture with at least one alternative and trade-offs. The recommended option must be the smallest design that meets the answered risk profile.
10. Authentication, session, MFA, recovery, and account lifecycle specification.
11. RBAC and object-ownership permission matrix. Include only roles that will exist at launch plus a documented growth path. Do not staff eight roles on paper if one operator will exist.
12. Encryption and key-management specification, data-classification driven.
13. Database-access and audit architecture.
14. LLM isolation and prompt-injection containment architecture.
15. Public debate, pseudonymity, moderation, and deletion semantics — or an explicit “not in launch scope” design that still defines private-by-default and deletion so later privacy work does not get rewritten.
16. Privacy-centre and DSAR workflow sized to the answered operator model.
17. Cookie/storage inventory and consent approach.
18. Vendor, DPA, SCC/adequacy/DPF, and transfer-assessment matrix for vendors that are in use or chosen. No imaginary vendor rows.
19. Retention schedule and deletion propagation design.
20. Incident-response and breach-notification workflow.
24. Legal-counsel review list.
25. Residual-risk register.

Write Wave 2 to:

`docs/missions/2026-08-17-accounts-privacy-security/wave-2-target-architecture.md`

### Wave 3 — Phase 1 implementation roadmap only

Open only after Wave 2 is accepted.

Produce:

21. Phased implementation roadmap for the whole program, using the phase order in §8.
22. Test strategy and traceability matrix for Phase 1, with hooks for later phases.
23. Migration, rollback, and operational-runbook requirements for Phase 1, with later-phase notes only where they constrain Phase 1.

Write detailed vertical slices **only for Phase 1**. Later phases get a short charter: goal, risk, dependencies, and why they wait.

Write Wave 3 to:

`docs/missions/2026-08-17-accounts-privacy-security/wave-3-phase-1-plan.md`

Later waves, if opened, produce Phase 2+ slice packs the same way. Do not pre-write them.

---

## 6. Capability catalog

This is the program of record. Wave 2 must map every item. Wave 1 may only inventory and size it.

### A. Identity and account security

Design:

- Registration and login
- Verified email addresses
- Unique internal immutable user IDs
- System-generated public pseudonyms
- Optional pseudonym changes with abuse controls and history policy
- Secure password hashing using a modern memory-hard algorithm
- Authenticator-app MFA using standards-compatible TOTP
- One-time recovery codes stored only as hashes
- MFA enrolment confirmation before activation
- MFA reset and account-recovery flows with explicit threat analysis
- Rate limiting and credential-stuffing protection
- Account-enumeration resistance
- Session creation, renewal, expiration, rotation, listing, and revocation
- Secure HttpOnly cookies rather than browser `localStorage` bearer tokens
- CSRF protection appropriate to the selected session architecture
- Email and password change confirmation
- Security notifications for sensitive account changes
- Administrative account security using phishing-resistant MFA where feasible
- No security questions

Do not assume TOTP is sufficient for administrators. Compare TOTP with WebAuthn/passkeys for privileged accounts. The comparison is required; choosing WebAuthn for launch is not required unless the answered threat model says so.

Decide build-vs-buy for identity in Wave 2 from the §10 answer. Do not assume a self-built stack.

### B. Authorization and ownership

Define roles and permissions. The catalog minimum is:

- anonymous visitor
- registered user
- moderator
- support/privacy operator
- security auditor
- database operator
- administrator
- worker/service identity

If launch has one human operator, collapse unused human roles in the recommended design and keep the unused roles as a growth map, not as fake separation of duties.

Define authorization for:

- viewing public and private debates
- creating and editing debates
- publishing/unpublishing
- regenerating nodes
- deleting or redacting content
- exporting user data
- responding to DSARs
- managing users
- viewing audit records
- configuring models and workers
- accessing production data

Require deny-by-default server-side authorization. Include object-level authorization tests preventing IDOR/BOLA attacks.

Reuse and harden the existing worker/service identity. Do not replace it casually.

### C. Public debates and pseudonyms

Design privacy-aware public participation:

- New debates are private by default unless a documented product decision says otherwise.
- Publishing requires a clear affirmative action and a warning that content will become publicly accessible and may be indexed.
- A public pseudonym must not expose email, internal user ID, or authentication identifiers.
- The pseudonym-to-account mapping must be separately protected.
- Specify whether pseudonyms are global, rotating, or debate-specific.
- Define account deletion semantics for public debates, replies, citations, exported copies, and debate-tree integrity.
- Support redaction or tombstoning where full deletion would damage other users’ conversation records, subject to legal review.
- Add moderation, reporting, blocking, rate limits, spam controls, and appeals if public participation is in scope.
- Define handling for doxxing, third-party personal data, sensitive personal data, illegal material, harassment, and minors.

Do not describe pseudonymised data as anonymous. Treat it as personal data.

Public-participation machinery is Phase 6 build work. Deletion and visibility semantics must still be designed before the privacy centre, because erasure depends on them.

### D. Encryption and key management

Do not use the term end-to-end encryption for content that the server or an LLM must process in plaintext.

Produce a data-classification-driven encryption design covering:

- TLS in transit, including internal service connections
- database, volume, object storage, and backup encryption at rest
- field-level envelope encryption for selected sensitive attributes
- encrypted TOTP seeds
- password and recovery-code hashing
- key hierarchy and separation
- external KMS or equivalent secret custody
- key rotation and key-version migration
- backup and disaster recovery of keys
- revocation and compromise response
- separation of data and keys
- secret scanning
- explicit prohibition on secrets in source control, images, logs, prompts, model payloads, and client bundles

Identify which fields genuinely require application-level encryption and which should instead be hashed, tokenised, minimised, or not collected.

If production is still a single-operator local SQLite, say so, and size key management to that reality plus the migration path. Do not specify an external KMS as mandatory for a laptop database unless the answered hosting plan requires it.

### E. Database and privileged access

Replace any vague “database three-factor authentication” idea with:

- separate service and human identities
- no shared credentials
- least-privilege database roles
- SSO and phishing-resistant MFA for human production access
- short-lived credentials
- network isolation or zero-trust access
- just-in-time privileged access
- approval for high-impact production operations
- break-glass access with immediate alerting and mandatory review
- credential rotation and revocation
- read-only access where possible
- separation of duties
- production access reviews

Design tamper-evident audit logging that captures:

- actor and identity type
- authenticated session or request correlation ID
- action
- target resource type and identifier
- timestamp in UTC
- source/service context
- authorization decision
- success or failure
- privileged-access justification or ticket reference

Audit logs must not contain passwords, access tokens, TOTP seeds, raw prompts, debate text, provider payloads, or unnecessary personal data. Define retention, access, integrity protection, off-system replication, alerting, review cadence, and deletion/legal-hold policy.

Size this to the answered staffing and hosting model. Paper dual-control is a residual risk if only one operator exists.

### F. LLM and prompt-injection security

Treat all user input, debate content, retrieved web content, documents, model outputs, and provider responses as untrusted data.

Target invariant:

- No LLM or model subprocess has database credentials.
- No LLM can issue arbitrary database queries.
- No model has direct access to application secrets.
- No model subprocess inherits the full application environment.
- Models receive only the minimum per-job data needed for the current task.
- Model output cannot directly execute tools, SQL, shell commands, templates, HTML, or administrative operations.
- Any future tools are allowlisted, schema validated, user-authorized, least-privileged, and separately mediated.
- External model providers receive only documented fields and only after the required user disclosure/legal basis.
- Provider training, retention, abuse-monitoring, region, and subprocessor settings are documented.

Design:

- process/container/user isolation
- explicit child-process environment allowlists
- filesystem isolation
- outbound network allowlists
- structured prompts separating instructions from untrusted data
- size and encoding validation
- HTML/Markdown sanitisation
- output schema validation
- URL and citation validation
- rate and resource limits
- security monitoring
- model/provider kill switches
- adversarial prompt-injection test corpus
- direct and indirect prompt-injection tests
- secret-exfiltration canary tests

Show the blast radius after a successful injection, not a promise that injection cannot occur.

### G. Privacy and GDPR operations

Create a draft data inventory and ROPA containing, for every evidenced processing activity:

- purpose
- controller/processor role
- categories of data subjects
- categories and sensitivity of personal data
- data source
- lawful-basis candidate requiring legal validation
- systems and geographic storage locations
- recipients and subprocessors
- international transfers and transfer mechanism
- retention and deletion schedule
- technical and organisational safeguards
- processing owner
- relevant DPIA, LIA, DPA, SCC, or transfer impact assessment

Do not use consent as the default lawful basis for every activity.

Design a user-facing privacy centre showing:

- account and profile data
- authentication and security information in safe form
- debates and posts
- consent choices and history
- active sessions
- connected services, if any
- data export
- correction
- account deletion
- processing restriction and objection requests
- contact and complaint information

Design an operational DSAR workflow for access, rectification, erasure, restriction, objection, and portability, including:

- identity verification proportional to risk
- receipt and deadline tracking
- one-month default response target
- documented extension and notification process
- exception and legal-hold review
- search across active databases, logs, caches, backups, analytics, support systems, model providers, and other subprocessors
- machine-readable export
- deletion/redaction evidence
- processor notification and confirmation
- dual-control approval for high-risk disclosure, or an explicit single-operator residual risk
- audit trail that does not duplicate unnecessary personal data

If the service remains single-operator local-first, the privacy centre and DSAR workflow must still exist as a sized design, but they may be an operator runbook plus a minimal user export/delete path rather than an enterprise privacy suite.

### H. Cookies and consent

Inventory every cookie, local-storage item, SDK, analytics request, and other client-side storage mechanism.

Classify each as:

- strictly necessary
- preferences
- analytics
- marketing/advertising

Non-essential storage and network calls must remain blocked until valid consent. Provide accept, reject, and granular choices with equal prominence. Record consent version, categories, timestamp, and withdrawal. Withdrawal must be as easy as acceptance.

If only essential cookies are used, recommend an informational cookie notice instead of a deceptive consent banner.

### I. International transfers and vendors

Produce a vendor and subprocessor register covering hosting, email, analytics, monitoring, backups, support, and every model provider that is actually used or chosen.

For each vendor, document:

- entity and contractual role
- data received
- purpose
- storage and processing region
- subprocessors
- retention and deletion
- use for model training or product improvement
- DPA availability
- applicable adequacy decision, EU-US DPF status, SCC module, or other transfer mechanism
- need for a transfer impact assessment and supplementary safeguards
- incident notification commitments
- DSAR and deletion support

Determine separately whether a DPO or EU representative is legally required. Do not assume either. Record the conclusion, the evidence, and the counsel flag.

### J. Operations and assurance

Include:

- retention and deletion policy
- privacy notice requirements
- terms and acceptable-use requirements
- DPIA screening and draft DPIA if indicated
- incident-response plan
- GDPR personal-data-breach assessment and notification workflow
- backup restoration tests
- disaster recovery objectives
- access-review schedule
- vulnerability management
- dependency and container scanning
- SAST, DAST, secret scanning, and IaC scanning
- penetration-test scope
- OWASP ASVS/API Security acceptance criteria
- LLM red-team test plan
- security headers, CSP, CORS, CSRF, SSRF, injection, upload, and deserialisation defenses
- monitoring and alerting without sensitive payload collection

---

## 7. Slice contract

When a wave is allowed to write implementation slices, each slice includes:

- goal and risk addressed
- exact affected components and likely files
- schema and migration changes
- API and UI changes
- dependencies
- failure and rollback behavior
- unit, integration, end-to-end, security, and migration tests
- measurable acceptance criteria
- audit/compliance evidence produced
- observability without sensitive logging
- deployment and rollback instructions
- unresolved legal or product decision
- estimate as relative size, not a calendar promise

“Likely files” means files evidenced in this tree. Do not invent paths.

---

## 8. Phase order

Evaluate and, after Wave 2, recommend this sequence unless Wave 1 evidence forces a recorded change:

| Phase | Purpose |
|---|---|
| 0 | Inventory, threat model, legal decisions, data classification, DPIA screening, architecture decisions |
| 1 | Individual identities, secure sessions, ownership model, private/public visibility, migration off the shared bearer token |
| 2 | MFA, recovery, administrative identities, RBAC, object-level authorization |
| 3 | Database hardening, encryption/key management, audit system, secrets isolation, backup controls |
| 4 | LLM process isolation, minimal prompt payloads, provider controls, prompt-injection containment, adversarial tests. May start in parallel with Phase 2 if ownership is already in place. |
| 5 | Privacy centre, consent, ROPA operations, retention automation, DSAR export/deletion/redaction, processor propagation |
| 6 | Public participation, pseudonyms, moderation, abuse controls, public-content deletion semantics |
| 7 | Assurance, penetration testing, incident exercises, production readiness, legal review |

**Design-order constraint:** even if Phase 6 is built late, Wave 2 must define visibility defaults and account-deletion semantics before specifying Phase 5 erasure. Otherwise the privacy centre will be rewritten.

Phase 0 is Wave 1 plus the human answers. It is not a coding phase.

---

## 9. Control-mapping rule

When mapping a catalog item, use this shape:

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

Ask these, record any answer already evidenced in the repo, and leave the rest for the human. Do not invent answers.

1. Which legal entity will operate the service?
2. Which countries will be served at launch?
3. Are minors allowed?
4. Are debates private or public by default?
5. Can users submit personal data or special-category data in debate prompts?
6. Which model providers will be enabled?
7. Are provider API requests retained or used for training?
8. Will email delivery use an external vendor?
9. Will authentication be self-built or delegated to an identity provider?
10. What production database and hosting platform are planned?
11. Where will production data, backups, logs, and keys be located?
12. What must happen to public debates after account deletion?
13. Must a pseudonym remain stable across all public debates?
14. Which analytics or marketing technologies are planned?
15. What recovery mechanism is acceptable if a user loses both TOTP and recovery codes?
16. Which staff roles will have production access?
17. What retention periods does the business actually need?
18. Is the service consumer-facing, enterprise-facing, or both?
19. At launch, is this still a local-first single-operator tool, a private hosted service, or a public internet product?
20. Is `apps/dialectical-engine` the only stack in this mission, confirming `DebateAI-V3` stays out of scope?

Question 20 may be treated as answered by this file unless the human overrides it.

If a question is not applicable because of another answer, say why. Do not delete it.

---

## 11. Quality bar

The result must be implementable by engineers and reviewable by security, privacy, and legal specialists.

Every requirement maps to one or more controls, tests, evidence artifacts, owners, and residual risks.

Unknowns stay unknown. Do not invent compliance conclusions.

Forbidden phrases unless the precise technical or legal meaning is demonstrated in the same paragraph:

- GDPR compliant
- prompt-injection proof
- end-to-end encrypted
- SCC certified / SCC compliant
- anonymous, when the data is only pseudonymised

If Wave 1 is thin, later waves cannot repair it by sounding complete. Redo Wave 1.

---

## 12. First action

You are launching Wave 1.

1. Confirm you are in `/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine`.
2. Inspect the tree. Do not write architecture yet.
3. Write `wave-1-current-state.md` in this mission directory.
4. End that file with the human-answer packet for §10.
5. Stop and wait.
