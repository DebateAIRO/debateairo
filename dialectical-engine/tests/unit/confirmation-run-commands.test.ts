import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * REVIEW ITEM 6 — the owner's confirmation-run procedure names real commands.
 *
 * RUN1's report named `pnpm run acceptance:ceremony`, which does not exist: the
 * acceptance suite is a SEPARATE vitest project with no package script (the
 * S5 research note records exactly that — "`acceptance/vitest.config.ts` is a
 * separate project with no package script … the containment tests only run when
 * an operator invokes them by hand"). A procedure the owner cannot paste is a
 * procedure that fails at the worst moment, against paid models.
 *
 * Constraint 10 says a fenced block in an owner-facing document contains only
 * real commands that are safe to paste as-is. This file is what makes that
 * checkable rather than asserted: every command the procedure names is pinned
 * here, so a rename breaks a test instead of breaking the owner's run.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function packageScripts(): Readonly<Record<string, string>> {
  const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as {
    scripts?: Record<string, string>;
  };
  return manifest.scripts ?? {};
}

describe("the prepared confirmation run names commands that exist", () => {
  it.each([
    "dev:auth:up",
    "generate:contract",
    "typecheck",
    "test:ci-gate"
  ])("package script %s is defined", (script) => {
    expect(Object.keys(packageScripts())).toContain(script);
  });

  it("does NOT define an acceptance ceremony script — the procedure must not claim one", () => {
    // The exact mistake this row exists for. If someone later ADDS such a
    // script, this row fails and the procedure is updated to prefer it, which
    // is the outcome we want either way.
    const scripts = Object.keys(packageScripts());
    expect(scripts.filter((name) => name.startsWith("acceptance"))).toEqual([]);
  });

  it.each([
    "acceptance/vitest.config.ts",
    "acceptance/ceremony.test.ts",
    "acceptance/seed-register.ts"
  ])("%s exists, so the documented invocation resolves", (relative) => {
    expect(existsSync(`${ROOT}${relative}`)).toBe(true);
  });

  it("the acceptance config really covers the ceremony file", () => {
    const config = readFileSync(`${ROOT}acceptance/vitest.config.ts`, "utf8");
    expect(config).toContain('include: ["acceptance/**/*.test.ts"]');
  });

  it("the algorithm mission's sealed tolerance is where the procedure cites it", () => {
    // D77(c), the numbers the confirmation run is judged against. Cited by
    // value so a moved record cannot silently take the criterion with it.
    const decisions = readFileSync(
      `${ROOT}.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md`,
      "utf8"
    );
    expect(decisions).toContain("`globalStopDelta` 0.02 → **0.01**");
    expect(decisions).toContain("`branchFreezeEpsilon` 0.01 → **0.005**");
    expect(decisions).toContain("0.011339");
  });
});
