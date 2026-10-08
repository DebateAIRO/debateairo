import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@debateai/crypto";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { FileDataExportStore } from "../../apps/api/src/data-export/store.js";
import type { ExportClaim } from "../../apps/api/src/data-export/snapshot.js";
import type { ExportSnapshot } from "../../apps/api/src/data-export/types.js";
import { DataExportApplication } from "../../apps/api/src/data-export/service.js";
import * as serviceModule from "../../apps/api/src/data-export/service.js";
import { MemoryDataExportRepository } from "../support/data-export-memory-repository.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GRANT = "g".repeat(43);
const SOURCE = { ip: "127.0.0.1", userAgent: "service-test", requestId: "request-1" } as const;
const START = new Date("2026-10-08T12:00:00.000Z");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const dirs: string[] = [];

function snapshotA(claim: ExportClaim, now: Date): ExportSnapshot {
  return {
    exportId: claim.exportId, userId: claim.userId, locale: claim.locale,
    requestedAt: claim.requestedAt, generatedAt: now, recipient: "recipient@example.test",
    account: { account: { pseudonym: "snapshot-a", email: "recipient@example.test", created_at: START.toISOString() }, channels: [], registration_region: null, age_checks: [], erasure_requests: [] },
    security: { mfa_factors: [], passkeys: [], recovery_codes: null, sessions: [], social_identities: [], email_changes: [], recovery_email_changes: [], recovery_requests: [] },
    consents: { legal_acceptances: [], sensitive_data_consents: [] },
    debates: { debates: [] },
    billing: { customers: [], customer_xmoney: [], customer_profile_events: [], quotes: [], subscription_events: [], entitlement_events: [], run_charge_scopes: [], charges: [], internal_grants: [], withdrawal_owner_settlements: [], charge_events: [], quote_uses: [], invoice_intents: [], invoices: [], location_evidence: [] },
    support: { sessions: [], cases: [] }, activity: { events: [] }
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "data-export-service-"));
  dirs.push(directory);
  let clock = new Date(START);
  const now = () => new Date(clock);
  const repository = new MemoryDataExportRepository(now);
  repository.grant(USER, SESSION, hashToken("step-up-grant", GRANT));
  const store = new FileDataExportStore({ directory, users: { load: async () => Buffer.alloc(32, 7) } });
  const mails: Array<{ exportId: string; to: string; locale: string; requestedAt: Date; expiresAt: Date; downloadUrl: string; storedIds: string[] }> = [];
  const logs: string[] = [];
  let collect: (claim: ExportClaim) => Promise<ExportSnapshot> = async (claim) => snapshotA(claim, now());
  let send: () => Promise<void> = async () => {};
  const app = new DataExportApplication({
    repository, store, collect: (claim) => collect(claim), archiveCatalog: loadArchiveCatalog,
    mail: { sendExportReady: async (input) => { mails.push({ ...input, storedIds: await store.listIds() }); await send(); } },
    publicAppUrl: "https://app.test", workerId: "worker-a", now,
    randomBytes: (length) => { expect(length).toBe(32); return Buffer.alloc(32, 0x31); },
    log: (line) => logs.push(line)
  });
  const request = () => app.request({ userId: USER, sessionId: SESSION, grantToken: GRANT, locale: "en", source: SOURCE });
  return {
    app, repository, store, directory, mails, logs, request, now,
    setNow: (value: Date) => { clock = new Date(value); },
    setCollect: (fn: typeof collect) => { collect = fn; },
    setSend: (fn: typeof send) => { send = fn; },
    latest: () => [...repository.rows.values()].at(-1)!,
    token: () => mails.at(-1)!.downloadUrl.split("#")[1]!
  };
}

