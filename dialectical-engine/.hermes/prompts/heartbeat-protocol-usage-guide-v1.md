# How to Use the Heartbeat Protocol (Graph Spine v2) — User Guide

**Audience:** anyone on the team who is not V — seniors, collaborators, anyone driving the harness. No prior context needed.
**Authoritative law:** `apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md` (the Graph Spine, v3.0.0). This guide simplifies; the spine wins on any conflict.

---

## 1. What this is, in one paragraph

The Heartbeat Protocol is DebateAI's multi-agent development system. You describe a mission once; a graph of AI agents does the rest — Claude (Fable) orchestrates as the **Main Orchestrator**, Hermes independently **verifies and owns the Kanban board**, Codex writes the code, Grok researches and reviews. Work flows through four loops — **Requirements Engineering → Architecture → Programming ⇄ QA** — and the mission only ends when Requirements and Architecture both declare themselves satisfied. You are never a messenger between agents; the machine runs itself and comes to you only for things that genuinely need a human.

## 2. Starting a mission (the One-Prompt Machine)

In a Claude Code session rooted anywhere under `DebateV2/apps/dialectical-engine`, type:

```
/heartbeat-protocol <describe your mission in plain language>
```

Example:

```
/heartbeat-protocol Add a "debate export" feature: users can download any
finished debate as a formatted PDF with scores and judge commentary.
```

That message is your **one prompt**. Everything else is automatic. You will never paste prompts into other tools, relay outputs, or press Resume — if anything ever asks you to, that's a protocol violation (see §7).

## 3. What happens immediately: the intake

The Orchestrator answers with exactly two things:

**① The loop-ownership election.** You'll be asked: *which model(s) — one or more — own each loop?*

| Loop | What it does | Typical answer |
|---|---|---|
| REQUIREMENTS ENGINEERING | Turns your intent into a contract; asks you clarifying questions | claude |
| ARCHITECTURE | Plans, reviews the plan, slices it into tickets | claude + grok |
| PROGRAMMING | Writes the code | codex |
| QA | Verifies everything; product-truth checks | hermes (+ grok) |

Answering **"you pick"** is legal — the Orchestrator fills it from the roster and records the delegation.

**② A few bounded design questions** about your mission (scope, users affected, risk level). Answer them once. The Orchestrator then classifies the mission's **tier** — Tier 0 (docs/mechanical, minimal ceremony), Tier 1 (routine feature, streamlined route), Tier 2 (architecture/data/security, full ceremony) — and launches the graph.

## 4. While it runs: what you'll see and what's expected of you

**Mostly: nothing.** Silence is normal and healthy — unchanged state produces no messages.

You'll be contacted through exactly three surfaces:

1. **Design questions** — only from the Requirements or Architecture loops, only during design. Answer them; they're always bounded and specific.
2. **V DECISIONS PACKETS** — batched approval requests for *important operations*: database deletion, data manipulation, security/auth changes, provider spend, destructive git/filesystem actions, architecture/scope expansion, worktree lane plans, waivers. Each row is a smallest-possible yes/no with evidence attached. They arrive batched (≥3 pending, or 4h elapsed, or a frozen lane), not one-at-a-time.
3. **Final acceptance** — the finished work presented for your verdict.

No other agent, loop, or subagent may ever address you directly. (One sanctioned exception: if the Orchestrator's session dies, the Architecture-responsible agent contacts you directly — that's the designed outage fallback, not a violation.)

## 5. How agents talk to each other: the /goal law

Every agent launch — Orchestrator to worker, and any model calling another model — uses the target's own **`/goal`** command with a bounded goal packet ending in the return rule: *don't come back unless you need review, hit a blocker, or face an important operation.* Goals all the way down; it's the most stable invocation pattern across the fleet's CLIs. `/goal` packets flow DOWN the authority chain; only reviews, blockers, and packet rows flow up.

## 6. How a mission ends (the Grand Loop)

A mission may close ONLY when **both** markers are present on the closure ticket, each emitted solely by its loop's owner:

- `REQUIREMENTS SATISFIED` — the requirements loop (your surface) is satisfied;
- `ARCHITECTURE SATISFIED` — the planning diamond is satisfied;

plus all standing gates: product-truth evidence (live app/API/DB proof for user-facing work — unit tests alone never close anything) and your final acceptance. Programming or QA finishing means nothing by itself. Every mission leaves a full report trail in `.hermes/reports/<mission>/` — phase reports plus a closure report; if the reports are missing, the mission cannot legitimately close.

## 7. Safety rails you can rely on (and should enforce)

Any single occurrence of these **falsifies a mission** — if you spot one, say so; the run fails regardless of how good the output looks:

- scaffolded/fake data, fake test runs, test cheating;
- TDD violations (code before a failing test, no RED→GREEN evidence) or DDD violations (crossing bounded contexts, ignoring domain language);
- doing anything the agent was told not to do; skipping anything it was told to do;
- **chain-of-command violations** — an agent marking its own work Done, a reviewer editing the fix it reviews, a subagent messaging you, anyone bypassing the Orchestrator or Verifier;
- **any loop without question authority asking you a question directly.**

Other standing guarantees: proportional review depth is persisted per ticket and the high-risk floor (persistence, spend, security, scoring, live data, destructive/architectural work) can never be tiered down; every loop has hard convergence caps (3 rework rounds, a chatter breaker, an unblock ceiling) that freeze and escalate rather than looping forever; nothing is ever deleted without an explicit per-item human yes; retired components keep `.pre-v3.bak` originals.

## 8. Who does what (so you know who to "blame")

| Seat | Held by | Powers | Explicitly cannot |
|---|---|---|---|
| Main Orchestrator (Claude-Router) | Claude Code / Fable | intake, decomposition, routing, launching everything, decision packets | issue verdicts, mutate the board, mark Done |
| Verifier (Hermes-Verifier) | Hermes | independent verification, Kanban custody + crafting, Manual QA | route missions, write fixes |
| Workers | per the model-law roster (Codex codes today) | implement within their ticket contract | self-approve, expand scope, contact you |
| You / any human | — | rulings, important operations, roster edits, final acceptance | (you outrank everything) |

The model-to-role mapping lives in the spine's **model-law roster** — versioned config, edited only by humans; changing it is itself an important operation.

## 9. Quick reference card

```
Start:            /heartbeat-protocol <mission>
Then answer:      ① loop ownership (or "you pick")   ② a few design questions
During the run:   answer decision packets; otherwise enjoy the silence
It ends when:     REQUIREMENTS SATISFIED ∧ ARCHITECTURE SATISFIED + your acceptance
Paper trail:      DebateV2/.hermes/reports/<mission>/
The law:          apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
Never do:         relay prompts between agents; answer an agent that bypassed the chain;
                  approve deletions in bulk (each item gets its own yes)
```
