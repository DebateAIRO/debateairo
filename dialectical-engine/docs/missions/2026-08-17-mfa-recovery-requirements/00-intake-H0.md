# H0 INTAKE — MFA, Account Recovery, Identity Verification & AI-Assisted Support

- **Mission slug:** `2026-08-17-mfa-recovery-requirements`
- **Date:** 2026-08-17
- **Orchestrator:** Claude Code (Fable/Opus 5) — Claude-Router seat, spine §5.1
- **Spine:** DebateAI Graph Spine v2, version 3.0.0
- **Loops firing:** REQUIREMENTS ENGINEERING **only** (V order). ARCHITECTURE,
  PROGRAMMING, QA are **not** instantiated by this mission.

## Classification (set ONCE at H0 — spine §5.5)

```yaml
risk_tier: high          # immutable high-risk floor fires: security/auth
planning_tier: 2         # architecture/high-risk
never_tierable_down: true
reason: >
  Mission subject is authentication, account recovery, and identity proofing.
  Spine §9 high-risk floor names security/auth explicitly. Classification is
  recorded now so that when V later opens the ARCHITECTURE loop the tier is
  already fixed and cannot be re-derived downward.
```

Note: the Tier-2 *planning route* (G1/C2/H2∥G3/H3/C4/G5) is ARCHITECTURE-loop
machinery and is **withheld** by V's order. This mission runs H0/REQUIREMENTS and
stops. The tier binds the next mission, not this one.

## R7 loop-ownership election (ruling R7 + v3.2.0 amendment 1)

Run as an explicit election, not a preset. V's answers:

```yaml
loop_ownership:
  requirements: [hermes, opus, codex@gpt-5.6-sol, grok-4.6]
  architecture: [not-elected]   # loop not firing this mission
  programming:  [not-elected]
  qa:           [not-elected]
```

