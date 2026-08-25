#!/bin/zsh
# T1 three-worker A/B — diagnostic runner.
#
# AUTHORING STATUS: design evidence for `T1-claude-3worker-ab-draft-packet.md`,
# authored under correction 1 and repaired under correction 3. NEVER EXECUTED by
# the authoring seat. It becomes runnable only after two Sol xHigh reviewers
# approve this exact source AND V approves execution and records the final
# packet/artifact hashes in an external launch-authority file.
#
# CORRECTION 3 — WHAT CHANGED AND WHY
#
# 1. PROCESS IDENTITY IS REAL NOW. The previous `( setopt monitor; exec ... ) &`
#    did not create a new session: with job control off it left the child in the
#    wrapper's own group, and with job control on the subshell became the leader
#    but the recorded pid was not guaranteed to survive. Either way the negative
#    PGID this script later signalled could have been the wrapper's own group.
#    Every cell is now launched through an explicit Python supervisor that calls
#    `os.setsid()` and then `os.execvp()`, so the exec KEEPS the launched pid and
#    `pgid == pid` is a fact the wrapper reads back and asserts.
#
# 2. TWO SEPARATE IDENTITY CONCEPTS. Historical PID/PGID receipts are immutable
#    evidence. Signals are sent only through a separate ACTIVE table, and an
#    identity leaves that table the instant its exact child is reaped. A numeric
#    PID is recycled by the kernel; signalling a completed one is signalling a
#    stranger.
#
# 3. ONE UNIQUE RUN DIRECTORY, EXCLUSIVELY CREATED, plus a high-entropy run
#    commitment bound into every status file, every cell report, the manifest and
#    the adjudicator input. A receipt from a previous run can no longer be
#    replayed into this one.
#
# 4. TWO-STAGE ADJUDICATION. The adjudicator validates the closed inventory that
#    existed before it ran, and exits. It cannot adjudicate its own output. This
#    wrapper then records its three receipts and runs a small terminal scanner
#    over exactly those three, whose own verdict is a fixed code, not evidence.
#
# 5. EXACT MARKER SEMANTICS. No prefix wildcard. Status 0 with exactly one of the
#    four byte-exact scientific markers is the only scientific success; status 2
#    maps only to one lawful `CODEX BLOCKED (...)` and can never become wrapper
#    status 0; status 3 is always `rss-safety`.
#
# USAGE
#   zsh run-claude-T1-3worker-ab-diagnostic.sh <launch-authority.json>
#
# EXIT STATUS
#   0   one lawful scientific marker was printed
#   2   one lawful `CODEX BLOCKED (...)` marker was printed
#   74  custody or restoration failure; overrides every other outcome

set -u
setopt pipefail
unsetopt err_exit          # every cell's raw status must be captured, not fatal
unsetopt monitor           # cells must inherit this shell's group, so the
                           # supervisor's own setsid() is what creates the group

# ---------------------------------------------------------------------------
# 0. The embedded session supervisor.
#
# Held in a shell no-op heredoc so this file is a valid zsh script while the
# Python body remains raw, reviewable and independently compilable. The outer
# static author launcher requires each of the four envelope lines exactly once,
# in this order, extracts only the body between BEGIN and END, and passes it to
# Python `compile()` without executing anything.
# ---------------------------------------------------------------------------

: <<'T1_N3_AB_PY_SUPERVISOR_HEREDOC'
# BEGIN T1_N3_AB_PY_SUPERVISOR
import os
import sys

# One job: put this process in a brand-new session and process group, prove it,
# publish the identity, and then exec the real cell IN PLACE. Because execvp
# replaces the image without changing the pid, the group the wrapper later
# signals is exactly the subtree this cell creates, and provably not the
# wrapper's own group.

if len(sys.argv) < 2:
    sys.stderr.write("T1_N3_AB_SUPERVISOR_USAGE\n")
    raise SystemExit(3)

identity_path = os.environ.get("T1_N3_AB_IDENTITY_PATH", "")
if not identity_path:
    sys.stderr.write("T1_N3_AB_SUPERVISOR_IDENTITY_PATH_MISSING\n")
    raise SystemExit(3)

parent_pgid = os.getpgid(0)
try:
    os.setsid()
except OSError:
    # Already a group leader. Refusing is the only safe answer: exec'ing here
    # would leave the cell in a group this wrapper cannot prove it owns.
    sys.stderr.write("T1_N3_AB_SUPERVISOR_SETSID_FAILED\n")
    raise SystemExit(3)

pid = os.getpid()
pgid = os.getpgid(0)
sid = os.getsid(0)
if pgid != pid or sid != pid or pgid == parent_pgid:
    sys.stderr.write("T1_N3_AB_SUPERVISOR_GROUP_NOT_SELF\n")
    raise SystemExit(3)

cell_id = os.environ.get("T1_N3_AB_CELL_ID", "")
run_commitment = os.environ.get("T1_N3_AB_RUN_COMMITMENT", "")

with open(identity_path, "w") as handle:
    handle.write("PID=%d PGID=%d SID=%d PARENTPGID=%d CELL=%s RUN=%s\n"
                 % (pid, pgid, sid, parent_pgid, cell_id, run_commitment))
    handle.flush()
    os.fsync(handle.fileno())

# The VERIFIED identity travels to the cell through inherited environment, so a
# cell's report cannot claim a pid, group or session it was not actually given.
# A report that merely prints `process.pid` proves nothing: any process can do
# that. These values were proven by setsid() above and are unforgeable by the
# child, which inherits them rather than choosing them.
os.environ["T1_N3_AB_SUPERVISED_PID"] = str(pid)
os.environ["T1_N3_AB_SUPERVISED_PGID"] = str(pgid)
os.environ["T1_N3_AB_SUPERVISED_SID"] = str(sid)

os.execvp(sys.argv[1], sys.argv[1:])
# END T1_N3_AB_PY_SUPERVISOR
T1_N3_AB_PY_SUPERVISOR_HEREDOC

# ---------------------------------------------------------------------------
# 1. Roots. Verified before anything else, because every later path depends on
#    getting these two right. They are DIFFERENT directories.
# ---------------------------------------------------------------------------

T1_OUTER_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO"
T1_CHECKOUT_ROOT="$T1_OUTER_ROOT/dialectical-engine"
T1_LOGS_REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
T1_LOGS="$T1_CHECKOUT_ROOT/$T1_LOGS_REL"

if [[ ! -d "$T1_OUTER_ROOT/.git" ]]; then
  print -r -- "CODEX BLOCKED (custody)"
  exit 74
fi
if [[ ! -d "$T1_CHECKOUT_ROOT/apps" || ! -d "$T1_CHECKOUT_ROOT/tests" || ! -d "$T1_LOGS" ]]; then
  print -r -- "CODEX BLOCKED (custody)"
  exit 74
fi
cd "$T1_CHECKOUT_ROOT" || { print -r -- "CODEX BLOCKED (custody)"; exit 74 }

# ---------------------------------------------------------------------------
# 2. Frozen constants.
# ---------------------------------------------------------------------------

T1_HEAD="9801f85d97e4263a7c8311304e29d6a03c4a6d15"
T1_NODE_VERSION="v22.23.1"
T1_PYTHON="/usr/bin/python3"
T1_INTEGRATION_FILE="tests/integration/registration-database.test.ts"
T1_ARCHITECTURE_FILE="tests/architecture/t1-argon2-worker-contract.test.ts"
T1_INTEGRATION_SHA="7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58"
T1_ARCHITECTURE_SHA="3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1"

T1_TITLE_INTEGRATION="T1 N3 AB three-worker credential concurrency diagnostic"
T1_TITLE_RESOURCE="T1 N3 AB architecture resource cell"
T1_TITLE_POSITIVE_CONTROL="T1 N3 AB retained allocation positive control"
T1_TITLE_FAULT_UNCONFIRMED="T1 N3 AB fault unconfirmed death"
T1_TITLE_FAULT_LATE_EXIT="T1 N3 AB fault late exit before close"
T1_TITLE_FAULT_RETRY="T1 N3 AB fault close-time termination retry fulfilled"

# An ARRAY, expanded as "${T1_VITEST_FLAGS[@]}". A scalar relying on word
# splitting is how a flag containing `=` silently becomes the wrong argument.
T1_VITEST_FLAGS=(
  --pool=forks
  --poolOptions.forks.singleFork=true
  --no-file-parallelism
  --reporter=verbose
)

# The twelve governed paths and their exact frozen SHA-256 values, as one
# `<sha>  <path>` line each. Checking twelve NAMES, or twelve of anything, is
# not custody; checking twelve exact digests is.
T1_GOVERNED=(
  "0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts"
  "4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts"
  "0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts"
  "66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts"
  "c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts"
  "b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts"
  "2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts"
  "06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts"
  "7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts"
  "ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts"
  "93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts"
  "3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts"
)
T1_GOVERNED_PATHS=(
  apps/api/src/index.ts
  apps/api/src/main.ts
  apps/api/src/registration.ts
  packages/crypto/src/index.ts
  packages/crypto/src/argon2-worker.ts
  packages/crypto/src/argon2-worker-pool.ts
  packages/db/src/identity.ts
  packages/register/src/auth-policy.ts
  tests/integration/registration-database.test.ts
  tests/unit/registration.test.ts
  tests/unit/argon2-worker-pool.test.ts
  tests/architecture/t1-argon2-worker-contract.test.ts
)

