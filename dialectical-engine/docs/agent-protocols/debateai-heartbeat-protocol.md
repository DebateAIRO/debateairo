---
name: debateai-graph-spine
title: DebateAI Graph Spine v2
version: 3.4.0
supersedes: debateai-heartbeat-protocol (pre-3.0.0), heartbeat-protocol-lite, debateai-kanban-heartbeat-review-loop
---

# DebateAI Graph Spine v2

This is the single normative document for DebateAI multi-agent work — the graph
of nodes, edges, routers, and typed state. Hermes, Codex, Claude, and Grok load
this spine first, then their own thin node contract. Where an older per-agent
skill or the Hermes AppData FULL body disagrees with this spine, this spine wins;
those documents are demoted to implementation notes.

## Table of contents

1. Pillars
2. State contract
3. Node contracts index
4. Launch packet contract
5. Routers: Claude-Router and Hermes-Verifier
6. Stage numbering (H0–H9)
7. Edges, diamonds, and feedback edges
8. Marker vocabulary (union)
9. Review-lane applicability
10. Convergence and batched-approval laws
11. Preserved laws (verbatim)
12. Glossary

## 1. Pillars

The harness is a graph built on four pillars. Every rule in this spine serves one
of them.

- **Node** — a bounded job with a file contract and no graph knowledge. A node
  reads its own ticket state and its declared upstream artifacts; it never reads
  the whole board or a mission route.
- **Edge** — a data-flow, not an "and then". An edge carries a named artifact or
  a typed verdict from one node to the next. Status is not a message; edges signal
  through the typed state block and handoff markers.
- **Router** — dispatches, does no work. The router reads typed state, picks the
  next edge, and writes only routing metadata. Content judgment belongs to a
  verifier, never to the router (§5).
- **State** — one typed ticket-state object per ticket (§2). All other carriers
  (live files, host task lists) are read-only projections regenerated from it.

Operating model: **V prompts exactly one node (H0 intake).** Everything else
reaches V only through the V DECISIONS PACKET (§10) or final acceptance. Routine
routing and review communication live in ticket comments, never in V's inbox.

```text
V → Claude-Router (intake H0 only)
Claude-Router → assignment, status, epoch, route
Hermes-Verifier → evidence verdicts
Codex → sole coding worker while the current model law is active
Claude/Grok → planning-artifact workers and independent read-only reviewers
Kanban → durable shared state (the typed state block is its first comment)
```

## Operating model

```text
V → Hermes cockpit
Hermes → tickets, dependencies, comments, review routing, human-review packets, Done/Blocked
Codex → sole coding worker while the current model law is active
Claude/Grok → planning-artifact workers and independent read-only reviewers
Kanban → durable shared state
```

V is interrupted ONLY for an **IMPORTANT OPERATION** or final acceptance.
The IMPORTANT OPERATIONS are, exactly: provider/model spend or external calls;
secrets/auth; product/live DB or product-data writes; any deletion; destructive
filesystem/Git/history; commit/push/merge/release/branch/worktree operations;
architecture or scope expansion; reconstructed-evidence acceptance/waiver; and
final human/product acceptance. Anything outside this list is not an important
operation and is handled inside Hermes and the ticket comments, never by
interrupting V. Routine routing and review communication belong in ticket comments.

### The One-Prompt Machine law

A mission starts with exactly ONE V prompt at REQUIREMENTS (H0). From that moment
the machine runs itself: V never relays prompts, pastes agent output, or presses
Resume. Exactly three V-facing surfaces exist for the entire mission:

1. DESIGN QUESTIONS: only the REQUIREMENTS node (H0 intake) and the ARCHITECTURE
   nodes (planning diamond C2/H2/G3/H3/C4) may address questions or steering
   requests to V directly, and only during design. No implementation, QA, watcher,
   or worker node ever addresses V.
2. IMPORTANT-OPERATION DECISIONS: from ANY node, a decision on the IMPORTANT
   OPERATIONS list above (database deletion, data manipulation, security/auth,
   provider spend, destructive git/filesystem, architecture or scope expansion,
   reconstructed evidence, waiver) reaches V exclusively as a row in the batched
   V DECISIONS PACKET. Cap-triggered V STEERING REQUIRED escalations
   (rework_round cap, chatter breaker, reset ceiling) travel the same way.
3. FINAL ACCEPTANCE (H9).

Any other V-facing message is a protocol violation: Claude-Router intercepts it
and re-routes it as a design question (if its origin is REQUIREMENTS/ARCHITECTURE),
a packet row (if it is an important operation or cap escalation), or an ordinary
ticket comment (everything else).

## Default full-mode operation and V touchpoints

Default operation is FULL mode: Claude (the Main Orchestrator, the Claude-Router
seat, ruling R1) launches and holds the agent sessions (managed PTYs or scripted
CLI bridges), routes every agent on typed state, and drives them through ticket
comments; Hermes-Verifier holds Kanban board custody and crafting, mutates the
board, and runs verification and Manual QA.
V does not paste prompts, relay output, or press Resume in full mode.

V is touched exactly through the three One-Prompt Machine surfaces (law above):

1. Intake and design questions: V states the mission at H0 with the single
   mission prompt; during design, the REQUIREMENTS and ARCHITECTURE nodes (and
   only those) may ask V questions or request steering. Claude-Router classifies
   and sets `risk_tier` at intake.
2. V DECISIONS PACKETS: Claude-Router batches V-owned gates (the named-category
   filter decides what qualifies) from Hermes-Verifier's verdicts and blocks, and
   flushes one consolidated packet per the flush thresholds (>=3 pending, or any
   pending >4h, or a lane frozen, or V asks). This includes the per-mission
   worktree lane-plan approval submitted at H6.
3. Final acceptance: V performs the final human/product acceptance at the
   mission's closure gate.

Everything else — routing (Claude-Router), review and board custody
(Hermes-Verifier), rework, successor dispatch — stays inside the orchestrator /
verifier loop and the ticket comments. Reducing V touchpoints never removes a
safety gate: a frozen loop (rework cap, chatter breaker, reset ceiling) escalates
into the V DECISIONS PACKET; it never auto-approves.

## Orchestrator outage fallback (ruling R3)

If the Claude (Main Orchestrator) session is down,
the Architecture-responsible agent communicates directly with the humans ("us" = anyone using the harness)
until the orchestrator is restored. This is legal WITHOUT creating a new V-facing
surface: ARCHITECTURE already holds design-question authority under the One-Prompt
Machine law (surface (a)), so the outage relay rides an existing authorized
channel. It is a temporary continuity measure, recorded on the affected tickets;
no other loop gains a human-facing channel, and every spine law still binds.

## Degraded-hardware V-relay fallback

Full mode is the default. Only when the machine cannot host the orchestrator's
managed agent sessions at all, the orchestrator falls back to V-as-relay:

- Claude-Router emits exactly one copy-paste prompt for the next required
  agent/stage.
- V pastes it into the external agent and returns the artifact/handoff.
- Hermes-Verifier reviews, records the gate, and Claude-Router supplies the next
  single prompt.

This is a TRANSPORT fallback only. Every law in this spine still binds:
independent review, no self-Done, the `rework_round` cap, the chatter breaker,
`risk_tier` routing, and the IMPORTANT OPERATIONS gates. Set the semaphore
`max_concurrent_heavy: 1` on constrained hardware. V-relay is never the default
and is recorded explicitly on the ticket whenever used.

## 2. State contract

Every ticket carries exactly one canonical typed state object. It is the single
source of truth for routing; every other carrier (`.hermes/live/` files, host
task lists, watcher fingerprints, compaction checkpoints) is a read-only
projection regenerated from it.

Storage rule: if Kanban exposes native custom fields, the state object lives in
those fields. If it does not, the state object is written as the ticket's FIRST
comment and is updated **by replacement** of that one comment — never appended,
never smeared across the thread, never duplicated in a later comment.

```yaml
state:
  ticket: <id>
  risk_tier: low | medium | high            # set ONCE at intake/H6; drives routing deterministically
  status: queued | ready | working
        | waiting_review | waiting_hermes | waiting_product_proof
        | waiting_human | waiting_dependency | waiting_resource
        | failed_tooling | changes_requested | done | archived
  owner: { agent: codex|claude|grok, session: <id> }
  contract:
    allowed: [...]
    readonly: [...]
    forbidden: all_others
    verification: [...]
    human_review: yes|no
  worktree: { path: <.worktrees/lane-x>, branch: <b>, merge_status: none|pending|merged }
  authority_epoch: <int>                     # monotonic; V/cockpit-only writer
  rework_round: <int>                        # convergence counter; cap = 3
  wakes_since_transition: <int>              # chatter counter
  waiting_since: <timestamp>                 # every waiting_* status carries it
  escalation_target: hermes | v_packet       # every waiting_* status carries it
  self_unblock_enabled: false                # V-toggled worker-self-unblock capability; default false
  comments_read_through: <cursor>
```

The Codex worker-self-unblock exception (Blocked -> In Progress recovery on the
worker's own active card) exists ONLY when `self_unblock_enabled: true`, which only V
sets, per-ticket. Default is `false`: with it false, no worker may self-recover a
Blocked card; an important-operation, human, safety, or product gate is never
self-cleared regardless of this flag.

The `status` enum replaces the overloaded word `blocked`. A ticket status is
never a bare `blocked`; every former "blocked" meaning maps to a specific
`waiting_*` status (or `changes_requested`/`failed_tooling`) per the mapping
table in "## Blocked format". Which node may read or write which field is
declared per node in each agent adapter; `risk_tier` and `authority_epoch` are
Hermes/cockpit-only writes.

This block is **forward-compatible**: it lists the twelve top-level fields
installed now, and later phases MAY append additional additive fields without
breaking earlier readers (which key only on the fields present). Two such fields
are added downstream — `planning_tier` (planning-chain depth `0|1|2`, added by
Phase 4 Task 4.2, distinct from `risk_tier`) and `self_unblock_enabled`
(V-toggled worker-self-unblock capability, default `false`, added by Phase 3
Task 3.11). Do not pre-add them here; they are named only so the schema is known
to be open for additive extension.

## 3. Node contracts index

Each agent loads this spine, then exactly one thin node contract. A node contract
declares the node's role, its state reads/writes, and its markers. Nothing else.

```text
Codex node contract   → DebateV2/apps/dialectical-engine/.codex/skills/heartbeat-protocol/SKILL.md
                        (also .agents/skills/heartbeat-protocol/SKILL.md)
Claude node contract  → DebateV2/apps/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
Grok node contract    → DebateV2/apps/dialectical-engine/.grok/skills/heartbeat-protocol/SKILL.md
Hermes node contract  → DebateV2/apps/dialectical-engine/.hermes/skills/heartbeat-protocol/SKILL.md
Doc adapters          → docs/agent-protocols/{codex,claude,grok}-heartbeat-adapter.md
```

Declared reads/writes (a node may read anything in its own state; the constraints
below name what it MUST NOT write):

- **Codex-worker** reads `{contract, status, rework_round, authority_epoch,
  worktree, comments_read_through}`; writes `{status, worktree, evidence refs,
  comments_read_through}`. Never writes `risk_tier` or `authority_epoch`.
- **Claude/Grok worker or reviewer** reads its stage/ticket state and upstream
  artifact paths; writes `{status (to waiting_review/waiting_hermes),
  comments_read_through}` and its own artifact. Never writes `risk_tier`,
  `authority_epoch`, or another node's files.
- **Claude-Router** reads typed state only; writes `{owner, status, route,
  authority_epoch}`. Never writes a verdict.
- **Hermes-Verifier** reads evidence; writes `{verdict, human_review routing}`.
  Never writes routing metadata or re-performs the router's dispatch.

## 4. Launch packet contract

A launch packet is a node contract, not a mission briefing. Its contents are
capped to exactly four things:

1. the ticket-state block (§2);
2. the immediate upstream artifact path(s);
3. the single handoff marker the node must emit;
4. the stop conditions.

Explicitly forbidden in a launch packet:

- full mission routes or DAGs;
- sibling-mission references ("LIP-01 and LIP-02 are logical siblings…");
- negative-space ticket lists ("do not touch these 6 unrelated tickets");
- pipeline role maps.

Route topology lives ONLY in Kanban and in Claude-Router (§5). A node never
receives, and never needs, the shape of the graph beyond its own ticket and its
declared upstream artifacts.

## 5. Routers: Claude-Router and Hermes-Verifier

Routing and verification are split into two named seats held by **different model
families**, so dispatch latency is never coupled to review latency and the seat
that moves work can never grade its own dispatch (Decision D6 / ruling R1).
**Claude-Router** is the Main Orchestrator seat, held by Claude Code (Fable):
it launches everything and routes everything on typed state, and does no content
judgment. **Hermes-Verifier** is the independent verification + board-custody
seat, held by Hermes: it performs evidence review the router may never do, and it
owns the Kanban board. This is the same "may report/dispatch but may not do work"
separation already written for the 1-minute watcher, now applied across the
cockpit and along a model-family boundary.

### 5.1 Claude-Router (dispatch — Main Orchestrator)

- **Seat:** the Main Orchestrator, held by Claude Code (Fable). It launches every
  agent and fleet, runs the One-Prompt Machine (mission intake H0), decomposes
  the mission, and routes everything on typed state. It holds no verification or
  board-mutation authority — those are Hermes-Verifier's (§5.2) — and it respects
  the model-law roster (`## Binding stage and coding law`) for worker assignment.
- Reads: the typed state block only (§2). Never replays full comment threads to
  decide a routing action.
- Does: picks the next edge from classified state; assigns `owner`; sets `status`;
  advances `authority_epoch` on authority handover; emits the route marker.
- Writes: `{owner, status, route, authority_epoch}` — routing metadata only.
- **Forbidden:** content judgment of any kind. The Router never decides whether a
  diff, artifact, or test passes. It consumes a Verifier verdict; it does not
  produce one. It never mutates the board's review state (that is board custody,
  §5.2).
