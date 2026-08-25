#!/bin/zsh
set -eu

log_root=docs/missions/2026-08-17-accounts-privacy-security/logs
launcher=$log_root/T1-rework9-gate-launcher.mjs
controller=$log_root/T1-rework9-gate-controller.mjs
worker=$log_root/T1-rework9-gate-worker.mjs
viewer=$log_root/T1-rework9-gate-viewer.mjs
controller_plist=$log_root/T1-rework9-gate-controller.plist.template
worker_plist=$log_root/T1-rework9-gate-worker.plist.template
rework1_fixture=$log_root/T1-rework9-rework1-static-fixture.mjs
rework2_fixture=$log_root/T1-rework9-rework2-static-fixture.mjs
rework3_fixture=$log_root/T1-rework9-rework3-static-fixture.mjs
rework3_core=$log_root/T1-rework9-rework3-recovery-core.mjs
rework3_tool=$log_root/T1-rework9-rework3-never-started-recovery.mjs
rework3_authority=$log_root/T1-rework9-rework3-never-started-authority.json
rework3_evidence=$log_root/T1-rework9-rework3-never-started-failure-evidence.json
rework3_probe=$log_root/T1-rework9-rework3-runtime-probe.mjs
rework3_probe_plist=$log_root/T1-rework9-rework3-runtime-probe.plist.template
rework5_fixture=$log_root/T1-rework9-rework5-static-fixture.mjs
rework5_tool=$log_root/T1-rework9-rework5-never-started-recovery.mjs
rework5_authority=$log_root/T1-rework9-rework5-never-started-authority.json
rework5_evidence=$log_root/T1-rework9-rework5-never-started-failure-evidence.json
rework6_fixture=$log_root/T1-rework9-rework6-static-fixture.mjs
rework6_stream_custody=$log_root/T1-rework9-launchd-stream-custody.mjs
rework6_tool=$log_root/T1-rework9-rework6-never-started-recovery.mjs
rework6_authority=$log_root/T1-rework9-rework6-never-started-authority.json
rework6_evidence=$log_root/T1-rework9-rework6-never-started-failure-evidence.json
rework7_fixture=$log_root/T1-rework9-rework7-static-fixture.mjs
rework7_tool=$log_root/T1-rework9-rework7-interrupted-recovery.mjs
rework7_authority=$log_root/T1-rework9-rework7-interrupted-authority.json
rework7_evidence=$log_root/T1-rework9-rework7-interrupted-failure-evidence.json
rework7_custody=$log_root/T1-rework9-rework7-custody-check.mjs
rework8_fixture=$log_root/T1-rework9-rework8-static-fixture.mjs
rework8_tool=$log_root/T1-rework9-rework8-abort-recovery.mjs
rework8_authority=$log_root/T1-rework9-rework8-abort-authority.json
rework8_evidence=$log_root/T1-rework9-rework8-abort-failure-evidence.json
rework8_custody=$log_root/T1-rework9-rework8-custody-check.mjs
full_gate_parsers=$log_root/T1-rework9-supervisor-parsers.mjs
full_gate_fixture=$log_root/T1-rework9-full-gate-static-fixture.mjs
full_gate_recovery_fixture=$log_root/T1-rework9-full-gate-recovery-static-fixture.mjs
full_gate_tool=$log_root/T1-rework9-full-gate-recovery.mjs
full_gate_authority=$log_root/T1-rework9-full-gate-recovery-authority.json
full_gate_evidence=$log_root/T1-rework9-full-gate-failure-evidence.json
full_gate_custody=$log_root/T1-rework9-full-gate-custody-check.mjs

node --check $launcher
node --check $controller
node --check $worker
node --check $viewer
node --check $rework1_fixture
node --check $rework2_fixture
node --check $rework3_fixture
node --check $rework3_core
node --check $rework3_tool
node --check $rework3_probe
node --check $rework5_fixture
node --check $rework5_tool
node --check $rework6_fixture
node --check $rework6_stream_custody
node --check $rework6_tool
node --check $rework7_fixture
node --check $rework7_tool
node --check $rework7_custody
node --check $rework8_fixture
node --check $rework8_tool
node --check $rework8_custody
node --check $full_gate_parsers
node --check $full_gate_fixture
node --check $full_gate_recovery_fixture
node --check $full_gate_tool
node --check $full_gate_custody
/usr/bin/plutil -lint $controller_plist $worker_plist $rework3_probe_plist
zsh -n $log_root/T1-rework9-run-evidence.sh
zsh -n $log_root/T1-rework9-static-supervisor-check.sh

