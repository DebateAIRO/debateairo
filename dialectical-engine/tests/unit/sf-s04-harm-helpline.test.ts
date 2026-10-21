import { describe, expect, it } from "vitest";
import { CRISIS_LINES } from "../../apps/ui/lib/crisisLines.js";

const fixture = {
  name: "Example line",
  phone: "0800 123 456",
  tel: "+44800123456",
  website: "https://example.org/help",
  sourceUrl: "https://example.org/confirmed",
  checkedAt: "2026-10-19",
  countries: ["GB"]
} as const;

async function helplineModule() {
  const module = await import("../../packages/contract/src/index.js").catch(() => null);
  expect(module, "the shared helpline contract is shipped").not.toBeNull();
  return module!;
}

describe("harm-to-others helpline", () => {
  it("ships no unconfirmed helpline", async () => {
    const { HARM_TO_OTHERS_HELPLINE } = await helplineModule();
    expect(HARM_TO_OTHERS_HELPLINE).toBeNull();
  });

  it("returns no helpline for each checked crisis country or an unknown country", async () => {
    const { harmHelplineFor } = await helplineModule();
    expect(Object.keys(CRISIS_LINES)).toHaveLength(56);
    for (const country of [...Object.keys(CRISIS_LINES), null]) expect(harmHelplineFor(country)).toBeNull();
  });

  it("accepts a sourced country fixture and rejects unsourced, undated, and unsorted lines", async () => {
    const { isHarmHelpline } = await helplineModule();
    expect(isHarmHelpline(fixture)).toBe(true);
    expect(isHarmHelpline({ ...fixture, sourceUrl: "http://example.org/confirmed" })).toBe(false);
    expect(isHarmHelpline({ ...fixture, checkedAt: "19 October 2026" })).toBe(false);
    expect(isHarmHelpline({ ...fixture, countries: ["RO", "GB"] })).toBe(false);
  });
});
