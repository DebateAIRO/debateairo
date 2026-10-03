import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Final review m4 — the repository is public, and the committed model-scorecard plan named the
 * owner's absolute worktree path six times. Where it told a reader where commands run, it now
 * says so with a neutral placeholder. (The base files that carry such paths are not this
 * branch's, and are left alone.)
 */
describe("final review m4 · the committed model-scorecard plan names no machine path", () => {
  it("says where commands run with a placeholder, never a home-directory path", async () => {
    const plan = await readFile("docs/superpowers/plans/2026-09-26-model-scorecard-and-picker.md", "utf8");
    expect(plan.match(/\/(?:Users|home)\/[^\s`'"]+/gu) ?? []).toEqual([]);
    expect(plan.split("<your engine checkout>").length - 1).toBe(6);
  });
});