- Write-permission set: `owner`, `status`, `route`, `authority_epoch`,
  `escalation_target`, and the routing markers `HERMES AUTHORIZED NEXT`,
  `HERMES AUTHORIZED ROUTE`, `WORKER CONTINUITY OVERRIDE`.

### 5.2 Hermes-Verifier (evidence review + board custody)

- **Seat:** the independent verification + board-custody seat, held by Hermes.
  Beyond evidence review it holds **Kanban board custody, Kanban board crafting,
  and Manual QA runs** (ruling R1) — the incident-hardened board machinery stays
  where it is proven, in a different model family from the Router.
- Reads: the completed artifact/diff, RED→GREEN evidence, tests, live product
  evidence, reviewer evidence, and applicable comments.
- Does: performs the stage/ticket evidence review that cannot be delegated away;
  crafts and custodies the Kanban board; runs Manual QA.
- Writes: a `verdict` field and, on pass, the human-review routing decision.
- The Router consumes the verdict; the Router never re-performs verification, and
  the Verifier never re-dispatches.
- **Board serving + ticket format (V order, 2026-08-15):** the Kanban board is
  served on **port 9119 — always 9119, never overridden in missions** (`hermes
  dashboard`), so every agent and human always knows where the board lives. Every
  ticket carries its assigned model in SQUARE BRACKETS at the start of the ticket
  title — e.g. `[codex@gpt-5.6-sol] eval-04-tagger`, `[hermes] stage verdict
  PROG-05`; unassigned tickets carry `[unassigned]`. The bracket tag is updated on
  every (re)assignment and must agree with the mission's `loop_ownership` map and
  the model-law roster; the assignee column duplicates it, but the title tag is
  the human-readable law. Board-crafting and board-fix packets must instruct the
  Verifier accordingly.
- Write-permission set: `verdict`, `human_review` routing, and the verdict markers
  `HERMES STAGE REVIEW PASS`, `HERMES STAGE REVIEW CHANGES REQUESTED`,
  `HERMES CHANGES REQUESTED`, `HERMES DONE`, `HERMES BLOCKED`,
  `READY FOR HUMAN REVIEW` / `V MANUAL QA PACKET`.

### 5.3 Deterministic routing on classified state

`risk_tier` is persisted and set once (§2). It selects the review path mechanically
— the Router does not exercise judgment about which path to use:

```text
risk_tier = low
  → Hermes-Verifier direct diff review → same-cycle HERMES DONE
risk_tier = medium
  → one independent reviewer (peer-review-first, §9) → Hermes-Verifier
risk_tier = high
  → full review diamond (§7) + product-truth gate + V acceptance
```

The high-risk floor (§9) can never be tiered down. At H6 the Router self-audits
that the persisted `risk_tier` exists and that the routed path matches the tier;
a mismatch is a `HERMES STEP 6 SELF-AUDIT` failure.

### 5.4 Zenith principles-vs-runtime risk dial

Zenith rigor is a dial keyed on `risk_tier`, not an always-on ceremony. For ordinary
work (`risk_tier` low/medium) apply Zenith *principles* only — adversarial framing,
evidence-first, no-theater — without standing up a separate Zenith chamber. For a
high-risk mission (`risk_tier: high`, or anything on the immutable high-risk floor,
§9) run the real Zenith chamber (independent adversarial review environment with its
own evidence). The dial never lowers a high-risk mission below the real chamber.

### 5.5 Planning tiers

Every mission is assigned a planning tier at H0 intake, at the same time as
`risk_tier`, and the tier is recorded in the planning ticket's own
`planning_tier` state field (`0 | 1 | 2` = Tier 0 / Tier 1 / Tier 2). `planning_tier`
is a SEPARATE field from `risk_tier`: `planning_tier` is the planning-chain depth
(which stages run), `risk_tier` is the review path (`low | medium | high`); the two
are never conflated into one persisted value. The tier is set ONCE at H0
and drives the planning route deterministically; a stage owner may not silently
change it. Raising the tier mid-flight is a Claude-Router action recorded as an
`authority_epoch` bump; it is never lowered below the immutable high-risk floor.

| Planning tier | Trigger (set at H0) | Planning route |
|---|---|---|
| Tier 0 — docs/mechanical | docs-only, formatting, deterministic non-runtime maintenance, or test-only contract repair; no new domain behavior | Plan → H6 direct. Skip G1/C2 dialogue, the plan-review diamond, C4, and G5 when the change carries no architecture, persistence, provider, security, scoring, or product-data effect. Hermes still runs the H6 self-audit + H6A diff check. |
| Tier 1 — routine feature | reversible feature work without persistence, providers/spend, security/auth, scoring semantics, or product/live-data effects | Plan (C2) → parallel review diamond (H2 ∥ G3 → H3) → merged FinalPlan+Slices: C4 and G5 collapse into ONE hop reviewed by a single combined H4/H5 gate. |
| Tier 2 — architecture/high-risk | persistence/migrations, providers or spend, security/auth, scoring semantics, product/live data, destructive actions, or architecture | Full chain: H0, G1, H1, C2, (H2 ∥ G3), H3, C4, H4, G5, H5, H6, H6A. No stage collapsed. Product-truth + V gates apply at H9. |

Assignment rule: at H0, Claude-Router classifies the mission against the
immutable high-risk floor FIRST (persistence/migrations, provider spend,
security/auth, scoring semantics, live/product data, destructive or
architectural work → Tier 2, never tierable down). If the floor does not fire,
classify docs/mechanical → Tier 0, else routine feature → Tier 1. Record the
result in the planning ticket's `planning_tier` field (the review-path `risk_tier`
is assigned separately and is never overwritten by the planning tier). The H6
self-audit verifies the planning route actually taken matches the recorded
`planning_tier`; a mismatch is `HERMES STEP 6 SELF-AUDIT CHANGES REQUESTED`.

## 6. Stage numbering (H0–H9)

One unified numbering. Every marker and packet references these stage IDs.

```text
H0  Hermes   Intake: request framing, contract skeleton, risk_tier set once
G1  Grok     Research.md (fresh Grok CLI PTY)
H1  Hermes   Research handoff-integrity check only (no substantive review)
C2  Claude   Plan.md (fresh Claude CLI PTY)
H2  Hermes   Plan review — runs ∥ G3 for risk_tier medium/high (planning diamond, §7)
G3  Grok     PlanReview.md (fresh Grok CLI PTY)
H3  Hermes   Plan-review merge/reconcile (adjudicate H2∥G3 disagreements only)
C4  Claude   FinalPlan.md (fresh Claude CLI PTY)
H4  Hermes   FinalPlan review
G5  Grok     VerticalSlices.md (fresh Grok CLI PTY)
H5  Hermes   VerticalSlices review (serial barrier)
H6  Hermes   Kanban ticketization + Step-6 self-audit + batched lane-plan/worktree
             approval submitted as one V DECISIONS PACKET row (serial barrier)
H6A Hermes   Independent Slices→ticket diff check (Claude or Grok; sub-stage of H6,
             ordinary missions) — runs after HERMES STEP 6 SELF-AUDIT PASS, before A7
A7  Agents   Implementation wave — Codex-only lanes in isolated worktrees,
             parallel where file contracts are disjoint
C8  Closure  QA / product-truth + integration node: merge worktrees, closure gate
H9  Hermes   Done
```

The pre-3.0.0 chain H0…H6 is preserved exactly; A7/C8/H9 formalize the
implementation wave, the QA/integration closure gate, and Done that the old chain
left implicit.

### H6A — independent Slices→ticket diff check

For ordinary missions (Tier 0 and Tier 1), the H6 self-audit is backed by an
independent H6A check so ticketization is not self-certified. After Hermes
records `HERMES STEP 6 SELF-AUDIT PASS`, Claude-Router dispatches one read-only
reviewer — Claude or Grok, a different agent/session from whoever ran H6 — that
reads ONLY the diff between the approved `VerticalSlices.md` and the created
Kanban tickets. It reads nothing else and writes no tickets.

H6A check contract:

```text
Assigned reviewer: Claude or Grok (read-only; different session from H6)
Inputs (read-only): approved VerticalSlices.md; the created ticket bodies/contracts
Forbidden: editing any ticket, artifact, or file; reading unrelated board state
Check, per slice → ticket:
  [ ] every approved slice maps to exactly one ticket (no slice dropped, no ticket invented)
  [ ] each ticket's allowed/forbidden/verification contract matches its slice verbatim
  [ ] dependency IDs and lineage match the final plan
  [ ] create/modify/extend file labels match the slice
  [ ] no ticket authorizes Codex self-Done, ticket-splitting, push/merge, or DB deletion
  [ ] the Ready set is the small intentional set the self-audit declared
Verdict: H6A PASS  or  H6A CHANGES REQUESTED (with the exact slice<->ticket mismatch)
```

On `H6A CHANGES REQUESTED`, Hermes returns to H6, corrects the tickets, and
re-runs both the self-audit and H6A; the mismatch counts toward `rework_round`.
No Codex launch occurs until `HERMES STEP 6 SELF-AUDIT PASS` AND `H6A PASS` are
both recorded. For Tier 2 (architecture/high-risk) missions the full
independent-review ladder + V already provides independent ticketization
verification; H6A's read-only diff check is included within that ladder and is
never skipped.

## 7. Edges, diamonds, and feedback edges

Edges carry artifacts and verdicts, not "and then" sequencing. The default
planning topology is a diamond, not a serial chain.

```text
H0 Hermes intake + risk-tier classification (sets risk_tier AND planning_tier; see §5.5 Planning tiers)
G1 Research.md
  → H1 Hermes handoff-integrity check only; no substantive Research review
C2 Plan.md
  → PLANNING DIAMOND (split → parallel → merge); H2 and G3 each consume ONLY Plan.md:
      ├─ H2 Hermes-Verifier direct Plan review    (writes an H2 verdict)
      └─ G3 Grok PlanReview.md                     (writes a G3 verdict; never reads H2's verdict)
  → H3 merge/reconcile: Claude-Router collects the H2 and G3 verdicts and adjudicates
      DISAGREEMENTS ONLY (agreements pass through unre-reviewed; a disputed finding goes to
      Hermes-Verifier for a single-finding re-check). PASS → C4; CHANGES REQUESTED →
      same C2 author/session, rework_round += 1.
C4 FinalPlan.md
  → H4 HERMES STAGE REVIEW PASS required before G5
G5 VerticalSlices.md
  → H5 HERMES STAGE REVIEW PASS required before H6
H6 Hermes Kanban ticketization
  → H6A independent Slices→ticket diff check (Claude or Grok; ordinary missions) — §6 H6A sub-stage
  → HERMES STEP 6 SELF-AUDIT PASS required before any Codex launch
```

### Planning diamond (C2 → H2 ∥ G3 → H3)

The C2 → plan-review hop is a diamond, not a serial double-gate. On
`READY FOR HERMES STAGE REVIEW` from the C2 author, Claude-Router SPLITS: it
dispatches H2 (Hermes-Verifier direct Plan review) and G3 (independent Grok
`PlanReview.md`) as two concurrent reviews that each read only `Plan.md` plus its
approved upstream artifacts. Neither reviewer reads the other's verdict — G3
never reads H2's verdict and H2 never reads G3's — so the two lenses stay
independent. Both may run in parallel because both are read-only planning
reviews (see "Parallelism and file ownership": planning/audit can run in parallel
when read-only and cheap).

H3 is the MERGE/RECONCILE node. Claude-Router collects both verdicts and
adjudicates DISAGREEMENTS ONLY:

- Both PASS → record `HERMES STAGE REVIEW PASS`; advance to C4. No third
  re-review of the agreed content.
- Both CHANGES REQUESTED → union the findings into one
  `HERMES STAGE REVIEW CHANGES REQUESTED`, return `Plan.md` to the same C2
  author/session, and increment `rework_round`.
- Verdicts disagree on a finding → hand only the disputed finding to
  Hermes-Verifier, which re-checks it against `Plan.md`, records which reviewer
  it upheld with evidence, and issues one reconciled verdict. It does not
  re-verify the parts both reviewers already cleared.

Downstream barriers stay serial: H4 (FinalPlan) and H5 (VerticalSlices) each
need the whole reconciled upstream set and remain single `HERMES STAGE REVIEW
PASS` gates.

### Review diamond (medium/high implementation tickets)

