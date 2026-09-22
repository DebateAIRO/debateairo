# CP1 — Product knowledge and navigation

ui: yes

Status: FROZEN at the REQ READY marker. This checkpoint may be implemented independently except for the owner-confirmed Forgot password destination. That destination is unresolved; CP1 cannot pass or be presented as complete until it is verified and connected.

## Objective

A visitor can use the established Support widget or `/help` surface in English or Romanian to get current, peer-reviewed product facts and safe first-party navigation. The server treats model text as untrusted, screens every completion before storage or HTTP, and keeps all account authority outside Support.

## Terms

- **Peer-reviewed** means a named reviewer has produced a durable review artifact for the exact EN/RO content revision. It does not mean owner-ratified.
- **Owner-ratified** means V has explicitly accepted the checkpoint and the paired `ratified_by` / `ratified_on` fields record that real event. Blank fields mean no ratification.
- **Canonical reply** is the final server-authored or server-validated text plus server-resolved sources and actions. The same canonical text is encrypted and returned over HTTP.
- **Action** is a closed catalog identifier resolved by server code using trusted request context. Model text and user text never supply an `href`.

## Functional requirements

### Catalog and navigation

- **CP1-R01 — Complete route disposition.** The catalog accounts for all 11 current `apps/ui/app/**/page.tsx` routes identified by the approved product map. `/verify-email`, `/enroll-mfa`, and `/admin/workers` are known but ineligible for ordinary model-generated actions. `/api/[...path]` is recorded as a proxy, not a page action.
- **CP1-R02 — One browser-safe catalog.** `@debateai/support-kb` exposes a browser-safe subpath containing the capability records, bilingual action labels, and the closed action-id union. The Node filesystem loader remains outside that subpath. API and UI action validation consume this catalog rather than maintaining new duplicate route arrays.
- **CP1-R03 — Closed resolver.** `resolveSupportActions(ids, context)` drops unknown, inapplicable, external, protocol-relative, backslash, token-bearing, missing-fragment, and unverified dynamic destinations. `signedIn=true` alone never authorizes an owner debate link. Owner run IDs and public references come only from trusted, previously verified projections.
- **CP1-R04 — Accurate current links.** Static actions may resolve only to verified current destinations. `/settings#consent-privacy-heading` is valid; `/settings#privacy`, `/settings#cookies`, invented `/privacy` and `/terms` routes, and the placeholder pricing anchor are not offered as working destinations. Cookie/privacy modal controls may be actions only when the existing opener is callable through a reviewed first-party adapter.
- **CP1-R05 — Forgot password dependency.** `forgot-password` exists in the action union because the owner confirms the feature. It resolves to no action until the exact existing URL or UI opener is verified in the target app. CP1 completion requires recording that destination, an action-resolver test, and a UI click test. The implementation must not create a replacement, use Settings, substitute saved-MFA recovery, or default to human escalation.
- **CP1-R06 — Deterministic recovery intent.** Before the generic password/account refusal classifier, deterministic EN/RO matching recognizes at least `Forgot password`, `I forgot my password`, `Can't remember my password`, `Am uitat parola`, and a mixed request for a replacement password. It returns concise guidance and the verified `forgot-password` action without calling recovery APIs or the model.

### Knowledge and provenance

- **CP1-R07 — Current bilingual facts.** Every shipped capability in the catalog maps to at least one complete EN/RO article pair. Corrections cover actual debate creation, Free/Premium controls, navigation, public/private access, JSON export, local-only or unavailable actions, account/session controls, privacy/consent, support cases, status limitations, and the current 48-hour case SLA.
- **CP1-R08 — Review provenance.** A separate review manifest records `id`, `lang`, SHA256 of the exact article file bytes, actual reviewer/session identity, review date, and durable review-evidence locator. Keeping the digest outside the article avoids self-referential metadata. Records are added only after a separate Sol editorial review of the exact bilingual content/catalog bytes. Owner-ratification fields remain blank for new CP1 content until V explicitly accepts the checkpoint and must always be both blank or both populated.
- **CP1-R09 — Honest preview gate.** A complete EN/RO pair is eligible for the local CP1 preview only when both files describe a shipped product fact, pass structural and visitor-text linting, and match real peer-review manifest records byte-for-byte. Existing owner-ratified entries remain eligible. The loader reports peer-reviewed-preview and owner-ratified counts separately; it never writes or infers a reviewer or ratifier. A release assertion excludes any unratified new pair from production release. Draft content/catalog work may finish while excluded, and navigation integration may proceed in parallel; preview eligibility waits for the editorial attestation.
- **CP1-R10 — Snapshot provenance.** `kbVersion` hashes the eligible article bytes, the capability/action catalog, and the review metadata that selected them. A support session uses the immutable snapshot represented by its stored `kbVersion`; if that snapshot is unavailable after a deployment, the server starts a new support session instead of relabeling old state with new content.
- **CP1-R11 — Reachable knowledge.** The answer service no longer requires a hard-coded `INTENT_SIGNALS` match for a reviewed article to be eligible. The complete compact capability/policy index is always supplied, and article detail is selected lexically from the current request. Sections are added whole. The initial 24,000-code-point system cap comes from the approved plan and remains a measured CP3 tuning target, not a quality claim.
- **CP1-R12 — Visitor-safe sources.** HTTP and UI source objects contain reviewed IDs and visitor labels only. Repository paths, `verified_against`, reviewer identities, evidence paths, prompt policy, and internal manifests never appear in visitor-visible text.

### Response and credential boundary

