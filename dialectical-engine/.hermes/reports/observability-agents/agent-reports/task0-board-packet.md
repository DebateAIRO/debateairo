# Task 0.5 board packet — case report

Date: 2026-09-03

## Outcome

I prepared a board-write packet and made no board change.

After independent review, I reworked the packet without applying it:

- FIX-10 and FIX-14 now reproduce the frozen headings exactly, including backticks around `obsctl kill` and `dev`.
- Each of the sixteen tickets has a direct safely quoted `create --json` command with its exact initial `[unassigned]` manifest title/body, absolute worktree path, branch, stable idempotency key, `created-by Hermes`, ruled status, and parents. The frozen SPEC heading after the tag is unchanged.
- Every create receipt and immediate `show --json` result is retained separately. Readback checks the returned id, exact `[unassigned]` title/body/status, null assignee, `workspace_kind`, `workspace_path`, `branch_name`, `created_by`, and top-level parents. The current CLI does not expose the stored idempotency key on `show`, so the packet makes no false readback claim for it.
- Exact-title duplicate checks fresh-read active and active-plus-archived rows before each create using each initial `[unassigned]` full title; zero creates, one reuses and verifies, and more than one stops.
- Construction now parks ordinary unreleased work `todo` and unassigned, and hard holds `blocked` and unassigned. It performs no promotion or assignment.
- FIX-01 is parked `blocked` for C5. It is never called `running` unless an actual continuing session is attached to the exact ticket and proven live.
- Release is a later one-ticket sequence that must replace `[unassigned]` with `[codex@gpt-5.6-sol]` while assigning the worker, verify the exact retagged title and assignee while still `todo`, and only then dry-run and perform promotion. The installed CLI has no supported live-title edit, so release currently fails closed as a Hermes tooling gap; plain assignment is forbidden. Blocked holds use their supported recovery path instead of a fake promote.
- FIX-07 now says the persistence mechanism is OPEN for ARCH/V; the prior evidence does not select append-only.

Live checks at `2026-09-03T14:19:02Z` found:

- `observability-agents` has no ticket whose exact slice title contains `FIX-01 —` through `FIX-16 —`.
- `fixagent` does not exist.
- The four predecessor ids called “missing” in the frozen FIX specs already exist on `observability-loop`: S27 `t_d55caea1`, S18b `t_49e079f4`, S23 `t_5aca48c6`, S24 `t_27975928`. Minting them again would be a duplicate.
- The audit move for S03a is already done. The S03b and S05 moves are still blocked by open parent S02 `t_8e040ec2`. Prior comments already record the failed close and explicitly reject `--force`.

## Main finding

The old audit says to mark S03b and S05 done, but the live dependency graph will not allow this while S02 is open. That is correct. S02 still has an unreviewed merged change and an RP-0-gated addendum. The safe order is S02 first, then S03b, then S05, with a fresh board read after each move.

## Near misses avoided

- Treating S27, S18b, S23, and S24 as missing because the newer specs did not carry their ids. The old board and H6 self-audit carry the ids.
- Using `hermes kanban boards switch`. The shared current board is `auth-front-door`; changing it would affect other work. Every command in the packet uses an explicit board slug.
- Using `complete --force` to make the audit table look tidy. The parent dependency represents unfinished work.
- Assuming `complete` has a dry-run or a safe inverse. It has neither. The packet uses one-at-a-time writes and stops on any mismatch.
- Creating an extra `fixagent` board through Hermes without recording the plan-level V-only act.
- Assigning/promoting target-ready tickets during construction, which would have exposed them to dispatch before Task 0 and ticket-local holds were freshly proven.

## Cost and dead ends

- One first board read failed because the CLI creates an init lock under `~/.hermes`, outside the workspace sandbox. The known TOOLING-TRAPS entry was correct; the read then ran with the already-approved Hermes access.
- `hermes kanban boards list` prints `(empty)` counts for these boards even when tickets exist. Ticket truth came from explicit `--board <slug> list --json`, not the board-list count label.
- A broad board-list dump was too large. Exact `jq` projections gave the needed ids, states, parents, child links, and last-comment heads.

## Evidence read

- Full active FixAgent plan and Task 0.5.
- `fixagent-state-audit.md` §A and its current-state notes.
- All sixteen FIX `SPEC.md` and `DECISIONS.md` files; FIX-01 `SPEC-v2.md` and its newer decisions also apply.
- Predecessor H6 board self-audit and live `observability-loop` records.
- Heartbeat board-custody rules, COMMON board rules, and relevant TOOLING-TRAPS entries.

## Writes

Only this report and `.superpowers/sdd/PLAN-FixAgent/task0-board-ruling-request.md` were written. No ticket, comment, edge, status, board, product file, source file, database, service, or git state was changed.
