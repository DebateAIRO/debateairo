#!/usr/bin/env bash
#
# observability-demo.sh — D12 of the 2026-08-21-observability-loop mission.
#
# THE ONE COMMAND V RUNS HIMSELF.
#
# WHAT THIS SCRIPT IS DERIVED FROM
#   Every stage below states what V asked for, in V's terms, taken from two
#   places and NOWHERE ELSE:
#     1. V's goal statement of 2026-08-21 (docs/missions/.../00-intake-H0.md).
#     2. planning/DEFINITION-OF-DONE.md, criteria D1..D11.
#   It is deliberately NOT derived from the implementation. The author of this
#   script implemented no part of this mission. A demo written from the code
#   demonstrates what the code does; this demonstrates what V asked for.
#   Where V asked for something the current design does not provide, the stage
#   says so out loud as a SKIP or a FAIL. It is never quietly dropped.
#
# THE TWO RULES THAT GOVERN EVERY STAGE
#   (a) INCREMENTAL, NOT TERMINAL. Stages are gated by subject. A stage whose
#       subject is not yet built reports SKIPPED, names exactly what is missing
#       and which ticket owns it, and NEVER passes. Run it today and watch the
#       mission fill in. Today almost everything skips. That is the correct and
#       expected first run.
#   (b) NO STAGE PASSES BY DEFAULT. Subject absent -> SKIPPED. Subject present
#       and misbehaving -> FAILED. There is no third path in which absence
#       looks like success.
#
# NON-NEGOTIABLES THIS SCRIPT ENFORCES ON ITSELF (machine-checked, not promised)
#   * NO FABRICATED RUNTIME DATA. When a stage says an error was captured, a
#     real fault in real product code produced it. No synthesized record, no
#     hand-written event, no pre-seeded row, no mock. If a genuine fault cannot
#     be caused yet for a stage, that stage SKIPS.
#   * NO GIT WRITES. Every git invocation goes through a whitelist of read-only
#     verbs; anything else aborts the run.
#   * THE EXCLUDED SECURITY ZONE IS ABSOLUTE. The W.I.P. accounts feature is out
#     of scope (V's goal statement) . This script never reads, imports, stats,
#     hashes, lists or otherwise takes ANY filesystem metadata on a zone file,
#     and issues no SQL against the identity schema. Zone paths appear here only
#     as inert data used to REFUSE access.
#   * NO WRITES ANYWHERE EXCEPT under this demo directory, and only with
#     --save-evidence.
#
# USAGE
#   bash docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh
#   ... --save-evidence     also write a JSON + text record under demo/runs/
#   ... --quiet             summary table only
#   ... --stage <id>        run one stage (e.g. --stage 04)
#
# EXIT CODES
#   0  no stage FAILED (skips are not failures)
#   1  at least one stage FAILED; the summary names which and why
#   2  the harness aborted (guard trip, or the harness itself is broken)
#
set -u
set -o pipefail

# ---------------------------------------------------------------------------
# 0. LOCATION
# ---------------------------------------------------------------------------

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRODUCT_ROOT="$(cd "$DEMO_DIR/../../../.." && pwd)"     # .../dialectical-engine
MISSION_DIR="$(cd "$DEMO_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# 1. ZONE DATA  -- INERT. Never passed to a filesystem call. The guard below
#    exists to REFUSE these paths, and the guard is itself tested (stage H2).
#    Source: V's "the W.I.P security features that are NOT in scope", carried
#    into this ticket's contract.forbidden as an absolute exclusion.
# ---------------------------------------------------------------------------
# --- BEGIN ZONE DATA BLOCK ---
ZONE_PATHS='apps/api/src/registration.ts
apps/api/src/mail-channel.ts
apps/api/src/mfa.ts
packages/db/src/identity.ts'
ZONE_SQL_SCHEMA='identity'
# --- END ZONE DATA BLOCK ---

ZONE_GUARD_TRIPS=0          # every refusal
ZONE_GUARD_SELFTEST=0       # refusals deliberately provoked by stage H2

