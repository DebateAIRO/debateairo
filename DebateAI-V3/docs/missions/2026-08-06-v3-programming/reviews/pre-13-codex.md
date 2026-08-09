# PRE-13 Codex review lens

Independent reviewer: Codex (separate model family/session from the Claude author)

Ticket: `t_588f92c2` / PRE-13

Evidence boundary: `hermes kanban show t_588f92c2` was attempted, but the managed
sandbox denied its init-lock write under `~/.hermes`. The same ticket record and
comments were therefore read directly from the Kanban database in immutable,
read-only mode, stopping at the Claude worker's `READY FOR PEER REVIEW` handoff
(comment 118, `created_at: 1786085328`). The later ticket comment, every Grok
verdict, and `reviews/pre-13-grok*` were not read.

## Evidence inspected

- `docs/founding/decisions-ledger.md` — DR-061 ratifies all 51 §23 rows by
  reference to their recorded recommendations.
- `docs/founding/requirements-spec.md` — the four PRE-13 sites; §23's closed,
  zero-open header and block table; `OD-S-01` option (b); and §25.1's dated
  `stage11Rollout` withdrawal row.
- `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` — DR-089's
  post-completion Q61 settlement restructure and WAIT-drain ruling.
- `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` — DR-114's
  authorization of exactly the four founding corrections.
- `HEAD:docs/founding/requirements-spec.md` — predecessor text for the four
  sites, used only to verify preservation and scope.
- `git diff --check` — PASS (no output).
- Focused structural checks — Q61 remains a six-cell row; §4 row 16 remains a
  five-cell row; the four stale phrases survive only in their preservation
  notes; and there are three DR-114 edit notes because sites 1 and 2 share one.
- Byte-preservation comparisons against `HEAD` — row 16's four consequence
  clauses, Q61's Fires limb, and §17.8's 24-item list all produced matching
  SHA-256 hashes before and after PRE-13.

## Findings

No PRE-13 findings.

1. Section 4 row 16 now carries `stage11Rollout = phased`, explicitly ties the
   value to ratified `OD-S-01` option (b), and places DR-061 in the DR cell. The
   four pre-existing consequences are unchanged: recording limbs start on day
   one, Q61 outcome ingestion remains in WAIT until an outcome arrives, no
   operational-calibration claim is made, and capability cells remain
   `basis: NONE`.
2. The register status is correctly `19 of 19` with zero open rows. Its single
   shared dated note preserves the superseded row-16 value text and original
   dash DR value, preserves the superseded 18-of-19 status line verbatim, cites
   DR-061/OD-S-01 and DR-114, points to §23 and §25.1, and explains why the row
   and its count must travel together.
3. Q61's blocked-on suffix now says the mechanism design is RATIFIED by DR-061
   and points to §23 block B. The Fires limb before that suffix is byte-identical
   to `HEAD`. The dated note preserves the superseded string, cites DR-089 as an
   onward ruling-chain pointer without restating it, explicitly leaves the Fires
   text untouched, and takes no position on that WAIT text.
4. Section 17.8 now records that all 24 questions closed at DR-061 on
   2026-08-05. The entire intervening 24-item list is unchanged, and the dated
   note accurately grounds the closure in DR-061 and DR-114.
5. Nothing is decided anew. Each PRE-13 note identifies DR-061 as the substantive
   authority and DR-114 as correction authority; the active text follows those
   rulings without adding a value, state, exception, or behavior.
6. PRE-13's edits are confined to the four contracted sites. The other live
   hunks are the declared PRE-08 §12.3 row 5, PRE-11 §§3.8/3.11-Q59/3.13, and
   PRE-12 §12.3 row 14 changes; they were not judged here.

Non-blocking observation outside PRE-13: PRE-11's existing Q59 note calls the
`stage11Rollout` withdrawal row part of §23 even though it is in §25.1. This is
the worker-flagged cosmetic item and is not a PRE-13 finding.

CODEX REVIEW: APPROVED