if rg -n 'setopt MONITOR|setsid|detached:[[:space:]]*true|kill -0|rm -rf' \
  $launcher $controller $worker $viewer $controller_plist $worker_plist; then
  print -u2 -- "forbidden supervisor primitive"
  exit 1
fi
if rg -n '/bin/launchctl|spawn\([^\n]*launchctl|\.kill\(|rmdirSync\(' $viewer; then
  print -u2 -- "viewer contains authority-bearing operation"
  exit 1
fi

test $(rg -c 'mkdirSync\(lockPath' $launcher) -eq 1
rg -q 'EXCLUSIVE_LOCK_CONFLICT' $launcher
rg -q 'worker-bootstrap-requested\.json' $controller
rg -q 'O_CREAT \| constants\.O_EXCL' $controller
rg -q 'unlinkSync\(join\(owner\.lock\.path, "claim\.json"\)\)' $controller
rg -q 'rmdirSync\(owner\.lock\.path\)' $controller
rg -q 'detached: false' $worker
rg -q 'process\.exitCode = 0' $worker
rg -q 'STALLED/UNKNOWN' $viewer
rg -q 'TERMINAL_PASS' $controller
rg -q 'TERMINAL_FAIL' $controller
rg -q 'INTERRUPTED' $controller
rg -q 'UNKNOWN_HELD' $controller
if rg -q 'mkdtempSync' $launcher; then
  print -u2 -- "launcher temp path is not packet-precomputable"
  exit 1
fi
rg -Fq 'const runTmpdir = join(tmpdir(), `debateai-t1gate-${runId}`);' $launcher
rg -Fq 'mkdirSync(runTmpdir, { mode: 0o700 });' $launcher
rg -q 'PRIVATE_TMPDIR_CREATE_FAILED' $launcher
rg -q 'PRIVATE_TMPDIR_CUSTODY_MISMATCH' $launcher
rg -q 'runTmpdirStat\.isSymbolicLink\(\)' $launcher
rg -q 'runTmpdirStat\.uid !== process\.getuid\(\)' $launcher
rg -q 'runTmpdirStat\.gid !== process\.getgid\(\)' $launcher
rg -q '\(runTmpdirStat\.mode & 0o777\) !== 0o700' $launcher
rg -q 'packet\.rendered_plist_sha256\.controller' $launcher
rg -q 'packet\.rendered_plist_sha256\.worker' $launcher
launcher_heavy_pattern=$(rg -N '^const HEAVY_PROCESS_PATTERN = ' $launcher)
controller_heavy_pattern=$(rg -N '^const HEAVY_PROCESS_PATTERN = ' $controller)
test "$launcher_heavy_pattern" = "$controller_heavy_pattern"
test $(rg -c 'classifyHeavyProcesses\(processSnapshot\)' $launcher) -eq 1
test $(rg -c 'classifyHeavyProcesses\(processSnapshot\)|classifyHeavyProcesses\(processPost\)' \
  $controller) -eq 2
rg -q 'POSTGRES_PROCESS_PATTERN\.test\(line\)' $controller
if rg -q 'join\(receiptDir, "(process|launchd)-post\.txt"\)' $controller; then
  print -u2 -- "fixed postflight snapshot name can preempt recovery"
  exit 1
fi
node $rework1_fixture postgres
node $rework1_fixture recovery
node $rework2_fixture
node $rework3_fixture
node $rework5_fixture
node $rework6_fixture
node $rework7_fixture green
node $rework8_fixture green
node $rework8_fixture correction1-green
node $full_gate_fixture green
node $full_gate_recovery_fixture
node $full_gate_recovery_fixture correction1-green
rg -q '"classification": "NEVER_STARTED_ONLY"' $rework3_authority $rework3_evidence
rg -q '"external_unsandboxed_execution_required": true' $rework3_authority
rg -q '"no_test_worker_or_supervisor_execution_authority": true' $rework3_authority
rg -q 'immutable recovery intent precedes the only rename' $rework3_tool
rg -q 'archiveLockPreservingInodes' $rework3_tool
if rg -n 'launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync' \
  $rework3_tool; then
  print -u2 -- "recovery tool contains execution or deletion authority"
  exit 1