**Seat shape (V's answer): parallel blind, then synthesis.** All four seats
research the full brief independently and blind to each other. Divergence between
them is treated as signal about what is genuinely contested rather than as noise.
A fifth, separate Opus instance synthesizes.

### Seat roster — verified live at intake, 2026-08-17

| V's name | Concrete agent | Transport | Liveness evidence |
|---|---|---|---|
| Hermes | `hermes` (gpt-5.6-sol, OpenAI Codex provider) | `~/.local/bin/hermes --yolo -z` | dashboard PID 22484 serving 9119 → HTTP 200 |
| Opus | `claude` (Opus 5) | SDK subagent | orchestrator-hosted |
| GPT Sol 5.6 Max | `codex@gpt-5.6-sol`, `model_reasoning_effort=xhigh` | `codex exec` | probe returned `XHIGH-OK`, 3,640 tokens |
| Grok 4.6 | `grok-4.6` | `grok -p` | probe returned `ALIVE` |

"GPT Sol 5.6 Max" resolves to `gpt-5.6-sol` at `xhigh` reasoning effort —
verified, not assumed. The **Grok 402 outage** recorded on 2026-08-15 is
**resolved**; grok-4.6 answered a live probe at intake.

Roster note (R4/R7): `codex@gpt-5.6-sol` is not in the standing `planning_agents`
list. V named it for this mission's research, which is a legal per-mission
`loop_ownership` instantiation under V's own authority.

## V's answers to the intake design questions

1. **Fleet shape** — parallel blind, then synthesis.
2. **Jurisdiction** — **global from day one.** Recovery channels are explicitly
   *not* WhatsApp-only: WhatsApp is one extra recovery method among
   Discord, Signal, Telegram, WeChat, with the user choosing which app is their
   recovery channel. V additionally proposes **secret questions** as a step
   "until we reach the phone/username."
3. **Recovery dial** — **tiered by risk signals.** Fast path on strong signals,
   escalating friction as signals weaken.
4. **AI support authority** — **low-risk actions only, never auth** (option 2),
   **plus** V's two-bot extension, recorded as a hard requirement below.

### V's question back to intake, and the answer given

> "About ID Verification: Couldn't we do this in-house? Like proving that
> somebody is saying who they say they are? How do big companies handle this?"

Answered at intake as scope guidance, and forwarded to the fleet as an explicit
contested research question (RQ-C4) so V receives evidence rather than the
orchestrator's opinion. Intake position: build the **risk/signals engine**
in-house (that is where the value is and it is what large platforms genuinely
build); **do not** build document/biometric verification in-house (liveness is an
anti-deepfake arms race; ID images + biometric templates attract GDPR Art. 9,
DPIA, and US biometric-statute liability; "global from day one" multiplies the
document-format burden that is precisely the vendors' product). Mature platforms
largely avoid document ID in *recovery* altogether, preferring surviving-factor
proof, enrolment-time recovery codes, delay-and-notify, and trusted contacts.

## Hard requirement — V's two-bot AI support design

Recorded verbatim in intent, to be specified by the fleet:

- **Bot A (user-facing):** may take low-risk, reversible actions. Structurally
  incapable of touching MFA, recovery, credentials, or contact details.
- **Bot B (evidence bot):** may ask the user higher-privilege identity questions
  to speed case resolution. Runs isolated (VM). **No egress** — it may only
  record evidence, never communicate outward. Its record is visible **only** to
  human customer-service staff. **The user can never read back what it wrote.**
  Stated purpose: defence against prompt-injection attacks.

**Orchestrator refinement forwarded to the fleet:** Bot B still *talks* to the
user, so the containment property is not "no I/O" — it is a **one-way evidence
diode**: findings flow to humans only, and never back to the user. The injection
risk therefore relocates to whether a user can *poison what Bot B records*, and
to whether Bot B's output can carry an injection payload that fires inside the
human agent's console. The fleet must address both.

## Banked constraints carried in from prior V rulings

- **The `accounts-privacy-security` mission was HELD by V on 2026-08-17** ("do not
  start the mission at all for now… until im done cleaning the repository").
  This mission is a scoped slice of it. V's direct order firing the requirements
  loop supersedes the hold for this slice only (source-of-truth order item 1:
  explicit V direction). The wider mission stays held.
- **Wave 1 baseline (already established, do not rediscover):** there is **no auth
  at all** in the product today — any non-empty string is accepted as identity, by
  design. Tenancy SQL is sound and proven. The identity question surface lives in
  **9 places**. See
  `../2026-08-17-accounts-privacy-security/wave-1-current-state.md` and
  `../2026-08-17-accounts-privacy-security/research/S1-auth-api-surface.md`.
  This mission is therefore **greenfield** — no migration constraint from an
  existing auth stack.
- **Q9 (auth build-vs-buy) is explicitly HELD by V — do not assume self-built.**
  Every recommendation must evaluate buy alongside build.
- **Q15 (TOTP + recovery-code loss) is open** and is directly answered by this
  mission's device-loss scope.
- **Launch shape:** private hosted at dezbatere.ro, registration-gated first,
  public later. Global user base from day one per this intake.
- **Default visibility:** private by default; publishing is a deliberate act.
- **Erasure:** crypto-shredding; public debates remain, private debates are
  user-deletable.
- **V's standing security posture (2026-08-17):** "All I want is to have a secure
  application. only MY application. No Pen testing, no cybersecurity attack on
  anyone." **Defensive-only.** Adversarial/injection work is **design-only** at
  this stage. No offensive testing is authorized by this mission.
- **Naming:** the product is `dialectical-engine`. No "V2"/"V3" naming.

## Deliverable

Four independent research artifacts + one synthesized requirements spec with
ranked recommendations. **No architecture, no implementation, no code.** The
mission ends at a requirements artifact set presented to V.

## Stop conditions for this mission

- Any seat proposing to write code, migrations, or configuration → stop.
- Any seat proposing offensive/pen-testing activity → stop (V posture).
- Any seat requiring a product/architecture decision V has not given → route the
  question up to intake as an ARCH→REQ return; never ask V directly.
- Fabricated citations or invented vendor/API behaviour → evidence violation
  under the no-fake-evidence law (spine §11 law 2, ruling R5).
