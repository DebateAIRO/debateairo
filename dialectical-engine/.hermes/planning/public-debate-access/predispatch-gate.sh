#!/bin/zsh
# PRE-DISPATCH GATE — run before every coding dispatch.
# Proposed by the S03-CODE seat after packet/plan/env defects blocked two lanes.
# Catches, at zero seat cost, what a seat would otherwise discover in its first two minutes.
#   $1 packet (abs)   $2 PLAN (abs)   $3 worktree cwd (abs)
PACKET=$1; PLAN=$2; WT=$3; FAIL=0
say() { printf '  %-6s %s\n' "$1" "$2"; }
for f in "$PACKET" "$PLAN"; do [ -f "$f" ] || { say FAIL "missing: $f"; exit 1; }; done
[ -d "$WT" ] || { say FAIL "worktree missing: $WT"; exit 1; }
# The worktree ROOT is not always the project root: this repo checks out one level above
# `dialectical-engine/`, so a worktree contains a nested project dir. Running acceptance
# commands at the wrong level yields "No test files found" for EVERY command — which looks
# exactly like a uniform pre-fix RED. Resolve the level that actually holds package.json.
if [ ! -f "$WT/package.json" ]; then
  for cand in "$WT"/*/package.json; do
    [ -f "$cand" ] && { WT="${cand%/package.json}"; say WARN "worktree root has no package.json — running commands in nested project dir: $WT"; break; }
  done
fi
[ -f "$WT/package.json" ] || { say FAIL "no package.json at or one level under $WT — commands would run against nothing"; exit 1; }

echo "== 1. every ABSOLUTE path the packet names resolves =="
n=0
for p in $(grep -oE '/Users/[A-Za-z0-9._/-]+\.(md|ts|tsx|json)' "$PACKET" | sort -u); do
  n=$((n+1)); [ -e "$p" ] || { say MISS "$p"; FAIL=1; }
done
say OK "$n absolute paths checked"

echo "== 2. PLAN file surfaces vs packet authorization =="
# only DECLARED write surfaces, not read-only citations (a producer trace is not a write)
for d in $(grep -E '^\*\*File surface' "$PLAN" | grep -oE '`(packages|apps|tests|tools)/[A-Za-z0-9_./*-]+`' | tr -d '`' | cut -d/ -f1-2 | sort -u); do
  top=$(echo "$d" | cut -d/ -f1)
  grep -q -- "$d" "$PACKET" || grep -q -- "$top/\*\*" "$PACKET" || { say WARN "PLAN writes under '$d' — packet does not authorize it"; FAIL=1; }
done
say OK "file-surface authorization checked"

echo "== 2b. the PLAN the SEAT will read == the PLAN you validated =="
# The orchestrator edits the main tree; a worktree does NOT see that until it is copied.
# Validating the main-tree artifact while the seat reads a stale copy sends it into a wall
# the gate just certified as clear. Compare, always.
WTPLAN="$WT/${PLAN##*/dialectical-engine/}"
if [ -f "$WTPLAN" ]; then
  if cmp -s "$PLAN" "$WTPLAN"; then say OK "worktree PLAN is byte-identical to the validated one"
  else say FAIL "worktree PLAN DIFFERS from the one being validated ($(wc -l < "$PLAN" | tr -d ' ') vs $(wc -l < "$WTPLAN" | tr -d ' ') lines) — sync it before dispatch"; FAIL=1; fi
else say FAIL "no PLAN at the seat's path: $WTPLAN"; FAIL=1; fi

echo "== 3. dependency resolution from the SEAT'S cwd, not the main tree =="
( cd "$WT" && perl -e 'alarm 300; exec @ARGV' npx tsc --noEmit ) >/tmp/pdg-tsc.txt 2>&1
if [ -s /tmp/pdg-tsc.txt ]; then
  # A RED test written first legitimately fails typecheck: it names fields the change has not
  # created yet. That is TDD working, not a broken environment. Only errors OUTSIDE the seat's
  # own new (untracked) files mean the environment is wrong.
  UNTRACKED=$( cd "$WT" && git ls-files --others --exclude-standard 2>/dev/null )
  FOREIGN=0
  while IFS= read -r line; do
    f=$(printf "%s" "$line" | cut -d"(" -f1)
    printf '%s\n' "$UNTRACKED" | grep -qF -- "$f" || FOREIGN=$((FOREIGN+1))
  done < /tmp/pdg-tsc.txt
  if [ $FOREIGN -gt 0 ]; then
    say FAIL "tsc errors in code the seat did NOT write ($FOREIGN) — environment is wrong:"
    head -2 /tmp/pdg-tsc.txt | sed 's/^/         /'; FAIL=1
  else
    say RED "tsc fails ONLY inside the seat's own new files — expected RED-first state, not a defect"
    head -1 /tmp/pdg-tsc.txt | sed 's/^/         /'
  fi
