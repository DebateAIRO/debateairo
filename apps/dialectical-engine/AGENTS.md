# AGENTS.md

This directory is the Dialectical Engine application, not the AI Harness
skeleton.

## Local Workflow

- Use the app-level `Makefile` from this directory.
- Prefer the simplified single-Mac path unless the task explicitly returns to
  two-worker production acceptance.
- Use `make setup-status` for the current local runtime, model auth, hosting,
  and manual checklist state.
- Use `make interactive-manual-setup` only from a normal Terminal because it
  starts browser/account login flows.

## Verification

For focused setup changes, run the narrow tests that cover touched scripts.
Common checks:

```sh
PYTHONPYCACHEPREFIX=/private/tmp/dialectical-test-pycache \
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib \
/Users/stefannour/Documents/Debate\ V2/dialectical-engine/.venv313/bin/python -m pytest -p pytest_asyncio.plugin \
  coordinator/tests/test_hosting_status.py \
  coordinator/tests/test_makefile_targets.py \
  coordinator/tests/test_status_report.py -q
```

When working from the original active local tree at
`/Users/stefannour/Documents/Debate V2/dialectical-engine`, use that tree's
`.venv313/bin/python` and run `make setup-status` there to verify the live Mac
services.

### Windows / repo-local full-suite acceptance command

The full `coordinator/` suite's canonical, environment-independent invocation is:

```sh
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/ -q
```

`coordinator/pyproject.toml` sets `addopts = "--basetemp=.tmp/pytest-basetemp"`
and `cache_dir = ".tmp/pytest-cache"` so this literal command is reproducible
even in sandboxes where the OS default pytest temp root (e.g.
`%LOCALAPPDATA%\Temp\pytest-of-<user>` on Windows) is not writable. An explicit
`--basetemp`/`-o cache_dir` on the command line still overrides these
`addopts` defaults (last-flag-wins), so the older
`--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
style invocation keeps working unchanged. Expect `17 failed, 1395 passed, 4
skipped` on a clean tree (the 17 failures are environment/harness-dependent,
see below).

**Mission-surface acceptance** (the subset that must be 0-failed everywhere,
excluding the environment-dependent/foreign-stream harness tests):

```sh
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/ -q --ignore=tests/test_status_report.py --ignore=tests/test_dev_guardian.py --ignore=tests/test_dev_runner.py --ignore=tests/test_local_cluster_check.py --ignore=tests/test_makefile_targets.py --ignore=tests/test_providers.py
```

Last observed: `0 failed, 954 passed, 4 skipped` (exit code 0).

## Proposal B QBAF Guardrails

When working on the Debate-Weighted QBAF goal, keep these invariants current:

- **Provider-agnostic agents.** New scoring, debate, evidence, metareasoning,
  and orchestration code must call the Proposal B `LLMProvider` interface
  instead of importing or invoking model SDKs or CLIs directly.
- **OpenAI/Codex is the first real adapter.** The first live provider path may
  use Codex, but the second provider must be addable through `providers/` plus
  configuration without changing agent, scorer, evidence, or QBAF semantics
  code.
- **Pure propagation.** QBAF graph-scoring math must contain no model calls,
  file/network I/O, time, randomness, or database access.
- **Swappable semantics.** DF-QuAD is the default gradual semantics and must
  live behind a strategy interface so another semantics implementation can
  replace it later.
- **Every leaf is gated by the evidence subsystem.** Evidence leaves that cite
  sources receive base scores from the evidence pipeline, not directly from a
  model assertion.
- **Anonymize debate sources.** Strip agent identity before another debate role
  reads prior turns.
- **Skeptic certifies no unaddressed attack remains.** A node is not converged
  until the skeptic hook passes.
- **Confidence-driven, cost-soft.** Stop conditions are driven by convergence,
  unresolved caveats, and skeptic certification; cost is a soft tie-breaker.

Work one proposal Step at a time. Each Step starts with the goal, touched files,
Definition of Done, exact tests, and a short plan; each Step ends with tests and
a clear commit.

## DebateAI Shared Agent Protocol

For Kanban/Heartbeat multi-agent work, use the shared protocol spine instead
of copy-pasted per-chat instructions:

```text
docs/agent-protocols/debateai-heartbeat-protocol.md
docs/agent-protocols/codex-heartbeat-adapter.md
docs/agent-protocols/claude-heartbeat-adapter.md
docs/agent-protocols/grok-heartbeat-adapter.md
```

Vendor skills are thin node contracts that load the Graph Spine v2. As of
spine 3.0.0 they are REAL in-repo files (the `.codex` and `.agents` skill
directories were symlinks into an out-of-repo `.zenith` snapshot and were
materialized in place — no directory here is a symlink):

```text
.codex/skills/heartbeat-protocol/SKILL.md
.agents/skills/heartbeat-protocol/SKILL.md
.claude/skills/heartbeat-protocol/SKILL.md
.grok/skills/heartbeat-protocol/SKILL.md
```

Source-of-truth order for active agent work:

1. Safety and explicit V direction.
2. Latest applicable Hermes/human ticket comment.
3. Current Kanban ticket body and all comments in chronological order.
4. The shared protocol spine and agent-specific adapter.
5. This `AGENTS.md` file.
6. Chat prompts and prior memory.

Current stage/coding law:

```text
Hermes 0 → Grok 1 → Claude 2 → Grok 3 → Claude 4 → Grok 5 → Hermes 6
→ Codex GPT-5.6 Sol only for implementation
```

Hermes-owned stage gates are mandatory and non-delegable:

```text
Grok Step 1 Research → Hermes handoff-integrity check only; no substantive review
Claude Step 2 Plan → READY FOR HERMES STAGE REVIEW
  → HERMES STAGE REVIEW PASS required before Grok Step 3
