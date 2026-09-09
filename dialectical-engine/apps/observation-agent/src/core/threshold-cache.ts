import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  rename,
  unlink,
  type FileHandle
} from "node:fs/promises";
import { join } from "node:path";
import { isDatabaseUnavailableError, ObservationError } from "./errors.js";
import {
  parseRatifiedThresholdPolicy,
  type RatifiedThresholdPolicy,
  type ThresholdRepository
} from "../oactl/core/thresholds.js";

const CACHE_DIRECTORY = "thresholds";
const CACHE_FILE = "last-ratified.json";

function cacheInvalid(cause: unknown): ObservationError {
  return new ObservationError("OBSERVATION_THRESHOLDS_CACHE_INVALID", cause);
}

function hasDirectoryCustody(metadata: Stats, expectedUid: number): boolean {
  return !metadata.isSymbolicLink()
    && metadata.isDirectory()
    && (metadata.mode & 0o777) === 0o700
    && metadata.uid === expectedUid;
}

function hasFileCustody(metadata: Stats, expectedUid: number): boolean {
  return !metadata.isSymbolicLink()
    && metadata.isFile()
    && (metadata.mode & 0o777) === 0o600
    && metadata.uid === expectedUid;
}

function isSameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

type CacheDirectoryHandles = Readonly<{
  state: FileHandle;
  cache: FileHandle;
}>;

export type ThresholdPolicySource = "DATABASE" | "LAST_RATIFIED_CACHE";

export class ThresholdPolicyCache {
  readonly stateDir: string;
  readonly expectedUid: number | undefined;

  constructor(stateDir: string, expectedUid?: number) {
    this.stateDir = stateDir;
    this.expectedUid = expectedUid
      ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  }

  private directory(): string {
    return join(this.stateDir, CACHE_DIRECTORY);
  }

  private path(): string {
    return join(this.directory(), CACHE_FILE);
  }

  private uid(): number {
    if (this.expectedUid === undefined) throw new Error("cache owner unavailable");
    return this.expectedUid;
  }

  private async openDirectory(path: string, create: boolean): Promise<FileHandle> {
    if (create) await mkdir(path, { recursive: true, mode: 0o700 });
    const expectedUid = this.uid();
    const checked = await lstat(path);
    if (!hasDirectoryCustody(checked, expectedUid)) {
      throw new Error("cache directory custody");
    }
    let handle: FileHandle | undefined;
    try {
      handle = await open(
        path,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      const opened = await handle.stat();
      if (!hasDirectoryCustody(opened, expectedUid) || !isSameFile(checked, opened)) {
        throw new Error("cache directory identity");
      }
      return handle;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      throw error;
    }
  }

  private async openDirectories(create: boolean): Promise<CacheDirectoryHandles> {
    const state = await this.openDirectory(this.stateDir, create);
    try {
      const cache = await this.openDirectory(this.directory(), create);
      return Object.freeze({ state, cache });
    } catch (error) {
      await state.close().catch(() => undefined);
      throw error;
    }
  }

  private async closeDirectories(handles: CacheDirectoryHandles): Promise<void> {
    try {
      await handles.cache.close();
    } finally {
      await handles.state.close();
    }
  }

  async read(): Promise<RatifiedThresholdPolicy> {
    try {
      const directories = await this.openDirectories(false);
      try {
        const expectedUid = this.uid();
        const checked = await lstat(this.path());
        if (!hasFileCustody(checked, expectedUid)) {
          throw new Error("cache file custody");
        }
        const handle = await open(
          this.path(),
          constants.O_RDONLY | constants.O_NOFOLLOW
        );
        try {
          const opened = await handle.stat();
          if (!hasFileCustody(opened, expectedUid) || !isSameFile(checked, opened)) {
            throw new Error("cache file identity");
          }
          const value: unknown = JSON.parse(await handle.readFile("utf8"));
          return parseRatifiedThresholdPolicy(value);
        } finally {
          await handle.close();
        }
      } finally {
        await this.closeDirectories(directories);
      }
    } catch (error) {
      if (error instanceof ObservationError
        && error.code === "OBSERVATION_THRESHOLDS_CACHE_INVALID") {
        throw error;
      }
      throw cacheInvalid(error);
    }
  }

  async write(policy: RatifiedThresholdPolicy): Promise<void> {
    let temporary: string | undefined;
    try {
      const validated = parseRatifiedThresholdPolicy(policy);
      const directories = await this.openDirectories(true);
      try {
        const directory = this.directory();
        temporary = join(directory, `last-ratified.${process.pid}.${randomUUID()}.tmp`);
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(validated)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, this.path());
        await directories.cache.sync();
      } finally {
        await this.closeDirectories(directories);
      }
    } catch (error) {
      if (error instanceof ObservationError
        && error.code === "OBSERVATION_THRESHOLDS_CACHE_INVALID") {
        throw error;
      }
      throw cacheInvalid(error);
    } finally {
      if (temporary !== undefined) await unlink(temporary).catch(() => undefined);
    }
  }
}

export async function readBootThresholdPolicy(input: Readonly<{
  repository: Pick<ThresholdRepository, "readCurrent">;
  cache: ThresholdPolicyCache;
}>): Promise<Readonly<{ policy: RatifiedThresholdPolicy; source: ThresholdPolicySource }>> {
  let policy: RatifiedThresholdPolicy;
  try {
    policy = await input.repository.readCurrent();
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    return Object.freeze({
      policy: await input.cache.read(),
      source: "LAST_RATIFIED_CACHE"
    });
  }
  await input.cache.write(policy);
  return Object.freeze({ policy, source: "DATABASE" });
}