For low-risk tickets the proportional fast path stands: direct Hermes-Verifier
diff review, same-cycle `HERMES DONE`, no mandatory peer layer. For medium- and
high-risk implementation tickets, the serial double-gate is replaced by a review
DIAMOND fanned out from `READY FOR PEER REVIEW`:

- Medium risk (`risk_tier: medium`): 2 parallel reviewers with distinct lenses —
  (1) correctness/tests and (2) security/data-safety — each a different
  agent/session from the worker and from each other, each read-only.
- High risk (`risk_tier: high`): 3 parallel reviewers with distinct lenses —
  (1) correctness/tests, (2) security/data-safety, (3) product-truth (live
  app/API/DB/browser evidence) — each a different agent/session, each read-only.

Each lens reviewer reads only the ticket diff/artifact, its file contract, and
the RED/GREEN evidence; none reads another reviewer's verdict. Reviewers post
`PEER REVIEW APPROVED` or `PEER REVIEW CHANGES REQUESTED` with lens-tagged
findings.

Hermes-Verifier is the MERGE node. It re-checks DISAGREEMENTS ONLY instead of
re-verifying every dimension:

- All lenses APPROVED → Hermes-Verifier records one `READY FOR HERMES REVIEW`
  disposition and proceeds to the Hermes/human gate per contract.
- Any lens CHANGES REQUESTED → the unioned findings return to the same
  worker/session as one `HERMES CHANGES REQUESTED`; `rework_round` increments
  once for the round regardless of how many lenses objected.
- Lenses disagree on the same finding → Hermes-Verifier re-checks only that
  finding against the diff/evidence, records which lens it upheld with evidence,
  and issues one reconciled verdict; it does not re-verify the dimensions all
  reviewers already cleared.

The independent-review safety laws are preserved unchanged: no self-Done, the
worker never self-advances to Hermes, and no reviewer edits the change it
reviews. The diamond adds parallel diverse lenses; it never removes the
independent gate.

#### Adversarial reviewer prompt (default)

Every lens reviewer is dispatched with this default framing, prepended to its
lens-specific checklist:

```text
You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned lens
(<correctness/tests | security/data-safety | product-truth>). Construct the
inputs, states, or sequences that would make it fail. Confirm the evidence is
real product/runtime evidence, not workflow or scaffold evidence. If you are
unsure whether it holds, FAIL it and state exactly what proof would change your
verdict. Approve only when you have tried and failed to break it. You are
read-only: report findings, never edit the change.
```

- **Failed-test ticket fanout** is the canonical implementation diamond: one
  ticket per unique failed test node, parallel Codex lanes, one closure gate.

### Planning feedback edges

The graph carries two feedback edges that the linear chain lacks. Both are routed
by Claude-Router on typed findings, and both increment `rework_round` (subject to
the rework cap = 3; at the cap the loop freezes and emits into the V DECISIONS
PACKET).

#### Architecture → Requirements (plan review may reopen intake)

When plan review (the H2 ∥ G3 diamond, the H3 merge, or any later planning gate)
surfaces a finding that cannot be resolved inside the current requirements — an
ambiguous or contradictory requirement, a scope gap, or a missing product
decision — Claude-Router routes ONE bounded question back to H0/REQUIREMENTS
rather than forcing the planner to guess. The return carries:

```text
ARCH→REQ RETURN:
- from stage:
- blocking question (single, bounded):
- why it cannot be resolved in-plan:
- options considered:
- rework_round: n of 3
```

Intake answers the single question (V is consulted only if the question is a
product/architecture/safety decision, via the V DECISIONS PACKET), then the plan
resumes at the returning stage with the same owner/session. Reopening intake for
an unbounded redesign is not this edge — that is a new mission.

#### QA → Architecture (verifier plan-defect findings skip Codex rework)

When a QA-loop verifier (peer reviewer, review-diamond lens, or Hermes-Verifier)
finds that a failure is a PLAN DEFECT — the slice contract, dependency order, or
acceptance criteria are wrong, not the code — Claude-Router routes the finding to
ARCHITECTURE (the C4/FinalPlan or G5/Slice owner), NOT into a Codex rework loop.
Rerouting a plan defect into code rework produces churn against a wrong target.
The return carries:

```text
QA→ARCH RETURN:
- from ticket:
- verifier + lens:
- defect is in: slice-contract | dependency-order | acceptance-criteria
- evidence the code is correct against the current (wrong) contract:
- rework_round: n of 3
```

Architecture corrects the plan artifact/slice, re-runs the affected planning
gate, and re-issues the corrected ticket. The implementation ticket stays parked
(`waiting_dependency`) until the corrected contract lands. Both edges count
toward the same `rework_round` cap so a defect cannot ping-pong between loops
unbounded.

Serial barriers remain only where a node genuinely needs the whole upstream set:
`H5` and `H6` stay serial.

This section is the SINGLE OWNER of the planning diamond, the review diamond, the
failed-test fanout, and the two feedback edges. Task 3.1 writes the skeleton above;
**Phase 4 completes each structure IN PLACE inside this §7** (Task 4.1 the planning
diamond, Task 4.3 the review diamond + adversarial reviewer prompt, Task 4.4 the two
feedback-edge templates) — Phase 4 adds no second `## Review diamond` or
`## Planning feedback edges` section, and the legacy serial plan-review fenced
diagram in `## Binding Hermes numbered-stage review gates` is repointed to this §7
by Task 4.1 (it is not duplicated here). No rule in this section exists anywhere
else in the spine.

### Architecture-boundary stop-and-route triggers

A worker must NOT cross a new architecture or architecture-phase boundary without V
discussion/approval. These are stop-and-route triggers (post a blocker/heartbeat
asking for V/Hermes routing instead of implementing, and route via the
`ARCHITECTURE -> REQUIREMENTS` feedback edge above):

- new subsystem/module boundary,
- provider interface changes,
- DB schema/migration changes,
- job orchestration/background worker changes,
- public API contract changes,
- cross-cutting frontend state architecture,
- ticket title/body terms such as `Decide`, `architecture`, `phase`, `strategy`, `adapter`, or `orchestration`.

### The Four Loops and the Grand Loop

The harness is four loops plus one outer loop (ruling R6):

- REQUIREMENTS ENGINEERING loop — owns the mission's intent (H0 / REQUIREMENTS).
- ARCHITECTURE loop — owns the design/plan (planning diamond C2/H2/G3/H3/C4).
- PROGRAMMING loop — owns the implementation (C8 Codex lanes + review diamond).
- QA loop — owns verification and product-truth (Hermes-Verifier + Manual QA).

Each inner loop keeps its OWN convergence bounds (§10: rework cap 3, chatter
breaker 6/24, unblock ceiling 2); a loop that hits a bound freezes and escalates,
it never auto-approves. Satisfaction flows UPWARD along the §7 feedback edges:
PROGRAMMING and QA report completion into ARCHITECTURE and REQUIREMENTS, never
straight to mission closure.

The Grand Loop is the mission itself. It terminates ONLY when BOTH upper loop
owners are satisfied and emit their markers:

- REQUIREMENTS SATISFIED — emitted ONLY by the REQUIREMENTS loop owner (H0 /
  REQUIREMENTS node).
- ARCHITECTURE SATISFIED — emitted ONLY by the ARCHITECTURE loop owner (the
  planning diamond).

Grand Loop termination law: a mission may close ONLY when REQUIREMENTS SATISFIED
AND ARCHITECTURE SATISFIED are both present on the mission's closure ticket, AND
every existing gate passes — the product-truth gate (§11 law 10) and V's final
acceptance, which V exercises through the REQUIREMENTS surface at H9.
Neither PROGRAMMING completion nor QA completion alone ever closes a mission: PROG/QA
satisfaction only flows up to ARCH/REQ, and only REQ AND ARCH satisfaction (plus
the product-truth and final-acceptance gates) closes the Grand Loop.

## Binding stage and coding law

```text
H0 Hermes intake
G1 Grok Research.md        — fresh Hermes-managed Grok CLI PTY
C2 Claude Plan.md          — fresh Hermes-managed Claude CLI PTY
G3 Grok PlanReview.md      — different fresh Grok CLI PTY
C4 Claude FinalPlan.md     — different fresh Claude CLI PTY
G5 Grok VerticalSlices.md  — third fresh Grok CLI PTY
H6 Hermes Kanban routing
Implementation             — coding_agents from the model-law roster (below); fresh CLI PTY per ticket
```

The MODEL-LAW ROSTER is the single source of agent identity. Every stage above
names an agent *role*; the roster names the concrete agent filling each role.

```text
model_law_roster:
  roster_version: 1.0.0
  orchestrator: claude-fable          # Main Orchestrator / Claude-Router seat (ruling R1)
  verifier: hermes                    # Hermes-Verifier: verification + Kanban board custody/crafting + Manual QA (R1)
  coding_agents: [codex@gpt-5.6-sol]  # sole coder today; ONLY V may add/replace entries (ruling R4)
  planning_agents: [claude, grok]     # C2/C4 plan + G1/G3/G5 research/slice artifact workers
  review_agents: [claude, grok, hermes]  # independent reviewers + Hermes-Verifier
  loop_ownership:                     # per-mission election (ruling R7): asked at H0 intake
    requirements: [ask-at-intake]     # user answers which model(s) own each loop
    architecture: [ask-at-intake]     # one or more models per loop
    programming: [ask-at-intake]
    qa: [ask-at-intake]
```

Roster law (ruling R4): Only V edits the model-law roster; agents read it as state;
no protocol document may hard-code an agent identity outside the roster;
roster changes are IMPORTANT OPERATIONS (routed via the V DECISIONS PACKET, §10)
and bump `roster_version`. The current values preserve today's assignments (Codex
is the sole coder), so behavior is unchanged until V edits the roster. Coding-agent
assignment is volatile by design: future coding agents are added by editing the
roster, never by editing prose in this or any other document.

Loop-ownership election (ruling R7): at every mission intake (H0), the Main
Orchestrator prompts the user to answer which model(s) — one or more — own each
of the four loops (REQUIREMENTS ENGINEERING, ARCHITECTURE, PROGRAMMING, QA). The
user's answers instantiate this mission's `loop_ownership` map (a per-mission
roster instantiation under the user's authority — legal because only V/the user
edits the roster). Only after the election does the Main Orchestrator kick the
Heartbeat Protocol off. The `ask-at-intake` defaults above are placeholders, not
assignments: if the user explicitly delegates the election ("you pick"), the
Orchestrator fills the map from the roster's agent lists and records the
delegation on the mission ticket.

A revision stays with the original stage/ticket worker and resumable CLI session. For Claude/Grok stage revisions, Hermes sends `/compact`, verifies completion, then supplies the review comments. Do not silently substitute agents.

## Binding post-dialogue checkpoint compaction

After every durable planning, coding, review, or correction sequence—and after
any substantive Hermes↔agent ping-pong—Hermes runs the CLI compaction command
inside that same interactive PTY before parking it or proceeding with review:

```text
Claude Code 2.1.205: /compact <preservation focus>
Grok Build 0.2.93:   /compact <preservation context>
Codex CLI 0.144.0:   /compact
```

The current Grok installation uses `/compact [context]`; re-check after CLI
upgrades. Codex's installed menu documents `/compact` without arguments, so
all durable state must be externalized before running it.

Before compaction, save the artifact/diff, complete or record checks, post the
handoff/comment, write accepted decisions and unresolved findings to durable
state, and wait for the prompt to become idle. Never compact while an edit,
tool call, model response, or test is still in flight.

Sequence placement:

```text
numbered stage handoff → compact same stage PTY → Hermes stage gate
READY FOR PEER REVIEW → compact same Codex worker PTY → peer review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

Record `CLAUDE COMPACTION CHECKPOINT`, `GROK COMPACTION CHECKPOINT`, or
`CODEX COMPACTION CHECKPOINT` with the session, completed sequence, durable
state paths, command, success evidence, post-compact state, and comment cursor.
If substantive dialogue occurs after a checkpoint, compact again at the next
stable handoff. A checkpoint after the final substantive turn satisfies the
pre-revision compaction requirement; do not run empty duplicates.

Applicability by transport: compaction checkpoints apply to **PTY transports only**
(long-lived terminal agent sessions that accumulate context). They are **N/A for
SDK-subagent transports**, whose context is bounded per invocation and does not
accumulate across the mission. An SDK-subagent node never blocks on a
`COMPACTION CHECKPOINT`.

## Binding Hermes numbered-stage review gates

Hermes itself reviews every completed numbered planning artifact after Step 1.
An agent or specialist review may add evidence but cannot replace the Hermes
gate.

```text
G1 Research.md
  → Hermes handoff-integrity check only; no substantive Research review
Plan-review is the C2 -> {H2 ∥ G3} -> H3 planning diamond — see §7 "Edges, diamonds, and feedback edges".
Step 4 / C4 FinalPlan.md
  → HERMES STAGE REVIEW PASS required before G5
Step 5 / G5 VerticalSlices.md
  → HERMES STAGE REVIEW PASS required before H6
Step 6 / H6 Kanban ticketization
  → HERMES STEP 6 SELF-AUDIT PASS required before any Codex launch
