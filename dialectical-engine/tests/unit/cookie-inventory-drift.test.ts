import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_BROWSER_STORAGE, LEGAL_COOKIES } from "../../apps/ui/lib/legal/pages.js";

/**
 * SPEC-v2 S01-R17 — the storage inventory law: what the product WRITES equals what /cookies LISTS.
 *
 * WRITTEN is discovered from source text, never from a hand list, with the scanned-file rule and
 * the receiver rule of R17 (the same rules as `slices/S01/checks/r17-red-set.py`, which stays the
 * independent second implementation). LISTED is `LEGAL_COOKIES` ∪ `LEGAL_BROWSER_STORAGE`, the
 * data /cookies and the storage card render. A new cookie or storage key without a /cookies row,
 * or a row nothing writes, turns this suite red and names the item.
 */

const ROOTS = ["apps/ui", "apps/api/src", "packages"] as const;
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage"]);
const TEST_DIRECTORIES = new Set(["tests", "test", "__tests__", "fixtures"]);
const TEST_NAME_PARTS = [".test.", ".spec.", "source-test"] as const;

/** R17's scanned-file rule, over a path relative to the repository root (`/`-separated). */
function isScannedPath(path: string): boolean {
  const parts = path.split("/");
  const name = parts.at(-1) ?? "";
  if (!EXTENSIONS.has(extname(name))) return false;
  if (parts.slice(0, -1).some((part) => SKIPPED_DIRECTORIES.has(part) || TEST_DIRECTORIES.has(part))) return false;
  return !TEST_NAME_PARTS.some((part) => name.includes(part));
}

function walk(root: string, directory: string, out: Map<string, string>): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(root, path, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = relative(root, path).split(sep).join("/");
    if (isScannedPath(rel)) out.set(rel, readFileSync(path, "utf8"));
  }
}

/** Every scanned source file of the repository at `root`, keyed by its root-relative path. */
function scannedSources(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of ROOTS) walk(root, join(root, dir), out);
  return out;
}

