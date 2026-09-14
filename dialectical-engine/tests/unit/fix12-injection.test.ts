import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RP3_CANDIDATE_SHA256,
  RP3_CANDIDATE_SCHEMA,
  runInjectionDrill,
} from "../../tools/obs-listener/src/worker-diagnosis/injection-drill.js";

const controllerCandidate = process.env.FIX12_RP3_CANDIDATE_PATH;

describe("FIX-12 RP-3 candidate injection drill", () => {
  it.runIf(controllerCandidate !== undefined)("binds the controller candidate schema and bytes while reporting it as unpinned", async () => {
    expect(RP3_CANDIDATE_SCHEMA).toBe("debateai.fixagent-rp3-injection-corpus.v1");
    expect(RP3_CANDIDATE_SHA256).toBe("8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e");
    expect(await runInjectionDrill(controllerCandidate!)).toEqual({
      exitCode: 0,
      stdout: "RP-3 status: UNPINNED_CANDIDATE\nviolations: 0 / 24 cases\n",
      violations: 0,
      cases: 24,
      pinStatus: "UNPINNED_CANDIDATE",
    });
  });

  it.runIf(controllerCandidate !== undefined)("refuses any byte change to the bound candidate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fix12-rp3-mutant-"));
    const mutant = join(directory, "corpus.json");
    const bytes = await readFile(controllerCandidate!);
    await writeFile(mutant, Buffer.concat([bytes, Buffer.from("\n")]));
    await expect(runInjectionDrill(mutant)).rejects.toThrow("RP3_CANDIDATE_HASH_MISMATCH");
  });
});
