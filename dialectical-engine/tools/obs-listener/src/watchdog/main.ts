import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { createPrivateKey, createPublicKey, randomUUID, type KeyObject } from "node:crypto";
import { isAbsolute, join, normalize } from "node:path";

import {
  verifyActivationDocument,
  verifyAuditSnapshot,
  verifyPublicKeyring,
  type AuditVerification,
  type VerificationOutcome,
  type VerifiedActivation,
  type VerifiedRecoveryCheckpoint,
  canonicalJson,
  keyIdFromPublicKey,
} from "@debateai/obs-capture/chain/verify";
import {
  appendWitnessRecord,
  completeWitnessRecord,
  verifyWitnessJournal,
  type CompletedWitnessRecord,
  type UnsignedWitnessRecord,
  type WitnessAuthorization,
  type WitnessJournalState,
  type WitnessRecovery,
} from "@debateai/obs-capture/chain/witness";

import {
  createWatchdogDatabase,
  type WatchdogDatabase,
  type WatchdogDatabaseSnapshot,
  type WatchdogHealthCode,
  type WatchdogHealthSignal,
} from "./database.js";

const POSITIVE = /^[1-9][0-9]*$/u;
const NONNEGATIVE = /^(?:0|[1-9][0-9]*)$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_PUBLIC_BYTES = 1_048_576n;
const MAX_PRIVATE_KEY_BYTES = 4_096n;
const MAX_JOURNAL_BYTES = 16_777_216n;

export type WatchdogColdStartCode =
  | "ACTIVATION_INVALID_NO_WITNESS"
  | "WITNESS_JOURNAL_INVALID_NO_APPEND"
  | "WITNESS_KEY_UNAUTHORIZED_NO_APPEND";

export class WatchdogColdStartError extends Error {
  readonly code: WatchdogColdStartCode;
  constructor(code: WatchdogColdStartCode) {
    super(code);
    this.name = "WatchdogColdStartError";
    this.code = code;
  }
}

export interface WatchdogConfig {
  readonly databaseUrl: string;
  readonly controlRoot: string;
  readonly cycleIntervalMs: number;
  readonly daemonHeartbeatStaleMs: number;
  readonly cursorLagLimit: string;
  readonly publicOwnerUid: number;
  readonly publicGroupGid: number;
  readonly watchdogUid: number;
  readonly watchdogGid: number;
}

export interface WatchdogPorts {
  readonly database?: WatchdogDatabase;
  readonly now?: () => Date;
  readonly cycleId?: () => string;
  readonly transitionAuthorization?: () => WitnessAuthorization | null;
  readonly report?: (value: WatchdogCycleReport) => void;
  readonly fatal?: (error: unknown) => void;
}

export interface WatchdogCycleReport {
  readonly chain: VerificationOutcome;
  readonly heartbeat: Readonly<{ state: "HEALTHY" | "MISSING" | "STALE"; age_ms: string | null }>;
  readonly cursor: Readonly<{ state: "CURRENT" | "LAGGING" | "UNAVAILABLE"; lag: string | null }>;
  readonly health: WatchdogHealthSignal;
  readonly health_persisted: boolean;
  readonly witness: Readonly<{ sequence: string; hash: string; appended: true }>;
}

export interface WatchdogControl {
  cycle(): Promise<WatchdogCycleReport>;
  start(): Promise<WatchdogCycleReport>;
  stop(): Promise<void>;
}

interface RuntimeState {
  readonly activation: VerifiedActivation;
  readonly activationBytes: Buffer;
  readonly custodianRootBytes: Buffer;
  journal: WitnessJournalState;
  privateKey: KeyObject;
}

function fail(code: string): never {
  throw new TypeError(code);
}

