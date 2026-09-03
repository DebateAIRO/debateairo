# PACKET REQ-SUP — SupportAgent requirements (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_217e59bf` · **seat:** REQ-SUP · **role:** requirements (`heartbeat-requirements`) · **model:** Fable 5.1 (Claude subagent)
- **session:** record your agent id/session in your CLAIM comment · **comment cursor at dispatch:** 0
- **review route:** REQ-REV-SUP (Fable 5.1, blind) — not yours to dispatch · **rework rounds: max 3**
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/supportagent.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/supportagent-compass-block.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/SUP-*/` (`SPEC.md`, `PLAN.md`, `PROGRESS.md`, `DECISIONS.md` per slice)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-SUP.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_217e59bf`
- **forbidden:** everything else. Read-only across the repo. No code, no schema, no config, no migration, no prompt files. The security zone (COMMON §3) is read-only for BOUNDARY description only — you never propose changing it, and the bot you specify must be structurally incapable of reaching it.

## 2. Upstream artifacts (absolute paths)
1. `00-intake-H0.md` — V's verbatim goal ("the best possible customer support chatbot"); C2 and C5 bind you; rows V-2 and V-4 in `docs/missions/observability-agents/V-DECISIONS-PACKET.md` are yours to specify both ways.
2. V's two-bot design and the AI-support requirements already researched: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-mfa-recovery-requirements/` — find the intake (`00-intake-H0.md`), the synthesis, and every seat's answer on AI support (grep `-il 'bot a\|bot b\|evidence bot\|support'`). Bot A: user-facing, structurally incapable of touching MFA/recovery/credentials/contacts. Bot B: evidence bot, isolated, no egress, records visible only to human support staff. "Low-risk actions only, never auth."
3. What a user can see and do today: `apps/ui/app/` routes (library `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`, `/settings`, auth flows — zone), `apps/api/src/index.ts` route inventory, `apps/api/src/publications.ts` (anonymous public debates), `packages/contract` (the client↔API contract, generated), `docs/missions/public-debate-access/` (what anonymous visitors get).
4. Lawful model access under DR-179: `packages/providers/**` and `acceptance/relay-core.ts`, `acceptance/claude-relay.ts`, `acceptance/grok-relay.ts` (the CLI relay the engine uses); `apps/api/src/provider-discovery.ts`. Specify the support bot's model path on this substrate, and the key-based variant for V-2.
5. Privacy and data law (COMMON §3): support transcripts are user data — private by default, crypto-shreddable, never containing raw provider payloads; DR-188 no deletion → retention is V-gated. Product identity: an A.I. debate harness; the public server is `dezbatere.ro` → users write Romanian and English.
6. The observability products being specified in parallel (do not wait, do not read their drafts): the FixAgent files tickets for errors; the ObservationAgent alerts V. Your bot must be able to tell a user "this is a known incident" only from a truthful source — specify what that source is and what the bot says when it has none.

## 3. The work — numbered charges
**Q1. Define "best possible" measurably.** Requirements with numbers: grounded answers only (every factual answer cites the doc/FAQ/product fact it used; zero fabricated product behaviour); zero privileged actions reachable from the chat (structurally: the bot's tool set contains no auth/account/recovery/contact mutation — list the allowed low-risk actions exhaustively); first-response latency; resolution and deflection rate targets and how they are measured; escalation-to-human with the full transcript and a one-paragraph summary within a bound; languages (ro + en) with detection; tone rules; refusal rules; an EVALUATION SET (N scripted conversations with expected outcomes, including injection attempts and zone-adjacent requests) that gates every release — say N and who authors it (an independent Fable seat, never the coder).
**Q2. Knowledge.** What the bot may ground on: product docs in the repo (name them), a curated FAQ (who writes it, where it lives, how it is versioned), the user's OWN debates and runs with the user's consent and only within their session (specify the consent and scoping rule), the ObservationAgent's public incident state. What it may NEVER ground on: other users' data, the security zone, raw provider payloads, agent boards.
**Q3. Architecture-neutral surface.** Where the bot lives for the user (a widget on which routes; anonymous vs signed-in), the API shape as REQUIREMENTS (session scoping, rate limits per IP and per account, abuse controls, transcript storage and retention, the escalation record), and the human console V uses in phase 1 (an inbox: board ticket, admin page, or digest — requirements for each, your pick).
**Q4. Injection and safety.** Threat list (prompt injection via user text, via the user's own debate content, via FAQ poisoning; data exfiltration; social engineering toward recovery) and the structural defence per threat. Bot B (V-4): full specification as a later phase, with the one-way evidence diode stated precisely and the phase-1 human fallback that replaces it.
**Q5. Model path (V-2).** Relay-only variant vs key-based variant: latency, concurrency, cost per conversation (cite or UNVERIFIED), availability, secrets governance. Recommendation with counter.
**Q6. Vertical slices `SUP-01 … SUP-nn`** — each a beginning and an end V can run ("open `/` as an anonymous visitor, ask 'how do I publish a debate?', receive a grounded answer citing the public-debates doc within N s; ask 'reset my password', receive the refusal + the signed-in path; type an injection payload, see it refused and the attempt recorded"). SUP-01 = the smallest complete proof (grounded Q&A on docs, one route, with the eval set gating it). Per slice: `SUP-nn-R01…`, states, V-runnable acceptance steps, out of scope, parallel-safety (single-writer rule). Create `slices/SUP-nn/{SPEC,PLAN,PROGRESS,DECISIONS}.md` exactly as COMMON §4 defines them.
**Q7. Contested decisions for V** — table: id, plain-words question, options, your pick, confidence, strongest counter. Collect; do not ask.
**Q8. Compass block** — `requirements/supportagent-compass-block.md`, ≤25 lines: one line per slice (code, name, what V will see) and pointers to your files.

## 4. Output skeleton — `requirements/supportagent.md` (exact headings)
```
# SupportAgent — requirements (observability-agents)
## Verdict summary                 (≤10 lines)
## Q1 Quality, measurably          (table: requirement · number · how measured)
## Q2 Knowledge sources            (allowed / forbidden tables)
## Q3 Surface, API, human console
## Q4 Threats and structural defences   (table: threat · defence · phase)
## Q5 Model path under DR-179     (table + recommendation)
## Q6 Vertical slices              (table: code · name · V acceptance in one line · parallel-safe with)
## Q7 Contested decisions for V    (table)
## Ranked recommendations          (top 10; VERDICT / CONFIDENCE / STRONGEST COUNTER)
## UNVERIFIED / gaps
```

## 5. Handoff
Post `READY FOR PEER REVIEW` on `t_217e59bf` (and append it to `supportagent.md` under `## Handoff`), OPENING with `SKILLS LOADED: <list>`, then: the slice table · per-slice requirement count vs PLAN-scaffold trace rows (equal) · contradictions found (target zero, both sides quoted) · packet defects in THIS packet · `comments read through: <n>`. Self-report first (COMMON §5). Then stop.

## 6. Stop conditions
COMMON §6, plus: `BLOCKED` if any charge cannot be answered without proposing a change inside the security zone — state the boundary you hit instead, and continue with the rest.
