# PACKET CODE-REV-__SLICE__-__CLUSTERS__ — blind code review (mission `observability-agents`)

Read FIRST, in full: COMMON.md (same directory), `docs/missions/observability-agents/INSTRUCTIONS.md`, the slice SPEC/PLAN/DECISIONS.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `__TICKET__` · **seat:** CODE-REV-__SLICE__-__CLUSTERS__ · **role:** reviewer (`heartbeat-reviewer`) · **model:** Fable 5.1 · **round:** __ROUND__ of max 3
- **the work under review:** seat CODE-__SLICE__-__CLUSTERS__, ticket `__WORK_TICKET__`, commit `__COMMIT__` on branch `__BRANCH__`; its dispatching packet `__WORK_PACKET__` (review it FIRST — constants, allowed vs deliverables, base commit)
- **your worktree (separate, detached at `__COMMIT__`; cwd for every command):** `__REV_LANE__` — never the author's lane, never the main tree
- **allowed (exhaustive):** `docs/missions/observability-agents/reviews/CODE-REV-__SLICE__-__CLUSTERS__.md` · the self-report path `.hermes/reports/observability-agents/agent-reports/CODE-REV-__SLICE__-__CLUSTERS__.md` (main tree) · scratch files under `__REV_LANE__/dialectical-engine/.review-scratch/` (delete before handoff; prove with `git status --porcelain`) · `.hermes/TOOLING-TRAPS.md` (append) · comments on `__TICKET__` and ONE verdict comment on `__WORK_TICKET__` (`--author CODE-REV-__SLICE__-__CLUSTERS__`)
- **forbidden:** editing the work under review · git writes other than in-scratch probes that you fully revert (`git checkout HEAD -- <path>`, then `git status --porcelain` must be empty) · the security zone · other slices.

## 2. Probes (`heartbeat-reviewer` §2) — build your own from the CLAIM
Run every cluster command yourself ×3 · re-run the author's mutants AND add mutants of your own derived from the SPEC property, not from the author's test · exceed parameters (concurrency, sizes, clock) · check fixtures against wall-clock and pool size · verify RED frames are real (a crashing command is not RED) · typecheck repo-wide with `generate:contract` first · `audit:source` blocking array · zone containment (no import/read/stat of zone paths in the diff — grep the diff) · the author's `SKILLS LOADED` vs the worker floor · constants transcribed match their sources · self-report bar.

## 3. Verdict — `reviews/CODE-REV-__SLICE__-__CLUSTERS__.md`
`SKILLS LOADED` · `Verdict: PASS | REWORK | BLOCKED` · packet findings · B1… · N1… (each with file:line, concrete failure scenario, evidence) · what I verified and how (verbatim outputs) · what I did NOT verify · predictions · `comments read through`. Post it as ONE comment on `__WORK_TICKET__`; one-line pointer on `__TICKET__`. Round 3 REWORK → V DECISIONS PACKET row instead. Self-report first. Stop.
