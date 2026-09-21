# ORCHESTRATOR SELF-REPORT — Algorithm Live Loop (Fable 5.1, orchestrator + judge) · LIVING CASE FILE
Murder-case format: cause, price, near-miss, dead end, packet-unclear — per incident, as it
happens, so closure does not reconstruct from memory. Prices in wall-clock / rounds / tokens.

## Incidents (append-only, newest last)
| # | incident | CAUSE (not symptom) | PRICE | cure minted |
|---|---|---|---|---|
| O-1 | Packets cited codex verdicts BEFORE the ruling that narrowed them (T7 r2 resume) | packet assembled in arrival order, not authority order | seat "nearly cost a round on B2's widest reading" | packets open with RULINGS FIRST |
| O-2 | Hash-recipe drift (`sed '2d'` vs `tail -n +3`) across rounds of one lane | scheme stated per-packet from memory, not from D21 | one reviewer mismatch risk; seat had to restate the recipe | D21 single scheme; packet-lint of line 1/2 (D21) |
| O-3 | zsh word-splitting, THREE bites in one night (vitest filter; `for f in $files`; `git diff -- $F`) | launcher prose written as bash, executed by zsh; each time the failure was SILENT (empty output / one iteration / "DONE" printed) | one wasted 21-file replay (~12 min); a FALSE "no overlap" answer caught before send | printf/while-read lists; every launcher prints per-item lines and counts them; trap ×3 |
| O-4 | `codex exec resume` with `--sandbox` after `resume` (usage error) then with `-c writable_roots` before `resume` (silently not honored) | trusted an unproven trap claim ("-c accepted on either side") and an exit code | one 40-min xhigh review (847k tokens) whose verdict lived only in a log; +1 refile turn | fresh `exec` for every codex round; verify by verdict FILE, never exit 0 |
| O-5 | Timestamps estimated ("2026-09-02 00:0x") instead of read; wrong by a date | wrote stamps from a mental clock after a long stretch | append-only corrections in DECISIONS | `date` before every stamped entry |
| O-6 | Merged TINT1 over an integration worktree with 5 dirty files | did not run status before merge; files were OneDrive exec-bit flips (0 content hunks) | none (diagnosed before any suite), but the merge law "status clean first" was skipped | status→diagnose→cure→merge order restated; `core.fileMode=false` on all mission worktrees |
| O-7 | Resume packet's 0052 identity proof = "git diff prints nothing" | a success criterion that a non-matching pathspec also satisfies | seat nearly filed a false proof; F-TINT1-7 trap | ls-tree line + two independent hashes |
| O-8 | Seat transcripts from the pre-compaction session unresumable by id | did not know compaction rotates the session id; SendMessage to dead ids | three fresh seats re-reading ~50k tokens of context each (~150k tokens) | resume packets ON DISK before any dispatch; after compaction, assume ids are dead |
| O-9 | Rate limits (weekly 23:05, session 00:25) killed 4 seats mid-work | roster is single-vendor for workers; no limit telemetry before dispatch | ~3 h of wall-clock across the night; two capture-before-destroy sweeps | D22 hold discipline; wip checkpoints; same-session resume at reset; V-RL-1 |
| O-10 | Packet cited the one-way-door law under the wrong file (T6 codex r2 N2) | ruling id remembered, location not verified | one codex non-blocking finding | verify every cited ruling resolves to its operative paragraph |
| O-11 | "five regressions" dispatched to TINT1 with four listed (F-TINT1-5); replay launched for "five" files when b7 had 21 failing | counted families in my head instead of grepping the log's FAIL lines | one dispatch defect; one relaunch | derive every failing set from the log, never from memory |
| O-12 | Two one-shot session crons (02:07, 02:36) never fired; discovered at 07:34 from a peer's message | crons fire only when the session can take a turn; an account-wide limit (04:00-07:30) froze the session; no fallback existed | 5 h wall-clock idle across four lanes | D22 ADDENDUM-4: on-disk RESUME.md checked at every live turn; never rely on a timer alone |
| O-13 | Auto-mode safety classifier outage dropped a whole turn (three writes + a seat dispatch) silently; discovered only because V said 'limits reset' | tool calls fail closed on classifier timeouts; no local retry | one lost turn (~10 min) + re-issue | re-issue as a batch; keep every write idempotent (grep-before-append) so re-issues never duplicate |
| O-14 | Quiet-host gate (<8) could never open: this machine idles at 14-17 from OneDrive/Defender/Teams | designed the gate from a load number without measuring the host's floor | ~15 min in a wait loop; peer asked whether I was done | gate on worker presence, not load; record the floor once per host |
| O-15 | Held two seats 15 min past the peer's real finish because my "vitest worker count" matched my own grep shell wrappers | measured a proxy that included the measurement process itself | ~15 min idle on two Opus seats | count the thing itself: `ps -eo command \| grep vitest \| grep -v shell-snapshots`; verify any process gate against a known-zero state before trusting it |

## What repeatedly cost tokens
1. Silent shell failures (O-3, O-7): every one printed nothing and exited 0. The fleet law
   "a verification must be able to fail" applies to the ORCHESTRATOR's launchers first.
2. Trusting exit codes and prose over artifacts (O-4): the verdict FILE is the only proof a
   review happened; the log is testimony.
3. Context re-reads after seat deaths (O-8, O-9): ~450k tokens of Opus re-reading tonight.
   The cheapest insurance was the one taken late — resume packets on disk from the start.

## What must be upgraded (ranked)
1. A launcher library: bash (not zsh), per-item echo + count assertion, artifact-existence
   post-check, `date` header. Every codex/vitest launch goes through it.
2. Packet-lint extended (D21 lines + cited-ruling resolution + RULINGS-FIRST order + failing
   sets derived from logs).
3. Limit telemetry before each Opus dispatch (a 1-token probe) and staggered seat starts so
   one reset does not kill a whole wave.

## Dead ends (do not re-derive)
- `codex exec … resume --last` with any out-of-tree writable root: two forms tried, both
  fail (usage error / silent rejection). Use fresh exec + prior-verdict path.
- Reading the T0 authority table by section heading: the 23 names are the `| X | X | X |`
  rows at D.1 (lines 188-210); parse those, not prose.
(continued at closure: what nearly went wrong; one-prompt-machine recommendations)
