# GUIDE_HARNESS_FIX evidence

- Node: `GUIDE_HARNESS_FIX`
- Ticket: `t_ca041a3c`
- Final product revision verified: `8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6`
- Verdict: `PASS` for the bounded inert harness controls. This is not a live-preview or checkpoint-readiness verdict.
- Completed: `2026-09-17T13:08:08Z`

## Result

The corrected harness preserves the 54 canonical prompts and 20 inventory families while scheduling them once across five sessions. Request starts are spaced by at least 31 seconds, navigation and injection rows terminate their session groups, and the model-routed ceiling is 42. Injection rows are deterministic refusals. Canonical row order and execution order are separate.

The final product-bound branch verifier loaded the clean checkout at `8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6` and confirmed all 54 rows against the final classifier, public-guide boundary, and recovery-intent modules. The final branch counts are 42 model, 2 private-record deterministic refusals, 2 prompt-injection deterministic refusals, and 8 recovery deterministic outcomes. The earlier immutable `9bf56f95711d19e6405fff5db06c4ad3d606bd68` review exposed public navigation refusals for active-session and Romanian account-deletion prompts; those were routed as product defects rather than normalized into the harness. The final branch control proves those rows now follow their expected public branches.

## Capacity contract

`runtime-capacity.mjs` provides an inert, dependency-injected fixed-key reader for later LIVE use. It combines the supported public status projection with one counts-only read-only aggregate. Its output excludes identities, messages, credentials, and raw records. The verifier binds exact revision, KB/snapshot versions, freshness, enabled model configuration, five available anonymous session slots, 54-message admission, at least 14 messages per session, 84-character message support, at least 54 daily calls remaining, at least 42 model calls remaining, relay availability, queue depth, injection-lock threshold, absence of cooldown, and absence of live waiters.

The runtime reader was prepared but not executed. No database, HTTP, browser, model, provider, preview lifecycle, or secret-environment action occurred. Product bytes, services, counters, limits, and Git state were unchanged.

After the control frame, root requested an explicit materialization contract for separate harness review. `README.md` and `gate-contract.json` now state that all static gate fields are frozen first, the runtime capacity is measured only after supported stack readiness, and a new final gate adds exactly `runtimeCapacityPath` and `runtimeCapacitySha256`. They name the single status read, single counts-only call, 120-second freshness interval, five-second future-skew allowance, and fixed-field equality checks. This was a documentation/contract clarification of the existing reader and verifier; executable harness files and the passing control log were unchanged and the heavy frame was not repeated.

## Verification

Command:

```text
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_HARNESS_FIX-controls-final.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX/verify-guide-harness.mjs /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine 8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6
```

Result: `rc=0`; 54/54 positive and known-bad controls passed. The immutable log SHA-256 is `17c0ccb812c1144d2cc108cb6173f3eec516c034e6efcdb3426a9537ef9adfc9`.

The controls cover exact inventory and language/surface membership; five-session grouping; exact-once execution; terminal navigation ordering; rolling-window pacing; model ceiling; prompt and branch mutations; private, recovery, injection, model, API/DOM and diagnostic attribution; fixed-key capacity projection and one-read orchestration; stale, occupied, cooldown, waiter, relay, queue and quota failures; gate exactness; receipt membership; capture syntax; and exact final product branches.

## LIVE handoff

LIVE must supply the gate's exact final revision, KB and full-snapshot digests, exact required suite receipt, this control proof, and a fresh exact-key runtime-capacity measurement before sending any Support request. A failed or stale capacity predicate stops the capture. The harness neither clears counters nor bypasses limits. The final actual capture remains a separate authorized node.
