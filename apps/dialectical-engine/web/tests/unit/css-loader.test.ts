// @vitest-environment node

import { describe, expect, it } from "vitest";

describe("stylesheet test loader", () => {
  it("loads the stylesheet hub", async () => {
    const loaderModuleUrl = new URL("../loadCss.mjs", import.meta.url);
    const { loadCss } = (await import(/* @vite-ignore */ loaderModuleUrl.href)) as {
      loadCss: () => string;
    };
    const css = loadCss();

    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toContain("@import");
  });
});