fi
rg -q '"classification": "NEVER_STARTED_ONLY"' $rework5_authority $rework5_evidence
rg -q '"external_unsandboxed_execution_required": true' $rework5_authority
rg -q '"no_test_viewer_worker_or_supervisor_execution_authority": true' $rework5_authority
rg -q 'viewer\.ready\.json' $rework5_tool
rg -q 'immutable recovery intent precedes the only rename' $rework5_tool
rg -q 'archiveLockPreservingInodes' $rework5_tool
if rg -n 'launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync' \
  $rework5_tool; then
  print -u2 -- "rework5 recovery tool contains execution or deletion authority"
  exit 1
fi
rg -q '"classification": "SUPERVISOR_ONLY_NEVER_STARTED"' $rework6_authority $rework6_evidence
rg -q '"external_unsandboxed_execution_required": true' $rework6_authority
rg -q '"no_new_run_test_viewer_worker_or_supervisor_authority": true' $rework6_authority
rg -q 'Immutable intent precedes the sole atomic archive' $rework6_tool
rg -q 'archiveLockPreservingInodes' $rework6_tool
if rg -n 'launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync' \
  $rework6_tool; then
  print -u2 -- "rework6 recovery tool contains execution or deletion authority"
  exit 1
fi
rg -q '"classification": "SUPERVISOR_INTERRUPTED_NO_TEST_MODULE_LOADED"' \
  $rework7_authority $rework7_evidence
rg -q '"external_unsandboxed_execution_required": true' $rework7_authority
rg -q '"grok_rework7_approval_required_before_execution": true' $rework7_authority
rg -q '"no_new_run_test_viewer_worker_or_supervisor_authority": true' $rework7_authority
rg -q 'Immutable intent precedes the sole atomic archive' $rework7_tool
rg -q 'archiveLockPreservingInodes' $rework7_tool
if rg -n 'launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync' \
  $rework7_tool; then
  print -u2 -- "rework7 recovery tool contains execution or deletion authority"
  exit 1
fi
rg -q '"classification": "LAUNCHER_ABORT_BEFORE_OWNER"' \
  $rework8_authority $rework8_evidence
rg -q '"external_unsandboxed_execution_required": true' $rework8_authority
rg -q '"grok_rework8_approval_required_before_execution": true' $rework8_authority
rg -q '"private_runtime_preservation_required": true' $rework8_authority
rg -q '"no_new_run_test_viewer_worker_or_supervisor_authority": true' $rework8_authority
rg -q 'Immutable intent precedes the sole atomic archive' $rework8_tool
rg -q 'archiveLockPreservingInode' $rework8_tool
rg -q 'verifyPrivateRuntimePreserved' $rework8_tool
rg -Uq 'key === "inode" \? "ino"[[:space:]]*: key === "mtime_ms" \? "mtimeMs" : key' \
  $rework8_tool
if rg -n 'launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync' \
  $rework8_tool; then
  print -u2 -- "rework8 recovery tool contains execution or deletion authority"
  exit 1
fi
rg -q 'classifyPostflightProcesses' $controller $full_gate_parsers
rg -q 'parseVitestCounts\(output\)' $worker
rg -q 'stripAnsi' $full_gate_parsers
rg -q '"supervisor_parsers"' $launcher
if rg -q 'line\.includes\(owner\.run_id\)' $controller; then
  print -u2 -- "controller still treats a global UUID substring as process ownership"
  exit 1
fi
rg -q 'record\.pid === controller\.pid' $full_gate_parsers
rg -q 'ownedPids\.has\(record\.ppid\)' $full_gate_parsers
rg -q 'controller\.argv' $full_gate_parsers
rg -q 'viewerIdentityArgv' $full_gate_parsers
rg -q 'record\.command\.includes\("/usr/bin/tail"\)' $full_gate_parsers
rg -q '"classification": "TERMINAL_PRODUCT_PASS_CUSTODY_HELD_FALSE_POSITIVE"' \
  $full_gate_authority $full_gate_evidence
