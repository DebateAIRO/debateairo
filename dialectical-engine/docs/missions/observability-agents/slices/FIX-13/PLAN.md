# FIX-13 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-13 — Approval-first fix, and it waits: after V approves, a sandboxed worker codes the fix RED→GREEN and presents a pull request that only V can merge
**Gate:** G4 approval-first fixes · **SPEC:** `slices/FIX-13/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 11 (`FIX-13-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S29 `t_8cf81861`** (fix executor, approval-first arm; sandbox IC-3; landing pipeline; PR template; revert machinery) — with "PR" defined by contested row **F-14**: default in phase 1 = a LOCAL branch `fixagent/<incident-hash>` plus the machine-parseable PR template posted on the ticket (no push — the repo's push law is V-gated, spine v3.4.0 item 6); remote PR into

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (11 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-13-R01 | Mutation is armed only by `obsctl arm --mutation` (custodian token) and defaults OFF after any restart; `quick… |  |  |  |
| FIX-13-R02 | Only an `APPROVED(hash)` proposal whose stored hash still matches is coded; a mismatch refuses with `PROPOSAL_… |  |  |  |
| FIX-13-R03 | The fix worker (fresh Codex CLI session, separate OS user, sandbox profile denying read/write/create/traverse/… |  |  |  |
| FIX-13-R04 | The daemon validates the patch: every touched path matches the allowlist globs and none the floor deny list; e… |  |  |  |
| FIX-13-R05 | The daemon applies the patch in an isolated worktree at the pinned base SHA (clean baseline enforced — a dir… |  |  |  |
| FIX-13-R06 | Presentation: a branch `fixagent/<incident-hash>` with exactly one self-contained, revertible commit (OBS-R118… |  |  |  |
| FIX-13-R07 | It waits: the daemon holds no merge permission, never approves or closes its own PR, never touches `dev` or `m… |  |  |  |
| FIX-13-R08 | Kill mid-flight: `obsctl kill` during coding revokes the lease, kills the worker process group, and no branch … |  |  |  |
| FIX-13-R09 | IC-3 forge fixture: an adversarial test file run as the worker attempts to read tokens/`KILL`/`ARMED`/proof/bu… |  |  |  |
| FIX-13-R10 | Every worker read, tool call, file considered, diff, test, branch, spend unit, denial and kill appends to `obs… |  |  |  |
| FIX-13-R11 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-13-C1 |  | `(architecture seat fills)` |  |
| FIX-13-C2 |  | `(architecture seat fills)` |  |
| FIX-13-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-13-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-13-C2: (architecture seat fills)
FIX-13-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
