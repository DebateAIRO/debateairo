import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("OBS-07 status injection wall", () => {
  it("keeps private/product/provider fields and untyped evidence out of page sources", async () => {
    const source = (await Promise.all([
      "apps/observation-agent/src/modules/status-page/status-page.ts",
      "apps/observation-agent/src/modules/status-page/module.ts"
    ].map((path) => readFile(path, "utf8")))).join("\n");
    expect(source).not.toMatch(/raw_text|metadata_json|content_ciphertext|prompt|token|cookie/u);
    expect(source).not.toMatch(/signal\.evidence|\.evidence\b/u);
    expect(source).not.toContain("process.env");
    expect(source).toContain('const STATUS_HOST = "127.0.0.1"');
    expect(source).toContain("escapeHtml");
  });
});
