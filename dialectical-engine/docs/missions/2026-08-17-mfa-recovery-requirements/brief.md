# SHARED RESEARCH BRIEF — MFA, Recovery, Identity Proofing, AI Support

All four research seats read **this same brief** and work **independently and
blind** to each other. Do not attempt to discover or read another seat's output.
Disagreement between seats is wanted: it tells V which questions are genuinely
contested.

**Product context.** `dialectical-engine` — a structured-debate application, to be
hosted at dezbatere.ro. Private/registration-gated first, public later.
**Global user base from day one.** Debates are private by default; publishing is a
deliberate act. **There is no authentication in the product today** — any
non-empty string is currently accepted as identity, by design. You are therefore
designing **greenfield**, with no legacy auth to migrate.

**You are producing REQUIREMENTS, not architecture and not code.** No
implementation plans, no schemas, no file layouts. Requirements, evidence,
tradeoffs, and ranked recommendations.

## Answer format

Write ONE markdown file to the exact path given in your goal packet. Structure it
with the section headings `A` through `E` below and answer the numbered research
questions by their IDs (`RQ-A1`, `RQ-B3`, …) so the synthesis seat can compare all
four artifacts question by question.

**Evidence law (binding).** Cite real, checkable sources — specification section
numbers, vendor documentation URLs, published pricing pages, regulation articles.
Where you cannot verify something, **write `UNVERIFIED` and say what would verify
it**. A confident invented API detail, price, or country list is an evidence
violation, not a helpful guess. Distinguish clearly between (a) what a spec says,
(b) what a vendor's docs claim, and (c) your own engineering judgement.

Mark every recommendation with a confidence level and the single strongest
argument **against** it.

---

## A. MFA design — "simplest yet secure"

V's stated must-haves: **email**, **WhatsApp**, and **any TOTP authenticator app,
regardless of vendor** (Google Authenticator, Authy, 1Password, Aegis, Ente, etc.).
V explicitly wants the *simplest* scheme that is still genuinely secure — usability
is a first-class requirement, not an afterthought.

- **RQ-A1.** What does current authoritative guidance actually say about each of
  these factor types? Ground this in **NIST SP 800-63B** (including the -4 revision
  status), and note where it conflicts with common industry practice. Specifically:
  what is the current standing of email-link/email-OTP, of messaging-app OTP, and
  of TOTP as second factors, and what is the AAL each can reach?
- **RQ-A2.** TOTP interoperability: what exactly must be implemented so that *any*
  authenticator app works (RFC 6238/4226, `otpauth://` URI parameters, secret
  length, period, digits, algorithm, drift/skew window, replay prevention)? Where
  do real-world authenticator apps diverge from the spec in ways that break
  interoperability?
- **RQ-A3.** Given the product is a debate platform and not a bank, what is the
  **minimum viable secure MFA** you would require at launch? State the enrolment
  flow, the step-up triggers (when MFA is demanded vs. not), and session/re-auth
  policy. Justify why anything you exclude is safe to exclude.
- **RQ-A4.** Where do **passkeys / WebAuthn** fit? They are absent from V's list.
  Make the case for and against including them at launch, given "simplest yet
  secure" and a global consumer audience. Are they simpler or harder than TOTP for
  a non-technical user in 2026? Address account-bound vs. device-bound passkeys and
  the cross-platform sync situation.
- **RQ-A5.** Phishing resistance: rank the proposed factors by real resistance to
  phishing, adversary-in-the-middle proxy kits, SIM-swap, and OTP-bot social
  engineering. Which of V's chosen factors are the weakest link and what
  compensating controls close the gap?

## B. Messaging-app channels — WhatsApp and V's extended list

V's ruling: WhatsApp is **one extra recovery method, not the only one**. The user
chooses which app is their recovery channel from: **WhatsApp, Discord, Signal,
Telegram, WeChat**.

