import { randomBytes, randomUUID, createHash } from "node:crypto";
import { hashToken } from "@debateai/crypto";
import type { AuthSourceContext } from "@debateai/db";
import type { DataExportStatus } from "@debateai/contract";
import type { ArchiveCatalog } from "./archive-catalog.js";
import type { FileDataExportStore } from "./store.js";
import type { ExportClaim } from "./snapshot.js";
import type { ExportSnapshot } from "./types.js";
import { buildArchive, archiveFilename } from "./archive.js";

const DATA_EXPORT_LEASE_SECONDS = 45;
const DATA_EXPORT_RENEW_MS = 15_000;
const DATA_EXPORT_MAX_ATTEMPTS = 3;
const DATA_EXPORT_LINK_TTL_SECONDS = 86_400;

export type RequestOutcome =
  | { kind: "ACCEPTED"; requestedAt: Date }
  | { kind: "STEP_UP_INVALID" | "EMAIL_REQUIRED" | "ERASING" | "HELD" | "IN_PROGRESS" }
  | { kind: "RATE_LIMITED"; retryAfterSeconds: number };

export type LinkOutcome =
  | { kind: "OK"; exportId: string; archiveSha256: string; requestedAt: Date }
  | { kind: "WRONG_ACCOUNT" | "INVALID" | "HELD" };

export interface DataExportRepository {
  request(i: { userId: string; sessionId: string; grantTokenHash: string; exportId: string; locale: string; source: AuthSourceContext }): Promise<RequestOutcome>;
  status(userId: string): Promise<DataExportStatus>;
  claim(workerId: string, leaseSeconds: number): Promise<ExportClaim | null>;
  renewLease(exportId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  complete(i: { exportId: string; workerId: string; linkTokenHash: string; archiveSha256: string; archiveBytes: number; sentAt: Date }): Promise<boolean>;
  fail(exportId: string, workerId: string, reason: "BUILD" | "MAIL" | "ATTEMPTS"): Promise<void>;
  sweep(): Promise<readonly { exportId: string; userId: string }[]>;
  markKeyDestroyed(exportId: string): Promise<void>;
  liveIds(ids: readonly string[]): Promise<readonly string[]>;
  openLink(userId: string, linkTokenHash: string): Promise<LinkOutcome>;
  recordDownload(exportId: string, userId: string, source: AuthSourceContext): Promise<void>;
}

export interface DataExportMailPort {
  sendExportReady(i: { exportId: string; to: string; locale: string; requestedAt: Date; expiresAt: Date; downloadUrl: string }): Promise<void>;
}

export type DownloadResult =
  | { kind: "OK"; bytes: Buffer; filename: string }
  | { kind: "WRONG_ACCOUNT" | "INVALID" | "HELD" | "UNAVAILABLE" };

export class DataExportApplication {
  constructor(private readonly deps: {
    repository: DataExportRepository;
    store: FileDataExportStore;
    collect: (claim: ExportClaim, workerId: string) => Promise<ExportSnapshot>;
    archiveCatalog: (locale: string) => ArchiveCatalog;
    mail: DataExportMailPort;
    publicAppUrl: string;
    workerId: string;
    now?: () => Date;
    randomBytes?: (n: number) => Buffer;
    log?: (line: string) => void;
  }) {}

  async request(i: { userId: string; sessionId: string; grantToken: string; locale: string; source: AuthSourceContext }): Promise<RequestOutcome> {
    return this.deps.repository.request({
      userId: i.userId,
      sessionId: i.sessionId,
      grantTokenHash: hashToken("step-up-grant", i.grantToken),
      exportId: randomUUID(),
      locale: i.locale,
      source: i.source
    });
  }

  async status(userId: string): Promise<DataExportStatus> {
    return this.deps.repository.status(userId);
  }