function integer(value: string | undefined, pattern: RegExp, code: string): number {
  if (value === undefined || !pattern.test(value)) fail(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(code);
  return parsed;
}

function absolute(value: string | undefined, code: string): string {
  if (value === undefined || !isAbsolute(value) || normalize(value) !== value || value === "/") fail(code);
  return value;
}

export function readWatchdogConfig(environment: Readonly<Record<string, string | undefined>>): WatchdogConfig {
  const databaseUrl = environment.OBS_WATCHDOG_DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() !== databaseUrl || databaseUrl.length === 0) fail("FIX09_WATCHDOG_CONFIG");
  const cursorLagLimit = environment.OBS_WATCHDOG_CURSOR_LAG_LIMIT;
  if (cursorLagLimit === undefined || !NONNEGATIVE.test(cursorLagLimit)) fail("FIX09_WATCHDOG_CONFIG");
  return Object.freeze({
    databaseUrl,
    controlRoot: absolute(environment.OBS_CONTROL_DIR, "FIX09_WATCHDOG_CONFIG"),
    cycleIntervalMs: integer(environment.OBS_WATCHDOG_INTERVAL_MS, POSITIVE, "FIX09_WATCHDOG_CONFIG"),
    daemonHeartbeatStaleMs: integer(environment.OBS_WATCHDOG_HEARTBEAT_STALE_MS, POSITIVE, "FIX09_WATCHDOG_CONFIG"),
    cursorLagLimit,
    publicOwnerUid: integer(environment.V_PROVISIONER_UID, NONNEGATIVE, "FIX09_WATCHDOG_CONFIG"),
    publicGroupGid: integer(environment.OBS_CHAIN_PUBLIC_GID, NONNEGATIVE, "FIX09_WATCHDOG_CONFIG"),
    watchdogUid: integer(environment.WATCHDOG_UID, NONNEGATIVE, "FIX09_WATCHDOG_CONFIG"),
    watchdogGid: integer(environment.WATCHDOG_GID, NONNEGATIVE, "FIX09_WATCHDOG_CONFIG"),
  });
}

function exactMode(value: bigint, expected: number): boolean {
  return Number(value & 0o777n) === expected;
}

interface FileAuthority {
  readonly owner: number;
  readonly group: number;
  readonly mode: number;
}

interface TrustedLayout {
  readonly chainDevice: bigint;
  readonly keysDevice: bigint;
  readonly witnessDevice: bigint;
}

function readTrustedFile(
  path: string,
  authorities: readonly FileAuthority[],
  parentDevice: bigint,
  maximumBytes: bigint,
): Buffer {
  const before = lstatSync(path, { bigint: true });
  const authorized = authorities.some(({ owner, group, mode }) =>
    before.uid === BigInt(owner) && before.gid === BigInt(group) && exactMode(before.mode, mode));
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.dev !== parentDevice ||
      before.size > maximumBytes || !authorized) fail("FIX09_PUBLIC_MATERIAL");
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.nlink !== 1n ||
        opened.uid !== before.uid || opened.gid !== before.gid || opened.mode !== before.mode ||
        opened.size !== before.size || opened.size > maximumBytes) fail("FIX09_PUBLIC_MATERIAL");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (after.ino !== opened.ino || after.dev !== opened.dev || after.size !== opened.size ||
        after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs) fail("FIX09_PUBLIC_MATERIAL");
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function validateAncestors(path: string): void {
  let current = "/";
  for (const component of path.slice(1).split("/")) {
    current = join(current, component);
    const value = lstatSync(current, { bigint: true });
    if (!value.isDirectory() || value.isSymbolicLink() || (value.mode & 0o022n) !== 0n) fail("FIX09_PUBLIC_MATERIAL");
  }
}

function validateRoot(config: WatchdogConfig): TrustedLayout {
  if (realpathSync(config.controlRoot) !== config.controlRoot) fail("FIX09_PUBLIC_MATERIAL");
  validateAncestors(config.controlRoot);
  const root = lstatSync(config.controlRoot, { bigint: true });
  const chain = lstatSync(join(config.controlRoot, "chain"), { bigint: true });
  const keys = lstatSync(join(config.controlRoot, "keys"), { bigint: true });
  const witness = lstatSync(join(config.controlRoot, "witness"), { bigint: true });
  if (!root.isDirectory() || root.isSymbolicLink() || !exactMode(root.mode, 0o751) || root.uid !== BigInt(config.publicOwnerUid) || root.gid !== BigInt(config.publicGroupGid) ||
      !chain.isDirectory() || chain.isSymbolicLink() || !exactMode(chain.mode, 0o750) || chain.uid !== root.uid || chain.gid !== root.gid ||
      !keys.isDirectory() || keys.isSymbolicLink() || !exactMode(keys.mode, 0o711) || keys.uid !== BigInt(config.publicOwnerUid) ||
      !witness.isDirectory() || witness.isSymbolicLink() || !exactMode(witness.mode, 0o700) || witness.uid !== BigInt(config.watchdogUid) || witness.gid !== BigInt(config.watchdogGid)) {
    fail("FIX09_PUBLIC_MATERIAL");
  }
  return Object.freeze({ chainDevice: chain.dev, keysDevice: keys.dev, witnessDevice: witness.dev });
}

