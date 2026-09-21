#!/bin/zsh

set -u

probe_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/MERGE-FIX-DEV
repo_root=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine
log_path=$probe_root/boot-order-b.log
shadow_root=$(mktemp -d "$probe_root/order-b-shadow.XXXXXX") || exit 70
trap 'rm -rf -- "$shadow_root"' EXIT

mkdir -p "$shadow_root/tests/integration"
cp "$repo_root/tests/integration/fpd-s01-l1-boot-role-assertions.test.ts" "$shadow_root/tests/integration/"
cp "$repo_root/tests/integration/dev-database-principals.test.ts" "$shadow_root/tests/integration/"
ln -s "$repo_root/tests/support" "$shadow_root/tests/support"
ln -s "$repo_root/apps" "$shadow_root/apps"
ln -s "$repo_root/packages" "$shadow_root/packages"
ln -s "$repo_root/node_modules" "$shadow_root/node_modules"

for test_path in "$shadow_root/tests/integration/"*.test.ts; do
  perl -0pi -e 's/^/import { migrateOrderB } from "\/Users\/vladmihaimiron\/Documents\/DebateAIRO\/dialectical-engine\/.worktrees\/all\/dialectical-engine\/.hermes\/reports\/free-public-debates\/probes\/MERGE-FIX-DEV\/migrate-order-b.js";\n/' "$test_path"
  perl -0pi -e 's/await migrate\(database\.pool\);/await migrateOrderB(database.pool);/' "$test_path"
done

cd "$repo_root" || exit 70
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run \
  --root "$shadow_root" \
  tests/integration/fpd-s01-l1-boot-role-assertions.test.ts \
  tests/integration/dev-database-principals.test.ts \
  --reporter=default >"$log_path" 2>&1
run_rc=$?
print "rc=$run_rc"
rg '^\s*Tests\s+|^\s*Test Files\s+|^ FAIL |^ × ' "$log_path" || true
exit "$run_rc"