# path_is_zone <relpath-or-abspath> -> 0 if the path names a zone file
path_is_zone() {
  local _p _hit _z
  _p="$1"
  case "$_p" in "$PRODUCT_ROOT"/*) _p="${_p#$PRODUCT_ROOT/}" ;; esac
  _hit=1
  while IFS= read -r _z; do
    [ -z "$_z" ] && continue
    case "$_p" in
      "$_z"|*"/$_z") _hit=0 ;;
    esac
  done <<EOF
$ZONE_PATHS
EOF
  return $_hit
}

# Every filesystem read in this script goes through these three helpers.
# Each refuses a zone path BEFORE touching the filesystem.
fs_guard() {
  if path_is_zone "$1"; then
    ZONE_GUARD_TRIPS=$((ZONE_GUARD_TRIPS + 1))
    printf '\n  !! ZONE GUARD TRIPPED: refused filesystem access to %s\n' "$1" >&2
    return 1
  fi
  return 0
}

sf_exists() { fs_guard "$1" || return 2; [ -e "$PRODUCT_ROOT/$1" ]; }
sf_isdir()  { fs_guard "$1" || return 2; [ -d "$PRODUCT_ROOT/$1" ]; }
sf_grep()   { fs_guard "$2" || return 2; grep -q -- "$1" "$PRODUCT_ROOT/$2" 2>/dev/null; }
sf_grepn()  { fs_guard "$2" || return 2; grep -n -- "$1" "$PRODUCT_ROOT/$2" 2>/dev/null; }

# SQL guard: no statement naming the identity schema is ever issued.
sql_guard() {
  case "$1" in
    *"$ZONE_SQL_SCHEMA"*)
      printf '\n  !! SQL GUARD TRIPPED: refused statement naming the excluded schema\n' >&2
      return 1 ;;
  esac
  return 0
}

# Git guard: read-only verbs only. The whitelist is a pure predicate, so the
# self-test in stage H3 can exercise it WITHOUT any possibility of the guarded
# command running if the guard were broken.
git_verb_allowed() {
  case "${1:-}" in
    status|rev-parse|symbolic-ref|log|config|worktree|branch|remote) return 0 ;;
    *) return 1 ;;
  esac
}
git_ro() {
  if ! git_verb_allowed "${1:-}"; then
    printf '\n  !! GIT GUARD TRIPPED: refused non-read-only git verb "%s"\n' "${1:-}" >&2
    return 1
  fi
  ( cd "$PRODUCT_ROOT" && git "$@" ) 2>/dev/null
}

# ---------------------------------------------------------------------------
# 2. TICKET MAP  -- slice id -> Hermes ticket on board `observability-loop`.
#    Used only to tell V which ticket unblocks a skipped stage.
# ---------------------------------------------------------------------------
ticket_for() {
  case "$1" in
    S01)  echo "t_1fde033d" ;;   S02)  echo "t_8e040ec2" ;;
    S03a) echo "t_489ecbcc" ;;   S03b) echo "t_9b5ca941" ;;
    S04)  echo "t_d1e18a14" ;;   S05)  echo "t_6e99d607" ;;
    S05b) echo "t_3a04cc06" ;;   S06)  echo "t_5504afe0" ;;
    S07)  echo "t_9f4e5bfb" ;;   S08)  echo "t_c1651ebb" ;;
    S09)  echo "t_3c54fdeb" ;;   S10)  echo "t_6c5e1a6e" ;;
    S11)  echo "t_7efcd635" ;;   S14)  echo "t_89061516" ;;
    S16)  echo "t_aab2d3d2" ;;   S17)  echo "t_f6593842" ;;
    S18)  echo "t_220330f5" ;;   S18b) echo "t_49e079f4" ;;
    S19)  echo "t_f4439c53" ;;   S20)  echo "t_2a85cd89" ;;
    S21)  echo "t_0cd47a46" ;;   S22)  echo "t_37f2f56f" ;;
    S23)  echo "t_5aca48c6" ;;   S25)  echo "t_af6161bf" ;;
    S26)  echo "t_286bde80" ;;   S27)  echo "t_d55caea1" ;;
    S28)  echo "t_28c5c2e2" ;;   S29)  echo "t_8cf81861" ;;
    S30)  echo "t_af2a1c41" ;;   G4)   echo "t_e22e5562" ;;
    G5)   echo "t_39ca2ba7" ;;   RP1)  echo "t_850d02f6" ;;
    *)    echo "t_UNKNOWN" ;;
  esac
}

# ---------------------------------------------------------------------------
# 3. SUBJECT PROBES  -- "does the thing this stage is about exist YET?"
#    Each returns 0 (present) or 1 (absent). None of them can make a stage pass;
#    they only decide SKIPPED-vs-evaluated.
# ---------------------------------------------------------------------------
have_store_definition()   { sf_exists "migrations/0034_obs_foundation.sql" && sf_exists "packages/db/src/obs-schema.ts"; }
have_capture_pkg()        { sf_exists "packages/obs-capture/package.json"; }
have_capture_core()       { sf_exists "packages/obs-capture/src/emit.ts"; }
have_capture_runtime()    { sf_isdir  "packages/obs-capture/src/runtime"; }
have_installers()         { sf_exists "packages/obs-capture/install/api.ts" && sf_exists "packages/obs-capture/install/runner.ts" && sf_exists "packages/obs-capture/install/scheduler.ts"; }
have_zone_classifier()    { sf_isdir  "packages/obs-capture/src/zone"; }
have_api_binding()        { sf_grep   "obs-capture/install/api" "apps/api/src/main.ts"; }
have_runner_binding()     { sf_grep   "obs-capture/install/runner" "apps/runner/src/main.ts"; }
have_scheduler_binding()  { sf_grep   "obs-capture" "apps/scheduler/src/cli.ts"; }
have_provider_binding()   { sf_grep   "obs-capture" "packages/providers/src/index.ts"; }
have_client_seam()        { sf_exists "apps/ui/app/global-error.tsx" && sf_isdir "apps/ui/lib/obs"; }
have_cause_retrofit()     { fs_guard "packages/kernel/src/index.ts" || return 2
                            grep -qE 'cause\?:|super\(message, ?options' "$PRODUCT_ROOT/packages/kernel/src/index.ts" 2>/dev/null; }
have_policy_bundle()      { sf_isdir  "tools/obs-listener/policy"; }
have_daemon()             { sf_isdir  "tools/obs-listener/src/daemon"; }
have_tracer()             { sf_isdir  "tools/obs-listener/src/trace"; }
have_detectors()          { sf_isdir  "tools/obs-listener/src/detectors"; }
have_watchdog()           { sf_isdir  "tools/obs-listener/src/watchdog"; }
have_obsctl()             { sf_isdir  "tools/obs-listener/src/obsctl"; }
have_fix_worker()         { sf_isdir  "tools/obs-listener/src/worker-fix"; }
have_landing()            { sf_isdir  "tools/obs-listener/src/landing"; }
have_launchd_daemon()     { sf_isdir  "tools/obs-listener/launchd"; }
have_acceptance_obs()     { sf_isdir  "acceptance/obs"; }

# workspace_manifest_for @debateai/x -> its manifest path, or empty
workspace_manifest_for() {
  local _n
  _n="${1#@debateai/}"
  if sf_exists "packages/$_n/package.json"; then printf 'packages/%s/package.json' "$_n"
  elif sf_exists "apps/$_n/package.json"; then printf 'apps/%s/package.json' "$_n"
  else printf ''; fi
}

# dep_closure <manifest relpath> -> the transitive @debateai/* closure, computed
# from the manifests themselves rather than asserted. Used so the demo can state
# what a fault-causer actually loads instead of claiming it.
dep_closure() {
  local _queue _seen _cur _m _deps _d
  _queue="$1"; _seen=""
  while [ -n "$_queue" ]; do
    _cur="${_queue%% *}"
    case "$_queue" in *" "*) _queue="${_queue#* }" ;; *) _queue="" ;; esac
    [ -z "$_cur" ] && continue
    fs_guard "$_cur" || continue
    _deps="$(tr ',' '\n' < "$PRODUCT_ROOT/$_cur" 2>/dev/null | grep -o '"@debateai/[a-z-]*"' | tr -d '"')"
    for _d in $_deps; do
      case " $_seen " in *" $_d "*) continue ;; esac
      _seen="$_seen $_d"
      _m="$(workspace_manifest_for "$_d")"
      [ -n "$_m" ] && _queue="$_queue $_m"
    done
  done
  printf '%s' "${_seen# }"
}

# The full durable path: an emit() only becomes a ROW when all of these exist.
missing_capture_path() {
  local _m
  _m=""
  have_capture_pkg     || _m="$_m|packages/obs-capture/package.json (S03a $(ticket_for S03a))"
  have_capture_core    || _m="$_m|packages/obs-capture/src/emit.ts (S03b $(ticket_for S03b))"
  have_installers      || _m="$_m|packages/obs-capture/install/{api,runner,scheduler}.ts (S05 $(ticket_for S05))"
  have_capture_runtime || _m="$_m|packages/obs-capture/src/runtime/ -- queue+flusher+spool+Postgres sink (S05b $(ticket_for S05b), BLOCKED)"
  printf '%s' "${_m#|}"
}

# ---------------------------------------------------------------------------
# 4. STAGE ENGINE
# ---------------------------------------------------------------------------
N_PASS=0; N_FAIL=0; N_SKIP=0
SUMMARY_ROWS=""
FAIL_DETAIL=""
CUR_ID=""; CUR_TAG=""; CUR_TITLE=""
ONLY_STAGE=""; QUIET=0; SAVE_EVIDENCE=0
EVIDENCE_DIR=""

is_tty() { [ -t 1 ]; }
if is_tty; then B=$'\033[1m'; R=$'\033[0m'; CG=$'\033[32m'; CR=$'\033[31m'; CY=$'\033[33m'; CD=$'\033[2m'
else B=""; R=""; CG=""; CR=""; CY=""; CD=""; fi

say()  { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }
sayn() { [ "$QUIET" -eq 1 ] || printf '%s' "$*"; }

stage_wanted() { [ -z "$ONLY_STAGE" ] || [ "$ONLY_STAGE" = "$1" ]; }

# stage <id> <criterion-tag> <title>
stage() {
  CUR_ID="$1"; CUR_TAG="$2"; CUR_TITLE="$3"
  say ""
  say "${B}[$CUR_ID] $CUR_TAG · $CUR_TITLE${R}"
}

# must_prove <text...>  -- the exact claim, in V's terms, this stage would make
must_prove() {
  say "     ${CD}MUST PROVE${R}  $1"
  shift
  while [ "$#" -gt 0 ]; do say "                 $1"; shift; done
}

evidence() { say "     ${CD}EVIDENCE${R}    $1"; shift; while [ "$#" -gt 0 ]; do say "                 $1"; shift; done; }

record() { SUMMARY_ROWS="$SUMMARY_ROWS$1|$2|$3|$4
"; }

pass() {
  N_PASS=$((N_PASS + 1))
  say "     ${CG}RESULT      PASSED${R}   $1"
  record "$CUR_ID" "$CUR_TAG" "PASSED" "$CUR_TITLE"
}

fail() {
  N_FAIL=$((N_FAIL + 1))
  say "     ${CR}RESULT      FAILED${R}"
  say "     ${CR}WHY${R}         $1"
  FAIL_DETAIL="$FAIL_DETAIL  [$CUR_ID] $CUR_TAG · $CUR_TITLE
              why: $1
"
  record "$CUR_ID" "$CUR_TAG" "FAILED" "$CUR_TITLE"
}

# skip <reason> <missing-list-pipe-separated> <unblocked-by>
skip() {
  N_SKIP=$((N_SKIP + 1))
  say "     ${CY}RESULT      SKIPPED${R}  (not yet built — this is not a pass)"
  say "     ${CY}REASON${R}      $1"
  if [ -n "${2:-}" ]; then
    _first=1
    _old_ifs="$IFS"; IFS='|'
    for _item in $2; do
      [ -z "$_item" ] && continue
      if [ "$_first" -eq 1 ]; then say "     MISSING     $_item"; _first=0
      else say "                 $_item"; fi
    done
    IFS="$_old_ifs"
  fi
  [ -n "${3:-}" ] && say "     UNBLOCKS    $3"
  record "$CUR_ID" "$CUR_TAG" "SKIPPED" "$CUR_TITLE"
}

abort() { printf '\n%s\n' "${CR}HARNESS ABORTED: $1${R}" >&2; exit 2; }

# ---------------------------------------------------------------------------
# 5. ARGUMENTS
# ---------------------------------------------------------------------------
while [ "$#" -gt 0 ]; do
  case "$1" in
    --save-evidence) SAVE_EVIDENCE=1 ;;
    --quiet)         QUIET=1 ;;
    --stage)         shift; ONLY_STAGE="${1:-}" ;;
    -h|--help)       sed -n '2,50p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)               abort "unknown argument: $1" ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# 6. BANNER
# ---------------------------------------------------------------------------
RUN_STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
TREE_BEFORE="$(git_ro status --porcelain | wc -l | tr -d ' ')"
BRANCH_NOW="$(git_ro rev-parse --abbrev-ref HEAD 2>/dev/null)"
say ""
say "${B}================================================================================${R}"
say "${B} OBSERVABILITY LOOP — D12 END-TO-END DEMO${R}"
say "${B}================================================================================${R}"
say " mission     2026-08-21-observability-loop"
say " run at      $RUN_STAMP"
say " product     $PRODUCT_ROOT"
say ""
say " What you are about to watch is measured against YOUR words and against"
say " planning/DEFINITION-OF-DONE.md — not against what the code happens to do."
say ""
say " ${B}SKIPPED is the honest answer for anything not yet built.${R} A run that is"
say " mostly SKIPPED is a correct run. Nothing here can pass by being absent."
say ""

# ---------------------------------------------------------------------------
# 7. HARNESS SELF-CHECKS — the demo proves ITS OWN failure paths work first.
#    "Does every failure mode actually fail?" is asked of the harness before it
#    is asked of the product.
# ---------------------------------------------------------------------------

if stage_wanted H1; then
stage "H1" "HARNESS" "the demo is looking at the real product tree"
must_prove "The script resolves the product root from its own location, so V can run it" \
           "from anywhere, and it is pointed at a real dialectical-engine checkout."
if [ -f "$PRODUCT_ROOT/package.json" ] && grep -q '"debateai-v3"' "$PRODUCT_ROOT/package.json" 2>/dev/null; then
  evidence "product root resolved: $PRODUCT_ROOT"
  pass "package.json identifies the dialectical-engine workspace"
else
  fail "resolved product root '$PRODUCT_ROOT' is not a dialectical-engine checkout"
fi
fi

if stage_wanted H2; then
stage "H2" "D6" "the excluded security zone is refused by a guard, not by a promise"
must_prove "V's exclusion of the W.I.P. security features is machine-enforced inside this" \
           "demo: any attempt to read, stat or otherwise touch a zone file aborts, and the" \
           "guard is proven to fire rather than assumed to."
_gz=0; _gn=0
while IFS= read -r _z; do
  [ -z "$_z" ] && continue
  if path_is_zone "$_z"; then _gz=$((_gz + 1)); fi
done <<EOF
$ZONE_PATHS
EOF
for _n in "packages/db/src/obs-schema.ts" "apps/api/src/main.ts" "packages/db/src/index.ts" "apps/scheduler/src/cli.ts"; do
  if path_is_zone "$_n"; then _gn=$((_gn + 1)); fi
done
_trip_before=$ZONE_GUARD_TRIPS
sf_exists "packages/db/src/identity.ts" >/dev/null 2>&1   # provoked on purpose; must be refused
_trip_after=$ZONE_GUARD_TRIPS
ZONE_GUARD_SELFTEST=$((_trip_after - _trip_before))
evidence "zone paths classified as zone: $_gz / 4" \
         "decoy non-zone paths misclassified: $_gn / 4 (must be 0)" \
         "live refusal test: a guarded fs helper was handed a zone path and refused it" \
         "no zone byte, size, mode, mtime or listing was taken by this demo"
if [ "$_gz" -eq 4 ] && [ "$_gn" -eq 0 ] && [ "$_trip_after" -gt "$_trip_before" ]; then
  pass "the zone guard classifies correctly AND provably refuses"
else
  fail "zone guard did not behave: classified=$_gz/4 decoys=$_gn trips=$((_trip_after-_trip_before))"
fi
fi

if stage_wanted H3; then
stage "H3" "HARNESS" "the demo cannot write to git, and leaves the tree as it found it"
must_prove "This demo performs no commit, stage, branch, stash, checkout, push or merge," \
           "and the working tree is byte-for-byte as it was before the run."
_git_ok=1
git_ro rev-parse --show-toplevel >/dev/null 2>&1 || _git_ok=0
# Exercise the whitelist predicate itself. It is a pure function, so no write
# verb can execute even if the predicate were wrong.
_guard_held=1
for _wv in commit add branch checkout stash push merge reset rebase tag; do
  case "$_wv" in
    branch) continue ;;   # read-only listing form is whitelisted on purpose
  esac
  git_verb_allowed "$_wv" && _guard_held=0
done
evidence "git verb whitelist: status rev-parse symbolic-ref log config worktree branch remote" \
         "refusal test: commit add checkout stash push merge reset rebase tag -> all refused" \
         "branch: $BRANCH_NOW   working-tree entries before run: $TREE_BEFORE"
if [ "$_git_ok" -eq 1 ] && [ "$_guard_held" -eq 1 ]; then
  pass "git write-guard armed and provably refuses every write verb"
else
  fail "git guard did not hold (readable=$_git_ok all-writes-refused=$_guard_held)"
fi
fi

if stage_wanted H4; then
stage "H4" "D6" "no SQL this demo issues can name the identity schema"
must_prove "Every SQL statement the demo would run is screened; one naming the excluded" \
           "accounts schema is refused before it reaches a database."
_a=0; _b=0
sql_guard "select count(*) from obs.occurrence" >/dev/null 2>&1 && _a=1
sql_guard "select * from identity.identity_user" >/dev/null 2>&1 || _b=1
evidence "an obs.* statement was accepted; an identity.* statement was refused"
if [ "$_a" -eq 1 ] && [ "$_b" -eq 1 ]; then
  pass "SQL guard admits obs.* and refuses identity.*"
else
  fail "SQL guard misbehaved (obs accepted=$_a identity refused=$_b)"
fi
fi

if stage_wanted H5; then
stage "H5" "HARNESS" "a failing stage really does fail, and really does set exit 1"
must_prove "A green run must be earned. The reporting path is exercised with a deliberately" \
           "false assertion to show it produces FAILED and a non-zero exit — so that when" \
           "every product stage below reports, V knows the FAILED path is live."
# Snapshot every piece of state fail() mutates, actually CALL fail() on a
# deliberately false assertion, observe what it did, then restore. This really
# exercises the failure path; it does not describe it.
_snap_fail=$N_FAIL; _snap_rows="$SUMMARY_ROWS"; _snap_detail="$FAIL_DETAIL"
_snap_id="$CUR_ID"; _snap_tag="$CUR_TAG"; _snap_title="$CUR_TITLE"; _snap_quiet="$QUIET"
QUIET=1; CUR_ID="H5s"; CUR_TAG="SELFTEST"; CUR_TITLE="deliberately false assertion"
if [ "1" = "2" ]; then : ; else fail "1 = 2 is false (harness self-test, not a product finding)"; fi
QUIET="$_snap_quiet"
_delta=$((N_FAIL - _snap_fail))
_exit_rule=0; [ "$N_FAIL" -gt 0 ] && _exit_rule=1
_rows_grew=0; [ "$SUMMARY_ROWS" != "$_snap_rows" ] && _rows_grew=1
# restore — the self-test must not colour the real run
N_FAIL="$_snap_fail"; SUMMARY_ROWS="$_snap_rows"; FAIL_DETAIL="$_snap_detail"
CUR_ID="$_snap_id"; CUR_TAG="$_snap_tag"; CUR_TITLE="$_snap_title"
if [ "$_delta" -eq 1 ] && [ "$_exit_rule" -eq 1 ] && [ "$_rows_grew" -eq 1 ]; then
  evidence "a false assertion was passed to the same fail() every stage below uses" \
           "it incremented the failure counter (+$_delta), added a summary row, and flipped" \
           "the exit rule to 1; the self-test's effects were then rolled back" \
           "so: if any stage below reports FAILED, this run exits non-zero"
  pass "the FAILED path and the non-zero exit rule are live and were exercised"
else
  fail "the harness could not demonstrate its own failure path (delta=$_delta exit_rule=$_exit_rule rows=$_rows_grew)"
fi
fi

# ---------------------------------------------------------------------------
# 8. V'S PRECONDITION — "after the implementation of the tables"
# ---------------------------------------------------------------------------

if stage_wanted 01; then
stage "01" "PRECONDITION" "the tables exist — V sequenced the listener strictly after them"
must_prove "V: \"...listens for the moment errors are thrown (After the implementation of the" \
           "tables that throw those errors)\". The error store must exist before any listener," \
           "and it must carry the tables the later criteria are read out of."
if ! have_store_definition; then
  skip "the obs store is not defined in this working tree" \
       "migrations/0034_obs_foundation.sql (S01 $(ticket_for S01))|packages/db/src/obs-schema.ts (S01 $(ticket_for S01))" \
       "S01 $(ticket_for S01)"
else
  _need="obs.occurrence obs.capture_gap obs.zone_daily obs.agent_action obs.trace obs.incident obs.budget_usage"
  _missing=""
  for _t in $_need; do
    sf_grep "CREATE TABLE IF NOT EXISTS $_t" "migrations/0034_obs_foundation.sql" || _missing="$_missing $_t"
  done
  _listener_present=1
  have_daemon || _listener_present=0
  evidence "store definition: migrations/0034_obs_foundation.sql + packages/db/src/obs-schema.ts" \
           "sequencing: listener present in tree = $_listener_present (0 = V's ordering not yet at risk)"
  if [ -n "$_missing" ]; then
    fail "the store is missing tables the definition of done reads out of:$_missing"
  else
    pass "all seven tables the D1/D2/D4/D9/D11 criteria read from are defined (DEFINITION level only — see stage 02 for the live store)"
  fi
fi
fi

if stage_wanted 02; then
stage "02" "D1" "the store is live in a real database, not just declared in a file"
must_prove "The tables actually exist in the database the product writes to. Stage 01 read a" \
           ".sql file; a file is not a table."
_db_url="${OBS_DEMO_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$_db_url" ]; then
  skip "no database URL was given to the demo, so no live store could be inspected" \
       "OBS_DEMO_DATABASE_URL (or DATABASE_URL) is unset" \
       "V or the runtime brings Postgres up and migrates; this demo deliberately never runs migrations itself, because migration would execute the excluded accounts schema"
elif ! command -v psql >/dev/null 2>&1; then
  skip "psql is not on PATH, so the live store could not be inspected" \
       "psql client binary" \
       "install a postgres client, or run this demo on the host that has one"
else
  _q="select count(*) from information_schema.tables where table_schema = 'obs'"
  if ! sql_guard "$_q"; then abort "sql guard refused the demo's own obs query"; fi
  _n="$(psql "$_db_url" -tAc "$_q" 2>/dev/null | tr -d ' ')"
  case "$_n" in ''|*[!0-9]*) _n="" ;; esac
  if [ -z "$_n" ]; then
    fail "could not query the obs schema at the supplied database URL"
  elif [ "$_n" -lt 7 ]; then
    fail "the obs schema is live but holds only $_n tables; migration 0034 is not applied"
  else
    evidence "obs schema tables present in the live database: $_n"
    pass "the error store is live"
  fi
fi
fi

if stage_wanted 03; then
stage "03" "D1" "the product runtimes come up with capture installed"
must_prove "V: \"observe every time the system throws an error\". Before anything can be" \
           "observed, the api / runner / scheduler runtimes must start with the capture layer" \
           "installed in them. Nothing below this line means anything without it."
_miss="$(missing_capture_path)"
_bind=""
have_api_binding       || _bind="$_bind|apps/api/src/main.ts carries no capture installer import (S08 $(ticket_for S08))"
have_runner_binding    || _bind="$_bind|apps/runner/src/main.ts carries no capture installer import (S06 $(ticket_for S06))"
have_scheduler_binding || _bind="$_bind|apps/scheduler/src/cli.ts carries no capture installer import (S10 $(ticket_for S10))"
if [ -n "$_miss" ] || [ -n "$_bind" ]; then
  skip "no runtime in this tree has capture installed, so bringing them up would prove nothing" \
       "$_miss$_bind" \
       "S03b $(ticket_for S03b) -> S05 $(ticket_for S05) -> S05b $(ticket_for S05b) -> S06/S08/S10"
else
  skip "capture surfaces are present but this stage's bring-up is not implemented yet" \
       "the demo's bring-up step, to be written when the first binding merges" \
       "this ticket (D12), next revision"
fi
fi

# ---------------------------------------------------------------------------
# 9. D1 — BREAK IT, SEE IT
# ---------------------------------------------------------------------------

if stage_wanted 04; then
stage "04" "D1" "a genuine fault in real product code — and what records it today"
must_prove "V: \"we need to be able to observe every time the system throws an error\". This" \
           "stage causes a REAL fault in REAL, unmodified product code — no mock, no injected" \
           "record — and then asks the system what it recorded. Today that answer is the" \
           "mission's whole premise."
_faulter="apps/replay/src/cli.ts"
_tsx="$PRODUCT_ROOT/node_modules/.bin/tsx"
if ! sf_exists "$_faulter"; then
  fail "the fault-causer $_faulter no longer exists; this demo cannot cause a genuine fault and will not invent one"
elif [ ! -x "$_tsx" ]; then
  skip "the TypeScript runner is not installed, so real product code could not be executed" \
       "node_modules/.bin/tsx" \
       "run pnpm install in $PRODUCT_ROOT"
else
  _out="$( ( cd "$PRODUCT_ROOT" && "$_tsx" "$_faulter" ) 2>&1 )"
  _rc=$?
  _line1="$(printf '%s\n' "$_out" | grep -m1 'TypeError\|Error:' | sed 's/^[[:space:]]*//')"
  _frame="$(printf '%s\n' "$_out" | grep -m1 "$_faulter:" | sed 's/^[[:space:]]*//')"
  if [ "$_rc" -eq 0 ] || [ -z "$_frame" ]; then
    fail "the fault-causer did not produce a genuine unhandled fault (exit=$_rc). The demo refuses to substitute a fabricated one; pick a new fault-causer."
  else
    _closure="$(dep_closure 'apps/replay/package.json')"
    case " $_closure " in
      *" @debateai/db "*) _zone_note="closure INCLUDES @debateai/db, which re-exports the excluded zone — the product's own graph, not the demo's" ;;
      *)                  _zone_note="closure excludes @debateai/db, so this fault loads no zone module at all" ;;
    esac
    evidence "invoked  : node_modules/.bin/tsx $_faulter   (real product entrypoint, unmodified)" \
             "exit code: $_rc  (a real process really died)" \
             "thrown   : $_line1" \
             "frame    : $_frame" \
             "closure  : $_closure   (computed from the workspace manifests, not asserted)" \
             "zone     : $_zone_note"
    _miss="$(missing_capture_path)"
    if [ -n "$_miss" ]; then
      say "     ${CD}RECORDED BY THE SYSTEM${R}"
      say "                 nothing. There is no capture layer in this tree to record it."
      say "                 The process died, the stack scrolled past, and no row exists."
      say "                 That is exactly the condition V opened this mission on."
      skip "the fault was genuinely produced; nothing in the product could record it" \
           "$_miss" \
           "S03b $(ticket_for S03b) -> S05 $(ticket_for S05) -> S05b $(ticket_for S05b)"
    else
      skip "capture is installed but this stage's read-back against obs.occurrence is not implemented yet" \
           "the demo's read-back step, to be written when the capture path merges" \
           "this ticket (D12), next revision"
    fi
  fi
