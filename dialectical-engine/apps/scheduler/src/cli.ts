import { createPool } from "@debateai/db";
import { loadLivenessEnvironment, loadReplaySelfTestEnvironment, loadSettlementEnvironment } from "@debateai/register";
import { runLivenessSweep, runReplaySelfTest, runSettlementWatch } from "./index.js";

const command = process.argv[2];
if (command !== "replay-self-test" && command !== "liveness-sweep" && command !== "settlement-watch") {
  throw new Error(`Unknown scheduler command: ${String(command)}`);
}
const databaseUrl = command === "replay-self-test"
  ? loadReplaySelfTestEnvironment().REPLAY_SELF_TEST_DATABASE_URL
  : command === "liveness-sweep"
    ? loadLivenessEnvironment().LIVENESS_DATABASE_URL
    : loadSettlementEnvironment().SETTLEMENT_DATABASE_URL;
const pool = createPool(databaseUrl);
try {
  const report = command === "replay-self-test"
    ? await runReplaySelfTest(pool)
    : command === "liveness-sweep"
      ? { archived: await runLivenessSweep(pool) }
      : await runSettlementWatch(pool);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
