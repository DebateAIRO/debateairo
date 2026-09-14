import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("committed model configuration custody", () => {
  it("contains environment-variable names and no secret material", () => {
    const source = readFileSync(
      join(process.cwd(), "config", "models.yaml"),
      "utf8"
    );
    const keyLines = source
      .split(/\r?\n/u)
      .filter((line) => /^\s*key:/u.test(line));

    expect(source).not.toContain("sk-");
    expect(source).not.toContain("Bearer");
    expect(keyLines.every((line) => !line.includes("="))).toBe(true);
  });
});
