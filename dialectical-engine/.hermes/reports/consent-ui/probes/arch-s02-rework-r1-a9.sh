#!/bin/bash
# ARCH-S02-REWORK-R1 — charge A9 under COMMON.md §10.16-§10.20.
# Run this file with /bin/bash (BSD grep, C locale) AND source its functions inline; both
# verdicts are reported. Every term is ASCII; nothing matches vitest's status glyph.
export LC_ALL=C
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine
cd "$LANE" || exit 9

# ---------------------------------------------------------------------------
# guard(): PURE over the two captured summary lines + the runner's exit status.
# Split out from run() so it can be fed a SYNTHETIC capture (§10.16 (b),(c)).
#   $1 = n (expected file count)  $2 = vt (runner exit)  $3 = Tests line  $4 = Test Files line
# ---------------------------------------------------------------------------
guard() {
  g_n="$1"; g_vt="$2"; g_sum="$3"; g_fil="$4"
  t1=1; t2=1; t3=1; t4=1
  printf '%s\n' "$g_sum" | grep -qE "^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed" && t1=0
  printf '%s\n' "$g_sum" | grep -q 'failed' || t2=0
  printf '%s\n' "$g_fil" | grep -qE "^[[:space:]]*Test Files[[:space:]]+${g_n} passed \(${g_n}\)" && t3=0
  [ "$g_vt" -eq 0 ] && t4=0
  [ $t1 -eq 0 ] && [ $t2 -eq 0 ] && [ $t3 -eq 0 ] && [ $t4 -eq 0 ]
  gv=$?
  echo "      terms: T1(Tests N passed, N>0)=$t1  T2(no 'failed')=$t2  T3(Test Files $g_n passed ($g_n))=$t3  T4(exit 0)=$t4  -> VERDICT=$gv"
  return $gv
}

run() {
  id="$1"; n="$2"; shift 2
  out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
  sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  fil=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
  bs=$(printf '%s\n' "$out" | grep -ciE 'startup error|unexpected argument|failed to load|usage:|command not found')
  cm=$(printf '%s\n' "$out" | grep -ciE 'cannot find module|failed to resolve import')
  nf=$(printf '%s\n' "$out" | grep -ciE 'no test files found')
  guard "$n" "$vt" "$sum" "$fil" >/dev/null; v=$?
  echo "$id | vt=$vt VERDICT=$v | brokenSigs=$bs cannotFindModule=$cm noTestFiles=$nf"
  echo "$id | Tests    : ${sum:-<none>}"
  echo "$id | TestFiles: ${fil:-<none>}"
  [ -z "$sum" ] && echo "$id | raw      : $(printf '%s\n' "$out" | grep -iE 'no test files found|cannot find module|failed to resolve import' | head -1)"
  return $v
}

# C9 adds the two merge arms (ARCH-REV-S02-r1 N1).
merge_arms() {
  s01=$(grep -c -- '--scrim:' apps/ui/app/globals.css)
  s02=$(grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css)
  echo "S02-C9 | mergeArms: '--scrim:'=$s01 (expect 2)  'consent-ui S02' markers=$s02 (expect 2)"
  [ "$s01" -eq 2 ] && [ "$s02" -eq 2 ]
}
run_c9() { n="$1"; shift; run S02-C9 "$n" "$@"; rc=$?; merge_arms; ma=$?; [ $rc -eq 0 ] && [ $ma -eq 0 ]; }

echo "=============== A9 / part 1: the NINE cluster commands, at base ==============="
run S02-C1 1 tests/render/consent-modal-semantics.test.tsx
run S02-C2 1 tests/unit/consent-privacy-policy-data.test.ts
run S02-C3 3 tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C4 4 tests/render/consent-signup-gate.test.tsx tests/render/consent-signup-group.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C5 1 tests/render/consent-policy-modal-render.test.tsx
run S02-C6 2 tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-policy-modal-render.test.tsx
run S02-C7 5 tests/render/consent-signup-modal.test.tsx tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts
run S02-C8 1 tests/unit/consent-s02-style-contract.test.ts
run_c9 10 tests/render/consent-modal-semantics.test.tsx tests/unit/consent-privacy-policy-data.test.ts tests/render/consent-signup-group.test.tsx tests/render/consent-signup-gate.test.tsx tests/render/consent-policy-modal-render.test.tsx tests/render/consent-policy-modal-behaviour.test.tsx tests/render/consent-signup-modal.test.tsx tests/unit/consent-s02-style-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts

