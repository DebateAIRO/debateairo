import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import owner from "../../packages/mail-templates/messages/en/owner.json";

describe("S04 review pass 1 contracts", () => {
  it("renders V's selected subject and waiting sentence in the staff alert mail", () => {
    // Property: the owner alert uses the two words V selected at DONE Q1.
    expect(owner["owner.threatReport.subject"]).toBe("A threat report is waiting");
    expect(owner["owner.threatReport.waiting"]).toBe("A question our automatic check refused has been kept as a threat report and is waiting to be read.");
  });

  it("keeps S04 console CSS before the S02 closing marker", () => {
    // Property: S02's closed block remains the stylesheet's end marker.
    const css = readFileSync(join(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    const s04 = css.indexOf("/* S04 threat reports staff console;");
    const s02End = css.indexOf("/* === end consent-ui S02 === */");
    expect(s04).toBeGreaterThanOrEqual(0);
    expect(s04).toBeLessThan(s02End);
    expect(css.slice(s02End + "/* === end consent-ui S02 === */".length).trim()).toBe("");
  });

  it("arms the S04 ask ceiling while ordinary proxy calls retain 30 seconds", async () => {
    // Property: the proxy leaves enough time for both question and language checks on POST /v1/asks.
    const previousBase = process.env.DIALECTICAL_API_BASE;
    process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
    const fetchStub = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    const armed: number[] = [];
    const originalTimeout = AbortSignal.timeout;
    const timeoutStub = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      armed.push(ms);
      return originalTimeout.call(AbortSignal, ms);
    });
    try {
      const route = await import("../../apps/ui/app/api/[...path]/route.js");
      await route.POST(new Request("https://app.test/api/v1/asks", { method: "POST", body: "{}" }),
        { params: Promise.resolve({ path: ["v1", "asks"] }) });
      expect(armed).toEqual([55_000]);
      armed.length = 0;
      await route.GET(new Request("https://app.test/api/v1/session"),
        { params: Promise.resolve({ path: ["v1", "session"] }) });
      expect(armed).toEqual([30_000]);
    } finally {
      timeoutStub.mockRestore();
      fetchStub.mockRestore();
      if (previousBase === undefined) delete process.env.DIALECTICAL_API_BASE;
      else process.env.DIALECTICAL_API_BASE = previousBase;
    }
  });
});
