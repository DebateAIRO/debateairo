# T1 three-worker A/B — exact command matrix

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router / V
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: **UNEXECUTED LEDGER — NOT A LAUNCH AUTHORIZATION**

> **One executable truth.** `run-claude-T1-3worker-ab-diagnostic.sh` is the sole
> executable procedure. Every command block below is a reviewable quotation of a
> reviewed wrapper section, not a second script to run: receipt paths are
> `$T1_RUN_DIR/...` under the unique run directory, statuses are
> `<integer> <64-hex run commitment>`, and every cell is launched through the
> wrapper's `os.setsid()`/`os.execvp()` supervisor. Any fixed `$T1_LOGS` receipt
> path, bare `print -r -- "$?"` status, or direct unsupervised `pnpm`/`node`
> invocation appearing anywhere below is a defect in this document, and the
> wrapper's own text governs.

## 0. What this document is

Every command the diagnostic runner executes, written out in full and in order.
No ellipses, no "repeat for the other nine pairs", no helper standing in for a
cell. A reviewer who wants to know what will run reads this file.

This is the corrected matrix. Two independent GPT-5.6 Sol xHigh reviews returned
`CHANGES REQUESTED` on the first draft; the corrections it binds are:

1. the **outer Git root** `/Users/vladmihaimiron/Documents/DebateAIRO` and the
   **checkout root** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
   are different directories. The first draft used
   `git rev-parse --show-toplevel` as if they were the same, which lands outside
   the tree that contains `apps/`, `packages/`, `tests/` and `pnpm`. Both are
   verified, and every repository-relative command runs after `cd` to the
   checkout;
2. the Vitest options are a **zsh array**, expanded as `"${T1_VITEST_FLAGS[@]}"`.
   Scalar word splitting is how `--poolOptions.forks.singleFork=true` silently
   becomes the wrong argument;
3. every packet, artifact, HEAD, index, twelve-hash and Vitest-help comparison
   is an **executable gate with a raw status receipt**, not a paragraph telling
   the operator to check something;
4. the two temporary sources are installed from **hashed patch artifacts** with
   `git apply --check` before `git apply`, and both `cp -p` backups are restored
   unconditionally on every normal and signal exit;
5. mutants 1–7 are **real**: each is an anchor-bound, byte-exact, single-site
   replacement performed by the hashed mutation helper on the installed
   temporary source, run against an exact named title, required to select at
   least one test and to fail with its exact intended text;
6. the manifest is **built from raw evidence** by the hashed builder, not
   assembled by the operator;
7. the final process-tree check inspects **exactly the tracked descendant
   PIDs/PGIDs**. The first draft's host-wide `pgrep -f "…|T1-3worker-ab"` matches
   the wrapper itself, this file open in an editor, and any unrelated work on
   the machine — it could never have passed.

Correction 3 supersedes the above where the two Sol xHigh final reviews found
deterministic defects, and binds these further rules. **The wrapper
`run-claude-T1-3worker-ab-diagnostic.sh` is the single executable truth.** This
ledger is the reviewable expansion of what it runs; where the two could differ,
the wrapper is authoritative and this document is a defect to be corrected.

8. **One unique run directory.** Every receipt named below lives in
   `$T1_RUN_DIR`, an exclusively created `T1-3worker-ab-run-<32 hex>` directory
   under the mission logs directory — never at a fixed path in the logs root.
   Wherever a command below writes `$T1_LOGS/T1-3worker-ab-<name>.<ext>`, read
   it as `$T1_RUN_DIR/T1-3worker-ab-<name>.<ext>`.
9. **Every status is run-bound.** A `.status` receipt is exactly
   `<integer> <64-hex run commitment>`, one line. `print -r -- "$?"` alone is no
   longer a lawful status, and `grep -qx 0` is replaced by `grep -q "^0 "`.
   Every cell report carries the same `runCommitment`.
10. **Real process identity.** Cells are launched through the wrapper's embedded
    Python supervisor, which calls `os.setsid()` and then `os.execvp()`; the
    wrapper reads back the published identity and asserts `pgid == pid`,
    `pgid != wrapperPgid`, and that the pid still leads that group before the
    cell is accepted. Signals go only to a still-live, currently verified group
    in the ACTIVE table; an identity leaves that table the instant its child is
    reaped, and a completed numeric PID/PGID is never signalled again.
11. **Closed inventory, not a prefix sweep.** The manifest builder derives the
    expected receipt set from the frozen schedule and compares it to a separate
    directory listing. The adjudicator recomputes that expected set for itself
    and reads each stream by name. Nothing enumerates `T1-3worker-ab-*` across
    the logs root, so support sources, patches, packets and author transcripts
    are never scanned as run evidence.
12. **Two-stage adjudication.** The adjudicator validates the closed inventory
    and exits; the wrapper then runs a terminal scanner over exactly the
    adjudicator's stdout, stderr and raw status. The scanner's verdict is a
    fixed code in private scratch, never a durable receipt, so adjudication
    cannot recurse into itself.
13. **Exact markers.** No prefix wildcard. Status 0 with exactly one of the four
    byte-exact scientific markers is the only scientific success; status 2 maps
    only to one lawful `CODEX BLOCKED (...)` and can never become wrapper status
    0; status 3 is always `rss-safety`.
14. **Mutants 1–7 stop at once** on a survivor, a zero selection or the wrong
    intended failure. Nothing is deferred to adjudication.

It becomes runnable only after two Sol xHigh reviewers approve the exact source
of all eight artifacts and V approves execution with the finalized hashes
recorded in an external launch-authority file. Nothing here selects three
workers for production, amends policy, clears the historical 973.0/1,264.7 ms
N=3 failures, ratifies an RSS bound, or approves Rework7-A.

## 1. Wrapper-owned environment

Established by `run-claude-T1-3worker-ab-diagnostic.sh` before section 2 and
owned until the runner exits. The runner implements — not describes — signal
traps, descendant tracking, TERM/KILL/reap ordering, the 512 MiB stop,
unconditional restoration and the final status override.

