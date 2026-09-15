import { lstat, readdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export type SpoolTarget = Readonly<{
  component: "spool";
  kind: "spool_directory";
  path: string;
}>;

export type SpoolFileMetadata = Readonly<{
  runtime: string;
  spoolRef: string;
  mtime: Date;
  ageSeconds: number;
}>;

export type SpoolScan = Readonly<{
  state: "CURRENT" | "UNKNOWN";
  files: readonly SpoolFileMetadata[];
}>;

type DirectoryEntry = Readonly<{
  name: string;
  isFile(): boolean;
}>;

export type SpoolScanIo = Readonly<{
  lstat(path: string): Promise<Readonly<{
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>>;
  readdir(path: string, options: Readonly<{ withFileTypes: true }>): Promise<readonly DirectoryEntry[]>;
  stat(path: string): Promise<Readonly<{
    isFile(): boolean;
    mtime: Date;
  }>>;
}>;

const productionIo: SpoolScanIo = Object.freeze({ lstat, readdir, stat });
const SPOOL_NAME = /^([A-Za-z0-9_.-]+)-[0-9]+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.spool$/u;
const EXCLUDED_ZONE = /\/(?:apps\/api\/(?:src\/(?:mail-channel|mfa|registration)\.ts|dist\/(?:mail-channel|mfa|registration)\.js)|dist\/apps\/api\/src\/(?:mail-channel|mfa|registration)\.js|dist\/packages\/db\/src\/identity\.js|migrations\/003[0-3]_[^/]*|packages\/db\/(?:src\/identity\.ts|dist\/identity\.js))(?:\/|$)/u;
const EXCLUDED_ZONE_PARENT = /\/(?:apps\/api\/(?:src|dist)|dist\/(?:apps\/api\/src|packages\/db\/src)|migrations|packages\/db\/(?:src|dist))\/?$/u;

function allowedTarget(target: SpoolTarget): boolean {
  return target.component === "spool"
    && target.kind === "spool_directory"
    && isAbsolute(target.path)
    && !EXCLUDED_ZONE.test(target.path)
    && !EXCLUDED_ZONE_PARENT.test(target.path);
}

export async function scanSpoolMetadata(input: Readonly<{
  targets: readonly SpoolTarget[];
  now: Date;
  thresholdSeconds: number;
  io?: SpoolScanIo;
}>): Promise<SpoolScan> {
  const io = input.io ?? productionIo;
  if (input.targets.length === 0 || input.targets.some((target) => !allowedTarget(target))) {
    return Object.freeze({ state: "UNKNOWN", files: Object.freeze([]) });
  }
  try {
    const files: SpoolFileMetadata[] = [];
    for (const target of input.targets) {
      const directory = await io.lstat(target.path);
      if (directory.isSymbolicLink() || !directory.isDirectory()) {
        return Object.freeze({ state: "UNKNOWN", files: Object.freeze([]) });
      }
      const entries = await io.readdir(target.path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const match = SPOOL_NAME.exec(entry.name);
        if (match === null) continue;
        const metadata = await io.stat(join(target.path, entry.name));
        if (!metadata.isFile()) continue;
        const ageSeconds = Math.max(
          0,
          (input.now.getTime() - metadata.mtime.getTime()) / 1_000
        );
        if (ageSeconds < input.thresholdSeconds) continue;
        files.push(Object.freeze({
          runtime: match[1]!,
          spoolRef: entry.name,
          mtime: metadata.mtime,
          ageSeconds
        }));
      }
    }
    return Object.freeze({
      state: "CURRENT",
      files: Object.freeze(files.sort((left, right) =>
        left.spoolRef.localeCompare(right.spoolRef)))
    });
  } catch {
    return Object.freeze({ state: "UNKNOWN", files: Object.freeze([]) });
  }
}