echo
echo "=============== A9 / part 2: the guard fed KNOWN-GOOD synthetic captures ==============="
echo "-- A: n=1, exit 0, a clean green summary  (MUST be VERDICT=0)"
guard 1 0 '      Tests  10 passed (10)' ' Test Files  1 passed (1)'; echo "   -> $?"
echo "-- B: n=5, exit 0, a clean green summary  (MUST be VERDICT=0)"
guard 5 0 '      Tests  63 passed (63)' ' Test Files  5 passed (5)'; echo "   -> $?"
echo "-- C: n=10, exit 0, a clean green summary (MUST be VERDICT=0)"
guard 10 0 '      Tests  120 passed (120)' ' Test Files  10 passed (10)'; echo "   -> $?"

echo
echo "=============== A9 / part 3: ONE MUTANT PER GUARD TERM (each MUST flip) ==============="
echo "-- T1 mutant: zero tests ran but the file count is right (an empty suite)"
guard 1 0 '      Tests  0 passed (0)' ' Test Files  1 passed (1)'; echo "   -> $? (expect 1)"
echo "-- T1 mutant: the summary word appears in a TEST TITLE, not anchored at line start"
guard 1 0 '   x should print Tests  9 passed (9) when done' ' Test Files  1 passed (1)'; echo "   -> $? (expect 1)"
echo "-- T2 mutant: some passed, some failed"
guard 1 0 '      Tests  1 failed | 9 passed (10)' ' Test Files  1 passed (1)'; echo "   -> $? (expect 1)"
echo "-- T3 mutant: variant 7 — one of the named files did not exist, so only 4 of 5 ran"
guard 5 0 '      Tests  50 passed (50)' ' Test Files  4 passed (4)'; echo "   -> $? (expect 1)"
echo "-- T3 mutant: the file count line is absent entirely"
guard 5 0 '      Tests  50 passed (50)' ''; echo "   -> $? (expect 1)"
echo "-- T4 mutant: a green-looking summary with a nonzero runner exit"
guard 1 1 '      Tests  10 passed (10)' ' Test Files  1 passed (1)'; echo "   -> $? (expect 1)"

echo
echo "=============== A9 / part 4: the C9 MERGE ARMS, and their mutants ==============="
echo "-- live, at base (both arms are 0 before the merge; that is one more declared RED reason)"
merge_arms; echo "   -> $? (expect 1 at base)"
marm() {  # pure form, so the mutants are real
  echo "      s01=$1 s02=$2"; [ "$1" -eq 2 ] && [ "$2" -eq 2 ]; echo "      -> $?"
}
echo "-- known-GOOD synthetic (post-merge): "; marm 2 2
echo "-- mutant: the merge lost S01's block  ";  marm 0 2
echo "-- mutant: the merge lost S02's block  ";  marm 2 0
echo "-- mutant: S02's block duplicated      ";  marm 2 4

echo
echo "=============== A9 / part 5: the THREE standing gates, mechanical ==============="
# MONOTONE-DELTA form (TOOLING-TRAPS "assert what must not appear, never what must remain
# broken"): the arms are (a) generate:contract exited 0, (b) tsc ACTUALLY RAN — its own
# fingerprint line, so a run that never happened cannot pass vacuously (COMMON §10.19), and
# (c) ZERO diagnostics outside the pinned file. The pinned TOTAL is REPORTED, never asserted:
# it is another mission's number and this guard must not die the day they repair it.
g1_terms() {  # $1 generate exit  $2 tsc-ran fingerprint  $3 diagnostics elsewhere  $4 s14 total (reported)
  echo "      G1 terms: generateExit=$1 tscRanFingerprint=$2 diagnosticsElsewhere=$3 | s14Total=$4 (reported, NOT asserted)"
  [ "$1" -eq 0 ] && [ "$2" -eq 1 ] && [ "$3" -eq 0 ]
}
gate_g1() {
  gc=$(pnpm run generate:contract 2>&1); gcrc=$?
  tc=$(pnpm typecheck 2>&1);            tcrc=$?
  n_ran=$(printf '%s\n' "$tc"   | grep -cE '^\$ tsc --noEmit$')
  n_s14=$(printf '%s\n' "$tc"   | grep -cE '^tests/unit/s14-ui\.test\.ts\([0-9]+,[0-9]+\): error TS')
  n_all=$(printf '%s\n' "$tc"   | grep -cE '^[^ ]+\([0-9]+,[0-9]+\): error TS')
  n_oth=$((n_all - n_s14))
  echo "      G1 raw   : generateExit=$gcrc typecheckExit=$tcrc tscRan=$n_ran s14=$n_s14 all=$n_all"
  g1_terms "$gcrc" "$n_ran" "$n_oth" "$n_s14"
}
gate_g1; echo "   G1 VERDICT=$? (expect 0 — the DELTA holds)"
echo "-- G1 mutants:"
echo -n "   a diagnostic OUTSIDE the pinned file      : "; g1_terms 0 1 1 8 >/dev/null; echo "$? (expect 1)"
echo -n "   typecheck never ran (no fingerprint)      : "; g1_terms 0 0 0 0 >/dev/null; echo "$? (expect 1)"
echo -n "   generate:contract never ran (exit 127)    : "; g1_terms 127 1 0 8 >/dev/null; echo "$? (expect 1)"
echo -n "   the OTHER mission REPAIRS its 8 (s14 -> 0): "; g1_terms 0 1 0 0 >/dev/null; echo "$? (expect 0 — the guard must SURVIVE this)"

