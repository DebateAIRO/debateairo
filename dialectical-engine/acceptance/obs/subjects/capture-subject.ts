import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { CORPUS_TOKENS, IDENTITY_CANARIES } from "../case-inputs.js";

const mode = process.argv[2];
const scratchDirectory = process.env.OBS_G1_SCRATCH_DIR;
const declaredRunRef = process.env.OBS_G1_DECLARED_RUN_REF;

function report(value: Readonly<Record<string, number | string>>): void {
  process.stdout.write(`FIX08_SUBJECT ${JSON.stringify(value)}\n`);
}

async function spoolLineCount(directory: string): Promise<number> {
  let count = 0;
  for (const name of (await readdir(directory)).filter((entry) => entry.endsWith(".spool"))) {
    const bytes = await readFile(join(directory, name));
    count += bytes.toString("utf8").split("\n").filter((line) => line.length > 0).length;
  }
  return count;
}

if (mode === "control") {
  report({ control: 1 });
  process.exitCode = 23;
} else if (scratchDirectory === undefined) {
  report({ error: "SCRATCH_MISSING" });
  process.exitCode = 31;
} else {
  process.env.OBS_SPOOL_DIR ??= scratchDirectory;
  process.env.OBS_FLUSH_DEADLINE_MS = "60000";
  await import("@debateai/obs-capture/install/scheduler");
  const runtime = await import("@debateai/obs-capture/runtime");
  const capture = await import("@debateai/obs-capture");
  const kinds = await import("../../../packages/obs-capture/src/kinds.js");
  const installed = await runtime.waitForCaptureEmitterInstalled({ deadlineMs: 2_000 });
  if (installed !== "installed") {
    report({ error: "RUNTIME_NOT_INSTALLED" });
    process.exitCode = 31;
  } else {
    const runRef = declaredRunRef ?? crypto.randomUUID();
    let emitted = 1;
    let error: Error & { credential?: string };
    if (mode === "corpus") {
      const third = new Error(CORPUS_TOKENS.sixDigitCode);
      const second = new Error(CORPUS_TOKENS.email, { cause: third });
      const first = new Error(`${CORPUS_TOKENS.bearerApiKey} ${CORPUS_TOKENS.passwordUrl}`, { cause: second });
      first.credential = `${CORPUS_TOKENS.jwt} ${CORPUS_TOKENS.privateKeyHeader}`;
      first.stack = `${first.stack ?? "Error"}\n    at ${CORPUS_TOKENS.sixDigitCode}`;
      error = first;
    } else if (mode === "cyclic-error") {
      error = new Error("FIX08_CYCLIC_ERROR");
      Object.defineProperty(error, "cause", { value: error, configurable: true });
    } else {
      error = new Error("FIX08_CONTROLLED_FAILURE");
    }
    if (mode === "burst-10x") emitted = 10;
    capture.runWithObsContext({
      run_ref: kinds.declaredRef("run", runRef),
      asker_id: IDENTITY_CANARIES.asker,
      session_id: IDENTITY_CANARIES.session,
    }, () => {
      for (let index = 0; index < emitted; index += 1) {
        capture.captureHandled(error, {
          capture_point: "job",
          code: "OBS_CAPTURE_SELF",
          taxonomy_class: "CAPTURE_SELF",
          disposition: "SELF",
          source: "first_party",
        });
      }
    });
    await runtime.stopCaptureRuntime({ deadlineMs: 4_000 });
    report({ emitted, spooled: await spoolLineCount(process.env.OBS_SPOOL_DIR) });
    if (mode === "db-down" || mode === "cyclic-error" || mode === "burst-10x") {
      process.exitCode = 23;
    }
  }
}
