# PRE-12 Codex review lens

Independent reviewer: Codex (separate model family/session from the Claude author)

Ticket: `t_a66b0a21` / PRE-12

Evidence boundary: the ticket body was read from `hermes kanban show t_a66b0a21`
via a read-only temporary copy of the Kanban database because the sandbox denied
the CLI's init-lock write under `~/.hermes`. Per the review assignment, no ticket
comments, Grok verdict, or `reviews/pre-12-grok*` artifact were read.

## Evidence inspected

- Ticket body — PRE-12 is limited to §12.3 mark 14 plus its dated note; marks
  23–24 are explicitly forbidden.
- `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` — DR-110(1)
  forbids marks 23–24 and DR-110(2) authorizes the Q51 provenance-failure cause
  at mark 14 only.
- `docs/founding/decisions-ledger.md` — DR-049 supplies the serve state machine
  and components-only `DEFECT` terminal; DR-044 makes Q51's provenance join,
  locator gate, and reasoning-only downgrade blocking machine gates.
- `docs/founding/requirements-spec.md` — §12.1a S-7/S-9, §12.2, the live
  row-14 region, its `HEAD` predecessor, and the complete Home-2 table.
- `git diff --check -- docs/founding/requirements-spec.md` — PASS (no output).
- Whole-file forbidden-mark check — `UNVERIFIED-CITATION` absent;
  `CITATION-RECHECK-FAILED` absent.
- Home-2 row check — 22 rows; last row is 22.

## Findings

No findings.

1. Row 14 now states exactly three causes. Its two original causes remain
   verbatim — `composition could not be conformed in two attempts` and `the
   verdict failed its stranger check` — and the only addition is a Q51
   provenance failure sending the answer to `COMPONENTS_ONLY`. The Raised-by
   cell remains exactly `DR-049 · §12.1a`.
2. That unchanged authority claim holds independently. S-7 routes a Q51
   `PROVENANCE` failure to `COMPONENTS_ONLY` and gives every such route a visible
   `DEFECT` badge; S-9 explicitly names a Q51 provenance-failure terminal
   fixture. §12.2 identifies the Q51 provenance join, locator gate, and
   reasoning-only downgrade as blocking gates, consistent with DR-044, while
   DR-049 owns the terminal and badge.
3. The dated note quotes the superseded two-cause cell verbatim and cites
   DR-049, §12.1a S-7/S-9, §12.2, and DR-110(2). Its no-mint and
   no-behaviour-change claims are accurate: the state, transition, badge, and
   Q51 blocking behavior already exist; the edit only completes the Home-2
   summary row.
4. The DR-110 fence held. Home 2 still ends at row 22, and neither forbidden
   mark name occurs anywhere in the file.
5. PRE-12 owns only the row-14 replacement and the immediately following dated
   note. All other uncommitted hunks in `requirements-spec.md` are outside this
   ticket and were not judged here.

CODEX REVIEW: APPROVED
