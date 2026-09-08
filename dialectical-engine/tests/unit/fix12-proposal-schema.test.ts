import { describe, expect, it } from "vitest";

import { buildPacket } from "../../tools/obs-listener/src/worker-diagnosis/packet.js";
import {
  canonicalProposal,
  validateProposal,
  type DiagnosisPolicyBundle,
} from "../../tools/obs-listener/src/worker-diagnosis/validate.js";

const packet = buildPacket({
  incidentId: "10000000-0000-4000-8000-000000000012",
  occurrenceId: "20000000-0000-4000-8000-000000000012",
  source: "first_party",
  verdict: "CODE_ROOT",
  floor: "FLOOR_CLEAR",
  sizeLabel: "QUICK",
  codes: ["OBS_SCHEDULER_JOB_FAILED"],
}, {
  root: { path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
  frames: [{ kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" }],
  chainCodes: ["OBS_SCHEDULER_JOB_FAILED", "PROVIDER_UNREACHABLE"],
});

const bundle: DiagnosisPolicyBundle = Object.freeze({
  productionSourceGlobs: Object.freeze(["apps/*/src/**", "packages/**/src/**"]),
  floorDenyGlobs: Object.freeze(["apps/api/src/mfa.ts", "packages/crypto/**"]),
  allowedToolCalls: Object.freeze(["read_file", "search_repo"]),
  invariantRefs: Object.freeze(["RT-30"]),
  moduleGraph: Object.freeze({
    "apps/scheduler/src/index.ts": Object.freeze(["apps/scheduler/src/cli.ts"]),
    "apps/scheduler/src/cli.ts": Object.freeze([]),
  }),
});

const validOutput = Object.freeze({
  incidentId: packet.incidentId,
  root: packet.root,
  diagnosis: Object.freeze({
    defectClass: "BOUNDARY_CONTRACT",
    params: Object.freeze({ code: "OBS_SCHEDULER_JOB_FAILED" }),
  }),
  changeScope: Object.freeze(["apps/scheduler/src/index.ts"]),
  sizeLabel: "QUICK",
  redTestPlan: Object.freeze({ invariantRef: "RT-30" }),
  spendUnits: 7,
  toolCalls: Object.freeze(["read_file"]),
});

describe("FIX-12 proposal validation and hash", () => {
  it("accepts a derivable proposal, recomputes blast radius, and hashes canonical bytes", () => {
    const withModelClaim = { ...validOutput, blastRadius: { reachableModules: 999, modules: ["outside.ts"] } };
    const first = validateProposal(withModelClaim, packet, bundle);
    const second = validateProposal(validOutput, packet, bundle);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      proposal: {
        incidentId: packet.incidentId,
        root: packet.root,
        blastRadius: {
          reachableModules: 2,
          modules: ["apps/scheduler/src/cli.ts", "apps/scheduler/src/index.ts"],
        },
      },
    });
    if (!first.ok) throw new Error("expected proposal");
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalProposal(first.proposal)).toBe(
      "{\"blastRadius\":{\"modules\":[\"apps/scheduler/src/cli.ts\",\"apps/scheduler/src/index.ts\"],\"reachableModules\":2},\"changeScope\":[\"apps/scheduler/src/index.ts\"],\"diagnosis\":{\"defectClass\":\"BOUNDARY_CONTRACT\",\"params\":{\"code\":\"OBS_SCHEDULER_JOB_FAILED\"}},\"incidentId\":\"10000000-0000-4000-8000-000000000012\",\"redTestPlan\":{\"invariantRef\":\"RT-30\"},\"root\":\"apps/scheduler/src/index.ts:runLivenessSweep\",\"sizeLabel\":\"QUICK\",\"spendUnits\":7}",
    );
  });

  it.each([
    ["outside allowlist", { ...validOutput, changeScope: ["README.md"] }, "CHANGE_SCOPE_OUTSIDE_ALLOWLIST"],
    ["inside deny glob", { ...validOutput, changeScope: ["apps/api/src/mfa.ts"] }, "CHANGE_SCOPE_DENIED"],
    ["unknown defect class", { ...validOutput, diagnosis: { defectClass: "MODEL_OPINION", params: {} } }, "PROPOSAL_SCHEMA"],
    ["non-derivable parameter", { ...validOutput, diagnosis: { defectClass: "BOUNDARY_CONTRACT", params: { code: "UNSEEN_CODE" } } }, "NON_DERIVABLE_VALUE"],
    ["disallowed tool", { ...validOutput, toolCalls: ["shell"] }, "TOOL_CALL_DENIED"],
    ["absolute path", { ...validOutput, changeScope: ["/tmp/outside.ts"] }, "PROPOSAL_SCHEMA"],
    ["unknown field", { ...validOutput, narrative: "trust me" }, "PROPOSAL_SCHEMA"],
  ])("records a violation for %s", (_label, output, code) => {
    expect(validateProposal(output, packet, bundle)).toEqual({ ok: false, violation: code });
  });
});
