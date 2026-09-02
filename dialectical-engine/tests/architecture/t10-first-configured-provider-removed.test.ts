import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T10 (goal 188-195, rulings S6-1 / S6-3) — "Delete first-configured-provider
 * selection".
 *
 * DELETED means the rule cannot come back through any surface: not as the named
 * constant, not as the selector, not as a recordable rule string, and not as a
 * value the database will still accept. This scan is the repo-wide half of that;
 * the behavioural half lives in `tests/unit/t10-served-root-selection.test.ts`.
 *
 * The oracle is deliberately LAYOUT-INDEPENDENT (whole file text, never a line
 * at a time), so a reformat cannot blind it — the same shape T8 used for the
 * strict-and repeal.
 *
 * Shipped code = product source and migrations. Tests and docs are not shipped;
 * the compiler and the suites hold those honest instead.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

const SHIPPED_ROOTS = ["packages", "apps", "tools", "acceptance", "web"] as const;

/**
 * Migrations are append-only history: an already-applied file is never edited,
 * so the creating migration keeps naming what it created and the retirement is
 * a NEW forward file naming exactly what it retires. The permitted set is
 * pinned EXACTLY, so a third migration re-admitting the rule fails as loudly as
 * a source file would.
 */
const MIGRATIONS_CARRYING_THE_RETIRED_RULE = [
  "0018_panel01_rework.sql",          // created served_root_rule and its one-member CHECK
  "0055_t10_served_root_selection.sql" // retires that member; names exactly what it retires
] as const;

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "generated", ".next", ".turbo", "coverage"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".sql"];

function isShippedSource(name: string): boolean {
  if (name.includes(".test.") || name.includes(".spec.")) return false;
  if (name.endsWith(".disabled")) return false;
  return SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

async function walk(directory: string, files: { path: string; text: string }[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, files);
      continue;
    }
    if (!entry.isFile() || !isShippedSource(entry.name)) continue;
    files.push({ path: relative(root, full).split(sep).join("/"), text: await readFile(full, "utf8") });
  }
}

async function shippedSources(): Promise<readonly { readonly path: string; readonly text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for (const shippedRoot of SHIPPED_ROOTS) await walk(join(root, shippedRoot), files);
  return files;
}

async function migrationSources(): Promise<readonly { readonly path: string; readonly text: string }[]> {
  const files: { path: string; text: string }[] = [];
  await walk(join(root, "migrations"), files);
  return files;
}

/**
 * The retired constant and the retired selector: gone from shipped source
 * entirely. Matched on WORD BOUNDARIES, not as substrings — `_` is a word
 * character, so `\bSERVED_ROOT_RULE\b` cannot fire on the live
 * `SERVED_ROOT_RULE_HISTORY` / `RETIRED_SERVED_ROOT_RULES` names, while a
 * genuine reintroduction of the old constant still fails here.
 */
const RETIRED: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "SERVED_ROOT_RULE (the retired constant)", pattern: /\bSERVED_ROOT_RULE\b/u },
  { name: "selectServedRoot( (the retired selector)", pattern: /\bselectServedRoot\s*\(/u }
];

/**
 * The retired rule STRING is different from the retired constant and selector.
 * Migration 0055 preserves rows that carry it, so the value must remain
 * READABLE — which means exactly one shipped module may name it: the kernel,
 * where the read vocabulary is declared. No writer may contain it, so the
 * permitted set is pinned EXACTLY and a second occurrence fails as loudly as a
 * writer would (codex r1 B3).
 */
const FILES_PERMITTED_TO_NAME_THE_RETIRED_RULE = [
  "packages/kernel/src/index.ts"
] as const;

describe("T10 · the first-configured-provider rule is deleted, not merely bypassed", () => {
  it("names the retired rule in exactly one shipped module — the read vocabulary", async () => {
    const naming = (await shippedSources())
      .filter(({ text }) => text.includes("first-configured-provider"))
      .map(({ path }) => path)
      .sort();

    expect(naming).toEqual([...FILES_PERMITTED_TO_NAME_THE_RETIRED_RULE].sort());
  });

  it("declares the retired rule as READ-ONLY history, never as a writable rule", async () => {
    const kernel = await import("@debateai/kernel");

    // It is in the read vocabulary...
    expect(kernel.SERVED_ROOT_RULE_HISTORY).toContain("first-configured-provider");
    expect(kernel.RETIRED_SERVED_ROOT_RULES).toEqual(["first-configured-provider"]);
    expect(kernel.isRetiredServedRootRule("first-configured-provider")).toBe(true);
    // ...and it is NOT the rule a fresh selection records.
    expect(kernel.SERVED_ROOT_SELECTION_RULE).toBe("max-propagated-strength-lexicographic-tiebreak");
    expect(kernel.isRetiredServedRootRule(kernel.SERVED_ROOT_SELECTION_RULE)).toBe(false);
    expect(kernel.isRetiredServedRootRule(null)).toBe(false);
  });

  it("leaves no retired constant or selector anywhere in shipped product source", async () => {
    const sources = await shippedSources();
    const offenders = RETIRED.flatMap(({ name, pattern }) =>
      sources.filter(({ text }) => pattern.test(text)).map(({ path }) => `${name} @ ${path}`)
    );

    expect(offenders).toEqual([]);
  });

  it("confines the retired rule string in migrations to its creating and retiring files", async () => {
    const carrying = (await migrationSources())
      .filter(({ text }) => text.includes("first-configured-provider"))
      .map(({ path }) => path.split("/").at(-1)!)
      .sort();

    expect(carrying).toEqual([...MIGRATIONS_CARRYING_THE_RETIRED_RULE].sort());
  });

  it("ships a forward migration that stops the database accepting the retired rule", async () => {
    const retirement = (await migrationSources())
      .find(({ path }) => path.endsWith(MIGRATIONS_CARRYING_THE_RETIRED_RULE[1]));

    expect(retirement).toBeDefined();
    // The retirement replaces the CHECK; the new rule string is what remains writable.
    expect(retirement!.text).toContain("max-propagated-strength-lexicographic-tiebreak");
    expect(retirement!.text.toUpperCase()).toContain("DROP CONSTRAINT");
    // The constraint is VALIDATED over the declared history, not NOT VALID:
    // the first draft left every historical row permanently unchecked.
    expect(retirement!.text.toUpperCase()).not.toContain("NOT VALID");
  });
});