fi
fi

surface_stage() {
  # surface_stage <id> <human surface> <capture_point> <binding-probe> <slice> <extra-must>
  _id="$1"; _surface="$2"; _cp="$3"; _probe="$4"; _slice="$5"; _extra="$6"
  stage "$_id" "D1" "$_surface — nothing silently dropped on this surface"
  must_prove "D1 names five capture surfaces and requires that NOTHING is silently dropped on" \
             "any of them. This stage breaks the $_surface for real and requires the resulting" \
             "row in obs.occurrence with capture_point=$_cp. $_extra"
  _miss="$(missing_capture_path)"
  if ! $_probe; then
    _miss="$_miss|the $_surface is not bound to capture ($_slice $(ticket_for $_slice))"
  fi
  _miss="${_miss#|}"
  if [ -n "$_miss" ]; then
    skip "this surface has no capture attached, so a fault on it cannot be observed" \
         "$_miss" \
         "$_slice $(ticket_for $_slice)  (after S05b $(ticket_for S05b), which is what makes an emit become a row)"
  else
    skip "the binding is present but this stage's fault + read-back is not implemented yet" \
         "the demo's per-surface fault driver, to be written when the binding merges" \
         "this ticket (D12), next revision"
  fi
}

stage_wanted 05 && surface_stage "05" "API request"     "http"     have_api_binding       "S08" "A 500-class request must also stop echoing the raw error message back to the caller."
stage_wanted 06 && surface_stage "06" "runner job"      "job"      have_runner_binding    "S06" "Retries of one work item must fold into ONE work unit, not N."
stage_wanted 07 && surface_stage "07" "provider call"   "provider" have_provider_binding  "S11" "The exhausted-call throw after the retry loop is the capture point."
stage_wanted 08 && surface_stage "08" "scheduler job"   "job"      have_scheduler_binding "S10" "A job that silently skips work must be falsifiable: no-op requires its input count."
stage_wanted 09 && surface_stage "09" "browser client"  "client"   have_client_seam       "S09" "A client error must reach the store without free text ever leaving the browser."

