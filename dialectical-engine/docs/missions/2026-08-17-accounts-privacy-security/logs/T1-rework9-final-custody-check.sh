#!/bin/sh
set -eu

EXPECTED_HEAD="7918f4f8bff33909792afc01dc38d402972b4ccd"
LOG_ROOT="docs/missions/2026-08-17-accounts-privacy-security/logs"

actual_head="$(git rev-parse HEAD)"
test "$actual_head" = "$EXPECTED_HEAD"
test -z "$(git diff --cached --name-only)"

verify_tuple() {
  expected_hash="$1"
  expected_size="$2"
  expected_mtime="$3"
  path="$4"
  actual_hash="$(shasum -a 256 "$path" | awk '{print $1}')"
  actual_size="$(stat -f '%z' "$path")"
  actual_mtime="$(stat -f '%m' "$path")"
  test "$actual_hash" = "$expected_hash"
  test "$actual_size" = "$expected_size"
  test "$actual_mtime" = "$expected_mtime"
  printf 'governed_tuple=%s|%s|%s|%s\n' "$path" "$actual_hash" "$actual_size" "$actual_mtime"
}

verify_hash() {
  expected_hash="$1"
  path="$2"
  actual_hash="$(shasum -a 256 "$path" | awk '{print $1}')"
  test "$actual_hash" = "$expected_hash"
  printf 'artifact_hash=%s|%s\n' "$path" "$actual_hash"
}

verify_tuple 0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a 30548 1787391517 apps/api/src/index.ts
verify_tuple 91bf0e695ef847b0864bedd030c2ed94f4431d3864fa5e5a7e540aeec011342b 7061 1787395079 apps/api/src/main.ts
verify_tuple 1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03 65119 1787413534 apps/api/src/registration.ts
verify_tuple 66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6 27118 1787343024 packages/crypto/src/index.ts
verify_tuple c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b 10314 1787343013 packages/crypto/src/argon2-worker.ts
verify_tuple b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d 48111 1787357276 packages/crypto/src/argon2-worker-pool.ts
verify_tuple 2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f 25159 1787342997 packages/db/src/identity.ts
verify_tuple f8e406f1cd35393aa20eac5ef5679ed31dd8f9213ee2c727a5aacd9d706a4216 64506 1787395342 packages/register/src/auth-policy.ts
verify_tuple 58342fe2ce49b9835fc47af04114cb0219442721305fca2adcd6611ef5407191 310114 1787413129 tests/integration/registration-database.test.ts
verify_tuple baa9254edaf65965402b8d6714efcb63dcde4961f99268573b9bdc9903b0de53 102439 1787405601 tests/unit/registration.test.ts
verify_tuple 93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b 106612 1787349543 tests/unit/argon2-worker-pool.test.ts
verify_tuple 4896587d1fafc0d52c2389c3bd6336a05798ea1a89cadaa42280b6a0039fb18d 102059 1787395154 tests/architecture/t1-argon2-worker-contract.test.ts

verify_hash 8c332b0e8ea6fb7877d1b5b4ecf15c91fb211cb927113579b3932ecd57e80658 "$LOG_ROOT/T1-rework9-gate-launcher.mjs"
verify_hash a413eecb07001348166a82600dfbbf01dc7cef5ffb0fd67381b991c43397eb9f "$LOG_ROOT/T1-rework9-gate-controller.mjs"
verify_hash 59ec98c3ec5cc1904804a8507272d5b66118859baf063c53dc2849b7b02c1bd7 "$LOG_ROOT/T1-rework9-gate-worker.mjs"
verify_hash 97ce0cf9dff102cdcc8db9ca978157b13eee5f36b4cc6492e3a7b9e67c3c488e "$LOG_ROOT/T1-rework9-gate-controller.plist.template"
verify_hash 62a364276bce53bca0685ef4b99dcfbec507b81fc6546c5992bd4249cc1feada "$LOG_ROOT/T1-rework9-gate-worker.plist.template"
verify_hash 4eee931752130781c84df25f7bea818dc4b781ebd2a6ed2e67ed8573cfcb409f "$LOG_ROOT/T1-rework9-gate-viewer.mjs"
verify_hash f438318c25c04eb09024ecd1fc9eb9b15ad75a82f2dfe0a570b5cbc160301915 "$LOG_ROOT/T1-rework9-gate-contract.md"
verify_hash 8f6140ff9de59c5acb4c8ec400f0350557eee551c6365bd308be625a847a52f5 "$LOG_ROOT/T1-rework9-static-supervisor-check.sh"

verify_hash 74d2502e0c9ecf884fbe44b7420f8703c34b2490462afcbe9a2b8748c1b8c4d3 "$LOG_ROOT/T1-rework8-router-full-registration.log"
verify_hash 9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa "$LOG_ROOT/T1-rework8-router-full-registration.status"
verify_hash 93aea98ea4edb28045fda11329a47dc2ee4fc22f4cfd73b0a04d916dc436aeec "$LOG_ROOT/T1-rework8-router-full-registration-attempt2.log"
verify_hash 4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865 "$LOG_ROOT/T1-rework8-router-full-registration-attempt2.status"

test ! -e "$LOG_ROOT/.T1-full-registration.exclusive.lock"
active_processes="$(ps -Ao pid=,ppid=,command= | rg '[v]itest|[T]1-rework9-gate-(launcher|controller|worker|viewer)' || true)"
test -z "$active_processes"
active_labels="$(launchctl list | rg 'com\.debateai\.t1gate\.(controller|worker)\.' || true)"
test -z "$active_labels"

node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (x.governed_paths.length !== 12) process.exit(1)' "$LOG_ROOT/T1-rework9-final-manifest.json"

printf 'head=%s\n' "$actual_head"
printf 'staged_path_count=0\n'
printf 'governed_tuple_count=12\n'
printf 'supervisor_hash_count=8\n'
printf 'rework8_receipt_hash_count=4\n'
printf 'author_processes=0\n'
printf 'launchd_gate_labels=0\n'
printf 'global_lock=absent\n'
printf 'T1_REWORK9_FINAL_CUSTODY_GREEN\n'
