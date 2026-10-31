import type { Pool, PoolClient } from "pg";
import type { AuditContextHasher } from "@debateai/crypto";
import type { DataExportStatus } from "@debateai/contract";
import type { AuthSourceContext } from "./identity.js";
import type { DataExportRepository, LinkOutcome, RequestOutcome } from "../../../apps/api/src/data-export/service.js";
import type { DataExportSourcePort, ExportClaim, RawExportRows } from "../../../apps/api/src/data-export/snapshot.js";

function normalized(value: string | undefined, maximum: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return (trimmed === "" ? "unknown" : trimmed).slice(0, maximum);
}

function versioned(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
}

export class PostgresDataExportRepository implements DataExportRepository {
  constructor(private readonly pool: Pool, private readonly workerPool: Pool,
    private readonly auditContext: Pick<AuditContextHasher, "hashSourceIp" | "hashUserAgent">) {}

  private async sourceContext(source: AuthSourceContext): Promise<string> {
    const ipArgon2id = versioned(await this.auditContext.hashSourceIp(normalized(source?.ip, 64)));
    const userAgentArgon2id = versioned(await this.auditContext.hashUserAgent(normalized(source?.userAgent, 256)));
    return JSON.stringify({ ipArgon2id, userAgentArgon2id });
  }

  private async transaction<T>(pool: Pool, attempt: boolean, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (attempt) await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async request(input: Parameters<DataExportRepository["request"]>[0]): Promise<RequestOutcome> {
    const source = await this.sourceContext(input.source);
    try {
      const row = await this.transaction(this.pool, true, async client => (await client.query<{
        result_status: RequestOutcome["kind"]; result_requested_at: Date | null; result_retry_after_seconds: number | null;
      }>("SELECT * FROM identity.request_data_export($1,$2,$3,$4,$5,$6::jsonb)",
        [input.userId, input.sessionId, input.grantTokenHash, input.exportId, input.locale, source])).rows[0]!);
      if (row.result_status === "ACCEPTED") return { kind: "ACCEPTED", requestedAt: row.result_requested_at! };
      if (row.result_status === "RATE_LIMITED") return { kind: "RATE_LIMITED", retryAfterSeconds: row.result_retry_after_seconds! };
      return { kind: row.result_status };
    } catch (error) {
      if ((error as { code?: string; message?: string }).code === "P0001"
        && (error as Error).message.includes("STEP_UP_GRANT_GENERATION_INVALID")) return { kind: "STEP_UP_INVALID" };
      throw error;
    }
  }

  async status(userId: string): Promise<DataExportStatus> {
    const row = (await this.pool.query<{ status: DataExportStatus["status"]; requested_at: Date | null; expires_at: Date | null }>(
      "SELECT * FROM identity.read_data_export_status($1)", [userId])).rows[0]!;
    if (row.status === "NONE") return { status: "NONE" };
    if (row.status === "SENT") return { status: "SENT", requested_at: row.requested_at!.toISOString(), expires_at: row.expires_at!.toISOString() };
    return { status: row.status, requested_at: row.requested_at!.toISOString() };
  }

  async claim(workerId: string, leaseSeconds: number): Promise<ExportClaim | null> {
    const row = (await this.workerPool.query("SELECT * FROM identity.claim_data_export($1,$2)", [workerId, leaseSeconds])).rows[0];
    return row == null ? null : { exportId: row.export_id, userId: row.user_id, sessionId: row.session_id,
      ownerRef: row.owner_ref, locale: row.locale, requestedAt: row.requested_at, attempt: row.attempt };
  }

  async renewLease(exportId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    return (await this.workerPool.query("SELECT identity.renew_data_export_lease($1,$2,$3) ok", [exportId, workerId, leaseSeconds])).rows[0]!.ok;
  }

  async complete(input: Parameters<DataExportRepository["complete"]>[0]): Promise<boolean> {
    return this.transaction(this.workerPool, false, async client => (await client.query(
      "SELECT identity.complete_data_export($1,$2,$3,$4,$5,$6) ok",
      [input.exportId, input.workerId, input.linkTokenHash, input.archiveSha256, input.archiveBytes, input.sentAt])).rows[0]!.ok);
  }

  async fail(exportId: string, workerId: string, reason: "BUILD" | "MAIL" | "ATTEMPTS"): Promise<void> {
    await this.transaction(this.workerPool, false, async client => { await client.query("SELECT identity.fail_data_export($1,$2,$3)", [exportId, workerId, reason]); });
  }

  async sweep(): Promise<readonly { exportId: string; userId: string }[]> {
    return (await this.workerPool.query("SELECT * FROM identity.sweep_data_exports()")).rows.map(row => ({ exportId: row.export_id, userId: row.user_id }));
  }

  async markKeyDestroyed(exportId: string): Promise<void> {
    await this.workerPool.query("SELECT identity.mark_data_export_key_destroyed($1)", [exportId]);
  }

  async liveIds(ids: readonly string[]): Promise<readonly string[]> {
    return (await this.workerPool.query("SELECT identity.live_data_export_ids($1::uuid[]) ids", [ids])).rows[0]!.ids;
  }

  async openLink(userId: string, linkTokenHash: string): Promise<LinkOutcome> {
    const row = (await this.pool.query("SELECT * FROM identity.open_data_export_link($1,$2)", [userId, linkTokenHash])).rows[0]!;
    return row.outcome === "OK" ? { kind: "OK", exportId: row.export_id, archiveSha256: row.archive_sha256,
      requestedAt: row.requested_at } : { kind: row.outcome };
  }

  async recordDownload(exportId: string, userId: string, source: AuthSourceContext): Promise<void> {
    const prepared = await this.sourceContext(source);
    await this.transaction(this.pool, true, async client => { await client.query(
      "SELECT identity.record_data_export_download($1,$2,$3::jsonb)", [exportId, userId, prepared]); });
  }
}

const REQUEST_FUNCTIONS = [
  "identity.request_data_export(uuid,uuid,text,uuid,text,jsonb)",
  "identity.read_data_export_status(uuid)",
  "identity.open_data_export_link(uuid,text)",
  "identity.record_data_export_download(uuid,uuid,jsonb)"
] as const;
const WORKER_FUNCTIONS = [
  "identity.claim_data_export(uuid,integer)",
  "identity.renew_data_export_lease(uuid,uuid,integer)",
  "identity.read_data_export_snapshot_v2(uuid,uuid)",
  "identity.read_data_export_threat_reports(uuid,uuid)",
  // V4 account memory (migration 0131): the reading level, debate visits and dig links.
  "identity.read_data_export_page_memory(uuid,uuid)",
  // The Perplexity plan's stores (0132, 0133): a debate's web evidence, the investigations and the reserve events
  // (debates.json web_sources; account.json investigations and reserve_events).
  "identity.read_data_export_web_evidence(uuid,uuid)",
  "identity.read_data_export_investigations(uuid,uuid)",
  // The new dig model and the month pause (0134): the dig levels, the path rewrites (sealed under each dig's run key)
  // and the pauses. Its archive section is not wired yet (apps/api/src/data-export); the boot check already pins that
  // the worker reaches it.
  "identity.read_data_export_dig_model(uuid,uuid)",
  // A dig's picks and its path rewrite's material (0135), sealed under each dig's run key. Its archive section is not
  // wired yet either; the boot check pins that the worker reaches it.
  "identity.read_data_export_dig_picks(uuid,uuid)",
  "identity.complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)",
  "identity.fail_data_export(uuid,uuid,text)",
  "identity.sweep_data_exports()",
  "identity.mark_data_export_key_destroyed(uuid)",
  "identity.live_data_export_ids(uuid[])"
] as const;

async function roleWitness(pool: Pool) {
  const row = (await pool.query<{
    principal: string; authorization_member: boolean; worker_member: boolean;
    request_count: number; worker_count: number; privileged: boolean;
  }>(`SELECT current_user principal,
      pg_has_role(current_user,'debateai_authorization_runtime','MEMBER') authorization_member,
      pg_has_role(current_user,'debateai_data_export_worker','MEMBER') worker_member,
      (SELECT count(*)::int FROM unnest($1::text[]) signature WHERE has_function_privilege(current_user,signature,'EXECUTE')) request_count,
      (SELECT count(*)::int FROM unnest($2::text[]) signature WHERE has_function_privilege(current_user,signature,'EXECUTE')) worker_count,
      (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication) privileged
    FROM pg_roles WHERE rolname=current_user`, [REQUEST_FUNCTIONS, WORKER_FUNCTIONS])).rows[0];
  return row;
}

export async function assertDataExportDatabaseRoles(requestPool: Pool, workerPool: Pool): Promise<void> {
  try {
    const [request, worker] = await Promise.all([roleWitness(requestPool), roleWitness(workerPool)]);
    if (request === undefined || worker === undefined || request.principal === worker.principal
      || !request.authorization_member || request.worker_member || request.request_count !== 4 || request.worker_count !== 0
      || !worker.worker_member || worker.authorization_member || worker.request_count !== 0 || worker.worker_count !== 14
      || request.privileged || worker.privileged) {
      throw new TypeError("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
    }
  } catch {
    throw new TypeError("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
  }
}

export class PostgresDataExportSource implements DataExportSourcePort {
  constructor(private readonly pool: Pool) {}

  async readRaw(exportId: string, workerId: string): Promise<RawExportRows> {
    const row = (await this.pool.query<{ snapshot: RawExportRows; threat_reports: unknown; page_memory: Record<string, unknown> | null;
      web_evidence: unknown; investigations: Record<string, unknown> | null }>(
      "SELECT identity.read_data_export_snapshot_v2($1,$2) snapshot, identity.read_data_export_threat_reports($1,$2) threat_reports, "
        + "identity.read_data_export_page_memory($1,$2) page_memory, identity.read_data_export_web_evidence($1,$2) web_evidence, "
        + "identity.read_data_export_investigations($1,$2) investigations",
      [exportId, workerId])).rows[0]!;
    // 0131's reader answers {page_reading_level, debate_visits, dig_links}; a missing member stays missing, so the
    // snapshot's exact-section check refuses the export rather than leaving the records out.
    // 0132's reader answers [{run_id, web}] per debate; 0133's {investigations, reserve_events}, read the same way.
    const memory = row.page_memory ?? {};
    const investigations = row.investigations ?? {};
    return {
      ...row.snapshot, threat_reports: row.threat_reports,
      ...("page_reading_level" in memory ? { page_reading_level: memory.page_reading_level } : {}),
      ...("debate_visits" in memory ? { debate_visits: memory.debate_visits } : {}),
      ...("dig_links" in memory ? { dig_links: memory.dig_links } : {}),
      web_evidence: row.web_evidence,
      ...("investigations" in investigations ? { investigations: investigations.investigations } : {}),
      ...("reserve_events" in investigations ? { reserve_events: investigations.reserve_events } : {})
    } as RawExportRows;
  }
}
