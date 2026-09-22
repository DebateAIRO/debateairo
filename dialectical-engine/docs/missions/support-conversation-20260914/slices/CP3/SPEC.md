# CP3 — Complete local release candidate

ui: yes

Status: SPECIFICATION ONLY. CP3 is not executable until V explicitly accepts CP2. It consumes the accepted CP1 and CP2 revisions and prepares, but does not publish or deploy, the final local candidate.

## Objective

The established Help experience presents truthful topics, status, privacy and case expectations; the integrated Support behavior passes deterministic boundary checks and measured EN/RO real-relay evaluation; and reviewers can reproduce the local preview, release checks and rollback procedure at one exact revision.

## Functional requirements

- **CP3-R01 — Truthful topic surface.** Help topics and suggestions derive from the reviewed catalog or omit numeric counts. Every displayed suggestion has a supported EN/RO evaluated path and does not immediately refuse its own prompt.
- **CP3-R02 — Accurate status labels.** Support relay/configuration measurements are labeled as Support status only. The UI does not infer debate engine, scoring or model-fleet health from the Support endpoint; unavailable measurements are shown as unavailable.
- **CP3-R03 — Accurate destinations and SLA.** Help/settings links use verified current controls. Preferences are not labeled as a legal privacy policy. Case copy uses the current server-backed 48-hour SLA unless one authoritative policy is deliberately changed and tested across server and UI.
- **CP3-R04 — Integrated boundary corpus.** Deterministic evaluation covers EN/RO credentials/codes, encoded and control-character obfuscation, multi-turn secret requests, false reset claims, guessed links, forged source IDs, prompt injection, forged assistant history, missing/withdrawn consent and cross-user references.
- **CP3-R05 — Product coverage corpus.** Evaluation covers every catalog capability, the current Help prompts/suggestions, varied EN/RO paraphrases, follow-ups, misleading user assertions, known limitations and unsupported tasks. Every turn is scored, not only the last turn.
- **CP3-R06 — Explicit real relay.** Real-relay evaluation uses the existing approved Support model configuration and adapter. Missing or mismatched configuration fails explicitly; there is no ambient provider or model fallback and no credential appears in CLI output.
- **CP3-R07 — Evidence semantics.** Observations include canonical validated reply text, source IDs, resolved action IDs/destinations, outcome, completed-response latency and reported usage. `firstTokenAt` remains unavailable for buffered replies. Synthetic evaluation is labeled synthetic and never presented as live-production evidence.
- **CP3-R08 — Honest verdict.** Structural checks alone cannot pass quality. Overall verdict requires completed human-reviewed grounding, task-completion, navigation, continuity and unnecessary-escalation rubrics plus boundary checks. Incomplete evaluation remains `PENDING` or `UNVERIFIED`.
- **CP3-R09 — Measured thresholds.** Three real-relay runs must have zero credential, permission or link-boundary failures. The approved plan's proposed quality threshold of at least 95% in each language is a release target whose derivation is that plan; report the measured numerator/denominator and any shortfall rather than converting it into a claim.
- **CP3-R10 — Owner provenance before release.** Content accepted by V after CP1 records real paired owner-ratification metadata. The release assertion rejects new unratified content. Peer review and owner acceptance remain separately visible in the manifest.
- **CP3-R11 — Integrated verification.** Focused integration/architecture tests cover support authority, private status, consent/ownership, encryption/shredding, queue/reservation cleanup, configuration convergence, API/UI contracts and the exact Forgot password destination. Typecheck, lint and the supported UI build are captured; unrelated pre-existing failures are named without being rewritten.
- **CP3-R12 — Local preview.** One repository-supported stack runs on ports disjoint from pre-existing services. Evidence records the preview URL, branch, exact revision, configuration identity and numbered walkthrough. Existing listeners are never stopped or reused.
- **CP3-R13 — Release and rollback instructions.** The candidate records the existing Support switch/configuration publication steps, pre-release baseline, limited-rollout measurements and an atomic behavior/corpus rollback procedure. Historical outcome readers remain compatible.
- **CP3-R14 — No autonomous release.** CP3 produces a local release candidate only. Push, publication, production deployment and mission acceptance require explicit owner authorization after final whole-product verification.

## Acceptance criteria

- **CP3-A01 (automated):** Help renders only catalog-backed topics/suggestions, accurate Support-only status, verified preference/legal labels and one server-backed SLA in both languages.
- **CP3-A02 (automated):** The complete deterministic boundary corpus has zero credential, permission, cross-user, forged-source and unsafe-link escapes through model input, storage, HTTP or render sinks.
- **CP3-A03 (measured real relay):** Three captured EN/RO runs use the explicit Support relay, disclose completed-response latency/usage, produce zero boundary failures and report quality as exact passed/total for each language.
- **CP3-A04 (manual):** At the exact integrated revision, the owner can follow a numbered walkthrough through full-page and compact Support, grounded navigation, follow-up conversation, Forgot password, private status and human case flow with the stated results.
- **CP3-A05 (release review):** Reviewer reproduces typecheck/lint/build/focused suites, confirms real owner-ratification metadata and verifies release/rollback directions without pushing or deploying.
- **CP3-A06 (final gate):** After CP3 acceptance, the integrated whole is presented for separate owner verification. Silence, elapsed time or reviewer PASS does not authorize release or acceptance.

## Remaining limitations to report, not hide

The runtime remains buffered and provides no true first-token measurement. Real-relay tests demonstrate the configured test target, not all production conditions. Monitoring must compare ratings, repeated unsupported answers, explicit-human requests, broken actions, completed latency and spend against a recorded baseline; reduced human contact alone is not success.
