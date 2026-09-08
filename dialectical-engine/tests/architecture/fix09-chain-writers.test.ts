import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import * as chain from "../../packages/obs-capture/src/chain/index.js";

async function source(relative: string): Promise<string> {
  return readFile(new URL(`../../${relative}`, import.meta.url), "utf8");
}

describe("FIX-09 chain writer architecture", () => {
  it("proves all current and future writers use only the shared gateways", async () => {
    expect(Object.keys(chain).sort()).toEqual([
      "appendChainedAgentAction", "appendChainedOccurrences", "prepareChainedWriterSigner",
    ]);
    const packageJson=JSON.parse(await source("packages/obs-capture/package.json"));
    expect(packageJson.exports["./chain"]).toBe("./src/chain/index.ts");
    expect(packageJson.exports["./chain/fixagent-delivery"]).toBe("./src/chain/fixagent-delivery.ts");
    const delivery=await source("packages/obs-capture/src/chain/fixagent-delivery.ts");
    expect(delivery).not.toContain("export interface FixagentDeliveryClient");
    expect(delivery).not.toContain("export interface ActionInsertValues");
    expect(delivery).not.toContain("export async function executeFixagentActionOperation");
    expect(delivery).toMatch(/createFixagentDeliveryGeneration\(\s*databaseUrl:\s*string/u);
    expect(delivery).not.toMatch(/export\s+(?:interface|type).*\b(?:Pool|Client|Query|Sql)\b/u);

    const sink=await source("packages/obs-capture/src/runtime/sink.ts");
    expect(sink).toContain("chain.appendChainedOccurrences(");
    expect(sink).toContain("chain.materializeDirectOccurrence(envelope)");
    expect(sink).toContain("chain.materializeSpooledOccurrence(envelope, envelope.runtime)");
    expect(sink).not.toContain("INSERT INTO obs.occurrence");

    const signer=await source("packages/obs-capture/src/chain/signer.ts");
    for(const profile of ["api_occurrence","runner_occurrence","scheduler_occurrence","daemon_action",
      "obsctl_action","watchdog_witness"]) expect(signer).toContain(profile);
    expect(signer).toContain("process.env.OBS_WRITER_IDENTITY !== values.writerIdentity");

    const listenerFiles=await Promise.all([
      "tools/obs-listener/src/daemon/main.ts", "tools/obs-listener/src/daemon/fold.ts",
      "tools/obs-listener/src/daemon/poison.ts", "tools/obs-listener/src/daemon/cursor.ts",
    ].map(source));
    for(const value of listenerFiles){
      expect(value).not.toMatch(/\b(?:BEGIN|COMMIT|ROLLBACK)\b/u);
      expect(value).not.toMatch(/\.query\s*\(/u);
      expect(value).not.toContain("@debateai/db");
    }
    expect(listenerFiles[0]).toContain("createFixagentDeliveryGeneration");
    expect(listenerFiles[1]).toContain("FixagentDeliveryGeneration");
    expect(listenerFiles[2]).toContain("persistSkipped");
    expect(listenerFiles[2]).toContain("persistPoisoned");
    expect(listenerFiles[3]).toContain("FixagentDeliveryTransaction");

    const runtime=await source("packages/obs-capture/src/runtime/index.ts");
    const options=runtime.slice(
      runtime.indexOf("export interface CaptureRuntimeStartOptions"),
      runtime.indexOf("export interface RuntimeCaptureModule"),
    );
    expect(options.match(/readonly\s+[a-zA-Z_]+\s*:/gu)?.map((field)=>
      field.replace(/^readonly\s+|\s*:$/gu,""))).toEqual(["runtime","spoolFd","installExitSink"]);
    expect(runtime).toContain("export async function startCaptureRuntime(");
  });
});
