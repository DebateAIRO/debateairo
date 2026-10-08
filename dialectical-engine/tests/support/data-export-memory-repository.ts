import { randomUUID } from "node:crypto";
import type { AuthSourceContext } from "@debateai/db";
import type { DataExportStatus } from "@debateai/contract";
import type { ExportClaim } from "../../apps/api/src/data-export/snapshot.js";
import type {
  DataExportRepository, LinkOutcome, RequestOutcome
} from "../../apps/api/src/data-export/service.js";

export type MemoryExportRow = {
  exportId: string;
  userId: string;
  ownerRef: string;
  sessionId: string;
  locale: string;
  requestedAt: Date;
  status: "PREPARING" | "SENT" | "FAILED" | "SUPERSEDED" | "EXPIRED" | "CANCELLED";
  attempt: number;
  leaseUntil: Date | null;
  leaseWorker: string | null;
  sentAt: Date | null;
  expiresAt: Date | null;
  linkTokenHash: string | null;
  archiveSha256: string | null;
  archiveBytes: number | null;
  failureReason: "BUILD" | "MAIL" | "ATTEMPTS" | null;
  keyDestroyed: boolean;
};

type Grant = { userId: string; sessionId: string; action: string; used: boolean; expiresAt: Date };
type Call = { method: string; exportId?: string; args?: unknown };

/** An in-memory O5–O11 transaction and lease model for the service boundary. */
export class MemoryDataExportRepository implements DataExportRepository {
  readonly rows = new Map<string, MemoryExportRow>();
  readonly calls: Call[] = [];
  readonly grants = new Map<string, Grant>();
  readonly processing = new Set<string>();
  readonly held = new Set<string>();
  readonly noEmail = new Set<string>();
  renewResult = true;

  constructor(private readonly now: () => Date) {}

  grant(userId: string, sessionId: string, grantTokenHash: string, action = "EXPORT_DATA"): void {
    this.grants.set(grantTokenHash, { userId, sessionId, action, used: false, expiresAt: new Date(this.now().getTime() + 60_000) });
  }

  setProcessing(userId: string, processing: boolean): void {
    if (processing) this.processing.add(userId); else this.processing.delete(userId);
  }
  setHeld(userId: string, held: boolean): void {
    if (held) this.held.add(userId); else this.held.delete(userId);
  }

  seedPreparing(input: { userId: string; sessionId: string; attempt?: number; leaseUntil?: Date }): MemoryExportRow {
    const row = this.row(input.userId, input.sessionId);
    row.attempt = input.attempt ?? 0;
    row.leaseUntil = input.leaseUntil ?? null;
    this.rows.set(row.exportId, row);
    return row;
  }

  seedSent(input: { userId: string; expiresAt: Date }): MemoryExportRow {
    const row = this.row(input.userId, randomUUID());
    row.status = "SENT";
    row.sentAt = this.now();
    row.expiresAt = input.expiresAt;
    row.linkTokenHash = "sha256:" + "a".repeat(64);
    row.archiveSha256 = "b".repeat(64);
    this.rows.set(row.exportId, row);
    return row;
  }

  private row(userId: string, sessionId: string): MemoryExportRow {
    return {
      exportId: randomUUID(), userId, ownerRef: randomUUID(), sessionId, locale: "en",
      requestedAt: this.now(), status: "PREPARING", attempt: 0, leaseUntil: null, leaseWorker: null,
      sentAt: null, expiresAt: null, linkTokenHash: null, archiveSha256: null, archiveBytes: null,
      failureReason: null, keyDestroyed: false
    };
  }

  async request(i: { userId: string; sessionId: string; grantTokenHash: string; exportId: string; locale: string; source: AuthSourceContext }): Promise<RequestOutcome> {
    this.calls.push({ method: "request", exportId: i.exportId, args: i });
    // O5: a grant is consumed once, before any later account-state refusal.
    const grant = this.grants.get(i.grantTokenHash);
    if (!grant || grant.used || grant.expiresAt <= this.now() || grant.userId !== i.userId || grant.sessionId !== i.sessionId || grant.action !== "EXPORT_DATA") return { kind: "STEP_UP_INVALID" };
    grant.used = true;
    // O6, O7, O8, O9, O10, O11: each refusal wins over the later ones.
    if (this.noEmail.has(i.userId)) return { kind: "EMAIL_REQUIRED" };
    if (this.processing.has(i.userId)) return { kind: "ERASING" };
    if (this.held.has(i.userId)) return { kind: "HELD" };
    if ([...this.rows.values()].some((row) => row.userId === i.userId && row.status === "PREPARING")) return { kind: "IN_PROGRESS" };
    const recent = [...this.rows.values()].filter((row) => row.userId === i.userId && row.status !== "FAILED" && row.requestedAt.getTime() > this.now().getTime() - 86_400_000);
    if (recent.length >= 3) {
      const oldest = recent.map((row) => row.requestedAt.getTime()).sort((a, b) => a - b)[0]!;
      return { kind: "RATE_LIMITED", retryAfterSeconds: Math.ceil((oldest + 86_400_000 - this.now().getTime()) / 1000) };
    }
    for (const row of this.rows.values()) if (row.userId === i.userId && row.status === "SENT") row.status = "SUPERSEDED";
    const row = this.row(i.userId, i.sessionId);
    row.exportId = i.exportId;
    row.locale = i.locale;
    this.rows.set(row.exportId, row);
    return { kind: "ACCEPTED", requestedAt: row.requestedAt };
  }

