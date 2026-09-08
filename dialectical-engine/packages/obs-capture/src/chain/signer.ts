import {
  createPrivateKey,
  createPublicKey,
  sign as ed25519Sign,
  type KeyObject,
} from "node:crypto";

import { canonicalJson, keyIdFromPublicKey } from "./canonical.js";
import {
  openPinnedPrivateKey,
  type CustodyObservation,
  type NativeCustodySession,
} from "./private-key-helper.js";

export const CHAIN_SIGNER_PROFILES = Object.freeze([
  "api_occurrence",
  "runner_occurrence",
  "scheduler_occurrence",
  "daemon_action",
  "obsctl_action",
] as const);

export type ChainedWriterSignerProfile = typeof CHAIN_SIGNER_PROFILES[number];

type InternalProfile = ChainedWriterSignerProfile | "watchdog_witness";

export interface SignerAuthority {
  readonly activation_id: string;
  readonly activation_manifest_sha256: string;
  readonly api_writer_identity: string;
  readonly barrier_id: string;
  readonly inventory_id: string;
  readonly inventory_sha256: string;
  readonly nonce: string;
  readonly principal_gid: string;
  readonly principal_uid: string;
  readonly profile_map_sha256: string;
  readonly public_keyring_sha256: string;
  readonly runner_writer_identity: string;
  readonly scheduler_writer_identity: string;
  readonly session_id: string;
}

export interface ChainedSignerReadiness {
  readonly [key: string]: unknown;
  readonly attestation_signature_base64: string;
  readonly derived_key_id: string;
  readonly schema: "obs-chain-signer-readiness/v2";
}

export interface ChainedSignerCommitCheck {
  readonly [key: string]: unknown;
  readonly commit_check_signature_base64: string;
  readonly schema: "obs-chain-signer-commit-check/v1";
}

export interface ChainedSignerReleaseRecord {
  readonly activation_manifest_sha256: string;
  readonly barrier_id: string;
  readonly nonce: string;
  readonly public_keyring_sha256: string;
  readonly release_ordinal: string;
  readonly schema: "obs-chain-signer-release/v1";
  readonly session_id: string;
  readonly slot: ChainedWriterSignerProfile;
}

declare const RELEASED_SIGNER: unique symbol;
export interface ReleasedChainedSigner {
  readonly [RELEASED_SIGNER]: never;
}

export interface PinnedSignerSession {
  readonly attestation: ChainedSignerReadiness;
  commitCheck(challenge: string): Promise<ChainedSignerCommitCheck>;
  release(record: ChainedSignerReleaseRecord): Promise<ReleasedChainedSigner>;
  abort(): Promise<void>;
}

type SessionState = {
  authority: SignerAuthority;
  commitUsed: boolean;
  custody: NativeCustodySession;
  key: KeyObject;
  keyId: string;
  observation: CustodyObservation;
  profile: ChainedWriterSignerProfile;
  terminal: boolean;
};

type ReleasedState = Readonly<{
  activationManifestSha256: string;
  key: KeyObject;
  keyId: string;
  profile: ChainedWriterSignerProfile;
  source: string;
  table: "occurrence" | "agent_action";
  writerIdentity: string;
}>;

type CustodyFactory = (
  profile: InternalProfile,
  authority: SignerAuthority,
) => Promise<NativeCustodySession>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX32 = /^[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const WRITER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const sessions = new WeakMap<object, SessionState>();
const activeSessions = new Set<PinnedSignerSession>();
const releasedTokens = new WeakMap<object, ReleasedState>();
const releasedPartitions = new Map<string, ReleasedState>();

let configuredAuthority: SignerAuthority | undefined;
let configuredFactory: CustodyFactory = openPinnedPrivateKey;
let preparedProfile: ChainedWriterSignerProfile | undefined;

function fail(code: string): never {
  throw new TypeError(code);
}

function nullRecord(entries: readonly (readonly [string, unknown])[]): Readonly<Record<string, unknown>> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of entries) Object.defineProperty(output, key, { enumerable: true, value });
  return Object.freeze(output);
}

function signedObject(
  entries: readonly (readonly [string, unknown])[],
  signatureField: string,
  signatureDomain: string,
  key: KeyObject,
): Readonly<Record<string, unknown>> {
  const unsigned = nullRecord(entries);
  const message = Buffer.concat([
    Buffer.from(`${signatureDomain}\0`, "utf8"),
    Buffer.from(canonicalJson(unsigned), "utf8"),
  ]);
  const signature = ed25519Sign(null, message, key).toString("base64");
  return nullRecord([...entries, [signatureField, signature]]);
}