```zsh
#!/bin/zsh
set -u
setopt pipefail
unsetopt err_exit          # every cell's raw status must be captured, not fatal

T1_OUTER_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO"
T1_CHECKOUT_ROOT="$T1_OUTER_ROOT/dialectical-engine"
T1_LOGS="$T1_CHECKOUT_ROOT/docs/missions/2026-08-17-accounts-privacy-security/logs"

[[ -d "$T1_OUTER_ROOT/.git" ]] || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }
[[ -d "$T1_CHECKOUT_ROOT/apps" && -d "$T1_CHECKOUT_ROOT/tests" && -d "$T1_LOGS" ]] \
  || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }
cd "$T1_CHECKOUT_ROOT" || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }

T1_HEAD="9801f85d97e4263a7c8311304e29d6a03c4a6d15"
T1_NODE_VERSION="v22.23.1"
T1_INTEGRATION_FILE="tests/integration/registration-database.test.ts"
T1_ARCHITECTURE_FILE="tests/architecture/t1-argon2-worker-contract.test.ts"

T1_TITLE_INTEGRATION="T1 N3 AB three-worker credential concurrency diagnostic"
T1_TITLE_RESOURCE="T1 N3 AB architecture resource cell"
T1_TITLE_POSITIVE_CONTROL="T1 N3 AB retained allocation positive control"
T1_TITLE_FAULT_UNCONFIRMED="T1 N3 AB fault unconfirmed death"
T1_TITLE_FAULT_LATE_EXIT="T1 N3 AB fault late exit before close"
T1_TITLE_FAULT_RETRY="T1 N3 AB fault close-time termination retry fulfilled"

# An ARRAY. Never a scalar relying on word splitting.
T1_VITEST_FLAGS=(
  --pool=forks
  --poolOptions.forks.singleFork=true
  --no-file-parallelism
  --reporter=verbose
)

T1_TMP="$(mktemp -d "${TMPDIR:-/tmp}/t1-n3-ab-XXXXXXXX")"
chmod 700 "$T1_TMP"
T1_CARRIER="$T1_TMP/generated-literals.txt"          # mode 0600, never durable

# The unique, exclusively created run directory and the run commitment. `mkdir`
# without -p fails if the directory exists, so a run can never land in another
# run's receipts, and no fixed receipt name is reused outside this directory.
T1_RUN_ID="$(/usr/bin/python3 -c 'import secrets;print(secrets.token_hex(16))')"
T1_RUN_DIR="$T1_LOGS/T1-3worker-ab-run-$T1_RUN_ID"
mkdir "$T1_RUN_DIR" || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }
T1_RUN_COMMITMENT="$(/usr/bin/python3 -c 'import secrets;print(secrets.token_hex(32))')"
export T1_N3_AB_RUN_COMMITMENT="$T1_RUN_COMMITMENT"
/usr/bin/python3 -c 'import time;print(time.time_ns())' \
  > "$T1_RUN_DIR/T1-3worker-ab-run-preflight-epoch.out"
```

Every cell is launched through the wrapper's embedded Python session
supervisor, never through a `( setopt monitor; exec ... ) &` subshell. The
supervisor calls `os.setsid()` and then `os.execvp()`, so the exec keeps the
launched pid and the group the wrapper later signals is provably the cell's own
subtree and not the wrapper's:

```zsh
T1_N3_AB_IDENTITY_PATH="$T1_TMP/identity-<cell>.txt" /usr/bin/python3 \
  "$T1_TMP/t1-supervisor.py" env T1_N3_AB_WORKERS=<n> T1_N3_AB_CELL_ID=<cell> <command...> &
# read back PID/PGID; require pgid == pid, pgid != wrapper pgid, pid still leads
# that group; otherwise track the direct child only and block custody.
```

Every status receipt is written with the run commitment beside the raw integer,
so the report/status pair is bound to this run:

```zsh
t1_write_status() { print -r -- "$1 $T1_RUN_COMMITMENT" > "$T1_RUN_DIR/T1-3worker-ab-$2.status" }
```

`$T1_SHA` is NOT a literal in this file. It is read out of the external
launch-authority file V approved, and exported as `T1_N3_AB_PACKET_SHA256`:

```zsh
T1_AUTHORITY="$1"
[[ -r "$T1_AUTHORITY" ]] || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }
T1_SHA=$(/usr/bin/sed -n 's/.*"packetSha256"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{64\}\)".*/\1/p' "$T1_AUTHORITY" | head -n 1)
[[ ${#T1_SHA} -eq 64 ]] || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }
export T1_N3_AB_PACKET_SHA256="$T1_SHA"
```

The stop-rule guard every executed cell is followed by. Status 3 is the ruled
512 MiB safety stop and is never mislabelled `normal-cell`:

```zsh
t1_guard() {
  # A Vitest-hosted cell cannot hand its child's exit code to the runner, so the
  # structured safety line in that cell's own stdout is equally authoritative.
  # Neither signal is ever mislabelled `normal-cell`.
  if grep -qF "[T1_N3_AB_RSS_SAFETY_EXCEEDED]" "$T1_RUN_DIR/T1-3worker-ab-$1.out"; then
    t1_block "rss-safety"; t1_finish
  fi
  case "${$(cat "$T1_RUN_DIR/T1-3worker-ab-$1.status")%% *}" in
    0) return 0 ;;
    3) t1_block "rss-safety"; t1_finish ;;
    *) t1_block "normal-cell"; t1_finish ;;
  esac
}
```

Every command below is foreground, captures complete stdout and complete stderr
into separate files, and writes its raw exit status into a third file. Every
executed cell runs in its own process group so the whole subtree can be
signalled and reaped as a unit.

## 2. Frozen preflight

```zsh
git rev-parse --show-toplevel > "$T1_LOGS/T1-3worker-ab-preflight-toplevel.out" 2> "$T1_LOGS/T1-3worker-ab-preflight-toplevel.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-toplevel.status"
grep -qx "$T1_OUTER_ROOT" "$T1_LOGS/T1-3worker-ab-preflight-toplevel.out" || { t1_block custody; t1_finish }
print -r -- "$PWD" > "$T1_LOGS/T1-3worker-ab-preflight-checkout.out"
grep -qx "$T1_CHECKOUT_ROOT" "$T1_LOGS/T1-3worker-ab-preflight-checkout.out" || { t1_block custody; t1_finish }
```

```zsh
git rev-parse HEAD > "$T1_LOGS/T1-3worker-ab-preflight-head.out" 2> "$T1_LOGS/T1-3worker-ab-preflight-head.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-head.status"
grep -qx "$T1_HEAD" "$T1_LOGS/T1-3worker-ab-preflight-head.out" || { t1_block custody; t1_finish }
```

```zsh
git diff --cached --name-only > "$T1_LOGS/T1-3worker-ab-preflight-index.out" 2> "$T1_LOGS/T1-3worker-ab-preflight-index.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-index.status"
[[ -s "$T1_LOGS/T1-3worker-ab-preflight-index.out" ]] && { t1_block custody; t1_finish }
```

```zsh
shasum -a 256 apps/api/src/index.ts apps/api/src/main.ts apps/api/src/registration.ts packages/crypto/src/index.ts packages/crypto/src/argon2-worker.ts packages/crypto/src/argon2-worker-pool.ts packages/db/src/identity.ts packages/register/src/auth-policy.ts tests/integration/registration-database.test.ts tests/unit/registration.test.ts tests/unit/argon2-worker-pool.test.ts tests/architecture/t1-argon2-worker-contract.test.ts > "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" 2> "$T1_LOGS/T1-3worker-ab-preflight-hashes.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-hashes.status"
[[ $(wc -l < "$T1_LOGS/T1-3worker-ab-preflight-hashes.out") -eq 12 ]] || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-preflight-hashes.status" || { t1_block custody; t1_finish }
```

