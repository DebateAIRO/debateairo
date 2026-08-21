# PRE-08 Codex review lens

- Ticket: `t_7d9e70ad` / PRE-08
- Review regime: DR-101 independent Codex lens of Claude-authored work
- Ticket comments read through: `READY FOR PEER REVIEW` at `2026-08-06T19:31:52Z` (`1786044712`)
- Independence boundary: no later ticket comments and no Grok verdict or `reviews/pre-08-grok*` artifact were read

## Verdict basis

1. **Five-route membership passes.** Home 3 contains exactly five routes: `INERT` (inert stop), false-presupposition non-answer, value → human, `NOT_EMPIRICALLY_DECIDABLE`, and depth-zero (no justification, no split). This matches DR-037 and the five rows already present in §5.2 F-4's governing route table.
2. **Authority and S-13 treatment pass.** Added row 5 cites DR-037 and DR-099/A-01. The dated `2026-08-06` edit note cites DR-099 A-01 and DR-100 and states, explicitly, that the edit **mints no new typed state**: it places the already-ruled DR-037 state in the S-13 table.
3. **Surgical diff passes.** `git diff --numstat -- docs/founding/requirements-spec.md` reports `15 0`; the diff is one hunk at Home 3 in §12.3. Rows 1–4 are byte-identical to `HEAD` (both extracted row sets SHA-256 to `3d871c94fd8db33c813faf3e128e896a46a55c5fb0cfef94a97c8eaff055368c`). `git diff --check` is clean.
4. **Founding-doc scope passes.** `git diff --name-only -- docs/founding` returns only `docs/founding/requirements-spec.md`; tracked-only `git status --short --untracked-files=no` reports that single modified tracked file. Repo-wide untracked files were ignored as directed.

No findings.

CODEX REVIEW: APPROVED
