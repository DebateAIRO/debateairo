import { createHash } from "node:crypto";
import { renderYourDataHtml } from "./html-page.js";
import { renderReadme } from "./readme.js";
import type { ArchiveCatalog } from "./archive-catalog.js";
import type { ExportSnapshot } from "./types.js";
import { writeZip } from "./zip.js";

export const ARCHIVE_ENTRY_NAMES = [
  "README.txt", "manifest.json", "your-data.html", "account.json", "security.json", "consents.json",
  "debates.json", "billing.json", "support.json", "activity.json"
] as const;

const forbiddenKey = /hash|secret|public_key|credential_id|token|blind_index|audit_token|owner_ref|nonce|ciphertext/i;
function assertSafeKeys(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error(`DATA_EXPORT_FORBIDDEN_KEY:${key}`);
    assertSafeKeys(child);
  }
}
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");

function dataFile(section: object, generatedAt: string): Buffer {
  assertSafeKeys(section);
  return json({ format_version: 1, generated_at: generatedAt, ...section });
}

function records(section: object): number {
  return Object.values(section).reduce<number>((sum, value) =>
    sum + (Array.isArray(value) ? value.length : value === null ? 0 : 1), 0);
}

export function archiveFilename(requestedAt: Date): string {
  return `dialectical-engine-export-${requestedAt.toISOString().slice(0, 10)}.zip`;
}

export function buildArchive(snapshot: ExportSnapshot, catalog: ArchiveCatalog): { zip: Buffer; sha256: string; bytes: number; filename: string } {
  const generatedAt = snapshot.generatedAt.toISOString();
  const sectionByName = {
    "account.json": snapshot.account,
    "security.json": snapshot.security,
    "consents.json": snapshot.consents,
    "debates.json": snapshot.debates,
    "billing.json": snapshot.billing,
    "support.json": snapshot.support,
    "activity.json": snapshot.activity
  } as const;
  const payloads = new Map<string, Buffer>([
    ["README.txt", Buffer.from(renderReadme(), "utf8")],
    ["your-data.html", Buffer.from(renderYourDataHtml(snapshot, catalog), "utf8")]
  ]);
  for (const [name, section] of Object.entries(sectionByName)) payloads.set(name, dataFile(section, generatedAt));
  const manifestEntries = ARCHIVE_ENTRY_NAMES.filter((name) => name !== "manifest.json").map((name) => {
    const bytes = payloads.get(name)!;
    return { name, bytes: bytes.length, sha256: sha256(bytes), records: name.endsWith(".json") ? records(sectionByName[name as keyof typeof sectionByName]) : null };
  });
  payloads.set("manifest.json", json({ format_version: 1, generated_at: generatedAt, entries: manifestEntries }));
  const zip = writeZip(ARCHIVE_ENTRY_NAMES.map((name) => ({ name, bytes: payloads.get(name)! })), snapshot.generatedAt);
  return { zip, sha256: sha256(zip), bytes: zip.length, filename: archiveFilename(snapshot.requestedAt) };
}