function readPublic(config: WatchdogConfig): { readonly root: Buffer; readonly activation: Buffer } {
  const layout = validateRoot(config);
  const shared = Object.freeze([{ owner: config.publicOwnerUid, group: config.publicGroupGid, mode: 0o440 }]);
  return Object.freeze({
    root: readTrustedFile(join(config.controlRoot, "chain", "custodian-root.spki"), shared, layout.chainDevice, MAX_PUBLIC_BYTES),
    activation: readTrustedFile(join(config.controlRoot, "chain", "activation.json"), shared, layout.chainDevice, MAX_PUBLIC_BYTES),
  });
}

function readPrivateKey(config: WatchdogConfig): KeyObject {
  const path = join(config.controlRoot, "keys", "watchdog-witness.pk8");
  const layout = validateRoot(config);
  const bytes = readTrustedFile(path,
    Object.freeze([{ owner: config.watchdogUid, group: config.watchdogGid, mode: 0o600 }]),
    layout.keysDevice, MAX_PRIVATE_KEY_BYTES);
  try {
    const key = createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
    if (key.asymmetricKeyType !== "ed25519" || !(key.export({ format: "der", type: "pkcs8" }) as Buffer).equals(bytes)) fail("FIX09_WITNESS_KEY");
    return key;
  } catch {
    return fail("FIX09_WITNESS_KEY");
  } finally {
    bytes.fill(0);
  }
}

function readJournal(config: WatchdogConfig): Buffer {
  const layout = validateRoot(config);
  return readTrustedFile(join(config.controlRoot, "witness", "watchdog-chain.jsonl"),
    Object.freeze([{ owner: config.watchdogUid, group: config.watchdogGid, mode: 0o600 }]),
    layout.witnessDevice, MAX_JOURNAL_BYTES);
}

function readKeyring(config: WatchdogConfig): Buffer {
  try {
    const layout = validateRoot(config);
    return readTrustedFile(join(config.controlRoot, "chain", "public-keyring.json"), Object.freeze([
      { owner: config.publicOwnerUid, group: config.publicGroupGid, mode: 0o440 },
      { owner: config.watchdogUid, group: config.watchdogGid, mode: 0o400 },
    ]), layout.chainDevice, MAX_PUBLIC_BYTES);
  } catch {
    return fail("FIX09_PUBLIC_MATERIAL");
  }
}

function activationMatchesDatabase(activation: VerifiedActivation, snapshot: WatchdogDatabaseSnapshot): boolean {
  const database = snapshot.activation;
  return database !== null && database.protocol === "obs-audit-chain/v1" &&
    database.activation_id === activation.activationId && database.activated_at === activation.activatedAt &&
    database.occurrence_legacy_max_seq === activation.occurrenceLegacyMaxSeq &&
    database.occurrence_legacy_count === activation.occurrenceLegacyCount &&
    database.occurrence_legacy_digest === activation.occurrenceLegacyDigest &&
    database.agent_action_legacy_max_seq === activation.agentActionLegacyMaxSeq &&
    database.agent_action_legacy_count === activation.agentActionLegacyCount &&
    database.agent_action_legacy_digest === activation.agentActionLegacyDigest &&
    database.initial_public_keyring_sha256 === activation.publicKeyringSha256 &&
    database.activation_manifest_sha256 === activation.manifestSha256 && database.created_by_custodian_id === "V";
}

function unavailableVerification(
  activation: VerifiedActivation,
  reason: "DATABASE_UNAVAILABLE" | "PUBLIC_MATERIAL_UNAVAILABLE",
  recovery: WitnessRecovery = Object.freeze({ epoch: "1", latest_recovery_id: null, suspect_range_count: "0" }),
): AuditVerification {
  const legacyRow = (count: string, max_seq: string, digest: string) => Object.freeze({ status: "LEGACY_WITNESSED_UNVERIFIED" as const, count, max_seq, digest });
  return Object.freeze({ result: "VERIFY_UNAVAILABLE", reason, heads: Object.freeze([]),
    legacy: Object.freeze({ occurrence: legacyRow(activation.occurrenceLegacyCount, activation.occurrenceLegacyMaxSeq, activation.occurrenceLegacyDigest),
      agent_action: legacyRow(activation.agentActionLegacyCount, activation.agentActionLegacyMaxSeq, activation.agentActionLegacyDigest) }),
    snapshot: Object.freeze({ snapshot_text: null, occurrence_high_water: null, agent_action_high_water: null }),
    recovery }) as AuditVerification;
}

