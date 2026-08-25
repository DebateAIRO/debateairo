import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAcceptanceArguments, runAcceptanceCeremony } from "./run-acceptance.js";

/**
 * PRO-01's one authorized live depth-2 proof. It uses a caller-owned temporary
 * database so the standing sealed acceptance database is neither reset nor
 * mutated. The real Codex and Opus relay calls still travel through the same
 * shipped acceptance runtime and persist normal ledger evidence.
 */
const dataDirectory = await mkdtemp(join(tmpdir(), "debateai-pro01-depth2-"));
let ceremony: Awaited<ReturnType<typeof runAcceptanceCeremony>> | undefined;
try {
  ceremony = await runAcceptanceCeremony(
    parseAcceptanceArguments([
      "--service-credential", "p".repeat(43),
      "--depth-params", '{"depth":2}',
      "--question", "Should a software company adopt a four-day workweek?"
    ]),
    process.env,
    { databaseDataDirectory: dataDirectory }
  );
  console.info(
    `PRO-01 DEPTH-2 PROOF: ${ceremony.runId} ${ceremony.answerId} ` +
    `${ceremony.fairDebate.nodeCount} nodes ${ceremony.modelCallCount} model calls`
  );
} finally {
  await ceremony?.close();
  await rm(dataDirectory, { recursive: true, force: true });
}