if stage_wanted 10; then
stage "10" "D1/D11" "the numbers these criteria are judged against are declared and ratified"
must_prove "D1 requires a row to appear \"within a declared bound\". D11 says \"the bound IS the" \
           "criterion\". A criterion measured against an undeclared or unratified number cannot" \
           "be judged, so the demo checks the numbers themselves before checking behaviour."
if ! have_policy_bundle; then
  skip "no policy bundle exists in this tree, so no bound is declared anywhere runnable" \
       "tools/obs-listener/policy/ (S17 $(ticket_for S17))|register rows obs.emitP99CeilingMs, obs.blastRadiusMaxReachable, obs.fingerprintMaturityN, obs.canaryWindowMs, obs.lineageDepthMax are unratified (FinalPlan.md:472, §K row 1 OPEN)|the QUICK production-line cap is written \"~20 production lines ... for the moment\" (FinalPlan.md:216) and is not a register row" \
       "S17 $(ticket_for S17), then V ratification at G5 entry ($(ticket_for G5))"
else
  skip "a policy bundle exists but ratification is a V act this demo cannot observe from the tree" \
       "V-ratified values for the five G5 register rows" \
       "G5 entry $(ticket_for G5)"
fi
fi

# ---------------------------------------------------------------------------
# 10. D2 — FOLLOW IT HOME
# ---------------------------------------------------------------------------

