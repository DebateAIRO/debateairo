# Heartbeat v4.0.0 — Graph Mode

V's order (2026-09-09, `/goal`, verbatim intent): the `/heartbeat` skill family is too slow and
too verbose; it must behave like a graph, not a series of loops; reviews in the code loop happen
only when a vertical slice is done (no more reviews per ticket); after the plan, UI-bearing tasks
get a mock UI built with the `/taste` skill from the repo's existing designs, styles and
components, V refines it in Claude Design and defines "what done looks like", and only then does
coding start; and no terminals are opened on the desktop — everything runs in the harness's own
PTY/background processes, a terminal or UI element opens only on demand.

## 1. What is wrong, measured

The `consent-ui` mission (2026-09-06/07) is the evidence base. Two UI elements plus one sign-up
gate cost ~15 h wall-clock from V's one prompt to the finished-element gates.

| Cost centre | Measured | Cause |
|---|---|---|
| Planning loops | ~6 h: REQ 3 rounds, ARCH 3 rounds per slice, every round a fresh ~300k-token session | the rework cap (3) became the norm because every round re-dispatched a fresh blind session that re-read everything |
| Per-cluster code reviews | 17 blind reviews for 14 clusters + 3 cross clusters, ~25 min and ~300k tokens each | reviews were scheduled per cluster; nine clusters were green while a cross-slice defect waited for the one reviewer who mounted both slices |
| Orchestrator packets | 60 packets hand-written; 76 `COMMON §10` amendments; "the packets were the weapon" (orchestrator's murder case) | no template, no mechanical pre-dispatch check, an append-only amendment list every seat had to read |
| Reading floor per seat | protocol 150 + role ~100 + floor skills ~570 + COMMON 172 + INSTRUCTIONS ≤100 + SPEC 757 + PLAN up to 2,224 + DECISIONS 219 + TOOLING-TRAPS 3,008 lines | law told seats to read whole files; packets did not scope the reading |
| Desktop terminals | Grok seats launched through `osascript` Terminal windows; watchdog in a terminal | the v3.2.0 visible-launch law, written for a Windows/PowerShell setup |
| Skew | the spine (2,038 lines) and six skills describe "four loops" while the spine's own title is "Graph Spine" | loops were layered onto a graph document by successive amendments |

The last mission's orchestrator self-report already asked for two of the fixes below: a
pre-dispatch packet checker and reviewer independence by construction.

## 2. Goals and non-goals

Goals: (1) the orchestrator is a scheduler over a DAG of board tickets, not a runner of phase
loops; (2) exactly one review point per vertical slice in the code loop; (3) the UI gate:
`MOCK(S)` → V's `DONE(S)`; (4) the no-terminal law; (5) a reading floor per seat that fits in one
sitting; (6) the spine, the adapters and the skills carry the same rules in the same commit.

Non-goals: V's ratified laws that still hold are not reopened — rework cap 3 (as a cap), the
murder-case self-report, the SKILLS LOADED gate, fix-the-class, SPEC frozen at creation, PLAN
uncapped, DECISIONS append-only, PROGRESS orchestrator-only, the three-run law, the vertical-slice
law, Done = V's veto, no harness push or merge to remote, every finding ticketed the same day, and
Superpowers open to every seat. The spine is not rewritten; it gets a superseding amendment
section, as v3.3.0 and v3.4.0 did.

## 3. Approaches considered

- **A. Amend only** — bolt v4 sections onto the six existing skills. Cheapest, but the loop
  vocabulary stays and seats read both. Rejected: verbosity is a goal, not a side effect.
- **B. Rewrite the family around the graph vocabulary, add `heartbeat-mock`, amend the spine and
  adapters** — chosen. Same file set, same symlinks, same law lineage, shorter contracts.
- **C. Replace the family with `Workflow` tool scripts** (the harness's DAG executor). Strongest
  graph semantics, but it needs V's per-mission opt-in, non-Claude seats cannot read JS as law, and
  the board would stop being the state. Kept as an optional transport under B: when V says "use a
  workflow", the orchestrator may run one slice's BUILD fan-out as a Workflow script; the board
  still records every node.

## 4. The graph model

**Nodes are board tickets. Edges are parent→child links (`hermes kanban link`). A node is READY
when every parent is DONE — the board computes this itself (`create --parent`, `link`, `promote`).
The mission is finished when its terminal node is done.** Nothing loops: a REWORK verdict appends
new nodes (a `FIX` and the next `REV` pass); the cap is a node count, not a loop counter.

### 4.1 Node vocabulary

| Node | Seat / role contract | Reads (only) | Writes (one artifact) | Cardinality |
|---|---|---|---|---|
| `INTAKE` | orchestrator | V's prompt | `00-intake.md`, board, slice tickets, `INSTRUCTIONS.md` skeleton | 1 |
| `REQ` | `heartbeat-requirements` | intake | `INSTRUCTIONS.md`, per-slice `SPEC.md` (frozen), PLAN scaffold, the slice's `ui:` flag | 1 |
| `REQ-REV` | `heartbeat-reviewer` (blind) | the SPECs + REQ packet | verdict | 1 per REQ pass, ≤3 passes |
| `ARCH(S)` | `heartbeat-architecture` | `SPEC(S)` | `PLAN(S)`: steps, clusters, boundaries, DECISIONS lines | 1 per slice, all slices in parallel |
| `ARCH-REV(S)` | `heartbeat-reviewer` (blind) | `PLAN(S)` | verdict | 1 per pass, ≤3 |
| `MOCK(S)` | `heartbeat-mock` (new) | `SPEC(S)`, `PLAN(S)`, design of record, repo tokens + components | a design canvas (Artifact) + `MOCK.md` | UI slices only |
| `DONE(S)` | **V** | the canvas | `DONE.md` — what done looks like | UI slices only; a V gate |
| `BUILD(S-Cn)` | `heartbeat-worker` | its cluster's PLAN steps, `DONE(S)` or the SPEC acceptance | code + tests on the slice branch, the three-run table | 1 per cluster; parallel where file surfaces are disjoint |
| `GATE(S)` | orchestrator (mechanical) | every `BUILD(S-*)` handoff | the slice review package | 1 per slice per pass |
| `REV(S)` | `heartbeat-reviewer` (blind lenses) | the review package, `DONE.md` | verdict per lens → one unioned verdict | lenses in parallel; ≤3 passes per slice |
| `FIX(S)` | `heartbeat-worker` | the verdict | code | derived on REWORK; split by file surface, parallel |
| `ELEMENT(S)` | roster-named finished-element reviewer (e.g. Grok) | the slice at PASS | verdict | only when the roster names one |
| `TEST(S)` | **V** | the lane, served on V's word | veto (Done) or findings | 1 per slice; a V gate |
| `MERGE(S)` | orchestrator | the vetoed slice | local merge into `dev` + integrated suite result | 1 per slice |
| `WHOLE` | **V** | the merged `dev` | push authorization | 1 |
| `CLOSE` | orchestrator | everything | closure report, every self-report collected | 1, terminal |

Ticket titles carry the node code and the model tag: `[claude-opus-5] BUILD S02-C3`. Slice tickets
(`S01`, `S02`…) remain V's, created at intake; every node above is a sub-ticket linked under its
slice.

### 4.2 The scheduler (the orchestrator's whole runtime)

One function, run on every event — a seat's exit notification, a watchdog line, a V message:

1. **Consume exits.** For each seat that exited: verify `SKILLS LOADED` against the transcript
   body, write the ledger row, close the node (`hermes kanban complete`), append the derived nodes
   (a `FIX(S)` + `REV(S)` pass r+1 on REWORK; a V DECISIONS PACKET row when pass 3 is REWORK;
   `ELEMENT(S)`/`TEST(S)` on PASS).
2. **Dispatch every READY node** the harness owns, in parallel, in the background; heavy nodes are
   bounded by `max_concurrent_heavy`. Arm the watchdog for each.
3. **Surface V gates once each** — `DONE(S)`, `TEST(S)`, `WHOLE`, the decisions packet — as one
   message with the exact artifact, URL or command V needs. Do not re-ask.
4. **Idle** until the next event. The 20-minute stagnation watchdog is the fallback event.

There is no phase loop. Multiple slices are in flight at once; a slice parked on a V gate does not
park the others.

### 4.3 Review per slice — the code loop's only review

- `BUILD` nodes hand off on cluster green (three runs, worst run wins, refutation duty done) and
  **no review waits on a cluster**. The worker's handoff feeds `GATE(S)`.
- `GATE(S)` fires when every `BUILD(S-*)` node is done. The orchestrator assembles one review
  package: the slice branch diff against base, every cluster's command and three-run table, the
  cluster map, the SPEC acceptance and `DONE.md` when it exists, the dev-stack recipe.
- `REV(S)` runs the risk tier's lenses **in parallel**, each a blind background seat in its own
  detached worktree at the slice head: low → 1 lens (correctness/tests); medium → 2 (+
  security/data-safety); high → 3 (+ product-truth). **A UI slice always carries the product-truth lens**, whatever its
  tier: rendered DOM with the real compiled CSS, measured in the harness's own browser pane against
  `DONE.md`'s artboards, both modes.
  Each lens probes the **whole slice** — its own fixtures, both modes for UI, cross-cluster and
  cross-slice mounts. The orchestrator unions the findings; a disagreement between lenses spawns one
  single-finding re-check node, never a re-review of everything.
- REWORK → `FIX(S)`: every finding of the pass (B and N) goes into the fix nodes, split by file
  surface so they run in parallel, returned to the author sessions when they are alive. Then
  `REV(S)` pass r+1, scoped to the findings plus a re-run of the previous pass's probes. Three passes
  per slice is the cap; a REWORK at pass 3 is a V DECISIONS PACKET row. N-findings still open when
  a slice reaches `TEST(S)` are ticketed residue shown to V at the test point — WHEN, never WHETHER.
- Cross-slice defects surface at `MERGE(S)`, which runs the integrated suite; a defect there
  spawns a `FIX` on the owning slice and a scoped `REV` pass that counts toward that slice's cap.
  There are no separate cross-review nodes.
- Planning reviews (`REQ-REV`, `ARCH-REV(S)`) are kept as ONE blind pass each by default. Findings
  are **folded, not looped**: non-blocking findings are appended to `DECISIONS.md`/ticket comments
  by the orchestrator for the downstream nodes to read; only blocking findings spawn a rework node,
  and that rework returns to the same author session when the transport allows. The cap of 3 still
  bounds the worst case.

### 4.4 The UI gate — `MOCK(S)` and `DONE(S)`

**Trigger.** `REQ` marks each slice `ui: yes|no` in its SPEC header: a slice is UI when its
acceptance steps are exercised in a browser. Non-UI slices have no `MOCK`/`DONE` nodes; their
acceptance oracle is the SPEC's acceptance section, and `BUILD` follows `ARCH-REV(S)` directly.

**`MOCK(S)` — the mock seat** (`heartbeat-mock`, a Claude seat, Opus 5 unless the roster says
otherwise). It loads `design-taste-frontend` (the `/taste` skill: design read, anti-slop
discipline, dials pinned to *redesign — preserve*) and `design` (the Claude Design canvas inside
Claude Code) and produces:

1. **One design canvas** with one artboard per screen and state the SPEC names, in both modes
   (Terracotta and Chamber), composed from the repo's real token values (`apps/ui/app/globals.css`)
   and the real components' class vocabulary and geometry (`apps/ui/components/**`), plus the
   design of record V supplied (`ui_designs/*.html` extracts) where one exists. It may screenshot
   the live app through the harness's own browser pane to copy current chrome. Nothing is invented:
   every colour, spacing, type and radius value traces to a token or to the design of record.
2. **`docs/missions/<m>/slices/<S>/MOCK.md`** — the canvas URL, the artboard list, a provenance
   table (each artboard element → the real token/class it copies, or `NEW` when the plan needs
   something the app lacks), and the open design questions for V, each as a smallest yes/no.
   `/taste`'s "ask one question" rule maps to this list; the seat never asks V in chat.

Handoff: `MOCK READY` on the slice ticket with the URL. No code is written.

**`DONE(S)` — V's gate.** The orchestrator posts one message: the canvas link, the open questions,
and the two ways to answer — edit the canvas in place (Save publishes a new version the harness
reads back with the Artifact tool) or hand back a Claude Design export under `ui_designs/`. V
defines what done looks like. The orchestrator then extracts the final artboards verbatim into
`docs/missions/<m>/design/<S>/` and writes `docs/missions/<m>/slices/<S>/DONE.md` (an assembly of
V's words and the artboards, no judgment of its own): per screen and
state, the artboard reference and the numbered human-runnable acceptance steps in both modes, with
V's words quoted. **`BUILD(S-*)` becomes READY only when V has said yes to `DONE.md`** (or edited it
themselves). There is no proceed-by-default on a UI slice — that is the whole lesson of the
ui-overhaul fidelity failure. `DONE.md` is then the oracle for `BUILD`, `REV(S)` and `ELEMENT(S)`;
reviewers measure rendered geometry and colour against the artboards, they do not argue wording.
The planning-graph image gate (spine v3.2.0 item 5) folds into this message for UI slices and into
the decisions packet for non-UI slices, rendered from the board (§6.4), proceed-by-default as V
ruled on consent-ui (V-8). The graph is rendered by `graph.sh` (§6.1), never drawn by hand.

### 4.5 The no-terminal law

- Every seat runs inside the orchestrator's own process tree: Claude seats as background Agent-tool
  subagents or background `claude -p … --output-format json` processes; Codex and Grok as background
  Bash processes with stdin closed and stdout to a per-seat log; watchdogs as the harness's Monitor
  or a background `until` loop; the board through the `hermes kanban` CLI store.
- **Forbidden:** `osascript`, `open -a Terminal`, `tell application "Terminal"`, opening a browser
  window or any GUI application on V's desktop, and serving the Hermes dashboard unasked. The
  harness's in-app browser pane is the harness's own PTY and is allowed for verification.
- **On demand only:** when V asks to see something, the orchestrator opens exactly that — the
  browser pane at the URL, or the one-line command in a fenced block — and nothing else. At
  `TEST(S)` the orchestrator serves the lane from a `.claude/launch.json` entry only when V says
  "serve S01", and posts the URL and the acceptance steps; it never opens a window.
- Launch verification stays: every launcher is written fresh from a heredoc, read back, grepped for
  the values it must carry, and its log must appear within two minutes; per-seat logs are distinct.
- Revoked: spine v3.2.0 item 2 (visible-launch law), the visible-launch paragraphs of
  `codex-heartbeat-orchestrator.md` and `grok-heartbeat-orchestrator.md`, and the standing memory
  that V authorized macOS Terminal windows.

### 4.6 Rework transport

Rework goes to the **same session** when the transport can resume it — `claude --resume
<session-id>`, `codex exec resume <id>`, `grok --resume <id>`, SendMessage to a spawned agent when
the harness offers it — and to a fresh session only when the original is dead or the transport
cannot resume. The packet for a fresh session carries the predecessor's handoff and self-report.
Session ids are recorded at CLAIM on the board. The orchestrator probes each transport's resume
mechanism at intake, with the other CLI probes.

## 5. Verbosity — the reading floor

- **A seat reads:** `superpowers:using-superpowers`, `heartbeat-protocol`, its role contract, its
  role floor skills, `INSTRUCTIONS.md`, its packet, and the slice files at the LINES its packet
  names. `PLAN.md` stays uncapped, but a `BUILD` packet quotes its cluster's step ids and the seat
  reads those steps, never the whole plan. `TOOLING-TRAPS.md` is read as its index (`grep -n '^## \|^- '`,
  one line per trap) plus the entries the packet names by heading.
- **Role contracts** are imperative: one sentence of rule, at most one of why. Measured anecdotes
  move to the spine. Target ≤ ~90 lines each; padding is forbidden, cutting a real rule is forbidden.
- **`COMMON.md` ≤ 120 lines, and amendments REPLACE text.** A packet-defect class fix edits the
  template or the COMMON line that caused it; there is no append-only amendment list.
- **Packets come from templates** shipped inside the orchestrator skill (`templates/`), ≤ 40 lines
  each: REQ, REQ-REV, ARCH, ARCH-REV, MOCK, BUILD, REV, FIX, ELEMENT, plus the COMMON skeleton.
- **Every packet passes `packet-check.sh` before dispatch** (shipped inside the orchestrator skill):
  every absolute path resolves; no `__` placeholders; every code quote written in the packet's one
  quoting form — an absolute `path:LINE`, then ` — `, then the quoted text in backticks — matches the
  file at that line; `allowed` contains the self-report path; `rework rounds: max 3` present; the verbatim
  self-report instruction present; the `SKILLS LOADED` handoff rule present.
- **Handoffs have one shape** (eight lines, spelled out in `heartbeat-protocol`): SKILLS LOADED ·
  node and pass · artifact path · verification verbatim (suites as passed/total, three-run table) ·
  findings and packet defects · UNVERIFIED list · self-report path · `comments read through`.

## 6. Components and files

### 6.1 Skills (repo `.claude/skills/`, symlinked into `~/.claude/skills/` — repo edits are the installed skills)

| Skill | Change |
|---|---|
| `heartbeat-protocol` | rewrite: router table gains `heartbeat-mock`; graph vocabulary in one paragraph; the laws that bind every seat (kept, shortened); the no-terminal law; the reading floor; the handoff shape |
| `heartbeat-orchestrator` | rewrite as the scheduler contract: intake, node table, the tick, transports (background only), `GATE`/`REV` assembly, rework transport, V gates, ledger, `packet-check.sh`, `graph.sh` |
| `heartbeat-worker` | trim; "hand off on cluster green — no review waits on you"; read your cluster's steps only; `DONE.md` is the oracle on UI slices |
| `heartbeat-reviewer` | slice-review contract: whole-slice probe per lens, `DONE.md` oracle, one unioned verdict per pass, planning-review fold rule |
| `heartbeat-requirements` | the `ui:` flag per slice; `DONE.md` placeholder; trim |
| `heartbeat-architecture` | clusters are build units, not review units; `MOCK` handoff inputs; trim |
| `heartbeat-mock` | **new** — the `MOCK(S)` contract (§4.4); symlinked like the others |
| `heartbeat-orchestrator/scripts/packet-check.sh` | **new** — the mechanical pre-dispatch check (§5) |
| `heartbeat-orchestrator/scripts/graph.sh` | **new** — renders a board's tasks + `task_links` as Mermaid into `.hermes/reports/<m>/mission-graph.md` |
| `heartbeat-orchestrator/templates/*.md` | **new** — the packet templates (§5) |

### 6.2 Spine and adapters (`docs/agent-protocols/`)

- `debateai-heartbeat-protocol.md`: version `3.4.0 → 4.0.0`; a `## v4.0.0 amendments — graph
  mode (V order, 2026-09-09)` section that supersedes, by name: the Four Loops and the Grand Loop,
  the per-ticket review diamond and review-lane applicability, the H0–H9 stage chain as a
  dispatch order (the node vocabulary replaces it; `risk_tier` keeps selecting the lens count, and
  `planning_tier` survives only as "Tier 0 docs-only missions may skip `ARCH-REV`"),
  v3.2.0 item 2 (visible launch), v3.2.0 item 5 (the SVG gate), v3.2.0 item 9's dashboard-on-demand
  reading, and the "clusters are the review unit" sentence of v3.3.0 item 12. The header states
  that seats read the skills and the spine is the archive of law.
- `claude-`, `codex-`, `grok-heartbeat-adapter.md`, `codex-heartbeat-orchestrator.md`,
  `grok-heartbeat-orchestrator.md`: a short `## v4.0.0 — graph mode (read this first)` block at
  the top, superseding per-ticket peer review and visible launch in those documents.
- `.hermes/skills/heartbeat-protocol/SKILL.md` (Hermes copy, v3.0.0) is left untouched: the Hermes
  agent seat was struck by V on 2026-08-21; the board store is the only Hermes surface.

### 6.3 Memory

New `heartbeat-v400` memory (the ratified graph-mode rules and where they live); the
`agent-fleet-cli-setup` memory loses the "visible fleet terminals" authorization; `MEMORY.md`
index updated.

### 6.4 Data flow of one UI slice

```
REQ ──► ARCH(S) ──► ARCH-REV(S) ──► MOCK(S) ──► DONE(S) [V] ──► BUILD(S-C1) ─┐
                                                              ├─► BUILD(S-C2) ─┼─► GATE(S) ─► REV(S) p1 ─┬─ PASS ─► ELEMENT(S)? ─► TEST(S) [V] ─► MERGE(S) ─► WHOLE [V]
                                                              └─► BUILD(S-C3) ─┘                        └─ REWORK ─► FIX(S) ─► REV(S) p2 … (≤3)
```

## 7. Error handling

- A seat dies → the node reopens once with a fresh session and the predecessor's handoff; a second
  death is a V row. Survivors are told the comparison is N−1 (deliver on N−1 stays law).
- A V gate unanswered → that slice parks; the scheduler keeps dispatching every other READY node;
  the decisions packet flushes on the existing thresholds.
- `packet-check.sh` fails → the packet does not go out; the orchestrator fixes the template, not the
  packet alone (fix the class).
- Pass 3 REWORK, chatter, or stagnation → freeze that slice and escalate; never auto-approve.
- Transport cannot resume → fresh session with the handoff in the packet; recorded on the ticket.

## 8. Verification of this change

1. `readlink` on all seven `~/.claude/skills/heartbeat-*` entries resolves into the repo.
2. Frontmatter of every skill parses (`name`, `description`); the router table names all six role
   contracts.
3. Line counts per contract reported; none padded.
4. `grep -rn 'osascript\|tell application\|Terminal window\|per-cluster review\|Four Loops'` over
   the family returns hits only inside sentences that revoke them.
5. `packet-check.sh` exits 0 on a known-good packet (`consent-ui` `CODE-S02-C7.md` adapted to the
   convention) and 1 on a mutant missing the self-report path — both runs shown.
6. `graph.sh consent-ui` renders a Mermaid graph with the board's ticket count.
7. The spine's version line reads `4.0.0` and the amendment section exists; each adapter carries
   the v4.0.0 block.
8. One commit on `dev` carrying skills + spine + adapters + this spec + the plan; nothing pushed.

## 9. Assumptions V can overturn

1. `/taste` = the installed `design-taste-frontend` (v2, self-titled "tasteskill"); `design` (the
   Claude Design canvas inside Claude Code) is the edit surface; a Claude Design app export under
   `ui_designs/` is the fallback.
2. Planning reviews stay as one blind pass each with fold-don't-loop; V may strike them entirely.
3. A slice is UI when its acceptance runs in a browser; `REQ` sets the flag.
4. `BUILD` on a UI slice waits for V's explicit yes on `DONE.md`; non-UI slices do not wait.
5. The finished-element reviewer (Grok) exists only when the roster names one.
6. The harness's in-app browser pane is harness PTY; V's desktop is never touched.
7. The rework cap stays 3, counted as `REV` passes per slice.
8. The Hermes dashboard is served only when V asks; the store is the truth.
9. `max_concurrent_heavy` stays the spine's one number.
