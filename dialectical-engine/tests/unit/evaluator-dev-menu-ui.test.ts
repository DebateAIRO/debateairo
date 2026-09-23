import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../apps/ui/${relativePath}`, import.meta.url)), "utf8");
}

describe("V3 evaluator dev menu", () => {
  const settings = source("app/settings/page.tsx");
  const menu = source("components/EvaluatorDevMenu.tsx");
  const englishSettings = JSON.parse(
    readFileSync(resolve(process.cwd(), "apps/ui/messages/en/settings.json"), "utf8")
  ) as Readonly<Record<string, string>>;

  it("is omitted from the normal settings and ask flow unless the explicit dev gate is enabled", () => {
    expect(settings).toContain("<SettingsPageClient");
    expect(menu).toContain('process.env.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true"');
    expect(menu).toContain('process.env.NODE_ENV !== "production"');
    expect(menu).toContain("<EvaluatorDevMenu");
    expect(source("app/new/page.tsx")).not.toContain("EvaluatorDevMenu");
  });

  it("shows the catalog unavailable state, domains, harvested rows, profiles, and parked receipts", () => {
    for (const [key, english] of [
      ["settings.evaluator.consumerModel", "Consumer model"],
      ["settings.evaluator.containerUnavailable", "Container unavailable"],
      ["settings.evaluator.domains", "Domains"],
      ["settings.evaluator.rowsHarvested", "Rows harvested"],
      ["settings.evaluator.profilePeek", "Profile peek"],
      ["settings.evaluator.parkedRuns", "Parked {mode} runs"],
      ["settings.evaluator.failureReceipts", "Failure receipts"],
      ["settings.evaluator.starterList", "Starter list"]
    ] as const) {
      expect(menu).toContain(`t(catalog, "${key}"`);
      expect(englishSettings[key], `${key} English catalogue value`).toBe(english);
    }
  });
});
