import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultHubPath = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const importLinePattern = /^\s*@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;\s*$/gm;

export function loadCss(hubPath = defaultHubPath) {
  const hub = readFileSync(hubPath, "utf8");
  const imports = [...hub.matchAll(importLinePattern)];
  const nonImportContent = hub.replace(importLinePattern, "").trim();

  if (nonImportContent) {
    throw new Error(`${hubPath} must contain only @import statements`);
  }
  if (imports.length === 0) {
    throw new Error(`${hubPath} must import at least one stylesheet`);
  }

  const hubDirectory = dirname(hubPath);
  return imports
    .map(([, importPath]) => readFileSync(resolve(hubDirectory, importPath), "utf8"))
    .join("");
}
