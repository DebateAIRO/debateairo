# S01-CODE-N1 follow-on report

Date: 2026-08-29  
Ticket: `t_57c47f03`  
Classification: upstream acceptance-command repair follow-on; not worker rework and not a defect in the S01 implementation.

## Cause and price

The upstream PLAN serialized JavaScript-regex alternation as `\|` to keep pipe characters from breaking Markdown tables. Vitest passes `-t` to a JavaScript regex, where `\|` means a literal pipe, not alternation. Four test titles were therefore contorted to contain literal pipes so the step filters supplied to the worker would select something. The deeper cost was one C2 presence arm that could not be rescued by naming: it selected zero of 21 finished tests. Measured price: one Architecture round under V waiver, one new worker follow-on ticket, four title edits, and another three-run pass over all four clusters.

The durable fix belongs in authoring, not in worker naming: commands containing regex alternation should live in fenced blocks rather than Markdown table cells; the verifier should prove a nonzero selected count; future suites should prefer stable cluster ids in `describe`/title prefixes over alternation across prose.

## Exact changes and observed per-title acceptance

Only four `it()` titles in `tests/unit/s8-publication.test.ts` changed. Assertions, fixtures, product code, schemas, and every other test were untouched.

1. `publishes the tree without leaking owner-only fields` — step pattern `publish.*tree|tree.*publish`: `vt=0 guard=0`, 2 passed / 19 skipped of 21.
2. `redacts only ledger_unknown_ref's abstention value, leaving the rest of the record intact` — step pattern `ledger_unknown_ref|redact`: `vt=0 guard=0`, 2 passed / 19 skipped of 21.
3. `strips residual handle marker values from the published JSON` — step pattern `residual.*handle|handle.*residual`: `vt=0 guard=0`, 1 passed / 20 skipped of 21.
4. `reading a published debate restores the same public tree that was published` — step pattern `round.trip|read.*tree`: `vt=0 guard=0`, 2 passed / 19 skipped of 21.

The pre-edit whole publication suite was 21/21. No RED behavior frame applies to this title-only refactor: the behavior and assertions were already green, and the upstream regex was corrected before dispatch. The meaningful before/after check is that each natural title remains selected by its corrected acceptance and no literal-pipe title remains.

## Three-run verdict

| Cluster | Run 1 | Run 2 | Run 3 | Worst |
|---|---|---|---|---|
| C1 regression + presence | 24/24 + 4 passed/20 skipped | same | same | GREEN |
| C2 regression + presence | 21/21 + 5 passed/16 skipped | same | same | GREEN |
| C3 regression + presence | 25/25 + 2 passed/23 skipped | same | same | GREEN |
| C4 legacy | 1 passed/20 skipped, `vt=0 guard=0` | same | same | GREEN |

## Findings and near misses

- Ticket metadata still says three titles, while the direct follow-on and corrected PLAN name four. The direct instruction correctly superseded the stale count.
- The Router statement that every proposed title matches both its step pattern and the five-pattern C2 presence arm is too broad. The publish title does not match that C2 arm, and the round-trip title belongs to C3. This is non-blocking: the PLAN explicitly says C2 presence accounts for five of eight new C2 tests, those five still run, and both affected titles match their own relevant step/cluster arms.
- A worker should not invent another title to satisfy a filter. This time the proposed natural titles were checked mechanically before editing; all relevant patterns matched.
- No new assertion or constant was added, so the worker refutation/mutant duty has no new subject in this follow-on.

Comments read through: claim comment index 0 before handoff.