Grok Step 3 PlanReview → READY FOR HERMES STAGE REVIEW
  → HERMES STAGE REVIEW PASS required before Claude Step 4
Claude Step 4 FinalPlan → READY FOR HERMES STAGE REVIEW
  → HERMES STAGE REVIEW PASS required before Grok Step 5
Grok Step 5 VerticalSlices → READY FOR HERMES STAGE REVIEW
  → HERMES STAGE REVIEW PASS required before Hermes Step 6
Any Step 2–5 RED → HERMES STAGE REVIEW CHANGES REQUESTED
Hermes Step 6 Kanban → HERMES STEP 6 SELF-AUDIT PASS before any Codex launch
```

Hermes reads the actual Step 2–5 artifact and upstream evidence itself. Agent
review approval does not replace this gate. On changes, the next stage remains
blocked and the same original stage session revises after verified `/compact`.

Each stage/ticket uses its own Hermes-managed CLI PTY. Rework stays with the
same original worker/session. Claude and Grok may author their planning/review
artifacts and perform read-only peer review, but they do not implement code
while the Codex-only law is active.

After every durable Claude/Grok/Codex planning, coding, review, or correction
sequence—and after substantive Hermes↔agent ping-pong—Hermes compacts that
same terminal before parking it or proceeding with review:

```text
Claude: /compact <preservation focus>
Grok:   /compact <preservation context>
Codex:  /compact
```

Artifacts, comments, decisions, evidence paths, risks, and next gates must be
durable and the prompt idle before compaction. Hermes verifies and records an
agent-specific checkpoint: `CLAUDE COMPACTION CHECKPOINT`,
`GROK COMPACTION CHECKPOINT`, or `CODEX COMPACTION CHECKPOINT`.
Numbered-stage handoff is compacted before the
Hermes stage gate; `READY FOR PEER REVIEW` is compacted before peer review;
reviewer/Hermes rework handoffs are compacted before Hermes review. If
substantive dialogue follows a checkpoint, compact again at the next stable
handoff. Never close or replace a session merely because it became chatty.

Every worker, reviewer, and Hermes must read the full ticket body and all
comments before claim/resume, before edits/review, on every heartbeat, after a
status change, and before handoff. A `ready` ticket may be returned rework, so
status alone is never routing truth. Every claim, heartbeat, review, and
handoff records `comments read through: <latest comment id or timestamp>`.

Binding implementation-ticket review flow (separate from numbered-stage gates):

```text
worker gets ticket
→ worker works
→ worker posts READY FOR PEER REVIEW
→ different read-only reviewer reviews
→ reviewer posts READY FOR HERMES REVIEW on GREEN
→ Hermes routes READY FOR HUMAN REVIEW or posts HERMES CHANGES REQUESTED and
  returns the ticket to ready
→ same original worker/session reads comment and modifies
→ worker posts REWORK READY FOR HERMES REVIEW
→ Hermes routes human review or returns to ready again with a newer comment
→ human pass → Hermes Done
```

First-pass workers do not send themselves directly to Hermes. Reviewers do not
write fixes. Hermes returns corrections to the same worker and preserves the
original assignment/session unless it records a `WORKER CONTINUITY OVERRIDE`.

Hermes-created implementation tickets use `[Codex]` and `Assigned agent: Codex`.
`[Claude]` and `[Grok]` tickets are planning/review/verification work
under the current law. Every non-lane-starter ticket references its previous
ticket; lane starters explicitly say they have none.

Hermes owns Done, Blocked resolution, routing, human-review packets, and final
review. Agents communicate through ticket comments using the markers defined
in the shared protocol and never mark their own tickets Done.
