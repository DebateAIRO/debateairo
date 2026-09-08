import { timingSafeEqual } from "node:crypto";

import type { CommandResultRecord, MarkerSample } from "./kill.js";

export interface MutationArm {
  arm(token: string): Readonly<{ ok: true; mutation: "ON" } | { ok: false; code: "MUTATION_AUTH_REJECTED" }>;
  state(): Readonly<{ mutation: "OFF" | "ON"; quickArm: "OFF" | "ON" }>;
}

export function createMutationArm(input: Readonly<{
  custodianToken: string;
  quickArm: "OFF" | "ON";
}>): MutationArm {
  if (Buffer.byteLength(input.custodianToken, "utf8") < 16) {
    throw new TypeError("FIX13_CUSTODIAN_TOKEN");
  }
  let mutation: "OFF" | "ON" = "OFF";
  return Object.freeze({
    arm(token: string) {
      const expected = Buffer.from(input.custodianToken, "utf8");
      const actual = Buffer.from(token, "utf8");
      const authenticated = actual.byteLength === expected.byteLength && timingSafeEqual(expected, actual);
      expected.fill(0);
      actual.fill(0);
      if (!authenticated) return Object.freeze({ ok: false as const, code: "MUTATION_AUTH_REJECTED" as const });
      mutation = "ON";
      return Object.freeze({ ok: true as const, mutation: "ON" as const });
    },
    state() {
      return Object.freeze({ mutation, quickArm: input.quickArm });
    },
  });
}

export interface ArmPort {
  authenticate(): Promise<void>;
  appendIntent(): Promise<void>;
  publishArmed(): Promise<void>;
  removeMarker(name: "CAPTURE_OFF" | "KILL"): Promise<void>;
  ensureMarker(name: "CAPTURE_OFF" | "KILL"): Promise<void>;
  sampleMarkers(): Promise<MarkerSample>;
  appendResult(result: CommandResultRecord): Promise<void>;
}

function record(outcome: string, reason: string, sample: MarkerSample, durable = true): CommandResultRecord {
  return Object.freeze({ outcome, reason, effects: Object.freeze({
    capture_off: sample.captureOff ? "PRESENT" : "ABSENT",
    kill: sample.kill ? "PRESENT" : "ABSENT",
    durability: durable ? "CONFIRMED" : "UNCONFIRMED",
  }) });
}

export async function arm(port: ArmPort): Promise<Readonly<{ exitCode: 0 | 1; output: string }>> {
  try { await port.authenticate(); }
  catch (_error) {
    try {
      await port.appendIntent();
      await port.appendResult(Object.freeze({ outcome: "ARM_AUTH_REJECTED", reason: "AUTHENTICATION",
        effects: Object.freeze({ capture_off: "UNKNOWN", kill: "UNKNOWN", durability: "CONFIRMED" }) }));
    } catch (_error) { /* rejection is emitted only through an already-valid local audit substrate */ }
    return Object.freeze({ exitCode: 1, output: "" });
  }
  try { await port.appendIntent(); } catch (_error) { return Object.freeze({ exitCode: 1, output: "" }); }
  let published = false;
  try {
    await port.publishArmed();
    published = true;
    await port.removeMarker("CAPTURE_OFF");
    await port.removeMarker("KILL");
    const sample = await port.sampleMarkers();
    if (sample.captureOff || sample.kill) throw new Error("FIX10_MARKER_RECHECK");
    await port.appendResult(record("ARM_APPLIED_PENDING_PROOF", "NONE", sample));
    return Object.freeze({ exitCode: 0, output: "ARMED_PENDING_PROOF\n" });
  } catch (_error) {
    if (!published) return Object.freeze({ exitCode: 1, output: "" });
    try { await port.ensureMarker("CAPTURE_OFF"); } catch (_error) { /* report exact observed rollback */ }
    try { await port.ensureMarker("KILL"); } catch (_error) { /* report exact observed rollback */ }
    let sample: MarkerSample;
    try { sample = await port.sampleMarkers(); } catch (_error) { sample = { captureOff: false, kill: false }; }
    const complete = sample.captureOff && sample.kill;
    try {
      await port.appendResult(record(complete ? "ARM_FAILED_ROLLED_BACK" : "ARM_ROLLBACK_INCOMPLETE",
        complete ? "ROLLBACK" : "ROOT_RECHECK", sample, complete));
    } catch (_error) { /* never claim success */ }
    return Object.freeze({ exitCode: 1, output: "" });
  }
}

