import type { CliResult } from "./types.js";
import { readCaptureSwitch } from "../control/reader.js";
import { canonicalJson } from "./action-wire.js";
import { renderFallbackStatus } from "./status.js";
import { renderLocalStatus } from "./status.js";
import { createFixagentDeliveryGeneration } from "@debateai/obs-capture/chain/fixagent-delivery";
import { reconcileThroughDeliveryGeneration } from "./reconcile.js";
import type { CompletedOutboxRecord } from "./local-history.js";
import type { ReconcilePort } from "./reconcile.js";
import { GAP_QUERY, gapQueryParameters } from "./proof-gap-window.js";

const NONNEGATIVE_DECIMAL = /^(?:0|[1-9][0-9]*)$/u;

export interface StatusDatabaseFacts {
  readonly openRows: string;
  readonly recentRows: string;
}

export interface StatusDatabaseOperations {
  facts(databaseUrl: string, quietWindowMs: number, skewToleranceMs: number): Promise<StatusDatabaseFacts>;
  reconcile(databaseUrl: string, records: readonly CompletedOutboxRecord[],
    appendReceipt: ReconcilePort["appendReceipt"]): Promise<Readonly<{ reconciled: number; pending: number }>>;
}

export async function readStatusDatabaseFacts(
  databaseUrl: string,
  quietWindowMs: number,
  skewToleranceMs: number,
): Promise<StatusDatabaseFacts> {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const identity = await client.query<{ current_user: string }>("SELECT current_user::text AS current_user");
    if (identity.rowCount !== 1 || identity.rows[0]?.current_user !== "debateai_obs_listener") {
      throw new TypeError("FIX10_DB_IDENTITY");
    }
    const [open, recent] = await Promise.all([
      client.query<{ open_rows: string }>("SELECT count(*)::text AS open_rows FROM obs.capture_gap WHERE closed_at IS NULL"),
      client.query<{ recent_gaps: string }>(GAP_QUERY, [...gapQueryParameters(quietWindowMs, skewToleranceMs)]),
    ]);
    const openRows = open.rowCount === 1 ? open.rows[0]?.open_rows : undefined;
    const recentRows = recent.rowCount === 1 ? recent.rows[0]?.recent_gaps : undefined;
    if (typeof openRows !== "string" || !NONNEGATIVE_DECIMAL.test(openRows) ||
        typeof recentRows !== "string" || !NONNEGATIVE_DECIMAL.test(recentRows)) {
      throw new TypeError("FIX10_DB_QUERY");
    }
    return Object.freeze({ openRows, recentRows });
  } finally {
    await client.end().catch(() => undefined);
  }
}

const DEFAULT_DATABASE_OPERATIONS: StatusDatabaseOperations = Object.freeze({
  facts: readStatusDatabaseFacts,
  reconcile: reconcileStatusRecords,
});

function databaseFailure(error: unknown): Readonly<{ state: "UNREACHABLE" | "REJECTED"; outcome: "STATUS_DB_UNREACHABLE" | "STATUS_DB_REJECTED"; reason: string; exitCode: 0 | 1 }> {
  const message = error instanceof Error ? error.message : "";
  const code = error !== null && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (message === "FIX10_DB_IDENTITY") return Object.freeze({ state: "REJECTED", outcome: "STATUS_DB_REJECTED", reason: "DB_IDENTITY", exitCode: 1 });
  if (message === "FIX10_DB_QUERY") return Object.freeze({ state: "REJECTED", outcome: "STATUS_DB_REJECTED", reason: "DB_QUERY", exitCode: 1 });
  if (message === "FIX10_RECEIPT_APPEND") return Object.freeze({ state: "UNREACHABLE", outcome: "STATUS_DB_UNREACHABLE", reason: "RECEIPT_APPEND", exitCode: 0 });
  if (message === "FIX09_ACTION_CONFLICT") return Object.freeze({ state: "REJECTED", outcome: "STATUS_DB_REJECTED", reason: "DB_SEMANTIC_COLLISION", exitCode: 1 });
  if (code === "42501") return Object.freeze({ state: "REJECTED", outcome: "STATUS_DB_REJECTED", reason: "DB_PERMISSION", exitCode: 1 });
  if (code.startsWith("08") || code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT") {
    return Object.freeze({ state: "UNREACHABLE", outcome: "STATUS_DB_UNREACHABLE", reason: "DB_CONNECTION_LOST", exitCode: 0 });
  }
  return Object.freeze({ state: "REJECTED", outcome: "STATUS_DB_REJECTED", reason: "DB_GATEWAY", exitCode: 1 });
}