- **RQ-B1.** For **each** of those five, establish with evidence: does a
  *legitimate, supported* API for sending authentication codes to arbitrary users
  actually exist? Name the product, the access requirements (business
  verification, template approval), the per-message cost model, and the rate
  limits. **Be blunt where the answer is "no such product exists"** — do not
  invent one to complete the table.
- **RQ-B2.** Country and regulatory availability, given **global from day one**.
  Where is each channel unavailable, blocked, or legally constrained? Treat
  **WeChat/China** specifically (real-name requirements, data-residency law) and
  note any market where a channel is banned or unusable.
- **RQ-B3.** Security analysis: a messaging-app OTP is delivered to an *account*,
  not a device. What does that mean for the threat model when the user's Telegram
  or Discord account is itself compromised, or when the messaging account is
  protected only by SMS? Does routing OTP through these channels create a
  **circular trust** problem, and how should the requirements prevent it?
- **RQ-B4.** Operational cost and reliability at, say, 10k and 100k users:
  per-message pricing, deliverability, and what happens to your users when a
  channel provider changes policy. What is the requirement for graceful
  degradation when a channel dies?
- **RQ-B5.** Recommendation: which subset of these five should actually ship, in
  what order, and which should V drop? Give the strongest argument against your
  own recommendation.

## C. Device loss, compromise, and account recovery

This is V's explicit concern: *what happens when a user loses one of the devices
or gets hacked*, and how do we recover real users fast without opening a takeover
path. V chose **tiered-by-risk-signals** recovery.

- **RQ-C1.** **Enrolment-time mitigations.** What must be required at signup so
  that device loss is survivable at all? Cover recovery codes (count, entropy,
  storage, single-use, regeneration), mandatory second factor, multi-device
  enrolment, and recovery-contact designation. What does the evidence say about
  users actually retaining recovery codes, and what does that imply?
- **RQ-C2.** **The loss cases, enumerated.** Specify required behaviour for: lost
  phone with TOTP but recovery codes intact; lost phone *and* codes; lost access
  to the recovery email; lost the messaging-app account; lost everything. For each,
  state the required proof bar and the expected time-to-recovery.
- **RQ-C3.** **The compromise cases.** Attacker has the password; attacker has
  password + one factor; attacker has the email inbox; attacker has the device.
  Specify required detection signals, containment (session revocation, re-auth,
  factor re-enrolment lockout), notification to *all* previously known channels,
  and the reversibility window. What must the system do that a user cannot undo,
  and what must always be undoable?
- **RQ-C4.** **The tiered risk engine — V's central question.** Define the signal
  set for the fast path (device recognition, IP/ASN reputation, account age,
  behavioural history, surviving factors, prior successful auths) and the
  escalation ladder as signals weaken. Then answer V's direct question with
  evidence: **which parts of identity verification can realistically be built
  in-house, and which should be bought — and how do large platforms actually do
  this?** Look at what Google, Apple, Microsoft, Meta, and at least one
  fintech actually do for *account recovery* specifically. Cover Apple's
  delay-and-notify account recovery and recovery contacts, and Google's
  recovery-signal approach. Name real vendors with real pricing where you can
  (Persona, Onfido, Veriff, Jumio, Stripe Identity, Sumsub) and state what
  document/biometric verification actually costs per check.
- **RQ-C5.** **Secret questions / KBA — contested, treat adversarially.** V has
  proposed secret questions as an intermediate step. NIST SP 800-63B deprecated
  knowledge-based authentication. Establish what the guidance and the breach
  evidence actually show, then give V a straight verdict: use them, use them only
  in a specific narrow role, or do not use them. If you recommend against, propose
  the concrete thing that fills the same gap V was trying to fill.
- **RQ-C6.** Legal and privacy constraints on identity proofing under **global**
  operation: GDPR Art. 9 special-category/biometric data, DPIA triggers, US state
  biometric statutes (BIPA and successors, including statutory damages),
  data-residency, and retention limits on ID documents. What must the requirements
  forbid outright?
- **RQ-C7.** Accessibility and the excluded-user problem: users with no
  smartphone, no stable phone number, no government ID, shared devices, or in a
  country where your chosen channels are blocked. What is the required fallback so
  these users are not structurally locked out?

