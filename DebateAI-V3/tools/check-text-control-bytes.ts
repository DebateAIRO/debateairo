import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_SOURCE_EXTENSIONS = new Set([
  ".cjs", ".css", ".csv", ".env", ".graphql", ".html", ".js", ".json",
  ".jsx", ".md", ".mjs", ".mts", ".sh", ".sql", ".svg", ".toml", ".tpl",
  ".ts", ".tsx", ".txt", ".yaml", ".yml"
]);
const TEXT_SOURCE_NAMES = new Set(["Dockerfile", "Makefile", "VERSION"]);

export interface ForbiddenControlByte {
  readonly offset: number;
  readonly byte: number;
}

export interface RepositoryTextControlByteFinding extends ForbiddenControlByte {
  readonly path: string;
}

export function findForbiddenControlBytes(content: Uint8Array): readonly ForbiddenControlByte[] {
  const findings: ForbiddenControlByte[] = [];
  for (let offset = 0; offset < content.length; offset += 1) {
    const byte = content[offset]!;
    if ((byte < 0x20 && byte !== 0x09 && byte !== 0x0a) || byte === 0x7f) {
      findings.push(Object.freeze({ offset, byte }));
    }
  }
  return Object.freeze(findings);
}

function isTrackedTextSource(path: string): boolean {
  const name = basename(path);
  return name.startsWith(".") || name.endsWith(".mjs.disabled") || TEXT_SOURCE_NAMES.has(name) || TEXT_SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function scanRepositoryTextSources(repositoryRoot: string): readonly RepositoryTextControlByteFinding[] {
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024
  }).toString("utf8").split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(join(repositoryRoot, path)))
    .filter(isTrackedTextSource);
  const findings = tracked.flatMap((path) =>
    findForbiddenControlBytes(readFileSync(join(repositoryRoot, path))).map((finding) => ({
      path,
      ...finding
    }))
  );
  return Object.freeze(findings);
}

function renderByte(byte: number): string {
  return `0x${byte.toString(16).padStart(2, "0")}`;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  const findings = scanRepositoryTextSources(process.cwd());
  if (findings.length === 0) {
    process.stdout.write("REPOSITORY_TEXT_CONTROL_BYTES=0\n");
  } else {
    for (const finding of findings) {
      process.stderr.write(`${finding.path}:${finding.offset}:${renderByte(finding.byte)}\n`);
    }
    process.exitCode = 1;
  }
}