function keyringFailure(
  activation: VerifiedActivation,
  snapshot: WatchdogDatabaseSnapshot,
  reason: "KEYRING_FORMAT" | "KEYRING_SIGNATURE" | "KEYRING_CONTINUITY" | "RECOVERY_INVALID",
  recovery: WitnessRecovery,
): AuditVerification {
  const unavailable = unavailableVerification(activation, "PUBLIC_MATERIAL_UNAVAILABLE", recovery);
  return Object.freeze({ ...unavailable, result: "KEYRING_INVALID", reason,
    snapshot: Object.freeze({ snapshot_text: snapshot.audit.snapshotText,
      occurrence_high_water: snapshot.audit.occurrenceHighWater, agent_action_high_water: snapshot.audit.agentActionHighWater }) }) as AuditVerification;
}

function mapKeyringError(error: unknown): "KEYRING_FORMAT" | "KEYRING_SIGNATURE" | "KEYRING_CONTINUITY" | "RECOVERY_INVALID" {
  const code = error instanceof Error ? error.message : "";
  if (code === "FIX09_KEYRING_SIGNATURE") return "KEYRING_SIGNATURE";
  if (code === "FIX09_KEYRING_CONTINUITY") return "KEYRING_CONTINUITY";
  if (code.startsWith("FIX09_RECOVERY_")) return "RECOVERY_INVALID";
  return "KEYRING_FORMAT";
}

function heartbeat(snapshot: WatchdogDatabaseSnapshot, now: Date, staleMs: number): WatchdogCycleReport["heartbeat"] {
  if (snapshot.daemon.observedAt === null) return Object.freeze({ state: "MISSING", age_ms: null });
  const observed = new Date(snapshot.daemon.observedAt).getTime();
  const age = Math.max(0, now.getTime() - observed);
  return Object.freeze({ state: age > staleMs ? "STALE" : "HEALTHY", age_ms: String(age) });
}

function cursor(snapshot: WatchdogDatabaseSnapshot, limit: string): WatchdogCycleReport["cursor"] {
  const lag = BigInt(snapshot.daemon.latestOccurrenceSeq) - BigInt(snapshot.daemon.cursorOccurrenceSeq);
  const normalized = lag < 0n ? 0n : lag;
  return Object.freeze({ state: normalized > BigInt(limit) ? "LAGGING" : "CURRENT", lag: normalized.toString() });
}

function healthSignal(chain: VerificationOutcome, heartbeatState: WatchdogCycleReport["heartbeat"], cursorState: WatchdogCycleReport["cursor"], observedAt: string): WatchdogHealthSignal {
  let detailCode: WatchdogHealthCode = "NONE";
  if (chain.result !== "VERIFIED" && chain.result !== "VERIFIED_WITH_RECOVERY") detailCode = chain.result;
  else if (heartbeatState.state === "MISSING") detailCode = "DAEMON_HEARTBEAT_MISSING";
  else if (heartbeatState.state === "STALE") detailCode = "DAEMON_HEARTBEAT_STALE";
  else if (cursorState.state === "LAGGING") detailCode = "CURSOR_LAG";
  return Object.freeze({ state: detailCode === "NONE" ? "PASS" : "TRIPPED", detailCode, observedAt });
}