```

For Steps 2–5, the stage owner posts `READY FOR HERMES STAGE REVIEW`.
Hermes reads the original request, complete artifact, approved upstream
artifacts, cited material evidence, and applicable comments. Hermes records
either `HERMES STAGE REVIEW PASS` or
`HERMES STAGE REVIEW CHANGES REQUESTED`. The next stage remains blocked on
CHANGES REQUESTED; the original stage session revises after verified
`/compact` and returns a new review packet.

Step 1's exemption is narrow: Hermes still verifies that `Research.md` exists,
is readable, names its evidence, records its Grok session/path, and exposes no
safety/destructive-data decision. Later stages may return a discovered
research gap to the original Step 1 Grok session.

At H6 Hermes assigns each ticket a persisted `risk_tier` (`low | medium | high`)
in its state object and records the reason. `risk_tier` is set once, is
auditable, and is a Hermes-only write; workers never write it.

The H6 self-audit verifies slice-to-ticket coverage, dependencies, Codex-only
implementation ownership, file contracts, comment/rework rules, review/human
gates, a deliberately small Ready queue, and the prohibition on database
deletion without V's specific approval. It additionally verifies, for every
ticket:

```text
[ ] risk_tier is set (low | medium | high) and its reason is recorded
[ ] the routed review path matches risk_tier:
      low    → direct Hermes diff review, same-cycle Done
      medium → 1 independent reviewer + Hermes
      high   → full review ladder + V (product-truth where applicable)
[ ] the immutable high-risk floor holds: any ticket touching persistence or
    migrations, provider spend, security/auth, scoring semantics, live/product
    data, or destructive/architectural work is risk_tier: high and was NOT
    tiered down
[ ] no ticket's file/contract paths contradict its assigned risk_tier
```

Record `HERMES STEP 6 SELF-AUDIT PASS` only when every line holds; otherwise
record `HERMES STEP 6 SELF-AUDIT CHANGES REQUESTED` naming the exact ticket and
the failed line.

## Roles

- **V / Human reviewer:** product and acceptance authority.
- **Hermes:** cockpit broker, status/comment router, evidence gate, human-review coordinator, and sole Done/Blocked authority.
- **Worker:** assigned ticket owner. Codex is the only coding worker under the current law; Claude/Grok may own planning or review artifacts.
- **Peer reviewer:** different agent/session from the worker; reads evidence and comments, never writes the fix.
- **Kanban:** durable source of ticket scope, comments, review state, and routing decisions.

## Ticket ownership and continuity

Hermes must establish before launch:

```text
Assigned agent: <Codex|Claude|Grok>
Original worker session: <CLI session id when known>
Rework owner: same as Assigned agent / Original worker session
Lane starter: yes|no
Previous ticket: <id — title>|none
Allowed to edit:
Forbidden:
Verification:
Human review required: yes|no
```

Current mode rules:

- Production/test/migration/configuration implementation tickets are `[Codex]` only.
- `[Claude]` and `[Grok]` tickets are planning, review, audit, or verification work unless V explicitly changes the coding law.
- Rework returns to the same original worker and session.
- Session loss does not silently authorize a replacement. Hermes must comment `WORKER CONTINUITY OVERRIDE` with the reason, evidence, replacement identity, and preserved context.

## Source-of-truth order

1. Safety and explicit V direction.
2. Latest applicable Hermes/human decision comment on the current ticket.
3. Current ticket body and all comments in chronological order.
4. This shared protocol and the agent-specific adapter.
5. Repo guidance such as `AGENTS.md` and vendor skill files.
6. Chat prompts and prior memory.

A newer comment may supersede an older comment, but agents must not cherry-pick. If comments conflict and no explicit supersession exists, post a blocker for Hermes.

## Mandatory ticket-comment scan

Every worker, reviewer, and Hermes must read the full ticket body plus all comments:

1. before claim/resume;
2. before the first edit or review action;
3. on every heartbeat/wakeup;
4. after any status transition;
5. before requesting peer review;
6. before posting a review verdict or Hermes handoff;
7. before rework after a ticket returns to `ready`;
8. before human-review routing or Done.

Every claim, heartbeat, review, and handoff records:

```text
comments read through: <latest comment id or timestamp>
```

`ready` does not necessarily mean new work. It may mean Hermes or the human returned the ticket with required modifications. Read comments before acting.

## Logical review state machine

Kanban may not have native peer-review, Hermes-review, or human-review columns. These comment markers are therefore binding logical states:

```text
ready
  → WORKER CLAIM
  → running / worker implements or authors artifact
  → READY FOR PEER REVIEW
  → independent reviewer
      ├─ PEER REVIEW CHANGES REQUESTED → same worker/session fixes → peer re-review
      └─ PEER REVIEW APPROVED + READY FOR HERMES REVIEW
           → Hermes review
               ├─ HERMES CHANGES REQUESTED → status ready + same worker/session
               │    → REWORK ACKNOWLEDGED
               │    → REWORK READY FOR HERMES REVIEW
               │    → Hermes review again
               └─ READY FOR HUMAN REVIEW / V MANUAL QA PACKET
                    ├─ HUMAN REVIEW CHANGES REQUESTED → status ready + same worker/session
                    └─ HUMAN REVIEW PASSED → Hermes Done
```

For an internal ticket whose contract explicitly says `Human review required: no`, Hermes may complete after independent review and direct verification. User-facing, UX-sensitive, feature-level, or closure tickets default to human review.

## Flow requirements

### 1. Worker claim and work

The assigned worker reads all comments, records its session identity, claims the ticket, and posts `WORKER CLAIM`. It then works only the ticket/file contract and keeps comment scans current.

### 2. Worker asks for peer review

First-pass work ends with `READY FOR PEER REVIEW`, not `READY FOR HERMES REVIEW`. The worker attaches diff/artifact, RED/GREEN evidence where applicable, exact checks, risks, and the latest comment cursor.

### 3. Independent reviewer gate

The reviewer must be a different agent/session and read-only for the reviewed change.

- On rejection, post `PEER REVIEW CHANGES REQUESTED` with concrete evidence. Return findings to the same worker/session. The reviewer does not write the fix.
- On approval, post `PEER REVIEW APPROVED`, then `READY FOR HERMES REVIEW`. The reviewer—not the original worker—advances first-pass work to Hermes.

### 4. Hermes gate

Hermes reads the complete comment chain and verifies actual evidence.

- If changes are required, post `HERMES CHANGES REQUESTED`, set the ticket to `ready`, preserve assignment and original session, and name the exact comment/findings the worker must address.
- If human review is required, post `READY FOR HUMAN REVIEW` plus a `V MANUAL QA PACKET` and place a routing hold so no worker reclaims it while V reviews.
- If the contract explicitly waives human review and acceptance is proven, Hermes may complete with evidence.

### 5. Same-worker rework loop

A ticket returned to `ready` is reclaimed by the same worker/session. The worker posts `REWORK ACKNOWLEDGED`, addresses every listed finding, and then posts `REWORK READY FOR HERMES REVIEW` directly to Hermes. Peer re-review is optional only when Hermes's comment explicitly requests it; otherwise the correction loop returns directly to Hermes as V specified.

Hermes again chooses human review, another `ready` rework loop, or evidence-backed completion when human review was explicitly waived.

### 6. Human review

Hermes relays the human packet to V and writes V's verdict back to the ticket.

- Pass: `HUMAN REVIEW PASSED`; Hermes completes Done.
- Changes: `HUMAN REVIEW CHANGES REQUESTED`; Hermes records actionable findings, returns the ticket to `ready`, and preserves the same rework owner/session.

## Required comment templates

### Post-dialogue compaction checkpoint

```text
<AGENT> COMPACTION CHECKPOINT:
- mission/stage/ticket:
- CLI session id:
- sequence completed:
- durable artifact/diff/comment paths:
- command used: /compact <context> | /compact
- last substantive turn included: yes
- success evidence:
- post-compact state: parked | awaiting_review | ready_for_revision | complete
- comments read through: <id/timestamp | not ticketed>
```

If compaction fails, use `COMPACTION BLOCKED` with the CLI/version/session,
command, raw error, durable-state locations, and smallest safe recovery. Never
silently replace the session.

### Numbered-stage handoff/gate

Step 1 uses:

```text
RESEARCH HANDOFF COMPLETE:
- mission/step:
- Grok CLI session:
- Research.md path:
- sources/evidence named:
- assumptions/risks:
- comments read through: <id/timestamp | not ticketed>
```

Steps 2–5 use:

```text
READY FOR HERMES STAGE REVIEW:
- mission/step:
- owner CLI session:
- artifact path:
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: <id/timestamp | not ticketed>
```

Hermes records `HERMES STAGE REVIEW PASS` or
`HERMES STAGE REVIEW CHANGES REQUESTED` with the artifact, evidence inspected,
stage-contract verdict, exact findings/required changes, original owner/session,
current `REWORK ROUND: n of 3`, and whether the next stage remains blocked. Step 6 records
`HERMES STEP 6 SELF-AUDIT PASS` or its CHANGES REQUESTED counterpart.

### WORKER CLAIM

```text
WORKER CLAIM:
- agent:
- ticket:
- worker CLI session id:
- branch/worktree:
- assignment type: first_pass | rework
- comments read through:
- next action:
```

### Heartbeat

Use `CODEX HEARTBEAT`, `CLAUDE HEARTBEAT`, or `GROK HEARTBEAT`.

```text
<AGENT> HEARTBEAT:
- current ticket:
- status: queued | ready | working | waiting_review | waiting_hermes | waiting_product_proof | waiting_human | waiting_dependency | waiting_resource | failed_tooling | changes_requested | done | archived
- worker/reviewer CLI session id:
- branch/worktree:
- last command/check:
- files/artifact changed:
- comments read through:
- live-output channel/path:
- needs Hermes: yes/no
```

### READY FOR PEER REVIEW

```text
READY FOR PEER REVIEW:
- worker:
- worker CLI session id:
- ticket:
- branch/worktree:
- commit SHA if committed:
- files/artifact changed:
- RED/GREEN evidence if code:
- tests/checks with exact output:
- allowed-scope evidence:
- risks/open questions:
- comments read through:
```

### PEER REVIEW CHANGES REQUESTED

```text
PEER REVIEW CHANGES REQUESTED:
- reviewer:
- reviewer CLI session id:
- ticket:
- verdict: RED
- REWORK ROUND: n of 3
- findings with severity and evidence:
- required modifications:
- required verification:
- route to: same original worker/session
- comments read through:
```

### PEER REVIEW APPROVED and READY FOR HERMES REVIEW

```text
PEER REVIEW APPROVED:
- reviewer:
- reviewer CLI session id:
- ticket:
- verdict: GREEN
- evidence inspected:
- checks independently run:
- residual risks:
- comments read through:

READY FOR HERMES REVIEW:
- sent by reviewer:
- original worker/session:
- ticket:
- branch/worktree:
- commit SHA if committed:
- files/artifact changed:
- worker evidence:
- reviewer evidence:
- human review required by contract: yes/no
- recommended Hermes action:
```

### HERMES CHANGES REQUESTED

```text
HERMES CHANGES REQUESTED:
- ticket:
- verdict: return_to_ready
- REWORK ROUND: n of 3
- original worker/session:
- findings with evidence:
- required modifications:
- required verification:
- comments worker must read through:
- peer re-review required: yes/no
- assignment preserved: yes
```

Hermes then sets the ticket to `ready` without changing the assigned worker.

### REWORK ACKNOWLEDGED and REWORK READY FOR HERMES REVIEW

```text
REWORK ACKNOWLEDGED:
- worker/session:
- ticket:
- triggering Hermes/human comment:
- findings understood:
- comments read through:

