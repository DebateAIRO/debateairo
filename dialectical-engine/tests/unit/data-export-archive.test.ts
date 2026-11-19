import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildArchive, ARCHIVE_ENTRY_NAMES, archiveFilename } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { README_EXCLUSION_LINES } from "../../apps/api/src/data-export/readme.js";
import { AI_EXPORT_DISCLOSURE } from "../../apps/ui/lib/aiDisclosure.js";
import { snapshotA } from "../fixtures/data-export/snapshot-a.js";
import { readZip } from "../support/zip-reader.js";

const names = ["README.txt", "manifest.json", "your-data.html", "account.json", "security.json", "consents.json",
  "debates.json", "billing.json", "support.json", "activity.json"];
const sections: Record<string, string[]> = {
  "account.json": ["account", "channels", "registration_region", "age_checks", "erasure_requests", "reading_level", "debate_visits", "dig_links", "investigations", "reserve_events", "question_readings", "before_start_readings", "reports_you_made", "moderation_notices", "earlier_moderation_notices",
    // V4 start step, Task 39e: the questions not started yet.
    "questions_not_started"],
  "security.json": ["mfa_factors", "passkeys", "recovery_codes", "sessions", "social_identities", "email_changes", "recovery_email_changes", "recovery_requests"],
  "consents.json": ["legal_acceptances", "sensitive_data_consents"],
  "debates.json": ["debates", "web_sources"],
  "billing.json": ["customers", "customer_xmoney", "customer_profile_events", "quotes", "subscription_events", "entitlement_events", "run_charge_scopes", "charges", "internal_grants", "withdrawal_owner_settlements", "charge_events", "quote_uses", "invoice_intents", "invoices", "location_evidence"],
  "support.json": ["sessions", "cases"],
  "activity.json": ["events"]
};
const AI_GENERATED_JSON = ["account.json", "debates.json", "support.json"];
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
      // EU AI Act Art. 50(2): the two files holding AI-generated content carry the export's ai_disclosure record.
      const disclosed = AI_GENERATED_JSON.includes(name) ? ["ai_disclosure"] : [];
      expect(Object.keys(JSON.parse(files.find((item) => item.name === name)!.bytes.toString()))).toEqual(["format_version", "generated_at", ...disclosed, ...keys]);
    }
    expect(Object.keys(JSON.parse(files[1]!.bytes.toString()))).toEqual(["format_version", "generated_at", "entries", "ai_generated_entries"]);
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
        // The ai_disclosure record describes the file; it is not one of its records.
        const values = Object.entries(data).filter(([key]) => !["format_version", "generated_at", "ai_disclosure"].includes(key)).map(([, value]) => value);
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

  it("A-13 (EU AI Act Art. 50(2)) marks account.json, debates.json and support.json with the debate download's ai_disclosure scheme", () => {
    const files = archive();
    const parsed = (name: string) => JSON.parse(files.find((entry) => entry.name === name)!.bytes.toString("utf8"));
    // debates.json: the very record the debate's JSON download carries, value for value.
    expect(parsed("debates.json").ai_disclosure).toEqual(AI_EXPORT_DISCLOSURE);
    // support.json: the same record, its scope naming what is generated there (the assistant's replies and case
    // summaries), never the person's own messages.
    expect(parsed("support.json").ai_disclosure).toEqual({
      ...AI_EXPORT_DISCLOSURE,
      scope: "Support assistant replies (session messages with role \"assistant\", also as copied into a case's transcript_snapshot) "
        + "and case summaries; excludes the user's own messages, replies written by a person (case messages with role \"V\") and operational records."
    });
    // account.json: the AI's words among the questions not started yet; the readings' rows hold only times and kinds.
    expect(parsed("account.json").ai_disclosure).toEqual({
      ...AI_EXPORT_DISCLOSURE,
      scope: "In questions_not_started: the AI's reading of each question (read_question), its clarifying questions and the "
        + "answer options picked from them (answers), and its suggested paths (paths, other_suggestions) except those the user "
        + "worded, which own_words lists; excludes the user's own question, typed answers and own words, and every other record. "
        + "question_readings and before_start_readings record only when an AI ran and which kind, not what it wrote."
    });
    // Additive only: the recorded values are the snapshot's own, unaltered.
    expect(parsed("debates.json").debates).toEqual(JSON.parse(JSON.stringify(snapshotA.debates.debates)));
    expect(parsed("support.json").sessions).toEqual(JSON.parse(JSON.stringify(snapshotA.support.sessions)));
    expect(parsed("account.json").questions_not_started).toEqual(JSON.parse(JSON.stringify(snapshotA.account.questions_not_started)));
    expect(parsed("account.json").account).toEqual(JSON.parse(JSON.stringify(snapshotA.account.account)));
    // No other data file says it holds generated content.
    for (const name of Object.keys(sections).filter((item) => !AI_GENERATED_JSON.includes(item))) {
      expect(Object.hasOwn(parsed(name), "ai_disclosure"), name).toBe(false);
    }
    // The manifest, for machines, lists the entries that hold AI-generated content, in the archive's order.
    expect(parsed("manifest.json").ai_generated_entries).toEqual(["your-data.html", "account.json", "debates.json", "support.json"]);
  });

  it("A-8 names the ZIP from the UTC request date", () => {
    expect(archiveFilename(new Date("2026-10-09T04:30:00Z"))).toBe("dialectical-engine-export-2026-10-09.zip");
    expect(archiveFilename(new Date("2026-10-08T23:59:59Z"))).toBe("dialectical-engine-export-2026-10-08.zip");
  });
  it("A-9 README names every entry and every exclusion", () => {
    const readme = archive()[0]!.bytes.toString("utf8");
    for (const name of names) expect(readme).toContain(name);
    // 0132/0133 (the Perplexity plan) add W1 (page texts) and W2 (charges, digests, packs).
    expect(README_EXCLUSION_LINES).toHaveLength(13);
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