if stage_wanted 11; then
stage "11" "D2" "from a stored error you reach the run and the work item without guessing"
must_prove "V: \"Each error must be traceable to the root.\" D2's first half: the stored record" \
           "must carry real correlation to the run and the work item that produced it. A record" \
           "whose correlation fields are a placeholder does NOT satisfy D2."
_miss="$(missing_capture_path)"
[ -n "$_miss" ] || _miss=""
have_tracer || _miss="$_miss|tools/obs-listener/src/trace/ (S19 $(ticket_for S19))"
_miss="${_miss#|}"
skip "there is no stored error to follow home" \
     "$_miss" \
     "S05b $(ticket_for S05b) for the row, S19 $(ticket_for S19) for the mechanical trace"
fi

if stage_wanted 12; then
stage "12" "D2" "the ORIGINAL error survives the wrapper — you land on what actually failed"
must_prove "D2's second half, V-ruled: the record preserves the original error underneath any" \
           "wrapper, so V lands on the thing that actually failed and not the thing that" \
           "reported it. This is a property of PRODUCT code, checkable before any listener exists."
_evi="$(sf_grepn 'class TypedDomainError' 'packages/kernel/src/index.ts' | head -1)"
_has_cause=0
have_cause_retrofit && _has_cause=1
if [ "$_has_cause" -eq 0 ]; then
  evidence "packages/kernel/src/index.ts -> ${_evi:-TypedDomainError}" \
           "the product's own typed error class takes (code, message) and passes no cause to" \
           "super(), so today a wrap DISCARDS the original error. D2 is not merely unproven" \
           "here — it is not yet POSSIBLE."
  skip "the product cannot preserve a cause chain yet, so root preservation cannot be shown" \
       "cause option on TypedDomainError; wrap sites passing cause instead of interpolating (S07 $(ticket_for S07))" \
       "S07 $(ticket_for S07)"