REWORK READY FOR HERMES REVIEW:
- worker/session:
- ticket:
- triggering findings addressed one by one:
- files/artifact changed:
- RED/GREEN evidence if code:
- exact checks/output:
- residual risks:
- comments read through:
```

### READY FOR HUMAN REVIEW

```text
READY FOR HUMAN REVIEW:
- ticket:
- Hermes verdict:
- worker/reviewer evidence summary:
- environment/URL:
- exact steps for V:
- expected result:
- known caveats:
- pass/fail response needed:
```

Hermes also writes either `HUMAN REVIEW PASSED` or `HUMAN REVIEW CHANGES REQUESTED` after V responds.

## 8. Marker vocabulary (union)

All markers below are binding. The pre-3.0.0 spine markers are kept; the new
markers are added (no marker is renamed or removed).

Existing (kept): WORKER CLAIM; CODEX/CLAUDE/GROK HEARTBEAT;
CODEX/CLAUDE/GROK BLOCKED; <AGENT> COMPACTION CHECKPOINT; COMPACTION BLOCKED;
RESEARCH HANDOFF COMPLETE; READY FOR PEER REVIEW; PEER REVIEW CHANGES REQUESTED;
PEER REVIEW APPROVED; READY FOR HERMES REVIEW; READY FOR HERMES STAGE REVIEW;
HERMES STAGE REVIEW PASS; HERMES STAGE REVIEW CHANGES REQUESTED;
HERMES CHANGES REQUESTED; HERMES STEP 6 SELF-AUDIT PASS; READY FOR HUMAN REVIEW;
V MANUAL QA PACKET; HUMAN REVIEW PASSED; HUMAN REVIEW CHANGES REQUESTED;
REWORK ACKNOWLEDGED; REWORK READY FOR HERMES REVIEW; REWORK ROUND;
WORKER CONTINUITY OVERRIDE; LIVE MONITORING ACTIVE.

Added (union): HERMES DONE; HERMES BLOCKED; HERMES AUTHORIZED NEXT;
HERMES AUTHORIZED ROUTE; V DECISIONS PACKET; V STEERING REQUIRED; AUTHORITY EPOCH;
HERMES LIVENESS REQUESTED; READY FOR EXTERNAL REVIEW;
EXTERNAL REVIEW PASSED | CHANGES REQUESTED; REQUIREMENTS SATISFIED; ARCHITECTURE SATISFIED.

Router-owned markers (written only by Claude-Router, §5.1): HERMES AUTHORIZED NEXT,
HERMES AUTHORIZED ROUTE, WORKER CONTINUITY OVERRIDE, AUTHORITY EPOCH.
Verifier-owned markers (written only by Hermes-Verifier, §5.2): HERMES DONE,
HERMES BLOCKED, all STAGE REVIEW verdicts, HERMES CHANGES REQUESTED,
READY FOR HUMAN REVIEW / V MANUAL QA PACKET.
Loop-owner markers (Grand Loop closure, §7 "The Four Loops and the Grand Loop"):
REQUIREMENTS SATISFIED (REQUIREMENTS loop owner only), ARCHITECTURE SATISFIED
(ARCHITECTURE loop owner only); both consumed by Claude-Router and Hermes-Verifier
at mission closure.

## 9. Review-lane applicability

Two documents historically each claimed to be the binding review law:
peer-review-first (spine / FULL `ticket-comment-review-loop`) and
Hermes-direct-triage (FULL `hermes-owned-triage-review-and-successor-routing`).
They do not contradict once scoped by `risk_tier` and lifecycle position:

```text
peer-review-first  = DEFAULT lane for first-pass work at risk_tier medium or high.
                     A different read-only reviewer verifies BEFORE Hermes-Verifier
                     (§5.2). Worker never self-sends to Hermes.

Hermes-direct-triage = applies ONLY to:
                     (a) risk_tier = low first-pass work (direct Hermes-Verifier
                         diff review, same-cycle Done, no peer reviewer), OR
                     (b) post-review Triage administration — routing an already-
                         reviewed card to Done / rework / human review / successor.
```

High-risk floor (immutable, can never be tiered down to skip peer review):
persistence/migrations, provider spend, security/auth, scoring semantics,
live/product data, destructive or architectural work. Any ticket touching these
is risk_tier = high regardless of size and takes the full review diamond (§7).
H6 self-audit verifies the routed lane matches the persisted `risk_tier`.

## 10. Convergence and batched-approval laws

Spine-level invariant: **no cycle without a bound; no wait without an owner, a
deadline, and an escalation edge.** These laws (introduced in Phase 1) are carried
forward unchanged:

1. **Rework cap.** `rework_round` increments on every CHANGES REQUESTED of any kind
   (peer, Hermes, stage, human). At `rework_round = 3` the loop freezes and emits
   `V STEERING REQUIRED` into the V DECISIONS PACKET. No unbounded revise→re-review.
2. **Unblock reset ceiling.** `unblock` / counter-reset may occur at most **twice
   per ticket**; the third occurrence freezes and escalates.
3. **Chatter breaker.** Any two-party exchange (Hermes↔worker, Hermes↔watcher)
   producing **6 comment exchanges OR 24 router wakes on one card with no status or
   epoch transition** trips freeze + escalation. This generalizes the human-block
   circuit breaker.
4. **Wake-gate fingerprint.** Comments are classified *state-changing*
   (status/epoch/handoff-marker transitions) vs *chatter*; only state-changing
   comments wake the Router. `wakes_since_transition` implements the counter.
   FULL's `[SILENT]` / `NOOP` / `GOAL WAITING — DORMANT` sentinel is DEMOTED to a
   fallback tier strictly BELOW this wakeAgent gate: the change-driven fingerprint
   decides whether to wake; the `[SILENT]` sentinel is consulted only as a
   belt-and-suspenders suppressor when the fingerprint is unavailable, never as the
   primary wake decision.
   This also resolves FULL's watcher-cadence self-contradiction (1-minute mandatory
   state detection vs 3–5-minute recovery cadence): cadence is irrelevant to cost once
   unchanged ticks are tokenless — an unchanged fingerprint emits `wakeAgent:false`,
   spends no model tokens, and produces no comment, so the detection interval may stay
   at 1 minute while review wakes only on a real transition.
5. **V DECISIONS PACKET.** Hermes accumulates V-owned gates (the named-category
   filter in §11 law 9 decides what qualifies) and flushes ONE consolidated packet
   when: **≥3 decisions pending, OR any decision pending >4h, OR an entire lane is
   frozen on it, OR V asks.** Each row: card, decision needed, evidence link,
   smallest yes/no.
6. **Batch route authorization.** When a DAG was already approved at H6, Hermes
   issues one `HERMES AUTHORIZED ROUTE: <ticket list> epoch=<n>` for the chain.
   Per-node `HERMES AUTHORIZED NEXT` is required again only on a new risk signal
   (RED, contract drift, architecture boundary, important operation).
7. **Heavy-command semaphore.** `max_concurrent_heavy` bounds the number of heavy
   builds/tests/agents that may run at once; it is declared once in
   `## Parallelism and file ownership` (laptop = 1) and referenced by pointer
   everywhere, including here. A stronger machine raises this one number with no
   protocol rewrite.

Convergence caps never override safety gates: a frozen loop escalates; it never
auto-approves.

The seven items above are an ABRIDGED INDEX. This section is the relocated Phase 1
convergence-and-escalation laws section, and it carries verbatim the machine-usable
fenced templates authored there — the `V STEERING REQUIRED` template (Task 1.1),
the `### V DECISIONS PACKET` template (Task 1.4), and the `### Batch route
authorization: HERMES AUTHORIZED ROUTE` template (Task 1.5), plus the
`### Chatter breaker` law (Task 1.2). None of those template bodies is summarized
away; they remain in this section for machine use.

The laws in this section are universal; the agent adapters and the Hermes Lite
and Full skills reference them and add only mechanism-level detail.

### Rework round cap and escalation-at-cap

`rework_round` is a per-ticket counter that starts at 0 and increments by 1 on
every CHANGES REQUESTED of any kind — `PEER REVIEW CHANGES REQUESTED`,
`HERMES CHANGES REQUESTED`, `HERMES STAGE REVIEW CHANGES REQUESTED`, and
`HUMAN REVIEW CHANGES REQUESTED`. The current value is written as
`REWORK ROUND: n of 3` in every CHANGES REQUESTED comment.

- The cap is 3. When `rework_round` reaches 3 (`REWORK ROUND: 3 of 3`) the loop
  freezes: Hermes places a routing hold so no worker reclaims the card (in
  typed-state terms `status` becomes `waiting_human`,
  `escalation_target: v_packet`, `waiting_since` set) and posts
  `V STEERING REQUIRED` into the `V DECISIONS PACKET`.
- A frozen loop never auto-approves and never weakens any safety, product-truth,
  or human gate. Convergence caps only stop unbounded revise → re-review; a
  frozen loop escalates, it never self-clears.
- After V steers, Hermes may reset `rework_round` to 0 only under the unblock
  reset ceiling (at most twice per ticket) defined in the adapter blocked-ticket
  recovery.

```text
V STEERING REQUIRED:
- ticket:
- reason: rework_round cap (3 of 3) reached | unblock reset ceiling (2 of 2) exceeded | chatter breaker tripped
- rework_round: 3 of 3
- loop frozen: yes (routing hold placed)
- recurring findings that did not converge:
- last three CHANGES REQUESTED comment cursors:
- smallest steering question / yes-no for V:
- routed into: V DECISIONS PACKET
- comments read through:
```

### Chatter breaker

The chatter breaker generalizes the Lite human-block circuit breaker to every
two-party exchange on a card (Hermes↔worker, Hermes↔reviewer, Hermes↔watcher).
It trips when a single card accumulates, with no `status` and no
`authority_epoch` transition:

- 6 comment exchanges between the same two parties, OR
- 24 router wakes — `wakes_since_transition` reaches 24.

On trip, Hermes freezes the card (routing hold; typed-state `status` becomes
`waiting_human`, `escalation_target: v_packet`, `waiting_since` set) and posts
`V STEERING REQUIRED` into the `V DECISIONS PACKET`. `wakes_since_transition`
resets to 0 on any real `status` or `authority_epoch` transition. This is the
law that catches an unproductive Hermes↔worker loop that the silence-only
liveness escalation never trips.

### V DECISIONS PACKET

V-owned decisions are not relayed one at a time. Hermes accumulates every
V-owned gate (the named-category escalation filter decides what qualifies:
provider spend, data writes, deletion, destructive git, architecture/scope,
reconstructed evidence, waiver, final acceptance, plus every rework-cap and
chatter-breaker `V STEERING REQUIRED` freeze and every H6 lane-plan approval)
and flushes them as ONE consolidated packet when any threshold is met:

- 3 or more decisions are pending, OR
- any single decision has been pending more than 4 hours, OR
- an entire lane is frozen on a pending decision, OR
- V asks.

```text
V DECISIONS PACKET:
- authority_epoch:
- flushed because: >=3 pending | pending >4h | lane frozen | V asked
- decisions:
  - card: <ticket id — title>
    decision needed: <one V-owned gate>
    evidence link: <artifact/comment path or URL>
    smallest yes/no: <the exact minimal question V answers>
    waiting_since: <timestamp>
  - card: <next...>
- lane-plan rows (H6 worktree approval): one row per lane —
  worktree path, branch, file contract (allowed/readonly/forbidden),
  merge order, closure/integration target
- comments read through:
```

A single V approval of an H6 lane-plan row covers every worktree create/use
inside that approved plan; destructive git operations (delete/rewrite/force)
remain individually V-gated. This packet replaces one-at-a-time relay for
decisions only — stage-prompt transport is unchanged.

### Batch route authorization: HERMES AUTHORIZED ROUTE

When a DAG has already been approved at H6, Hermes issues ONE
`HERMES AUTHORIZED ROUTE` covering the whole approved chain instead of a
per-node `HERMES AUTHORIZED NEXT` for each card. A worker may claim any Ready
card named in a current `HERMES AUTHORIZED ROUTE` for the current
`authority_epoch`.

Per-node `HERMES AUTHORIZED NEXT` is required again only on a new risk signal on
a specific card: a genuine RED, a file-contract drift, an architecture/scope
boundary, or an IMPORTANT OPERATION (provider spend, data write, deletion,
destructive git, push/merge, or worktree create/use outside the approved lane
plan).

```text
HERMES AUTHORIZED ROUTE:
- authority_epoch:
- approved at: H6 self-audit PASS <cursor>
- tickets (deterministic order): <id — title>, <id — title>, ...
- per-lane heads and file contracts: <lane — allowed / forbidden>
- re-authorization still required for: RED | contract drift | architecture boundary | important operation
- comments read through:
```

8. **Re-list before finalizing (batch/wave law).** Before closing a wave, batch, or
   `HERMES AUTHORIZED ROUTE`, Hermes re-lists the live board and re-reads each card's
   current state block; it never finalizes from a stale in-memory list. A close,
   Done, or route-completion recorded against a list that was not re-read at
   finalize-time is invalid and must be redone against a fresh read.

## Blocked format

Use `CODEX BLOCKED`, `CLAUDE BLOCKED`, or `GROK BLOCKED`.

```text
<AGENT> BLOCKED:
- active ticket:
- blocker type: dependency | process | safety | architecture | file_contract | verification | session_continuity
- exact blocker:
- file/ownership conflict if any:
- comments read through:
- resulting status: waiting_dependency | waiting_hermes | waiting_review | waiting_product_proof | waiting_human | waiting_resource | failed_tooling | changes_requested
- escalation_target: hermes | v_packet
- waiting_since: <timestamp>
- proposed smallest unblock:
- needs Hermes: yes/no
```

Use Blocked only for a true blocker: forbidden files, destructive data, missing dependency, architecture/product decision, secret/private-data risk, impossible verification, contradictory routing, or lost required session continuity. Local friction is not a goal blocker.

### Blocked-meaning → status mapping

`<AGENT> BLOCKED` is a **marker that requests a transition**, never a Kanban
status by itself. The word "blocked" previously carried eleven distinct
documented meanings; each now maps to exactly one typed `status`:

