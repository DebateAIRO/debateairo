# Conversational Support Agent intake
Measured 2026-09-14T08:08:01.557660+00:00. Owner request: [verbatim](OWNER-REQUEST.md).

## Mission authority and owner instructions
- Main orchestrator: gpt-6-astra. All investigation, implementation and review seats: gpt-5.6-sol; no substitutions.
- Separate author/reviewer sessions. Sol for both is the owner's knowing choice; no claim of model-family independence.
- Implementation is authorized. The source audit-only restriction is superseded. The existing Support interface is the approved design of record; no new mock-approval gate or redesign.
- Dedicated mission, board, scoped worktrees, local baseline commits, branch integration, tests and a local review stack are authorized by the request. Preserve all original dirty work. No push, publication or production deploy.
- Three coherent checkpoint bundles, then a separate final whole-product verification. Complete and integrate CP1 before its review and local preview. CP2 waits on explicit CP1 acceptance; CP3 waits on explicit CP2 acceptance.
- At the checkpoint gate record WAITING_FOR_USER_VERIFICATION, notify once, then stay quiet. Silence/heartbeat/reviewer PASS cannot accept or bypass a gate.
- Forgot password exists per owner. Verify and reuse its existing destination; no replacement, settings/MFA substitution, guessed URL or default human escalation. Ask specifically for destination if still unresolved, continue independent work.
- Runtime Support model stays unchanged. Preserve consent/ownership, encryption/shredding, admission/spend, degraded behavior, human handoff. Credential restrictions need server enforcement and capability restrictions.
- No agent sends messages outside the mission board; board comments are authorized workflow records.

## Measured current state
- Source project /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; Git root /Users/vladmihaimiron/Documents/DebateAIRO; branch integration/debate-tiers; HEAD 446c685e977104ecf2b0b5ee0519f7123968429f.
- git status --porcelain=v1: 155 entries. Full evidence: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/intake-status.txt.
- lsof -nP -iTCP -sTCP:LISTEN recorded in evidence/intake-listeners.txt. Existing app ports 3001, 8790–8796 and other listeners are no-touch.
- Baseline will snapshot current tracked product/test changes plus relevant untracked product tests into an isolated lane. Original index and source files stay intact. SHA256 manifest records attribution.
- Concurrency: at most 3 child seats; heavy-command semaphore from spine = 1. No simultaneous test/build/install operations.
- Transport: native collaboration spawn_agent, model explicit; followup_task resumes authors; completion events deliver automatically. No separate CLI or desktop windows needed. Watchdog state persisted, driven by agent events; 20 minute stall requires actual lack of progress, never user gate.

## Starting specification (read in full by orchestrator)
1. docs/superpowers/research/2026-09-14-support-agent-audit.md
2. docs/superpowers/research/2026-09-14-support-agent-product-map.md
3. docs/superpowers/plans/2026-09-14-support-agent-conversation.md

## Contradiction and dependency register
- Older model/relay/dual-family defaults superseded by explicit owner roster.
- Older mock and serve gates already authorized by owner design/stack instructions.
- CP1 needs minimal UI, deterministic intent routing and response safety from later plan tasks to demonstrate navigation. Bring those prerequisites forward; broad history/conversation and full accounting remain CP2.
- New knowledge may be peer-reviewed for preview but must not be labeled owner-ratified. Loader metadata must represent real review provenance.
- Forgot password location unresolved at intake, investigation first; destination-dependent work waits for evidence, independent knowledge work continues.
- No repeated audit: only targeted current-product revalidation.

## Functional bundles
- CP1: catalog, reviewed bilingual knowledge with provenance, safe clickable navigation, existing Forgot password entry, necessary safety/UI integration, local functional demonstration.
- CP2: bounded session conversation, paraphrases/follow-ups, validated sources/actions, credential boundary, private status/handoff, outcomes/persistence/accounting.
- CP3: remaining Help/status/SLA/suggestions, integrated and boundary tests, real-relay EN/RO evaluation, preview walkthrough and release/rollback directions.
