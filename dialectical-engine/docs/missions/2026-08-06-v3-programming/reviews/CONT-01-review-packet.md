# CONT-01 dual-diamond review packet

Ticket t_0b9a22a0, board debateai-v3. Author: Codex (GPT-5.6-Sol). You are one
of two independent lenses; you do not see the other lens's verdict. Verify the
author's claims against the ACTUAL working tree — never trust the handoff.

## V's law under review (verbatim, security ruling 2026-08-17)

> "Spawn every relay CLI in an empty scratch directory. NO LOCAL FILES
> SEARCHES INSIDE MY PROJECT, cause thats a security breach"

## The change under review (uncommitted working tree)

Files (the complete authorized scope):
- `acceptance/relay-core.ts` — spawn now gets `cwd: mkdtemp(relay-<maker>-*)`
- `acceptance/model-shim.ts` — codex exec gains `--skip-git-repo-check
  --sandbox read-only --ignore-rules --ignore-user-config`
- `acceptance/model-shim.test.ts`, `acceptance/claude-relay.test.ts`,
  `acceptance/grok-relay.test.ts` — cwd-probe regressions (fake binary prints
  its own cwd; asserts scratch dir, not repo, empty at spawn)

## Claims to verify (each needs evidence, not agreement)

1. EVERY relay CLI spawn path — including boot handshakes — flows through the
   isolated spawn. Look for any spawn/exec of a vendor binary that bypasses
   `invokeCli`.
2. The scratch dir is created fresh per process, empty at spawn, never inside
   the repo, never read by the relay afterward.
3. The codex flags exist in the REAL installed binary
   (`/Applications/ChatGPT.app/Contents/Resources/codex exec --help`) and do
   not break envelope parsing / lineage (DR-115 verbatim model ids).
4. The tests would actually CATCH regression (F1 check: can they pass for the
   wrong reason? e.g. probe binary that would print the scratch dir even if
   cwd were unset; assertions that don't pin "not inside the repo").
5. Scope audit: no product package, register, or migration changes; only the
   files above plus the mandated progress log.
6. Envelope parsers byte-unchanged for claude/grok; existing tests green.

## Live world (the blocking lens must have RUN something)

- `./node_modules/.bin/vitest run --config acceptance/vitest.config.ts model-shim.test claude-relay.test grok-relay.test` — expect 25/25.
- Orchestrator's live gate already passed (all three real handshakes OK;
  three `relay-<maker>-*` dirs created, all EMPTY) — re-run if you doubt it:
  the gate script is at the session scratchpad `cont01-live-gate.mts`.

## Known context (do NOT false-block on these)

- Full acceptance is 48/50 PRE-EXISTING: ceremony NODE_REVIEW_UNAVAILABLE (the
  live defect this ticket mitigates) and a runtime-policy fixture expecting
  max_model_attempts 74 vs 88. Neither touches CONT-01 files.
- `../.claude/launch.json` dirt and the untracked CONT-01-packet.md are
  orchestrator artifacts, not the author's.

## Verdict format

Write `docs/missions/2026-08-06-v3-programming/reviews/cont01-<lens>-verdict.md`:
GREENLIGHT or BLOCK, then numbered findings with evidence (file:line, command
output). If you BLOCK, state exactly what proof would change your mind.