| # | Documented "blocked" meaning | New `status` | escalation_target |
|---|---|---|---|
| 1 | Missing/undone dependency or prerequisite ticket (`blocker type: dependency`; `GOAL BLOCKED` on an unmet prerequisite) | `waiting_dependency` | hermes |
| 2 | Contradictory or absent routing/process decision needing Hermes (`blocker type: process`) | `waiting_hermes` | hermes |
| 3 | Forbidden-file or file-ownership conflict needing a contract repair (`blocker type: file_contract`) | `waiting_hermes` | hermes |
| 4 | Lost CLI session continuity awaiting `WORKER CONTINUITY OVERRIDE` (`blocker type: session_continuity`) | `waiting_hermes` | hermes |
| 5 | "Waiting for Hermes review" mislabelled as BLOCKED | `waiting_hermes` | hermes |
| 6 | Intentional review gate after `READY FOR PEER REVIEW` (`review-required`/`needs_input`) | `waiting_review` | hermes |
| 7 | Recurrence-cap Triage or CHANGES REQUESTED rework return | `changes_requested` | hermes |
| 8 | Verification impossible with the current tooling/environment (`blocker type: verification`) | `failed_tooling` | hermes |
| 9 | Heavy-command or resource-contention wait (serialize heavy builds; `max_concurrent_heavy`) | `waiting_resource` | hermes |
| 10 | Product-truth gate awaiting live app/API/DB/browser evidence | `waiting_product_proof` | hermes |
| 11 | Human or important-operation decision gate — safety, architecture, provider spend, product-data write, destructive git, waiver, or final acceptance (`blocker type: safety`/`architecture`; `IMPORTANT OPERATION`; human-block circuit breaker) | `waiting_human` | v_packet |

Every `waiting_*` status records `waiting_since` and `escalation_target`. The
`blocker type:` taxonomy above is preserved unchanged; it now classifies *why*
the ticket entered its mapped `waiting_*` status.

## V-visible live-output channel

When Hermes declares `LIVE MONITORING ACTIVE`, each active worker/reviewer maintains a dedicated channel or `.hermes/live/` fallback:

```text
DebateAI <AGENT> <ticket-id> <worker|reviewer> live
[HH:MM] <AGENT> <ticket-id> — <state>: <one-line action/result/next step>
```

Live output does not replace comments. Claims, heartbeats, review requests, verdicts, Hermes decisions, and human verdicts still go to the ticket.

### Live files and host task lists are projections

Kanban plus the typed state object (see §2 State contract) are the
sole authority for ticket state. `.hermes/live/` files and any host or desktop
task list are **read-only projections regenerated from that authority** — they
are never a source of truth, are never hand-authored as state, and may be
discarded and regenerated at any time. If a projection disagrees with the state
object, the state object wins and the projection is regenerated. No routing,
review, or Done decision may be made from a live file or a host task list.

## Parallelism and file ownership

- One writer per file/hunk.
- Reviewer sessions are read-only.
- Sibling implementation tickets may run in parallel only with non-overlapping file contracts.
- Planning/audit can run in parallel when read-only and cheap.
- **`max_concurrent_heavy` (semaphore, declared once here):** the maximum number of heavy builds/tests/agents that may run at the same time. On V's laptop this value is **1** (today's behavior). Raising it to run more heavy commands in parallel is a one-number change on a stronger machine — no protocol rewrite. Every other document references this parameter by pointer instead of restating a numeric limit.
- A ticket returned for changes remains assigned to its original worker. Do not give it to an idle different worker merely for speed.

## 11. Preserved laws (verbatim)

These laws are reproduced verbatim from the audit's preserved-law set (blueprint
§1.3). They may be moved or reformulated but NEVER weakened. The parenthetical
"§3.x" pointers are the original blueprint references; in this spine they map to
§10 (convergence), §5.3/§9 (proportional review), and §12 (glossary).

1. Independent review before Done; reviewer never edits; worker never self-sends to Hermes; no self-Done.
2. No-fake-data / no-scaffold / RED→GREEN evidence law; "workflow evidence is not product evidence."
3. Per-ticket file contracts (Allowed / Read-only / Forbidden / Verification) — this IS a node contract; keep and extend.
4. Sticky worker/session ownership on rework + `WORKER CONTINUITY OVERRIDE`.
5. AUTHORITY EPOCH monotonic authority + compare-before-write / fresh-read-before-mutate.
6. Blocker-type taxonomy (already an enum in the BLOCKED template).
7. `wakeAgent:false` tokenless change gate (correct and keep — extend its fingerprint spec, §3.4).
8. Detector/reviewer/router separation of powers (already written for the watcher — generalize to Hermes itself).
9. Escalate-to-V-only-for-named-categories filter (provider spend, data writes, deletion, destructive git, architecture/scope, reconstructed evidence, waiver, final acceptance).
10. Product-truth gates requiring live app/API/DB/browser evidence.
11. Failed-test ticket fanout (a real diamond — becomes the template).
12. Sibling-lanes + one-closure-gate pattern; per-worktree Split→Verify→Merge checklist (promote from planning skill to spine).
13. Proportional review fast path low/medium/high (make it a persisted field, §3.3).
14. Human-block circuit breaker freeze rule (generalize its trigger, §3.4).
15. H1 research handoff-integrity-only gate (proof the team already knows how to right-size a gate).

### 11.1 Universal safety rules (agents must not)

The universal "agents must not" list is the carried-forward `## Universal safety
rules` section (preserved verbatim by this restructure, per the carry-forward
manifest; Phase 5 Tasks 5.1/5.3 anchor immediately before that heading). It is a
§1.3 preserved law and is never weakened or duplicated; consult it there. In
summary it forbids: self-Done; pushing without explicit V approval; deleting
database/product data without V's explicit approval for that deletion; crossing
file contracts; creating fake runtime product data; revealing secrets/tokens/
cookies/private prompts/raw provider payloads/private data; a reviewer editing the
change it reviews; and ignoring a newer ticket comment for an older, more
convenient prompt. The authoritative wording is the `## Universal safety rules`
section, not this summary.

## Worktree isolation

Every implementation lane runs in its own isolated git worktree. Isolation is the default lane mechanism for all sibling tickets whose file contracts do not overlap — not an optional optimization. Reviewers and planners never open a writer's worktree to edit; they read it.

### Worktree state fields

Each lane carries the typed `worktree` field on its ticket state:

```text
worktree:
  path: <.worktrees/lane-x>          # isolated `git worktree add` directory
  branch: <branch>                   # the lane's branch
  merge_status: none | pending | merged
```

`merge_status` starts `none`, becomes `pending` when the lane reaches its integration node, and `merged` only after the integration node confirms the commits landed in the closure/integration target. Only Claude-Router (or V) writes `merge_status`; the lane worker writes `path` and `branch` at claim.

### Universal Split -> Verify -> Merge lane checklist

This checklist is the universal per-lane mechanism (promoted from the planning skill; it applies to every implementation lane, not only Codex):

- [ ] Preflight: run `git status`; read the ticket body, all comments, dependencies, and the file-scope map; confirm the lane's `worktree.path`/`worktree.branch` and `authority_epoch`.
- [ ] Split: `git worktree add <worktree.path> <worktree.branch>` — one worktree per independent non-overlapping lane; never parallel-edit the same files/hunks.
- [ ] Guardrails: no pushes, no destructive git operations, no marking Done, no fake runtime data; heavy commands honor the `max_concurrent_heavy` semaphore (see `## Parallelism and file ownership`).
- [ ] Verify: run the ticket's focused checks inside that worktree and record exact output.
- [ ] Coordinate: post the lane's heartbeat and, on first-pass completion, `READY FOR PEER REVIEW` with `worktree.path`, commit SHA, files, checks, risks, and comment cursor. A separate read-only reviewer advances GREEN work.
- [ ] Merge/handoff: never integrate a lane yourself; wait for Claude-Router to route the lane to the integration node (see `## Worktree integration and closure gate`).

### LANE PLAN APPROVAL (H6)

Worktree creation and use remain a V-gated important operation. The gate is satisfied **per mission, not per operation**: at H6, Hermes submits the complete lane plan as ONE row in the V DECISIONS PACKET. V's single approval of that row authorizes every worktree create and use inside the approved plan for the mission. Destructive git operations (worktree remove, branch delete, history rewrite, force push) are never covered by this approval and always require their own individual important-operation approval when they arise.

```text
LANE PLAN APPROVAL (H6 — one V DECISIONS PACKET row):
- mission/epoch:
- authority_epoch:
- max_concurrent_heavy: <value from the spine; laptop = 1>
- lanes:
  - lane id:
    ticket(s):
    owner: { agent: codex|claude|grok, session: <id> }
    risk_tier: low | medium | high
    worktree.path: <.worktrees/lane-x>
    worktree.branch: <branch>
    contract.allowed: [...]
    contract.readonly: [...]
    contract.forbidden: all_others
    contract.verification: [...]
- merge order: <lane-a -> lane-b -> ... into the closure target>
- closure/integration target: <path/branch>
- destructive git ops requested in this plan: none | <explicit list — each still individually gated>
- decision needed: approve all worktree create/use in this plan? (single yes/no)
- evidence link: <VerticalSlices.md path + Kanban card ids>
```

A lane worker may run `git worktree add` for its lane only after the LANE PLAN APPROVAL row for the current `authority_epoch` is approved. If no approved lane plan covers the lane, stop and post a blocker; do not create a worktree speculatively.

## Worktree integration and closure gate

Merging lane worktrees is a real graph node, not an afterthought. It has a named owner, a conflict procedure, and its own evidence.

### Integration node

- **Owner:** Claude-Router assigns the integration node to a single named session once every parent lane is Hermes-approved. Lane workers do not self-integrate.
- **Conflict procedure:** integrate approved lane commits into one closure/integration target in the merge order from the approved LANE PLAN. Resolve conflicts deliberately, one lane at a time; a conflicting lane returns to its original worker/session (the rework cap counts the round), never to an idle different worker.
- **Evidence:** record `git worktree list`, the integration target branch/commit, the per-lane commit SHAs merged, and the exact conflict resolutions. Set each merged lane's `worktree.merge_status: merged` only after its commits are confirmed present in the closure target.

### Mandatory closure-gate check

Do not certify a final browser/API/DB closure gate from Kanban Done state or the active dev workdir alone: in this workflow "Done" can mean "approved in an isolated lane worktree," and the closure target may still be behind those commits. Every closure gate must record this line before it can pass:

```text
[ ] git worktree list run; all approved commits confirmed integrated into closure target
```

If `git worktree list` shows approved commits still isolated in per-lane worktrees/branches, the closure gate stays Blocked (or open) until they are integrated into one closure target and the final API/browser/DB proof is rerun against that integrated tree. Passing focused checks inside an individual lane worktree is not integrated proof.

### Dirty-worktree / pre-existing-dirt attribution

A dirty tree is not automatically the current lane's fault, and it is never silently adopted. Before a lane reports or a reviewer certifies, attribute uncommitted changes to their owner:

- Run `git status` in the exact worktree/workdir and separate **this lane's authorized edits** (inside its `contract.allowed`) from **pre-existing dirt** (changes present before the lane claimed, or outside its file contract).
- Pre-existing or cross-lane dirt is attributed to its original owner/lane, reported by path, and left untouched — a lane never commits, reverts, or claims ownership of dirt it did not create, and never blocks solely because an unrelated tree is dirty.
- A dirty RED test may be legitimate active TDD for a still-running lane; it is called out explicitly and is never certified as a green tree.
- The integration node integrates only the committed, attributed lane commits named in the approved LANE PLAN; unattributed dirt is not integrated and not certified.

## Universal safety rules

Agents must not:

- mark their own ticket Done;
- push without explicit V approval;
- delete database/product data without V's explicit approval for that deletion;
- cross file contracts;
- create fake runtime product data;
- reveal secrets, tokens, cookies, private prompts, raw provider payloads, or private data;
- let a reviewer edit the change it reviews;
- ignore a newer ticket comment because an older prompt is more convenient.

## Hermes cockpit responsibilities

Hermes must:

1. create/repair tickets, dependencies, owner tags, file contracts, review requirements, and human-gate requirements;
2. record worker/reviewer CLI session handles;
3. ensure workers and reviewers scan comments at every boundary;
4. keep the same worker/session on rework;
5. launch a genuinely separate read-only reviewer for first-pass work;
6. reject a `READY FOR HERMES REVIEW` posted by the original first-pass worker without peer-review evidence;
7. verify comments, diff/artifact, tests, runtime evidence, and reviewer evidence;
8. route either to human review or back to `ready` with an actionable comment;
9. copy human verdicts into the ticket;
10. own Done/Blocked and interrupt V only for real decisions.

### Cockpit legibility (required V-facing status shape)

Internal rigor must not make the cockpit unreadable. The default V-facing status is
exactly four lines; when V signals confusion, stop narrating protocol ceremony and
restate in this shape:

```text
DONE: <last fully accepted ticket, or none>
RUNNING: <current ticket + plain-English activity, or none>
BLOCKED: <ticket + exact missing acceptance evidence, or none>
V ACTION: none | <one smallest important-operation decision>
```

For a binary question, lead with `Yes` or `No`, then the reason. Add test counts or
routing detail only when they explain the verdict.

### Kanban visual-launch three-layer receipt

Before reporting a Kanban/app surface as launched, prove it with all THREE layers;
a single green layer is not a launch:

1. **Health endpoint** — the service/health route returns OK.
2. **Plugin/API layer** — the Kanban plugin API (board list / card read) responds
   for the active tenant.
3. **Rendered route** — the actual board/app route renders in a browser (not just a
   200) with the expected board visible.