/** `const NAME = "value"` declarations across all sources; the first declaration of a name wins. */
function stringConstants(sources: ReadonlyMap<string, string>): Map<string, string> {
  const constants = new Map<string, string>();
  for (const text of sources.values()) {
    for (const match of text.matchAll(/(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["'`]([^"'`$]+)["'`]/g)) {
      if (!constants.has(match[1]!)) constants.set(match[1]!, match[2]!);
    }
  }
  return constants;
}

type WrittenScan = { written: Set<string>; unresolved: string[] };

/**
 * WRITTEN, from source text: (1)-(3) cookie names in files that mention `set-cookie` or assign
 * `document.cookie` — `${CONST}=` builders, literal `"set-cookie", "name=` pairs, and the names
 * `lawfulSetCookie` compares against, read from that function's body only; (4) the key of every
 * `.setItem(` call, whatever its receiver. A key that resolves to no string is `unresolved`.
 */
function scanWritten(sources: ReadonlyMap<string, string>): WrittenScan {
  const constants = stringConstants(sources);
  const resolve = (token: string): string | undefined => {
    const trimmed = token.trim();
    const literal = /^["'`]([^"'`$]+)["'`]$/.exec(trimmed);
    return literal ? literal[1] : constants.get(trimmed);
  };
  const written = new Set<string>();
  const unresolved: string[] = [];
  for (const [path, text] of sources) {
    if (/set-cookie/i.test(text) || /document\.cookie\s*=/.test(text)) {
      for (const match of text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}=/g)) {
        const value = constants.get(match[1]!);
        if (value) written.add(value);
      }
      for (const match of text.matchAll(/["']set-cookie["']\s*,\s*["'`]([A-Za-z0-9_.-]+)=/gi)) written.add(match[1]!);
      const body = /function lawfulSetCookie\b[\s\S]*?\n}\n/.exec(text)?.[0] ?? "";
      for (const match of body.matchAll(/name\s*[!=]==\s*([A-Z][A-Z0-9_]*)/g)) {
        const value = constants.get(match[1]!);
        if (value) written.add(value);
      }
    }
    for (const match of text.matchAll(/([A-Za-z_][\w.]*(?:\(\))?\??)\.setItem\(\s*([^,)]+)/g)) {
      const value = resolve(match[2]!);
      if (value === undefined) {
        unresolved.push(`${path}:${text.slice(0, match.index).split("\n").length} ${match[2]!.trim()}`);
      } else {
        written.add(value);
      }
    }
  }
  return { written, unresolved };
}

const listed = new Set([...LEGAL_COOKIES, ...LEGAL_BROWSER_STORAGE].map(({ name }) => name));

describe("the storage inventory of record equals what the product writes (SPEC-v2 R17)", () => {
  const scan = scanWritten(scannedSources(process.cwd()));

  it("WRITTEN equals LISTED, both ways", () => {
    expect(scan.written.size).toBeGreaterThan(0);
    expect({
      writtenNotListed: [...scan.written].filter((name) => !listed.has(name)).sort(),
      listedNotWritten: [...listed].filter((name) => !scan.written.has(name)).sort()
    }).toEqual({ writtenNotListed: [], listedNotWritten: [] });
  });

  it("every write site's key resolves to a string", () => {
    expect(scan.unresolved).toEqual([]);
  });

  it("the scan keeps the scanned-file rule of SPEC-v2 R17", () => {
    expect(isScannedPath("apps/ui/lib/sessionProxy.test.mjs")).toBe(false);
    expect(isScannedPath("apps/ui/components/support/conversation.ts")).toBe(true);
    expect(isScannedPath("apps/api/src/index.ts")).toBe(true);
    expect(isScannedPath("apps/ui/components/authRoutes.source-test.mjs")).toBe(false);
    expect(isScannedPath("packages/contract/src/index.spec.ts")).toBe(false);
    expect(isScannedPath("apps/ui/tests/helper.ts")).toBe(false);
    expect(isScannedPath("packages/support-kb/test/helper.ts")).toBe(false);
    expect(isScannedPath("apps/api/src/__tests__/helper.ts")).toBe(false);
    expect(isScannedPath("packages/support-kb/fixtures/cookie.ts")).toBe(false);
    expect(isScannedPath("apps/ui/node_modules/pkg/index.js")).toBe(false);
    expect(isScannedPath("apps/ui/.next/server/page.js")).toBe(false);
    expect(isScannedPath("packages/contract/dist/index.js")).toBe(false);
    expect(isScannedPath("apps/ui/coverage/serve/a.ts")).toBe(false);
    expect(isScannedPath("apps/ui/lib/consent.md")).toBe(false);
    for (const extension of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]) {
      expect(isScannedPath(`apps/ui/lib/writer${extension}`), extension).toBe(true);
    }
  });

  it("the receiver rule counts .setItem( on any receiver", () => {
    const sources = new Map([
      ["apps/ui/a.ts", 'const KEY = "k";\nexport function save(store: { setItem(k: string, v: string): void }, x: string) {\n  store.setItem(KEY, x);\n}\n'],
      ["apps/ui/b.ts", 'sessionStore()?.setItem("s", "1");\nwindow.localStorage.setItem(`l`, "1");\n'],
      ["apps/ui/c.ts", "store.setItem(runtimeKey, x);\n"]
    ]);
    const { written, unresolved } = scanWritten(sources);
    expect([...written].sort()).toEqual(["k", "l", "s"]);
    expect(unresolved).toEqual(["apps/ui/c.ts:1 runtimeKey"]);
  });

  it("the proxy rule reads only the body of lawfulSetCookie", () => {
    const route = [
      'const SESSION_COOKIE = "__Host-s";',
      'const SUPPORT_CASE_HEADER = "x-support-case-token";',
      "// forwards set-cookie headers",
      "function lawfulSetCookie(name: string) {",
      "  return name === SESSION_COOKIE;",
      "}",
      "export function other(name: string) {",
      "  return name === SUPPORT_CASE_HEADER;",
      "}",
      ""
    ].join("\n");
    expect([...scanWritten(new Map([["apps/ui/route.ts", route]])).written]).toEqual(["__Host-s"]);
  });
});