- **CP1-R13 — Credential prohibition.** Support never generates, retrieves, solicits, validates, echoes, submits, or claims to have changed passwords, OTP/TOTP values, verification or recovery codes, authenticator secrets, reset tokens, session credentials, or account-security state. No Support capability imports auth/reset execution, and no Support request calls those operations.
- **CP1-R14 — Structured draft boundary.** Every model completion is length-bounded before strict parsing. The accepted draft has exactly `kind`, `text`, `sourceIds`, and `actionIds`; unknown keys, raw URLs, Markdown links, HTML, forged sources, and unrequested actions are rejected. An answer cites at least one supplied source. Action IDs are resolved again against trusted server context.
- **CP1-R15 — Output screening.** Before persistence or HTTP, normalized output screening rejects credential/code forms, secret echo, unsolicited credential requests, reset-success claims, and path/link instructions in English or Romanian. Benign times, dates, and public error identifiers remain usable. Invalid output receives short server-authored safe guidance and is not sent through a second model attempt.
- **CP1-R16 — One canonical sink value.** The final text is passed through the existing message cipher/redactor. The `SupportMessageCipherPort.write` return record is the canonical value used in the HTTP response. The pre-validation completion is never persisted, returned, or logged. Model usage is still accounted for when a draft is rejected; policy rejection alone does not mark the relay unavailable.
- **CP1-R17 — Existing controls preserved.** Queue reservations, daily caps, timeouts, degraded-state handling, consent, ownership, encryption, shredding, immediate human handoff, and the current runtime Support model remain unchanged except where adapters must carry validated sources/actions.

### Established UI

- **CP1-R18 — API contract.** Grounded and deterministic security replies may include `sources: readonly { id; label }[]` and `actions: readonly { id; label; href }[]`. The API emits only server-resolved values and retains the existing message ID, outcome, text, escalation, case-receipt, and language behavior.
- **CP1-R19 — Two existing surfaces.** The established compact widget and full `/help` desk render canonical text with React escaping, source labels as text, and actions as first-party buttons or anchors. They do not render model Markdown or HTML. Both surfaces retain EN/RO controls, keyboard focus, screen-reader labels, case access, and `Talk to a human`.
- **CP1-R20 — No redesign.** CP1 adds action/source affordances inside the approved Support interface. It does not restructure the help desk, replace the widget, or change visual direction.
- **CP1-R21 — Supported disjoint preview.** CP1 preview uses one coherent repository-supported stack on ports disjoint from existing UI 3001, API 8790 and provider 8791–8796 listeners. Support feature clusters do not stop, reuse or reconfigure those services and do not own stack changes. A separate infrastructure prerequisite must prove the supported configuration and hand its preview URL/configuration to CP1 before manual acceptance.

## Acceptance criteria

- **CP1-A01 (automated):** Catalog coverage enumerates every current page route by discovered pathname and proves each is mapped or explicitly excluded; it does not pass by checking only the number 11.
- **CP1-A02 (automated):** The loader rejects incomplete pairs, invented reviewers, missing review evidence, mismatched review bytes, invalid paired ratification fields, and unreviewed drafts. It reports preview and owner-ratified counts separately and changes `kbVersion` when eligible content, catalog, or provenance changes.
- **CP1-A03 (automated):** New peer-reviewed EN/RO content is answerable without editing `INTENT_SIGNALS`; unreviewed content and internal source paths are absent from the model-visible/visitor-visible projection.
- **CP1-A04 (automated):** Unknown actions, external and malformed URLs, token-bearing destinations, guessed dynamic IDs, missing fragments, and signed-in-without-ownership private links resolve to no action.
- **CP1-A05 (automated and manual, both UI modes):** Each required English/Romanian Forgot password phrase produces the verified existing action. Clicking it opens only the first-party flow, with zero Support-originated credential/reset submissions. This criterion is UNVERIFIED and checkpoint-blocking until the destination is supplied.
- **CP1-A06 (automated):** Synthetic malicious completions covering codes, grouped codes, control-character obfuscation, secret echo, false reset success, raw links, forged source IDs, and extra JSON keys are absent from decrypted storage, HTTP, and rendered output; account/reset spies record zero calls.
- **CP1-A07 (automated):** For accepted and safely replaced model replies, decrypted assistant text equals HTTP `text` exactly. Rejected model usage remains recorded and relay health remains available.
- **CP1-A08 (manual, full `/help`):** In EN and RO, ask how to create a debate, what Settings contains, and how JSON export works. Each answer states current prerequisites/limitations, shows only reviewed source labels, and offers only verified actions.
- **CP1-A09 (manual, compact widget):** Repeat one product question and the Forgot password intent. Text, actions, keyboard behavior, escalation, and disclosure match the full-page behavior within the compact layout.
- **CP1-A10 (regression):** Focused knowledge, catalog, response-policy, model, API-route, degraded/reservation, own-context, shredding, and Support render suites pass three captured runs per implementation cluster; the exact commands are in `PLAN.md`. No CP1 path adds a typecheck diagnostic.
- **CP1-A11 (preview infrastructure):** A separately reviewed infrastructure change starts the supported stack on disjoint ports, records all bound ports, and proves the pre-existing listeners remain running and untouched. Ad hoc free ports without coherent repository configuration do not satisfy this criterion.

## Explicit exclusions

Bounded prior-turn history, broad paraphrase/greeting behavior, new conversational outcomes and SQL accounting belong to CP2. Topic counts, service-status/SLA cleanup beyond facts required by CP1, held-out real-relay evaluation, rollout and rollback evidence belong to CP3. No push, publication, or production deployment occurs in CP1.