Each of the twelve is compared to its frozen value as an executable gate, not as
prose. The design packet's section 2 list is reproduced here so the comparison
is mechanical:

```zsh
grep -qx "0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
grep -qx "3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts" "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" || { t1_block custody; t1_finish }
```

The authorized entry baseline. Final custody is "this baseline plus the named
new receipts", never "an absolutely clean worktree" — this tree legitimately
carries prior unstaged mission work:

```zsh
git status --porcelain > "$T1_LOGS/T1-3worker-ab-entry-worktree-baseline.out" 2> "$T1_LOGS/T1-3worker-ab-entry-worktree-baseline.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-entry-worktree-baseline.status"
```

Packet and artifact custody, both bound to the external authority:

```zsh
shasum -a 256 "$T1_LOGS/T1-claude-3worker-ab-draft-packet.md" > "$T1_LOGS/T1-3worker-ab-preflight-packet.out" 2> "$T1_LOGS/T1-3worker-ab-preflight-packet.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-packet.status"
grep -q "$T1_SHA" "$T1_LOGS/T1-3worker-ab-preflight-packet.out" || { t1_block custody; t1_finish }
```

```zsh
: > "$T1_LOGS/T1-3worker-ab-preflight-artifacts.out"
for artifact in T1-3worker-ab-booted-rss-harness.mjs T1-3worker-ab-adjudicator.mjs T1-3worker-ab-command-matrix.md T1-3worker-ab-integration.patch T1-3worker-ab-architecture.patch T1-3worker-ab-mutation-helper.mjs T1-3worker-ab-manifest-builder.mjs run-claude-T1-3worker-ab-diagnostic.sh; do
  observed=$(shasum -a 256 "$T1_LOGS/$artifact" | cut -d' ' -f1)
  print -r -- "$observed  $artifact" >> "$T1_LOGS/T1-3worker-ab-preflight-artifacts.out"
  grep -q "\"$artifact\"[[:space:]]*:[[:space:]]*\"$observed\"" "$T1_AUTHORITY" || { t1_block custody; t1_finish }
done
print -r -- "0" > "$T1_LOGS/T1-3worker-ab-preflight-artifacts.status"
```

```zsh
node --version > "$T1_LOGS/T1-3worker-ab-preflight-node.out" 2> "$T1_LOGS/T1-3worker-ab-preflight-node.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-node.status"
grep -qx "$T1_NODE_VERSION" "$T1_LOGS/T1-3worker-ab-preflight-node.out" || { t1_block custody; t1_finish }
```

Every Vitest flag asserted against the pinned runner's own help output. A flag
that is absent is a launch-prep correction to this matrix decided before any
cell runs, never a silent substitution during the run:

```zsh
pnpm exec vitest --help > "$T1_LOGS/T1-3worker-ab-preflight-vitest-flags.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-vitest-flags.status"
grep -q -- "--pool" "$T1_LOGS/T1-3worker-ab-preflight-vitest-flags.out" || { t1_block custody; t1_finish }
grep -q -- "--poolOptions" "$T1_LOGS/T1-3worker-ab-preflight-vitest-flags.out" || { t1_block custody; t1_finish }
grep -q -- "--no-file-parallelism" "$T1_LOGS/T1-3worker-ab-preflight-vitest-flags.out" || { t1_block custody; t1_finish }
grep -q -- "--reporter" "$T1_LOGS/T1-3worker-ab-preflight-vitest-flags.out" || { t1_block custody; t1_finish }
```

```zsh
node --check "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-harness.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-harness.status"
node --check "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-adjudicator.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-adjudicator.status"
node --check "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-helper.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-helper.status"
node --check "$T1_LOGS/T1-3worker-ab-manifest-builder.mjs" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-builder.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-syntax-builder.status"
zsh -n "$T1_LOGS/run-claude-T1-3worker-ab-diagnostic.sh" > "$T1_LOGS/T1-3worker-ab-preflight-wrapper-syntax.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-preflight-wrapper-syntax.status"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-preflight-syntax-harness.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-preflight-syntax-adjudicator.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-preflight-syntax-helper.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-preflight-syntax-builder.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-preflight-wrapper-syntax.status" || { t1_block custody; t1_finish }
```

## 3. The two `cp -p` backups and verified trap arming

Taken only after the whole of section 2 passed, so a backup can never be made
from a tree that had already drifted.

```zsh
cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/registration-database.test.ts.bak"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-backup-integration.status"
cp -p "$T1_ARCHITECTURE_FILE" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-backup-architecture.status"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-backup-integration.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-backup-architecture.status" || { t1_block custody; t1_finish }
shasum -a 256 "$T1_TMP/registration-database.test.ts.bak" > "$T1_LOGS/T1-3worker-ab-backup-hash-registration-database.out"
shasum -a 256 "$T1_TMP/t1-argon2-worker-contract.test.ts.bak" > "$T1_LOGS/T1-3worker-ab-backup-hash-t1-argon2-worker-contract.out"
grep -q "7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58" "$T1_LOGS/T1-3worker-ab-backup-hash-registration-database.out" || { t1_block custody; t1_finish }
grep -q "3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1" "$T1_LOGS/T1-3worker-ab-backup-hash-t1-argon2-worker-contract.out" || { t1_block custody; t1_finish }
```

```zsh
trap 't1_finish custody' INT TERM HUP QUIT
trap 't1_finish custody' EXIT
trap -p INT > "$T1_LOGS/T1-3worker-ab-trap-arming.out" 2>&1
trap -p TERM >> "$T1_LOGS/T1-3worker-ab-trap-arming.out" 2>&1
trap -p EXIT >> "$T1_LOGS/T1-3worker-ab-trap-arming.out" 2>&1
grep -q "t1_finish" "$T1_LOGS/T1-3worker-ab-trap-arming.out" || { t1_block custody; t1_finish }
```

## 4. Temporary source installation from hashed patches

The two `.patch` artifacts apply cleanly, and only, to the frozen integration
and architecture hashes above. `--check` first, so a drifted tree is a refusal
rather than a half-applied edit.

```zsh
shasum -a 256 "$T1_LOGS/T1-3worker-ab-integration.patch" > "$T1_LOGS/T1-3worker-ab-temp-patch-hash-registration-database.out"
shasum -a 256 "$T1_LOGS/T1-3worker-ab-architecture.patch" > "$T1_LOGS/T1-3worker-ab-temp-patch-hash-t1-argon2-worker-contract.out"
git apply --check "$T1_LOGS/T1-3worker-ab-integration.patch" > "$T1_LOGS/T1-3worker-ab-apply-check-integration.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-apply-check-integration.status"
git apply --check "$T1_LOGS/T1-3worker-ab-architecture.patch" > "$T1_LOGS/T1-3worker-ab-apply-check-architecture.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-apply-check-architecture.status"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-apply-check-integration.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-apply-check-architecture.status" || { t1_block custody; t1_finish }
git apply "$T1_LOGS/T1-3worker-ab-integration.patch" > "$T1_LOGS/T1-3worker-ab-apply-integration.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-apply-integration.status"
git apply "$T1_LOGS/T1-3worker-ab-architecture.patch" > "$T1_LOGS/T1-3worker-ab-apply-architecture.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-apply-architecture.status"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-apply-integration.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-apply-architecture.status" || { t1_block custody; t1_finish }
shasum -a 256 "$T1_INTEGRATION_FILE" "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-installed-source-hashes.out"
cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/installed-integration.ts"
cp -p "$T1_ARCHITECTURE_FILE" "$T1_TMP/installed-architecture.ts"
```