  async status(userId: string): Promise<DataExportStatus> {
    this.calls.push({ method: "status" });
    const row = [...this.rows.values()].filter((item) => item.userId === userId).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()).at(0);
    if (!row || !["PREPARING", "SENT", "FAILED"].includes(row.status)) return { status: "NONE" };
    if (row.status === "SENT") return { status: "SENT", requested_at: row.requestedAt.toISOString(), expires_at: row.expiresAt!.toISOString() };
    return { status: row.status as "PREPARING" | "FAILED", requested_at: row.requestedAt.toISOString() };
  }

  async claim(workerId: string, leaseSeconds: number): Promise<ExportClaim | null> {
    this.calls.push({ method: "claim" });
    const row = [...this.rows.values()].find((item) => item.status === "PREPARING" && (item.leaseUntil === null || item.leaseUntil <= this.now()));
    if (!row) return null;
    row.attempt += 1;
    row.leaseWorker = workerId;
    row.leaseUntil = new Date(this.now().getTime() + leaseSeconds * 1000);
    return { exportId: row.exportId, userId: row.userId, ownerRef: row.ownerRef, sessionId: row.sessionId, locale: row.locale, requestedAt: row.requestedAt, attempt: row.attempt };
  }

  async renewLease(exportId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    this.calls.push({ method: "renewLease", exportId });
    const row = this.rows.get(exportId);
    if (!this.renewResult || !row || row.leaseWorker !== workerId || row.status !== "PREPARING" || this.processing.has(row.userId)) return false;
    row.leaseUntil = new Date(this.now().getTime() + leaseSeconds * 1000);
    return true;
  }

  async complete(i: { exportId: string; workerId: string; linkTokenHash: string; archiveSha256: string; archiveBytes: number; sentAt: Date }): Promise<boolean> {
    this.calls.push({ method: "complete", exportId: i.exportId, args: i });
    const row = this.rows.get(i.exportId);
    if (!row || row.status !== "PREPARING" || row.leaseWorker !== i.workerId || this.processing.has(row.userId)) return false;
    row.status = "SENT";
    row.sentAt = i.sentAt;
    row.expiresAt = new Date(i.sentAt.getTime() + 86_400_000);
    row.linkTokenHash = i.linkTokenHash;
    row.archiveSha256 = i.archiveSha256;
    row.archiveBytes = i.archiveBytes;
    row.leaseWorker = null;
    row.leaseUntil = null;
    return true;
  }

  async fail(exportId: string, workerId: string, reason: "BUILD" | "MAIL" | "ATTEMPTS"): Promise<void> {
    this.calls.push({ method: "fail", exportId, args: { workerId, reason } });
    const row = this.rows.get(exportId);
    if (row && row.status === "PREPARING" && row.leaseWorker === workerId) {
      row.status = "FAILED";
      row.failureReason = reason;
      row.leaseWorker = null;
      row.leaseUntil = null;
    }
  }

  async sweep(): Promise<readonly { exportId: string; userId: string }[]> {
    this.calls.push({ method: "sweep" });
    const victims: { exportId: string; userId: string }[] = [];
    for (const row of this.rows.values()) {
      if (this.processing.has(row.userId) && (row.status === "PREPARING" || row.status === "SENT")) row.status = "CANCELLED";
      if (row.status === "SENT" && row.expiresAt !== null && row.expiresAt <= this.now()) row.status = "EXPIRED";
      if (!row.keyDestroyed && ["CANCELLED", "SUPERSEDED", "EXPIRED"].includes(row.status)) victims.push({ exportId: row.exportId, userId: row.userId });
    }
    return victims;
  }

  async markKeyDestroyed(exportId: string): Promise<void> {
    this.calls.push({ method: "markKeyDestroyed", exportId });
    const row = this.rows.get(exportId);
    if (row) row.keyDestroyed = true;
  }

  async liveIds(ids: readonly string[]): Promise<readonly string[]> {
    this.calls.push({ method: "liveIds", args: ids });
    return ids.filter((id) => { const row = this.rows.get(id); return row !== undefined && !row.keyDestroyed; });
  }

  async openLink(userId: string, linkTokenHash: string): Promise<LinkOutcome> {
    this.calls.push({ method: "openLink", args: { userId, linkTokenHash } });
    const row = [...this.rows.values()].find((item) => item.linkTokenHash === linkTokenHash);
    if (!row) return { kind: "INVALID" };
    if (row.userId !== userId) return { kind: "WRONG_ACCOUNT" };
    if (this.held.has(userId)) return { kind: "HELD" };
    if (row.status !== "SENT" || row.expiresAt === null || row.expiresAt <= this.now()) return { kind: "INVALID" };
    return { kind: "OK", exportId: row.exportId, archiveSha256: row.archiveSha256!, requestedAt: row.requestedAt };
  }

  async recordDownload(exportId: string, userId: string, source: AuthSourceContext): Promise<void> {
    this.calls.push({ method: "recordDownload", exportId, args: { userId, source } });
  }
}
