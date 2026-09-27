import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("the owner's story mock (look first, then wire)", () => {
  it("writes one self-contained HTML file with every state, desktop, phone and dark", () => {
    const output = join(mkdtempSync(join(tmpdir(), "story-mock-")), "story-panel-mock.html");
    const result = spawnSync(process.execPath, ["--import", "tsx", "../../tools/story-mock.tsx", output], {
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
    // Four states at desktop width, four at phone width, the four in dark mode, and the language offer at both widths.
    expect(html.match(/<iframe /g)).toHaveLength(14);
    // Each preview is a whole document inside its iframe's escaped srcdoc attribute; the page is the English reader's.
    expect(html.match(/srcDoc="&lt;!doctype html&gt;&lt;html lang=&quot;en&quot; data-mode=&quot;chamber&quot;&gt;/gi)).toHaveLength(4);
    expect(html.match(/srcDoc="&lt;!doctype html&gt;&lt;html lang=&quot;en&quot; data-mode=&quot;terracotta&quot;&gt;/gi)).toHaveLength(10);
    expect(html).toContain("/* === verdict-story === */");
    expect(html).toContain("Ar trebui să ne mutăm cu familia din București la Cluj");
    // R2: the panel is Romanian (the question's language) under an English page, and says no engine words.
    expect(html).toContain("lang=&quot;ro&quot; dir=&quot;ltr&quot; data-story-status=&quot;READY&quot;");
    expect(html).toContain("Decizie strânsă");
    expect(html).toContain("Unele părți ale acestui rezumat nu au putut fi verificate pe deplin.");
    expect(html).toContain("Cât de siguri suntem");
    expect(html).not.toContain("Point numbers like P5");
    expect(html).not.toContain("Rezumatul prezintă ca sigur");
    // The offer, in English, twice (desktop and phone), naming Romanian in its own words.
    expect(html.match(/class=&quot;languageOffer&quot;/g)).toHaveLength(2);
    expect(html).toContain("This debate is in Romanian (&lt;bdi lang=&quot;ro&quot;&gt;Română&lt;/bdi&gt;).");
    expect(html).not.toMatch(/<script|https?:\/\//);
    // The vendored fonts are inlined, but only the three faces the panel uses (Plus Jakarta Sans 400 and
    // 700, Fraunces 600), once in the page and once in each of the 14 previews.
    expect(html).not.toContain("fonts are not bundled yet");
    expect(html.match(/@font-face \{/g)).toHaveLength(45);
    expect(html.match(/data:font\/ttf;base64,/g)).toHaveLength(45);
    expect(html.match(/font-style: italic; font-weight: \d+; src: url\(data:/g)).toBeNull();
  }, 125_000);

  it("fails loudly without an output path", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "../../tools/story-mock.tsx"], {
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