function sameObservation(left: CustodyObservation, right: CustodyObservation): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function validateAuthority(value: SignerAuthority): void {
  if (!UUID_V4.test(value.barrier_id) || !UUID_V4.test(value.session_id) || !UUID_V4.test(value.inventory_id)
    || !UUID_V4.test(value.activation_id)) fail("FIX09_SIGNER_AUTHORITY");
  for (const digest of [value.activation_manifest_sha256, value.inventory_sha256, value.nonce,
    value.profile_map_sha256, value.public_keyring_sha256]) if (!HEX32.test(digest)) fail("FIX09_SIGNER_AUTHORITY");
  if (!DECIMAL.test(value.principal_uid) || !DECIMAL.test(value.principal_gid)) fail("FIX09_SIGNER_AUTHORITY");
  for (const identity of [value.api_writer_identity, value.runner_writer_identity,
    value.scheduler_writer_identity]) if (!WRITER.test(identity)) fail("FIX09_SIGNER_AUTHORITY");
}

function profileValues(profile: ChainedWriterSignerProfile, authority: SignerAuthority): Readonly<{
  path: string;
  rowAuthorizations: readonly Readonly<Record<string, unknown>>[];
  source: string;
  table: "occurrence" | "agent_action";
  writerIdentity: string;
}> {
  const occurrence = (writerIdentity: string): ReturnType<typeof profileValues> => Object.freeze({
    path: `chain/private/${writerIdentity}.pk8`,
    rowAuthorizations: Object.freeze([nullRecord([
      ["table", "occurrence"], ["source", "first_party"],
      ["min_chain_seq", "1"], ["max_chain_seq", null],
    ])]),
    source: "first_party", table: "occurrence", writerIdentity,
  });
  if (profile === "api_occurrence") return occurrence(authority.api_writer_identity);
  if (profile === "runner_occurrence") return occurrence(authority.runner_writer_identity);
  if (profile === "scheduler_occurrence") return occurrence(authority.scheduler_writer_identity);
  if (profile === "obsctl_action") return Object.freeze({
    path: "chain/private/obsctl.pk8",
    rowAuthorizations: Object.freeze([nullRecord([
      ["table", "agent_action"], ["source", "ops"],
      ["min_chain_seq", "1"], ["max_chain_seq", null],
    ])]),
    source: "ops", table: "agent_action", writerIdentity: "obsctl",
  });
  return Object.freeze({
    path: "chain/private/fixagent-daemon.pk8",
    rowAuthorizations: Object.freeze(["first_party", "hatchet", "ui_client"].map((source) => nullRecord([
      ["table", "agent_action"], ["source", source],
      ["min_chain_seq", "1"], ["max_chain_seq", null],
    ]))),
    source: "*", table: "agent_action", writerIdentity: "fixagent-daemon",
  });
}

function releaseOrdinal(profile: ChainedWriterSignerProfile): string {
  return String(CHAIN_SIGNER_PROFILES.indexOf(profile) + 1);
}

function loadAuthorityFromEnvironment(): SignerAuthority {
  const read = (name: string): string => process.env[name] ?? fail("FIX09_SIGNER_AUTHORITY_UNAVAILABLE");
  return Object.freeze({
    activation_id: read("OBS_CHAIN_ACTIVATION_ID"),
    activation_manifest_sha256: read("OBS_CHAIN_ACTIVATION_MANIFEST_SHA256"),
    api_writer_identity: read("OBS_CHAIN_API_WRITER_IDENTITY"),
    barrier_id: read("OBS_CHAIN_BARRIER_ID"),
    inventory_id: read("OBS_CHAIN_INVENTORY_ID"),
    inventory_sha256: read("OBS_CHAIN_INVENTORY_SHA256"),
    nonce: read("OBS_CHAIN_NONCE"),
    principal_gid: read("OBS_CHAIN_PRINCIPAL_GID"),
    principal_uid: read("OBS_CHAIN_PRINCIPAL_UID"),
    profile_map_sha256: read("OBS_CHAIN_PROFILE_MAP_SHA256"),
    public_keyring_sha256: read("OBS_CHAIN_PUBLIC_KEYRING_SHA256"),
    runner_writer_identity: read("OBS_CHAIN_RUNNER_WRITER_IDENTITY"),
    scheduler_writer_identity: read("OBS_CHAIN_SCHEDULER_WRITER_IDENTITY"),
    session_id: read("OBS_CHAIN_SESSION_ID"),
  });
}

