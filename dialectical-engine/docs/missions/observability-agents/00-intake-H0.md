# H0 INTAKE — mission `observability-agents`

- **Date:** 2026-09-01 · **Orchestrator:** Claude Code, Fable 5.1 (Claude-Router seat) · **Spine:** v3.4.0 (v3.3.0 at intake; the vertical-slice skew was closed the same evening — see the protocol commit) · **Board:** `observability-agents` (Hermes Kanban :9119)
- **Predecessor:** `2026-08-21-observability-loop` (capture layer + error-listener loop). Stalled since 2026-08-27 on RP-0, V's own custodian act. This mission ABSORBS its remaining scope as the **FixAgent** product and adds two new products.

## V's goal (verbatim, `/goal`, 2026-09-01)

> You are Fable orchestrating the following mission : we need an observability mission, a FixAgent, ObservartionAgent and a SupportAgent.
>
> Observability: We will have an agent that checks our metrics and our observability part + the infrastructure and another one that only checks errors. These are two standalone components. I want the best possible agents in this regard that will ensure that my platform is the fastest when it comes to observability and bug fixing. Initially I want to be in charge of everything. Also I want the best possible customer support chatbot.
>
> if needed use /heartbeat. I want the coding fleet to contain Fable 5.1 agents for review, Codex 5. 6 Sol coders. Plans, architecture, are owned by Fable 5,1 agents.
>
> Check if observability is done, and if updates are needed please do as such. and try doing as many parallel tasks as possible,
>
> Use Fable 5.1 subagents for any necessary work

## Classification (set ONCE — spine §5.5)

```yaml
risk_tier: high            # persistence/migrations (obs, metrics, support tables) · architecture (three standing
                           # agents, new cross-cutting subsystems) · provider spend (LLM-driven agents) ·
                           # the SupportAgent borders security governance → escalate-only there
planning_tier: 2
never_tierable_down: true
```

## R7 election — V answered inline; recorded verbatim, no preset

```yaml
loop_ownership:
  orchestrator: claude-fable-5.1          # this session — routes, launches, assembles; no verdicts, no code
  requirements: [claude-fable-5.1]        # three parallel seats, one per product, then one synthesis seat
  architecture: [claude-fable-5.1]        # "Plans, architecture, are owned by Fable 5,1 agents"
  programming:  [codex@gpt-5.6-sol]       # "Codex 5. 6 Sol coders"
  review:       [claude-fable-5.1]        # "Fable 5.1 agents for review"
  qa:           [V]                       # "Initially I want to be in charge of everything"
```

**Roster decorrelation (recorded):** plans and their review share a base model (Fable 5.1). V chose this knowingly by naming Fable 5.1 for both. Decorrelation is therefore by prompt, separate session, and probe-not-read only — weaker than a cross-house diamond. Codex remains the only coder, so code review IS cross-house.

**Seat transport, probed 2026-09-01:** Fable seats = Claude Code subagents (Agent tool, background, one session each, skills invoked via the Skill tool). Codex = `/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' … < /dev/null` — probe returned `CODEX-SOL-OK` on codex-cli 0.148.0-alpha.9. Hermes runs store-only (Kanban); no Hermes agent seat is elected, so **closing sub-tickets is the orchestrator's duty; slice tickets close only on V's veto.**

## Measured state at intake (2026-09-01, dev @ `8d38185c`)

> **Tree moved during intake (recorded 23:50).** A concurrent `ui-overhaul` session committed six times on `dev` between 23:30 and 23:35 — `3e7d83e9` consolidated the 111 dirty UI entries, `690ebe14` and `1c1039d5` merged `slice/t3` and `slice/t5`, and `c25e8803` / `f03ded2d` / `b5a6b6eb` swept three of this mission's in-progress packets into commits with wrong messages ("supplier requirements packet" = REQ-SUP). The orchestrator then committed the spine amendment `4f764037`. Seats were told on their tickets to cite the HEAD they measured on. The figures below describe `8d38185c`.

