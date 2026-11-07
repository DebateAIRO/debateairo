/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §3.9; owner answer S4 A): THE QUESTIONS NOT STARTED YET IN THE DATA EXPORT.
 * account.json gains `questions_not_started` (never `kept_questions`, which the threat reports already use): per question, the question
 * as it reads, the line the AIs read, the answers, the paths and the other suggestions, How wide, Quick look or Thorough, the carry-on
 * tick, and when it was first and last saved, each opened under the question's own key. No signed reference, hash, key name or envelope
 * goes out. A question whose key is gone is deleted in effect and left out; a key that is there but does not open fails the export.
 * The worker reaches 0162's reader: its function count is one more. Every question here is made up.
 */
import { describe, expect, it } from "vitest";
import { KEEP_COLUMNS, RAW_SECTIONS, collectSnapshot, type ExportDecryptors } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { renderReadme } from "../../apps/api/src/data-export/readme.js";
import { MemorySavedQuestionKeyStore, SavedQuestionKeyUnresolvedError, generateDek } from "../../packages/crypto/src/index.js";
import { assertDataExportDatabaseRoles, PostgresDataExportSource } from "../../packages/db/src/data-export.js";
import { createSavedQuestionService, savedQuestionOpener, type SavedQuestionGate } from "../../apps/api/src/saved-questions/service.js";
import {
  FakeSavedQuestionStore, MemoryUserDekStore, SAVED_BOX_TEXT, SAVED_Q, SAVED_TRAILING_TITLE, newSavedPerson, newStartStepKey, savedDocOf,
  savedOwnPath, savedScopeOf, savedSigner
} from "../support/saved-questions.js";
import { readZip } from "../support/zip-reader.js";

const KEY = newStartStepKey();
const ANA = newSavedPerson();
const ANA_SIGNS = savedSigner(KEY, ANA);
const GATE: SavedQuestionGate = { teamAdmits: true, consentGiven: async () => true,
  bindingOf: async () => ({ ownerScope: savedScopeOf(ANA), planKey: "premium" }) };

async function world() {
  const store = new FakeSavedQuestionStore();
  const users = new MemoryUserDekStore();
  await users.store(ANA.userId, generateDek());
  const keys = new MemorySavedQuestionKeyStore(users);
  const service = createSavedQuestionService({ store, keys, key: KEY, report: () => undefined });
  return { store, keys, service };
}

function rawRows(savedQuestions: unknown[]) {
  const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map((section) => [section, []]));
  raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null, phone_source: null,
    phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z", adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
  raw.registration_region = null;
  raw.recovery_codes = null;
  raw.page_reading_level = null;
  raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map((key) => [key, []]));
  raw.saved_questions = savedQuestions;
  return raw;
}

async function collect(raw: Record<string, unknown>, openSavedQuestion: ExportDecryptors["openSavedQuestion"]) {
  return collectSnapshot({
    claim: { exportId: "export", userId: ANA.userId, ownerRef: ANA.ownerRef, sessionId: "session", locale: "en",
      requestedAt: new Date("2026-11-05T10:00:00.000Z"), attempt: 1 }, workerId: "worker",
    source: { readRaw: async () => raw as never }, ownerView: {} as never,
    decrypt: { openPublicFlag: async () => { throw new Error("no report in this fixture"); }, openUserField: async () => "ada@example.test",
      openRecord: () => "", openSupport: async () => "", openRunContent: async () => [], ...(openSavedQuestion === undefined ? {} : { openSavedQuestion }) },
    now: () => new Date("2026-11-05T11:00:00.000Z")
  });
}