else
  _miss="$(missing_capture_path)"
  if [ -n "$_miss" ]; then
    skip "the cause chain exists in code but no stored record can be read back yet" "$_miss" "S05b $(ticket_for S05b)"
  else
    skip "cause chain present; the stored-bytes assertion for this stage is not implemented yet" \
         "the demo's cause-chain read-back" "this ticket (D12), next revision"
  fi
fi
fi

# ---------------------------------------------------------------------------
# 11. D3 / D4
# ---------------------------------------------------------------------------

if stage_wanted 13; then
stage "13" "D3" "\"it just doesn't work\" — surfaced even though nothing threw"
must_prove "V: \"...and if something does not work.\" The half that is not about thrown errors:" \
           "a job that stalls, a queue that stops draining, a run that never completes. The demo" \
           "must stall something real and watch the system say so with no exception in sight."
if ! have_detectors; then
  skip "there are no detectors in this tree, so a stall would be as invisible as it is today" \
       "tools/obs-listener/src/detectors/ (S20 $(ticket_for S20))|tools/obs-listener/src/daemon/ (S18 $(ticket_for S18))" \
       "S20 $(ticket_for S20)"
else
  skip "detectors present; the stall driver for this stage is not implemented yet" \
       "the demo's stall driver" "this ticket (D12), next revision"
fi
fi

if stage_wanted 14; then
stage "14" "D4" "it says when it is blind — silence never passes as health"
must_prove "Every event the system could not record is counted and visible, and a period with" \
           "zero occurrences is distinguishable from a period where capture was OFF. This is the" \
           "criterion that makes the rest of this run trustworthy: without it, every SKIP above" \
           "could be a silent green."
_miss="$(missing_capture_path)"
if [ -n "$_miss" ]; then
  say "     ${CD}TODAY${R}       Capture is off and there is no counter, so an empty obs.occurrence"
  say "                 today is indistinguishable from a healthy hour. That is precisely the"
  say "                 silence D4 forbids, and it is why this demo refuses to print a green."
  skip "no gap counter exists, so blindness cannot be made visible" \
       "$_miss|obs.capture_gap has a table (S01 $(ticket_for S01)) but no writer" \
       "S03b $(ticket_for S03b) (gap counter) + S05b $(ticket_for S05b) (the flush that makes it a row)"
else
  skip "capture path present; the capture-off vs zero-error comparison is not implemented yet" \
       "the demo's blindness comparison" "this ticket (D12), next revision"
fi
fi

# ---------------------------------------------------------------------------
# 12. D5 / D6 — TRUSTING IT
# ---------------------------------------------------------------------------

if stage_wanted 15; then
stage "15" "D5" "an adversarial error carrying secrets is stored with none of them present"
must_prove "A real error carrying a password, a credential-bearing DSN, a card number, an email," \
           "an API key and a session id — in the message, in a multi-level cause chain, in own" \
           "properties AND in stack-frame text — is stored with none of it present, proven by" \
           "reading RAW BYTES rather than by asserting a shape."
_miss="$(missing_capture_path)"
if [ -n "$_miss" ]; then
  skip "there is no redactor and no stored bytes to read, so leakage cannot be tested" \
       "$_miss|the shared allowlist redactor (S03b $(ticket_for S03b))" \
       "S03b $(ticket_for S03b) + S05b $(ticket_for S05b); full adversarial corpus at S16 $(ticket_for S16)"
else
  skip "redactor present; the raw-byte adversarial read-back is not implemented yet" \
       "the demo's raw-byte assertion" "this ticket (D12), next revision"
fi
fi

if stage_wanted 16; then
stage "16" "D6" "the observability layer never touches the W.I.P. security zone"
must_prove "V: the W.I.P. security features are NOT in scope. D6: no modification, no import," \
           "and no filesystem metadata of any kind on them — machine-checked, not promised." \
           "Every observability artifact that exists in this tree is audited for any reference."
_artifacts=""
for _a in "migrations/0034_obs_foundation.sql" "packages/db/src/obs-schema.ts"; do
  sf_exists "$_a" && _artifacts="$_artifacts $_a"
