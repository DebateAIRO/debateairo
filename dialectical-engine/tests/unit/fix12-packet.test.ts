import { describe, expect, expectTypeOf, it } from "vitest";

import {
  buildPacket,
  IncidentPacketSchema,
  type IncidentPacket,
} from "../../tools/obs-listener/src/worker-diagnosis/packet.js";

const INCIDENT_ID = "10000000-0000-4000-8000-000000000012";
const OCCURRENCE_ID = "20000000-0000-4000-8000-000000000012";

describe("FIX-12 closed diagnosis packet", () => {
  it("projects only identifiers, codes, normalized frames, chain codes, and the root", () => {
    const packet = buildPacket({
      incidentId: INCIDENT_ID,
      occurrenceId: OCCURRENCE_ID,
      source: "first_party",
      verdict: "CODE_ROOT",
      floor: "FLOOR_CLEAR",
      sizeLabel: "QUICK",
      codes: ["OBS_SCHEDULER_JOB_FAILED"],
    }, {
      root: { path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
      frames: [
        { kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
        { kind: "BOUNDARY", code: "PROVIDER_BOUNDARY" },
      ],
      chainCodes: ["OBS_SCHEDULER_JOB_FAILED", "PROVIDER_UNREACHABLE"],
    });

    expect(packet).toEqual({
      schema: "debateai.fixagent-diagnosis-packet.v1",
      incidentId: INCIDENT_ID,
      occurrenceId: OCCURRENCE_ID,
      source: "first_party",
      verdict: "CODE_ROOT",
      floor: "FLOOR_CLEAR",
      sizeLabel: "QUICK",
      codes: ["OBS_SCHEDULER_JOB_FAILED"],
      chainCodes: ["OBS_SCHEDULER_JOB_FAILED", "PROVIDER_UNREACHABLE"],
      frames: [
        { kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
        { kind: "BOUNDARY", code: "PROVIDER_BOUNDARY" },
      ],
      root: "apps/scheduler/src/index.ts:runLivenessSweep",
    });
    expect(Object.isFrozen(packet)).toBe(true);
    expectTypeOf(packet).toEqualTypeOf<IncidentPacket>();
  });

  it("rejects occurrence prose and identifier-shaped fields beyond their bounds", () => {
    const base = {
      schema: "debateai.fixagent-diagnosis-packet.v1",
      incidentId: INCIDENT_ID,
      occurrenceId: OCCURRENCE_ID,
      source: "first_party",
      verdict: "CODE_ROOT",
      floor: "FLOOR_CLEAR",
      sizeLabel: "QUICK",
      codes: ["OBS_SCHEDULER_JOB_FAILED"],
      chainCodes: ["OBS_SCHEDULER_JOB_FAILED"],
      frames: [{ kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" }],
      root: "apps/scheduler/src/index.ts:runLivenessSweep",
    } as const;

    expect(IncidentPacketSchema.safeParse({ ...base, message: "raw occurrence prose" }).success).toBe(false);
    expect(IncidentPacketSchema.safeParse({ ...base, codes: ["x".repeat(129)] }).success).toBe(false);
    expect(IncidentPacketSchema.safeParse({ ...base, root: "/absolute/path.ts:root" }).success).toBe(false);
  });
});
