import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../apps/v2-ui/${relativePath}`, import.meta.url)), "utf8");
}

describe("V3 evaluator dev menu", () => {
  const settings = source("app/settings/page.tsx");
  const menu = source("components/EvaluatorDevMenu.tsx");

  it("is omitted from the normal settings and ask flow unless the explicit dev gate is enabled", () => {
    expect(settings).toContain('process.env.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true"');
    expect(settings).toContain('process.env.NODE_ENV !== "production"');
    expect(settings).toContain("<EvaluatorDevMenu");
    expect(source("app/new/page.tsx")).not.toContain("EvaluatorDevMenu");
  });

  it("shows the catalog unavailable state, domains, harvested rows, profiles, and parked receipts", () => {
    for (const marker of [
      "Consumer model", "Container unavailable", "Domains", "Rows harvested",
      "Profile peek", "Parked HARVEST runs", "Failure receipts", "Starter list"
    ]) expect(menu).toContain(marker);
  });

  it("has one consumer-selection write and no bind or allocator control", () => {
    expect(menu).toContain("selectEvaluatorConsumerModel");
    expect(menu).not.toMatch(/bind evaluator|enable dispatch|setDispatchBinding|seat.?share/i);
    expect(menu).toContain("Collect-only · UNBOUND");
  });
});
