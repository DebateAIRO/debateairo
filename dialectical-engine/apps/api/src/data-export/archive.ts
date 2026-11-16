import { createHash } from "node:crypto";
import { ACCOUNT_AI_SCOPE, DEBATES_AI_SCOPE, SUPPORT_AI_SCOPE, exportAiDisclosure, type ExportAiDisclosure } from "./ai-disclosure.js";
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

/**
 * EU AI Act Art. 50(2): the data files holding AI-generated content, and the scope each one's `ai_disclosure` names.
 * The record sits beside the file's sections, never inside one, so no recorded value and no record count changes.
 */
const AI_SCOPE_BY_FILE: Readonly<Partial<Record<string, string>>> = {
  "account.json": ACCOUNT_AI_SCOPE, "debates.json": DEBATES_AI_SCOPE, "support.json": SUPPORT_AI_SCOPE
};

/** For machines (manifest.json): every entry that holds AI-generated content, the readable page included. */
const AI_GENERATED_ENTRIES = ["your-data.html", "account.json", "debates.json", "support.json"] as const;

function dataFile(section: object, generatedAt: string, aiDisclosure: ExportAiDisclosure | null): Buffer {
  assertSafeKeys(section);
  return json({ format_version: 1, generated_at: generatedAt, ...(aiDisclosure === null ? {} : { ai_disclosure: aiDisclosure }), ...section });
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
  for (const [name, section] of Object.entries(sectionByName)) {
    const scope = AI_SCOPE_BY_FILE[name];
    payloads.set(name, dataFile(section, generatedAt, scope === undefined ? null : exportAiDisclosure(scope)));
  }
  const manifestEntries = ARCHIVE_ENTRY_NAMES.filter((name) => name !== "manifest.json").map((name) => {
    const bytes = payloads.get(name)!;
    return { name, bytes: bytes.length, sha256: sha256(bytes), records: name.endsWith(".json") ? records(sectionByName[name as keyof typeof sectionByName]) : null };
  });
  payloads.set("manifest.json", json({ format_version: 1, generated_at: generatedAt, entries: manifestEntries, ai_generated_entries: AI_GENERATED_ENTRIES }));
  const zip = writeZip(ARCHIVE_ENTRY_NAMES.map((name) => ({ name, bytes: payloads.get(name)! })), snapshot.generatedAt);
  return { zip, sha256: sha256(zip), bytes: zip.length, filename: archiveFilename(snapshot.requestedAt) };
}
