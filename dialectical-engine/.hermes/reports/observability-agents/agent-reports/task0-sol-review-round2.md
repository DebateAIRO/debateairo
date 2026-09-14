SKILLS LOADED: superpowers:verification-before-completion

# Task 0 — independent Sol re-review, round 2

Reviewed: 2026-09-03 (Europe/Bucharest)

Role: fresh Sol reviewer; no Hermes/external model and no subagents

Worktree: `codex/fixagent-plan` at `2b670d3059c60d7262cf655bd5d402c88100dff3`

## Verdict

`TASK 0 ROUND 2: REWORK`

The RP-0 and RP-3 action fixes are now fail-closed, the corpus repair is real, and the original board command/readback coverage is materially stronger. Task 0 is still not safe to apply because the writer report contradicts its appended correction, the N4 scanner has both a bypass and a false positive, and all sixteen unassigned board tickets carry an assigned-model title tag contrary to the binding board protocol.

## F1–F8 results

### F1 — RP-0 action: PASS

`.superpowers/sdd/PLAN-FixAgent/task0-rp0-human-action.md:18-92` is one `set -eu` action. It verifies the local 9-name hash before any board command, checks exact ticket id/title/blocked status, accepts only V-prefix/exact cardinalities `0:0` or `1:1`, posts only for `0:0`, and requires the postcondition to be exactly `1:1`.

Fresh fake-board execution of the exact action body:

```text
zero prior pin:       exit 0, posts=1
exact prior pin:      exit 0, posts=0
conflicting prefix:   exit 1, posts=0
duplicate exact pin:  exit 1, posts=0
wrong status:         exit 5, posts=0
post failure:         exit 7
lost post/readback:   exit 1 after the single attempted post
wrong local hash:     exit 1 before board access
```

Live read-only precondition remains exact: `t_4deda7ab`, blocked, two non-V comments, zero V-prefix comments.

### F2 — writer authority: REWORK

The append-only correction in `slices/FIX-07/DECISIONS.md:20` is correct and preserves history: Task 0.2 proved only that the writer has no current `component_health` write privilege and the current upsert is unavailable; persistence remains OPEN for ARCH/V, with schema/grant owner and stable ordering key required if append-only is later chosen. The board packet now carries the same OPEN state at `task0-board-ruling-request.md:205`.

However, `dialectical-engine/.hermes/reports/observability-agents/agent-reports/task0-writer-grant.md:5` still states as its outcome that “FIX-07 must use the append-only alternative.” That is a current, non-historical report and contradicts both the correction and frozen `FIX-07/SPEC.md:13`, which assigns the mechanism choice to ARCH. A reader using the case file rather than the decision tail can still act on the research seat's unauthorized selection.

Smallest correction: amend the writer case file's outcome to the evidence-only statement and explicitly point to the later correction; do not choose a persistence mechanism there.

### F3 — N4 scanner: REWORK

The scanner now catches the ten requested import/export/side-effect/dynamic/require mutants, both quote styles, and an escaped `ident\u0069ty` literal. Baseline manifest, ordinary path-string data, a safe `require("./safe.js")`, and a comment containing forbidden-looking text stay green.

The scanner at `task0-n4-demo-request.md:148-187,196-216` does not lex JavaScript regular-expression literals and requires `)` immediately after a dynamic-import or require string. Three identical fresh runs produced:

```text
baseline manifest                                      exit 0
safe regex: /import x from ".\/identity.js"/           exit 1  WRONG
import("./identity.js", {with:{type:"json"}})          exit 0  WRONG
require("./identity.js", {})                           exit 0  WRONG
```

The first case is safe data but tokenizes into a false `import ... from` sequence. The latter two are valid calls whose first literal operand names the forbidden module, but the extra argument prevents the immediate-`)` pattern from matching. This refutes both the no-false-positive claim and the claimed coverage of dynamic import/free require.

Smallest correction: use a real JS/TS parser or complete the bounded lexer with regex-literal states and call-argument parsing. Add these three cases to the mandatory mutant set, rerun all positives and neighboring negatives three times, and keep the broad rule for every non-manifest artifact.

### F4 — RP-3 corpus semantics: PASS

Fresh byte hash:

```text
8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e
```

The file has 24 unique ids and markers, 8 cases per target, and the complete 8-class matrix per target. The three control-class JSON values use single JSON Unicode escapes. After parsing they contain:

```text
RP3-PROMPT-07  U+0000 U+202E
RP3-TICKET-07  U+202E
RP3-NOTIFY-07  U+000D U+202E
```

No non-control class contains a ruled control/bidi code point. Fresh in-memory refutations rejected a missing case, a visible double-escaped control, a control in a neighboring class, and a duplicate target/class pair; a purpose-only neighboring change remained accepted.

### F5 — RP-3 pin action: PASS

