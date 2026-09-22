/heartbeat-orchestrator

Orchestrate implementation of the conversational Support Agent for DebateAIRO.

This is implementation authorization. The earlier “audit and implementation plan only” restriction applied to the research task and is superseded by this instruction.

MODEL ROSTER

- Main orchestrator: GPT-6 Astra (`gpt-6-astra`).
- Implementation, investigation and review subagents: GPT-5.6 Sol (`gpt-5.6-sol`).
- Use separate author and reviewer sessions. I knowingly choose Sol for both roles; do not describe these reviews as independent model-family reviews.
- Astra coordinates, resolves dependencies, consumes evidence and prepares my checkpoints. Delegate implementation to Sol.
- Respect available concurrency and the repository’s heavy-command limit. Parallelize only work with compatible file ownership.
- Do not silently substitute models. If a requested model is unavailable, report that specific blocker.

READ FIRST

Repository:
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Load the repository’s heartbeat-protocol and heartbeat-orchestrator skills, then read:

1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/superpowers/research/2026-09-14-support-agent-audit.md`
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/superpowers/research/2026-09-14-support-agent-product-map.md`
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/superpowers/plans/2026-09-14-support-agent-conversation.md`

Use these as the starting specification. Revalidate changing facts against the current implementation; do not repeat the entire audit or assume its old baseline is still current.

Create a dedicated mission, dependency-linked board tickets, scoped worktrees, dispatch packets, evidence records and progress ledger using the heartbeat workflow. Preserve existing uncommitted work and include the intended current product changes in the implementation baseline.

PRODUCT OBJECTIVE

The Support Agent must answer naturally, understand paraphrases and follow-ups, and know the app’s real navigation, supported actions, prerequisites and limitations.

Keep product claims grounded in reviewed English/Romanian knowledge. Preserve the existing support model unless a separate change is approved; the orchestration roster above does not change the chatbot’s runtime model.

Preserve consent, ownership checks, encryption, shredding, rate limits, spend controls, degraded behavior and human escalation.

The chatbot must never generate, retrieve, solicit, validate, echo or submit passwords, verification codes, OTP/TOTP values, recovery codes, reset tokens or other credentials. It must never execute or claim to have executed a password reset or account-security change. Enforce this through capability restrictions and server-side response validation, not merely a prompt.

IMPORTANT OWNER CORRECTION

We already have a “Forgot password” flow.

Whenever a user expresses that intent, route them to the existing flow through its verified link or UI opener. Do not build a replacement, substitute Settings or the saved-MFA-code login option, or escalate to a human by default.

The audit did not locate its canonical entry in that checkout. Investigate the current implementation and target app early. If its location remains unresolved, ask me specifically for that destination while continuing independent work. Never guess the URL or declare the feature absent.

CHECKPOINT STRUCTURE

Turn the implementation plan into testable functional tickets grouped into these three bundles. Reorder internal dependencies when necessary, but keep each checkpoint coherent and reviewable.

Checkpoint 1 — Product knowledge and navigation
- Verified capability/route catalog and bilingual knowledge.
- Accurate supported/unsupported feature descriptions.
- Safe, clickable app navigation.
- Existing Forgot password flow connected to the appropriate intent.
- Reviewable knowledge changes with accurate provenance.

Checkpoint 2 — Natural, bounded conversation
- Paraphrases, greetings, clarifications and follow-ups work.
- Bounded, session-scoped conversation history.
- Validated responses, citations and navigation actions.
- Credential/reset prohibitions enforced.
- Existing private-status permissions and human handoff preserved.
- New outcome, persistence and accounting behavior integrated.

Checkpoint 3 — Complete release candidate
- Remaining Help UI, suggestions, status and SLA corrections.
- Integrated regression and boundary tests.
- Real-relay conversational evaluations in English and Romanian.
- Complete local preview and final acceptance walkthrough.
- Release/rollback instructions and honest remaining limitations.

Bring forward the necessary UI or validation work so a checkpoint demonstrates working behavior. A collection of unfinished backend pieces is not a completed functional bundle.

MY VERIFICATION GATES

Work autonomously within each bundle. Do not interrupt me for routine ticket assignments, implementation choices or individual completed tickets.

Keep the existing Support interface as the design of record; I approve implementing within its established patterns. Do not turn this into an unrelated visual redesign.

Before presenting a checkpoint:
1. Finish and integrate every required ticket.
2. Complete independent Sol review.
3. Fix blocking findings and rerun affected checks.
4. Verify the exact integrated revision.
5. Prepare a working local preview and a short manual test script.

This prompt authorizes starting the necessary local review stack on non-conflicting ports. Preserve other running services and use the repository’s supported stack lifecycle.

Then mark the bundle READY FOR USER VERIFICATION and send:
- What now works.
- Preview URL and exact branch/revision.
- Numbered steps I can follow, with expected results.
- Test and review evidence.
- Any remaining limitations or decisions.

PAUSE for my explicit acceptance or corrections. Silence, elapsed time, a heartbeat, or a reviewer PASS is not my approval. Do not advance to the next bundle or mark the checkpoint accepted while I am reviewing.

If I report defects, fix them within that checkpoint, revalidate, and return it for verification.

After I accept all bundles, present the integrated whole for a separate final verification. Do not push, publish, deploy to production or declare the mission accepted before my explicit authorization.

HEARTBEAT AND EXECUTION DISCIPLINE

Follow the repository’s event-driven heartbeat, board, packet and review workflow. Record my roster and checkpoint instructions as mission-specific owner instructions where older defaults differ.

Keep work resumable across interruptions. Consume completed agents, update dependencies, resume fix sessions where possible, and persist evidence as work progresses.

While waiting for my verification, record WAITING_FOR_USER_VERIFICATION and remain quiet until I respond. Heartbeats must not bypass that gate or repeatedly notify me about unchanged state.

Use meaningful tests, real integration evidence and synthetic credential-boundary probes. Do not claim live-model quality from mocked answers, or first-token latency from buffered completions. Do not mark knowledge as owner-ratified before I review it.

Begin intake and dispatch the first ready work. Carry Checkpoint 1 through implementation, review, testing and a working demonstration before handing it to me.