g2_terms() {  # $1 exit  $2 FAIL lines  $3 toggle  $4 colourLiteral  $5 hitList  $6 pinnedHit
  echo "      G2 terms: exit=$1 FAILlines=$2 toggleNamed=$3 literalNamed=$4 hitList=$5 pinnedHit=$6"
  [ "$1" -eq 1 ] && [ "$2" -eq 2 ] && [ "$3" -eq 1 ] && [ "$4" -eq 1 ] && [ "$5" -eq 1 ] && [ "$6" -eq 1 ]
}
gate_g2() {
  out=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1); rc=$?
  nf=$(printf '%s\n' "$out" | grep -cE '^ FAIL +tests/unit/t9-mode-tokens\.test\.ts > ')
  f1=$(printf '%s\n' "$out" | grep -cE '^ FAIL +tests/unit/t9-mode-tokens\.test\.ts > .* > renders one accessible toggle that reads the document mode, flips it, and persists it$')
  f2=$(printf '%s\n' "$out" | grep -cE '^ FAIL +tests/unit/t9-mode-tokens\.test\.ts > .* > leaves no mode-inert colour literal in the four Wave-0 product files$')
  hits=$(printf '%s\n' "$out" | grep -cE '^\+ +"/.*:[0-9]+:')
  pin=$(printf  '%s\n' "$out" | grep -cE '^\+ +"/.*/apps/ui/app/globals\.css:[0-9]+:background: color-mix')
  g2_terms "$rc" "$nf" "$f1" "$f2" "$hits" "$pin"
}
gate_g2; echo "   G2 VERDICT=$? (expect 0 — the named-failure-set delta holds)"
echo "-- G2 mutants:"
echo -n "   a THIRD test fails                  : "; g2_terms 1 3 1 1 1 1 >/dev/null; echo "$? (expect 1)"
echo -n "   a SECOND colour literal (hit list 2): "; g2_terms 1 2 1 1 2 1 >/dev/null; echo "$? (expect 1)"
echo -n "   the PINNED hit silently vanished    : "; g2_terms 1 2 1 1 1 0 >/dev/null; echo "$? (expect 1)"
echo -n "   a DIFFERENT test failed instead     : "; g2_terms 1 2 0 1 1 1 >/dev/null; echo "$? (expect 1)"
echo -n "   the file went green (pin gone)      : "; g2_terms 0 0 0 0 0 0 >/dev/null; echo "$? (expect 1)"

echo "-- G3 live source guard (green at base, so the ordinary guard applies):"
run S02-G3 1 tests/unit/v2ui-node-runner.test.ts; echo "   G3 VERDICT=$? (expect 0)"

echo
echo "=============== A9 / part 6: environment and lane hygiene ==============="
echo "grep flavour in THIS shell : $(grep --version 2>&1 | head -1)"
echo "LC_ALL                     : ${LC_ALL:-<unset>}"
echo "\$ ls docs/architecture/01-decisions/ | tail -3"; ls docs/architecture/01-decisions/ | tail -3
echo "### lane porcelain: $(git status --porcelain | wc -l | tr -d ' ') entries"