T1_ARTIFACTS=(
  T1-3worker-ab-booted-rss-harness.mjs
  T1-3worker-ab-adjudicator.mjs
  T1-3worker-ab-command-matrix.md
  T1-3worker-ab-integration.patch
  T1-3worker-ab-architecture.patch
  T1-3worker-ab-mutation-helper.mjs
  T1-3worker-ab-manifest-builder.mjs
  run-claude-T1-3worker-ab-diagnostic.sh
)

# The only four lawful scientific markers, byte for byte. No prefix wildcard.
T1_SCIENTIFIC_MARKERS=(
  "THREE-WORKER A/B REPRODUCED AND SUPPORTS CREDENTIAL CONCURRENCY HYPOTHESIS"
  "THREE-WORKER A/B ORDINARY QUEUE SIGNATURE ONLY — HISTORICAL RED NOT REPRODUCED"
  "THREE-WORKER A/B CONTRADICTS CREDENTIAL CONCURRENCY HYPOTHESIS"
  "THREE-WORKER A/B MIXED OR INCONCLUSIVE"
)
T1_BLOCKED_MARKERS=(
  "CODEX BLOCKED (custody)"
  "CODEX BLOCKED (secret)"
  "CODEX BLOCKED (rss-safety)"
  "CODEX BLOCKED (restoration)"
  "CODEX BLOCKED (receipt)"
  "CODEX BLOCKED (normal-cell)"
  "CODEX BLOCKED (mutant)"
)

# Bounded per-cell wall clock. A hang fails through here, not through an
# invented scientific threshold.
T1_CELL_TIMEOUT_SECONDS=5400

# ---------------------------------------------------------------------------
# 3. Mutable run state.
# ---------------------------------------------------------------------------

T1_TMP=""
T1_RUN_DIR=""
T1_RUN_ID=""
T1_RUN_COMMITMENT=""
T1_CARRIER=""
T1_BACKUPS_TAKEN=0
T1_BLOCK_REASON=""
T1_MARKER=""
T1_FINISHED=0
T1_ACTIVE_PIDS=()
T1_ACTIVE_PGIDS=()
T1_ACTIVE_SIDS=()
T1_ACTIVE_CELLS=()
T1_FALLBACK_PIDS=()
T1_TIMED_OUT_CELL=""
T1_RESTORATION_FINALIZED=0
T1_EVIDENCE_SEALED=0
T1_STOP_SCIENCE=0

t1_block() {
  # First reason wins. A later custody failure never overwrites the safety stop
  # that caused it, and a scientific marker can never overwrite a block.
  [[ -z "$T1_BLOCK_REASON" ]] && T1_BLOCK_REASON="$1"
  [[ -n "$T1_RUN_DIR" ]] && print -r -- "$1" >> "$T1_RUN_DIR/T1-3worker-ab-block-reasons.out"
  return 0
}

# Status receipts carry the run commitment beside the raw integer. The grammar
# is exact — one integer, one space, the 64-hex commitment — so the builder can
# still validate the status as bytes while the pair is bound to this run.
t1_write_status() {
  print -r -- "$1 $T1_RUN_COMMITMENT" > "$T1_RUN_DIR/T1-3worker-ab-$2.status"
}

# ---------------------------------------------------------------------------
# 4. Active identity table. Signals go here and nowhere else.
# ---------------------------------------------------------------------------

t1_active_add() {
  T1_ACTIVE_PIDS+=("$1")
  T1_ACTIVE_PGIDS+=("$2")
  T1_ACTIVE_SIDS+=("$3")
  T1_ACTIVE_CELLS+=("$4")
}

