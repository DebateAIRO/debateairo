# MERGE BRIEF — S01, for V

> ## STATUS: **READY FOR V'S MERGE DECISION** — peer review **PASS**, 2026-08-29.
> Two anonymous-data leaks were found by a blind lens and are now closed. The reviewer ran its
> own independent fixed-point sweep against the converged redacted set and reported
> `production_shaped_secret_leaves: []`, `FIXED_POINT_HOLDS`, **findings this pass: none** —
> after two upheld REWORKs from the same seat. Architecture RATIFIED the one provisional
> correction made under V's Row 7. The Router re-ran every probe and suite independently.
> **Router recommends merge; the decision is V's and nothing is committed or pushed.**

**V performs every merge. The Router has not committed, pushed, or merged anything.**

## The scope splits in two, and they are in different places

### 1. Product code — lives ONLY in the worktree, not in the main tree

`.worktrees/prog-a-s01/dialectical-engine`, uncommitted:

| file | change |
|---|---|
| `packages/contract/src/index.ts` | 41 lines — `PublicDebateSchema` relocated after `NodeSchema`/`EdgeSchema` (temporal-dead-zone fix), `answer.nodes` / `answer.edges` / `answer.tree_included` added as optional |
| `apps/api/src/publications.ts` | 26 lines — publish path emits a redacted tree projection |
| `tests/unit/s8-publication.test.ts` | +379 lines |
| `tests/unit/pda-s01-envelope-schema.test.ts` | new, 72 lines |

**604 insertions, 20 deletions** (grew from 426 as the two leaks were closed and their residual tests added). `packages/contract/generated/**` is regenerated but **gitignored
by repo policy** — it is not part of the merge and must be regenerated after checkout.

**Verified, three-run law, worst run is the verdict.** Final suites, re-run by the Router in the
seat's own worktree: `s8-publication` **25/25**, `pda-s01-envelope-schema` **3/3**,
`s8-publication-http` **4/4**, `tsc --noEmit` clean. Base-commit baseline for comparison: 13/13.

**All four leak probes clean**, each re-run by the Router, each previously reporting a leak:
`NO_ALIAS_LEAK` · `NODE_PREFIX_SAFE` · `SOURCE_ALIAS_SAFE` · `MUST_REDACT_CLEAN`. A fifth,
the reviewer's independent fixed-point sweep, reports `FIXED_POINT_HOLDS`. All five are kept at
`.hermes/reports/public-debate-access/probes/` — they are the reproductions, and they are the
evidence that survives this session.

**Over-redaction is guarded, not just under-redaction:** `redactSource` is an explicit parameter —
`true` at `base_score` and `final_strength`, `false` at the edge site, whose `source` is a
`StrengthSource` enum from a different producer. Mutating the edge to `true` makes test D fail.

**RED-first is real:** against a wholesale `{...node}` / `{...edge}` spread, C2-6/7/8 FAIL. The
redaction is pinned by tests that go red without it.

### 2. Protocol law + mission docs — in the MAIN tree

No product files. 13 modified, 3 untracked directories:

- **6 skills** under `.claude/skills/heartbeat-*/SKILL.md` — these are **symlinked** into
  `~/.claude/skills/`, verified by `readlink`, so the repo files ARE the installed skills.
  Carries the **SKILLS LOADED gate** (V-ordered, spine item 15) and **fix the CLASS not the
  instance** (item 16).
- **6 agent-protocol docs** under `docs/agent-protocols/` — the spine plus the Claude/Codex/Grok
  adapters and orchestrators, amended in the same pass so no seat is charged with a rule it
  cannot discover from the repo.
- **`.hermes/TOOLING-TRAPS.md`** — append-only, now 300+ lines.
- Untracked: `docs/missions/public-debate-access/`,
  `.hermes/reports/public-debate-access/`, `.hermes/planning/public-debate-access/`.

**No other mission's in-flight work is dirty in the main tree** — the observability lanes are
already committed at `1c9578a`. Checked, because the standing constraint forbids disturbing
another mission's work.

## What is NOT done and should not be assumed

- **The QA loop has still not run.** V's brief requires all four loops. `QA-01` (`t_cb2dd94d`)
  is queued and inherits at least one explicit obligation: `S03-C3-3` direction 2 (logged-in,
  `?tab=public` must not show "your debates"), recorded UNVERIFIED-BY-ARCHITECTURE with the exact
  command.
- **One limit nobody could close:** the live DB frequency of the `raw_artifact_id` alias. The
  reviewer said so plainly twice rather than inferring it. The code-path enumeration IS closed —
  only judgement's `reduced_judgement` INSERTs and ledger's `node_strength_record`, with the
  runner binding at `:670` and `:2034`.
- **S02 and S04 have not started** — they are gated on this merge.
- S03's PLAN is complete and its worktree is synced, but S03-CODE is blocked on this merge too.
- **The QA loop has not run.** V's brief requires all four loops; QA-01 (`t_cb2dd94d`) is queued.
- `S03-C3-3` direction 2 (logged-in, `?tab=public` must not show "your debates") is recorded
  **UNVERIFIED-BY-ARCHITECTURE** with the exact command — a real QA-time obligation, not a gap
  that was quietly closed.

## Honest note on cost

S01 took five upstream blocks and nine architecture rounds. Zero were the coding seat's fault;
every defect was upstream of it, and it was right to stop each time. One family — acceptance
commands that look like verification and verify nothing — accounts for five of those rounds.
The product change itself was small and landed cleanly once the instruments were trustworthy.
