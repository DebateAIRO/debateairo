import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T8 (goal 119-128, ruling S5-2) — `accumulate` is THE operator.
 *
 * The DoD is a repo-wide invariant: "no strict-and or rival-operator reference
 * in shipped code (grep test)". The oracle below is deliberately
 * LAYOUT-INDEPENDENT — it scans whole file text, never a line at a time, so an
 * ordinary reformat (a wrapped chain, a split literal, a renamed local) cannot
 * blind it the way a line-scoped oracle was blinded in the T1 lane.
 *
 * Shipped code = product source and migrations. Tests and docs are not shipped;
 * they are held honest by the compiler and by the suites instead.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

const SHIPPED_ROOTS = ["packages", "apps", "tools", "acceptance", "web"] as const;

/**
 * Migrations are append-only history, not live source: an already-applied file
 * is never edited, so the creating migration keeps naming what it created and
 * the retirement is a NEW forward file. That history is therefore held by its
 * own assertion (P5) instead of by the live-source scan — and P5 pins the
 * permitted set exactly, so a third migration reintroducing the vocabulary
 * fails just as loudly as a source file would.
 */
const MIGRATIONS_CARRYING_THE_REPEALED_VOCABULARY = [
  "0003_s03.sql",                 // created the rival columns and the two-member operator CHECK
  "0006_s05.sql",                 // created the served-number WITHHELD reason constraint
  "0051_t8_remove_strict_and.sql" // retires both; it names exactly what it retires
] as const;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "generated", ".next", ".turbo", "coverage"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".sql"];

function isShippedSource(path: string): boolean {
  if (path.includes(".test.") || path.includes(".spec.")) return false;
  if (path.endsWith(".disabled")) return false;
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

async function shippedSources(): Promise<readonly { readonly path: string; readonly text: string }[]> {
  const files: { path: string; text: string }[] = [];
  const walk = async (directory: string): Promise<void> => {
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
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !isShippedSource(entry.name)) continue;
      files.push({ path: relative(root, full).split(sep).join("/"), text: await readFile(full, "utf8") });
    }
  };
  for (const shippedRoot of SHIPPED_ROOTS) await walk(join(root, shippedRoot));
  return files;
}

/**
 * The operator id (`strict-and`), the SQL CHECK member (`'strict-and'`) and the
 * withholding reason literal (`STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED`) are
 * one vocabulary under one separator-insensitive pattern. English prose that
 * merely runs the words together across a SPACE ("byte-strict and repairs
 * nothing") is not this vocabulary and is deliberately not matched.
 */
const STRICT_AND_VOCABULARY = /strict[-_]and/gi;

/** The rival receipt pair, in every spelling the repo used: camel and snake. */
const RIVAL_RECEIPT_VOCABULARY = /rival[-_]?(?:operator|strength)/gi;

/** The dual-evaluation flag and its locals, inside the package that owned them. */
const RIVAL_IDENTIFIER = /\brival\b/gi;

function hits(text: string, pattern: RegExp): readonly string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

describe("T8 — strict-and and the rival-operator pathway are gone from shipped code", () => {
  it("P1: no shipped source carries the strict-and operator vocabulary", async () => {
    const sources = await shippedSources();
    expect(sources.length).toBeGreaterThan(100);
    const offenders = sources
      .map((file) => ({ path: file.path, matches: hits(file.text, STRICT_AND_VOCABULARY) }))
      .filter((file) => file.matches.length > 0);
    expect(offenders).toEqual([]);
  });

  it("P2: no shipped source carries the rivalOperator / rivalStrength receipt vocabulary", async () => {
    const sources = await shippedSources();
    const offenders = sources
      .map((file) => ({ path: file.path, matches: hits(file.text, RIVAL_RECEIPT_VOCABULARY) }))
      .filter((file) => file.matches.length > 0);
    expect(offenders).toEqual([]);
  });

  it("P3: the propagation package carries no `rival` identifier at all", async () => {
    const sources = (await shippedSources()).filter((file) => file.path.startsWith("packages/propagation/src/"));
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources
      .map((file) => ({ path: file.path, matches: hits(file.text, RIVAL_IDENTIFIER) }))
      .filter((file) => file.matches.length > 0);
    expect(offenders).toEqual([]);
  });

  it("P4: published-arithmetic exports exactly agg and σ — strict-and's `product` is gone", async () => {
    // Ground truth is the MODULE'S OWN KEYS, not a source pattern: an oracle
    // that greps only `export function` passes a module that re-adds the
    // repealed symbol as `export const product = ...` or as a re-export.
    const module_ = await import("../../packages/published-arithmetic/src/index.js");
    expect(Object.keys(module_).sort()).toEqual(["agg", "σ"].sort());

    // Second, independent reading of the same property over the source text, so
    // an export form that is declared but not reachable at runtime still fails.
    const source = await readFile(join(root, "packages/published-arithmetic/src/index.ts"), "utf8");
    const declared = [
      ...source.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([^\s(=:;{]+)/g)
    ].map((match) => match[1]);
    const reExported = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap((match) => match[1]!.split(","))
      .map((name) => name.split(/\s+as\s+/u).at(-1)!.trim())
      .filter((name) => name.length > 0);
    expect([...declared, ...reExported].sort()).toEqual(["agg", "σ"].sort());
  });

  it("P5: the receipt schema is migrated — history names it, exactly one forward file retires it", async () => {
    const directory = join(root, "migrations");
    const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    const carrying: string[] = [];
    for (const name of names) {
      const text = await readFile(join(directory, name), "utf8");
      if (hits(text, STRICT_AND_VOCABULARY).length > 0 || hits(text, RIVAL_RECEIPT_VOCABULARY).length > 0) {
        carrying.push(name);
      }
    }
    expect(carrying).toEqual([...MIGRATIONS_CARRYING_THE_REPEALED_VOCABULARY].sort());

    // The retirement is real, not just named: columns dropped, operator domain
    // narrowed to the single pinned member.
    const retirement = await readFile(join(directory, "0051_t8_remove_strict_and.sql"), "utf8");
    expect(retirement).toContain("DROP COLUMN IF EXISTS rival_operator");
    expect(retirement).toContain("DROP COLUMN IF EXISTS rival_strength");
    expect(retirement).toContain("operator_used IN ('accumulate')");
    expect(retirement).toContain("CHECK (status IN ('PRESENT', 'EVICTED'))");
  });

  it("NEGATIVE CONTROL: the SPLIT-loop rival CARVER vocabulary and `arrival` are untouched by P1/P2", () => {
    const lawful = [
      "export function selectRivalCarver(input: {",
      'throw new TypedDomainError("RIVAL_CARVER_UNAVAILABLE", "No rival carver candidate exists");',
      "const arrival = queue.shift();",
      "// the runtime environment is strict and contains no Hatchet keys"
    ].join("\n");
    expect(hits(lawful, STRICT_AND_VOCABULARY)).toEqual([]);
    expect(hits(lawful, RIVAL_RECEIPT_VOCABULARY)).toEqual([]);
  });
});