The generated literals the run will produce are written to the mode-0600
carrier inside `$T1_TMP`, and nowhere else. They never reach a durable receipt,
never reach the manifest, and are destroyed after adjudication:

```zsh
{ print -r -- "correct horse battery staple"; print -r -- "t1-n3ab-"; print -r -- "vitest-s3b-timing-seed"; print -r -- "vitest-s3b-timing-existing"; print -r -- "vitest-s3b-timing-missing"; for index in 0 1 2; do print -r -- "t1-n3ab-n3-existing-${index}@example.test"; done; for wave in 0 1 2 3; do for index in 0 1 2; do print -r -- "t1-n3ab-n3-missing-${wave}-${index}@example.test"; done; done } > "$T1_CARRIER"
chmod 600 "$T1_CARRIER"
```

## 5. The twenty integration cells

Ten adjacent pairs, alternating which arm runs first. Each is one fresh
foreground process owning its own embedded PostgreSQL. There is no rerun of a
failed cell in this seat.

```zsh
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p01-a0-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p01-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p01-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p01-a0-w2.status"; t1_guard integration-p01-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p01-a1-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p01-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p01-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p01-a1-w3.status"; t1_guard integration-p01-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p02-a0-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p02-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p02-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p02-a0-w3.status"; t1_guard integration-p02-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p02-a1-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p02-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p02-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p02-a1-w2.status"; t1_guard integration-p02-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p03-a0-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p03-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p03-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p03-a0-w2.status"; t1_guard integration-p03-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p03-a1-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p03-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p03-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p03-a1-w3.status"; t1_guard integration-p03-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p04-a0-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p04-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p04-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p04-a0-w3.status"; t1_guard integration-p04-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p04-a1-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p04-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p04-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p04-a1-w2.status"; t1_guard integration-p04-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p05-a0-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p05-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p05-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p05-a0-w2.status"; t1_guard integration-p05-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p05-a1-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p05-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p05-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p05-a1-w3.status"; t1_guard integration-p05-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p06-a0-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p06-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p06-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p06-a0-w3.status"; t1_guard integration-p06-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p06-a1-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p06-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p06-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p06-a1-w2.status"; t1_guard integration-p06-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p07-a0-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p07-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p07-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p07-a0-w2.status"; t1_guard integration-p07-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p07-a1-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p07-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p07-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p07-a1-w3.status"; t1_guard integration-p07-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p08-a0-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p08-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p08-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p08-a0-w3.status"; t1_guard integration-p08-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p08-a1-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p08-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p08-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p08-a1-w2.status"; t1_guard integration-p08-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p09-a0-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p09-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p09-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p09-a0-w2.status"; t1_guard integration-p09-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p09-a1-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p09-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p09-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p09-a1-w3.status"; t1_guard integration-p09-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=integration-p10-a0-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p10-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p10-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p10-a0-w3.status"; t1_guard integration-p10-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=integration-p10-a1-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-integration-p10-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-integration-p10-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-integration-p10-a1-w2.status"; t1_guard integration-p10-a1-w2
```

## 6. The four architecture resource cells

Two non-statistical adjacent pairs, in the exact order 2, 3, 3, 2. These four
values establish resource and lifecycle non-vacuity and descriptive RSS only.
They enter no sign test and no causal terminal decision.

```zsh
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=architecture-r1-a0-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-architecture-r1-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-architecture-r1-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-architecture-r1-a0-w2.status"; t1_guard architecture-r1-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=architecture-r1-a1-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-architecture-r1-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-architecture-r1-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-architecture-r1-a1-w3.status"; t1_guard architecture-r1-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=architecture-r2-a0-w3 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-architecture-r2-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-architecture-r2-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-architecture-r2-a0-w3.status"; t1_guard architecture-r2-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=architecture-r2-a1-w2 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-architecture-r2-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-architecture-r2-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-architecture-r2-a1-w2.status"; t1_guard architecture-r2-a1-w2
```

## 7. The named deterministic architecture fault cells

Three-worker only. These use shortened test-only `closeDrainMs` and
termination-confirm deadlines; production defaults are unchanged.

```zsh
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=fault-unconfirmed-death NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_FAULT_UNCONFIRMED" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-fault-unconfirmed-death.out" 2> "$T1_LOGS/T1-3worker-ab-fault-unconfirmed-death.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-fault-unconfirmed-death.status"; t1_guard fault-unconfirmed-death
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=fault-late-exit-before-close NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_FAULT_LATE_EXIT" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-fault-late-exit-before-close.out" 2> "$T1_LOGS/T1-3worker-ab-fault-late-exit-before-close.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-fault-late-exit-before-close.status"; t1_guard fault-late-exit-before-close
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=fault-close-time-termination-retry-fulfilled NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_FAULT_RETRY" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-fault-close-time-termination-retry-fulfilled.out" 2> "$T1_LOGS/T1-3worker-ab-fault-close-time-termination-retry-fulfilled.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-fault-close-time-termination-retry-fulfilled.status"; t1_guard fault-close-time-termination-retry-fulfilled
```

## 8. Retained-allocation positive control

Retains 4 MiB per wave and must drive the unchanged 2 MiB last-four-wave plateau
detector RED. A green control means the tripwire is measuring nothing, and the
resource readings above become uninterpretable.

```zsh
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=positive-control-retain-4mib T1_N3_AB_RETAIN_MIB_PER_WAVE=4 NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_POSITIVE_CONTROL" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-positive-control-retain-4mib.out" 2> "$T1_LOGS/T1-3worker-ab-positive-control-retain-4mib.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-positive-control-retain-4mib.status"; t1_guard positive-control-retain-4mib
```

## 9. The twenty standalone booted RSS cells

Same frozen AB, BA x5 order as the integration series. Each is one plain Node
process with no test runner resident — the provenance class the 368.7 MiB
Vitest figure is not, and the 315.3/327.1 MiB observations are.

