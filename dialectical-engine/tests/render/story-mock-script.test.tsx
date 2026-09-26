import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("the owner's story mock (look first, then wire)", () => {
  it("writes one self-contained HTML file with every state, desktop, phone and dark", () => {
    const output = join(mkdtempSync(join(tmpdir(), "story-mock-")), "story-panel-mock.html");
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/story-mock.tsx", output], {
      cwd: resolve(process.cwd(), "apps/ui"),
      env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.scripts.json" },
      encoding: "utf8",
      timeout: 120_000
    });
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(result.stdout.trim()).toBe(`STORY_MOCK_WRITTEN=${output}`);
    const html = readFileSync(output, "utf8");
    for (const status of ["WRITING", "READY", "READY_WITH_RESERVATION", "UNAVAILABLE"]) {
      expect(html).toContain(`data-story-status=&quot;${status}&quot;`);
    }
    // Four states at desktop width, four at phone width, and dark mode at both widths.
    expect(html.match(/<iframe /g)).toHaveLength(10);
    // Each preview is a whole document inside its iframe's escaped srcdoc attribute.
    expect(html.match(/srcDoc="&lt;!doctype html&gt;&lt;html lang=&quot;en&quot; data-mode=&quot;chamber&quot;&gt;/gi)).toHaveLength(2);
    expect(html.match(/srcDoc="&lt;!doctype html&gt;&lt;html lang=&quot;en&quot; data-mode=&quot;terracotta&quot;&gt;/gi)).toHaveLength(8);
    expect(html).toContain("/* === verdict-story === */");
    expect(html).toContain("Ar trebui să ne mutăm cu familia din București la Cluj");
    expect(html).toContain("Point numbers such as P5");
    expect(html).not.toMatch(/<script|https?:\/\//);
  }, 125_000);

  it("fails loudly without an output path", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/story-mock.tsx"], {
      cwd: resolve(process.cwd(), "apps/ui"),
      env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.scripts.json" },
      encoding: "utf8",
      timeout: 120_000
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("<absolute path to the output .html>");
    expect(result.stderr).toContain("a relative path is resolved from apps/ui");
  }, 125_000);
});