rg -q '"grok_recovery_review_required_before_execution": true' \
  $full_gate_authority
rg -q '"no_test_worker_controller_viewer_or_new_run_authority": true' \
  $full_gate_authority
rg -q '"controller_required_state": "present_not_running_or_exited_last_exit_0_no_pid"' \
  $full_gate_authority
rg -Fq 'state = (not running|exited)' $full_gate_tool
rg -q 'last exit code = 0' $full_gate_tool
rg -Fq 'pid = \d+' $full_gate_tool
rg -q 'writeImmutableJson\(INTENT_PATH' $full_gate_tool
rg -q 'writeImmutableJson\(SUPPLEMENT_PATH' $full_gate_tool
rg -q 'archiveLockPreservingInodes' $full_gate_tool
rg -q 'writeImmutableJson\(MARKER_PATH' $full_gate_tool
if rg -n 'launchctl", \["bootstrap"|launchctl", \["bootout"|unlinkSync|rmdirSync|rmSync' \
  $full_gate_tool; then
  print -u2 -- "full-gate recovery contains execution or deletion authority"
  exit 1
fi
rg -q 'launchd_streams: launchdStreams' $launcher
rg -q 'for \(const stream of Object.values\(launchdStreamPaths\)\)' $launcher
rg -Fq 'for (const stream of [testStdout, testStderr])' $launcher
if rg -q 'CONTROLLER_STDOUT: controllerStdout|CONTROLLER_STDERR: controllerStderr|WORKER_STDOUT: workerStdout|WORKER_STDERR: workerStderr' $launcher; then
  print -u2 -- "launchd plist still points at Documents receipt stream"
  exit 1
fi
rg -q 'sealLaunchdStreams' $controller
rg -q 'launchd_streams_sha256' $controller
rg -Fq 'const PINNED_TEST_RUNTIME = "/Users/vladmihaimiron/.hermes/node/bin/node";' $launcher
rg -q 'PINNED_VITEST_ENTRYPOINT' $launcher $worker
rg -q 'packet\.test_runtime' $launcher $worker
rg -q 'packet\.vitest_entrypoint' $launcher $worker
rg -Fq 'spawn(testRuntime.path, [vitestEntrypoint.path, ...PINNED_TEST_ARGS]' $worker
rg -q 'readlinkSync' $launcher $worker $controller
rg -q 'vitest_package_link' $launcher $worker $controller
rg -q 'canonicalEntrypointPath' $launcher $worker $controller
if rg -q 'realpathSync\(PINNED_VITEST_ENTRYPOINT\) !== PINNED_VITEST_ENTRYPOINT' \
  $launcher $worker; then
  print -u2 -- "logical pnpm entrypoint is still required to equal realpath"
  exit 1
fi
if rg -q 'spawn\(argv\[0\], argv\.slice\(1\)' $worker; then
  print -u2 -- "worker still executes unbound argv[0]"
  exit 1
fi
if rg -Uq 'for \(const fd of \[1, 2\]\)[\s\S]{0,120}closeSync\(fd\)' $controller; then
  print -u2 -- "controller still raw-closes redirected stdio"
  exit 1
fi
rg -q 'verifySealedLaunchdStreams' $controller $rework6_stream_custody
test $(rg -Fc '<string>/bin/zsh</string>' $controller_plist) -eq 1
test $(rg -Fc '<string>/bin/zsh</string>' $worker_plist) -eq 1
test $(rg -Fc '<string>exec &quot;$@&quot;</string>' $controller_plist) -eq 1
test $(rg -Fc '<string>exec &quot;$@&quot;</string>' $worker_plist) -eq 1
rg -Fq 'stdio: ["inherit", "pipe", "inherit"]' $viewer
rg -q '<key>ProcessType</key>' $controller_plist $worker_plist
rg -q '<string>Standard</string>' $controller_plist $worker_plist
rg -q '<key>AbandonProcessGroup</key>' $controller_plist $worker_plist
rg -q '<key>KeepAlive</key>' $controller_plist $worker_plist

test $(rg -c '^[[:space:]]*it\(' tests/integration/registration-database.test.ts) -eq 56
test $(git diff --cached --name-only | wc -l | tr -d ' ') -eq 0
test $(git rev-parse HEAD) = 7918f4f8bff33909792afc01dc38d402972b4ccd
test $(shasum -a 256 apps/api/src/registration.ts | awk '{print $1}') = \
  1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03