```zsh
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p01-a0-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p01-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p01-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p01-a0-w2.status"; t1_guard standalone-p01-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p01-a1-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p01-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p01-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p01-a1-w3.status"; t1_guard standalone-p01-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p02-a0-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p02-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p02-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p02-a0-w3.status"; t1_guard standalone-p02-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p02-a1-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p02-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p02-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p02-a1-w2.status"; t1_guard standalone-p02-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p03-a0-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p03-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p03-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p03-a0-w2.status"; t1_guard standalone-p03-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p03-a1-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p03-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p03-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p03-a1-w3.status"; t1_guard standalone-p03-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p04-a0-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p04-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p04-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p04-a0-w3.status"; t1_guard standalone-p04-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p04-a1-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p04-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p04-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p04-a1-w2.status"; t1_guard standalone-p04-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p05-a0-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p05-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p05-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p05-a0-w2.status"; t1_guard standalone-p05-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p05-a1-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p05-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p05-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p05-a1-w3.status"; t1_guard standalone-p05-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p06-a0-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p06-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p06-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p06-a0-w3.status"; t1_guard standalone-p06-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p06-a1-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p06-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p06-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p06-a1-w2.status"; t1_guard standalone-p06-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p07-a0-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p07-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p07-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p07-a0-w2.status"; t1_guard standalone-p07-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p07-a1-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p07-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p07-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p07-a1-w3.status"; t1_guard standalone-p07-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p08-a0-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p08-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p08-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p08-a0-w3.status"; t1_guard standalone-p08-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p08-a1-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p08-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p08-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p08-a1-w2.status"; t1_guard standalone-p08-a1-w2
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p09-a0-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p09-a0-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p09-a0-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p09-a0-w2.status"; t1_guard standalone-p09-a0-w2
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p09-a1-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p09-a1-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p09-a1-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p09-a1-w3.status"; t1_guard standalone-p09-a1-w3
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=standalone-p10-a0-w3 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p10-a0-w3.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p10-a0-w3.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p10-a0-w3.status"; t1_guard standalone-p10-a0-w3
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=standalone-p10-a1-w2 node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs" > "$T1_LOGS/T1-3worker-ab-standalone-p10-a1-w2.out" 2> "$T1_LOGS/T1-3worker-ab-standalone-p10-a1-w2.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-standalone-p10-a1-w2.status"; t1_guard standalone-p10-a1-w2
```

## 10. Vitest mutants 1-7

Each mutant is an anchor-bound, byte-exact, single-site replacement performed by
the hashed mutation helper on a pre-image copy of the INSTALLED temporary
source, written back over that source. The helper refuses zero matches, multiple
matches and any unexpected before-bytes, so a silent multi-site or drifted
replacement is impossible rather than merely unlikely.

Each block: hash the pre-image, mutate, run the exact named title, require a
nonzero status and the exact intended failure text, restore from the pre-image,
and verify hash, size, mtime and `cmp`.

### Mutant 01 — report the enqueue stamp as the dispatch stamp

Intended named failure: `T1_N3_AB_QUEUE_OBSERVED_BUT_NO_DWELL`. Run at two
workers, where three credential jobs against two workers guarantee a queue: if
the pool observed a queued credential and every measured dwell is zero, the
enqueue stamp is not an enqueue stamp.

```zsh
cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-01-enqueue-reported-as-dispatch-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-01-enqueue-reported-as-dispatch-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-01-enqueue-reported-as-dispatch-preimage.ts" --destination "$T1_INTEGRATION_FILE" --anchor "T1-N3-AB-ANCHOR-M1-ENQUEUE-STAMP" --expected "        const enqueuedAt = enqueueAt.get(job.id);" --replacement "        const enqueuedAt = dispatchAt.get(job.id);" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-mutate.status"
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=mutant-01-enqueue-reported-as-dispatch NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch.status"
cp -p "$T1_TMP/mutant-01-enqueue-reported-as-dispatch-preimage.ts" "$T1_INTEGRATION_FILE"; cmp "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-01-enqueue-reported-as-dispatch-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-restore.status"; shasum -a 256 "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-01-enqueue-reported-as-dispatch.status" && { t1_block mutant; t1_finish }
```

### Mutant 02 — report the settlement stamp as the dispatch stamp

Intended named failure: `T1_N3_AB_SERVICE_ENVELOPE_POSITIVE`.

```zsh
cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-02-settlement-reported-as-dispatch-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-02-settlement-reported-as-dispatch-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-02-settlement-reported-as-dispatch-preimage.ts" --destination "$T1_INTEGRATION_FILE" --anchor "T1-N3-AB-ANCHOR-M2-SETTLE-STAMP" --expected "        const settledAt = performance.now();" --replacement "        const settledAt = dispatchAt.get(job.id) ?? performance.now();" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-mutate.status"
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=mutant-02-settlement-reported-as-dispatch NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch.status"
cp -p "$T1_TMP/mutant-02-settlement-reported-as-dispatch-preimage.ts" "$T1_INTEGRATION_FILE"; cmp "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-02-settlement-reported-as-dispatch-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-restore.status"; shasum -a 256 "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-02-settlement-reported-as-dispatch.status" && { t1_block mutant; t1_finish }
```

### Mutant 03 — omit one credential job from the anonymous ordinal map

Intended named failure: `T1_N3_AB_ORDINAL_MAP_COVERS_EVERY_CREDENTIAL_JOB`.

```zsh
cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-03-omit-one-credential-job-from-ordinal-map-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-03-omit-one-credential-job-from-ordinal-map-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-03-omit-one-credential-job-from-ordinal-map-preimage.ts" --destination "$T1_INTEGRATION_FILE" --anchor "T1-N3-AB-ANCHOR-M3-ORDINAL-MAP" --expected '      if (recording && lane === "credential" && scope !== undefined) {' --replacement '      if (recording && lane === "credential" && scope !== undefined && scope.ordinal !== 0) {' > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-mutate.status"
env T1_N3_AB_WORKERS=2 T1_N3_AB_CELL_ID=mutant-03-omit-one-credential-job-from-ordinal-map NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map.status"
cp -p "$T1_TMP/mutant-03-omit-one-credential-job-from-ordinal-map-preimage.ts" "$T1_INTEGRATION_FILE"; cmp "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-03-omit-one-credential-job-from-ordinal-map-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-restore.status"; shasum -a 256 "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-03-omit-one-credential-job-from-ordinal-map.status" && { t1_block mutant; t1_finish }
```

### Mutant 04 — secretly keep two workers in the three-worker cell

Intended named failure: `T1_N3_AB_WORKER_COUNT_NOT_HONOURED`.

```zsh
cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-04-secretly-keep-two-workers-in-three-worker-cell-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-04-secretly-keep-two-workers-in-three-worker-cell-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-04-secretly-keep-two-workers-in-three-worker-cell-preimage.ts" --destination "$T1_INTEGRATION_FILE" --anchor "T1-N3-AB-ANCHOR-M4-WORKER-COUNT" --expected "  if (argon2Pool === undefined) argon2Pool = new Argon2WorkerPool({ workers: T1_N3_AB_WORKERS });" --replacement "  if (argon2Pool === undefined) argon2Pool = new Argon2WorkerPool({ workers: 2 });" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-mutate.status"
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=mutant-04-secretly-keep-two-workers-in-three-worker-cell NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell.status"
cp -p "$T1_TMP/mutant-04-secretly-keep-two-workers-in-three-worker-cell-preimage.ts" "$T1_INTEGRATION_FILE"; cmp "$T1_INTEGRATION_FILE" "$T1_TMP/mutant-04-secretly-keep-two-workers-in-three-worker-cell-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-restore.status"; shasum -a 256 "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-04-secretly-keep-two-workers-in-three-worker-cell.status" && { t1_block mutant; t1_finish }
```

