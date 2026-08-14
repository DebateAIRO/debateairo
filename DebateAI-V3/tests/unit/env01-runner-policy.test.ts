import { describe, expect, it } from "vitest";
import { parseComposerOutput } from "@debateai/runner";

describe("ENV-01 ratified envelope assumptions", () => {
  it("refuses composer output above the ratified two-segment serve cap", () => {
    const segment = (id: string) => ({
      segment_id: id,
      text: id,
      node_refs: ["primary"],
      served_number_refs: []
    });

    expect(() => parseComposerOutput(JSON.stringify({
      segments: [segment("one"), segment("two"), segment("three")]
    }))).toThrowError(expect.objectContaining({
      code: "COMPOSITION_CONTRACT_ERROR",
      message: expect.stringContaining("engine segment cap")
    }));
  });
});
