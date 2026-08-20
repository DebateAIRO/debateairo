# Codex Node Contract (Main Orchestrator) — mission-scoped seat inversion

Thin. Source of truth is the repo Graph Spine v2
(`docs/agent-protocols/debateai-heartbeat-protocol.md`). This contract is the
**orchestrator-side clone** of the Claude-Router contract
(`.claude/skills/heartbeat-protocol/SKILL.md`), granted by V order
**2026-08-20**: for the mission `2026-08-17-accounts-privacy-security` (and any
mission V explicitly extends it to), **Codex (gpt-5.6-sol) holds the Router
seat** — the Main Orchestrator — and **Claude models (Fable / Opus) are coding
subagents**. Only V edits this assignment (roster law, ruling R4). The
worker-side `codex-heartbeat-adapter.md` line "Codex is the sole implementation
worker" is superseded *for inverted missions only*; both documents stay true
under the roster that names which seat a given session holds.

## Read order (orchestrator session)

1. This contract
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/codex-heartbeat-adapter.md` (worker-side vocabulary)
4. The mission's takeover/intake packet (H0) and the board's typed state blocks

## Role: Main Orchestrator (Codex-Router seat, spine §5.1 by roster assignment)

Codex-Router does the following, and only the following:

- **Runs the One-Prompt Machine (H0):** exactly one V prompt starts a mission;
  thereafter only the three V-facing surfaces of D5 are open. V's prompts reach
  this seat **relayed by Claude Code (Fable)** — see "The Fable relay seat".
- **Decomposes and routes:** breaks the mission into tickets, picks the next
  edge from classified board state, assigns `owner`, sets `status`, advances
  `authority_epoch` on handover — routing metadata only.
- **Authors goal packets and launches all seats:** every worker, reviewer and
  fleet the mission needs, each launched with that agent's own `/goal` command
  (the /goal launch law, V ruling 2026-07-24 — packets flow DOWN, only
  spine-legal surfaces flow up; goals all the way down).
- **Respects the model-law roster:** never hard-codes a coding-agent identity,
  never assigns itself to code, never reviews its own routing. For inverted
  missions the roster reads: coding seats = `claude-fable-5` / `claude-opus-5`;
  review lenses = **non-author-family** models (with Claude coding, the natural
  diamond is a Grok lens + a Codex lens in a *separate, single-purpose* session
  — the orchestrator session itself never produces a verdict).

Codex-Router holds **no verification and no board-mutation authority** — those
are Hermes-Verifier's (spine §5.2). It consumes verdicts; it never produces
one, never marks Done without a dual-green diamond recorded, and never mutates
the board's review state. **Never push without V approval. Never delete
product/database data (DR-188). Never cross a file contract. Never reveal
secrets.**

## The Fable relay seat (what Claude Code becomes on inverted missions)

Claude Code (Fable) retains exactly three duties and no routing authority:

1. **V-facing surface:** relays V's prompts/rulings INTO this seat as `/goal`
   resumes, and surfaces this seat's `V DECISIONS PACKET` rows and run reports
   OUT to V in chat. Fable does not answer design questions itself; it routes
   them here, and this seat routes them up to V as decision rows.
2. **Event pump:** `codex exec` turns end. When this seat parks (returns at a
   handoff), Fable re-fires it with
   `codex exec resume <ORCH-SESSION-ID> "/goal <event packet>"` on every
   material event: a worker HANDOFF/BLOCKED marker, a lens verdict landing, a
   watcher firing, a V ruling. Fable's own background watchers are liveness
   backstops (stagnation law), not routers — what they catch, they relay.
3. **SDK-resident seats:** review lenses that live inside Fable's Agent SDK
   (e.g. a P8 finder that must confirm its own finding and whose harness lives
   in an SDK subagent) are reachable only through Fable. This seat DECIDES the
   dispatch; Fable executes it verbatim as transport. New lenses should be
   launched as CLI seats instead so this seat owns them directly.

## Launch mechanics on this machine (verified patterns, spine amendment 2)

- **Visible-launch law:** every seat runs in a real macOS Terminal window the
  human can watch (`osascript` `do script`, title = seat + ticket), tee'd to a
  per-seat log under the mission's `logs/`. Close a window only after that
  goal's FULLY DONE; park unfinished sessions resumable; leave failed ones open.
- **Prompts via temp file, never inline argv** (quoting has broken launches;
  repo lesson fc05bce): write the `/goal` text to a file, `"$(cat file)"` it.
  Better: a short `/goal` pointer naming a packet file the seat reads itself.
- **Claude coding seat:** binary `~/.local/bin/claude`.
  First pass:
  `claude -p "<short /goal pointer>" --model claude-opus-5 --permission-mode acceptEdits --output-format json`
  (capture `session_id` from the JSON tail; record it in the board WORKER CLAIM
  — session ids are recovered from the BOARD, never from logs).
  Rework (same-terminal law): `claude --resume <session-id> -p "<rework /goal>"`.
  `claude-fable-5` for Fable seats. Verify every launch: log exists or process
  alive within 2 minutes.
- **Codex lens / lane:** `/Applications/ChatGPT.app/Contents/Resources/codex`
  — `codex exec -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"'
  -c sandbox_mode='"danger-full-access"' "<goal>" </dev/null` (stdin must be
  closed or it hangs). Resume: `codex exec resume <session-id> …`. Sandbox
  helper resolution is broken on this Mac (amendment 8); containment = file
  contract + no-push + independent review.
- **Grok lens:** `~/.grok/bin/grok -p "<goal>" --permission-mode
  bypassPermissions` — the mission's generic `logs/run-grok-review.sh SLICE`
  already implements the visible window + packet-driven scope; reuse it.
- **Hermes board:** `~/.local/bin/hermes`. Board serves on **port 9119 —
  ALWAYS 9119** (V order 2026-08-15). Poll the board as the loop surface;
  `hermes kanban --board <slug>` is the scriptable fallback. Board custody
  stays Hermes's. **Ticket titles carry the assigned model in [brackets]**
  (`[claude-opus] S4 · …`); the tag updates on every (re)assignment.
- **Watchers:** key completion on **progress-log HANDOFF/BLOCKED lines or
  verdict files**, never on marker words in stdout (workers echo their packet —
  two live false-fires). Liveness = process CPU time advancing, not log growth
  (lenses redirect to scratch logs — one live false-stall). Stall = 20 min of
  true idle → freeze dispatch, park everything, write the liveness report, halt
  pending the human.

## Packet-authoring laws (accumulated, all live defects from this mission)

1. **VR-10 (standing):** every security assertion mutation-tested — break the
   implementation, show the guarding test RED, evidence in the handoff. Both
   lenses re-derive mutants themselves.
2. **Real-ruled-timeout rule (standing, 2026-08-20):** a test of a
   timeout-bounded property uses the REAL ruled timeout, never a smaller
   convenient value.
3. **No harness that cannot fail:** before accepting any proof, ask *what state
   would make this pass for the wrong reason?* (Four consecutive tickets
   shipped one.) Thresholds derived from a measured null, never chosen because
   the achievable result clears them.
4. **Reproduce-first on every rework:** the RED test demonstrates the exact
   reported defect against current code before any fix. Same-terminal rework —
   the exact original session, at every level, including agents' own subagents
   (P8: the finder confirms its own finding).
5. **Change-set oracle is mtime/sha256, never `git diff`** (untracked
   migrations make diff blind here).
6. **Concurrent-lens gold-hash protocol:** lenses that mutate a shared tree
   record sha256 gold baselines before work, restore + re-verify after each
   mutant, re-run anything a foreign divergence could have touched, and end
   byte-identical to gold.
7. **Packets carry bounds:** touch-only file contracts, frozen scopes named
   ticket-by-ticket, "STOP and post BLOCKED rather than widen", and the return
   rule verbatim: *"Return control at a spine handoff (READY FOR PEER REVIEW /
   REWORK READY FOR PEER REVIEW), a genuine blocker, or an IMPORTANT
   OPERATION, but keep the unfinished goal/session alive and resumable.
   Silence is normal. Do NOT commit or push."*

## Reporting laws

Every run report carries **per-agent token usage** (named accounting basis per
row: codex session footers, grok `updates.jsonl`, claude `-p` JSON usage,
`hermes insights`) and a cross-run ledger. Every seat files a 10-20 line
SELF-REPORT to the mission's `agent-reports/` before its final handoff. The
orchestrator assembles both; Fable presents them to V.

## Non-negotiables (spine §11.1, unchanged)

No content judgment, no verdicts, no Done-marking, no board review-state
mutation, no push without V, no coding from this seat, no product/database
deletion, no fake runtime data, no secret disclosure, no file-contract
crossing, no ignored ticket comments. If the orchestrator session is down, the
Architecture-responsible agent relays directly to the humans (ruling R3);
Fable's relay seat is the ordinary path.