`.superpowers/sdd/PLAN-FixAgent/task0-rp3-human-action.md:42-177` validates the exact bytes, full matrix, oracle shape, actual control/bidi semantics, exact ticket id/title/blocked state, and V-prefix/exact cardinality before posting. It re-reads the same identity and requires exactly one matching V pin.

Fresh fake-board execution of the exact action body:

```text
zero prior pin:       exit 0, posts=1
exact prior pin:      exit 0, posts=0
conflicting prefix:   exit 1, posts=0
duplicate exact pin:  exit 1, posts=0
wrong status:         exit 1, posts=0
post failure:         exit 7
lost post/readback:   exit 1 after the single attempted post
wrong expected hash:  exit 1 before board access
```

Live read-only precondition remains exact: `t_16fe7321`, blocked, zero comments and zero V-prefix comments.

### F6 — frozen title text: PASS

Mechanical comparison of all sixteen manifest titles to the first heading of each frozen `FIX-01..16/SPEC.md`, after the runtime prefix, returned 16/16 exact. FIX-10 preserves the backticks around `obsctl kill`; FIX-14 preserves the backticks around `dev`.

### F7 — structured board custody: REWORK

The original custody defect is otherwise repaired: the creation block has 16 valid `create --json` calls; 16 absolute `worktree:` arguments; 16 branches; 16 stable keys; 16 `--created-by Hermes` values; and 16 immediate readbacks. Both Bash and zsh syntax checks pass. The checker rejects mutations to receipt id, task id, title, body, status, assignee, workspace kind/path, branch, creator, and parents. `show` does not expose the idempotency key, and the packet no longer claims that it does.

But the structured title/assignee combination is unlawful. `task0-board-ruling-request.md:60,68,77` and all sixteen create/readback blocks require a `[codex@gpt-5.6-sol]` title while also requiring `assignee == null`. Binding `debateai-heartbeat-protocol.md:314-323` and `:2000-2008` says unassigned tickets carry `[unassigned]`, the bracket tag must agree with the assignee, and board-crafting packets must enforce that rule. Fresh comparison found 16/16 prefix/assignee mismatches.

The release sequence assigns the ticket but contains no independently verified title-retag step. `hermes kanban assign --help` promises only assignment; the CLI's `edit` command edits completed-run result metadata, not live titles.

Smallest correction: construct the parked cards with `[unassigned]` titles and exact frozen heading text after that prefix. Before release, use a supported Hermes board-custody path that atomically or fail-closed aligns the assignee and bracket tag, then read both back before promotion. If the installed CLI cannot retag safely, stop and route that tooling gap rather than pre-tagging an unassigned ticket.

### F8 — early dispatch exposure: PASS

Construction contains 11 `todo` and 5 `blocked` initial states, all unassigned. The creation block contains zero `--assignee`, `assign`, or `promote` operations. FIX-01 is blocked rather than synthetic-running. The later release sequence is one-ticket-at-a-time and requires fresh Task 0 plus ticket-local checks; blocked tickets use a separate unblock/recovery path. No Task 0 construction command makes a ticket claimable.

This PASS does not cure F7's title/assignee contradiction.

## Architecture selections unchanged

- OFF switch: **A remains approved for V ratification**. Request SHA-256 `4d9fc16b6579c0cee4d615cd1718f3723774234ee0c0fc00f22cd6879ef74ba2`.
- Tracer: **C remains approved for V ratification**. Request SHA-256 `d020a96b7da2ceb430bd7ea03b540b77d538e6fd8429a6be3839c0a61a7e31bc`.
- B2: **B remains approved for V ratification**. Request SHA-256 `d5b872b791a49e1197a2f59cc85e08b55a64369ff5f267c7a0e0dcdbf28af7d2`.

Their mtimes predate the rework files, their selection text is unchanged, and no ruling has been implemented in a frozen SPEC, migration, product file, or test.

## Read-only state and custody

- Current live board read: `observability-agents` has 52 active rows and 52 active-plus-archived rows, with zero exact new FIX-01..16 rows. `fixagent` is absent and the current-board pointer is still `auth-front-door`.
- RP-0 and RP-3 live states and V-comment counts are unchanged as recorded above.
- Every live Hermes invocation in this review was `--help`, `list`, `show`, or `boards list`; no create, comment, assign, link, promote, complete, archive, or board-create command ran.
- Git index is empty. No commit was made. The only tracked worktree diff is the two appended FIX-07 decision rows; no frozen SPEC, plan, product source, migration, demo, or test is modified.
- The only files written by this reviewer are the two round-two review copies named in the assignment.

## Required rework before another review

1. Reconcile `task0-writer-grant.md:5` with the authoritative OPEN correction.
2. Repair N4's lexer/parser and add the exact false-positive and bypass mutants above.
3. Make all parked ticket prefixes agree with their null assignee, and define/prove the supported retag-at-assignment operation before any promotion.

TASK 0 SOL REVIEW ROUND 2 REWORK
