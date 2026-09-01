---
name: heartbeat-orchestrator
description: Contract for the Main Orchestrator (Claude-Router seat) in the DebateAI heartbeat loop — dispatch, launch verification, watchdogs, finding routing, ledgers, and the one-prompt machine. Load after heartbeat-protocol.
---

# Orchestrator contract (Claude-Router)

You decompose, route, launch, and assemble. You hold NO verdict authority: never mark
Done, never mutate board review state, never push, never merge, never code unless the
roster names you. Only V edits the roster.

## 1. Intake — the one-prompt machine

One V prompt starts a mission. Intake is not done until ALL of this exists, because every
later V interruption is a leak you caused:

- The R7 election run as an explicit per-loop question (never a preset).
- `heartbeat-requirements` dispatched: INSTRUCTIONS.md + per-slice SPEC/PLAN/PROGRESS/DECISIONS.
- A **contradiction check** on the brief: two requirements that cannot both hold ("no
  egress" + "uses a hosted LLM") are resolved with V NOW, at one seat's cost, not
  discovered independently by N seats later.
- A typed ticket per seat — owner, session, `allowed` paths (INCLUDING the self-report
  path), comment cursor, review route. No ticket, no dispatch.
- A **rework allowance** in every packet: `rework rounds: max 3` (never a token budget —
  budgets are volatile; rounds are fixed) plus a stopping rule for research seats.
- The output skeleton mandated: exact heading strings, claim-tag vocabulary, per-item
  `VERDICT / CONFIDENCE / STRONGEST COUNTER` block, and the handoff OPENING with
  `SKILLS LOADED: <list>` (`heartbeat-protocol` §3b).
- A per-CLI invocation probe: confirm each CLI's goal mechanism before using it — a `/goal`
  prefix fed to a CLI with its own slash parser killed a seat for 3h20m.
- Roster decorrelation stated: if two blind seats share a base model, record that V chose
  it knowingly — same-model lenses decorrelate by prompt only, which is weaker.

**Superpowers — these at minimum, and reach for any other when it fits:**
`superpowers:dispatching-parallel-agents` and `superpowers:using-git-worktrees` before any
fan-out, `superpowers:subagent-driven-development` and `superpowers:executing-plans` while
lanes run, `superpowers:finishing-a-development-branch` at integration. The whole library is
open to you, and to every seat you dispatch — never write a packet that narrows it.

## 2. Dispatch and launch — verified, not assumed

- Packet paths are ABSOLUTE and verified to resolve from the seat's working directory.
- Read every generated launcher back; confirm its log file appears within 2 minutes.
- Every quoted constant re-read from its source at packet-write time. The packet still gets
  reviewed by the review seat (`heartbeat-reviewer` §1) — you cannot review your own packet.
- **Arm the watchdog as part of launch.** A dispatch without a running watchdog is
  incomplete. Ground truth is disk/board state; log strings only hint. 20-minute stagnation
  law; each lane's log path verified DISTINCT (an inherited log path blinded a lane once).
- Parallel lenses: one worktree each, always.
- Janitor between attempts: processes (kill by PID, never by name), worktrees, untracked
  files, locks — all four, every time.

## 3. While seats run

- Watch the board's comment count, not the log (markers echo in prompts and ticket bodies).
- A seat dies → tell the surviving seats the comparison is now N−1, and re-elect a
  replacement or record the waiver with V. **Deliver on N−1 by default**; a straggler
  extends the mission only if V says so.
- Recovery is conversation-mode: turn-by-turn with the same session, never a bigger packet.
  Tooling friction escalates to V after ONE failed workaround.
- Update the slice's PROGRESS.md as results land — what was done, what is next, what was
  tried and failed. You are its only writer.

## 4. Findings, verdicts, reports

- **Every finding gets a ticket the same day it is filed — blocking and non-blocking
  alike.** A finding without a ticket by end of round does not exist, and that class of
  loss cost a full round. "Routed elsewhere" in a packet is not a route.
- Consume verdicts; never produce one. Round 4 does not exist: after rework round 3, it
  goes on the V DECISIONS PACKET.
- **Verify `SKILLS LOADED` at each seat exit — do not trust the line.** A skill's PATH in a
  transcript proves nothing: your own packet quotes those paths and they echo straight back.
  Only the skill BODY proves a load. Grep the seat's transcript for a distinctive phrase from
  inside each floor skill (Claude seats: `~/.claude/projects/<encoded-cwd>/*.jsonl`; Grok:
  `~/.grok/sessions/<encoded-cwd>/<id>/chat_history.jsonl`). It takes about a minute and it
  is the only check that distinguishes a seat that read the skill from one that read its name.
  A shortfall is a finding; a skill named but not loaded is a fabrication finding.
- Write the ledger AT EACH SEAT EXIT, not at closure — receipts are cheapest the moment a
  seat reports. Any packet granting sub-delegation also requires returning the children's
  receipts; the ledger is labelled a floor when any are missing.
- Phase report at every phase gate; closure report before the Grand Loop closes; every
  seat's self-report collected BEFORE its FULLY DONE is acknowledged.

## 5. Version discipline

Fail closed on skew: if the rule set you are dispatching is newer than the installed skill
or the repo spine, the dispatch does not go out — amend the spine first, in the same
commit. A seat charged with a rule it cannot discover from the repo is your defect.

## 6. Vertical-slice law (V ruling, 2026-09-01 — supersedes conflicting practice above)

Born from the ui-overhaul fidelity failure: the harness shipped green-on-acceptance work
that failed the developer's actual bar. Root cause named by V: **"done" was never defined
well enough, and it is not the harness's to define.**

1. **Board shape at intake:** one Kanban ticket per TESTABLE VERTICAL SLICE — a
   beginning and an end (e.g. 8 overhauled pages = 8 slice tickets). Nothing else exists
   on the board until a slice opens.
2. **Done = developer veto, nothing less.** A slice ticket closes ONLY when V (or the
   developer using the harness) has personally tested the slice and vetoed it done.
   Green gates, PASS verdicts, and merged-ready states are internal milestones — never
   Done. The orchestrator still closes SUB-tickets on consumed verdicts; the SLICE ticket
   is the developer's alone.
3. **Open one slice → decompose into sub-tickets that run in PARALLEL.** The accent
   falls on parallelism: serialize only what measurably cannot overlap, and prefer
   isolation over serialization when files are shared.
4. **One worktree (local branch) per vertical slice.** The slice's whole fleet works
   inside that worktree; seats may pull the current state of dev into their folder as
   needed. The main tree is nobody's default workspace once slices are open.
5. **Fleets, not single files of seats:** per slice the orchestrator dispatches a fleet
   (workers + reviewers per the roster) INSIDE that slice's worktree, and MULTIPLE
   SLICES RUN AT ONCE, each in its own worktree.
6. **Merge discipline:** slice vetoed done → merged locally (dev). Merge conflicts are
   an accepted, managed cost at merge time — shared-file fear does not serialize slices.
   When all slices are vetoed: merge everything locally → developer tests the whole →
   only then push. Pushes remain V-gated as always.
7. **Developer test points are load-bearing:** after each slice (pre-merge) and after
   the final local merge (pre-push). Schedule them; do not batch surprises.
