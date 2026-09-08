export interface MarkerSample { readonly captureOff: boolean; readonly kill: boolean }
export interface CommandResultRecord {
  readonly outcome: string;
  readonly reason: string;
  readonly effects: Readonly<{ capture_off: "PRESENT" | "ABSENT" | "UNKNOWN"; kill: "PRESENT" | "ABSENT" | "UNKNOWN"; durability: "CONFIRMED" | "UNCONFIRMED" }>;
}
export interface KillPort {
  appendIntent(): Promise<void>;
  ensureMarker(name: "CAPTURE_OFF" | "KILL"): Promise<void>;
  revokeMutationLease?(): Promise<void>;
  sampleMarkers(): Promise<MarkerSample>;
  appendResult(result: CommandResultRecord): Promise<void>;
}

function outcome(sample: MarkerSample, intent: boolean, uncertain: boolean): CommandResultRecord {
  let name = sample.captureOff && sample.kill ? "KILL_APPLIED" : sample.captureOff ? "KILL_CAPTURE_ONLY" :
    sample.kill ? "KILL_DAEMON_ONLY" : "KILL_NOT_APPLIED";
  if (uncertain) name = "KILL_DURABILITY_UNKNOWN";
  else if (sample.captureOff && sample.kill && !intent) name = "KILL_AUDIT_DEGRADED";
  return Object.freeze({
    outcome: name,
    reason: uncertain ? "ROOT_RECHECK" : intent ? "NONE" : "OUTBOX_APPEND",
    effects: Object.freeze({
      capture_off: sample.captureOff ? "PRESENT" : "ABSENT",
      kill: sample.kill ? "PRESENT" : "ABSENT",
      durability: uncertain ? "UNCONFIRMED" : "CONFIRMED",
    }),
  });
}

export async function kill(port: KillPort): Promise<Readonly<{ exitCode: 0 | 1; output: string }>> {
  let intent = true;
  let uncertain = false;
  try { await port.appendIntent(); } catch { intent = false; }
  try { await port.ensureMarker("CAPTURE_OFF"); } catch { uncertain = true; }
  try { await port.ensureMarker("KILL"); } catch { uncertain = true; }
  try { await port.revokeMutationLease?.(); } catch { uncertain = true; }
  let sample: MarkerSample;
  try { sample = await port.sampleMarkers(); }
  catch { sample = { captureOff: false, kill: false }; uncertain = true; }
  const record = outcome(sample, intent, uncertain);
  try { await port.appendResult(record); } catch { return Object.freeze({ exitCode: 1, output: "" }); }
  const success = record.outcome === "KILL_APPLIED";
  return Object.freeze({ exitCode: success ? 0 : 1, output: success ? "KILLED\n" : "" });
}

export async function runKillEntry(): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  const { randomUUID } = await import("node:crypto");
  const { userInfo } = await import("node:os");
  const { parseControlConfig } = await import("./config.js");
  const { appendControlHistory, createControlRoot, markerState, readControlFile } = await import("./control-root.js");
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
  return withObsctlLock(root, async () => {
    let outbox = history.verifyOutbox((await readControlFile(root, "outbox/obsctl-actions.jsonl", 0o600)).toString("utf8"),
      (await import("node:crypto")).createPublicKey(signer));
    let journal = history.verifyJournal((await readControlFile(root, "witness/obsctl-actions.jsonl", 0o600)).toString("utf8"),
      (await import("node:crypto")).createPublicKey(signer));
    const identity = { action_kind: "KILL" as const, actor: `obsctl:${username}`, invocation_id: randomUUID(), requested_at_ms: String(Date.now()) };
    let intent: import("./local-history.js").CompletedOutboxRecord | undefined;
    const result = await kill({
      async appendIntent() {
        intent = history.createOutboxRecord(outbox.at(-1), { ...identity,
          action_parameters: { private_key_id: null, public_input_sha256: null, writer_identity: null } }, signer);
        await appendControlHistory(root, "outbox/obsctl-actions.jsonl", Buffer.from(history.encodeOutboxLine(intent)));
        outbox = Object.freeze([...outbox, intent]);
      },
      async ensureMarker(name) { await root.ensureMarker(name); },
      async sampleMarkers() { return { captureOff: await markerState(root, "CAPTURE_OFF") === "PRESENT", kill: await markerState(root, "KILL") === "PRESENT" }; },
      async appendResult(command) {
        const next = history.createJournalRecord(journal.at(-1), {
          ...identity, action_ref: intent?.action_ref ?? history.deriveActionRef(identity), database_action_id: null,
          effects: { ...command.effects, lifecycle: { activation_manifest_sha256: null, phase: "NOT_APPLICABLE",
            private_key_id: null, public_artifact_sha256: null } }, event_id: randomUUID(), event_kind: "COMMAND_RESULT",
          outbox_hash: intent?.outbox_hash ?? null, outcome: command.outcome, reason: command.reason,
          recorded_at_ms: String(Date.now()),
        }, signer);
        await appendControlHistory(root, "witness/obsctl-actions.jsonl", Buffer.from(history.encodeJournalLine(next)));
        journal = Object.freeze([...journal, next]);
      },
    });
    return Object.freeze({ exitCode: result.exitCode, stdout: result.output, stderr: "" });
  });
}
