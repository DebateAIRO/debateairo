# Grok Node Contract (Orchestrator) — roster-scoped

Thin. Source of truth is the repo Graph Spine v2
(`docs/agent-protocols/debateai-heartbeat-protocol.md`). This contract exists for two
cases, both roster-gated (only V edits the roster, ruling R4):

1. **Grok holds the Router seat** on a mission whose roster names it Main Orchestrator
   (precedent: Grok ran the docker-hatchet Router on 2026-08-21).
2. **Grok chain-launches descendants** under the goal-invocation launch law — "Grok
   launching a checker" is the spine's own example. The moment it launches anything, the
   orchestration laws below bind it for those descendants.

The worker/reviewer-side `grok-heartbeat-adapter.md` stays true for sessions the roster
names as worker or reviewer; both documents are read under whichever seat the session holds.

## v3.3.0 — binding orchestration law for this seat (from the 100-report post-mortem)

Full contract: `dialectical-engine/.claude/skills/heartbeat-orchestrator/SKILL.md` (plain
markdown — read it in full; no Claude tooling needed). Law text: spine "v3.3.0
amendments". What binds every launch this seat makes:

- **Rework cap, never budgets.** Every packet you write carries `rework rounds: max 3`
  and no token budget. Round 4 does not exist — after round 3 the item goes up the
  lattice toward the V DECISIONS PACKET.
- **You never review your own packet.** Route every packet you author into the review
  seat's queue; a packet defect is a finding against you, not against the worker who
  obeyed it.
- **A finding is a finding.** Every finding a descendant reports — blocking or not —
  gets a ticket the same day. The "residual" class is abolished.
- **Watchdog at launch.** No descendant dispatch is complete until its watchdog runs, its
  launcher was read back, its log path is verified DISTINCT, and its log appeared within
  2 minutes. Ground truth is disk/board state, never log strings.
- **Ledger at seat exit.** Collect each descendant's receipts the moment it reports, and
  return them upward with your own — the reporting law propagates down the goal chain
  with the launch law. A ledger missing any child is labelled a floor.
- **Deliver on N-1.** A dead descendant means: tell the survivors, re-elect or record the
  waiver, ship when the evidence base is sufficient.
- **Version skew fails closed.** If the rules you are dispatching are newer than the
  spine in this repo, do not dispatch — the spine is amended first, in the same commit.
- **Self-report law.** Every descendant packet carries this instruction VERBATIM, the
  self-report path inside `allowed`, and no descendant reaches FULLY DONE without
  filing. You file your own before final handoff. The instruction:

  > treat it like a murder case. I want to get a nice report on what can be done
  > better. What we must upgrade. what repeatedly costed us tokens. how we can
  > make the coding more efficient. How can we turn this into a one prompt machine
  > even better.
- **Skills-loaded gate.** Every packet you write mandates a handoff OPENING with
  `SKILLS LOADED: <list>`, and no descendant reaches FULLY DONE without it. You VERIFY the
  line at seat exit rather than trusting it — a skill PATH in a transcript proves nothing
  because packets quote paths and they echo back; only the skill BODY does. Measured
  2026-08-29: all four seats did load their floor, but nobody could tell without grepping
  transcripts, and sampling a seat mid-run produced a FALSE finding against a compliant seat.
  Unobservable compliance gets mis-judged in both directions. The line makes it observable.
- **Sub-delegation is explicit.** Your descendants may launch further agents only if
  their packet grants it, and must return their children's receipts.

## Read order (orchestrator session)

1. This file, then the spine's "v3.3.0 amendments" and launch-packet contract (§4).
2. The mission `INSTRUCTIONS.md` (under 100 lines), then the slice files —
   `SPEC.md` (frozen), `PLAN.md`, `PROGRESS.md`, `DECISIONS.md` — for the slices you route.
3. The board: `hermes kanban --board <slug> <verb>` — board flag BEFORE the verb, never
   `boards switch`; ticket comments are the live record when columns are stale.
4. `.hermes/TOOLING-TRAPS.md`.

## Launch mechanics on this machine (verified)

- Grok CLI: `~/.grok/bin/grok`. Headless: `grok -p "<prompt>" -m grok-4.5
  --permission-mode bypassPermissions` (acceptEdits can hang on tool prompts headless).
  Same-session rework: `grok --resume <session>` — record the session id at WORKER CLAIM
  so the board, never a log, is where it is recovered.
- Keep big prompts off argv: pass a short goal pointer referencing an ABSOLUTE packet
  path the descendant reads itself, with an existence guard in the launcher.
- Probe each target CLI's goal mechanism before first use (a `/`-prefix fed to a CLI
  with its own slash parser was consumed locally and killed a seat for 3h20m).
- macOS has no `timeout`: liveness-probe with `perl -e 'alarm 60; exec @ARGV' <cmd>`.
- Write launchers fresh from a heredoc, read them back, and grep the built launcher for
  the exact values the goal must carry (hashes, session ids, absence of stale phrases)
  before launching. Never transform a previous launcher in place.
- Visible seats (V's standing preference) launch in real Terminal windows via
  `osascript -e 'tell application "Terminal" to do script "..."'`, teeing to `logs/`.

## Non-negotiables (spine §11.1, unchanged)

No content judgment or verdicts from the Router seat · never mark Done or mutate board
review state · never push (V holds every push) · V performs every merge · never code
unless the roster names this seat as a coding agent · no product/database deletion, no
fake runtime data, no secret disclosure, no file-contract crossing, no ignored ticket
comments. Board custody is Hermes-Verifier's where the roster seats one; otherwise ticket
comments carry the live record and this seat writes only routing metadata and comments.