export async function prepareChainedWriterSigner(
  profile: ChainedWriterSignerProfile,
): Promise<PinnedSignerSession> {
  if (!(CHAIN_SIGNER_PROFILES as readonly unknown[]).includes(profile)) fail("FIX09_SIGNER_PROFILE");
  if (preparedProfile !== undefined) fail("FIX09_SIGNER_ALREADY_PREPARED");
  const authority = configuredAuthority ?? loadAuthorityFromEnvironment();
  validateAuthority(authority);
  const values = profileValues(profile, authority);
  if (
    (profile === "api_occurrence" || profile === "runner_occurrence" || profile === "scheduler_occurrence")
    && process.env.OBS_WRITER_IDENTITY !== undefined
    && process.env.OBS_WRITER_IDENTITY !== values.writerIdentity
  ) fail("FIX09_SIGNER_WRITER_IDENTITY");
  preparedProfile = profile;
  let custody: NativeCustodySession | undefined;
  let key: KeyObject | undefined;
  try {
    custody = await configuredFactory(profile, authority);
    const transfer = custody.takePrivateKey();
    try {
      key = createPrivateKey({ format: "der", key: transfer, type: "pkcs8" });
    } finally {
      transfer.fill(0);
    }
    if (key.asymmetricKeyType !== "ed25519") fail("FIX09_SIGNER_KEY");
    const observation = await custody.checkReadiness();
    if (!sameObservation(custody.observed, observation)) fail("FIX09_SIGNER_PARITY");
    const keyId = keyIdFromPublicKey(createPublicKey(key));
    const readiness = signedObject([
      ["schema", "obs-chain-signer-readiness/v2"],
      ["barrier_id", authority.barrier_id], ["nonce", authority.nonce],
      ["session_id", authority.session_id], ["pid", String(process.pid)],
      ["inventory_id", authority.inventory_id], ["activation_id", authority.activation_id],
      ["activation_manifest_sha256", authority.activation_manifest_sha256],
      ["public_keyring_sha256", authority.public_keyring_sha256], ["slot", profile],
      ["writer_identity", values.writerIdentity], ["relative_pk8_path", values.path],
      ["principal_uid", authority.principal_uid], ["principal_gid", authority.principal_gid],
      ["observed", observation], ["algorithm", "ed25519"], ["derived_key_id", keyId],
      ["row_authorizations", values.rowAuthorizations], ["witness_authorization", null],
      ["attested_at_ms", String(Date.now())], ["signing_key_id", keyId],
    ], "attestation_signature_base64", "obs-chain-signer-readiness-signature/v2", key) as ChainedSignerReadiness;
    let session!: PinnedSignerSession;
    session = Object.freeze({
      attestation: readiness,
      async commitCheck(challenge: string): Promise<ChainedSignerCommitCheck> {
        const state = sessions.get(session as object);
        if (state === undefined || state.terminal) fail("FIX09_SIGNER_TERMINAL");
        if (state.commitUsed) fail("FIX09_SIGNER_COMMIT_ONCE");
        if (!HEX32.test(challenge)) fail("FIX09_SIGNER_COMMIT_CHALLENGE");
        state.commitUsed = true;
        const current = await state.custody.checkCommit(challenge);
        if (!sameObservation(state.observation, current)) fail("FIX09_SIGNER_PARITY");
        return signedObject([
          ["schema", "obs-chain-signer-commit-check/v1"],
          ["barrier_id", state.authority.barrier_id], ["nonce", state.authority.nonce],
          ["session_id", state.authority.session_id], ["pid", String(process.pid)],
          ["slot", state.profile],
          ["activation_manifest_sha256", state.authority.activation_manifest_sha256],
          ["commit_challenge", challenge], ["observed", current],
          ["pinned_key_id", state.keyId], ["checked_at_ms", String(Date.now())],
        ], "commit_check_signature_base64", "obs-chain-signer-commit-check-signature/v1", state.key) as ChainedSignerCommitCheck;
      },
      async release(record: ChainedSignerReleaseRecord): Promise<ReleasedChainedSigner> {
        const state = sessions.get(session as object);
        if (state === undefined || state.terminal) fail("FIX09_SIGNER_TERMINAL");
        if (!state.commitUsed) fail("FIX09_SIGNER_COMMIT_REQUIRED");
        const expected = nullRecord([
          ["schema", "obs-chain-signer-release/v1"],
          ["barrier_id", state.authority.barrier_id], ["nonce", state.authority.nonce],
          ["session_id", state.authority.session_id], ["slot", state.profile],
          ["activation_manifest_sha256", state.authority.activation_manifest_sha256],
          ["public_keyring_sha256", state.authority.public_keyring_sha256],
          ["release_ordinal", releaseOrdinal(state.profile)],
        ]);
        if (canonicalJson(record) !== canonicalJson(expected)) fail("FIX09_SIGNER_RELEASE_RECORD");
        const current = await state.custody.checkRelease(record);
        if (!sameObservation(state.observation, current)) fail("FIX09_SIGNER_PARITY");
        await state.custody.closeRelease(record);
        state.terminal = true;
        activeSessions.delete(session);
        const values = profileValues(state.profile, state.authority);
        const released = Object.freeze(Object.create(null)) as ReleasedChainedSigner;
        const releasedState = Object.freeze({
          activationManifestSha256: state.authority.activation_manifest_sha256,
          key: state.key, keyId: state.keyId, profile: state.profile, source: values.source,
          table: values.table, writerIdentity: values.writerIdentity,
        });
        releasedTokens.set(released as object, releasedState);
        if (values.source === "*") {
          for (const source of ["first_party", "hatchet", "ui_client"])
            releasedPartitions.set(`${values.table}\0${source}\0${values.writerIdentity}`, releasedState);
        } else releasedPartitions.set(`${values.table}\0${values.source}\0${values.writerIdentity}`, releasedState);
        return released;
      },
      async abort(): Promise<void> {
        const state = sessions.get(session as object);
        if (state === undefined || state.terminal) fail("FIX09_SIGNER_TERMINAL");
        state.terminal = true;
        activeSessions.delete(session);
        await state.custody.abort();
      },
    });
    sessions.set(session as object, {
      authority, commitUsed: false, custody, key, keyId,
      observation, profile, terminal: false,
    });
    activeSessions.add(session);
    return session;
  } catch (error) {
    preparedProfile = undefined;
    if (custody !== undefined) await custody.abort().catch(() => undefined);
    throw error;
  }
}

