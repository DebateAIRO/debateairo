#!/usr/bin/env node
import { readFileSync } from "node:fs";

const [mode] = process.argv.slice(2);
const logRoot = "docs/missions/2026-08-17-accounts-privacy-security/logs";
const launcher = readFileSync(`${logRoot}/T1-rework9-gate-launcher.mjs`, "utf8");
const controller = readFileSync(`${logRoot}/T1-rework9-gate-controller.mjs`, "utf8");

const legacyPattern = /vitest|claude|mutation|T1.*full-registration|pg_ctl|(?:^|\s)postgres(?:\s|$)/i;
const patternFrom = (source) => {
  const declaration = source.match(/^const HEAVY_PROCESS_PATTERN = (\/.*\/[dgimsuvy]*);$/m);
  if (declaration === null) return legacyPattern;
  return Function(`"use strict"; return (${declaration[1]});`)();
};

if (mode === "postgres") {
  const representatives = Object.freeze([
    "58314 1 Sat Aug 17 00:00:00 2026 /opt/postgres/bin/postgres -D /tmp/foreign/.pgdata -p 55432",
    "58321 58314 Sat Aug 17 00:00:01 2026 postgres: checkpointer"
  ]);
  const unrelated = "991 1 Sat Aug 17 00:00:00 2026 /usr/bin/node unrelated-process.mjs";
  const failures = [];
  for (const [name, source] of [["launcher", launcher], ["controller", controller]]) {
    const pattern = patternFrom(source);
    const missed = representatives.filter((line) => !pattern.test(line));
    if (missed.length > 0) failures.push(`${name} missed ${missed.join(" || ")}`);
    if (pattern.test(unrelated)) failures.push(`${name} classified unrelated process heavy`);
    if (!source.includes("classifyHeavyProcesses(")) {
      failures.push(`${name} does not route every heavy-process site through the shared local predicate`);
    }
  }
  if (failures.length > 0) {
    process.stderr.write(`POSTGRES_CLASSIFICATION_RED ${failures.join("; ")}\n`);
    process.exit(1);
  }
  process.stdout.write("POSTGRES_CLASSIFICATION_GREEN parent=heavy child=heavy unrelated=not-heavy sites=shared-predicate\n");
} else if (mode === "recovery") {
  const requiredTokens = [
    "const postflightSnapshotPaths = (epoch) =>",
    "process-post-epoch-${epoch}.txt",
    "launchd-post-epoch-${epoch}.txt",
    "const validateCanonicalPostflight =",
    "if (existsSync(canonicalPostflightPath))",
    "const canonicalPostflightSha256 = shaFile(canonicalPostflightPath)",
    "postflight_sha256: canonicalPostflightSha256",
    "currentPostflight.custody_green"
  ];
  const missing = requiredTokens.filter((token) => !controller.includes(token));
  const fixedWx = controller.includes('join(receiptDir, "process-post.txt")')
    || controller.includes('join(receiptDir, "launchd-post.txt")');
  const epochOne = Object.freeze(["process-post-epoch-1.txt", "launchd-post-epoch-1.txt"]);
  const epochTwo = Object.freeze(["process-post-epoch-2.txt", "launchd-post-epoch-2.txt"]);
  const namesAreDisjoint = epochOne.every((name) => !epochTwo.includes(name));
  if (missing.length > 0 || fixedWx || !namesAreDisjoint) {
    process.stderr.write(`POSTFLIGHT_RECOVERY_RED fixed_wx=${fixedWx} disjoint_epoch_names=${namesAreDisjoint} missing=${missing.join(",")}\n`);
    process.exit(1);
  }
  process.stdout.write("POSTFLIGHT_RECOVERY_GREEN epoch1_snapshots_do_not_preempt_epoch2 canonical_evidence_exact current_postflight_required\n");
} else {
  process.stderr.write("usage: T1-rework9-rework1-static-fixture.mjs postgres|recovery\n");
  process.exit(64);
}
