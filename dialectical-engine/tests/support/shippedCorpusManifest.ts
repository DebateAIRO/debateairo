import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The shipped corpus, enumerated BY NAME.
 *
 * The depth oracle used to pin its corpus with a count (`toBe(232)`). A count is a
 * number standing in for a set: it cannot say WHICH file appeared, it cannot tell an
 * addition from a deletion that happens to balance it, and a legitimately landed
 * shipped file turns the row red with a message that names no path. This manifest
 * replaces that number, so adding a shipped file is a deliberate, reviewable edit to
 * a list of paths, and a file that disappears is named too.
 *
 * The manifest is data, never a second definition of the instrument: the roots, the
 * skipped directories and the extensions stay in the oracle. This module only reads
 * the committed list and diffs it against whatever the oracle scanned.
 */
const MANIFEST_PATH = fileURLToPath(new URL("./shipped-corpus.manifest.txt", import.meta.url));

const MANIFEST_HEADER = [
  "# The shipped source corpus the S1-1 depth oracle scans, one repository-relative",
  "# path per line, sorted. Blank lines and lines beginning with # are documentation.",
  "#",
  "# This list is an ORACLE, not a cache. Landing a new shipped file is expected to",
  "# turn the corpus row red until the path is added here on purpose.",
  "#",
  "# Regenerate (after reading the diff the failure printed, and agreeing with it):",
  "#   SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts",
  "#",
  "# The scan's roots, skipped directories and extensions live in",
  "# tests/unit/s1-1-depth-contract.test.ts and are NOT duplicated here."
];

/** Blank lines and `#` lines are documentation; everything else is a corpus entry. */
function entriesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .sort();
}

/** The committed corpus, sorted. */
export function readShippedCorpusManifest(): string[] {
  return entriesOf(readFileSync(MANIFEST_PATH, "utf8"));
}

/**
 * What the scan holds that the manifest does not (`added`), and what the manifest
 * holds that the scan does not (`missing`). Both empty means the sets are equal —
 * and a failure prints the paths, which is the whole point of a manifest.
 */
export function shippedCorpusDrift(
  scanned: readonly string[],
  manifest: readonly string[]
): { added: string[]; missing: string[] } {
  const committed = new Set(manifest);
  const present = new Set(scanned);
  return {
    added: [...present].filter((path) => !committed.has(path)).sort(),
    missing: [...committed].filter((path) => !present.has(path)).sort()
  };
}

/**
 * Rewrite the manifest from a scan. Deliberately NOT a fallback the oracle reaches
 * for on its own: the S1-1 corpus row calls this only when
 * SHIPPED_CORPUS_MANIFEST_UPDATE=1 is set, so a drifting corpus fails loudly by
 * default and is re-pinned only by someone who asked for it.
 */
export function writeShippedCorpusManifest(scanned: readonly string[]): void {
  const body = [...scanned].sort();
  writeFileSync(MANIFEST_PATH, `${[...MANIFEST_HEADER, "", ...body].join("\n")}\n`, "utf8");
}