t1_active_remove() {
  # Called only once the WHOLE recorded group and session are empty — not merely
  # when the leader exits. A leader can exit while Vitest, embedded PostgreSQL
  # and worker descendants keep running in the same group, and dropping the
  # identity then would abandon exactly the processes custody is about.
  local target="$1"
  local -a pids pgids sids cells
  local index
  # zsh expands `{1..0}` to `1 0`, so an empty table must return before the
  # range is built rather than indexing past the end of it.
  (( ${#T1_ACTIVE_PIDS[@]} == 0 )) && return 0
  for index in {1..${#T1_ACTIVE_PIDS[@]}}; do
    if [[ "${T1_ACTIVE_PIDS[$index]}" != "$target" ]]; then
      pids+=("${T1_ACTIVE_PIDS[$index]}")
      pgids+=("${T1_ACTIVE_PGIDS[$index]}")
      sids+=("${T1_ACTIVE_SIDS[$index]}")
      cells+=("${T1_ACTIVE_CELLS[$index]}")
    fi
  done
  T1_ACTIVE_PIDS=(${pids[@]})
  T1_ACTIVE_PGIDS=(${pgids[@]})
  T1_ACTIVE_SIDS=(${sids[@]})
  T1_ACTIVE_CELLS=(${cells[@]})
}

# Every live member of one recorded process group, printed one pid per line.
# `ps -A` plus an exact field comparison, because a group's membership is the
# thing being asked about and the leader may already be gone.
t1_group_members() {
  local pgid="$1" line memberPid memberPgid
  ps -A -o pid=,pgid= 2>/dev/null | while IFS= read -r line; do
    memberPid="${line%% *}"
    memberPgid="${line##* }"
    [[ "$memberPgid" == "$pgid" ]] && print -r -- "$memberPid"
  done
}

t1_session_members() {
  local sid="$1" line memberPid memberSid
  ps -A -o pid=,sess= 2>/dev/null | while IFS= read -r line; do
    memberPid="${line%% *}"
    memberSid="${line##* }"
    [[ "$memberSid" == "$sid" ]] && print -r -- "$memberPid"
  done
}

# A group may be signalled only when it still has members AND it is provably not
# this wrapper's own group or session. Ownership is revalidated at the moment of
# the signal, never inferred from a record written earlier.
t1_group_signallable() {
  local pgid="$1" sid="$2" wrapperPgid wrapperSid members
  [[ -n "$pgid" && "$pgid" != "0" && "$pgid" != "1" ]] || return 1
  wrapperPgid=$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')
  wrapperSid=$(ps -o sess= -p $$ 2>/dev/null | tr -d ' ')
  [[ "$pgid" == "$wrapperPgid" || "$sid" == "$wrapperSid" ]] && return 1
  members=$(t1_group_members "$pgid")
  [[ -n "$members" ]] || return 1
  return 0
}

t1_terminate_active() {
  local index pgid sid waited alive
  if (( ${#T1_ACTIVE_PIDS[@]} > 0 )); then
    for index in {1..${#T1_ACTIVE_PIDS[@]}}; do
      pgid="${T1_ACTIVE_PGIDS[$index]}"
      sid="${T1_ACTIVE_SIDS[$index]}"
      t1_group_signallable "$pgid" "$sid" && kill -TERM -"$pgid" 2>/dev/null
    done
    waited=0
    while (( waited < 20 )); do
      alive=0
      for index in {1..${#T1_ACTIVE_PIDS[@]}}; do
        [[ -n "$(t1_group_members "${T1_ACTIVE_PGIDS[$index]}")" ]] && alive=1
      done
      (( alive == 0 )) && break
      sleep 0.5
      (( waited += 1 ))
    done
    for index in {1..${#T1_ACTIVE_PIDS[@]}}; do
      pgid="${T1_ACTIVE_PGIDS[$index]}"
      sid="${T1_ACTIVE_SIDS[$index]}"
      t1_group_signallable "$pgid" "$sid" && kill -KILL -"$pgid" 2>/dev/null
    done
  fi
  # Bounded fallback: a child whose group could never be validated is signalled
  # directly, as a single pid, only while alive, and its identity is dropped
  # immediately after its exact reap so it can never be signalled again.
  local pid
  for pid in ${T1_FALLBACK_PIDS[@]}; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null
      t1_bounded_wait_pid "$pid" 10
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
      t1_bounded_wait_pid "$pid" 10
    fi
    wait "$pid" 2>/dev/null
  done
  T1_ACTIVE_PIDS=()
  T1_ACTIVE_PGIDS=()
  T1_ACTIVE_SIDS=()
  T1_ACTIVE_CELLS=()
  T1_FALLBACK_PIDS=()
}

# Bounded, monotonic wait for one pid. Every wait in this wrapper is bounded:
# an unbounded `wait` in cleanup turns a hung descendant into a hung custody
# path, which is the one failure mode that leaves the tree unrestored.
t1_bounded_wait_pid() {
  local pid="$1" limit="$2" started=$SECONDS
  while kill -0 "$pid" 2>/dev/null; do
    (( SECONDS - started >= limit )) && return 1
    sleep 0.2
  done
  return 0
}

# Final custody: every recorded GROUP and SESSION must be empty, not merely
# every recorded leader gone. This enumerates members, and it reads only the
# recorded identities — never a host-wide pattern that would match the wrapper.
t1_verify_descendants_gone() {
  local receipt="$T1_RUN_DIR/T1-3worker-ab-final-descendants.out"
  : > "$receipt"
  local surviving=0 empty=0 line pid pgid sid members
  while IFS= read -r line; do
    pid="${${line#*PID=}%% *}"
    pgid="${${line#*PGID=}%% *}"
    sid="${${line#*SID=}%% *}"
    [[ "$pgid" == "UNVERIFIED" ]] && pgid=""
    if kill -0 "$pid" 2>/dev/null; then
      print -r -- "PID=$pid LEADER_ALIVE" >> "$receipt"
      (( surviving += 1 ))
    fi
    if [[ -n "$pgid" ]]; then
      members=$(t1_group_members "$pgid")
      if [[ -n "$members" ]]; then
        print -r -- "PGID=$pgid MEMBERS_ALIVE=$(print -r -- "$members" | grep -c .)" >> "$receipt"
        (( surviving += 1 ))
      else
        print -r -- "PGID=$pgid GROUP_EMPTY" >> "$receipt"
        (( empty += 1 ))
      fi
    fi
    if [[ -n "$sid" && "$sid" != "UNVERIFIED" ]]; then
      members=$(t1_session_members "$sid")
      if [[ -n "$members" ]]; then
        print -r -- "SID=$sid MEMBERS_ALIVE=$(print -r -- "$members" | grep -c .)" >> "$receipt"
        (( surviving += 1 ))
      else
        print -r -- "SID=$sid SESSION_EMPTY" >> "$receipt"
        (( empty += 1 ))
      fi
    fi
  done < "$T1_RUN_DIR/T1-3worker-ab-process-identity.out"
  print -r -- "ACTIVE_TABLE_SIZE=${#T1_ACTIVE_PIDS[@]}" >> "$receipt"
  print -r -- "FALLBACK_TABLE_SIZE=${#T1_FALLBACK_PIDS[@]}" >> "$receipt"
  print -r -- "SURVIVING_MEMBERS=$surviving" >> "$receipt"
  print -r -- "TRACKED_DESCENDANTS_GONE=$empty" >> "$receipt"
  (( ${#T1_ACTIVE_PIDS[@]} == 0 )) || return 1
  (( ${#T1_FALLBACK_PIDS[@]} == 0 )) || return 1
  (( surviving == 0 )) || return 1
  return 0
}

# ---------------------------------------------------------------------------
# 5. Cell execution through the session supervisor.
# ---------------------------------------------------------------------------

t1_run_cell() {
  local name="$1"; shift
  local out="$T1_RUN_DIR/T1-3worker-ab-$name.out"
  local err="$T1_RUN_DIR/T1-3worker-ab-$name.err"
  local identity="$T1_TMP/identity-$name.txt"
  : > "$identity"

  local closeMarker="$T1_TMP/close-initiated-$name.txt"
  : > "$closeMarker"
  T1_N3_AB_IDENTITY_PATH="$identity" T1_N3_AB_CLOSE_MARKER_PATH="$closeMarker" \
    "$T1_PYTHON" "$T1_TMP/t1-supervisor.py" "$@" > "$out" 2> "$err" &
  local pid=$!

  # The supervisor writes and fsyncs its identity before exec'ing, so a short
  # bounded poll is enough; a child that never publishes one is a fallback.
  local attempt=0 line="" pgid=""
  while (( attempt < 40 )); do
    [[ -s "$identity" ]] && { line=$(<"$identity"); break }
    sleep 0.05
    (( attempt += 1 ))
  done
  local sid=""
  if [[ -n "$line" ]]; then
    local reported_pid="${${line#PID=}%% *}"
    pgid="${${line#*PGID=}%% *}"
    sid="${${line#*SID=}%% *}"
    local wrapper_pgid wrapper_sid observed_pgid
    wrapper_pgid=$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')
    wrapper_sid=$(ps -o sess= -p $$ 2>/dev/null | tr -d ' ')
    observed_pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [[ "$reported_pid" == "$pid" && "$pgid" == "$pid" && "$sid" == "$pid" \
      && "$pgid" != "$wrapper_pgid" && "$sid" != "$wrapper_sid" \
      && "$observed_pgid" == "$pgid" ]]; then
      t1_active_add "$pid" "$pgid" "$sid" "$name"
      print -r -- "CELL=$name PID=$pid PGID=$pgid SID=$sid WRAPPERPGID=$wrapper_pgid RUN=$T1_RUN_COMMITMENT" \
        >> "$T1_RUN_DIR/T1-3worker-ab-process-identity.out"
    else
      pgid=""
      sid=""
    fi
  fi
  if [[ -z "$pgid" ]]; then
    # Identity publication or validation failed. Stop this cell AND the mission
    # at once: TERM/KILL/reap only the exact direct fallback child, drop its
    # identity after the exact reap so it can never be signalled again, and
    # block custody. Science never continues past this point.
    print -r -- "CELL=$name PID=$pid PGID=UNVERIFIED SID=UNVERIFIED RUN=$T1_RUN_COMMITMENT" \
      >> "$T1_RUN_DIR/T1-3worker-ab-process-identity.out"
    kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null
    t1_bounded_wait_pid "$pid" 10
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
    t1_bounded_wait_pid "$pid" 10
    wait "$pid" 2>/dev/null
    local unverified_status=$?
    t1_write_status "$unverified_status" "$name"
    print -r -- "$name" >> "$T1_RUN_DIR/T1-3worker-ab-finalization-order.out"
    T1_STOP_SCIENCE=1
    t1_block "custody"
    t1_finish
  fi

  # A REAL bounded deadline. `T1_CELL_TIMEOUT_SECONDS` is an operational abort,
  # not a scientific threshold, and an unbounded `wait` would make it a comment.
  # The watchdog is this loop: monotonic, polled, and reaped on ordinary exit.
  local started=$SECONDS timed_out=0
  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS - started >= T1_CELL_TIMEOUT_SECONDS )); then
      timed_out=1
      break
    fi
    sleep 1
  done

  if (( timed_out == 1 )); then
    # 1. Mark the cell timed out and stop every later scientific/mutant cell.
    T1_TIMED_OUT_CELL="$name"
    T1_STOP_SCIENCE=1
    # 2-3. Revalidate the still-owned group, then TERM, bounded wait, KILL, reap.
    if t1_group_signallable "$pgid" "$sid"; then
      kill -TERM -"$pgid" 2>/dev/null
      local waited=0
      while (( waited < 30 )); do
        [[ -z "$(t1_group_members "$pgid")" ]] && break
        sleep 1
        (( waited += 1 ))
      done
      [[ -n "$(t1_group_members "$pgid")" ]] && kill -KILL -"$pgid" 2>/dev/null
    else
      kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null
      t1_bounded_wait_pid "$pid" 10
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
    fi
    t1_bounded_wait_pid "$pid" 30
  fi

  wait "$pid" 2>/dev/null
  local status_code=$?
  # The identity leaves the ACTIVE table only once its whole group and session
  # are empty. A leader that exited while descendants survive stays tracked.
  if [[ -n "$pgid" ]]; then
    local drain=0
    while (( drain < 30 )); do
      [[ -z "$(t1_group_members "$pgid")" && -z "$(t1_session_members "$sid")" ]] && break
      sleep 1
      (( drain += 1 ))
    done
    if [[ -z "$(t1_group_members "$pgid")" && -z "$(t1_session_members "$sid")" ]]; then
      t1_active_remove "$pid"
    fi
  fi

  # 4. Raw timeout/status/finalization/process receipts, in that order. Both
  #    receipts are written unconditionally so the closed inventory is exact.
  print -r -- "CELL=$name TIMED_OUT=$timed_out DEADLINE_SECONDS=$T1_CELL_TIMEOUT_SECONDS" \
    > "$T1_RUN_DIR/T1-3worker-ab-$name-timeout.out"
  t1_write_status "$status_code" "$name"
  print -r -- "$name" >> "$T1_RUN_DIR/T1-3worker-ab-finalization-order.out"

  # The parent's own monotonic view of close initiation to reap. The child
  # publishes its close-initiation instant through a run-bound private marker;
  # this parent stamps that event and the reap on ONE clock. Measurement only:
  # no prompt-exit acceptance threshold is ratified.
  local parent_reap_at close_line child_close_at close_delta="UNAVAILABLE"
  parent_reap_at=$("$T1_PYTHON" -c 'import time;print(time.monotonic_ns())')
  if [[ -s "$closeMarker" ]]; then
    close_line=$(<"$closeMarker")
    # The child publishes `RUN=<commitment> MONOTONIC_NS=<n>`; a marker that is
    # not bound to this run is not this run's evidence and is discarded.
    if [[ "$close_line" == *"RUN=$T1_RUN_COMMITMENT"* ]]; then
      child_close_at="${${close_line#*MONOTONIC_NS=}%% *}"
      if [[ "$child_close_at" == <-> ]] && (( parent_reap_at >= child_close_at )); then
        close_delta=$(( parent_reap_at - child_close_at ))
      fi
    fi
  fi
  print -r -- "CELL=$name CLOSE_TO_REAP_NS=$close_delta MEASUREMENT_ONLY=1" \
    > "$T1_RUN_DIR/T1-3worker-ab-$name-close-to-reap.out"

  # 5. Fail closed, unless a more authoritative block already exists.
  if (( timed_out == 1 )); then
    t1_block "normal-cell"
    t1_finish
  fi
  return $status_code
}

# ---------------------------------------------------------------------------
# 6. Stop rules.
# ---------------------------------------------------------------------------

# Status 3 is the ruled 512 MiB safety stop and is never mislabelled. A
# Vitest-hosted cell cannot hand its child's exit code to the runner, so the
# structured safety line in that cell's own stdout is equally authoritative:
# either signal maps to rss-safety, and neither maps to normal-cell.
t1_guard_status() {
  local status_code="$1" name="$2"
  (( T1_STOP_SCIENCE == 1 )) && t1_finish
  if grep -qF "[T1_N3_AB_RSS_SAFETY_EXCEEDED]" "$T1_RUN_DIR/T1-3worker-ab-$name.out" 2>/dev/null; then
    t1_block "rss-safety"; t1_finish
  fi
  case "$status_code" in
    0) return 0 ;;
    3) t1_block "rss-safety"; t1_finish ;;
    *) t1_block "normal-cell"; t1_finish ;;
  esac
}

# ---------------------------------------------------------------------------
# 7. Restoration and the final status override.
# ---------------------------------------------------------------------------

t1_restore() {
  (( T1_BACKUPS_TAKEN == 1 )) || return 0
  # Restoration receipts are finalized exactly ONCE, before the builder and the
  # adjudicator read them. A second pass would rewrite bytes that have already
  # been adjudicated, so after finalization this only re-verifies.
  if (( T1_RESTORATION_FINALIZED == 1 )); then
    cmp -s "$T1_INTEGRATION_FILE" "$T1_TMP/registration-database.test.ts.bak" || return 1
    cmp -s "$T1_ARCHITECTURE_FILE" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak" || return 1
    return 0
  fi
  local failed=0
  cp -p "$T1_TMP/registration-database.test.ts.bak" "$T1_INTEGRATION_FILE" || failed=1
  cp -p "$T1_TMP/t1-argon2-worker-contract.test.ts.bak" "$T1_ARCHITECTURE_FILE" || failed=1

  cmp "$T1_INTEGRATION_FILE" "$T1_TMP/registration-database.test.ts.bak"
  t1_write_status "$?" "restore-cmp-registration-database"
  grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-restore-cmp-registration-database.status" || failed=1
  cmp "$T1_ARCHITECTURE_FILE" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak"
  t1_write_status "$?" "restore-cmp-t1-argon2-worker-contract"
  grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-restore-cmp-t1-argon2-worker-contract.status" || failed=1

  shasum -a 256 "$T1_INTEGRATION_FILE" \
    > "$T1_RUN_DIR/T1-3worker-ab-restore-hash-registration-database.out"
  shasum -a 256 "$T1_ARCHITECTURE_FILE" \
    > "$T1_RUN_DIR/T1-3worker-ab-restore-hash-t1-argon2-worker-contract.out"
  grep -qx "$T1_INTEGRATION_SHA  $T1_INTEGRATION_FILE" \
    "$T1_RUN_DIR/T1-3worker-ab-restore-hash-registration-database.out" || failed=1
  grep -qx "$T1_ARCHITECTURE_SHA  $T1_ARCHITECTURE_FILE" \
    "$T1_RUN_DIR/T1-3worker-ab-restore-hash-t1-argon2-worker-contract.out" || failed=1

  # Size and nanosecond-resolution mtime, compared against the backup's own.
  stat -f "%N size=%z mtime=%Fm" "$T1_INTEGRATION_FILE" \
    > "$T1_RUN_DIR/T1-3worker-ab-restore-stat-registration-database.out"
  stat -f "%N size=%z mtime=%Fm" "$T1_ARCHITECTURE_FILE" \
    > "$T1_RUN_DIR/T1-3worker-ab-restore-stat-t1-argon2-worker-contract.out"
  local restored_meta backup_meta
  restored_meta=$(stat -f "size=%z mtime=%Fm" "$T1_INTEGRATION_FILE")
  backup_meta=$(stat -f "size=%z mtime=%Fm" "$T1_TMP/registration-database.test.ts.bak")
  [[ "$restored_meta" == "$backup_meta" ]] || failed=1
  restored_meta=$(stat -f "size=%z mtime=%Fm" "$T1_ARCHITECTURE_FILE")
  backup_meta=$(stat -f "size=%z mtime=%Fm" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak")
  [[ "$restored_meta" == "$backup_meta" ]] || failed=1

  T1_RESTORATION_FINALIZED=1
  return $failed
}

# One exit path for every outcome. Descendants first, restoration second,
# custody third, marker last — and restoration failure overrides everything.
t1_finish() {
  (( T1_FINISHED == 1 )) && return
  T1_FINISHED=1
  local incoming="${1:-}"

  t1_terminate_active

  if ! t1_restore; then
    print -r -- "CODEX BLOCKED (restoration)"
    [[ -n "$T1_TMP" && -d "$T1_TMP" ]] && rm -rf "$T1_TMP"
    exit 74
  fi

  # Once the terminal scanner has accepted, the durable evidence is SEALED: the
  # bytes the adjudicator read must remain exactly the bytes on disk. Later
  # cleanup may read and verify them and may remove private temp/carrier data,
  # but it must not rewrite, touch, truncate or append to any adjudicated
  # receipt — which is exactly what re-running the custody block would do.
  if [[ -n "$T1_RUN_DIR" ]] && (( T1_EVIDENCE_SEALED == 0 )); then
    git rev-parse HEAD > "$T1_RUN_DIR/T1-3worker-ab-final-head.out" 2>/dev/null
    grep -qx "$T1_HEAD" "$T1_RUN_DIR/T1-3worker-ab-final-head.out" || t1_block "custody"
    git diff --cached --name-only > "$T1_RUN_DIR/T1-3worker-ab-final-index.out" 2>/dev/null
    [[ -s "$T1_RUN_DIR/T1-3worker-ab-final-index.out" ]] && t1_block "custody"
    shasum -a 256 ${T1_GOVERNED_PATHS[@]} \
      > "$T1_RUN_DIR/T1-3worker-ab-final-hashes.out" 2>/dev/null
    local governed
    for governed in ${T1_GOVERNED[@]}; do
      grep -qx "$governed" "$T1_RUN_DIR/T1-3worker-ab-final-hashes.out" || t1_block "custody"
    done
    git diff --check > "$T1_RUN_DIR/T1-3worker-ab-final-whitespace.out" 2>&1
    (( $? == 0 )) || t1_block "custody"
    git status --porcelain > "$T1_RUN_DIR/T1-3worker-ab-final-worktree.out" 2>/dev/null
    t1_verify_descendants_gone || t1_block "custody"
  fi

  [[ -n "$incoming" ]] && t1_block "$incoming"
  [[ -n "$T1_CARRIER" && -f "$T1_CARRIER" ]] && rm -f "$T1_CARRIER"

  if [[ -n "$T1_BLOCK_REASON" ]]; then
    print -r -- "CODEX BLOCKED ($T1_BLOCK_REASON)"
    [[ -n "$T1_TMP" && -d "$T1_TMP" ]] && rm -rf "$T1_TMP"
    exit 2
  fi

  print -r -- "$T1_MARKER"
  [[ -n "$T1_TMP" && -d "$T1_TMP" ]] && rm -rf "$T1_TMP"
  exit 0
}

trap 't1_finish "custody"' INT TERM HUP QUIT
trap 't1_finish "custody"' EXIT

# ---------------------------------------------------------------------------
# 8. Private scratch, the supervisor body, and the unique run directory.
# ---------------------------------------------------------------------------

T1_TMP="$(mktemp -d "${TMPDIR:-/tmp}/t1-n3-ab-XXXXXXXX")" || t1_finish "custody"
chmod 700 "$T1_TMP"

# Extract exactly the supervisor body from this file's own heredoc envelope.
# The two marker literals are ASSEMBLED here rather than written whole, so each
# of the four envelope lines occurs exactly once in this file — the outer static
# launcher counts them, and a second verbatim copy in this command would break
# that count while changing nothing about what is extracted.
T1_PY_MARK_BEGIN='# BEGIN T1_N3_AB_PY'
T1_PY_MARK_END='# END T1_N3_AB_PY'
/usr/bin/sed -n "/^${T1_PY_MARK_BEGIN}_SUPERVISOR\$/,/^${T1_PY_MARK_END}_SUPERVISOR\$/p" \
  "$T1_LOGS/run-claude-T1-3worker-ab-diagnostic.sh" \
  | /usr/bin/sed '1d;$d' > "$T1_TMP/t1-supervisor.py"
[[ -s "$T1_TMP/t1-supervisor.py" ]] || t1_finish "custody"
"$T1_PYTHON" -c "import sys;compile(open(sys.argv[1]).read(),'supervisor','exec')" \
  "$T1_TMP/t1-supervisor.py" || t1_finish "custody"

# ---------------------------------------------------------------------------
# The private carrier comes FIRST — before the run identity exists, before the
# durable run directory is named, and before any mission-generated literal is
# used or written anywhere. The previous order wrote `RUN_ID=` into a durable
# receipt and then normalized it as an exception, which is backwards: a literal
# that needs an exception is a literal that reached a receipt before it was
# covered.
# ---------------------------------------------------------------------------

T1_CARRIER="$T1_TMP/generated-literals.txt"
( umask 077; : > "$T1_CARRIER" )
chmod 600 "$T1_CARRIER"
[[ "$(stat -f '%Lp' "$T1_CARRIER")" == "600" ]] || t1_finish "custody"

# Generated into memory, appended to the carrier, and only then used.
T1_RUN_ID="$("$T1_PYTHON" -c 'import secrets;print(secrets.token_hex(16))')"
T1_RUN_COMMITMENT="$("$T1_PYTHON" -c 'import secrets;print(secrets.token_hex(32))')"
[[ ${#T1_RUN_ID} -eq 32 && ${#T1_RUN_COMMITMENT} -eq 64 ]] || t1_finish "custody"
{
  print -r -- "$T1_RUN_ID"
  print -r -- "$T1_RUN_COMMITMENT"
  print -r -- "${T1_TMP:t}"
  print -r -- "correct horse battery staple"
  print -r -- "t1-n3ab-"
  print -r -- "t1-n3-ab-standalone-"
  print -r -- "t1-n3-ab-warm-"
  print -r -- "t1-n3-ab-load-"
  print -r -- "t1-n3-ab-fault"
  print -r -- "vitest-s3b-timing-seed"
  print -r -- "vitest-s3b-timing-existing"
  print -r -- "vitest-s3b-timing-missing"
  print -r -- "t1-n3-ab-standalone"
  print -r -- "request:s3b:timing:n3"
  print -r -- "request:t1:n3:ab:standalone"
  for index in 0 1 2; do
    print -r -- "t1-n3ab-n3-existing-${index}@example.test"
    print -r -- "t1-n3ab-n3-existing-${index}-recovery@example.test"
    print -r -- "t1-n3ab-n3-seed-${index}-recovery@example.test"
  done
  for wave in 0 1 2 3; do
    for index in 0 1 2; do
      print -r -- "t1-n3ab-n3-missing-${wave}-${index}@example.test"
      print -r -- "t1-n3ab-n3-missing-${wave}-${index}-recovery@example.test"
    done
  done
  for index in 0 1 2 3 4 5 6 7 8 9; do
    print -r -- "t1-n3-ab-standalone-${index}@example.test"
    print -r -- "t1-n3-ab-standalone-recovery-${index}@example.test"
    print -r -- "2001:db8:3ab:1::$((index + 1))"
  done
  for concurrency in 1 2 3; do
    for wave in 0 1 2 3 4 5 6 7; do
      for index in 1 2 3; do
        print -r -- "203.${concurrency}.${wave}.${index}"
        print -r -- "204.${concurrency}.${wave}.${index}"
      done
    done
    for index in 1 2 3; do
      print -r -- "203.0.${concurrency}.${index}"
    done
  done
} >> "$T1_CARRIER"
[[ -r "$T1_CARRIER" && -s "$T1_CARRIER" ]] || t1_finish "custody"
[[ "$(stat -f '%Lp' "$T1_CARRIER")" == "600" ]] || t1_finish "custody"
T1_CARRIER_COUNT=$(grep -c . "$T1_CARRIER" | tr -d ' ')
(( T1_CARRIER_COUNT > 0 )) || t1_finish "custody"
T1_CARRIER_COMMITMENT=$("$T1_PYTHON" -c \
  'import hashlib,sys;print(hashlib.sha256("\n".join(l.strip() for l in open(sys.argv[1]) if l.strip()).encode()).hexdigest())' \
  "$T1_CARRIER")
[[ ${#T1_CARRIER_COMMITMENT} -eq 64 ]] || t1_finish "custody"

export T1_N3_AB_RUN_COMMITMENT="$T1_RUN_COMMITMENT"
T1_RUN_DIR="$T1_LOGS/T1-3worker-ab-run-$T1_RUN_ID"
# Exclusive creation: `mkdir` without -p fails if the directory already exists,
# so a run can never land in another run's receipts.
mkdir "$T1_RUN_DIR" || t1_finish "custody"

# The preflight instant. No receipt in this run may predate it.
"$T1_PYTHON" -c 'import time;print(time.time_ns())' \
  > "$T1_RUN_DIR/T1-3worker-ab-run-preflight-epoch.out"
# The run identity receipt records only the COMMITMENT to the run id, never the
# id itself, so no durable receipt carries a raw generated literal at all.
print -r -- "RUN_ID_COMMITMENT=$("$T1_PYTHON" -c \
  'import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest())' "$T1_RUN_ID")" \
  > "$T1_RUN_DIR/T1-3worker-ab-run-identity.out"
print -r -- "GENERATED_LITERAL_COUNT=$T1_CARRIER_COUNT" \
  > "$T1_RUN_DIR/T1-3worker-ab-carrier-gate.out"
print -r -- "GENERATED_LITERAL_COMMITMENT=$T1_CARRIER_COMMITMENT" \
  >> "$T1_RUN_DIR/T1-3worker-ab-carrier-gate.out"
: > "$T1_RUN_DIR/T1-3worker-ab-process-identity.out"
: > "$T1_RUN_DIR/T1-3worker-ab-finalization-order.out"
: > "$T1_RUN_DIR/T1-3worker-ab-block-reasons.out"

# ---------------------------------------------------------------------------
# 9. External launch authority, then executable custody. Nothing is backed up or
#    edited, and no test, worker or PostgreSQL starts, until all of this passes.
# ---------------------------------------------------------------------------

T1_AUTHORITY="${1:-}"
if [[ -z "$T1_AUTHORITY" || ! -r "$T1_AUTHORITY" ]]; then
  t1_finish "custody"
fi
T1_PACKET_SHA=$(/usr/bin/sed -n 's/.*"packetSha256"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{64\}\)".*/\1/p' \
  "$T1_AUTHORITY" | head -n 1)
[[ ${#T1_PACKET_SHA} -eq 64 ]] || t1_finish "custody"
shasum -a 256 "$T1_AUTHORITY" > "$T1_RUN_DIR/T1-3worker-ab-preflight-authority.out"
export T1_N3_AB_PACKET_SHA256="$T1_PACKET_SHA"

shasum -a 256 "$T1_LOGS/T1-claude-3worker-ab-draft-packet.md" \
  > "$T1_RUN_DIR/T1-3worker-ab-preflight-packet.out" 2>/dev/null
t1_write_status "$?" "preflight-packet"
grep -qx "$T1_PACKET_SHA  $T1_LOGS/T1-claude-3worker-ab-draft-packet.md" \
  "$T1_RUN_DIR/T1-3worker-ab-preflight-packet.out" || t1_finish "custody"

: > "$T1_RUN_DIR/T1-3worker-ab-preflight-artifacts.out"
for artifact in ${T1_ARTIFACTS[@]}; do
  observed=$(shasum -a 256 "$T1_LOGS/$artifact" 2>/dev/null | cut -d' ' -f1)
  print -r -- "$observed  $artifact" >> "$T1_RUN_DIR/T1-3worker-ab-preflight-artifacts.out"
  grep -q "\"$artifact\"[[:space:]]*:[[:space:]]*\"$observed\"" "$T1_AUTHORITY" \
    || t1_finish "custody"
done
t1_write_status "0" "preflight-artifacts"

git rev-parse --show-toplevel > "$T1_RUN_DIR/T1-3worker-ab-preflight-toplevel.out" 2>/dev/null
t1_write_status "$?" "preflight-toplevel"
grep -qx "$T1_OUTER_ROOT" "$T1_RUN_DIR/T1-3worker-ab-preflight-toplevel.out" || t1_finish "custody"
print -r -- "$PWD" > "$T1_RUN_DIR/T1-3worker-ab-preflight-checkout.out"
grep -qx "$T1_CHECKOUT_ROOT" "$T1_RUN_DIR/T1-3worker-ab-preflight-checkout.out" \
  || t1_finish "custody"

git rev-parse HEAD > "$T1_RUN_DIR/T1-3worker-ab-preflight-head.out" 2>/dev/null
t1_write_status "$?" "preflight-head"
grep -qx "$T1_HEAD" "$T1_RUN_DIR/T1-3worker-ab-preflight-head.out" || t1_finish "custody"

git diff --cached --name-only > "$T1_RUN_DIR/T1-3worker-ab-preflight-index.out" 2>/dev/null
t1_write_status "$?" "preflight-index"
[[ -s "$T1_RUN_DIR/T1-3worker-ab-preflight-index.out" ]] && t1_finish "custody"

shasum -a 256 ${T1_GOVERNED_PATHS[@]} \
  > "$T1_RUN_DIR/T1-3worker-ab-preflight-hashes.out" 2>/dev/null
t1_write_status "$?" "preflight-hashes"
for governed in ${T1_GOVERNED[@]}; do
  grep -qx "$governed" "$T1_RUN_DIR/T1-3worker-ab-preflight-hashes.out" || t1_finish "custody"
done
[[ $(wc -l < "$T1_RUN_DIR/T1-3worker-ab-preflight-hashes.out") -eq 12 ]] || t1_finish "custody"

git diff --check > "$T1_RUN_DIR/T1-3worker-ab-preflight-whitespace.out" 2>&1
t1_write_status "$?" "preflight-whitespace"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-preflight-whitespace.status" || t1_finish "custody"

git status --porcelain > "$T1_RUN_DIR/T1-3worker-ab-entry-worktree-baseline.out" 2>/dev/null
t1_write_status "$?" "entry-worktree-baseline"

node --version > "$T1_RUN_DIR/T1-3worker-ab-preflight-node.out" 2>/dev/null
t1_write_status "$?" "preflight-node"
grep -qx "$T1_NODE_VERSION" "$T1_RUN_DIR/T1-3worker-ab-preflight-node.out" || t1_finish "custody"

pnpm exec vitest --help > "$T1_RUN_DIR/T1-3worker-ab-preflight-vitest-flags.out" 2>&1
t1_write_status "$?" "preflight-vitest-flags"
for flag in ${T1_VITEST_FLAGS[@]}; do
  grep -q -- "${flag%%=*}" "$T1_RUN_DIR/T1-3worker-ab-preflight-vitest-flags.out" \
    || t1_finish "custody"
done

for source in T1-3worker-ab-booted-rss-harness.mjs T1-3worker-ab-adjudicator.mjs \
  T1-3worker-ab-mutation-helper.mjs T1-3worker-ab-manifest-builder.mjs; do
  node --check "$T1_LOGS/$source" \
    > "$T1_RUN_DIR/T1-3worker-ab-preflight-syntax-$source.out" 2>&1
  t1_write_status "$?" "preflight-syntax-$source"
  grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-preflight-syntax-$source.status" \
    || t1_finish "custody"
done

zsh -n "$T1_LOGS/run-claude-T1-3worker-ab-diagnostic.sh" \
  > "$T1_RUN_DIR/T1-3worker-ab-preflight-wrapper-syntax.out" 2>&1
t1_write_status "$?" "preflight-wrapper-syntax"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-preflight-wrapper-syntax.status" || t1_finish "custody"

# ---------------------------------------------------------------------------
# 10. Carrier gate status.
#
# The carrier itself was created, populated and gated in section 8, before the
# run identity existed and before any durable receipt was written. Only its
# status receipt is recorded here, because the run directory did not exist yet
# when the gate ran.
# ---------------------------------------------------------------------------

t1_write_status "0" "carrier-gate"

# ---------------------------------------------------------------------------
# 11. Backups, verified trap arming, then the two approved temporary patches.
# ---------------------------------------------------------------------------

cp -p "$T1_INTEGRATION_FILE" "$T1_TMP/registration-database.test.ts.bak"
t1_write_status "$?" "backup-integration"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-backup-integration.status" || t1_finish "custody"
cp -p "$T1_ARCHITECTURE_FILE" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak"
t1_write_status "$?" "backup-architecture"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-backup-architecture.status" || t1_finish "custody"
T1_BACKUPS_TAKEN=1

shasum -a 256 "$T1_TMP/registration-database.test.ts.bak" \
  > "$T1_RUN_DIR/T1-3worker-ab-backup-hash-registration-database.out"
shasum -a 256 "$T1_TMP/t1-argon2-worker-contract.test.ts.bak" \
  > "$T1_RUN_DIR/T1-3worker-ab-backup-hash-t1-argon2-worker-contract.out"
grep -q "$T1_INTEGRATION_SHA" \
  "$T1_RUN_DIR/T1-3worker-ab-backup-hash-registration-database.out" || t1_finish "custody"
grep -q "$T1_ARCHITECTURE_SHA" \
  "$T1_RUN_DIR/T1-3worker-ab-backup-hash-t1-argon2-worker-contract.out" || t1_finish "custody"
stat -f "%N size=%z mtime=%Fm" "$T1_TMP/registration-database.test.ts.bak" \
  > "$T1_RUN_DIR/T1-3worker-ab-backup-stat-registration-database.out"
stat -f "%N size=%z mtime=%Fm" "$T1_TMP/t1-argon2-worker-contract.test.ts.bak" \
  > "$T1_RUN_DIR/T1-3worker-ab-backup-stat-t1-argon2-worker-contract.out"

trap -p INT > "$T1_RUN_DIR/T1-3worker-ab-trap-arming.out" 2>&1
trap -p TERM >> "$T1_RUN_DIR/T1-3worker-ab-trap-arming.out" 2>&1
trap -p EXIT >> "$T1_RUN_DIR/T1-3worker-ab-trap-arming.out" 2>&1
grep -q "t1_finish" "$T1_RUN_DIR/T1-3worker-ab-trap-arming.out" || t1_finish "custody"

shasum -a 256 "$T1_LOGS/T1-3worker-ab-integration.patch" \
  > "$T1_RUN_DIR/T1-3worker-ab-temp-patch-hash-registration-database.out"
shasum -a 256 "$T1_LOGS/T1-3worker-ab-architecture.patch" \
  > "$T1_RUN_DIR/T1-3worker-ab-temp-patch-hash-t1-argon2-worker-contract.out"

git apply --check "$T1_LOGS/T1-3worker-ab-integration.patch" \
  > "$T1_RUN_DIR/T1-3worker-ab-apply-check-integration.out" 2>&1
t1_write_status "$?" "apply-check-integration"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-apply-check-integration.status" || t1_finish "custody"
git apply --check "$T1_LOGS/T1-3worker-ab-architecture.patch" \
  > "$T1_RUN_DIR/T1-3worker-ab-apply-check-architecture.out" 2>&1
t1_write_status "$?" "apply-check-architecture"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-apply-check-architecture.status" || t1_finish "custody"

git apply "$T1_LOGS/T1-3worker-ab-integration.patch" \
  > "$T1_RUN_DIR/T1-3worker-ab-apply-integration.out" 2>&1
t1_write_status "$?" "apply-integration"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-apply-integration.status" || t1_finish "custody"
git apply "$T1_LOGS/T1-3worker-ab-architecture.patch" \
  > "$T1_RUN_DIR/T1-3worker-ab-apply-architecture.out" 2>&1
t1_write_status "$?" "apply-architecture"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-apply-architecture.status" || t1_finish "custody"

shasum -a 256 "$T1_INTEGRATION_FILE" "$T1_ARCHITECTURE_FILE" \
  > "$T1_RUN_DIR/T1-3worker-ab-installed-source-hashes.out"

# ---------------------------------------------------------------------------
# 12. The frozen cell matrix, with stop rules.
# ---------------------------------------------------------------------------

T1_PAIR_ARMS=(2 3  3 2  2 3  3 2  2 3  3 2  2 3  3 2  2 3  3 2)

pair=1
armIndex=0
for workers in ${T1_PAIR_ARMS[@]}; do
  cell=$(printf "integration-p%02d-a%d-w%d" "$pair" "$armIndex" "$workers")
  t1_run_cell "$cell" env "T1_N3_AB_WORKERS=$workers" "T1_N3_AB_CELL_ID=$cell" \
    NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_INTEGRATION_FILE" \
      -t "$T1_TITLE_INTEGRATION" "${T1_VITEST_FLAGS[@]}"
  t1_guard_status "$?" "$cell"
  if (( armIndex == 0 )); then armIndex=1; else armIndex=0; (( pair += 1 )); fi
done

for spec in "architecture-r1-a0-w2:2" "architecture-r1-a1-w3:3" \
  "architecture-r2-a0-w3:3" "architecture-r2-a1-w2:2"; do
  cell="${spec%%:*}"
  workers="${spec##*:}"
  t1_run_cell "$cell" env "T1_N3_AB_WORKERS=$workers" "T1_N3_AB_CELL_ID=$cell" \
    NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" \
      -t "$T1_TITLE_RESOURCE" "${T1_VITEST_FLAGS[@]}"
  t1_guard_status "$?" "$cell"
done

for spec in "fault-unconfirmed-death:$T1_TITLE_FAULT_UNCONFIRMED" \
  "fault-late-exit-before-close:$T1_TITLE_FAULT_LATE_EXIT" \
  "fault-close-time-termination-retry-fulfilled:$T1_TITLE_FAULT_RETRY"; do
  cell="${spec%%:*}"
  title="${spec#*:}"
  t1_run_cell "$cell" env T1_N3_AB_WORKERS=3 "T1_N3_AB_CELL_ID=$cell" \
    NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" \
      -t "$title" "${T1_VITEST_FLAGS[@]}"
  t1_guard_status "$?" "$cell"
done

t1_run_cell "positive-control-retain-4mib" env T1_N3_AB_WORKERS=2 \
  T1_N3_AB_CELL_ID=positive-control-retain-4mib T1_N3_AB_RETAIN_MIB_PER_WAVE=4 \
  NODE_OPTIONS=--expose-gc pnpm exec vitest run "$T1_ARCHITECTURE_FILE" \
    -t "$T1_TITLE_POSITIVE_CONTROL" "${T1_VITEST_FLAGS[@]}"
t1_guard_status "$?" "positive-control-retain-4mib"

pair=1
armIndex=0
for workers in ${T1_PAIR_ARMS[@]}; do
  cell=$(printf "standalone-p%02d-a%d-w%d" "$pair" "$armIndex" "$workers")
  t1_run_cell "$cell" env "T1_N3_AB_WORKERS=$workers" "T1_N3_AB_CELL_ID=$cell" \
    node --expose-gc --import tsx "$T1_LOGS/T1-3worker-ab-booted-rss-harness.mjs"
  t1_guard_status "$?" "$cell"
  if (( armIndex == 0 )); then armIndex=1; else armIndex=0; (( pair += 1 )); fi
done

# ---------------------------------------------------------------------------
# 13. Mutants 1-7. Each stops the run AT ONCE on a survivor, a zero selection or
#     the wrong intended failure. Nothing is deferred to adjudication.
# ---------------------------------------------------------------------------

t1_vitest_mutant() {
  local name="$1" file="$2" title="$3" workers="$4"
  local anchor="$5" expected="$6" replacement="$7" intended="$8"
  # Never start a later mutant after a timeout, an identity failure or any
  # earlier stop. Science does not continue past a block.
  (( T1_STOP_SCIENCE == 1 )) && t1_finish

  # The pre-image is the INSTALLED temporary source: the mutant's restoration
  # target is the patched file the normal cells ran against. The governed entry
  # bytes are restored once, at the end, from the `cp -p` backup.
  cp -p "$file" "$T1_TMP/$name-preimage.ts" || { t1_block "mutant"; t1_finish }
  shasum -a 256 "$T1_TMP/$name-preimage.ts" \
    > "$T1_RUN_DIR/T1-3worker-ab-$name-preimage-hash.out"

  node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" \
    --source "$T1_TMP/$name-preimage.ts" --destination "$file" \
    --anchor "$anchor" --expected "$expected" --replacement "$replacement" \
    > "$T1_RUN_DIR/T1-3worker-ab-$name-mutate.out" \
    2> "$T1_RUN_DIR/T1-3worker-ab-$name-mutate.err"
  t1_write_status "$?" "$name-mutate"
  grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-$name-mutate.status" || { t1_block "mutant"; t1_finish }

  t1_run_cell "$name" env "T1_N3_AB_WORKERS=$workers" "T1_N3_AB_CELL_ID=$name" \
    NODE_OPTIONS=--expose-gc pnpm exec vitest run "$file" -t "$title" "${T1_VITEST_FLAGS[@]}"
  local mutant_status=$?

  cp -p "$T1_TMP/$name-preimage.ts" "$file"
  cmp "$file" "$T1_TMP/$name-preimage.ts"
  t1_write_status "$?" "$name-restore"
  shasum -a 256 "$file" > "$T1_RUN_DIR/T1-3worker-ab-$name-restore-hash.out"
  stat -f "%N size=%z mtime=%Fm" "$file" > "$T1_RUN_DIR/T1-3worker-ab-$name-restore-stat.out"
  grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-$name-restore.status" \
    || { t1_block "restoration"; t1_finish }

  # A 512 MiB breach inside a mutant process is rss-safety, and it is checked
  # BEFORE the intended failure is accepted. A mutant's expected RED must never
  # mask the ceiling: "the mutant failed as designed" and "this process crossed
  # 512 MiB" are different facts, and the second one outranks the first.
  if grep -qF "[T1_N3_AB_RSS_SAFETY_EXCEEDED]" "$T1_RUN_DIR/T1-3worker-ab-$name.out" \
    || (( mutant_status == 3 )); then
    T1_STOP_SCIENCE=1
    t1_block "rss-safety"
    t1_finish
  fi

  # Survivor, zero selection and wrong intended failure all stop HERE.
  (( mutant_status == 0 )) && { t1_block "mutant"; t1_finish }
  grep -qF "$intended" "$T1_RUN_DIR/T1-3worker-ab-$name.out" \
    "$T1_RUN_DIR/T1-3worker-ab-$name.err" || { t1_block "mutant"; t1_finish }
  grep -qE "Tests[^0-9]*[1-9][0-9]* (failed|passed)|Tests .*\([1-9][0-9]*\)" \
    "$T1_RUN_DIR/T1-3worker-ab-$name.out" || { t1_block "mutant"; t1_finish }
  return 0
}

t1_vitest_mutant "mutant-01-enqueue-reported-as-dispatch" \
  "$T1_INTEGRATION_FILE" "$T1_TITLE_INTEGRATION" 2 \
  "T1-N3-AB-ANCHOR-M1-ENQUEUE-STAMP" \
  "        const enqueuedAt = enqueueAt.get(job.id);" \
  "        const enqueuedAt = dispatchAt.get(job.id);" \
  "T1_N3_AB_QUEUE_OBSERVED_BUT_NO_DWELL"

t1_vitest_mutant "mutant-02-settlement-reported-as-dispatch" \
  "$T1_INTEGRATION_FILE" "$T1_TITLE_INTEGRATION" 2 \
  "T1-N3-AB-ANCHOR-M2-SETTLE-STAMP" \
  "        const settledAt = performance.now();" \
  "        const settledAt = dispatchAt.get(job.id) ?? performance.now();" \
  "T1_N3_AB_SERVICE_ENVELOPE_POSITIVE"

t1_vitest_mutant "mutant-03-omit-one-credential-job-from-ordinal-map" \
  "$T1_INTEGRATION_FILE" "$T1_TITLE_INTEGRATION" 2 \
  "T1-N3-AB-ANCHOR-M3-ORDINAL-MAP" \
  "      if (recording && lane === \"credential\" && scope !== undefined) {" \
  "      if (recording && lane === \"credential\" && scope !== undefined && scope.ordinal !== 0) {" \
  "T1_N3_AB_ORDINAL_MAP_COVERS_EVERY_CREDENTIAL_JOB"

t1_vitest_mutant "mutant-04-secretly-keep-two-workers-in-three-worker-cell" \
  "$T1_INTEGRATION_FILE" "$T1_TITLE_INTEGRATION" 3 \
  "T1-N3-AB-ANCHOR-M4-WORKER-COUNT" \
  "  if (argon2Pool === undefined) argon2Pool = new Argon2WorkerPool({ workers: T1_N3_AB_WORKERS });" \
  "  if (argon2Pool === undefined) argon2Pool = new Argon2WorkerPool({ workers: 2 });" \
  "T1_N3_AB_WORKER_COUNT_NOT_HONOURED"

t1_vitest_mutant "mutant-05-harness-control-physical-alive-four" \
  "$T1_ARCHITECTURE_FILE" "$T1_TITLE_FAULT_UNCONFIRMED" 3 \
  "T1-N3-AB-ANCHOR-M5-PHYSICAL-ALIVE" \
  "      const physicalAlive = spawned.filter((handle) => !handle.exited).length;" \
  "      const physicalAlive = 4;" \
  "T1_N3_AB_PHYSICAL_ALIVE_NEVER_EXCEEDS_THREE"

t1_vitest_mutant "mutant-06-sample-rss-only-after-settlement" \
  "$T1_ARCHITECTURE_FILE" "$T1_TITLE_RESOURCE" 3 \
  "T1-N3-AB-ANCHOR-M6-RSS-SAMPLE" \
  "          wavePeak = Math.max(wavePeak, observeRss());" \
  "          wavePeak = Math.max(wavePeak, 0);" \
  "T1_N3_AB_RSS_SAMPLED_IN_FLIGHT"

t1_vitest_mutant "mutant-07-skip-one-worker-warm-up" \
  "$T1_ARCHITECTURE_FILE" "$T1_TITLE_RESOURCE" 3 \
  "T1-N3-AB-ANCHOR-M7-WARM-UP" \
  "      const warmUpCount = workers;" \
  "      const warmUpCount = workers - 1;" \
  "T1_N3_AB_WARM_UP_COVERED_EVERY_WORKER"

# ---------------------------------------------------------------------------
# 14. Adjudicator clean control and mutants 8-10, against temporary copies.
# ---------------------------------------------------------------------------

t1_run_cell "adjudicator-clean-self-test" \
  node "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" --self-test
(( $? == 0 )) || { t1_block "mutant"; t1_finish }

t1_adjudicator_mutant() {
  local name="$1" anchor="$2" expected="$3" replacement="$4" intended="$5"
  (( T1_STOP_SCIENCE == 1 )) && t1_finish
  node "$T1_LOGS/T1-3worker-ab-mutation-helper.mjs" \
    --source "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" \
    --destination "$T1_TMP/$name.mjs" \
    --anchor "$anchor" --expected "$expected" --replacement "$replacement" \
    > "$T1_RUN_DIR/T1-3worker-ab-$name-mutate.out" \
    2> "$T1_RUN_DIR/T1-3worker-ab-$name-mutate.err"
  t1_write_status "$?" "$name-mutate"
  grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-$name-mutate.status" || { t1_block "mutant"; t1_finish }

  t1_run_cell "$name" node "$T1_TMP/$name.mjs" --self-test
  local mutant_status=$?

  # Deliberately inverted: the mutated copy MUST differ from the governed file.
  cmp "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" "$T1_TMP/$name.mjs" \
    > "$T1_RUN_DIR/T1-3worker-ab-$name-governed-untouched.out" 2>&1
  t1_write_status "$?" "$name-governed-untouched"
  grep -q "^1 " "$T1_RUN_DIR/T1-3worker-ab-$name-governed-untouched.status" \
    || { t1_block "custody"; t1_finish }

  (( mutant_status == 0 )) && { t1_block "mutant"; t1_finish }
  grep -qF "$intended" "$T1_RUN_DIR/T1-3worker-ab-$name.out" \
    "$T1_RUN_DIR/T1-3worker-ab-$name.err" || { t1_block "mutant"; t1_finish }
  return 0
}

t1_adjudicator_mutant "mutant-08-label-candidate-rss-bound-ratified" \
  "T1-N3-AB-ANCHOR-M8-RSS-LABEL" \
  "    if (report.rssBoundStatus !== REQUIRED_RSS_BOUND_LABEL) {" \
  "    if (false) {" \
  "guard-fires:every-rss-bound-labelled-unratified-candidate"

t1_adjudicator_mutant "mutant-09-map-not-reproduced-to-causal-marker" \
  "T1-N3-AB-ANCHOR-M9-CAUSAL-MARKER" \
  "  if (ordinarySignature && historicalRedReproduced) marker = SCIENTIFIC_MARKERS.reproduced;" \
  "  if (ordinarySignature) marker = SCIENTIFIC_MARKERS.reproduced;" \
  "not-reproduced-maps-to-ordinary-not-causal-marker"

t1_adjudicator_mutant "mutant-10-disable-full-receipt-secret-scan" \
  "T1-N3-AB-ANCHOR-M10-SECRET-SCAN" \
  '    const hits = scanReceiptBody(`${receipt.stdout}\n${receipt.stderr}`, literals, normalize);' \
  "    const hits = [];" \
  "guard-fires:no-generated-literal-in-receipt"

# ---------------------------------------------------------------------------
# 15. Settle, reap, restore, verify custody, THEN build the closed inventory.
#     Restoration happens BEFORE manifest construction and adjudication.
# ---------------------------------------------------------------------------

t1_terminate_active
if ! t1_restore; then
  print -r -- "CODEX BLOCKED (restoration)"
  T1_FINISHED=1
  rm -rf "$T1_TMP"
  exit 74
fi

git rev-parse HEAD > "$T1_RUN_DIR/T1-3worker-ab-final-head.out" 2>/dev/null
grep -qx "$T1_HEAD" "$T1_RUN_DIR/T1-3worker-ab-final-head.out" || { t1_block "custody"; t1_finish }
git diff --cached --name-only > "$T1_RUN_DIR/T1-3worker-ab-final-index.out" 2>/dev/null
[[ -s "$T1_RUN_DIR/T1-3worker-ab-final-index.out" ]] && { t1_block "custody"; t1_finish }
shasum -a 256 ${T1_GOVERNED_PATHS[@]} > "$T1_RUN_DIR/T1-3worker-ab-final-hashes.out" 2>/dev/null
for governed in ${T1_GOVERNED[@]}; do
  grep -qx "$governed" "$T1_RUN_DIR/T1-3worker-ab-final-hashes.out" \
    || { t1_block "custody"; t1_finish }
done
git diff --check > "$T1_RUN_DIR/T1-3worker-ab-final-whitespace.out" 2>&1
(( $? == 0 )) || { t1_block "custody"; t1_finish }
git status --porcelain > "$T1_RUN_DIR/T1-3worker-ab-final-worktree.out" 2>/dev/null
t1_verify_descendants_gone || { t1_block "custody"; t1_finish }

node "$T1_LOGS/T1-3worker-ab-manifest-builder.mjs" \
  --run-dir "$T1_RUN_DIR" --artifacts "$T1_LOGS" --launch-authority "$T1_AUTHORITY" \
  --literal-carrier "$T1_CARRIER" --run-commitment "$T1_RUN_COMMITMENT" \
  --out "T1-3worker-ab-manifest.json" \
  > "$T1_RUN_DIR/T1-3worker-ab-manifest-build.out" \
  2> "$T1_RUN_DIR/T1-3worker-ab-manifest-build.err"
t1_write_status "$?" "manifest-build"
print -r -- "manifest-build" >> "$T1_RUN_DIR/T1-3worker-ab-finalization-order.out"
grep -q "^0 " "$T1_RUN_DIR/T1-3worker-ab-manifest-build.status" || { t1_block "receipt"; t1_finish }

# ---------------------------------------------------------------------------
# 16. Stage one: the adjudicator validates the closed inventory and exits.
# ---------------------------------------------------------------------------

node "$T1_LOGS/T1-3worker-ab-adjudicator.mjs" \
  "T1-3worker-ab-run-$T1_RUN_ID/T1-3worker-ab-manifest.json" \
  --literal-carrier "$T1_CARRIER" --run-commitment "$T1_RUN_COMMITMENT" \
  > "$T1_RUN_DIR/T1-3worker-ab-adjudication.out" \
  2> "$T1_RUN_DIR/T1-3worker-ab-adjudication.err"
T1_ADJUDICATION_STATUS=$?
print -r -- "$T1_ADJUDICATION_STATUS $T1_RUN_COMMITMENT" \
  > "$T1_RUN_DIR/T1-3worker-ab-adjudication.status"

# ---------------------------------------------------------------------------
# 17. Stage two: the terminal scanner.
#
# It validates exactly the adjudicator's three receipts — stdout, stderr and raw
# status — and nothing else. Its verdict is a fixed code written to private
# scratch, never a durable receipt, so it can never become an input to the
# adjudication it just checked.
# ---------------------------------------------------------------------------

"$T1_PYTHON" - "$T1_RUN_DIR/T1-3worker-ab-adjudication.out" \
  "$T1_RUN_DIR/T1-3worker-ab-adjudication.err" \
  "$T1_RUN_DIR/T1-3worker-ab-adjudication.status" \
  "$T1_CARRIER" "$T1_ADJUDICATION_STATUS" "$T1_RUN_COMMITMENT" \
  > "$T1_TMP/terminal-scan.out" 2>&1 <<'T1_TERMINAL_SCANNER'
import re
import sys

out_path, err_path, status_path, carrier_path, raw_status, run_commitment = sys.argv[1:7]
ansi = re.compile(r"[\x1b\x9b][\[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nqry=><]")
read = lambda path: ansi.sub("", open(path, "r", encoding="utf-8", errors="replace").read())

stdout_text, stderr_text, status_text = read(out_path), read(err_path), read(status_path)
literals = [line.strip() for line in open(carrier_path, encoding="utf-8") if line.strip()]

SCIENTIFIC = [
    "THREE-WORKER A/B REPRODUCED AND SUPPORTS CREDENTIAL CONCURRENCY HYPOTHESIS",
    "THREE-WORKER A/B ORDINARY QUEUE SIGNATURE ONLY — HISTORICAL RED NOT REPRODUCED",
    "THREE-WORKER A/B CONTRADICTS CREDENTIAL CONCURRENCY HYPOTHESIS",
    "THREE-WORKER A/B MIXED OR INCONCLUSIVE",
]
BLOCKED = ["CODEX BLOCKED (%s)" % kind for kind in
           ("custody", "secret", "rss-safety", "restoration", "receipt", "normal-cell", "mutant")]
SHAPES = [
    ("email", r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    ("uuid", r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"),
    ("long-hex", r"\b[0-9a-f]{32,}\b"),
    ("argon2", r"\$argon2"),
    ("ipv4", r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    ("ipv6-doc", r"\b2001:db8:[0-9a-f:]{2,}"),
    ("request-id", r"request[:=][A-Za-z0-9:_-]{2,}"),
    ("path", r"/(?:private/)?(?:var|tmp|Users)/[^\s\"']+"),
]

problems = []
status = int(raw_status) if raw_status.isdigit() else -1

# The status receipt is part of what is scanned, not merely a side input. Its
# grammar, its integer and its run binding are all checked, and the commitment
# is site-verified and normalized before the generic shape scans run — so an
# approved 64-hex value is exempted at exactly one site and nowhere else.
status_match = re.fullmatch(r"(\d{1,3}) ([0-9a-f]{64})\s*", status_text)
if status_match is None:
    problems.append("status-receipt-grammar")
else:
    if int(status_match.group(1)) != status:
        problems.append("status-receipt-integer-mismatch")
    if status_match.group(2) != run_commitment:
        problems.append("status-receipt-not-bound-to-this-run")

body = stdout_text + "\n" + stderr_text + "\n" + status_text
body = body.replace(run_commitment, "[T1_N3_AB_APPROVED_RUN_COMMITMENT]")

for literal in literals:
    if literal and literal in body:
        problems.append("generated-literal")
        break
for name, pattern in SHAPES:
    if re.search(pattern, body):
        problems.append("shape:" + name)

# Lawful markers are counted across the ENTIRE stdout, not sampled from the last
# line. A run that printed a blocked marker and then a scientific one would have
# passed a last-line check while being exactly the confusion this exists to
# prevent.
stdout_lines = [line.strip() for line in stdout_text.split("\n") if line.strip()]
scientific_hits = [line for line in stdout_lines if line in SCIENTIFIC]
blocked_hits = [line for line in stdout_lines if line in BLOCKED]
total_hits = len(scientific_hits) + len(blocked_hits)
marker = stdout_lines[-1] if stdout_lines else ""
if total_hits != 1:
    problems.append("exactly-one-lawful-marker")
if marker not in SCIENTIFIC and marker not in BLOCKED:
    problems.append("final-line-is-not-the-lawful-marker")
if any(line in SCIENTIFIC or line in BLOCKED for line in
       [entry.strip() for entry in stderr_text.split("\n") if entry.strip()]):
    problems.append("marker-printed-on-stderr")
if status == 0 and (len(scientific_hits) != 1 or blocked_hits):
    problems.append("status-0-requires-exactly-one-scientific-marker")
if status == 2 and (len(blocked_hits) != 1 or scientific_hits):
    problems.append("status-2-requires-exactly-one-blocked-marker")
if status == 3 and blocked_hits != ["CODEX BLOCKED (rss-safety)"]:
    problems.append("status-3-requires-rss-safety")
if status not in (0, 2, 3):
    problems.append("status-not-lawful")

print("T1_N3_AB_TERMINAL_SCAN=" + ("CLEAN" if not problems else "BLOCKED"))
print("T1_N3_AB_TERMINAL_PROBLEMS=" + ",".join(sorted(set(problems)) or ["none"]))
print("T1_N3_AB_TERMINAL_STATUS=%d" % status)
raise SystemExit(0 if not problems else 2)
T1_TERMINAL_SCANNER
T1_TERMINAL_STATUS=$?

grep -q "T1_N3_AB_TERMINAL_SCAN=CLEAN" "$T1_TMP/terminal-scan.out" \
  || { t1_block "secret"; t1_finish }
(( T1_TERMINAL_STATUS == 0 )) || { t1_block "secret"; t1_finish }

# The terminal scanner accepted. Everything durable is now exactly what was
# adjudicated, and nothing after this point may rewrite it.
T1_EVIDENCE_SEALED=1
rm -f "$T1_CARRIER"

# The marker is read only after the terminal scan accepted it, and is matched
# byte for byte against the lawful sets. There is no prefix wildcard.
T1_MARKER=$(tail -n 1 "$T1_RUN_DIR/T1-3worker-ab-adjudication.out")
T1_MARKER_LAWFUL=0
for candidate in ${T1_SCIENTIFIC_MARKERS[@]}; do
  [[ "$T1_MARKER" == "$candidate" ]] && T1_MARKER_LAWFUL=1
done
T1_MARKER_BLOCKED=0
for candidate in ${T1_BLOCKED_MARKERS[@]}; do
  [[ "$T1_MARKER" == "$candidate" ]] && { T1_MARKER_LAWFUL=1; T1_MARKER_BLOCKED=1 }
done
(( T1_MARKER_LAWFUL == 1 )) || { t1_block "receipt"; t1_finish }

case "$T1_ADJUDICATION_STATUS" in
  0) (( T1_MARKER_BLOCKED == 1 )) && { t1_block "receipt"; t1_finish } ;;
  2) (( T1_MARKER_BLOCKED == 1 )) || { t1_block "receipt"; t1_finish }
     t1_block "${${T1_MARKER#CODEX BLOCKED \(}%\)}" ;;
  3) t1_block "rss-safety" ;;
  *) t1_block "receipt" ;;
esac

t1_finish