Report `prepared / not active` until all three pass; never claim a visual launch
from one layer.

### Main-thread orchestrator / never-writer subagent law (one law, two transports)

The orchestrating thread routes and reviews; it never writes product code or
artifacts itself. Writing is done only by a dispatched worker node (a Codex lane, or
a Claude/Grok artifact node). This is one law across both transports: PTY-hosted
agents and SDK-subagent workers. A router/orchestrator that edits the change it is
routing violates the detector/reviewer/router separation (spine §11 law 8) and the
independent-review law (§11 law 1).

## Reporting and traceability law (ruling R8)

Reports matter; traceability is non-negotiable. The harness documents itself,
exactly as the old harness did — that discipline is what makes every audit,
review, and rework checkable instead of vibes.

1. TICKET TRACE (invariant): a ticket may reach `done` only when its full chain
   is durable on the ticket itself — state block, handoff markers with evidence
   paths, independent reviewer verdict(s), Hermes-Verifier verdict, and (when
   required) the human verdict. No trace, no Done.
2. COCKPIT RECEIPTS: after every board-mutation batch, Hermes-Verifier posts a
   receipt: card ID + title, exact before -> after change, comment/instruction
   sent, evidence and reason, what runs next, and any V action needed. Grouped
   same-cycle mutations may share one receipt.
3. MISSION REPORTS: the Main Orchestrator (Claude-Router) writes durable report
   artifacts to `.hermes/reports/<mission>/` in the repo: one phase report at
   every phase gate (tasks applied, verdicts, deviations, wall-clock, escalations)
   and one mission closure report. The REQUIREMENTS SATISFIED and ARCHITECTURE
   SATISFIED markers must reference the closure report before the Grand Loop may
   close. Reports are append-only artifacts: never overwritten, never deleted
   (the prune law applies to report archives as to everything else).
4. LOOP REPORTS: each of the Four Loops records its convergence counters
   (rework_round totals, wakes_since_transition peaks, escalations emitted) in
   its section of the mission report. A loop that ran without reporting is a
   violation.
5. Falsification tie-in (ruling R5): a mission whose report chain is incomplete
   at closure FAILS acceptance; fabricated or after-the-fact-reconstructed
   reports are evidence violations under the no-fake-evidence law.
6. SELF-REPORTS (V order, 2026-08-28): every agent files its own self-report to
   `.hermes/reports/<mission>/agent-reports/<seat>.md` before its final handoff;
   no seat reaches FULLY DONE without one, and the path is in that seat's
   `allowed` list at dispatch. The requirement is installed at INTAKE, never at
   closure. Every launch packet carries this instruction VERBATIM:

   > treat it like a murder case. I want to get a nice report on what can be done
   > better. What we must upgrade. what repeatedly costed us tokens. how we can
   > make the coding more efficient. How can we turn this into a one prompt machine
   > even better.

   The bar is a case file, not a diary: name the CAUSE not the symptom, PRICE
   each finding (wall-clock, tokens, rounds), record what you NEARLY got wrong,
   name DEAD ENDS so they are not re-derived, and say where the packet was
   unclear. An anodyne self-report is worse than none — it makes an empty record
   look full. A mission whose seats filed anodyne or absent self-reports has an
   incomplete report chain under item 5.

## TDD, DDD, and worker-persistence laws (preserved from the old harness)

1. TDD LAW — mandatory RED -> GREEN -> REFACTOR: every implementation ticket
   reproduces a failing behavior or regression test FIRST (RED), makes the
   smallest change that passes (GREEN), and refactors only under green. The
   failing-then-passing evidence is attached to every handoff marker. If TDD is
   genuinely impractical for a slice, the worker blocks for an explicit V/Hermes
   waiver — a waiver is recorded on the ticket and is never itself evidence.
   Tests-after theater without RED evidence is a violation (falsifying, R5).
2. DDD LAW — domain-driven design: all work uses the product's domain language
   and preserves bounded-context and invariant ownership. Plans (C2/C4) must
   state their DDD impact — affected bounded contexts, domain terms, and
   invariants — and the ARCHITECTURE loop's plan review (H2) verifies it before
   PASS. Implementation never crosses bounded-context ownership outside its
   ticket contract (falsifying, R5).
3. WORKER-PERSISTENCE LAW: ordinary reversible implementation problems belong
   to the worker — stale anchors, imports, environment isolation, failing
   tests, contract-preserving refactors. The worker performs root-cause
   investigation and up to three evidence-based non-destructive approaches
   before blocking. Local friction is not a goal blocker; important operations
   and safety gates are never "friction."

## Stop conditions

Stop and ask Hermes through comments when:

- assignment/owner/session identity is missing or contradictory;
- a returned `ready` ticket appears assigned to a different worker without `WORKER CONTINUITY OVERRIDE`;
- comments conflict without explicit supersession;
- allowed files or verification are absent;
- a required parent is not Done;
- destructive or secret-bearing work is required;
- review independence cannot be established;
- the original session is lost and no continuity decision exists.

## The goal-invocation launch law (V ruling 2026-07-24; amended v3.3.0)

Every agent launch goes through that agent's own goal-invocation mechanism — for most
CLIs the `/goal` command. AMENDED per v3.3.0 item 9: the orchestrator PROBES each CLI's
prompt handling before first use, because a `/`-prefix fed to a CLI with its own slash
parser (Hermes) was consumed locally and killed the seat for 3h20m.

1. **The Main Orchestrator launches every worker, reviewer, and loop owner with a bounded
   goal packet** carrying the ticket contract (§4 launch-packet bounds, plus the v3.3.0
   packet fields: `rework rounds: max 3`, the self-report path inside `allowed`, the
   verbatim self-report instruction). The packet ends with the return rule: *"Return
   control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES [STAGE] REVIEW),
   a genuine blocker, or an IMPORTANT OPERATION, but keep the unfinished goal/session
   alive and resumable. Silence is normal; unchanged state needs no message. Termination
   requires the spine's goal-specific FULLY DONE condition."*
2. **Chained calls inherit the law AND the reporting law** (v3.3.0 item 7): when any
   model launches another, it uses that agent's goal mechanism, passes the same return
   rule, and must return its children's receipts. Sub-delegation without packet
   authorization is a violation.
3. **The One-Prompt Machine and chain of command are unchanged:** goal packets flow DOWN
   the authority lattice; only spine-legal surfaces flow up (review handoffs, blockers,
   V DECISIONS PACKET rows). A goal launch never grants question authority — a launched
   agent that needs a design decision first checks the slice's DECISIONS.md, then routes
   up the lattice, never to V.
4. **Codex orchestration is explicit:** Claude-Router launches each top-level Codex
   lane/ticket orchestrator with `/goal`; that orchestrator may launch only its
   authorized descendants, each also via its goal mechanism. A handoff parks an
   unfinished worker; it does not terminate it.

## v3.4.0 amendments — V-ordered vertical-slice law (ui-overhaul fidelity failure, 2026-09-01)

Ruled by V on 2026-09-01 and first encoded in `heartbeat-orchestrator` §6; mirrored here so the
spine and the installed skill carry the same rule set (version-skew law, v3.3.0 item 15). Born
from the ui-overhaul fidelity failure: the harness shipped green-on-acceptance work that failed
the developer's actual bar. Root cause named by V: **"done" was never defined well enough, and it
is not the harness's to define.** Where older text in this spine conflicts with the items below
(board shape, Done authority, worktree isolation, merge order), the items below win.

1. **Board shape at intake:** one Kanban ticket per TESTABLE VERTICAL SLICE — a beginning and an
   end (e.g. 8 overhauled pages = 8 slice tickets). Nothing else exists on the board until a slice
   opens. Seat tickets for intake seats (requirements, audits) are permitted as sub-tickets.
2. **Done = developer veto, nothing less.** A slice ticket closes ONLY when V (or the developer
   using the harness) has personally tested the slice and vetoed it done. Green gates, PASS
   verdicts, and merged-ready states are internal milestones — never Done. The orchestrator still
   closes SUB-tickets on consumed verdicts; the SLICE ticket is the developer's alone.
3. **Open one slice → decompose into sub-tickets that run in PARALLEL.** The accent falls on
   parallelism: serialize only what measurably cannot overlap, and prefer isolation over
   serialization when files are shared.
4. **One worktree (local branch) per vertical slice.** The slice's whole fleet works inside that
   worktree; seats may pull the current state of `dev` into their folder as needed. The main tree
   is nobody's default workspace once slices are open.
5. **Fleets, not single files of seats:** per slice the orchestrator dispatches a fleet (workers +
   reviewers per the roster) INSIDE that slice's worktree, and MULTIPLE SLICES RUN AT ONCE, each
   in its own worktree.
6. **Merge discipline:** slice vetoed done → merged locally (`dev`). Merge conflicts are an
   accepted, managed cost at merge time — shared-file fear does not serialize slices. When all
   slices are vetoed: merge everything locally → developer tests the whole → only then push.
   Pushes remain V-gated as always.
7. **Developer test points are load-bearing:** after each slice (pre-merge) and after the final
   local merge (pre-push). Schedule them; do not batch surprises.

## v3.3.0 amendments — V-ordered, from the 100-report post-mortem ("The Round Two Problem", 2026-08-28)

V ratified every prescription of the cross-mission post-mortem and amended three: rework
counts replace token budgets everywhere; packet review belongs to the review seat; every
finding demands a fix. The skill layer is SPLIT under the 100-line law. Where older text
in this spine conflicts with the items below, the items below win.

1. **SKILL SPLIT + THE SHORT-CONTRACT RULE.** Role contracts target ~100 lines
   (frontmatter excluded) and may exceed it when the content earns it (V amendment,
   2026-08-28); padding and unactionable routing law are what the rule forbids, and no
   real rule is ever cut to hit a number. Skills route to skills. `heartbeat-protocol` is now a router binding every seat to the
   cross-cutting laws; role contracts live in `heartbeat-orchestrator`,
   `heartbeat-worker`, `heartbeat-reviewer`, `heartbeat-requirements`,
   `heartbeat-architecture`. The four loops map REQUIREMENTS→requirements,
   ARCHITECTURE→architecture, PROGRAMMING→worker, QA→reviewer. A worker never
   again reads 120 lines of routing law to find its one paragraph.

2. **REWORK CAP, NOT BUDGETS.** Packets carry `rework rounds: max 3` and never a token
   budget — budgets are volatile, rounds are fixed. Round 4 does not exist: after round 3
   the item goes on the V DECISIONS PACKET. (Basis: rounds 1-3 carry 92.9% of measured
   convergence; docker-hatchet already ran round-3-is-last lawfully.)

3. **PACKET REVIEW IS THE REVIEW SEAT'S DUTY.** The launch packet is a reviewed artifact.
   The orchestrator cannot review its own packet (no-reviewing-your-own-homework), so the
   review seat checks it FIRST: quoted constants against their sources, measured/unmeasured
   claims against ticket history, `allowed` against demanded deliverables, packet path
   resolution. A packet defect is a finding against the orchestrator.

4. **A FINDING IS A FINDING.** Every finding — blocking or non-blocking — gets a ticket
   the same day and demands a fix; the tier sets WHEN, never WHETHER. The "residual"
   class is abolished. A finding without a ticket by end of round does not exist, and
   that loss class already cost a full round (F-05).

5. **REFUTATION DUTY (worker).** Before handoff: state the property in one sentence;
   build the mutant the assertion exists to catch; show RED; revert; show GREEN; build a
   neighbouring mutant it should NOT catch and confirm it does not. An assertion that
   pins the mutant it was shown is not a pin of the property.

6. **WATCHDOG AT LAUNCH.** A dispatch without a running watchdog is incomplete. The
   20-minute stagnation law is armed as part of launch, per-lane log paths verified
   distinct, ground truth is disk/board state. (Cost of the gap: 6h41m of dead air.)

7. **LEDGER AT SEAT EXIT + CHAIN-PROPAGATED REPORTING.** Receipts are collected the
   moment a seat reports, not at closure. Sub-delegation requires packet authorization
   AND returning the children's receipts; a ledger missing any is labelled a floor.
   Unauthorized sub-delegation is a violation.

8. **DELIVER ON N-1.** When a seat dies: survivors are told the comparison is now N-1;
   a replacement is re-elected or the reduction waived with V on the record; synthesis
   ships when the evidence base is sufficient. A straggler extends a mission only on V's
   word.

9. **INTAKE COMPLETENESS (one-prompt machine).** Intake is not done until: the R7
   election is run; the mission compass and slice files exist (item 11); a contradiction
   check has passed or the conflict is with V; every seat has a typed ticket whose
   `allowed` includes its self-report path; the output skeleton is mandated (exact
   headings, claim tags, VERDICT/CONFIDENCE/STRONGEST COUNTER); each CLI's goal
   invocation is probed; roster base-model duplication is either absent or V-acknowledged.
   Every later V interruption for a missing artifact is an intake defect.

10. **VERSION SKEW FAILS CLOSED.** If a dispatched rule set is newer than the installed
    skill or this spine, the dispatch does not go out; the spine is amended first, in the
    same commit. (This amendment also repairs the standing skew: the v3.2.0 amendments
    previously lived only in the skill and are now preserved verbatim below, so every
    rule is discoverable from this file.)