test $(shasum -a 256 tests/integration/registration-database.test.ts | awk '{print $1}') = \
  58342fe2ce49b9835fc47af04114cb0219442721305fca2adcd6611ef5407191
if test -e $log_root/.T1-full-registration.exclusive.lock; then
  if test ! -e $log_root/.T1-full-registration.exclusive.lock/claim.json; then
    abort_receipt=$log_root/T1-rework9-gate-302197e8-e713-47f7-9518-9f078eede931
    abort_private=/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-302197e8-e713-47f7-9518-9f078eede931
    test -z "$(ls -A $log_root/.T1-full-registration.exclusive.lock)"
    test "$(ls -A $abort_receipt)" = launcher-abort.json
    test $(shasum -a 256 $abort_receipt/launcher-abort.json | awk '{print $1}') = \
      e10a9c0474289948ecfb445a6368ef50840e7233b650476a7773a7acb73a3e82
    test "$(stat -f '%d:%i:%Lp:%u:%g' $abort_private)" = 16777233:46921158:700:501:20
    test "$(ls -A $abort_private | sort | tr '\n' ',')" = \
      controller-custody.secret,viewer-challenge,
    test $(shasum -a 256 $abort_private/controller-custody.secret | awk '{print $1}') = \
      f84b786a218c356d25075efe9dc79cfb5432c537f03b0608448341b7f7c2b270
    test $(shasum -a 256 $abort_private/viewer-challenge | awk '{print $1}') = \
      ba8370bfc1f7937abf32112fb1d472b2e9e54494d9679aaff9a4c5b40579edb2
    test ! -e $abort_receipt/launcher-abort-rework8-recovery-intent.json
    test ! -e $abort_receipt/launcher-abort-rework8-recovery.json
    test ! -e $abort_receipt/launcher-abort-rework8-archived-lock
  else
    claim_sha=$(shasum -a 256 $log_root/.T1-full-registration.exclusive.lock/claim.json | awk '{print $1}')
    case $claim_sha in
    d51149eb7036f6c4ccf7557982e13d7860e3efffcbf6439d8aa129b80b939c86)
      current_receipt=$log_root/T1-rework9-gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14
      test "$(stat -f '%d:%i' $log_root/.T1-full-registration.exclusive.lock)" = \
        16777233:47087786
      test "$(stat -f '%i' $log_root/.T1-full-registration.exclusive.lock/claim.json)" = \
        47087814
      test $(shasum -a 256 $current_receipt/owner.json | awk '{print $1}') = \
        679d3eba35373659e34c847b7ea652d995a0048eefbabe9c4c7e2387a575c6f0
      test $(shasum -a 256 $current_receipt/worker-terminal.json | awk '{print $1}') = \
        138bb1472fc05c75a2779febb49e104a4619d2d1ee10f82b68291c4ea3e99738
      test $(shasum -a 256 $current_receipt/launchd-streams.json | awk '{print $1}') = \
        f6c881172df9a3a6b1e665dc40acf139edc5ff8bd64598793ddd0f76a0bdbfc5
      test $(shasum -a 256 $current_receipt/test.stdout.log | awk '{print $1}') = \
        0274f03d85a684ab7486b1107e0f6ceb4316f96bd1d88f0e8d4225c743c8894f
      test $(shasum -a 256 $current_receipt/postflight-epoch-1.json | awk '{print $1}') = \
        d4e5c7d46f947ebe8caf8cf83c4025637f1f12fde29c6e74d6863a7f4c62cd8c
      test ! -e $current_receipt/terminal.json
      test ! -e $current_receipt/release.json
      test ! -e $current_receipt/full-gate-custody-recovery-intent.json
      test ! -e $current_receipt/vitest-counts-supplement.json
      test ! -e $current_receipt/full-gate-custody-recovery.json
      test ! -e $current_receipt/full-gate-custody-archived-lock
      ;;
    e9be4c2450f95c2b6b10fc7d2b6d728415cdca0609fee276fd3cbb2d9e6b1e69)
      current_receipt=$log_root/T1-rework9-gate-e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16
      test $(shasum -a 256 $current_receipt/owner.json | awk '{print $1}') = \
        7dad353a9d298d11868c5febcdbc2176cd62e65a363283099e34834cf64830d8
      test ! -e $current_receipt/never-started-rework5-recovery-intent.json
      test ! -e $current_receipt/never-started-rework5-recovery.json
      test ! -e $current_receipt/never-started-rework5-archived-lock
      ;;
    8c598375472af4d603a803470d54dd9619b116e9c9cd06e986bf7b9d19df7f4d)
      current_receipt=$log_root/T1-rework9-gate-15c9c6c5-3ca3-4e68-9fb9-587d8e19309f
      test $(shasum -a 256 $current_receipt/owner.json | awk '{print $1}') = \
        0e253cca9d8c8c3278fce38406c8dc7a993284959b5234a10d1f8434a3f8dd65
      test $(shasum -a 256 $current_receipt/viewer.ready.json | awk '{print $1}') = \
        5f2f47c1c2996177984f7dcc8119f1ef1241db93fb8d6857e7ef1c3754dc359f
      test ! -e $current_receipt/never-started-rework6-recovery-intent.json
      test ! -e $current_receipt/never-started-rework6-recovery.json
      test ! -e $current_receipt/never-started-rework6-archived-lock
      ;;
    bac88b8943d2f8ce0ec080cf2bb916ae431221dea175599d02066d0e8efd6545)
      current_receipt=$log_root/T1-rework9-gate-7821bdb5-0559-43f4-804e-6996bb9f18a4
      test $(shasum -a 256 $current_receipt/owner.json | awk '{print $1}') = \
        953f0998fedb9b048069604270745855b80e179df0bcaff0a907261d76c12017
      test $(shasum -a 256 $current_receipt/worker-terminal.json | awk '{print $1}') = \
        f23e6713d6a1395b58bdb9cd89b8d673f1cb2d7449dc1c3bc49a87ce5ea4b235
      test $(shasum -a 256 $current_receipt/launchd-streams.json | awk '{print $1}') = \
        ceb690e87382dc8bab6d1e817c0de4e132fc6fd5161a6b71f379799f0a899a88
      test ! -e $current_receipt/interrupted-rework7-recovery-intent.json
      test ! -e $current_receipt/interrupted-rework7-recovery.json
      test ! -e $current_receipt/interrupted-rework7-archived-lock
      ;;
    fba7e6e38c05e5e88548fa85faeae4eaf571f46221cdf249674d98cba7a32b88)
      old_receipt=$log_root/T1-rework9-gate-586303c8-f8de-4118-b888-9730abf902be
      test $(shasum -a 256 $old_receipt/owner.json | awk '{print $1}') = \
        8c745c31cda15bd57ef461679ca8835fdfc3a57ca13f6075428d6bae255ee87b
      ;;
    *)
      print -u2 -- "unrecognized exclusive lock claim"
      exit 1
      ;;
    esac
  fi