afterEach(async () => {
  vi.useRealTimers();
  for (const directory of dirs.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("data export application", () => {
  it("V-1 mails the stored archive with one handoff clock value for mail and row", async () => {
    const f = await fixture();
    await f.request();
    await f.app.runOnce();
    const row = f.latest();
    expect(f.mails).toHaveLength(1);
    expect(f.mails[0]).toMatchObject({ to: "recipient@example.test", storedIds: [row.exportId] });
    expect(f.mails[0]!.downloadUrl).toMatch(/^https:\/\/app\.test\/export#[A-Za-z0-9_-]{43}$/);
    expect(row.sentAt).toEqual(f.now());
    expect(row.expiresAt).toEqual(new Date(f.now().getTime() + 86_400_000));
    expect(f.mails[0]!.expiresAt).toEqual(row.expiresAt);
  });

  it("V-2 keeps the 32-byte link token out of repository arguments and logs", async () => {
    const f = await fixture();
    await f.request();
    await f.app.runOnce();
    const token = f.token();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).toBe(Buffer.alloc(32, 0x31).toString("base64url"));
    expect(f.latest().linkTokenHash).toBe(hashToken("data-export-link", token));
    expect(JSON.stringify(f.repository.calls)).not.toContain(token);
    expect(f.logs.join("\n")).not.toContain(token);
  });

  it("V-3 marks a decrypt failure BUILD and leaves no archive or mail", async () => {
    const f = await fixture();
    f.setCollect(async () => { throw new Error("DATA_EXPORT_DECRYPT_FAILED"); });
    await f.request(); await f.app.runOnce();
    expect(f.latest()).toMatchObject({ status: "FAILED", failureReason: "BUILD" });
    expect(f.mails).toHaveLength(0);
    expect(await f.store.listIds()).toEqual([]);
    await f.app.runOnce();
    expect(f.repository.calls.filter((call) => call.method === "claim")).toHaveLength(2);
    expect(f.mails).toHaveLength(0);
  });

  it("V-4 marks mail rejection MAIL and removes the built archive", async () => {
    const f = await fixture();
    f.setSend(async () => { throw new Error("mail offline"); });
    await f.request(); await f.app.runOnce();
    expect(f.latest()).toMatchObject({ status: "FAILED", failureReason: "MAIL" });
    expect(await f.store.listIds()).toEqual([]);
  });

  it("V-5 stops before mail when renewal loses the lease during collection", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    let entered!: () => void;
    const collecting = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    f.setCollect(async (claim) => { entered(); await new Promise<void>((resolve) => { release = resolve; }); return snapshotA(claim, f.now()); });
    f.repository.renewResult = false;
    await f.request();
    const work = f.app.runOnce();
    await collecting;
    await vi.advanceTimersByTimeAsync(15_000);
    release();
    await work;
    expect(f.mails).toHaveLength(0);
    expect(f.latest().status).toBe("PREPARING");
    expect(await f.store.listIds()).toEqual([]);
  });

  it("V-6 reclaims a lapsed lease at attempt 2 and fails attempt 4", async () => {
    const f = await fixture();
    const first = f.repository.seedPreparing({ userId: USER, sessionId: SESSION, attempt: 1, leaseUntil: new Date(START.getTime() - 1) });
    await f.app.runOnce();
    expect(first.attempt).toBe(2);
    expect(first.status).toBe("SENT");
    const second = f.repository.seedPreparing({ userId: OTHER, sessionId: SESSION, attempt: 3, leaseUntil: new Date(START.getTime() - 1) });
    await f.store.write(second.exportId, OTHER, Buffer.from("partial attempt"));
    await f.app.runOnce();
    expect(second).toMatchObject({ attempt: 4, status: "FAILED", failureReason: "ATTEMPTS" });
    expect(await f.store.listIds()).not.toContain(second.exportId);
    expect(f.mails).toHaveLength(1);
  });

  it("V-7 destroys the key and archive when a SENT link reaches expiry", async () => {
    const f = await fixture();
    const row = f.repository.seedSent({ userId: USER, expiresAt: f.now() });
    await f.store.write(row.exportId, USER, Buffer.from("old zip"));
    await f.app.runOnce();
    expect(row.keyDestroyed).toBe(true);
    expect(await f.store.listIds()).toEqual([]);
    expect(f.repository.calls.some((call) => call.method === "markKeyDestroyed" && call.exportId === row.exportId)).toBe(true);
  });

  it("V-8 supersedes an old SENT link and sweeps its files on the next tick", async () => {
    const f = await fixture();
    const old = f.repository.seedSent({ userId: USER, expiresAt: new Date(START.getTime() + 60_000) });
    await f.store.write(old.exportId, USER, Buffer.from("old zip"));
    expect((await f.request()).kind).toBe("ACCEPTED");
    expect(old.status).toBe("SUPERSEDED");
    await f.app.runOnce();
    expect(old.keyDestroyed).toBe(true);
    expect(await f.store.listIds()).not.toContain(old.exportId);
  });

  it("V-9 cancels PREPARING and SENT exports when erasure starts", async () => {
    const f = await fixture();
    const preparing = f.repository.seedPreparing({ userId: USER, sessionId: SESSION });
    const sent = f.repository.seedSent({ userId: USER, expiresAt: new Date(START.getTime() + 60_000) });
    await f.store.write(sent.exportId, USER, Buffer.from("old zip"));
    f.repository.setProcessing(USER, true);
    await f.app.runOnce();
    expect(preparing.status).toBe("CANCELLED");
    expect(sent.status).toBe("CANCELLED");
    expect(await f.store.listIds()).toEqual([]);
    expect(f.mails).toHaveLength(0);
  });

  it("V-10 deletes a file pair with no live repository row", async () => {
    const f = await fixture();
    const orphan = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await f.store.write(orphan, USER, Buffer.from("orphan"));
    await f.app.runOnce();
    expect(await f.store.listIds()).toEqual([]);
  });

  it("V-11 returns identical checked bytes for repeated valid downloads", async () => {
    const f = await fixture();
    await f.request(); await f.app.runOnce();
    const first = await f.app.download(USER, f.token(), SOURCE);
    const second = await f.app.download(USER, f.token(), SOURCE);
    expect(first.kind).toBe("OK"); expect(second.kind).toBe("OK");
    if (first.kind !== "OK" || second.kind !== "OK") return;
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(sha256(first.bytes)).toBe(f.latest().archiveSha256);
    expect(first.filename).toBe("dialectical-engine-export-2026-10-08.zip");
    expect(f.repository.calls.filter((call) => call.method === "recordDownload")).toHaveLength(2);
  });

  it("V-12 returns WRONG_ACCOUNT, INVALID and HELD without recording a download", async () => {
    const f = await fixture();
    await f.request(); await f.app.runOnce();
    expect(await f.app.download(OTHER, f.token(), SOURCE)).toEqual({ kind: "WRONG_ACCOUNT" });
    expect(await f.app.download(USER, "A".repeat(43), SOURCE)).toEqual({ kind: "INVALID" });
    f.repository.setHeld(USER, true);
    expect(await f.app.download(USER, f.token(), SOURCE)).toEqual({ kind: "HELD" });
    expect(f.repository.calls.filter((call) => call.method === "recordDownload")).toHaveLength(0);
  });

  it("V-13 leaves the link usable after a missing key or corrupt ciphertext", async () => {
    const f = await fixture();
    await f.request(); await f.app.runOnce();
    const id = f.latest().exportId;
    const keyPath = join(f.directory, `${id}.key`);
    await rename(keyPath, `${keyPath}.held`);
    expect(await f.app.download(USER, f.token(), SOURCE)).toEqual({ kind: "UNAVAILABLE" });
    await rename(`${keyPath}.held`, keyPath);
    const archivePath = join(f.directory, `${id}.zip.enc`);
    const original = await readFile(archivePath);
    const flipped = Buffer.from(original);
    flipped[Math.floor(flipped.length / 2)]! ^= 1;
    await writeFile(archivePath, flipped);
    expect(await f.app.download(USER, f.token(), SOURCE)).toEqual({ kind: "UNAVAILABLE" });
    expect(f.repository.calls.filter((call) => call.method === "recordDownload")).toHaveLength(0);
    await writeFile(archivePath, original);
    const sha = f.latest().archiveSha256;
    f.latest().archiveSha256 = "0".repeat(64);
    expect(await f.app.download(USER, f.token(), SOURCE)).toEqual({ kind: "UNAVAILABLE" });
    f.latest().archiveSha256 = sha;
    expect((await f.app.download(USER, f.token(), SOURCE)).kind).toBe("OK");
    expect(f.repository.calls.filter((call) => call.method === "recordDownload")).toHaveLength(1);
  });

  it("V-14 keeps timing limits private and renews a 45-second lease after 15 seconds", async () => {
    expect(Object.keys(serviceModule).filter((key) => key.startsWith("DATA_EXPORT_"))).toEqual([]);
    vi.useFakeTimers();
    const f = await fixture();
    let entered!: () => void;
    const collecting = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    f.setCollect(async (claim) => { entered(); await new Promise<void>((resolve) => { release = resolve; }); return snapshotA(claim, f.now()); });
    await f.request();
    const work = f.app.runOnce();
    await collecting;
    expect(f.latest().leaseUntil).toEqual(new Date(f.now().getTime() + 45_000));
    expect(f.repository.calls.filter((call) => call.method === "renewLease")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(f.repository.calls.filter((call) => call.method === "renewLease")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.repository.calls.filter((call) => call.method === "renewLease")).toHaveLength(1);
    release();
    await work;
  });
});
