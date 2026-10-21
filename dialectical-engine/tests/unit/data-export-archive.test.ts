import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildArchive, ARCHIVE_ENTRY_NAMES, archiveFilename } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { README_EXCLUSION_LINES } from "../../apps/api/src/data-export/readme.js";
import { snapshotA } from "../fixtures/data-export/snapshot-a.js";
import { readZip } from "../support/zip-reader.js";

const names = ["README.txt", "manifest.json", "your-data.html", "account.json", "security.json", "consents.json",
  "debates.json", "billing.json", "support.json", "activity.json"];
const sections: Record<string, string[]> = {
  "account.json": ["account", "channels", "registration_region", "age_checks", "erasure_requests", "kept_questions"],
  "security.json": ["mfa_factors", "passkeys", "recovery_codes", "sessions", "social_identities", "email_changes", "recovery_email_changes", "recovery_requests"],
  "consents.json": ["legal_acceptances", "sensitive_data_consents"],
  "debates.json": ["debates"],
  "billing.json": ["customers", "customer_xmoney", "customer_profile_events", "quotes", "subscription_events", "entitlement_events", "run_charge_scopes", "charges", "internal_grants", "withdrawal_owner_settlements", "charge_events", "quote_uses", "invoice_intents", "invoices", "location_evidence"],
  "support.json": ["sessions", "cases"],
  "activity.json": ["events"]
};
const archive = () => readZip(buildArchive(snapshotA, loadArchiveCatalog("en")).zip);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("data export archive", () => {
  it("A-1 has the ten R21 entries in order", () => {
    expect(ARCHIVE_ENTRY_NAMES).toEqual(names);
    expect(archive().map((entry) => entry.name)).toEqual(names);
  });
  it("A-2 writes canonical pretty JSON with version and build time", () => {
    for (const entry of archive().filter((item) => item.name.endsWith(".json"))) {
      const parsed = JSON.parse(entry.bytes.toString("utf8"));
      expect(parsed.format_version).toBe(1);
      expect(parsed.generated_at).toBe("2026-10-09T00:15:00.000Z");
      expect(entry.bytes.toString("utf8")).toBe(JSON.stringify(parsed, null, 2) + "\n");
    }
  });
  it("A-3 has exactly the declared top-level keys", () => {
    const files = archive();
    for (const [name, keys] of Object.entries(sections)) {
      expect(Object.keys(JSON.parse(files.find((item) => item.name === name)!.bytes.toString()))).toEqual(["format_version", "generated_at", ...keys]);
    }
    expect(Object.keys(JSON.parse(files[1]!.bytes.toString()))).toEqual(["format_version", "generated_at", "entries"]);
  });
  it("A-4 manifest measures all nine other entries", () => {
    const files = archive();
    const manifest = JSON.parse(files[1]!.bytes.toString());
    expect(manifest.entries).toHaveLength(9);
    for (let i = 0; i < manifest.entries.length; i++) {
      const entry = files.filter((item) => item.name !== "manifest.json")[i]!;
      const row = manifest.entries[i];
      expect(Object.keys(row)).toEqual(["name", "bytes", "sha256", "records"]);
      expect(row.name).toBe(entry.name);
      expect(row.bytes).toBe(entry.bytes.length);
      expect(row.sha256).toBe(hash(entry.bytes));
      if (entry.name.endsWith(".json")) {
        const data = JSON.parse(entry.bytes.toString());
        const values = Object.entries(data).filter(([key]) => !["format_version", "generated_at"].includes(key)).map(([, value]) => value);
        expect(row.records).toBe(values.reduce((sum: number, value) => sum + (Array.isArray(value) ? value.length : value === null ? 0 : 1), 0));
      } else expect(row.records).toBeNull();
    }
    const presentCount = (name: string): number => manifest.entries.find((entry: { name: string }) => entry.name === name).records;
    expect(presentCount("account.json")).toBe(2);
    expect(presentCount("security.json")).toBe(1);
    const nullSnapshot = {
      ...snapshotA,
      account: { ...snapshotA.account, registration_region: null },
      security: { ...snapshotA.security, recovery_codes: null }
    };
    const nullFiles = readZip(buildArchive(nullSnapshot, loadArchiveCatalog("en")).zip);
    const nullManifest = JSON.parse(nullFiles.find((entry) => entry.name === "manifest.json")!.bytes.toString());
    const nullCount = (name: string): number => nullManifest.entries.find((entry: { name: string }) => entry.name === name).records;
    expect(nullCount("account.json")).toBe(1);
    expect(nullCount("security.json")).toBe(0);
    expect(JSON.parse(nullFiles.find((entry) => entry.name === "account.json")!.bytes.toString()).registration_region).toBeNull();
    expect(JSON.parse(nullFiles.find((entry) => entry.name === "security.json")!.bytes.toString()).recovery_codes).toBeNull();
  });
  it("A-5 keeps empty billing and support arrays", () => {
    for (const entry of archive().filter((item) => ["billing.json", "support.json"].includes(item.name))) {
      const parsed = JSON.parse(entry.bytes.toString());
      for (const key of sections[entry.name]!) expect(parsed[key]).toEqual([]);
    }
  });
  it("A-6 has no forbidden JSON key at any depth in data files", () => {
    const forbidden = /hash|secret|public_key|credential_id|token|blind_index|audit_token|owner_ref|nonce|ciphertext/i;
    const keys = (value: unknown): string[] => value && typeof value === "object" ?
      Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
    for (const entry of archive().filter((item) => Object.hasOwn(sections, item.name))) {
      expect(keys(JSON.parse(entry.bytes.toString())).filter((key) => forbidden.test(key))).toEqual([]);
    }
  });
  it("A-7 uses exactly ten keys for unrecoverable debates", () => {
    const data = JSON.parse(archive().find((entry) => entry.name === "debates.json")!.bytes.toString());
    expect(Object.keys(data.debates[2])).toEqual(["reference", "content_status", "created_at", "deleted_at", "tier", "depth", "plan_tier", "state", "visibility_history", "role_rotation"]);
    expect(data.debates.slice(0, 2).map((entry: { content_status: string }) => entry.content_status)).toEqual(["READABLE", "READABLE"]);
  });
  it("A-12 (V-42) carries role_rotation on every debate as the snapshot gives it, null when none", () => {
    const data = JSON.parse(archive().find((entry) => entry.name === "debates.json")!.bytes.toString());
    expect(data.debates.map((entry: { role_rotation: unknown }) => entry.role_rotation)).toEqual(snapshotA.debates.debates.map((entry) => entry.role_rotation));
    expect(data.debates.map((entry: { role_rotation: unknown }) => entry.role_rotation === null)).toEqual([false, true, false]);
  });

  it("A-8 names the ZIP from the UTC request date", () => {
    expect(archiveFilename(new Date("2026-10-09T04:30:00Z"))).toBe("dialectical-engine-export-2026-10-09.zip");
    expect(archiveFilename(new Date("2026-10-08T23:59:59Z"))).toBe("dialectical-engine-export-2026-10-08.zip");
  });
  it("A-9 README names every entry and every exclusion", () => {
    const readme = archive()[0]!.bytes.toString("utf8");
    for (const name of names) expect(readme).toContain(name);
    expect(README_EXCLUSION_LINES).toHaveLength(11);
    for (const line of README_EXCLUSION_LINES) expect(readme).toContain(line);
    expect(readme).toContain("Your date of birth is never stored.");
    expect(readme).toContain("Cookie choices are stored only in your browser, never on our servers.");
  });
  it("A-10 keeps the fixture account state inside the producer's database value domain", () => {
    const data = JSON.parse(archive().find((entry) => entry.name === "account.json")!.bytes.toString("utf8"));
    expect(data.account.state).toMatch(/^(pending_verification|active|suspended|deleted)$/);
  });

  it("A-11 gives the fixture account the required adult affirmation timestamp", () => {
    const data = JSON.parse(archive().find((entry) => entry.name === "account.json")!.bytes.toString("utf8"));
    expect(data.account.adult_affirmed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