- `dev` is 86 commits ahead of `origin/dev`; 111 dirty working-tree entries belong to `ui-overhaul` (in flight, untouched here).
- **D12 demo** (the predecessor's V-runnable demo): `PASSED 6 / FAILED 1 / SKIPPED 21`, exit 1 — full log `logs/d12-demo-2026-09-01.log`. Stage 16 (D6, textual half) FAILED: `packages/obs-capture/src/zone/manifest.ts` names zone prefixes. The 2026-08-27 run passed 7/0/21 before S04's manifest was merged. Settled by AUDIT-STATE (charge D).
- **G1 capture:** package landed (`packages/obs-capture`: registry, emit, queue, flusher, redactor, spool, health, zone; five installers; migration `0034_obs_foundation.sql`). Runtime wiring (S05b) and every binding (S06 runner, S08 api, S09 client, S10 scheduler, S11 provider) ABSENT. **G2 listener, G3 dispatch, G4/G5 fix arms: ABSENT.** Root preservation is impossible today: `TypedDomainError` discards `cause` (S07 owns it).
- **RP-0** (`t_4deda7ab`, board `observability-loop`): still `blocked`, one Router comment (2026-08-26), no hash posted by V. S02 addendum, S05b, S06, S07 all wait on it.
- **Infra live:** `debateai-v3-postgres-1` (127.0.0.1:55432, healthy 6 days) · `debateai-v3-hatchet-lite-1` (7077 gRPC, 8888 dashboard). The https dev stack on :3000 is DOWN; no API answers. **No `/metrics`, Prometheus, OpenTelemetry, or statsd anywhere in `apps/**` or `packages/**`. No customer-support surface anywhere.** Existing "does it work" signals: scheduler jobs `liveness-sweep`, `settlement-watch`, `replay-self-test`; `packages/liveness` (product staleness, not infra).
- **Fleet:** zero agent seats alive at intake. Predecessor worktrees present (`obs-lane-1/2/3`, three S05 lenses); `obs-lane-3` carries UNCOMMITTED S06 work — nothing pruned.

## Contradiction check — orchestrator duty, resolved or routed NOW (one seat's cost, not N)

| # | Conflict | Disposition |
|---|---|---|
| C1 | Predecessor D11 "a QUICK fix merges into `dev` unattended" vs V today: "Initially I want to be in charge of everything" | **RESOLVED — newer statement wins.** Every agent action is approval-first in phase 1: the agent files a ticket / opens a proposal or PR, V decides. D11 becomes a V-flipped later phase; nothing merges without V until V flips it. Row V-1 asks only for confirmation. |
| C2 | "best possible customer support chatbot" vs DR-179 (no API keys; CLI relay is the only lawful model access) | **ROUTED — row V-2.** REQ-SUP specifies both variants (relay-only vs hold lifted for the support bot). |
| C3 | "two standalone components" vs a shared observability store | **RESOLVED by definition.** Standalone = separately deployable, startable, killable processes with their own kill switch; a shared read-only store is not coupling. Written into both SPECs. |
| C4 | FixAgent "only checks errors" vs predecessor D3/D4 ("it just doesn't work" stalls; blind-period counters) | **ROUTED — row V-3.** Orchestrator default: ObservationAgent owns detection (metrics/infra side) and emits a typed signal; FixAgent consumes only error/defect-shaped input. REQ-FIX and REQ-OBS each state the interface they need; a disagreement is the row's evidence. |
| C5 | SupportAgent "Bot B: isolated VM, no egress" (V's 2026-08-17 two-bot design) vs infrastructure the product does not have | **ROUTED — row V-4.** REQ-SUP scopes phase 1 to Bot A + human escalation; Bot B stays design-only until V funds it. |
| C6 | Same base model authors and reviews plans | **RECORDED** (decorrelation note above). |
| C7 | Predecessor's remaining slice tickets (S05b…S30) are sub-ticket-shaped; vertical-slice law wants slice tickets with V-veto Done | **RESOLVED.** FIX-slices are created fresh on this board, each citing the S-tickets it absorbs. The old board is reconciled from AUDIT-STATE's receipts and kept as history. |

## Intake completeness (spine v3.3.0 item 9)

`[x]` R7 election · `[x]` contradiction check · `[x]` per-CLI probe (Codex; Claude subagents are in-harness) · `[x]` decorrelation recorded · `[x]` typed ticket per seat · `[x]` `rework rounds: max 3` in every packet · `[x]` self-report path in every `allowed` list · `[x]` `SKILLS LOADED` opening mandated · `[x]` watchdog armed at launch (`logs/watchdog.sh`) · `[ ]` compass + slice files (REQ seats, in flight) · `[ ]` slice tickets (created after REQ review) · `[ ]` packet review by the review seat (wave 2)

## ROSTER CHANGE — V, 2026-09-02 (IMPORTANT OPERATION, roster law R4: only V edits the roster)

V's words: *"continue with the rest of the goal using Fable 5.1 as orchestrator and Opus 5 and Codex Sol Max as coders and reviewers"*, then, after switching this session's model, *"restart the mission with Opus 5"*. The later instruction governs, and it is also the only workable one: all three Fable 5.1 requirements seats were killed at ~00:11 by a **Fable session limit** (HTTP 429, "resets 2:30am"), which is a provider-side cap on that model, not a fault of the seats.

```yaml
loop_ownership:                       # 2026-09-02 13:35, FINAL — restores V's standing goal text
  orchestrator: claude-fable-5.1      # V's goal names Fable 5.1; this session's model is set by V via /model
  requirements: [claude-fable-5.1]    # DONE (wave 1); the OBS completion seat is also Fable 5.1
  architecture: [claude-fable-5.1]    # "Plans, architecture, are owned by Fable 5,1 agents" — restored
  programming:  [codex@gpt-5.6-sol-xhigh]                  # "Codex Sol Max" = gpt-5.6-sol @ reasoning_effort=xhigh
  review:       [claude-fable-5.1, codex@gpt-5.6-sol-xhigh, claude-opus-5]
  qa:           [V]
```

**Why this moved twice in one day, recorded so nobody re-derives it.** The 00:11 Fable session limit killed three seats, and at 10:20 the mission was restarted on Opus 5 because Fable was still capped. The Opus limit then killed four architecture seats at 12:30. **Both caps have since reset**, and V's standing goal text puts plans, architecture and review on Fable 5.1 — so the roster is restored to it. Codex Sol Max runs on a separate account and was never affected by either cap; that is why coding and one review lane live there permanently. The durable lesson is in the ledger: a fleet whose seats all draw on one provider account has one point of failure, and the only defence that actually worked was writing artifacts to disk incrementally (COMMON §4b).

**Decorrelation, improved by this change.** Wave 1's requirements were authored by Fable 5.1; their reviewers are now **Codex Sol Max**, a genuinely different house — stronger than the same-base-model diamond recorded at intake. Architecture authored by Opus 5 is reviewed by Codex Sol Max; code written by Codex Sol Max is reviewed by Opus 5. No seat reviews its own house's work on the same artifact.

**Probe, 2026-09-02 10:20 EEST:** `codex exec -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"'` returned `SOLMAX-OK`. Codex runs on a separate provider account, so it is unaffected by the Anthropic session limit — this is why review and coding lanes are placed there.

## Wave-1 outcome (2026-09-02 00:11)

| Seat | Ticket | Outcome | Artifacts on disk | Self-report | Handoff comment |
|---|---|---|---|---|---|
| AUDIT-STATE | `t_0d8634a7` | **COMPLETE** | audit + 4 logs + 2 trap entries | yes | yes |
| REQ-FIX | `t_80ef9dec` | killed by the limit AFTER writing everything | `fixagent.md`, compass, **16 slices × 4 files** | yes | no |
| REQ-SUP | `t_217e59bf` | killed by the limit AFTER writing everything | `supportagent.md`, compass, **7 slices × 4 files** | yes | no |
| REQ-OBS | `t_3af6affd` | killed mid-work | `observationagent.md`, compass declaring **OBS-01..07**; only OBS-01, OBS-02 written | no | no |

All of it is committed at `d626538c`. REQ-FIX and REQ-SUP go to review as delivered; REQ-OBS is completed by a transcription seat (`REQ-OBS-FINISH`) that may not re-open the frozen requirements.

## Wave 1 dispatch — 2026-09-01

| Seat | Ticket | Role | Packet (absolute) |
|---|---|---|---|
| REQ-FIX | `t_80ef9dec` | requirements | `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/REQ-FIX.md` |
| REQ-OBS | `t_3af6affd` | requirements | `…/packets/REQ-OBS.md` |
| REQ-SUP | `t_217e59bf` | requirements | `…/packets/REQ-SUP.md` |
| AUDIT-STATE | `t_0d8634a7` | verification | `…/packets/AUDIT-STATE.md` |
| V-DECISIONS | `t_a273e880` | V | `docs/missions/observability-agents/V-DECISIONS-PACKET.md` |

**Finding F-01 (t_b701a8e9, 23:50):** REQ-SUP fanned out three read-only `Explore` children on model `opus` without a grant; disposition = disclosure duty + review check P8b, class fixed in COMMON §3 (bounded read-only fan-out, model `fable`, receipts). No other seat spawned children.

Wave 2 (after wave 1 lands; tickets pre-created 2026-09-01 23:52): REQ-REV-FIX `t_ca8c42be` · REQ-REV-OBS `t_f1236b44` · REQ-REV-SUP `t_d819e88e` — Fable 5.1 blind reviewers, one per product, each also reviewing the packet that dispatched the work (packets `…/packets/REQ-REV-{FIX,OBS,SUP}.md`) · REQ-SYNTH `t_63e08f55` — assembles `INSTRUCTIONS.md` (≤100 lines) from the three compass blocks (packet `…/packets/REQ-SYNTH.md`) · slice tickets created on this board · ARCH seats per slice · Codex fleets per slice in one worktree each.
