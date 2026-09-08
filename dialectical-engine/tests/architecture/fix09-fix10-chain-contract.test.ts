import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { materializeAgentAction } from "../../packages/obs-capture/src/chain/agent-action-gateway.js";
import { CHAIN_SIGNER_PROFILES } from "../../packages/obs-capture/src/chain/signer.js";

async function text(relative:string):Promise<string>{
  return readFile(new URL(`../../${relative}`,import.meta.url),"utf8");
}

describe("FIX-09 FIX-10 dependency",()=>{
  it("proves ops obsctl deterministic replay through the action gateway and DB-free markers",async()=>{
    expect(CHAIN_SIGNER_PROFILES).toEqual([
      "api_occurrence","runner_occurrence","scheduler_occurrence","daemon_action","obsctl_action",
    ]);
    expect(CHAIN_SIGNER_PROFILES).not.toContain("watchdog_witness");
    const signer=await text("packages/obs-capture/src/chain/signer.ts");
    expect(signer).toContain("chain/private/obsctl.pk8");
    expect(signer).toContain("table: \"agent_action\", writerIdentity: \"obsctl\"");
    expect(signer).toContain("path: \"chain/private/fixagent-daemon.pk8\"");
    expect(signer).toContain("path: `chain/private/${writerIdentity}.pk8`");
    const native=await text("packages/obs-capture/native/fix09-openat-read.c");
    expect(native).toContain("FIX09_PROFILE_ROWS(PROFILE_ROW)");
    expect(native).toContain("FIX09_LEAF_KEYS_WATCHDOG_WITNESS");

    const ops=materializeAgentAction(Object.freeze({
      source:"ops" as const,writer_identity:"obsctl",actor:"V",action_kind:"CHAIN_RECONCILED",
      occurrence_id:null,incident_id:null,action_ref:"obsctl:reconcile:1",
      action_payload:Object.freeze(Object.assign(Object.create(null),{
        schema:"obsctl-chain-reconcile/v1",result:"NOOP",
      })),
    }));
    expect(Object.getPrototypeOf(ops)).toBeNull();
    expect(Object.isFrozen(ops.action_payload)).toBe(true);
    expect(JSON.stringify(ops)).toBe(JSON.stringify(materializeAgentAction(ops)));

    const verifier=await readFile(new URL(
      "../../packages/obs-capture/scripts/verify-fix09-native-wipe.mjs",import.meta.url,
    ));
    expect(createHash("sha256").update(verifier).digest("hex"))
      .toBe("b97c89f278812c75deb6f234d75f18a1bba1d1a8320e5ea452bbf2cfaf75a66f");
    const verifierText=verifier.toString("utf8");
    expect(verifierText).toContain('digest("obs-chain-helper-wipe-object/v1"');
    expect(verifierText).toContain('digest("obs-chain-helper-wipe-disassembly/v1"');
    expect(verifierText).toContain('digest("obs-chain-helper-wipe-instructions/v1"');
    expect(verifierText).not.toContain('digest("obs-chain-helper-wipe-object-projection/v1"');
    expect(verifierText).not.toContain('digest("obs-chain-helper-wipe-disassembly-projection/v1"');

    const occurrenceGateway=await text("packages/obs-capture/src/chain/occurrence-gateway.ts");
    const actionGateway=await text("packages/obs-capture/src/chain/agent-action-gateway.ts");
    expect(occurrenceGateway).not.toContain("tools/obs-listener");
    expect(actionGateway).not.toContain("tools/obs-listener");
    for(const writer of ["packages/obs-capture/src/runtime/sink.ts",
      "tools/obs-listener/src/daemon/main.ts","tools/obs-listener/src/daemon/fold.ts",
      "tools/obs-listener/src/daemon/poison.ts","tools/obs-listener/src/daemon/cursor.ts"]){
      expect(await text(writer)).not.toContain("obsctl_action");
    }
  });
});