export async function runArmEntry(): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  const { createPublicKey, randomBytes, randomUUID } = await import("node:crypto");
  const { userInfo } = await import("node:os");
  const { mintArmed } = await import("./armed-token.js");
  const { parseControlConfig } = await import("./config.js");
  const { appendControlHistory, createControlRoot, markerState, readControlFile, removeMarker, replaceControlJson } = await import("./control-root.js");
  const { withObsctlLock } = await import("./lock.js");
  const history = await import("./local-history.js");
  const config = parseControlConfig(process.env);
  if (process.getuid?.() !== config.principals.obsctl.uid) throw new TypeError("FIX10_PRINCIPAL");
  const username = userInfo().username;
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(username)) throw new TypeError("FIX10_ACTOR");
  const root = await createControlRoot({ root: config.root, ownerUid: config.principals.obsctl.uid,
    ownerGid: config.principals.publicReadGid, postgresDeviceId: config.postgresDeviceId });
  const pkcs8 = await readControlFile(root, "keys/obsctl-outbox.pk8", 0o600, 256);
  const signer = history.deriveEd25519SigningKeyId(pkcs8).key; pkcs8.fill(0);
  const hmac = await readControlFile(root, "keys/armed-marker.hmac", 0o600, 32);
  if (hmac.length !== 32) { hmac.fill(0); throw new TypeError("FIX10_ARMED_KEY"); }
  try {
    return await withObsctlLock(root, async () => {
      let outbox = history.verifyOutbox((await readControlFile(root, "outbox/obsctl-actions.jsonl", 0o600)).toString("utf8"), createPublicKey(signer));
      let journal = history.verifyJournal((await readControlFile(root, "witness/obsctl-actions.jsonl", 0o600)).toString("utf8"), createPublicKey(signer));
      const identity = { action_kind: "ARM" as const, actor: `obsctl:${username}`, invocation_id: randomUUID(), requested_at_ms: String(Date.now()) };
      let intent: import("./local-history.js").CompletedOutboxRecord | undefined;
      const result = await arm({
        async authenticate() {
          const credential = process.env.OBS_POLICY_CUSTODIAN_TOKEN;
          if (credential === undefined || Buffer.byteLength(credential) < 16) throw new TypeError("FIX10_AUTHENTICATION");
          const credentialBuffer = Buffer.from(credential);
          credentialBuffer.fill(0);
        },
        async appendIntent() { intent = history.createOutboxRecord(outbox.at(-1), { ...identity, action_parameters: { private_key_id: null, public_input_sha256: null, writer_identity: null } }, signer); await appendControlHistory(root, "outbox/obsctl-actions.jsonl", Buffer.from(history.encodeOutboxLine(intent))); outbox = Object.freeze([...outbox, intent]); },
        async publishArmed() { const token = mintArmed({ issuedAtMs: Date.now(), stalenessMs: config.armedTokenStalenessMs, nonce: randomBytes(16) }, hmac); await replaceControlJson(root, "ARMED", token.bytes, 0o600); },
        async removeMarker(name) { await removeMarker(root, name); }, async ensureMarker(name) { await root.ensureMarker(name); },
        async sampleMarkers() { return { captureOff: await markerState(root, "CAPTURE_OFF") === "PRESENT", kill: await markerState(root, "KILL") === "PRESENT" }; },
        async appendResult(command) { const next = history.createJournalRecord(journal.at(-1), { ...identity, action_ref: intent?.action_ref ?? history.deriveActionRef(identity), database_action_id: null,
          effects: { ...command.effects, lifecycle: { activation_manifest_sha256: null, phase: "NOT_APPLICABLE", private_key_id: null, public_artifact_sha256: null } },
          event_id: randomUUID(), event_kind: "COMMAND_RESULT", outbox_hash: intent?.outbox_hash ?? null, outcome: command.outcome,
          reason: command.reason, recorded_at_ms: String(Date.now()) }, signer); await appendControlHistory(root, "witness/obsctl-actions.jsonl", Buffer.from(history.encodeJournalLine(next))); journal = Object.freeze([...journal, next]); },
      });
      return Object.freeze({ exitCode: result.exitCode, stdout: result.output, stderr: "" });
    });
  } finally { hmac.fill(0); }
}

export async function runMutationArmEntry(): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  // Mutation authority lives in the daemon-owned executor. A standalone CLI
  // process cannot persist an in-memory arm across a daemon restart and is not
  // allowed to manufacture an ARMED/control artifact.
  return Object.freeze({ exitCode: 1, stdout: "", stderr: "FIX13_EXECUTOR_REQUIRED:arm-mutation\n" });
}
