import { constants } from "node:fs";
import type { BigIntStats } from "node:fs";
import {
  lstat,
  open,
  realpath,
  rename,
  stat,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, relative } from "node:path";

export type MarkerName = "CAPTURE_OFF" | "KILL";
export type MarkerPresence = "PRESENT" | "ABSENT";

export interface ControlRootInput {
  readonly root: string;
  readonly ownerUid: number;
  readonly ownerGid: number;
  readonly postgresDeviceId: string;
}

export interface ControlRoot {
  readonly path: string;
  readonly dev: bigint;
  readonly ownerUid: number;
  readonly ownerGid: number;
  ensureMarker(name: MarkerName): Promise<"CREATED" | "PRESENT">;
}

const PLATFORM_FLAGS = constants as typeof constants & Readonly<Record<string, number>>;
const O_CLOEXEC = PLATFORM_FLAGS.O_CLOEXEC ?? (process.platform === "darwin" ? 0x01000000 : 0);
if (constants.O_NOFOLLOW === 0 || O_CLOEXEC === 0) throw new TypeError("FIX10_OPEN_FLAGS_UNAVAILABLE");
const OPEN_MARKER = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
  constants.O_NOFOLLOW | O_CLOEXEC;
const OPEN_READ = constants.O_RDONLY | constants.O_NOFOLLOW | O_CLOEXEC;

function fail(code: string): never { throw new TypeError(code); }

function safeLeaf(root: ControlRoot, leaf: string): string {
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(leaf) || leaf.includes("..")) {
    fail("FIX10_PATH");
  }
  const path = join(root.path, leaf);
  if (relative(root.path, path).startsWith("..") || !isAbsolute(path)) fail("FIX10_PATH");
  return path;
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | O_CLOEXEC);
  try { await handle.sync(); } finally { await handle.close(); }
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid &&
    left.gid === right.gid && left.mode === right.mode && left.nlink === right.nlink &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function validateRegular(handle: FileHandle, path: string, mode: number): Promise<BigIntStats> {
  const [before, opened] = await Promise.all([lstat(path, { bigint: true }), handle.stat({ bigint: true })]);
  if (!before.isFile() || !opened.isFile() || before.isSymbolicLink() || before.nlink !== 1n ||
      before.dev !== opened.dev || before.ino !== opened.ino || before.uid !== opened.uid ||
      before.gid !== opened.gid || (Number(opened.mode) & 0o7777) !== mode) fail("FIX10_LEAF_INVALID");
  return opened;
}

export async function createControlRoot(input: ControlRootInput): Promise<ControlRoot> {
  if (!isAbsolute(input.root) || input.root.includes("\0") || input.root === "/" ||
      !/^[1-9][0-9]*$/u.test(input.postgresDeviceId)) fail("FIX10_ROOT_INPUT");
  const canonical = await realpath(input.root);
  if (canonical !== input.root) fail("FIX10_ROOT_CANONICAL");
  const components = canonical.split("/").filter(Boolean);
  let ancestor = "/";
  for (const component of components.slice(0, -1)) {
    ancestor = join(ancestor, component);
    const trust = await lstat(ancestor, { bigint: true });
    if (!trust.isDirectory() || trust.isSymbolicLink() || (trust.uid !== 0n && trust.uid !== BigInt(input.ownerUid)) ||
        (Number(trust.mode) & 0o022) !== 0) fail("FIX10_ROOT_ANCESTOR");
  }
  const metadata = await lstat(canonical, { bigint: true });
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== BigInt(input.ownerUid) ||
      metadata.gid !== BigInt(input.ownerGid) || (Number(metadata.mode) & 0o7777) !== 0o751) {
    fail("FIX10_ROOT_METADATA");
  }
  if (metadata.dev === BigInt(input.postgresDeviceId)) fail("FIX10_ROOT_DEVICE");
  const root = Object.freeze({
    path: canonical,
    dev: metadata.dev,
    ownerUid: input.ownerUid,
    ownerGid: input.ownerGid,
    ensureMarker: async (name: MarkerName) => ensureMarker(root, name),
  });
  return root;
}

export async function markerState(root: ControlRoot, name: MarkerName): Promise<MarkerPresence> {
  const path = safeLeaf(root, name);
  let handle: FileHandle;
  try { handle = await open(path, OPEN_READ); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "ABSENT";
    throw error;
  }
  try {
    await validateRegular(handle, path, 0o600);
    const metadata = await handle.stat({ bigint: true });
    if (metadata.size !== 0n || metadata.dev !== root.dev || metadata.uid !== BigInt(root.ownerUid)) {
      fail("FIX10_MARKER_INVALID");
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === "FIX10_LEAF_INVALID") fail("FIX10_MARKER_INVALID");
    throw error;
  } finally { await handle.close(); }
  return "PRESENT";
}