else
  full_gate_receipt=$log_root/T1-rework9-gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14
  rework6_receipt=$log_root/T1-rework9-gate-15c9c6c5-3ca3-4e68-9fb9-587d8e19309f
  if test -e $full_gate_receipt/full-gate-custody-recovery.json; then
    test -e $full_gate_receipt/full-gate-custody-recovery-intent.json
    test -e $full_gate_receipt/vitest-counts-supplement.json
    test -e $full_gate_receipt/full-gate-custody-archived-lock/claim.json
    test $(shasum -a 256 $full_gate_receipt/full-gate-custody-archived-lock/claim.json | awk '{print $1}') = \
      d51149eb7036f6c4ccf7557982e13d7860e3efffcbf6439d8aa129b80b939c86
  elif test -e $rework6_receipt/never-started-rework6-recovery.json; then
    test -e $rework6_receipt/never-started-rework6-recovery-intent.json
    test -e $rework6_receipt/never-started-rework6-archived-lock/claim.json
  else
    current_receipt=$log_root/T1-rework9-gate-e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16
    test -e $current_receipt/never-started-rework5-recovery-intent.json
    test -e $current_receipt/never-started-rework5-recovery.json
    test -e $current_receipt/never-started-rework5-archived-lock/claim.json
  fi
fi

print -- "T1_REWORK9_STATIC_SUPERVISOR_CHECK_GREEN"