### Mutant 05 — harness control: the lifecycle observer reports `physicalAlive=4`

Harness sensitivity, not a product mutant. Intended named failure:
`T1_N3_AB_PHYSICAL_ALIVE_NEVER_EXCEEDS_THREE`.

```zsh
cp -p "$T1_ARCHITECTURE_FILE" "$T1_TMP/mutant-05-harness-control-physical-alive-four-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-05-harness-control-physical-alive-four-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-05-harness-control-physical-alive-four-preimage.ts" --destination "$T1_ARCHITECTURE_FILE" --anchor "T1-N3-AB-ANCHOR-M5-PHYSICAL-ALIVE" --expected "      const physicalAlive = spawned.filter((handle) => !handle.exited).length;" --replacement "      const physicalAlive = 4;" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-mutate.status"
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=mutant-05-harness-control-physical-alive-four NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_FAULT_UNCONFIRMED" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four.status"
cp -p "$T1_TMP/mutant-05-harness-control-physical-alive-four-preimage.ts" "$T1_ARCHITECTURE_FILE"; cmp "$T1_ARCHITECTURE_FILE" "$T1_TMP/mutant-05-harness-control-physical-alive-four-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-restore.status"; shasum -a 256 "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-05-harness-control-physical-alive-four.status" && { t1_block mutant; t1_finish }
```

### Mutant 06 — sample RSS only after settlement

Intended named failure: `T1_N3_AB_RSS_SAMPLED_IN_FLIGHT`. A wave whose in-flight
peak is below its own quiescent reading never observed the working set.

```zsh
cp -p "$T1_ARCHITECTURE_FILE" "$T1_TMP/mutant-06-sample-rss-only-after-settlement-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-06-sample-rss-only-after-settlement-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-06-sample-rss-only-after-settlement-preimage.ts" --destination "$T1_ARCHITECTURE_FILE" --anchor "T1-N3-AB-ANCHOR-M6-RSS-SAMPLE" --expected "          wavePeak = Math.max(wavePeak, observeRss());" --replacement "          wavePeak = Math.max(wavePeak, 0);" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-mutate.status"
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=mutant-06-sample-rss-only-after-settlement NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement.status"
cp -p "$T1_TMP/mutant-06-sample-rss-only-after-settlement-preimage.ts" "$T1_ARCHITECTURE_FILE"; cmp "$T1_ARCHITECTURE_FILE" "$T1_TMP/mutant-06-sample-rss-only-after-settlement-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-restore.status"; shasum -a 256 "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-06-sample-rss-only-after-settlement.status" && { t1_block mutant; t1_finish }
```

### Mutant 07 — skip one worker warm-up

Intended named failure: `T1_N3_AB_WARM_UP_COVERED_EVERY_WORKER`.

```zsh
cp -p "$T1_ARCHITECTURE_FILE" "$T1_TMP/mutant-07-skip-one-worker-warm-up-preimage.ts"; shasum -a 256 "$T1_TMP/mutant-07-skip-one-worker-warm-up-preimage.ts" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-preimage-hash.out"
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_TMP/mutant-07-skip-one-worker-warm-up-preimage.ts" --destination "$T1_ARCHITECTURE_FILE" --anchor "T1-N3-AB-ANCHOR-M7-WARM-UP" --expected "      const warmUpCount = workers;" --replacement "      const warmUpCount = workers - 1;" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-mutate.status"
env T1_N3_AB_WORKERS=3 T1_N3_AB_CELL_ID=mutant-07-skip-one-worker-warm-up NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up.status"
cp -p "$T1_TMP/mutant-07-skip-one-worker-warm-up-preimage.ts" "$T1_ARCHITECTURE_FILE"; cmp "$T1_ARCHITECTURE_FILE" "$T1_TMP/mutant-07-skip-one-worker-warm-up-preimage.ts"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-restore.status"; shasum -a 256 "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-restore-hash.out"; stat -f "%N size=%z mtime=%m" "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-restore-stat.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up-restore.status" || { t1_block restoration; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-07-skip-one-worker-warm-up.status" && { t1_block mutant; t1_finish }
```

A missing, malformed or absent status is never equivalent to a valid nonzero
mutant failure: the manifest builder refuses an empty, whitespace-only or
non-integer status outright, and the adjudicator never sees the mutant as
killed. Selected-test counts and intended-failure text are read out of these
receipts by the builder, not asserted by an operator.

## 11. Adjudicator clean control and mutants 8-10

The clean control runs the real adjudicator's in-memory self-test. It must exit
0 and name every guard it exercised.

```zsh
node "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" --self-test > "$T1_LOGS/T1-3worker-ab-adjudicator-clean-self-test.out" 2> "$T1_LOGS/T1-3worker-ab-adjudicator-clean-self-test.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-adjudicator-clean-self-test.status"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-adjudicator-clean-self-test.status" || { t1_block mutant; t1_finish }
```

Mutants 8-10 mutate a TEMPORARY COPY under `$T1_TMP`. The governed adjudicator
in the mission logs directory is never edited, and the `cmp` after each is
deliberately inverted: a status of 0 would mean the mutation had been written
back over the governed file.

### Mutant 08 — accept a ratified or current RSS label

Intended named failure:
`guard-fires:every-rss-bound-labelled-unratified-candidate`.

```zsh
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" --destination "$T1_TMP/mutant-08-label-candidate-rss-bound-ratified.mjs" --anchor "T1-N3-AB-ANCHOR-M8-RSS-LABEL" --expected "    if (report.rssBoundStatus !== REQUIRED_RSS_BOUND_LABEL) {" --replacement "    if (false) {" > "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified-mutate.status"
node "$T1_TMP/mutant-08-label-candidate-rss-bound-ratified.mjs" --self-test > "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified.status"
cmp "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" "$T1_TMP/mutant-08-label-candidate-rss-bound-ratified.mjs" > "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified-governed-untouched.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified-governed-untouched.status"
grep -qx 1 "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified-governed-untouched.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-08-label-candidate-rss-bound-ratified.status" && { t1_block mutant; t1_finish }
```

### Mutant 09 — map NOT REPRODUCED to the causal marker

Intended named failure: `not-reproduced-maps-to-ordinary-not-causal-marker`.
Dropping the historical-severity conjunct is precisely how a queue-signature
observation becomes a false claim about the 973.0/1,264.7 ms history.

