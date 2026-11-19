import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import owner from "../../packages/mail-templates/messages/en/owner.json";

describe("S04 review pass 1 contracts", () => {
  // 2026-11-19: the threat reports were removed, with their staff alert mail and their console's styles.
  it("has no staff alert mail for threat reports", () => {
    expect(Object.keys(owner).filter(key => key.startsWith("owner.threatReport."))).toEqual([]);
  });

  it("has no S04 console CSS, and S02's closed block remains the stylesheet's end marker", () => {
    const css = readFileSync(join(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    expect(css).not.toMatch(/threatReports|S04 threat reports staff console/u);
    const s02End = css.indexOf("/* === end consent-ui S02 === */");
    expect(s02End).toBeGreaterThan(0);
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
