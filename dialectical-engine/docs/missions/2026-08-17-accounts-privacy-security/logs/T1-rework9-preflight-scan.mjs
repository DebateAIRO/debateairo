#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packet = JSON.parse(readFileSync(process.argv[2], "utf8"));
const snapshot = spawnSync("/bin/ps", [
  "-axo", "pid=,ppid=,lstart=,command=", "-ww"
], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (snapshot.status !== 0 || snapshot.signal !== null || snapshot.error !== undefined) {
  throw new Error("PROCESS_SNAPSHOT_FAILED");
}
const pattern = /vitest|claude|mutation|T1.*full-registration|(?:^|[\/\s])(?:postgres|pg_ctl)(?=[:\s]|$)/i;
const heavy = snapshot.stdout.split("\n").filter((line) => pattern.test(line));
const allowed = new Set(packet.allowed_postgresql_baseline);
const unexplained = heavy.filter((line) => !allowed.has(line.trim()));
process.stdout.write(`${JSON.stringify({ heavy, unexplained }, null, 2)}\n`);
process.exitCode = unexplained.length === 0 ? 0 : 1;