```zsh
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" --destination "$T1_TMP/mutant-09-map-not-reproduced-to-causal-marker.mjs" --anchor "T1-N3-AB-ANCHOR-M9-CAUSAL-MARKER" --expected "  if (ordinarySignature && historicalRedReproduced) marker = SCIENTIFIC_MARKERS.reproduced;" --replacement "  if (ordinarySignature) marker = SCIENTIFIC_MARKERS.reproduced;" > "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker-mutate.status"
node "$T1_TMP/mutant-09-map-not-reproduced-to-causal-marker.mjs" --self-test > "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker.status"
cmp "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" "$T1_TMP/mutant-09-map-not-reproduced-to-causal-marker.mjs" > "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker-governed-untouched.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker-governed-untouched.status"
grep -qx 1 "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker-governed-untouched.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-09-map-not-reproduced-to-causal-marker.status" && { t1_block mutant; t1_finish }
```

### Mutant 10 — disable the full-receipt secret scan

Intended named failure: `guard-fires:no-generated-literal-in-receipt`. The
expected line contains a template literal and is passed exactly as written in
single quotes; the helper compares it byte for byte and refuses on any mismatch
rather than mutating an unintended line.

```zsh
node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" --source "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" --destination "$T1_TMP/mutant-10-disable-full-receipt-secret-scan.mjs" --anchor "T1-N3-AB-ANCHOR-M10-SECRET-SCAN" --expected '    const hits = scanReceiptBody(`${receipt.stdout}\n${receipt.stderr}`, literals, normalize);' --replacement "    const hits = [];" > "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan-mutate.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan-mutate.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan-mutate.status"
node "$T1_TMP/mutant-10-disable-full-receipt-secret-scan.mjs" --self-test > "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan.out" 2> "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan.status"
cmp "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" "$T1_TMP/mutant-10-disable-full-receipt-secret-scan.mjs" > "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan-governed-untouched.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan-governed-untouched.status"
grep -qx 1 "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan-governed-untouched.status" || { t1_block custody; t1_finish }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-mutant-10-disable-full-receipt-secret-scan.status" && { t1_block mutant; t1_finish }
```

## 12. Settle, reap, restore, verify custody

The exact order, and the order matters: descendants are settled and reaped
BEFORE restoration, restoration happens unconditionally, custody is verified
after restoration, and only then is any manifest built.

```zsh
t1_terminate_descendants
cp -p "$T1_TMP/registration-database.test.ts.bak" "$T1_INTEGRATION_FILE"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-restore-integration.status"
cp -p "$T1_TMP/t1-argon2-worker-contract.test.ts.bak" "$T1_ARCHITECTURE_FILE"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-restore-architecture.status"
cmp "$T1_INTEGRATION_FILE" "$T1_TMP/registration-database.test.ts.bak"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-restore-cmp-registration-database.status"
cmp "$T1_ARCHITECTURE_FILE" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-restore-cmp-t1-argon2-worker-contract.status"
shasum -a 256 "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-restore-hash-registration-database.out"
shasum -a 256 "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-restore-hash-t1-argon2-worker-contract.out"
stat -f "%N size=%z mtime=%m" "$T1_INTEGRATION_FILE" > "$T1_LOGS/T1-3worker-ab-restore-stat-registration-database.out"
stat -f "%N size=%z mtime=%m" "$T1_ARCHITECTURE_FILE" > "$T1_LOGS/T1-3worker-ab-restore-stat-t1-argon2-worker-contract.out"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-restore-cmp-registration-database.status" || { print -r -- "CODEX BLOCKED (restoration)"; exit 74 }
grep -qx 0 "$T1_LOGS/T1-3worker-ab-restore-cmp-t1-argon2-worker-contract.status" || { print -r -- "CODEX BLOCKED (restoration)"; exit 74 }
grep -q "7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58" "$T1_LOGS/T1-3worker-ab-restore-hash-registration-database.out" || { print -r -- "CODEX BLOCKED (restoration)"; exit 74 }
grep -q "3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1" "$T1_LOGS/T1-3worker-ab-restore-hash-t1-argon2-worker-contract.out" || { print -r -- "CODEX BLOCKED (restoration)"; exit 74 }
```

`stat -f` is the BSD/darwin spelling and this host family is darwin. On a GNU
host the equivalent is `stat -c "%n size=%s mtime=%Y"`. The spelling is fixed at
launch prep and recorded in the ledger; the matrix does not switch silently.

```zsh
git rev-parse HEAD > "$T1_LOGS/T1-3worker-ab-final-head.out" 2> "$T1_LOGS/T1-3worker-ab-final-head.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-final-head.status"
grep -qx "9801f85d97e4263a7c8311304e29d6a03c4a6d15" "$T1_LOGS/T1-3worker-ab-final-head.out" || { t1_block custody; t1_finish }
git diff --cached --name-only > "$T1_LOGS/T1-3worker-ab-final-index.out" 2> "$T1_LOGS/T1-3worker-ab-final-index.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-final-index.status"
[[ -s "$T1_LOGS/T1-3worker-ab-final-index.out" ]] && { t1_block custody; t1_finish }
shasum -a 256 apps/api/src/index.ts apps/api/src/main.ts apps/api/src/registration.ts packages/crypto/src/index.ts packages/crypto/src/argon2-worker.ts packages/crypto/src/argon2-worker-pool.ts packages/db/src/identity.ts packages/register/src/auth-policy.ts tests/integration/registration-database.test.ts tests/unit/registration.test.ts tests/unit/argon2-worker-pool.test.ts tests/architecture/t1-argon2-worker-contract.test.ts > "$T1_LOGS/T1-3worker-ab-final-hashes.out" 2> "$T1_LOGS/T1-3worker-ab-final-hashes.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-final-hashes.status"
cmp "$T1_LOGS/T1-3worker-ab-preflight-hashes.out" "$T1_LOGS/T1-3worker-ab-final-hashes.out" > "$T1_LOGS/T1-3worker-ab-final-hash-cmp.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-final-hash-cmp.status"
grep -qx 0 "$T1_LOGS/T1-3worker-ab-final-hash-cmp.status" || { t1_block custody; t1_finish }
git diff --check > "$T1_LOGS/T1-3worker-ab-final-whitespace.out" 2>&1; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-final-whitespace.status"
git status --porcelain > "$T1_LOGS/T1-3worker-ab-final-worktree.out" 2> "$T1_LOGS/T1-3worker-ab-final-worktree.err"; print -r -- "$?" > "$T1_LOGS/T1-3worker-ab-final-worktree.status"
```

The worktree comparison is `T1-3worker-ab-entry-worktree-baseline.out` plus the
explicitly named new run receipts under
`docs/missions/2026-08-17-accounts-privacy-security/logs/` with the
`T1-3worker-ab-` prefix. An absolutely clean worktree is NOT demanded: this tree
legitimately carries prior unstaged mission work. The manifest builder performs
that comparison and names any unexplained line.

Descendant custody. The tracked PIDs and PGIDs, and nothing else:

