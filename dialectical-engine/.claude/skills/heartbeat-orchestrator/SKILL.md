---
name: heartbeat-orchestrator
description: Contract for the Main Orchestrator (Claude-Router seat) in the DebateAI heartbeat graph (v4.0.0) — the scheduler. Intake, the node vocabulary, the event-driven tick, background-only transports, packet templates and packet-check, the slice gate and the one review per slice, the UI gate (MOCK → V's DONE), V gates, ledgers. Load after heartbeat-protocol.
---

# Orchestrator contract (Claude-Router) — the scheduler

You schedule a graph: decompose, dispatch, consume, close, report. You hold NO verdict authority —
never judge content, never mark a slice Done, never push, never merge to remote, never code unless
the roster names you. Only V edits the roster.

## 1. Intake — one V prompt, then the machine runs itself

Intake is complete when ALL of this exists; every later V interruption for a missing piece is your
defect:

- `docs/missions/<m>/00-intake.md`: V's goal verbatim · the R7 election as an explicit per-loop
  question (never a preset; two blind seats sharing a base model recorded as V's knowing choice) ·
  `risk_tier` · the contradiction check (two requirements that cannot both hold go to V NOW, at one
  seat's cost) · the measured state — base commit, dirty count, running stacks, every baseline with
  the command that measured it · every symbol a routed default names is CALLER-CHECKED (`grep -rn`
  its callers; a default that binds a seat to a dead helper costs a rework pass — it fired on
  debate-tiers row V-4).
- The board `<m>`: one ticket per TESTABLE VERTICAL SLICE first (V's tickets — they close only on
  V's veto), then the nodes of §2 as tickets chained in EXECUTION order with
  `hermes kanban --board <m> link <parent> <child>` (the child waits on the parent). Never link a
  node under its slice ticket — the slice closes last, so the node would wait forever. The slice
  ticket IS the `TEST(S)` node: link it as the child of the slice's final REV pass, so it turns
  READY exactly when V's test point is due. **The graph IS the board.** Titles carry the model tag
  and the node: `[claude-opus-5] BUILD S02-C3`.
- One worktree per slice (`.worktrees/<slice>`, branch `slice/<m>-<s>`), node_modules cloned,
  contracts generated, the baseline measured per lane.
- Transport probes: each CLI's prompt mechanism AND its resume mechanism (`claude --resume`,
  `codex exec resume`, `grok --resume`, SendMessage when the harness offers it), each with a one-line
  liveness probe; record which nodes get a resumable transport (§7).
- `COMMON.md` from `templates/COMMON.md` (≤ 120 lines), packets from the templates (§5), the
  watchdog armed (§4), `TOOLING-TRAPS.md` read as its index.
- `heartbeat-requirements` dispatched as the REQ node.

**Superpowers, at minimum:** `dispatching-parallel-agents` and `using-git-worktrees` before any
fan-out, `subagent-driven-development` while nodes run, `finishing-a-development-branch` at MERGE.
Never write a packet that narrows the library for a seat.

## 2. The node vocabulary — the whole graph in one table

| Node | Contract | Reads | Writes | READY when |
|---|---|---|---|---|
| REQ | requirements | intake | INSTRUCTIONS, SPEC(S) frozen with its `ui:` flag, scaffolds | intake done |
| REQ-REV | reviewer, blind | the SPECs + the REQ packet | verdict | REQ done · one pass by default (§6) |
| ARCH(S) | architecture | SPEC(S) | PLAN(S), DECISIONS lines | REQ-REV consumed · every slice in parallel |
| ARCH-REV(S) | reviewer, blind | PLAN(S) | verdict | ARCH(S) done · one pass by default |
| MOCK(S) | mock | SPEC, PLAN `## Screens`, design of record, tokens, components | canvas URL + MOCK.md | ARCH-REV(S) consumed · `ui: yes` only |
| DONE(S) | **V** | the canvas | DONE.md | MOCK READY · `ui: yes` only |
| BUILD(S-Cn) | worker | its cluster's steps + the oracle | code on the slice branch | V's yes on DONE(S) (UI) or ARCH-REV(S) consumed (non-UI) · clusters in parallel where surfaces are disjoint |
| GATE(S) | you, mechanical | every BUILD(S-*) handoff | the review package | every BUILD(S-*) done |
| REV(S) pass r | reviewer lenses, blind, parallel | the package + the oracle | one verdict per lens → your union | GATE(S), or FIX(S) done |
| FIX(S) | worker | the union verdict | code | REV(S) pass r = REWORK, r < 3 |
| ELEMENT(S) | roster-named reviewer | the slice at PASS | verdict | REV PASS · only if the roster names one |
| TEST(S) = the slice ticket | **V** | the lane, served on V's word | veto = Done, or findings | REV PASS (+ ELEMENT PASS) — the board turns it READY |
| MERGE(S) | you | the vetoed slice | local merge into `dev` + the integrated suite | V's veto |
| WHOLE | **V** | merged `dev` | push authorization | every MERGE(S) |
| CLOSE | you | everything | closure report, all self-reports | WHOLE |

Readiness is the board's: `hermes kanban --board <m> list --status ready --json`. A REWORK does
not loop — it appends `FIX(S)` and `REV(S)` pass r+1. A slice parked on a V gate parks nothing else.

## 3. The tick — your only loop, and it is event-driven

Run it on every event (a seat's exit notification, a watchdog line, a V message), never on a timer:

1. **Consume exits.** Per exited seat: verify `SKILLS LOADED` against the transcript BODY — grep a
   distinctive phrase of each floor skill (Claude subagents:
   `~/.claude/projects/<encoded-cwd>/<session>/subagents/agent-*.jsonl`; `claude -p`:
   `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`; Grok:
   `~/.grok/sessions/<encoded-cwd>/<id>/chat_history.jsonl`) · write the ledger row · close the node
   (`hermes kanban --board <m> complete <ticket> --result "<marker>"`) · append the derived nodes
   (FIX + the next REV pass; ELEMENT or TEST on PASS; a V row on a pass-3 REWORK) · ticket every
   finding the same day · update the slice's `PROGRESS.md` — you are its only writer.
2. **Dispatch every READY node**, in parallel, in the background; heavy nodes bounded by the spine's
   `max_concurrent_heavy`. Never draw a compliance conclusion from a running seat — wait for exit.
3. **Surface V gates once each** (§8): DONE(S), TEST(S), WHOLE, the decisions packet. Never re-ask.
4. **Idle** until the next event. The 20-minute stagnation watchdog is the fallback event.

## 4. Transports — background only (the no-terminal law, `heartbeat-protocol` §3.9)

| Seat | Transport | Resume | Transcript / log |
|---|---|---|---|
| Claude, default | Agent tool, background, `model` per roster, fresh session | SendMessage, when the harness offers it | the subagent transcript (§3) |
| Claude, resumable | `~/.local/bin/claude -p "<pointer>" --model <id> --permission-mode acceptEdits --output-format json` as a background Bash process; `session_id` from the JSON tail | `claude --resume <session_id> -p "<pointer>"` | the session jsonl + a per-seat log |
| Codex | `codex exec -c model='"gpt-5.6-sol"' … "<pointer>" </dev/null > <log> 2>&1`, background | `codex exec resume <id>` | per-seat log |
| Grok | `~/.grok/bin/grok -p "<pointer>" -m <model> --permission-mode bypassPermissions --cwd <lane> > <log> 2>&1`, background | `grok --resume <id>` | per-seat log + session jsonl |
| watchdog | the harness's Monitor, or a background `until`/`while` loop writing `logs/watchdog.status` | — | `logs/watchdog.status` |
| dev server for V | a `.claude/launch.json` entry, started only when V says "serve <S>" | — | preview logs |

Forbidden: `osascript`, `open -a`, Terminal windows, browser windows, GUI apps, serving the Hermes
dashboard unasked. The harness's browser pane is yours for verification. The launch law is
unchanged: a short pointer prompt naming an ABSOLUTE packet path (big prompts stay off argv);
launchers written fresh from a heredoc, read back and grepped for the values they must carry; the
log appears within 2 minutes; per-seat log paths distinct; the watchdog armed AT launch; janitor
between attempts — processes by PID, worktrees, untracked files, locks. A CLI whose stdout buffers
(`hermes`, `claude -p`) is judged by disk and board, never by log silence.

## 5. Packets — from templates, checked, scoped

- Every packet starts from `templates/<NODE>.md` beside this file (a planning rework node uses
  `REQ-FIX.md`; ARCH rework the same template with the architecture contract); fill every
  `__MARKER__`; keep the contract half ≤ 40 lines. A path the seat will create carries ` (new)`; a code quote is
  `<abs path>:<LINE> — \`text\``, re-grepped at write time — never recalled from earlier tool output.
- **`scripts/packet-check.sh <packet>` runs before every dispatch; exit 1 means no dispatch.** A
  failing packet is fixed in the TEMPLATE or the COMMON line that produced it (fix the class).
- The SPEC of record for a slice is its highest-numbered `SPEC-v<n>.md` (`SPEC.md` when none):
  every packet written after a planning rework names that file — never `SPEC.md` by habit.
- Scope the reading: a BUILD packet quotes its cluster's step ids and line ranges; a REV packet
  points at the review package; TRAPS entries are named by heading. An input is a FILE with a line
  range, never a bare directory (a 12,575-line directory named without a range was read by nobody).
  A seat whose output must be checkable against code gets that code, read-only, in its inputs. The
  packet's `base` is the LANE base; if the main tree's HEAD has moved since (protocol commits), say so.
- A PLANNING packet (REQ, ARCH, MOCK) carries the measured EXTRACTS its charges depend on — the
  quoted lines themselves, ≤ ~150 lines in total, each with its `path:LINE` provenance — not only
  the paths (measured on debate-tiers: ~110k tokens per planning node spent re-deriving lines the
  intake had already read). A code quote is re-grepped at write time, never recalled. `COMMON.md` ≤ 120 lines, and an
  amendment REPLACES the text that caused the defect — no numbered list that only grows.
- Packet review is the reviewer's duty (`heartbeat-reviewer` §1); a packet defect is a finding
  against you, priced in the ledger.

## 6. The slice gate and the one review

- Workers hand off on cluster green; nothing waits on a cluster. `GATE(S)` fires when every
  BUILD(S-*) is done: assemble `.hermes/reports/<m>/review-packages/<S>-p<r>/` — the diff vs base,
  every cluster command with its three-run table, the cluster map, the acceptance oracle (DONE.md on
  a UI slice, the SPEC acceptance otherwise), the dev-stack recipe. Re-verify every quoted commit
  and count at assembly time.
- Lenses by `risk_tier`, in parallel, each a blind background seat in its own detached worktree at
  the slice head: low → correctness/tests · medium → + security/data-safety · high → + product-truth.
  **A UI slice always carries product-truth**: rendered DOM with the real compiled CSS, measured
  against DONE.md's artboards in both modes.
- Union the lens verdicts into `reviews/REV-<S>-p<r>-UNION.md`: PASS only when every lens passed.
  Two lenses disagreeing on ONE finding get a single-finding re-check node, never a re-review.
- REWORK → FIX(S) nodes split by file surface (parallel), every finding of the pass assigned,
  returned to the author sessions when resumable → REV(S) pass r+1, scoped to the findings plus the
  previous pass's probes. A pass-3 REWORK is a V row. N-findings still open at TEST(S) are
  ticketed residue, shown to V at the test point.
- Planning reviews (REQ-REV, ARCH-REV) are one pass by default: you fold N-findings into
  DECISIONS.md and ticket comments; only B-findings spawn a rework node, in the same session when
  resumable. The cap of 3 still bounds them.
- MERGE(S) runs the integrated suite on `dev`; a cross-slice defect there → FIX on the owning slice
  and a scoped REV pass counted against that slice's cap. There are no cross-review nodes.

## 7. Rework transport

Same session first — resume it (§4). A fresh session only when the original is dead or the
transport cannot resume; then the packet carries the predecessor's handoff and self-report. Session
ids are recorded at CLAIM and recovered from the board, never from a log. Recovery is
conversation-mode: turn by turn with the same session, never a bigger packet. Tooling friction
escalates to V after ONE failed workaround.

## 8. V gates — the only surfaces V sees after the prompt

- **DONE(S)** (UI slices): ONE message — the canvas URL, the open questions from MOCK.md as
  smallest yes/no, and the two ways to answer: edit the canvas in place (Save publishes a version
  you read back with the Artifact tool) or hand back a Claude Design export under `ui_designs/`.
  Then extract the final artboards verbatim into `docs/missions/<m>/design/<S>/`, write
  `slices/<S>/DONE.md` (per screen and state: the artboard reference, numbered browser steps in both
  modes, V's words quoted — no judgment of yours) and get V's yes. BUILD(S-*) is not READY before
  that yes; there is no proceed-by-default on a UI slice. Attach the graph
  (`scripts/graph.sh <m> .hermes/reports/<m>/mission-graph.md`).
- **TEST(S)**: post the acceptance steps, the residue list and the one-line serve command; serve
  the lane only when V says so; the slice ticket closes only on V's veto. **WHOLE**: after every
  MERGE(S), post the integrated-suite result and the push command — V pushes. **V DECISIONS
  PACKET**: rows flush at ≥ 3 pending, any row pending > 4 h, a frozen slice, or V asking; each row =
  card, decision, evidence link, smallest yes/no; the default binds until V rules, and DECISIONS.md is
  checked before any row is written.
- **Vertical-slice law (V, 2026-09-01), unchanged:** slice tickets first · Done = V's veto after
  personally testing, never a green gate · sub-tickets in parallel · one worktree per slice, many
  slices at once · merge on veto, conflicts managed at merge time and never a reason to serialize ·
  all slices vetoed → V tests the whole → only then push · the test points after each slice and after
  the final merge are load-bearing.

## 9. Ledger, reports, closure

Write `LEDGER.md` AT EACH SEAT EXIT — seat, ticket, model, dispatched, exited, handoff marker,
how SKILLS LOADED was verified, self-report path, verdict — and a `Ruling:` line for every decision
you took on V's behalf (what — why — cost if wrong). Deliver on N−1 when a seat dies: survivors told,
a replacement re-elected or the waiver recorded. A phase report at each V gate, a closure report
before CLOSE, every self-report collected before FULLY DONE, the graph rendered from the board at
every gate. Close sub-tickets as verdicts are consumed — a board that only grows carries no state.

## 10. Version discipline

Fail closed on skew: a rule newer than the installed skill or the spine is not dispatched — amend
the spine in the same commit. A seat charged with a rule it cannot discover from the repo is your
defect.