11. **MISSION FILE SYSTEM (requirements loop).** Requirements engineering produces:
    `INSTRUCTIONS.md` — the mission compass, UNDER 100 LINES, a table of contents into
    real docs, never an encyclopedia; and per SLICE (each slice has a code) a directory
    `slices/<code>/` holding: **SPEC.md** (what is being built; FROZEN at creation — no
    agent edits it after; scope changes are a new V-ratified version), **PLAN.md**
    (scaffolded by requirements, FILLED by the architecture seat under
    `heartbeat-architecture` — steps, clusters, module boundaries, DDD impact;
    finite, categoric, quantifiable steps — "requests with a missing id return 400 with
    a message, and the test asserting this passes", never "improve error handling"; a
    stranger can mark each step done/not-done with no judgement call; **PLAN.md has NO
    line cap** per V's 2026-08-28 ruling — only INSTRUCTIONS.md is capped, because a
    capped plan forces steps to be merged and made vague, which is the defect the
    quantifiability law exists to prevent), **PROGRESS.md**
    (done / next / tried-and-failed / worked; per slice, orchestrator sole writer;
    closure reports are assembled from these), **DECISIONS.md** (append-only; every
    choice and why; checked before any question goes to V — a question answered there is
    re-asked to nobody).

12. **TASK CLUSTERIZATION + THREE-RUN LAW.** Every slice is broken into clusters — the
    smallest step-groups verifiable independently, each with an id (`S02-C1`), one
    verification command, and a file surface. A cluster's verification runs THREE times
    and the WORST run is the verdict; green-green-red is RED, and re-running until green
    is falsification under R5. Clusters are also the review unit.

13. **SELF-REPORT LAW** (R8 item 6 stands): installed at INTAKE; path in `allowed`;
    carried verbatim in every packet; the case-file bar applies; no FULLY DONE without it.

14. **SUPERPOWERS IS MANDATORY AND OPEN TO EVERY SEAT (V ruling 2026-08-28; opened by V
    amendment the same day).** The ENTIRE Superpowers library is available to every role —
    worker, reviewer, orchestrator, architecture and requirements alike — and a seat that
    judges a skill useful loads it whether or not its role names it. No packet may narrow
    the library for a seat it dispatches. The per-role list is a FLOOR, the minimum each
    role loads anyway, never a whitelist: worker →
    `test-driven-development`, `verification-before-completion`, `systematic-debugging`,
    `receiving-code-review`; reviewer → `verification-before-completion`; architecture →
    `brainstorming` then `writing-plans`; requirements → `brainstorming`; orchestrator →
    `dispatching-parallel-agents`, `using-git-worktrees`, `subagent-driven-development`,
    `executing-plans`, `finishing-a-development-branch`. Heartbeat states WHAT a seat owes
    and to whom; Superpowers states HOW to do the work well. They do not compete: where
    they overlap, heartbeat's law wins on process (rework cap, finding discipline,
    self-report) and Superpowers wins on craft (RED-first, root-cause-before-fix,
    evidence-before-assertion). Non-Claude seats cannot invoke them and read them as
    markdown under the superpowers plugin's `skills/` directory.

15. **SKILLS-LOADED GATE (V ruling, 2026-08-29).** Every handoff OPENS with one line —
    `SKILLS LOADED: <every skill actually loaded, comma-separated>` — and no seat reaches
    FULLY DONE without it, exactly as with the self-report. The reviewer checks that line
    against the seat's role floor (item 14): a shortfall is a finding against the seat, and
    a skill NAMED but not loaded is a fabrication finding under R5. The orchestrator
    VERIFIES rather than trusts it at seat exit — a skill's PATH in a transcript proves
    nothing, because packets quote paths and they echo straight back; only the skill BODY
    proves a load.

    **Measured basis (public-debate-access, 2026-08-29) — and the correction that produced
    this law.** All four seats DID eventually load their role floor: final compliance was
    4/4, not the 3/4 the Router first reported. The Router measured a seat mid-flight, saw
    only the two heartbeat skills, and concluded it had skipped its mandated `brainstorming`
    after three separate instructions. That conclusion was FALSE — the seat loaded
    `brainstorming` and `writing-plans` later and in the correct order, both before its first
    plan write. **The defect was never the seat's; it was that compliance was UNOBSERVABLE.**
    No handoff declared what it had loaded, so the only way to know was for the orchestrator
    to grep session transcripts — and a snapshot of a running seat produced a wrong finding
    that would have cost a needless rework round against a seat doing its job correctly.
    That is what this gate fixes: it converts compliance from a forensic question into a
    declared artifact. The generalization still holds and is the reason to keep it —
    **anything this protocol requires but cannot observe will eventually be mis-judged in
    both directions**: skipped silently, or falsely charged.

16. **FIX THE CLASS, NOT THE INSTANCE (2026-08-29).** A reported finding is a SAMPLE of a
    class, never the whole class. Any seat receiving a finding names the class, sweeps every
    member, and records the sweep field-by-field in the artifact so the reviewer checks it
    mechanically rather than re-deriving it. Measured basis: on public-debate-access an
    architecture seat redacted the single leaking field its reviewer named and stopped — the
    same wholesale-copy decision was leaking two more sites, and the enumeration ordered on
    rework surfaced two further fields (`locator`, and a `.passthrough()` object whose UNKNOWN
    keys flow through unchecked) that no checklist had. The seat's own diagnosis, adopted as
    law: *searching by named lead instead of by risk class is how the second and third defects
    ship.* A `.passthrough()` or index-signature shape anywhere on a copied path is a WILDCARD
    leak and defeats field-by-field review by construction — it must be named as its own class.

    **Corollary — choose the REMEDY by the SHAPE, not by your confidence about the content.**
    The seat that shipped this defect had already NAMED the risk class correctly a round
    earlier; it still applied the wrong remedy, because it pattern-matched on its own
    uncertainty about what a field might contain instead of on whether the field's KEY SET was
    fixed or open. Fixed key set → PROJECT to a named allow-list (construct a new object; never
    spread the source). Open key set with no semantic contract → REDACT wholesale. Verified safe
    → copy, with the trace to its producer recorded. "Flag it on a checklist" is not a remedy
    for an open shape at all: a checklist enumerates keys, and the whole defect is that the keys
    are not enumerable. Naming a risk and neutralising it are different acts, and only the
    second one ships.

## v3.2.0 amendments — V-ordered laws from the first live Tier-1 mission (responsive-ui-20260724, 2026-07-24..27)

1. **Fleet building (V's name for the R7 election):** run it as an explicit per-loop
   election at every intake — one question per loop, multi-select of roster agents.
   Never compress into a preset.
2. **Visible-launch law:** agent CLIs launch in real, visible PowerShell windows the
   human can watch (title = stage + mission; `-NoExit`; Tee to a per-stage log under
   `.hermes/planning/<mission>/logs/`). Hardened patterns (all were live failures):
   pass prompts via file or stdin-pipe (never inline with unescaped quotes — PS 5.1
   drops embedded `"` for native exes); `codex exec` needs stdin closed (`< /dev/null`)
   or it hangs awaiting EOF; Tee-Object writes UTF-16 → log watchers strip NULs;
   `codex exec` echoes its prompt → completion markers require occurrence-counting or
   colon-suffixed forms; ticket bodies quote marker vocabulary → match `MARKER: <payload>`
   not bare markers; NEVER sed/heredoc-generate launchers without reading them back;
   verify every launch (log file exists or process alive within 2 minutes).
   **Window hygiene:** close a window only after that goal reaches its
   spine-defined `FULLY DONE` condition; keep unfinished review/rework sessions
   parked and resumable, and leave failed ones open for the human to read.
3. **Stagnation liveness-law (global):** a watchdog fingerprints logs + agent CPU
   every 5 minutes; 20 minutes with zero change across everything → freeze new
   dispatch, preserve and park every unfinished goal/session, write the liveness
   report, and halt the orchestrator loop pending the human. Distinct from the
   spine's per-loop stagnation breaker (which the rework cap became — see spine
   §10 amendment): converging loops continue; true dead air pauses the machine
   but does not terminate unfinished agents.
4. **Same-terminal rework through the /goal chain:** rework returns to the exact
   original terminal/session at every level — `hermes --resume`, `grok --resume`,
   `codex exec resume <id>`, SendMessage to the same SDK agent — including agents'
   own subagents (each fixes its own work). Session ids are recorded at WORKER CLAIM
   and recovered from the BOARD, never from logs. Reproduce-first is mandatory on
   every rework: the RED test demonstrates the exact reported defect against current
   code before any fix.
5. **Planning-graph gate:** planning ends with a saved mission-graph IMAGE
   (nodes/edges/routers/lanes/tiers/worktrees/merge order) at
   `.hermes/reports/<mission>/mission-graph.svg`, presented WITH the lane-plan packet
   row; the human's yes on the image gates programming.
6. **Reporting laws:** every run report carries PER-AGENT token usage (named
   accounting basis per row; capture: SDK task results, `hermes insights`, grok
   session `updates.jsonl`, codex session footers) and a cross-run ledger for trends;
   EVERY agent files its own SELF-REPORT (10-20 honest lines: went well / fought me /
   would change) to `.hermes/reports/<mission>/agent-reports/` before its final
   handoff — the harness self-improves on both.
7. **Conversation-mode recovery:** when an agent errs or stalls, converse turn-by-turn
   with the same session (ask what it received, what it did, why) instead of re-firing
   bigger packets; workers who can't find something ask why and work around. Tooling
   friction escalates to the human after ONE failed workaround, with the exact error
   and smallest fix.
8. **Codex-on-this-machine notes:** multi-agent collab mode is unproven (3 failed
   fan-outs; evidence package filed) — default to direct single-session lanes with
   the orchestrator routing; sandbox helper resolution is broken (see evidence
   package) so lanes run `-s danger-full-access` with the file contract, no-push law,
   and independent review as containment until Codex fixes land.

9. **Hermes board polling — the QA/SCRUM/PROGRAMMING loop surface (V amendment,
   2026-07-27; tightened by V order 2026-08-15).** Hermes runs its OWN Kanban
   board and serves it on **port 9119 — ALWAYS 9119, never overridden in
   missions** (`hermes dashboard`; the `--port`/`--host` flags exist but mission
   law pins 9119 so every agent and human always knows where the board lives).
   The Main Orchestrator **polls that board** as the coordination surface for
   the QA SCRUM PROGRAMMING LOOP — lane status, review state, blockers, and
   successor routing are read from Hermes's board, not inferred from agent
   stdout.
   - Poll surface: `http://localhost:9119` (the board Hermes serves).
   - **Ticket assignee notation (V order, 2026-08-15):** every Kanban ticket
     carries its assigned model in SQUARE BRACKETS at the start of the ticket
     title — e.g. `[codex@gpt-5.6-sol] eval-04-tagger`, `[claude-opus] review
     PROG-05`, `[hermes] stage verdict PROG-05`; unassigned tickets carry
     `[unassigned]`. The bracket tag is updated on every (re)assignment and
     must agree with the mission's `loop_ownership` map / model-law roster.
     The board's assignee column duplicates it, but the title tag is the
     human-readable law; board-crafting and board-fix goal packets must
     instruct Hermes accordingly.
   - If the dashboard is not up, the orchestrator asks Hermes to start it
     (`hermes dashboard`) rather than substituting its own tracker; the
     `hermes kanban --board <slug>` CLI reads the same durable store and
     remains the scriptable fallback for reads and comment writes.
   - Board custody stays Hermes's (spine §5.2): the orchestrator READS the
     board and routes from it; it never mutates review state.
   - The board — not any log, live file, or host task list — is the source of
     truth for loop state (spine: live files and host task lists are
     read-only projections).


## 12. Glossary

- **node** — a bounded job with a file contract and no graph knowledge.
- **edge** — a data-flow carrying an artifact or a typed verdict.
- **router** — dispatch-only function (Claude-Router); writes routing metadata,
  never a verdict.
- **verifier** — evidence-review function (Hermes-Verifier); writes a verdict,
  never routing metadata.
- **risk_tier** — persisted low|medium|high, set once, immutable, high-risk floor
  never tiered down.
- **authority_epoch** — monotonic integer; a write with a stale epoch is aborted.
- **chatter** — a comment that changes no status, epoch, or handoff marker; does
  not wake the Router.

(The `worktree` and `workdir` glossary entries are appended into THIS section by
Phase 5 Task 5.5 — the worktree phase owns those terms; do not define them here.)

- **worktree** — an isolated `git worktree add` directory dedicated to one lane, with its own branch. Tracked by the `worktree: {path, branch, merge_status}` state field. Lane isolation, the Split -> Verify -> Merge checklist, the LANE PLAN APPROVAL gate, and the integration node all operate on worktrees.
- **workdir** — the generic working tree an agent runs in (for example a planning/artifact stage terminal, or the active dev tree). A workdir is not a per-lane isolated worktree; do not certify a closure gate from a workdir until `git worktree list` confirms the approved commits are integrated (see `## Worktree integration and closure gate`).