export async function reconcileStatusRecords(
  databaseUrl: string,
  records: readonly CompletedOutboxRecord[],
  appendReceipt: ReconcilePort["appendReceipt"],
): Promise<Readonly<{ reconciled: number; pending: number }>> {
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new TypeError("FIX10_DB_CONFIG"); }
  if (decodeURIComponent(parsed.username) !== "debateai_obs_listener") throw new TypeError("FIX10_DB_IDENTITY");
  const generation = createFixagentDeliveryGeneration(databaseUrl);
  await generation.connect();
  try { return await reconcileThroughDeliveryGeneration(records, generation, appendReceipt); }
  finally { await generation.close(); }
}

export async function runStatusEntry(database: StatusDatabaseOperations = DEFAULT_DATABASE_OPERATIONS): Promise<CliResult> {
  const capture = await readCaptureSwitch(process.env.OBS_CONTROL_DIR);
  try {
    const { createHash, createPublicKey, randomUUID } = await import("node:crypto");
    const { lstat, readFile, realpath } = await import("node:fs/promises");
    const { userInfo } = await import("node:os");
    const { parseControlConfig } = await import("./config.js");
    const { appendControlHistory, createControlRoot, markerState, readControlFile } = await import("./control-root.js");
    const { withObsctlLock } = await import("./lock.js");
    const history = await import("./local-history.js");
    const { verifyArmed } = await import("./armed-token.js");
    const { computeProofWindow } = await import("./proof-gap-window.js");
    const config = parseControlConfig(process.env);
    if (process.getuid?.() !== config.principals.obsctl.uid) throw new TypeError("FIX10_PRINCIPAL");
    const root = await createControlRoot({ root: config.root, ownerUid: config.principals.obsctl.uid,
      ownerGid: config.principals.publicReadGid, postgresDeviceId: config.postgresDeviceId });
    return await withObsctlLock(root, async () => {
      const keyBytes = await readControlFile(root, "keys/obsctl-outbox.pk8", 0o600, 256);
      const signer = history.deriveEd25519SigningKeyId(keyBytes).key; keyBytes.fill(0); const publicKey = createPublicKey(signer);
      let outbox = history.verifyOutbox((await readControlFile(root, "outbox/obsctl-actions.jsonl", 0o600)).toString("utf8"), publicKey);
      let journal = history.verifyJournal((await readControlFile(root, "witness/obsctl-actions.jsonl", 0o600)).toString("utf8"), publicKey);
      const username = userInfo().username; if (!/^[A-Za-z0-9._-]{1,128}$/u.test(username)) throw new TypeError("FIX10_ACTOR");
      const identity = { action_kind: "STATUS" as const, actor: `obsctl:${username}`, invocation_id: randomUUID(), requested_at_ms: String(Date.now()) };
      const intent = history.createOutboxRecord(outbox.at(-1), { ...identity, action_parameters: { private_key_id: null,
        public_input_sha256: null, writer_identity: null } }, signer);
      await appendControlHistory(root, "outbox/obsctl-actions.jsonl", Buffer.from(history.encodeOutboxLine(intent)));
      outbox = Object.freeze([...outbox, intent]);
      const observedAtMs = Date.now();
      const captureOff = await markerState(root, "CAPTURE_OFF") === "PRESENT";
      const killed = await markerState(root, "KILL") === "PRESENT";
      let armed: { state: "VALID" | "MISSING" | "INVALID" | "STALE"; age_ms: string | null; expires_at_ms: string | null } = { state: "MISSING", age_ms: null, expires_at_ms: null };
      let armedSha256: string | null = null;
      try {
        const [armedBytes, hmac] = await Promise.all([readControlFile(root, "ARMED", 0o600), readControlFile(root, "keys/armed-marker.hmac", 0o600, 32)]);
        armedSha256 = createHash("sha256").update(armedBytes).digest("hex");
        try { const verified = verifyArmed(armedBytes, hmac, observedAtMs, config.armedTokenStalenessMs); armed = { state: "VALID",
          age_ms: String(observedAtMs - Number(verified.body.issued_at_ms)), expires_at_ms: verified.body.expires_at_ms }; }
        catch (error) { armed = { state: error instanceof Error && error.message === "FIX10_ARMED_STALE" ? "STALE" : "INVALID", age_ms: null, expires_at_ms: null }; }
        finally { hmac.fill(0); }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") armed = { state: "INVALID", age_ms: null, expires_at_ms: null }; }
      const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
      const optionalDigest = async (leaf: string, mode: number) => { try { return sha(await readControlFile(root, leaf, mode)); } catch { return null; } };
      const activation = await optionalDigest("chain/activation.json", 0o440);
      const keyring = await optionalDigest("chain/public-keyring.json", 0o440);
      let policy: string | null = null;
      try {
        const [resolved, metadata] = await Promise.all([realpath(config.policyBundlePath), lstat(config.policyBundlePath)]);
        if (resolved !== config.policyBundlePath || !metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
          throw new TypeError("FIX10_POLICY_PATH");
        }
        policy = sha(await readFile(config.policyBundlePath));
      } catch { policy = null; }
      let proof: { state: "VALID" | "MISSING" | "INVALID" | "STALE" | "MISMATCH"; age_ms: string | null; proof_id: string | null } =
        { state: "MISSING", age_ms: null, proof_id: null };
      if (armedSha256 !== null && activation !== null && policy !== null) {
        try {
          const [{ verifyAuthorityProof }, proofBytes, publicDer] = await Promise.all([
            import("./authority-proof.js"), readControlFile(root, "proof/authority-proof.json", 0o640),
            readControlFile(root, "keys/daemon-proof.spki", 0o440, 128),
          ]);
          const verified = verifyAuthorityProof(proofBytes.toString("utf8"), createPublicKey({ key: publicDer, format: "der", type: "spki" }),
            { nowMs: observedAtMs, stalenessMs: config.authorityProofStalenessMs, armedSha256,
              activationManifestSha256: activation, policyBundleSha256: policy });
          proof = { state: "VALID", age_ms: String(observedAtMs - Number(verified.issued_at_ms)), proof_id: String(verified.proof_id) };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") proof = { state: error instanceof Error && error.message === "FIX10_PROOF_STALE" ? "STALE" :
            error instanceof Error && error.message === "FIX10_PROOF_BINDING" ? "MISMATCH" : "INVALID", age_ms: null, proof_id: null };
        }
      }
      const appendDatabaseEvent = async (record: CompletedOutboxRecord, databaseActionId: string | null,
        eventKind: "COMMAND_RESULT" | "RECONCILED", eventOutcome: string, reason: string): Promise<void> => {
        const next = history.createJournalRecord(journal.at(-1), { action_kind: record.action_kind,
          invocation_id: record.invocation_id, action_ref: record.action_ref,
          database_action_id: databaseActionId, effects: { capture_off: "UNKNOWN", kill: "UNKNOWN", durability: "CONFIRMED",
            lifecycle: { activation_manifest_sha256: null, phase: "NOT_APPLICABLE", private_key_id: null, public_artifact_sha256: null } },
          event_id: randomUUID(), event_kind: eventKind, outbox_hash: record.outbox_hash, outcome: eventOutcome,
          reason, recorded_at_ms: String(Date.now()) }, signer);
        await appendControlHistory(root, "witness/obsctl-actions.jsonl", Buffer.from(history.encodeJournalLine(next)));
        journal = Object.freeze([...journal, next]);
      };
      const window = computeProofWindow({ proofStalenessMs: config.authorityProofStalenessMs,
        refreshIntervalMs: config.authorityProofRefreshIntervalMs, skewToleranceMs: config.skewToleranceMs,
        flushIntervalMs: config.flushIntervalMs, quietWindowMs: config.captureGapQuietWindowMs });
      let databaseState: "RECONCILED" | "UNREACHABLE" | "REJECTED" = "UNREACHABLE";
      let databaseReason = "DB_CONFIG_ABSENT";
      let databaseActionId: string | null = null;
      let exitCode: 0 | 1 = 0;
      let gapOpenRows: string | null = null;
      let gapRecentRows: string | null = null;
      let gapReason: "NONE" | "DB_UNAVAILABLE" | "QUERY_FAILURE" = "DB_UNAVAILABLE";
      const databaseUrl = process.env.OBSCTL_DATABASE_URL;
      if (databaseUrl === undefined) {
        await appendDatabaseEvent(intent, null, "COMMAND_RESULT", "STATUS_DB_UNREACHABLE", "DB_CONFIG_ABSENT");
      } else {
        try {
          const facts = await database.facts(databaseUrl, window.W, config.skewToleranceMs);
          gapOpenRows = facts.openRows;
          gapRecentRows = facts.recentRows;
          gapReason = "NONE";
          const pending = history.pendingIntents(outbox, journal);
          await database.reconcile(databaseUrl, pending, async ({ record, databaseActionId: committedId }) => {
            const current = record.invocation_id === intent.invocation_id && record.action_ref === intent.action_ref;
            await appendDatabaseEvent(record, committedId, current ? "COMMAND_RESULT" : "RECONCILED",
              current ? "STATUS_RECONCILED" : "RECONCILED", "NONE");
            if (current) databaseActionId = committedId;
          });
          if (databaseActionId === null) throw new TypeError("FIX10_RECEIPT_APPEND");
          databaseState = "RECONCILED";
          databaseReason = "NONE";
        } catch (error) {
          const failure = databaseFailure(error);
          databaseState = failure.state;
          databaseReason = failure.reason;
          exitCode = failure.exitCode;
          if (gapReason === "NONE") gapReason = "QUERY_FAILURE";
          await appendDatabaseEvent(intent, null, "COMMAND_RESULT", failure.outcome, failure.reason).catch(() => undefined);
        }
      }
      const status = renderLocalStatus({ observedAtMs, captureSwitch: capture, captureOff, killed, armed,
        proof, outboxPending: String(history.pendingIntents(outbox, journal).length),
        outboxTailHash: outbox.at(-1)?.outbox_hash ?? null, journalTailHash: journal.at(-1)?.journal_hash ?? null,
        policyBundleSha256: policy, activationManifestSha256: activation, keyringSha256: keyring,
        databaseState, databaseReason, databaseActionId,
        captureGaps: Object.freeze({ open_rows: gapOpenRows, recent_rows: gapRecentRows,
          authority_proof_staleness_ms: String(config.authorityProofStalenessMs),
          refresh_interval_ms: String(config.authorityProofRefreshIntervalMs),
          skew_tolerance_ms: String(config.skewToleranceMs), flush_interval_ms: String(config.flushIntervalMs),
          quiet_window_ms: String(window.W), query_window_ms: String(window.Q), reason: gapReason }) });
      return Object.freeze({ exitCode, stdout: `${canonicalJson(status)}\n`, stderr: "" });
    });
  } catch {
    const status = renderFallbackStatus(capture.effective);
    return Object.freeze({ exitCode: 1, stdout: `${canonicalJson(status)}\n`, stderr: "" });
  }
}