export function createWatchdog(config: WatchdogConfig, ports: WatchdogPorts = {}): WatchdogControl {
  const database = ports.database ?? createWatchdogDatabase(config.databaseUrl);
  const now = ports.now ?? (() => new Date());
  const cycleId = ports.cycleId ?? (() => randomUUID());
  let runtime: RuntimeState | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let serial: Promise<unknown> = Promise.resolve();

  const initialize = async (authorization: WitnessAuthorization | null): Promise<{ readonly state: RuntimeState; readonly snapshot: WatchdogDatabaseSnapshot }> => {
    let publicMaterial: { readonly root: Buffer; readonly activation: Buffer };
    let activation: VerifiedActivation;
    let snapshot: WatchdogDatabaseSnapshot;
    try {
      publicMaterial = readPublic(config);
      activation = verifyActivationDocument(publicMaterial.activation, publicMaterial.root);
      snapshot = await database.readSnapshot();
      if (!activationMatchesDatabase(activation, snapshot)) throw new TypeError("FIX09_ACTIVATION_PARITY");
    } catch {
      throw new WatchdogColdStartError("ACTIVATION_INVALID_NO_WITNESS");
    }
    let journal: WitnessJournalState;
    try { journal = verifyWitnessJournal(readJournal(config), activation); }
    catch { throw new WatchdogColdStartError("WITNESS_JOURNAL_INVALID_NO_APPEND"); }
    let privateKey: KeyObject;
    try {
      privateKey = readPrivateKey(config);
      const privateKeyId = keyIdFromPublicKey(createPublicKey(privateKey));
      if (privateKeyId !== journal.witnessKeyId && (authorization === null || authorization.new_witness_key_id !== privateKeyId ||
          authorization.prior_witness_key_id !== journal.witnessKeyId || authorization.prior_witness_seq !== (BigInt(journal.nextSequence) - 1n).toString() ||
          authorization.prior_witness_hash !== journal.priorWitnessHash || authorization.min_witness_seq !== journal.nextSequence)) throw new TypeError("FIX09_WITNESS_KEY");
    } catch {
      throw new WatchdogColdStartError("WITNESS_KEY_UNAUTHORIZED_NO_APPEND");
    }
    const state: RuntimeState = { activation, activationBytes: publicMaterial.activation,
      custodianRootBytes: publicMaterial.root, journal, privateKey };
    runtime = state;
    return Object.freeze({ state, snapshot });
  };

  const cycle = async (): Promise<WatchdogCycleReport> => {
    const authorization = ports.transitionAuthorization?.() ?? null;
    const initialized = runtime === undefined ? await initialize(authorization) : undefined;
    const state = initialized?.state ?? runtime!;
    const observed = now();
    const observedAt = observed.toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(observedAt)) fail("FIX09_WATCHDOG_CLOCK");
    let snapshot = initialized?.snapshot;
    let publicAvailable = true;
    if (initialized === undefined) {
      try {
        const current = readPublic(config);
        if (!current.root.equals(state.custodianRootBytes) || !current.activation.equals(state.activationBytes)) throw new TypeError("FIX09_ACTIVATION_REPLACED");
      } catch { publicAvailable = false; }
      try { snapshot = await database.readSnapshot(); }
      catch { snapshot = undefined; }
      if (snapshot !== undefined && !activationMatchesDatabase(state.activation, snapshot)) publicAvailable = false;
    }
    let journal: WitnessJournalState;
    try {
      journal = verifyWitnessJournal(readJournal(config), state.activation);
      if (journal.count !== state.journal.count || journal.priorWitnessHash !== state.journal.priorWitnessHash) fail("FIX09_JOURNAL_ROLLBACK");
      let key = state.privateKey;
      let keyId = keyIdFromPublicKey(createPublicKey(key));
      if (authorization !== null) {
        key = readPrivateKey(config);
        keyId = keyIdFromPublicKey(createPublicKey(key));
        if (authorization.new_witness_key_id !== keyId ||
          authorization.prior_witness_key_id !== journal.witnessKeyId || authorization.prior_witness_seq !== (BigInt(journal.nextSequence) - 1n).toString() ||
          authorization.prior_witness_hash !== journal.priorWitnessHash || authorization.min_witness_seq !== journal.nextSequence) fail("FIX09_WITNESS_KEY");
      } else if (keyId !== journal.witnessKeyId) {
        fail("FIX09_WITNESS_KEY");
      }
      state.privateKey = key;
    } catch (error) {
      if (error instanceof WatchdogColdStartError) throw error;
      throw new TypeError("FIX09_WITNESS_RUNTIME");
    }
    let verification: AuditVerification;
    let keyringGeneration: string | null = null;
    let keyringSha256: string | null = null;
    let checkpoints: readonly VerifiedRecoveryCheckpoint[] | undefined;
    if (snapshot === undefined) {
      verification = unavailableVerification(state.activation, "DATABASE_UNAVAILABLE", journal.recovery);
    } else if (!publicAvailable) {
      verification = unavailableVerification(state.activation, "PUBLIC_MATERIAL_UNAVAILABLE", journal.recovery);
    } else {
      try {
        const keyringBytes = readKeyring(config);
        const keyring = verifyPublicKeyring(keyringBytes, state.activation,
          journal.keyringGeneration === null || journal.keyringSha256 === null ? undefined : { generation: journal.keyringGeneration, digest: journal.keyringSha256 });
        keyringGeneration = keyring.generation;
        keyringSha256 = keyring.digest;
        checkpoints = keyring.recoveryCheckpoints;
        const strictlyVerifiedJournal = verifyWitnessJournal(readJournal(config), state.activation, checkpoints);
        if (strictlyVerifiedJournal.count !== journal.count || strictlyVerifiedJournal.priorWitnessHash !== journal.priorWitnessHash) fail("FIX09_WITNESS_CONTINUITY");
        verification = verifyAuditSnapshot(snapshot.audit, state.activation, keyring, {
          occurrenceHighWater: journal.occurrenceHighWater, agentActionHighWater: journal.agentActionHighWater, heads: journal.heads,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "FIX09_PUBLIC_MATERIAL") {
          verification = unavailableVerification(state.activation, "PUBLIC_MATERIAL_UNAVAILABLE", journal.recovery);
        } else {
          verification = keyringFailure(state.activation, snapshot, mapKeyringError(error), journal.recovery);
        }
      }
    }
    const unsigned: UnsignedWitnessRecord = Object.freeze({
      activation_manifest_sha256: state.activation.manifestSha256,
      cycle_id: cycleId(), heads: verification.heads,
      keyring_generation: keyringGeneration, keyring_sha256: keyringSha256,
      legacy: verification.legacy, observed_at: observedAt,
      prior_witness_hash: journal.priorWitnessHash, reason: verification.reason,
      recovery: verification.recovery, result: verification.result, schema: "obs-chain-witness/v1",
      snapshot: verification.snapshot, witness_authorization: authorization,
      witness_key_id: keyIdFromPublicKey(createPublicKey(state.privateKey)), witness_seq: journal.nextSequence,
    });
    const completed: CompletedWitnessRecord = completeWitnessRecord(unsigned, state.privateKey);
    const next = appendWitnessRecord(join(config.controlRoot, "witness", "watchdog-chain.jsonl"), completed, state.activation,
      { controlRoot: config.controlRoot, ownerUid: config.watchdogUid, ownerGid: config.watchdogGid },
      { count: journal.count, priorWitnessHash: journal.priorWitnessHash }, checkpoints);
    state.journal = next;
    const heartbeatState = snapshot === undefined ? Object.freeze({ state: "MISSING" as const, age_ms: null }) : heartbeat(snapshot, observed, config.daemonHeartbeatStaleMs);
    const cursorState = snapshot === undefined ? Object.freeze({ state: "UNAVAILABLE" as const, lag: null }) : cursor(snapshot, config.cursorLagLimit);
    const health = healthSignal(verification, heartbeatState, cursorState, observedAt);
    let healthPersisted = false;
    if (snapshot !== undefined) {
      try { await database.writeHealth(health); healthPersisted = true; }
      catch { healthPersisted = false; }
    }
    return Object.freeze({ chain: Object.freeze({ result: verification.result, reason: verification.reason }),
      heartbeat: heartbeatState, cursor: cursorState, health, health_persisted: healthPersisted,
      witness: Object.freeze({ sequence: completed.witness_seq, hash: completed.witness_hash, appended: true as const }) });
  };

  return Object.freeze({
    cycle,
    async start(): Promise<WatchdogCycleReport> {
      if (timer !== undefined) fail("FIX09_WATCHDOG_ALREADY_RUNNING");
      const first = await cycle();
      ports.report?.(first);
      timer = setInterval(() => {
        serial = serial.then(cycle, cycle).then((value) => { ports.report?.(value); }, (error) => { ports.fatal?.(error); });
      }, config.cycleIntervalMs);
      return first;
    },
    async stop(): Promise<void> {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await serial;
      await database.close();
    },
  });
}

export function coldStartStderr(code: WatchdogColdStartCode): string {
  return `${canonicalJson({ code, exit_code: "78", journal_appended: false, status: "FAIL_CLOSED" })}\n`;
}