export function getReleasedSigner(
  table: "occurrence" | "agent_action",
  source: string,
  writerIdentity: string,
  activationManifestSha256: Buffer,
): Readonly<{ keyId: string; sign(message: Uint8Array): Buffer }> {
  if (!Buffer.isBuffer(activationManifestSha256) || activationManifestSha256.length !== 32) {
    fail("FIX09_SIGNER_ACTIVATION");
  }
  const value = releasedPartitions.get(`${table}\0${source}\0${writerIdentity}`)
    ?? fail("FIX09_SIGNER_UNAVAILABLE");
  if (value.activationManifestSha256 !== activationManifestSha256.toString("hex")) {
    fail("FIX09_SIGNER_ACTIVATION");
  }
  return Object.freeze({
    keyId: value.keyId,
    sign(message: Uint8Array): Buffer { return ed25519Sign(null, Buffer.from(message), value.key); },
  });
}

export const getReleasedSignerForTest = getReleasedSigner;

export function installReleasedSignerForTest(
  table: "occurrence" | "agent_action",
  source: string,
  writerIdentity: string,
  key: KeyObject,
  activationManifestSha256: string,
): void {
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") fail("FIX09_SIGNER_KEY");
  if (!HEX32.test(activationManifestSha256)) fail("FIX09_SIGNER_ACTIVATION");
  const keyId = keyIdFromPublicKey(createPublicKey(key));
  releasedPartitions.set(`${table}\0${source}\0${writerIdentity}`, Object.freeze({
    activationManifestSha256,
    key, keyId, profile: table === "occurrence" ? "api_occurrence" : "daemon_action",
    source, table, writerIdentity,
  }));
}

export function assertPreActivationSignerAbsent(): void {
  if (preparedProfile !== undefined || releasedPartitions.size !== 0 ||
      process.env.OBS_CHAIN_ACTIVATION_MANIFEST_SHA256 !== undefined) {
    fail("FIX09_SIGNER_HALF_ACTIVATED");
  }
}

export function configureSignerAuthorityForTest(
  authority: SignerAuthority,
  factory: CustodyFactory,
): void {
  if (configuredAuthority !== undefined || preparedProfile !== undefined) fail("FIX09_SIGNER_ALREADY_CONFIGURED");
  configuredAuthority = authority;
  configuredFactory = factory;
}

export async function abortAllPreparedSignersForTest(): Promise<void> {
  for (const session of [...activeSessions]) await session.abort().catch(() => undefined);
}

export function resetSignerStateForTest(): void {
  if (activeSessions.size !== 0) fail("FIX09_SIGNER_ACTIVE");
  configuredAuthority = undefined;
  configuredFactory = openPinnedPrivateKey;
  preparedProfile = undefined;
  releasedPartitions.clear();
}