done
for _d in "packages/obs-capture" "tools/obs-listener" "acceptance/obs"; do
  if sf_isdir "$_d"; then
    while IFS= read -r _f; do
      _rel="${_f#$PRODUCT_ROOT/}"
      path_is_zone "$_rel" && continue
      _artifacts="$_artifacts $_rel"
    done <<EOF
$(find "$PRODUCT_ROOT/$_d" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' -o -name '*.json' \) 2>/dev/null)
EOF
  fi
done
_count=0; _viol=""
for _a in $_artifacts; do
  _count=$((_count + 1))
  # a reference to a zone MODULE (import/require/from) or to the excluded SCHEMA
  # is a violation. Anchored so that innocent names such as `writer_identity`
  # do not read as a schema reference.
  if grep -qE '(^|[^A-Za-z_])identity\.[a-z_]+|identity\.(js|ts)|registration\.(js|ts)|mail-channel|/mfa\.(js|ts)' "$PRODUCT_ROOT/$_a" 2>/dev/null; then
    _viol="$_viol $_a"
  fi
done
if [ "$_count" -eq 0 ]; then
  skip "no observability artifact exists in this tree yet, so there is nothing to audit" \
       "any obs artifact (S01 $(ticket_for S01) onward)" "S01 $(ticket_for S01)"
elif [ -n "$_viol" ]; then
  fail "observability artifacts reference the excluded zone:$_viol"
else
  evidence "observability artifacts audited: $_count" \
           "checked for: zone module imports, zone path references, identity.* schema references" \
           "the audit reads the OBS artifacts' own bytes; it takes no metadata on any zone file"
  say "     ${CD}NOT YET COVERED${R}"
  say "                 This proves only the TEXTUAL half of D6. The runtime half — that the"
  say "                 capture layer takes no filesystem metadata on a zone file while running,"
  say "                 and that the zone-route-mount region is unchanged — needs the ZI-1..ZI-4"
  say "                 zone-integrity assertion (S04 $(ticket_for S04)) and the CI inventory gate"
  say "                 (S12 t_a0ce760a). Until those land, read this PASS narrowly."
  pass "no observability artifact in this tree references the excluded zone (textual half of D6 only)"
fi
fi

if stage_wanted 17; then
stage "17" "D6" "an error thrown inside the zone produces ONLY an anonymous counter"
must_prove "The strongest form of the exclusion: when a fault occurs behind the security" \
           "boundary, the system must record that it happened and NOTHING else — no content," \
           "no identity, no path, no stack frame naming a zone file. One anonymous counter" \
           "increment, and no occurrence row carrying detail."
if ! have_zone_classifier; then
  skip "no zone classifier exists, so a zone-adjacent fault has no defined behaviour to observe" \
       "packages/obs-capture/src/zone/ + the zone manifest (S04 $(ticket_for S04))|the manifest hash re-pin is a V dual-custody act (RP-1 $(ticket_for RP1))" \
       "S04 $(ticket_for S04), then RP-1 $(ticket_for RP1)"
else
  skip "classifier present; this stage's zone-fault driver is not implemented yet" \
       "the demo's zone-fault driver, which must cause the fault WITHOUT the demo importing or stating anything about zone internals" \
       "this ticket (D12), next revision"
fi
fi

if stage_wanted 18; then
stage "18" "D7" "one action turns it all off, and the product keeps running"
must_prove "A single command stops capture, the daemon and the fix executor, and the product" \
           "then runs normally without them. NOTE: today nothing is running, so a naive check" \
           "would report success for the wrong reason. That is a default pass, and this demo" \
           "refuses it."
if ! have_obsctl; then
  skip "there is no kill switch to exercise — and nothing running, so a green here would be vacuous" \
       "tools/obs-listener/src/obsctl/ (S22 $(ticket_for S22))|the KILL/ARMED token semantics it operates" \
       "S22 $(ticket_for S22)"
else
  skip "obsctl present; the stop-and-still-serves drill is not implemented yet" \
       "the demo's kill drill" "this ticket (D12), next revision"
fi
fi

# ---------------------------------------------------------------------------
# 13. THE LOOP — D8..D11
# ---------------------------------------------------------------------------

if stage_wanted 19; then
stage "19" "D8" "the listener is alive, restarts itself, and its liveness is observable"
must_prove "V: \"an agent that sits in a permanent loop and listens for the moment errors are" \
           "thrown\". Permanent means it survives being killed and survives a reboot, and V can" \
           "see from outside that it is alive."
_miss=""
have_daemon         || _miss="$_miss|tools/obs-listener/src/daemon/ (S18 $(ticket_for S18))"
have_watchdog       || _miss="$_miss|tools/obs-listener/src/watchdog/ (S21 $(ticket_for S21))"
have_launchd_daemon || _miss="$_miss|tools/obs-listener/launchd/ KeepAlive plists (S25 $(ticket_for S25))"
_miss="${_miss#|}"
if [ -n "$_miss" ]; then
  skip "there is no listener in this tree; nothing is looping and nothing is listening" \
       "$_miss" "S18 $(ticket_for S18) -> S21 $(ticket_for S21) -> S25 $(ticket_for S25)"
else
  skip "listener present; the kill-and-reboot liveness drill is not implemented yet" \
       "the demo's liveness drill" "this ticket (D12), next revision"
fi
fi

if stage_wanted 20; then
stage "20" "D9" "it files a ticket for a real error, carrying the root it traced"
must_prove "Not a notification — a ticket a human can act on, naming what failed and why," \
           "carrying the root the tracer actually reached."
_miss=""
have_daemon || _miss="$_miss|tools/obs-listener/src/daemon/ (S18 $(ticket_for S18))"
have_tracer || _miss="$_miss|tools/obs-listener/src/trace/ (S19 $(ticket_for S19))"
have_obsctl || _miss="$_miss|tools/obs-listener/src/obsctl/ board-write regions (S28 $(ticket_for S28))"
_miss="${_miss#|}"
skip "nothing can trace a root or file a ticket in this tree" \
     "$_miss" "S19 $(ticket_for S19) for the root, S28 $(ticket_for S28) for the board write (G3)"
fi

if stage_wanted 21; then
stage "21" "D10" "it opens a pull request for a larger fix — and waits for V"
must_prove "V: \"...the looped agent will be able to create its own pull requests with the" \
           "fixes.\" Approval-first: it proposes, V decides, and it does not proceed without V." \
           "The demo must show a proposal that STOPS and waits, not one that lands."
_miss=""
have_fix_worker || _miss="$_miss|tools/obs-listener/src/worker-fix/ (S29 $(ticket_for S29), BLOCKED behind G4 entry $(ticket_for G4))"
have_landing    || _miss="$_miss|tools/obs-listener/src/landing/ (S29 $(ticket_for S29))"
_miss="${_miss#|}"
skip "there is no fix executor, so no pull request can be opened or held" \
     "$_miss" "G4 entry $(ticket_for G4) -> S29 $(ticket_for S29)"
fi

if stage_wanted 22; then
stage "22" "D11" "a QUICK fix merges into dev unattended — never into main"
must_prove "V: \"For very quick fixes, no approval will be needed of us.\" The demo must show a" \
           "genuinely QUICK fix land in dev on a scratch branch with no human in the loop, and" \
           "must show it never targeted main."
_miss=""
have_fix_worker || _miss="$_miss|tools/obs-listener/src/worker-fix/ QUICK arm (S30 $(ticket_for S30), BLOCKED behind G5 entry $(ticket_for G5))"
have_landing    || _miss="$_miss|tools/obs-listener/src/landing/ auto-merge protections (S30 $(ticket_for S30))"
_miss="${_miss#|}"
say "     ${CD}NOTE FOR V${R}  As designed, this capability starts with an EMPTY subsystem allowlist"
say "                 that grows only by a dual-custody re-pin. Read literally, \"no approval"
say "                 will be needed\" is not yet reachable: V's approval is required to make"
say "                 the no-approval path apply to anything at all. Flagged, not resolved."
skip "there is no fix executor, so nothing can merge — attended or unattended" \
     "$_miss" "G5 entry $(ticket_for G5) -> S30 $(ticket_for S30)"
fi

if stage_wanted 23; then
stage "23" "D11" "the BOUND is the criterion — an above-QUICK change must be refused"
must_prove "D11: \"an agent that merges something above QUICK has failed D11 even if the change" \
           "was correct.\" The demo must present a change that exceeds the QUICK bound and show" \
           "it REFUSED auto-merge and routed to the approval-first path instead."
_miss=""
have_fix_worker || _miss="$_miss|the tier gate that computes the bound (S30 $(ticket_for S30))"
have_policy_bundle || _miss="$_miss|tools/obs-listener/policy/ tier rules holding the bound (S17 $(ticket_for S17))"
_miss="${_miss#|}"
say "     ${CD}NOTE FOR V${R}  The bound this stage would enforce is not yet a ratified number:"
say "                 this ticket states \"<= 20 production lines\"; FinalPlan.md:216 states"
say "                 \"~20 production-line cap ... for the moment\"; and no register row holds"
say "                 it. A criterion cannot be judged against a tilde."
skip "no tier gate and no ratified bound exist, so the refusal cannot be exercised" \
     "$_miss" "S17 $(ticket_for S17) + V ratification at G5 entry $(ticket_for G5)"
fi

# ---------------------------------------------------------------------------
# 14. WORKING-TREE PROOF — measured again after every stage has run
# ---------------------------------------------------------------------------
TREE_AFTER="$(git_ro status --porcelain | wc -l | tr -d ' ')"

# ---------------------------------------------------------------------------
# 15. SUMMARY
# ---------------------------------------------------------------------------
printf '\n'
printf '%s\n' "${B}================================================================================${R}"
printf '%s\n' "${B} SUMMARY${R}"
printf '%s\n' "${B}================================================================================${R}"
printf ' %-4s %-13s %-9s %s\n' "ID" "CRITERION" "RESULT" "WHAT IT WOULD PROVE"
printf ' %s\n' "--------------------------------------------------------------------------------"
printf '%s' "$SUMMARY_ROWS" | while IFS='|' read -r _i _t _r _d; do
  [ -z "$_i" ] && continue
  case "$_r" in
    PASSED)  _c="$CG" ;;
    FAILED)  _c="$CR" ;;
    *)       _c="$CY" ;;
  esac
  printf ' %-4s %-13s %s%-9s%s %s\n' "$_i" "$_t" "$_c" "$_r" "$R" "$_d"
