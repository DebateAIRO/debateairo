import { describe, expect, it } from "vitest";

import { deriveLocalAuthorityState, renderFallbackStatus } from "../../tools/obs-listener/src/obsctl/status.js";
import { sampleFix07Switch } from "../../tools/obs-listener/src/control/fix07-switch-mirror.js";

describe("FIX-10 status", () => {
  it.each([
    [true, true, false, false, "KILLED_COMPLETE"],
    [false, true, false, false, "KILLED_PARTIAL"],
    [true, false, false, false, "CAPTURE_DISABLED"],
    [false, false, false, false, "TRIPPED"],
    [false, false, true, false, "ARMING"],
    [false, false, true, true, "READY"],
  ] as const)("local_state_%s_%s_%s_%s", (captureOff, killed, armed, proof, expected) => {
    expect(deriveLocalAuthorityState({ rootValid: true, captureOff, killed, armed, proof })).toBe(expected);
  });

  it("invalid_root_is_invalid_authority_but_capture_on", async () => {
    const wire = renderFallbackStatus("ON");
    expect(wire.schema).toBe("obsctl-status/v3");
    expect(wire.local_state).toBe("INVALID");
    expect(wire.capture_switch.effective).toBe("ON");
    expect(wire.mutation.effective).toBe("OFF");
    expect(wire.quick_arm.effective).toBe("OFF");
    expect(wire.capture_gaps).toMatchObject({ open_rows: null, recent_rows: null, reason: "TIMING_INVALID" });
    const sample = await sampleFix07Switch("/nonexistent/fix07-capture-off", async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });
    expect(sample).toEqual({ effective: "ON", reason: "MARKER_MISSING" });
  });
  it.each(Array.from({ length: 7 }, (_, index) => index + 1))("status_wire_matrix_%i", (ordinal) => {
    const wire = renderFallbackStatus(ordinal % 2 === 0 ? "OFF" : "ON");
    expect(wire.local_state).toBe("INVALID");
  });
});