describe("the questions not started yet in account.json", () => {
  it("holds each question, its answers, paths, How wide, mode, carry-on and both times, opened with each question's own key", async () => {
    const w = await world();
    const first = savedDocOf(ANA_SIGNS);
    const second = savedDocOf(ANA_SIGNS, { page: { width: 3, mode: "quick", carry_on: false,
      sent_goal: { answers: [{ question: "What is the answer for?", answer: "For my town council", other: true }] } },
    plan: { paths: [savedOwnPath("p1", "What about the workers?")], more: [] } });
    const one = await w.service.create(ANA, { doc: first }, GATE);
    const two = await w.service.create(ANA, { doc: second }, GATE);
    await w.service.save(ANA, one.id, { revision: 1, doc: first }, GATE);
    const snapshot = await collect(rawRows(w.store.exportRows(ANA.ownerRef)), savedQuestionOpener(w.keys));
    const [a, b] = snapshot.account.questions_not_started;
    expect(snapshot.account.questions_not_started).toHaveLength(2);
    expect(a).toEqual({
      question: SAVED_BOX_TEXT, read_question: SAVED_Q,
      answers: [{ question: "Up to when?", answer: "Up to 2050" }],
      paths: first.page.plan.paths.map((path) => ({ title: path.title, question: path.question })),
      other_suggestions: first.page.plan.more.map((path) => ({ title: path.title, question: path.question })),
      how_wide: 5, mode: "thorough", carry_on_to_report: true,
      created_at: w.store.rows.get(one.id)!.createdAt.toISOString(), saved_at: w.store.rows.get(one.id)!.updatedAt.toISOString()
    });
    expect((a!.paths as { title: string }[])[0]!.title).toBe(SAVED_TRAILING_TITLE);
    expect(b).toMatchObject({ answers: [{ question: "What is the answer for?", answer: "For my town council" }],
      paths: [{ title: "What about the workers?", question: "What about the workers?" }], other_suggestions: [], how_wide: 3, mode: "quick",
      carry_on_to_report: false, created_at: w.store.rows.get(two.id)!.createdAt.toISOString() });
  });

  it("carries no reference, hash, key name or envelope: the archive's forbidden-key scan passes and no value names saved-question:", async () => {
    const w = await world();
    await w.service.create(ANA, { doc: savedDocOf(ANA_SIGNS) }, GATE);
    const snapshot = await collect(rawRows(w.store.exportRows(ANA.ownerRef)), savedQuestionOpener(w.keys));
    const archive = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip);
    const text = archive.find((entry) => entry.name === "account.json")!.bytes.toString("utf8");
    const account = JSON.parse(text);
    expect(account.questions_not_started).toHaveLength(1);
    expect(text).not.toContain("saved-question:");
    expect(text).not.toMatch(/\.sig|"ref"|menu_id|"check"|ciphertext|keyId|"nonce"/u);
    expect(Object.keys(account.questions_not_started[0]).sort()).toEqual(["answers", "carry_on_to_report", "created_at", "how_wide", "mode",
      "other_suggestions", "paths", "question", "read_question", "saved_at"]);
    expect(account).not.toHaveProperty("saved_questions");
    expect(account.kept_questions).toEqual([]);
  });

  it("a question whose key is gone is left out and the export succeeds; a key that is there but does not open fails it", async () => {
    const w = await world();
    const kept = await w.service.create(ANA, { doc: savedDocOf(ANA_SIGNS) }, GATE);
    const lost = await w.service.create(ANA, { doc: savedDocOf(ANA_SIGNS) }, GATE);
    await w.keys.destroy(lost.id);
    const rows = w.store.exportRows(ANA.ownerRef);
    const snapshot = await collect(rawRows(rows), savedQuestionOpener(w.keys));
    expect(snapshot.account.questions_not_started).toHaveLength(1);
    expect(rows.map((row) => row.saved_question_id)).toEqual([kept.id, lost.id]);
    const broken = Object.assign(Object.create(w.keys) as MemorySavedQuestionKeyStore, {
      exists: async () => true, load: async () => { throw new SavedQuestionKeyUnresolvedError(); } });
    await expect(collect(rawRows(rows), savedQuestionOpener(broken))).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
    // Without the decryptor a row cannot be opened, so the export fails too rather than leave it out.
    await expect(collect(rawRows(rows), undefined)).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });

  it("the opener zeroes every question key it loads once the part is open (the user key is zeroed inside the store)", async () => {
    // Review of Task 39e: the Global Constraints' zeroing rule holds for the export's opener too, not only for the service.
    const w = await world();
    await w.service.create(ANA, { doc: savedDocOf(ANA_SIGNS) }, GATE);
    await w.service.create(ANA, { doc: savedDocOf(ANA_SIGNS) }, GATE);
    const loaded: Buffer[] = [];
    const load = w.keys.load.bind(w.keys);
    const watched = Object.assign(Object.create(w.keys) as MemorySavedQuestionKeyStore, {
      exists: (id: string) => w.keys.exists(id),
      load: async (id: string, identity: Readonly<{ userId: string; ownerRef: string }>) => {
        const key = await load(id, identity);
        loaded.push(key);
        return key;
      } });
    const snapshot = await collect(rawRows(w.store.exportRows(ANA.ownerRef)), savedQuestionOpener(watched));
    expect(snapshot.account.questions_not_started).toHaveLength(2);
    expect(loaded).toHaveLength(2);
    for (const key of loaded) {
      expect(key.byteLength).toBe(32);
      expect([...key].every((byte) => byte === 0)).toBe(true);
    }
  });

  it("an export with no rows has questions_not_started: []", async () => {
    const snapshot = await collect(rawRows([]), undefined);
    expect(snapshot.account.questions_not_started).toEqual([]);
  });

  it("the README names them on account.json's line", () => {
    expect(renderReadme()).toContain("each statement of reasons in full, and the earlier notices we emailed. It also holds the questions you have not started yet, "
      + "with your answers and paths.");
  });
});

describe("the worker reads 0162's reader", () => {
  it("as one more function in its role witness (twenty-five, after 0157's moderation reader), and beside the snapshot in readRaw", async () => {
    const seen: unknown[][] = [];
    const principal = (name: string, workerCount: number) => ({ principal: name, authorization_member: name === "request",
      worker_member: name === "worker", request_count: name === "request" ? 4 : 0, worker_count: workerCount, privileged: false });
    const pool = (name: string, workerCount: number) => ({ query: async (_sql: string, params: unknown[]) => {
      seen.push(params); return { rows: [principal(name, workerCount)] }; } });
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 25) as never)).resolves.toBeUndefined();
    expect(seen[1]?.[1]).toContain("identity.read_data_export_saved_questions(uuid,uuid)");
    expect((seen[1]?.[1] as string[]).length).toBe(25);
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 24) as never))
      .rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");

    const sql: string[] = [];
    const reader = { query: async (text: string) => {
      sql.push(text);
      return { rows: [{ snapshot: { user: {} }, threat_reports: [], page_memory: null, saved_questions: [{ saved_question_id: "q" }] }] };
    } };
    const raw = await new PostgresDataExportSource(reader as never).readRaw("export", "worker");
    expect(sql[0]).toContain("identity.read_data_export_saved_questions($1,$2) saved_questions");
    expect(raw.saved_questions).toEqual([{ saved_question_id: "q" }]);
    expect(RAW_SECTIONS).toContain("saved_questions");
  });
});
