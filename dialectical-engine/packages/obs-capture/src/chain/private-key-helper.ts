import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";

import { canonicalJson, lengthPrefix } from "./canonical.js";
import type { ChainedSignerReleaseRecord, ChainedWriterSignerProfile, SignerAuthority } from "./signer.js";

export interface CustodyObservation {
  readonly ctime_ns: string;
  readonly dev: string;
  readonly gid: string;
  readonly ino: string;
  readonly mode: "0600";
  readonly mtime_ns: string;
  readonly nlink: "1";
  readonly size: string;
  readonly uid: string;
}

export interface NativeCustodySession {
  readonly observed: CustodyObservation;
  takePrivateKey(): Buffer;
  checkReadiness(): Promise<CustodyObservation>;
  checkCommit(challenge: string): Promise<CustodyObservation>;
  checkRelease(record: ChainedSignerReleaseRecord): Promise<CustodyObservation>;
  closeRelease(record: ChainedSignerReleaseRecord): Promise<void>;
  abort(): Promise<void>;
}

const MAGIC = Buffer.from("F10CUST7", "ascii");
const BIND_LENGTH = 194;
const OBSERVED_LENGTH = 66;
const HEX32 = /^[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PROFILE_IDS = Object.freeze({
  api_occurrence: 1, runner_occurrence: 2, scheduler_occurrence: 3,
  daemon_action: 4, obsctl_action: 5, watchdog_witness: 6,
} as const);

function fail(code: string): never {
  throw new TypeError(code);
}

function uuidBytes(value: string): Buffer {
  if (!UUID_V4.test(value)) fail("FIX09_CUSTODY_BINDING");
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

function digestBytes(value: string): Buffer {
  if (!HEX32.test(value)) fail("FIX09_CUSTODY_BINDING");
  return Buffer.from(value, "hex");
}

function lp8(value: string): Buffer {
  const bytes = Buffer.from(value, "ascii");
  if (bytes.length === 0 || bytes.length > 128) fail("FIX09_CUSTODY_IDENTITY");
  return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function binding(
  profile: ChainedWriterSignerProfile | "watchdog_witness",
  authority: SignerAuthority,
): Buffer {
  const profileId = PROFILE_IDS[profile];
  const result = Buffer.concat([
    uuidBytes(authority.barrier_id), digestBytes(authority.nonce), uuidBytes(authority.session_id),
    Buffer.from([profileId, profileId]), digestBytes(authority.activation_manifest_sha256),
    digestBytes(authority.public_keyring_sha256), digestBytes(authority.inventory_sha256),
    digestBytes(authority.profile_map_sha256),
  ]);
  if (result.length !== BIND_LENGTH) fail("FIX09_CUSTODY_BINDING");
  return result;
}

function frame(opcode: number, ordinal: number, body: Buffer): Buffer {
  const payload = Buffer.alloc(14 + body.length);
  MAGIC.copy(payload, 0);
  payload[8] = 1;
  payload[9] = opcode;
  payload.writeUInt32BE(ordinal, 10);
  body.copy(payload, 14);
  if (payload.length < 14 || payload.length > 764) fail("FIX09_CUSTODY_FRAME");
  return lengthPrefix(payload);
}

class FrameReader {
  readonly #stream: Readable;
  #buffer = Buffer.alloc(0);
  #ended = false;
  #error: Error | undefined;
  #wake: (() => void) | undefined;

  constructor(stream: Readable) {
    this.#stream = stream;
    stream.on("data", (chunk: Buffer) => {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      this.#wake?.();
    });
    stream.once("end", () => { this.#ended = true; this.#wake?.(); });
    stream.once("error", (error) => { this.#error = error; this.#wake?.(); });
  }

  async #available(length: number): Promise<void> {
    while (this.#buffer.length < length) {
      if (this.#error !== undefined) throw this.#error;
      if (this.#ended) fail("FIX09_CUSTODY_EOF");
      await new Promise<void>((resolve) => { this.#wake = resolve; });
      this.#wake = undefined;
    }
  }

  async read(opcode: number, ordinal: number): Promise<Buffer> {
    await this.#available(4);
    const length = this.#buffer.readUInt32BE(0);
    if (length < 14 || length > 764) fail("FIX09_CUSTODY_FRAME");
    await this.#available(4 + length);
    const value = this.#buffer.subarray(0, 4 + length);
    this.#buffer = this.#buffer.subarray(4 + length);
    if (!value.subarray(4, 12).equals(MAGIC) || value[12] !== 1 ||
      value[13] !== opcode || value.readUInt32BE(14) !== ordinal) fail("FIX09_CUSTODY_FRAME");
    return value;
  }

  async exactEof(): Promise<void> {
    while (!this.#ended && this.#error === undefined) {
      await new Promise<void>((resolve) => { this.#wake = resolve; });
      this.#wake = undefined;
    }
    if (this.#error !== undefined) throw this.#error;
    if (this.#buffer.length !== 0) fail("FIX09_CUSTODY_TRAILING");
  }
}

function observed(bytes: Buffer): CustodyObservation {
  if (bytes.length !== OBSERVED_LENGTH) fail("FIX09_CUSTODY_OBSERVED");
  const mode = bytes.readUInt16BE(32).toString(8).padStart(4, "0");
  const result = Object.freeze(Object.assign(Object.create(null), {
    dev: bytes.readBigUInt64BE(0).toString(), ino: bytes.readBigUInt64BE(8).toString(),
    uid: bytes.readBigUInt64BE(16).toString(), gid: bytes.readBigUInt64BE(24).toString(),
    mode, nlink: bytes.readBigUInt64BE(34).toString(), size: bytes.readBigUInt64BE(42).toString(),
    mtime_ns: bytes.readBigUInt64BE(50).toString(), ctime_ns: bytes.readBigUInt64BE(58).toString(),
  })) as CustodyObservation;
  if (result.mode !== "0600" || result.nlink !== "1" || result.size === "0") fail("FIX09_CUSTODY_OBSERVED");
  return result;
}

async function send(stream: Writable, bytes: Buffer): Promise<void> {
  if (!stream.write(bytes)) await new Promise<void>((resolve, reject) => {
    stream.once("drain", resolve); stream.once("error", reject);
  });
}

function releaseDigest(record: ChainedSignerReleaseRecord): Buffer {
  const canonical = Buffer.from(canonicalJson(record), "utf8");
  const domain = Buffer.from("obs-chain-signer-release-record/v1\0", "utf8");
  const count = Buffer.alloc(4); count.writeUInt32BE(1);
  return createHash("sha256").update(domain).update(count).update(lengthPrefix(canonical)).digest();
}

function childExit(child: ChildProcess): Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function sameNode(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid &&
    left.gid === right.gid && left.mode === right.mode && left.nlink === right.nlink &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function trustedDirectory(value: Stats, owner: string): boolean {
  return value.isDirectory() && !value.isSymbolicLink() && String(value.uid) === owner &&
    (value.mode & 0o022) === 0;
}

export async function openPinnedPrivateKey(
  profile: ChainedWriterSignerProfile | "watchdog_witness",
  authority: SignerAuthority,
): Promise<NativeCustodySession> {
  const controlRoot = process.env.OBS_CONTROL_DIR ?? fail("FIX09_CUSTODY_CONFIG");
  const helperPath = process.env.OBS_CHAIN_HELPER_PATH ?? fail("FIX09_CUSTODY_CONFIG");
  const helperSha = process.env.OBS_CHAIN_HELPER_SHA256 ?? fail("FIX09_CUSTODY_CONFIG");
  const provisionerUid = process.env.OBS_CHAIN_PROVISIONER_UID ?? fail("FIX09_CUSTODY_CONFIG");
  if (!isAbsolute(controlRoot) || helperPath !== `${controlRoot}/chain/fix09-openat-read` ||
      !HEX32.test(helperSha) || !/^(?:0|[1-9][0-9]*)$/u.test(provisionerUid)) fail("FIX09_CUSTODY_CONFIG");
  const controlState = await lstat(controlRoot);
  const chainState = await lstat(`${controlRoot}/chain`);
  if (!trustedDirectory(controlState, provisionerUid) || !trustedDirectory(chainState, provisionerUid) ||
      controlState.dev !== chainState.dev) fail("FIX09_CUSTODY_ANCESTOR");
  const helperState = await lstat(helperPath);
  if (!helperState.isFile() || helperState.isSymbolicLink() || helperState.nlink !== 1 ||
      (helperState.mode & 0o7777) !== 0o550 || String(helperState.uid) !== provisionerUid ||
      helperState.dev !== controlState.dev) fail("FIX09_CUSTODY_HELPER");
  const helperHandle = await open(helperPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  const root = await open(controlRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let child: ChildProcess | undefined;
  try {
    const descriptorState = await helperHandle.stat();
    const rootDescriptorState = await root.stat();
    if (!sameNode(helperState, descriptorState) || !sameNode(controlState, rootDescriptorState)) {
      fail("FIX09_CUSTODY_HELPER");
    }
    const helperBytes = await helperHandle.readFile();
    if (createHash("sha256").update(helperBytes).digest("hex") !== helperSha ||
        !sameNode(helperState, await lstat(helperPath))) fail("FIX09_CUSTODY_HELPER");
    child = spawn(helperPath, [profile], {
      cwd: "/", env: {}, shell: false,
      stdio: ["ignore", "ignore", "pipe", root.fd, "pipe", "pipe"],
    });
    if (!sameNode(helperState, await lstat(helperPath)) ||
        !sameNode(chainState, await lstat(`${controlRoot}/chain`)) ||
        !sameNode(controlState, await lstat(controlRoot))) {
      child.kill("SIGKILL");
      fail("FIX09_CUSTODY_HELPER");
    }
  } finally {
    await helperHandle.close();
    await root.close();
  }
  if (child === undefined) fail("FIX09_CUSTODY_SPAWN");
  const stderr = child.stderr;
  const childStdio = child.stdio as unknown as readonly (
    Readable | Writable | null | undefined
  )[];
  const writer = childStdio[4] as Writable | null | undefined;
  const output = childStdio[5] as Readable | null | undefined;
  if (stderr === null || writer == null || output == null) fail("FIX09_CUSTODY_SPAWN");
  const stderrChunks: Buffer[] = [];
  stderr.on("data", (chunk: Buffer) => {
    if (stderrChunks.reduce((sum, value) => sum + value.length, 0) + chunk.length > 4096)
      child.kill("SIGKILL");
    stderrChunks.push(chunk);
  });
  const exit = childExit(child);
  const reader = new FrameReader(output);
  const bind = binding(profile, authority);
  try {
    await send(writer, frame(0x01, 0, Buffer.concat([
      bind, lp8(authority.api_writer_identity), lp8(authority.runner_writer_identity),
      lp8(authority.scheduler_writer_identity),
    ])));
    const privateFrame = await reader.read(0x81, 0);
    const privateBody = privateFrame.subarray(18);
    if (!privateBody.subarray(0, BIND_LENGTH).equals(bind) || privateBody.length < BIND_LENGTH + 2 + OBSERVED_LENGTH)
      fail("FIX09_CUSTODY_PRIVATE_FRAME");
    const keyLength = privateBody.readUInt16BE(BIND_LENGTH);
    if (keyLength < 1 || keyLength > 256 || privateBody.length !== BIND_LENGTH + 2 + keyLength + OBSERVED_LENGTH)
      fail("FIX09_CUSTODY_PRIVATE_FRAME");
    let privateKey: Buffer | undefined = Buffer.from(
      privateBody.subarray(BIND_LENGTH + 2, BIND_LENGTH + 2 + keyLength),
    );
    privateBody.fill(0, BIND_LENGTH + 2, BIND_LENGTH + 2 + keyLength);
    const initial = observed(privateBody.subarray(BIND_LENGTH + 2 + keyLength));
    const zeroFrame = await reader.read(0x82, 1);
    const zeroBody = zeroFrame.subarray(18);
    if (zeroBody.length !== BIND_LENGTH + 3 || !zeroBody.subarray(0, BIND_LENGTH).equals(bind) ||
        !zeroBody.subarray(BIND_LENGTH).equals(Buffer.from([2, 2, 3]))) fail("FIX09_CUSTODY_ZERO_ACK");

    let nextOrdinal = 1;
    let releaseExtra: Buffer | undefined;
    let terminal = false;
    const checked = async (
    requestOpcode: number,
    responseOpcode: number,
    extra: Buffer = Buffer.alloc(0),
  ): Promise<CustodyObservation> => {
    if (terminal) fail("FIX09_CUSTODY_TERMINAL");
    const requestOrdinal = nextOrdinal;
    await send(writer, frame(requestOpcode, requestOrdinal, Buffer.concat([bind, extra])));
    const value = await reader.read(responseOpcode, requestOrdinal + 1);
    const body = value.subarray(18);
    if (body.length !== BIND_LENGTH + extra.length + OBSERVED_LENGTH ||
        !body.subarray(0, BIND_LENGTH + extra.length).equals(Buffer.concat([bind, extra])))
      fail("FIX09_CUSTODY_CHECK");
    nextOrdinal += 1;
    return observed(body.subarray(BIND_LENGTH + extra.length));
  };

    return Object.freeze({
    observed: initial,
    takePrivateKey(): Buffer {
      const value = privateKey ?? fail("FIX09_CUSTODY_PRIVATE_ONCE");
      privateKey = undefined;
      return value;
    },
    checkReadiness: () => checked(0x02, 0x83),
    checkCommit: (challenge: string) => checked(0x03, 0x84, digestBytes(challenge)),
    async checkRelease(record: ChainedSignerReleaseRecord): Promise<CustodyObservation> {
      const ordinal = Number(record.release_ordinal);
      if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 6) fail("FIX09_CUSTODY_RELEASE");
      releaseExtra = Buffer.concat([Buffer.from([ordinal]), releaseDigest(record)]);
      return checked(0x04, 0x85, releaseExtra);
    },
    async closeRelease(record: ChainedSignerReleaseRecord): Promise<void> {
      if (terminal || releaseExtra === undefined || !releaseExtra.equals(Buffer.concat([
        Buffer.from([Number(record.release_ordinal)]), releaseDigest(record),
      ]))) fail("FIX09_CUSTODY_RELEASE");
      terminal = true;
      await send(writer, frame(0x06, 4, Buffer.concat([bind, releaseExtra])));
      writer.end();
      const closed = await reader.read(0x86, 5);
      const body = closed.subarray(18);
      if (!body.equals(Buffer.concat([bind, Buffer.from([7, 1])]))) fail("FIX09_CUSTODY_CLOSED_ACK");
      await reader.exactEof();
      const childResult = await exit;
      if (Buffer.concat(stderrChunks).length !== 0 || childResult.code !== 0 || childResult.signal !== null)
        fail("FIX09_CUSTODY_EXIT");
    },
    async abort(): Promise<void> {
      if (terminal) fail("FIX09_CUSTODY_TERMINAL");
      terminal = true;
      privateKey?.fill(0); privateKey = undefined;
      await send(writer, frame(0x05, nextOrdinal, bind));
      writer.end();
      await reader.exactEof();
      const childResult = await exit;
      if (Buffer.concat(stderrChunks).length !== 0 || childResult.code !== 0 || childResult.signal !== null)
        fail("FIX09_CUSTODY_EXIT");
    },
    });
  } catch (error) {
    writer.destroy(); output.destroy(); child.kill("SIGKILL");
    await exit.catch(() => undefined);
    throw error;
  }
}
