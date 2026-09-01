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

/** The retired rule token, the retired constant, and the retired selector. */
const RETIRED = [
  "first-configured-provider",
  "SERVED_ROOT_RULE",
  "selectServedRoot("
] as const;

describe("T10 · the first-configured-provider rule is deleted, not merely bypassed", () => {
  it("leaves no first-configured-provider token in shipped product source", async () => {
    const offenders = (await shippedSources())
      .filter(({ text }) => text.includes("first-configured-provider"))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("leaves no retired constant or selector anywhere in shipped product source", async () => {
    const sources = await shippedSources();
    const offenders = RETIRED.flatMap((token) =>
      sources.filter(({ text }) => text.includes(token)).map(({ path }) => `${token} @ ${path}`)
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
  });
});