export async function ensureMarker(root: ControlRoot, name: MarkerName): Promise<"CREATED" | "PRESENT"> {
  if (await markerState(root, name) === "PRESENT") return "PRESENT";
  const path = safeLeaf(root, name);
  let handle: FileHandle;
  try { handle = await open(path, OPEN_MARKER, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST" && await markerState(root, name) === "PRESENT") {
      return "PRESENT";
    }
    throw error;
  }
  try {
    await handle.chmod(0o600);
    await validateRegular(handle, path, 0o600);
    await handle.sync();
  } finally { await handle.close(); }
  await syncDirectory(root.path);
  if (await markerState(root, name) !== "PRESENT") fail("FIX10_MARKER_RECHECK");
  return "CREATED";
}

export async function removeMarker(root: ControlRoot, name: MarkerName): Promise<"REMOVED" | "ABSENT"> {
  const path = safeLeaf(root, name);
  let handle: FileHandle;
  try {
    handle = await open(path, OPEN_READ);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "ABSENT";
    throw error;
  }
  try {
    const before = await validateRegular(handle, path, 0o600);
    if (before.size !== 0n || before.dev !== root.dev || before.uid !== BigInt(root.ownerUid)) {
      fail("FIX10_MARKER_INVALID");
    }
    await unlink(path);
    const after = await handle.stat({ bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino || after.uid !== before.uid ||
        after.gid !== before.gid || after.mode !== before.mode || after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs || after.nlink !== 0n) {
      fail("FIX10_MARKER_REMOVE");
    }
    try {
      await lstat(path, { bigint: true });
      fail("FIX10_MARKER_REPLACED");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  } finally {
    await handle.close();
  }
  await syncDirectory(root.path);
  return "REMOVED";
}

export async function replaceControlJson(
  root: ControlRoot,
  leaf: "ARMED" | "proof/authority-proof.json",
  bytes: Uint8Array,
  mode: 0o600 | 0o640,
): Promise<void> {
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a || bytes.includes(0x0d)) fail("FIX10_JSON_BYTES");
  const destination = safeLeaf(root, leaf);
  const parent = dirname(destination);
  try {
    const existing = await open(destination, OPEN_READ);
    try { await validateRegular(existing, destination, mode); } finally { await existing.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${destination}.tmp-${randomBytes(16).toString("hex")}`;
  const handle = await open(temporary, OPEN_MARKER, mode);
  try {
    await handle.chmod(mode);
    let offset = 0;
    while (offset < bytes.length) {
      const written = await handle.write(bytes, offset, bytes.length - offset, offset);
      if (written.bytesWritten <= 0) fail("FIX10_SHORT_WRITE");
      offset += written.bytesWritten;
    }
    await handle.sync();
    await validateRegular(handle, temporary, mode);
  } catch (error) {
    try { await unlink(temporary); } catch { /* best-effort unexposed temp cleanup */ }
    throw error;
  } finally { await handle.close(); }
  try { await rename(temporary, destination); }
  catch (error) {
    try { await unlink(temporary); } catch { /* best-effort cleanup of our unexposed temp */ }
    throw error;
  }
  await syncDirectory(parent);
  const finalHandle = await open(destination, OPEN_READ);
  try {
    await validateRegular(finalHandle, destination, mode);
    const finalBytes = await finalHandle.readFile();
    if (!Buffer.from(finalBytes).equals(Buffer.from(bytes))) fail("FIX10_REPLACE_RECHECK");
  } finally { await finalHandle.close(); }
}

export async function readControlFile(
  root: ControlRoot,
  leaf: string,
  mode: number,
  maximumBytes = 1_048_576,
): Promise<Buffer> {
  const path = safeLeaf(root, leaf);
  const handle = await open(path, OPEN_READ);
  try {
    const before = await validateRegular(handle, path, mode);
    if (before.size > BigInt(maximumBytes)) fail("FIX10_READ_CAP");
    const bytes = await handle.readFile();
    const [after, pathAfter] = await Promise.all([handle.stat({ bigint: true }), lstat(path, { bigint: true })]);
    if (!sameFile(before, after) || !sameFile(after, pathAfter) || pathAfter.isSymbolicLink() ||
        BigInt(bytes.length) !== before.size) fail("FIX10_READ_DRIFT");
    return bytes;
  } finally { await handle.close(); }
}

export async function appendControlHistory(
  root: ControlRoot,
  leaf: "outbox/obsctl-actions.jsonl" | "witness/obsctl-actions.jsonl",
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a || bytes.includes(0x0d)) fail("FIX10_HISTORY_BYTES");
  const path = safeLeaf(root, leaf);
  const flags = constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | O_CLOEXEC;
  const handle = await open(path, flags);
  try {
    const before = await validateRegular(handle, path, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = await handle.write(bytes, offset, bytes.length - offset, null);
      if (written.bytesWritten <= 0) fail("FIX10_SHORT_WRITE");
      offset += written.bytesWritten;
    }
    await handle.sync();
    const after = await validateRegular(handle, path, 0o600);
    if (after.dev !== before.dev || after.ino !== before.ino || after.uid !== before.uid ||
        after.gid !== before.gid || after.nlink !== before.nlink ||
        after.size !== before.size + BigInt(bytes.length)) fail("FIX10_HISTORY_DRIFT");
  } finally { await handle.close(); }
}