## D. AI-assisted customer support

V's design, to be specified — **not** re-litigated:

- **Bot A (user-facing):** low-risk, reversible actions only. Structurally
  incapable of touching MFA, recovery, credentials, or contact details.
- **Bot B (evidence bot):** may ask the user higher-privilege identity questions
  to resolve cases faster. Runs isolated in a VM with **no egress**. Records
  evidence only; **never** communicates outward. Its record is visible **only** to
  human customer-service staff; the user can **never** read back what it wrote.
  Purpose: prompt-injection defence.

- **RQ-D1.** Specify Bot A's permission boundary precisely. Give the concrete
  allow-list of actions and the explicit deny-list. What is the requirement that
  makes the deny-list *structural* (enforced by the system) rather than
  *instructional* (enforced by the prompt)? Prompt-level restrictions are not a
  security control — state what replaces them.
- **RQ-D2.** Specify the **escalation contract**: the exact triggers that hand a
  case to a human, what context transfers, and how the user experiences the
  handoff. V's requirement is that *only* what the AI cannot solve securely goes
  to a human — so define "cannot solve securely" as a testable condition, not a
  vibe.
- **RQ-D3.** **The evidence diode (Bot B).** Specify it properly. Note the
  orchestrator's refinement: Bot B *does* talk to the user, so the property is
  one-way flow of *findings*, not absence of I/O. Address: (a) can a user poison
  what Bot B records, and what prevents it; (b) can Bot B's recorded output carry
  an injection payload that fires inside the human agent's console, and what
  neutralizes it; (c) what exactly "no egress" must mean in requirement terms
  (network policy, tool allow-list, no outbound tool calls, no retrieval); (d) how
  the human agent's console must render untrusted content safely.
- **RQ-D4.** Threat-model the support surface as an **account-takeover vector**,
  which historically it is — AI support is a social-engineering target. What must
  the requirements guarantee so that talking to the bot can never yield more
  access than talking to nobody? Include the case where the *attacker* is the one
  chatting with Bot B while impersonating the real owner.
- **RQ-D5.** Data protection: the support bots will see personal data and possibly
  ID evidence. Specify retention, minimization, access control, audit logging, and
  what must never be sent to a third-party LLM provider. Tie this to V's banked
  rulings (private-by-default, crypto-shredding) and note the provider-retention
  question (Q7) is still open.
- **RQ-D6.** Where is AI support genuinely *net-negative* and should be refused
  outright? Name the case types that must always go straight to a human.

## E. Synthesis-facing output

- **RQ-E1.** A prioritized requirements list: MUST / SHOULD / COULD, each traceable
  to the RQ that justifies it.
- **RQ-E2.** A launch-vs-later split: the minimum coherent security posture for the
  private registration-gated launch, and what is deferred to public launch.
- **RQ-E3.** Build-vs-buy verdict per component (**Q9 is HELD by V — evaluate both,
  never assume self-built**), with rough cost.
- **RQ-E4.** The top 5 risks in your own recommendations, and the disconfirming
  evidence that would change your mind.
- **RQ-E5.** Open questions that genuinely need V's decision. Be specific and
  minimal — each must be a question only V can answer.

---

## Constraints binding on every seat

- **Defensive only.** V's standing posture: *"All I want is to have a secure
  application. only MY application. No Pen testing, no cybersecurity attack on
  anyone."* Threat modelling and attack *description* for design purposes is in
  scope. Offensive tooling, live testing, or attacking any third party is **not**.
- **Requirements only.** No code, no schemas, no migrations, no file layouts.
- **No fabrication.** `UNVERIFIED` is a valid and respected answer. An invented
  citation is a mission failure.
- **Naming:** the product is `dialectical-engine`. Never "V2"/"V3".
- **Do not contact V.** Questions route to the orchestrator, not to the user.
- Aim for depth over breadth-of-hedging. V wants a decision-ready answer with the
  tradeoffs made explicit, not a survey that refuses to recommend.