```zsh
t1_verify_descendants_gone
grep -q "TRACKED_DESCENDANTS_GONE=" "$T1_LOGS/T1-3worker-ab-final-descendants.out" || { t1_block custody; t1_finish }
grep -q "ALIVE" "$T1_LOGS/T1-3worker-ab-final-descendants.out" && { t1_block custody; t1_finish }
```

A host-wide `pgrep -f "vitest|embedded-postgres|postgres -D|T1-3worker-ab"` is
NOT used. It matches the wrapper itself, this file open in an editor, and any
unrelated Vitest or PostgreSQL on the machine, so it can only ever produce a
false custody failure or an ignored one.

## 13. Manifest, adjudication, and the single marker

```zsh
node "$T1_LOGS/T1-3worker-ab-manifest-builder.mjs" --run-dir "$T1_RUN_DIR" --artifacts "$T1_LOGS" --launch-authority "$T1_AUTHORITY" --literal-carrier "$T1_CARRIER" --run-commitment "$T1_RUN_COMMITMENT" --out "T1-3worker-ab-manifest.json" > "$T1_RUN_DIR/T1-3worker-ab-manifest-build.out" 2> "$T1_RUN_DIR/T1-3worker-ab-manifest-build.err"; t1_write_status "$?" "manifest-build"
print -r -- "manifest-build" >> "$T1_RUN_DIR/T1-3worker-ab-finalization-order.out"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-manifest-build.status" || { t1_block receipt; t1_finish }
```

Stage one. The adjudicator validates the closed inventory that existed before it
ran, and exits. It cannot adjudicate its own output:

```zsh
node "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" "T1-3worker-ab-run-$T1_RUN_ID/T1-3worker-ab-manifest.json" --literal-carrier "$T1_CARRIER" --run-commitment "$T1_RUN_COMMITMENT" > "$T1_RUN_DIR/T1-3worker-ab-adjudication.out" 2> "$T1_RUN_DIR/T1-3worker-ab-adjudication.err"; T1_ADJUDICATION_STATUS=$?
print -r -- "$T1_ADJUDICATION_STATUS $T1_RUN_COMMITMENT" > "$T1_RUN_DIR/T1-3worker-ab-adjudication.status"
```

Stage two. The terminal scanner validates exactly those three receipts —
ANSI-stripped fixed-string literal checks, the forbidden-shape policy, and the
exact marker/status mapping. `grep -F` alone is insufficient, so this is a
Python pass with the same policy the adjudicator applies. Its verdict is a fixed
code written to private scratch, never a durable receipt:

```zsh
/usr/bin/python3 - "$T1_RUN_DIR/T1-3worker-ab-adjudication.out" "$T1_RUN_DIR/T1-3worker-ab-adjudication.err" "$T1_RUN_DIR/T1-3worker-ab-adjudication.status" "$T1_CARRIER" "$T1_ADJUDICATION_STATUS" > "$T1_TMP/terminal-scan.out" 2>&1 <<'T1_TERMINAL_SCANNER'
# ... the scanner body embedded in the wrapper ...
T1_TERMINAL_SCANNER
T1_TERMINAL_STATUS=$?
grep -q "T1_N3_AB_TERMINAL_SCAN=CLEAN" "$T1_TMP/terminal-scan.out" || { t1_block secret; t1_finish }
(( T1_TERMINAL_STATUS == 0 )) || { t1_block secret; t1_finish }
rm -f "$T1_CARRIER"
```

The marker is then matched byte for byte against the four scientific markers and
the seven blocked markers. There is no prefix wildcard, and the status/marker
mapping is exact:

```zsh
T1_MARKER=$(tail -n 1 "$T1_RUN_DIR/T1-3worker-ab-adjudication.out")
# lawful only if $T1_MARKER equals one of the eleven exact strings
case "$T1_ADJUDICATION_STATUS" in
  0) # must be one of the four scientific markers, else t1_block receipt
     ;;
  2) # must be exactly one `CODEX BLOCKED (...)`; wrapper exit stays nonzero
     t1_block "${${T1_MARKER#CODEX BLOCKED \(}%\)}" ;;
  3) t1_block "rss-safety" ;;
  *) t1_block "receipt" ;;
esac
t1_finish
```

`t1_finish` restores (again, idempotently), re-verifies custody, prints exactly
one lawful marker and removes `$T1_TMP`. The raw generated literals exist only
in `$T1_CARRIER`, which is mode 0600, excluded from the scan set, and destroyed
above. The durable manifest records only their count and a SHA-256 commitment;
the manifest's own complete bytes are part of the full scan. A literal hit is
reported by generic guard name and count, never by echoing the literal.

## 14. Stop rules

The matrix stops — after letting active work settle, draining and closing — on
the FIRST of any of the following, and no failed cell is rerun in this seat:

| Condition | Marker |
|---|---|
| preflight, root, packet, artifact, hash, HEAD/index or descendant drift | `CODEX BLOCKED (custody)` |
| any generated literal or forbidden identifier in any stream | `CODEX BLOCKED (secret)` |
| any cell exits 3, the ruled 512 MiB diagnostic ceiling | `CODEX BLOCKED (rss-safety)` |
| either temporary test not restored byte-identically | `CODEX BLOCKED (restoration)` |
| a missing, truncated, empty, non-integer or unparseable receipt | `CODEX BLOCKED (receipt)` |
| any normal cell exits nonzero or fails a non-vacuity gate | `CODEX BLOCKED (normal-cell)` |
| any mutant survives, selects nothing, or fails to restore | `CODEX BLOCKED (mutant)` |

No early failure path prints a scientific marker. A blocked path records the
reason, terminates and reaps the tracked descendants, restores first, verifies
custody, and only then emits the one lawful `CODEX BLOCKED (...)` marker.
Restoration failure overrides every prior outcome with
`CODEX BLOCKED (restoration)` and status 74.

On a 512 MiB breach specifically the harness lets already-active work settle,
runs truthful cleanup, emits its structured secret-free safety report and exits
exactly 3; the wrapper maps that status to `CODEX BLOCKED (rss-safety)`, stops
every later three-worker cell, restores custody, and never mislabels it as
`normal-cell`.

The remaining outcomes are the four lawful scientific markers, emitted only by
the adjudicator and only after every gate above has passed:

- `THREE-WORKER A/B REPRODUCED AND SUPPORTS CREDENTIAL CONCURRENCY HYPOTHESIS`
- `THREE-WORKER A/B ORDINARY QUEUE SIGNATURE ONLY — HISTORICAL RED NOT REPRODUCED`
- `THREE-WORKER A/B CONTRADICTS CREDENTIAL CONCURRENCY HYPOTHESIS`
- `THREE-WORKER A/B MIXED OR INCONCLUSIVE`

No marker in either list authorizes production, changes provisional workers=2,
touches the permanent architecture exact-two gate, requalifies N*=3, amends the
384 MiB operator publication, approves Rework7-A, ratifies an RSS bound, or
moves Kanban to Done.