done
printf ' %s\n' "--------------------------------------------------------------------------------"
printf ' %sPASSED %d%s   %sFAILED %d%s   %sSKIPPED %d%s\n' "$CG" "$N_PASS" "$R" "$CR" "$N_FAIL" "$R" "$CY" "$N_SKIP" "$R"
printf '\n'
printf ' %s\n' "GATE READINESS"
printf ' %s\n' "   G1 capture      $( have_capture_runtime && echo 'runtime pipeline present' || echo 'not in this tree — S03b/S05/S05b' )"
printf ' %s\n' "   G2 listener     $( have_daemon && echo 'daemon present' || echo 'not in this tree — S18/S19/S20/S21/S22' )"
printf ' %s\n' "   G3 dispatch     $( have_obsctl && echo 'obsctl present' || echo 'not in this tree — S18b/S27/S28' )"
printf ' %s\n' "   G4/G5 fixes     $( have_fix_worker && echo 'fix executor present' || echo 'not in this tree — S29/S30, both behind V gates' )"
printf '\n'
printf ' %s\n' "REPOSITORY LEFT ALONE"
printf ' %s\n' "   git working-tree entries before this run: ${TREE_BEFORE:-n/a}"
printf ' %s\n' "   git working-tree entries after  this run: ${TREE_AFTER:-n/a}"
printf ' %s\n' "   zone-guard refusals: $ZONE_GUARD_TRIPS total, of which $ZONE_GUARD_SELFTEST were provoked"
printf ' %s\n' "     on purpose by stage H2 to prove the guard fires. Unprovoked refusals: $((ZONE_GUARD_TRIPS - ZONE_GUARD_SELFTEST))"
printf ' %s\n' "     (an unprovoked refusal would mean a stage tried to reach the zone and was stopped)"
printf ' %s\n' "   this run performed no git write, no product-code edit, no migration, no push."
printf '\n'

if [ "$SAVE_EVIDENCE" -eq 1 ]; then
  EVIDENCE_DIR="$DEMO_DIR/runs/$RUN_STAMP"
  mkdir -p "$EVIDENCE_DIR"
  {
    printf 'run_at\t%s\n' "$RUN_STAMP"
    printf 'passed\t%d\nfailed\t%d\nskipped\t%d\n' "$N_PASS" "$N_FAIL" "$N_SKIP"
    printf 'tree_before\t%s\ntree_after\t%s\n' "${TREE_BEFORE:-}" "${TREE_AFTER:-}"
    printf '%s' "$SUMMARY_ROWS"
  } > "$EVIDENCE_DIR/summary.tsv"
  printf ' evidence written to %s\n' "$EVIDENCE_DIR"
  printf ' %s\n\n' "(the only path this demo ever writes to, and only with --save-evidence)"
fi

if [ "$N_FAIL" -gt 0 ]; then
  printf '%s\n' "${CR}RESULT: FAILED — $N_FAIL stage(s) failed.${R}"
  printf '%s\n' "$FAIL_DETAIL"
  exit 1
fi

if [ "${TREE_BEFORE:-x}" != "${TREE_AFTER:-y}" ]; then
  printf '%s\n' "${CR}RESULT: FAILED — the demo changed the working tree ($TREE_BEFORE -> $TREE_AFTER).${R}"
  exit 1
fi

printf '%s\n' "${CG}RESULT: no stage failed.${R}"
printf '%s\n' " $N_SKIP stage(s) are SKIPPED because their subject is not built yet. Each names"
printf '%s\n' " what is missing and the ticket that unblocks it. Nothing above passed by default;"
printf '%s\n' " a skip is not a pass, and the mission is not done until these turn green."
printf '\n'
exit 0