  async download(userId: string, token: string, source: AuthSourceContext): Promise<DownloadResult> {
    const link = await this.deps.repository.openLink(userId, hashToken("data-export-link", token));
    if (link.kind !== "OK") return { kind: link.kind };
    let bytes: Buffer;
    try {
      bytes = await this.deps.store.read(link.exportId, userId);
    } catch {
      return { kind: "UNAVAILABLE" };
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== link.archiveSha256) return { kind: "UNAVAILABLE" };
    await this.deps.repository.recordDownload(link.exportId, userId, source);
    return { kind: "OK", bytes, filename: archiveFilename(link.requestedAt) };
  }

  async runOnce(): Promise<void> {
    const { repository, store, workerId } = this.deps;
    try {
      for (const { exportId } of await repository.sweep()) {
        await store.destroyKey(exportId);
        await store.deleteArchive(exportId);
        await repository.markKeyDestroyed(exportId);
      }
      const storedIds = await store.listIds();
      const liveIds = new Set(await repository.liveIds(storedIds));
      for (const id of storedIds) {
        if (liveIds.has(id)) continue;
        await store.destroyKey(id);
        await store.deleteArchive(id);
      }
    } catch {
      this.deps.log?.("[DATA_EXPORT_SWEEP_FAILED] SWEEP");
      return;
    }

    const claim = await repository.claim(workerId, DATA_EXPORT_LEASE_SECONDS);
    if (claim === null) return;
    if (claim.attempt > DATA_EXPORT_MAX_ATTEMPTS) {
      await store.destroyKey(claim.exportId);
      await store.deleteArchive(claim.exportId);
      await repository.fail(claim.exportId, workerId, "ATTEMPTS");
      return;
    }

    let leaseLost = false;
    let renewInFlight: Promise<void> | undefined;
    const renew = () => {
      if (renewInFlight !== undefined) return;
      renewInFlight = repository.renewLease(claim.exportId, workerId, DATA_EXPORT_LEASE_SECONDS)
        .then((ok) => { if (!ok) leaseLost = true; })
        .catch(() => { leaseLost = true; })
        .finally(() => { renewInFlight = undefined; });
    };
    const timer = setInterval(renew, DATA_EXPORT_RENEW_MS);
    timer.unref?.();
    const discard = async () => {
      await store.destroyKey(claim.exportId);
      await store.deleteArchive(claim.exportId);
    };
    let phase: "BUILD" | "MAIL" = "BUILD";
    try {
      const snapshot = await this.deps.collect(claim, workerId);
      if (leaseLost) { await discard(); return; }
      const archive = buildArchive(snapshot, this.deps.archiveCatalog(claim.locale));
      await store.write(claim.exportId, claim.userId, archive.zip);
      if (leaseLost) { await discard(); return; }
      const token = (this.deps.randomBytes ?? randomBytes)(32).toString("base64url");
      const tokenHash = hashToken("data-export-link", token);
      const handoffAt = (this.deps.now ?? (() => new Date()))();
      const expiresAt = new Date(handoffAt.getTime() + DATA_EXPORT_LINK_TTL_SECONDS * 1000);
      phase = "MAIL";
      await this.deps.mail.sendExportReady({
        exportId: claim.exportId,
        to: snapshot.recipient,
        locale: claim.locale,
        requestedAt: claim.requestedAt,
        expiresAt,
        downloadUrl: `${this.deps.publicAppUrl.replace(/\/+$/, "")}/export#${token}`
      });
      if (leaseLost) { await discard(); return; }
      const completed = await repository.complete({
        exportId: claim.exportId,
        workerId,
        linkTokenHash: tokenHash,
        archiveSha256: archive.sha256,
        archiveBytes: archive.bytes,
        sentAt: handoffAt
      });
      if (!completed) await discard();
    } catch {
      await discard();
      await repository.fail(claim.exportId, workerId, phase);
      this.deps.log?.(`[DATA_EXPORT_FAILED] ${claim.exportId} ${phase}`);
    } finally {
      clearInterval(timer);
      if (renewInFlight !== undefined) await renewInFlight;
    }
  }
}
