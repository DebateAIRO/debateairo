# FREEZE case file — administrative mission record

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the manifest is exact in prose, not executable data

**Cause.** `packets/FREEZE.md:22` names most files directly but delegates the six SPEC/PLAN/DECISIONS/DONE paths to the REQ evidence. This forces the freeze seat to parse another report and manually merge path groups before a high-integrity commit.

**Price.** One full REQ evidence read and one 24-path existence/hash command. The immutable commit was created 140 seconds after the ticket STATE comment; the Git plumbing transaction itself took 5.3 seconds. Actual token usage is **UNAVAILABLE**.

**Upgrade.** Dispatch FREEZE with a generated newline-delimited path file plus its SHA256. The packet should state the expected path count and pass that exact file to both `git add --pathspec-from-file` and the post-commit verifier.

## Finding 2 — the inherited handoff vocabulary omits FREEZE

**Cause.** `packets/FREEZE.md:28` permits READY markers for REQ/BASE or investigation markers for FIND, but it does not name FREEZE. The node title and contract make the intended outcome clear, yet the final marker still requires interpretation.

**Price.** No runtime delay, but inconsistent markers make route automation and peer-review dispatch more fragile. Token usage is **UNAVAILABLE**.

**Upgrade.** Give every administrative node its own legal marker, for example `READY FOR PEER REVIEW (FREEZE)`, or define one role-neutral READY marker with a required node field.

## Finding 3 — zsh reserves lowercase `path`

**Cause.** My first read-only blob verifier assigned the pathname to a variable named `path`. In zsh, `path` is tied to `PATH`; the assignment removed command lookup after the first loop iteration. The verifier then emitted 24 empty-hash mismatches even though the commit was correct. The rerun used `file_path` and verified 24/24 blobs with zero mismatches.

**Price.** One invalid verification invocation and one immediate rerun. No Git object or ref changed during either check. Actual token usage is **UNAVAILABLE**.

**Upgrade.** Repository shell snippets should reserve `path`, `status`, `commands`, `cdpath`, `fpath` and other zsh-special names. A tiny shell lint rule or reviewed helper would prevent false-negative evidence and transcript noise.

## What nearly went wrong

- A living `board-ids.json` changed after REQ completion. The orchestrator announced the update before capture and froze further edits; the committed SHA256 is `60846a181bba170f921336a2bac63f5e777e55916e75438b92c227028082bd9f`.
- A normal `git add` would have contaminated the original index. The transaction instead used a private temporary index initialized from parent `b7ca2c413bf3242ce18e29a397dc9a3aa9228893` and removed it after `update-ref`.
- The commit receipt must remain external to the commit it describes. `FREEZE.md`, `freeze-manifest.json` and this report are intentionally absent from the frozen tree.

## One-prompt machine upgrade

Generate the administrative freeze packet from completed board state. It should contain: parent commit, new ref, expected-absent old value, a machine-readable 24-path manifest, captured SHA256 for every file, explicit exclusions, and a single reviewed private-index command. The agent then performs three bounded actions: verify inputs, create the ref transaction, verify blobs and source fingerprints. This removes manual path reconstruction and makes a one-prompt administrative freeze auditable without rereading narrative reports.

## Measurements

- Ref: `refs/heads/codex/support-conversation-mission`
- Commit: `1b305e4d28e33bf77bb181eef200b7065f2c9334`
- Tree: `285d090a8aa9075650610213477c86394058d124`
- Parent: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`
- Delta: 24 added administrative records; 24/24 committed blob SHA256 values matched; zero mismatches.
- Original source after commit: `integration/debate-tiers@446c685e977104ecf2b0b5ee0519f7123968429f`, 157 porcelain entries, 56 tracked unstaged, 0 staged; staged and unstaged diff hashes unchanged.
- Product tests/builds: not run by contract; no heavy lease used.
- Actual token usage: **UNAVAILABLE**.