else say OK "tsc --noEmit clean in the worktree"; fi

echo "== 4. every acceptance command RUNS; pre-fix GREEN pins nothing =="
# HONESTY GUARD: section 4 only measures a "pre-fix" state if the tree IS pre-fix. On a
# RESUMED seat the worktree already carries partial implementation, so GREEN there means
# "already implemented", not "acceptance is vacuous". Say which run this is, rather than
# printing a label the run cannot support.
DIRTY=$( cd "$WT" && git status --porcelain -- . 2>/dev/null | grep -vc '^$' )
if [ "${DIRTY:-0}" -gt 0 ]; then
  say WARN "worktree has $DIRTY modified/untracked entries — this is NOT a base-commit run."
  say WARN "GREEN below may mean ALREADY IMPLEMENTED. Only BROKEN/STOLEN/FAIL are conclusive here."
else
  say OK "worktree is clean — this IS a base-commit run; GREEN on a feature-assertion is a defect"
fi
# A pre-fix GREEN acceptance is only a defect for a FEATURE ASSERTION. A regression
# baseline or a verification-only step ("Change: none") is legitimately green before AND
# after — flagging those as defects is how a gate condemns correct work. Steps declaring
# "Change: none" are excluded; everything else pre-fix GREEN is reported for CLASSIFICATION,
# not condemned.
VERIF=$(grep -c '^\*\*Change:\*\* none' "$PLAN")
say NOTE "$VERIF verification-only steps (Change: none) are legitimately pre-fix GREEN"
rm -f /tmp/pdg-broken /tmp/pdg-stolen
ALL=$(grep -oE 'Acceptance test:\*\* `[^`]+`' "$PLAN" | sed 's/^.*`\(.*\)`$/\1/' | sort -u)
TOT=$(printf '%s\n' "$ALL" | grep -c .)
CAP=${PDG_CAP:-40}
[ "$TOT" -gt "$CAP" ] && say WARN "COVERAGE BOUNDED: running $CAP of $TOT acceptance commands — $((TOT-CAP)) NOT checked (raise PDG_CAP)"
say NOTE "$TOT distinct acceptance commands found; running $(( TOT < CAP ? TOT : CAP ))"
printf '%s\n' "$ALL" | head -"$CAP" | while read -r cmd; do
  [ -n "$cmd" ] || continue
  # STATIC: whose exit status is this? If the pipeline ENDS in a status-bearing consumer,
  # the runner's own exit code is discarded and a crash is indistinguishable from a pass.
  # This is not a style note: it is the third variant of the family that cost three rounds.
  # UNANCHORED GUARD (variant 4, found by a blind lens 2026-08-29): a guard that searches the
  # WHOLE capture can be satisfied by text that is not the summary. vitest prints skipped test
  # TITLES, so a title containing "Tests <n> passed" makes a vacuous -t run report success.
  # The guard must be anchored to the summary line, require a NONZERO pass count, and reject
  # a summary that reports failures.
  case "$cmd" in
    *"Tests +[0-9]+ passed"*|*"Tests +[0-9]* passed"*)
      case "$cmd" in
        *'^[[:space:]]*Tests'*) : ;;   # anchored — fine
        *) say UNANCHORED "guard searches the whole capture; a skipped test TITLE can satisfy it: ${cmd:0:38}"
           printf '         fix: sum=$(printf %%s "$out" | grep -E \x27^[[:space:]]*Tests[[:space:]]+\x27 | tail -1)\n'
           printf '              then require [1-9][0-9]* passed in $sum AND no \x27failed\x27 in $sum\n'
           : > /tmp/pdg-stolen ;;
      esac ;;
  esac
  # VARIANT 6: absolute line ranges. Correctness depends on the file not changing, while the
  # acceptance exists to verify that it did. A NEGATIVE range assertion drifts into a permanent
  # silent pass, which is why this is flagged even when it currently reports the right answer.
  case "$cmd" in
    *"sed -n '"*","*"p'"*)
      say COORDPIN "pinned to absolute line numbers — drifts on any edit: ${cmd:0:44}"
      printf '         anchor on the SYMBOL, not the line; a negative range assertion drifts into a silent PASS\n'
      : > /tmp/pdg-stolen ;;
  esac
  last=${cmd##*|}
  case "$cmd" in *"|"*)
    case "$last" in
      *grep\ -q*|*grep\ -*q*|*head\ -*|*tail\ -*|*wc\ -*)
        # SAFE when the runner's status was CAPTURED first: the consumer then reads a string,
        # not a live pipe, so it can neither close the pipe early nor steal the exit status.
        # Without this exemption the gate condemns the very idiom it exists to mandate.
        case "$cmd" in
          *'=$('*|*'$?'*)
            printf '%s' "$cmd" | grep -q '\$?' || say NOTE "captures output but not the runner's status — assert on both: ${cmd:0:40}" ;;
          *)
            say STOLEN "exit status belongs to '$(printf '%s' "$last" | sed 's/^ *//' | cut -c1-24)', not the runner — a crash cannot be seen: ${cmd:0:40}"
            printf '         fix: out=$(<runner> 2>&1); rc=$?; printf %%s "$out" | grep -qE ...   # assert on BOTH\n'
            : > /tmp/pdg-stolen ;;
        esac ;;
    esac ;;
  esac
  case "$cmd" in
    *"git diff"*generated*) say FAIL "targets a gitignored path — can never observe its change: ${cmd:0:60}";;
    *) out=$( cd "$WT" && perl -e 'alarm 90; exec @ARGV' /bin/zsh -lc "$cmd" 2>&1 ); rc=$?
       # A command that CRASHES also exits nonzero. "RED" only means something if the
       # command actually RAN. Startup/usage failures discriminate nothing and must never
       # be scored as healthy — that is false confidence, worse than no gate.
       # "No test files found" is BROKEN only when the PLAN does not intend to CREATE that file.
       # A slice whose work IS writing the test (S02's render tests) legitimately reports it as
       # its pre-fix RED. Classifying that as BROKEN blocks a correct plan with a false finding —
       # which this gate did, because the rule was validated on S01 (file should exist) and never
       # on S02 (file must not exist yet).
       if printf '%s' "$out" | grep -qiE 'no test files found|no tests found'; then
         miss=$(printf '%s' "$cmd" | grep -oE '[A-Za-z0-9_./-]+\.test\.(ts|tsx)' | head -1)
         if [ -n "$miss" ] && grep -qF "$miss" "$PLAN"; then
           say RED "pre-fix RED: test file not created yet, and the PLAN declares it — expected: ${miss##*/}"
         else
           say BROKEN "target does not exist and the PLAN never creates it — wrong path or wrong dir: ${cmd:0:40}"
           : > /tmp/pdg-broken
         fi
       elif printf '%s' "$out" | grep -qiE 'startup error|unexpected argument|failed to load|^usage:|command not found|cannot find module|0 passed \\(0\\)'; then
         say BROKEN "command does not RUN — pins nothing: ${cmd:0:44}"
         printf '         %s\n' "$(printf '%s' "$out" | grep -iE 'startup error|unexpected argument|failed to load|command not found' | head -1 | cut -c1-70)"
         : > /tmp/pdg-broken
       elif printf '%s' "$out" | grep -qiE "epipe|broken pipe|unhandled 'error' event|node:events:[0-9]+"; then
         # DYNAMIC counterpart to STOLEN: the runner died mid-run and the status hid it.
         say BROKEN "runner CRASHED during the run (EPIPE/unhandled error) while the pipeline exited $rc: ${cmd:0:40}"
         printf '         %s\n' "$(printf '%s' "$out" | grep -iE "epipe|broken pipe|unhandled 'error' event" | head -1 | cut -c1-70)"
         : > /tmp/pdg-broken
       elif [ $rc -eq 0 ]; then say CLASS "pre-fix GREEN — declare its category (feature-assertion MUST be red): ${cmd:0:40}"
       else say RED "pre-fix RED (ran, and failed — discriminates): ${cmd:0:44}"; fi;;
  esac
done
echo
[ -f /tmp/pdg-broken ] && FAIL=1
[ -f /tmp/pdg-stolen ] && FAIL=1
[ $FAIL -eq 0 ] && echo "GATE: no blocking defect found" || echo "GATE: BLOCKING DEFECT — do not dispatch"
exit $FAIL
