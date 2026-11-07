/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §3.1-§3.7, §3.10, §3.12, §3.14; owner answers S3 A, S4 A, Q1, Q8): THE
 * SAVED-QUESTION SERVICE. The account keeps step 2 as the page sent it, each question under a key of its own that the person's user key
 * wraps (`saved-question:<id>:v1`), and only when the reading in it is this person's one reading, signed by this server. A save checks
 * in order: the shape, the size, crisis words in the person's own words, the consent, the preview team, the start step being there, the
 * reading. Delete and Start destroy the question's key, see that it is gone, then remove the row. Every question and path is made up.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAVED_QUESTION_LIMITS, savedQuestionPartBytes, type SavedQuestionDoc } from "@debateai/contract";
import {
  MemorySavedQuestionKeyStore, SavedQuestionKeyUnresolvedError, decrypt, encrypt, generateDek, type CryptoEnvelope
} from "../../packages/crypto/src/index.js";
import {
  SavedQuestionRefused, createSavedQuestionService, savedQuestionAad, type SavedQuestionBinding, type SavedQuestionGate
} from "../../apps/api/src/saved-questions/service.js";
import { startQuestionHashOf } from "../../apps/api/src/start-step/signing.js";
import {
  FakeSavedQuestionStore, MemoryUserDekStore, SAVED_BOX_TEXT, SAVED_CRISIS, SAVED_OTHER_Q, SAVED_Q, SAVED_TRAILING_TITLE, newSavedPerson,
  newStartStepKey, savedDocOf, savedOwnPath, savedRewrittenPath, savedScopeOf, savedSigner, type SavedPerson
} from "../support/saved-questions.js";

const KEY = newStartStepKey();
const ANA = newSavedPerson();
const BEN = newSavedPerson();
const ANA_SIGNS = savedSigner(KEY, ANA);
const BEN_SIGNS = savedSigner(KEY, BEN);

const bindingOf = (person: SavedPerson, planKey: SavedQuestionBinding["planKey"] = "premium"): SavedQuestionBinding =>
  ({ ownerScope: savedScopeOf(person), planKey });
type GateOver = Readonly<{ consent?: boolean; team?: boolean; binding?: SavedQuestionBinding | null; consentReads?: string[] }>;
const gateFor = (person: SavedPerson, over: GateOver = {}): SavedQuestionGate => ({
  teamAdmits: over.team ?? true,
  consentGiven: async () => { over.consentReads?.push("consent"); return over.consent ?? true; },
  bindingOf: async () => over.binding === undefined ? bindingOf(person) : over.binding
});

async function world(options: Readonly<{ key?: "NONE" | ReturnType<typeof newStartStepKey> }> = {}) {
  const store = new FakeSavedQuestionStore();
  const users = new MemoryUserDekStore();
  await users.store(ANA.userId, generateDek());
  await users.store(BEN.userId, generateDek());
  const keys = new MemorySavedQuestionKeyStore(users);
  const reported: string[] = [];
  const serviceOver = (key: ReturnType<typeof newStartStepKey> | undefined) => createSavedQuestionService({ store, keys, key,
    report: (code: string, id?: string) => { reported.push(id === undefined ? code : `${code} ${id}`); } });
  const service = serviceOver(options.key === "NONE" ? undefined : options.key ?? KEY);
  /** The content of `id`, opened under its own key with the AAD it was sealed under. */
  const opened = async (id: string, person: SavedPerson = ANA, column: "title" | "content" = "content") => {
    const key = await keys.load(id, person);
    try {
      const row = store.rows.get(id)!;
      return decrypt(key, column === "title" ? row.title : row.content, savedQuestionAad(column, id, person.ownerRef)).toString("utf8");
    } finally { key.fill(0); }
  };
  return { store, users, keys, service, serviceOver, reported, opened };
}
const createBody = (doc: unknown) => ({ doc });
const saveBody = (revision: number, doc: unknown) => ({ revision, doc });
const refusedWith = (code: string) => expect.objectContaining({ name: "SavedQuestionRefused", code });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("the question's own key (S4 A)", () => {
  it("a first save makes one key for the new id, the caller's, and seals both parts under saved-question:<id>:v1", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS);
    const written = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    expect(written).toEqual({ id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u), revision: 1 });
    expect(await w.keys.listByOwner(ANA.ownerRef)).toEqual([written.id]);
    expect(await w.keys.ownerRef(written.id)).toBe(ANA.ownerRef);
    const row = w.store.rows.get(written.id)!;
    for (const envelope of [row.title, row.content]) {
      expect(envelope.keyId).toBe(`saved-question:${written.id}:v1`);
      expect(envelope.keyId.startsWith("user-dek:")).toBe(false);
    }
    expect(await w.opened(written.id)).toBe(JSON.stringify(doc));
    expect(await w.opened(written.id, ANA, "title")).toBe(SAVED_Q);
  });

  it("the content opens only with its own AAD (row id, part, owner) and its own key", async () => {
    const w = await world();
    const first = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    const second = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    const content = w.store.rows.get(first.id)!.content;
    const key = await w.keys.load(first.id, ANA);
    const otherKey = await w.keys.load(second.id, ANA);
    try {
      expect(() => decrypt(key, content, savedQuestionAad("content", first.id, ANA.ownerRef))).not.toThrow();
      expect(() => decrypt(key, content, savedQuestionAad("content", second.id, ANA.ownerRef))).toThrow();
      expect(() => decrypt(key, content, savedQuestionAad("title", first.id, ANA.ownerRef))).toThrow();
      expect(() => decrypt(key, content, savedQuestionAad("content", first.id, BEN.ownerRef))).toThrow();
      expect(() => decrypt(otherKey, content, savedQuestionAad("content", first.id, ANA.ownerRef))).toThrow();
      expect(savedQuestionAad("content", first.id, ANA.ownerRef)).toEqual(["identity", "saved_question.content_ciphertext", first.id, "run:none",
        ANA.ownerRef, `saved-question:${first.id}:v1`, "1"]);
    } finally { key.fill(0); otherKey.fill(0); }
  });

  it("two first saves by the same person make two different keys", async () => {
    const w = await world();
    const first = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    const second = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    expect(first.id).not.toBe(second.id);
    const one = await w.keys.load(first.id, ANA);
    const two = await w.keys.load(second.id, ANA);
    try {
      expect(one.equals(two)).toBe(false);
      expect(() => decrypt(two, w.store.rows.get(first.id)!.title, savedQuestionAad("title", first.id, ANA.ownerRef))).toThrow();
    } finally { one.fill(0); two.fill(0); }
  });

  it("the key it makes and every question key it loads are all zeros once each call returns", async () => {
    const w = await world();
    const made: Uint8Array[] = [];
    const loaded: Buffer[] = [];
    const store = w.keys.store.bind(w.keys);
    const load = w.keys.load.bind(w.keys);
    vi.spyOn(w.keys, "store").mockImplementation(async (id, identity, key) => { made.push(key); return store(id, identity, key); });
    vi.spyOn(w.keys, "load").mockImplementation(async (id, identity) => { const key = await load(id, identity); loaded.push(key); return key; });
    const doc = savedDocOf(ANA_SIGNS);
    const written = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    await w.service.save(ANA, written.id, saveBody(1, doc), gateFor(ANA));
    await w.service.read(ANA, written.id, gateFor(ANA));
    await w.service.list(ANA, gateFor(ANA));
    await w.service.remove(ANA, written.id);
    expect(made).toHaveLength(1);
    expect(loaded.length).toBeGreaterThanOrEqual(3);
    for (const key of [...made, ...loaded]) {
      expect(key.byteLength).toBe(32);
      expect([...key].every((byte) => byte === 0)).toBe(true);
    }
  });

  it.each([
    ["FULL", "SAVED_QUESTIONS_FULL"],
    ["THROW", null],
    ["ACCOUNT_INVALID", null]
  ] as const)("a first save the store answers %s leaves no key behind", async (answer, code) => {
    const w = await world();
    w.store.nextCreate = answer;
    const refused = w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    await (code === null ? expect(refused).rejects.toThrow() : expect(refused).rejects.toEqual(refusedWith(code)));
    expect(await w.keys.listByOwner(ANA.ownerRef)).toEqual([]);
    expect(w.store.rows.size).toBe(0);
  });

  it("a first save whose row landed before the store's answer was lost keeps its key: the row is the person's", async () => {
    const w = await world();
    w.store.nextCreate = "WRITE_THEN_THROW";
    const written = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    expect(written.revision).toBe(1);
    expect(await w.keys.listByOwner(ANA.ownerRef)).toEqual([written.id]);
    expect(await w.opened(written.id, ANA, "title")).toBe(SAVED_Q);
  });

  it("the largest document a save lets through seals under 0162's content cap, and the longest title under its title cap", async () => {
    // The whole document is at most docMaxBytes of JSON; sealed, its envelope (as jsonb prints it, a space after each : and ,) fits 917_504.
    const key = generateDek();
    const id = "3f2c1a9e-7b4d-4c2a-9e8f-1a2b3c4d5e6f";
    const jsonbBytes = (envelope: CryptoEnvelope) => Buffer.byteLength(JSON.stringify(envelope).replaceAll(/":/gu, "\": ").replaceAll(/,"/gu, ", \""), "utf8");
    const largest = encrypt(key, Buffer.alloc(SAVED_QUESTION_LIMITS.docMaxBytes, 0x61), savedQuestionAad("content", id, ANA.ownerRef));
    expect(jsonbBytes(largest)).toBeLessThan(917_504);
    // A title is sealed as its UTF-8 text, never as JSON: 300 characters of a 3-byte script, or 300 control characters, fit 2_048.
    for (const title of ["中".repeat(SAVED_QUESTION_LIMITS.titleMaxChars), "\u0001".repeat(SAVED_QUESTION_LIMITS.titleMaxChars)]) {
      expect(jsonbBytes(encrypt(key, Buffer.from(title, "utf8"), savedQuestionAad("title", id, ANA.ownerRef)))).toBeLessThan(2_048);
    }
    // And a real save of a page part at its limit goes through, its content under the cap.
    const w = await world();
    const page = savedDocOf(ANA_SIGNS).page;
    const pad = { ...page, pad: "" };
    const full = savedDocOf(ANA_SIGNS, { page: { pad: "x".repeat(SAVED_QUESTION_LIMITS.pageMaxBytes - savedQuestionPartBytes(pad)) } });
    expect(savedQuestionPartBytes(full.page)).toBe(SAVED_QUESTION_LIMITS.pageMaxBytes);
    const written = await w.service.create(ANA, createBody(full), gateFor(ANA));
    expect(jsonbBytes(w.store.rows.get(written.id)!.content)).toBeLessThan(917_504);
    expect(jsonbBytes(w.store.rows.get(written.id)!.title)).toBeLessThan(2_048);
  });
});

describe("removing one (S4 A)", () => {
  it("destroys the question's key, sees it gone, and only then removes the row", async () => {
    const w = await world();
    const { id } = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    const order: string[] = [];
    const destroy = w.keys.destroy.bind(w.keys);
    const remove = w.store.remove.bind(w.store);
    vi.spyOn(w.keys, "destroy").mockImplementation(async (one) => { order.push("keys.destroy"); return destroy(one); });
    vi.spyOn(w.store, "remove").mockImplementation(async (owner, one) => { order.push("store.remove"); return remove(owner, one); });
    await w.service.remove(ANA, id);
    expect(order).toEqual(["keys.destroy", "store.remove"]);
    expect(await w.keys.exists(id)).toBe(false);
    expect(w.store.rows.has(id)).toBe(false);
  });

  it("another person's id destroys nothing: their row stays and their key still opens", async () => {
    const w = await world();
    const { id } = await w.service.create(BEN, createBody(savedDocOf(BEN_SIGNS)), gateFor(BEN));
    await w.service.remove(ANA, id);
    expect(w.store.rows.has(id)).toBe(true);
    expect(await w.opened(id, BEN, "title")).toBe(SAVED_Q);
  });

  it("a key that cannot be destroyed keeps the row, and the removal answers SAVED_QUESTIONS_UNAVAILABLE", async () => {
    const w = await world();
    const { id } = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    vi.spyOn(w.keys, "destroy").mockRejectedValue(new Error("DISK"));
    await expect(w.service.remove(ANA, id)).rejects.toEqual(refusedWith("SAVED_QUESTIONS_UNAVAILABLE"));
    expect(w.store.rows.has(id)).toBe(true);
    expect(await w.keys.exists(id)).toBe(true);
  });

  it("a row whose key is already gone is removed, without a fault", async () => {
    const w = await world();
    const { id } = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    await w.keys.destroy(id);
    await expect(w.service.remove(ANA, id)).resolves.toBeUndefined();
    expect(w.store.rows.has(id)).toBe(false);
  });
});

describe("a row whose key is gone (Delete or Start in another window)", () => {
  it("read answers null and deletes the row; save answers SAVED_QUESTION_GONE and deletes the row", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS);
    const first = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    const second = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    await w.keys.destroy(first.id);
    await w.keys.destroy(second.id);
    expect(await w.service.read(ANA, first.id, gateFor(ANA))).toBeNull();
    expect(w.store.rows.has(first.id)).toBe(false);
    await expect(w.service.save(ANA, second.id, saveBody(1, doc), gateFor(ANA))).rejects.toEqual(refusedWith("SAVED_QUESTION_GONE"));
    expect(w.store.rows.has(second.id)).toBe(false);
  });

  it("the list leaves it out and deletes it; the others are listed", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS);
    const kept = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    const lost = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    await w.keys.destroy(lost.id);
    const list = await w.service.list(ANA, gateFor(ANA));
    expect(list.questions.map((one) => one.id)).toEqual([kept.id]);
    expect(w.store.rows.has(lost.id)).toBe(false);
  });
});

describe("stored as sent", () => {
  it("a read line ending in a space and a path title ending in a space read back as the same JSON text", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS, { readLine: `${SAVED_Q} ` });
    expect(startQuestionHashOf(`${SAVED_Q} `)).toBe(startQuestionHashOf(SAVED_Q));
    const { id } = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    const read = await w.service.read(ANA, id, gateFor(ANA));
    expect(JSON.stringify(read!.doc)).toBe(JSON.stringify(doc));
    expect((read!.doc as SavedQuestionDoc).page.plan.paths[0]!.title).toBe(SAVED_TRAILING_TITLE);
    expect((read!.doc as SavedQuestionDoc).page.box.text).toBe(SAVED_BOX_TEXT);
    expect(read).toMatchObject({ id, revision: 1, state: "READY", saved_at: expect.stringMatching(/Z$/u) });
  });
});

describe("refused, with the store untouched", () => {
  it.each([
    ["a check signed for another person", () => savedDocOf(ANA_SIGNS, { check: { person: BEN } })],
    ["a menu of another reading", () => savedDocOf(ANA_SIGNS, { menu: { questionLine: SAVED_OTHER_Q } })],
    ["a read line that is not the check's", () => savedDocOf(ANA_SIGNS, { readLine: SAVED_OTHER_Q })],
    ["a late list signed under another version than the check", () => savedDocOf(ANA_SIGNS, { late: [{ settingsVersion: 30 }] })],
    ["a late list the menu already holds", () => ({ ...savedDocOf(ANA_SIGNS), reading: { ...savedDocOf(ANA_SIGNS).reading,
      late_lists: [ANA_SIGNS.late(1)] } })],
    ["a menu another server signed", () => savedDocOf(ANA_SIGNS, { menu: { key: newStartStepKey() } })]
  ])("%s: SAVED_QUESTION_INVALID", async (_name, make) => {
    const w = await world();
    await expect(w.service.create(ANA, createBody(make()), gateFor(ANA))).rejects.toEqual(refusedWith("SAVED_QUESTION_INVALID"));
    expect(w.store.calls).toEqual([]);
    expect(await w.keys.listByOwner(ANA.ownerRef)).toEqual([]);
  });

  it("a check signed for another plan with a menu signed for this one is stored, and reads NEEDS_READING (a mix is never READY)", async () => {
    const w = await world();
    const { id } = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS, { check: { planKey: "free" } })), gateFor(ANA));
    expect((await w.service.read(ANA, id, gateFor(ANA)))!.state).toBe("NEEDS_READING");
  });
});

describe("the reading's state at Pick up", () => {
  it("a reading signed for plan free while the person is now premium is stored, and reads NEEDS_READING", async () => {
    const w = await world();
    const free = { planKey: "free" } as const;
    const { id } = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS, { check: free, menu: free, late: [free] })), gateFor(ANA));
    expect((await w.service.read(ANA, id, gateFor(ANA)))!.state).toBe("NEEDS_READING");
    expect((await w.service.read(ANA, id, gateFor(ANA, { binding: bindingOf(ANA, "free") })))!.state).toBe("READY");
  });

  it("references signed under settings version 30 read READY while 31 is active (answer Q8)", async () => {
    const w = await world();
    const v30 = { settingsVersion: 30 } as const;
    const { id } = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS, { check: v30, menu: v30, late: [v30] })), gateFor(ANA));
    expect((await w.service.read(ANA, id, gateFor(ANA)))!.state).toBe("READY");
  });

  it("references signed 40 days earlier read READY: they have no lifetime", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"));
    const doc = savedDocOf(ANA_SIGNS);
    vi.setSystemTime(new Date("2026-11-04T10:00:00.000Z"));
    const w = await world();
    const { id } = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    expect((await w.service.read(ANA, id, gateFor(ANA)))!.state).toBe("READY");
  });

  it("after the start step's key changes: Pick up reads NEEDS_READING and a save is SAVED_QUESTION_INVALID", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS);
    const { id } = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    const renewed = w.serviceOver(newStartStepKey());
    expect((await renewed.read(ANA, id, gateFor(ANA)))!.state).toBe("NEEDS_READING");
    await expect(renewed.save(ANA, id, saveBody(1, doc), gateFor(ANA))).rejects.toEqual(refusedWith("SAVED_QUESTION_INVALID"));
    expect(w.store.rows.get(id)!.revision).toBe(1);
  });

  it("Pick up of a missing or another person's id answers null; without the start step it is SAVED_QUESTIONS_OFF", async () => {
    const w = await world();
    const { id } = await w.service.create(BEN, createBody(savedDocOf(BEN_SIGNS)), gateFor(BEN));
    expect(await w.service.read(ANA, id, gateFor(ANA))).toBeNull();
    expect(w.store.rows.has(id)).toBe(true);
    await expect(w.service.read(BEN, id, gateFor(BEN, { binding: null }))).rejects.toEqual(refusedWith("SAVED_QUESTIONS_OFF"));
  });
});

describe("crisis words, the consent, the team and the switch", () => {
  const plan = (doc: SavedQuestionDoc) => doc.page.plan;
  it.each([
    ["in the box", { page: { box: { text: `${SAVED_Q}\n${SAVED_CRISIS}`, placed: [] } } }],
    ["in an own path", { plan: { paths: [savedOwnPath("p9", SAVED_CRISIS)] } }],
    ["in a rewritten path", { plan: { paths: [savedRewrittenPath("kp01", "My own words", SAVED_CRISIS)] } }],
    ["in a typed answer", { page: { sent_goal: { answers: [{ question: "What is the answer for?", answer: SAVED_CRISIS, other: true }] } } }],
    ["in an own path under + N more", { plan: { more: [savedOwnPath("p9", SAVED_CRISIS)] } }],
    ["in an own path only in an Undo step", { plan: { undo: [{ paths: [savedOwnPath("p9", SAVED_CRISIS)], more: [] }] } }]
  ])("%s: CRISIS_SUPPORT_OFFERED, nothing stored, and the earlier copy still reads back", async (_name, parts) => {
    const w = await world();
    const clean = savedDocOf(ANA_SIGNS);
    const { id } = await w.service.create(ANA, createBody(clean), gateFor(ANA));
    const crisis = savedDocOf(ANA_SIGNS, parts as never);
    const reads: string[] = [];
    await expect(w.service.save(ANA, id, saveBody(1, crisis), gateFor(ANA, { consentReads: reads })))
      .rejects.toEqual(refusedWith("CRISIS_SUPPORT_OFFERED"));
    await expect(w.service.create(ANA, createBody(crisis), gateFor(ANA))).rejects.toEqual(refusedWith("CRISIS_SUPPORT_OFFERED"));
    expect(reads).toEqual([]);
    expect(w.store.rows.size).toBe(1);
    expect(await w.keys.listByOwner(ANA.ownerRef)).toEqual([id]);
    expect(JSON.stringify((await w.service.read(ANA, id, gateFor(ANA)))!.doc)).toBe(JSON.stringify(clean));
    expect(plan(clean).paths).toHaveLength(5);
  });

  it("crisis words come before the consent and the team: a person in crisis never meets a refusal first", async () => {
    const w = await world();
    const crisis = savedDocOf(ANA_SIGNS, { page: { box: { text: SAVED_CRISIS, placed: [] } } });
    await expect(w.service.create(ANA, createBody(crisis), gateFor(ANA, { consent: false, team: false, binding: null })))
      .rejects.toEqual(refusedWith("CRISIS_SUPPORT_OFFERED"));
  });

  it("no consent: SENSITIVE_DATA_CONSENT_REQUIRED; off the preview team: PREVIEW_TEAM_ONLY; nothing stored", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS);
    await expect(w.service.create(ANA, createBody(doc), gateFor(ANA, { consent: false, team: false })))
      .rejects.toEqual(refusedWith("SENSITIVE_DATA_CONSENT_REQUIRED"));
    await expect(w.service.create(ANA, createBody(doc), gateFor(ANA, { team: false }))).rejects.toEqual(refusedWith("PREVIEW_TEAM_ONLY"));
    expect(w.store.calls).toEqual([]);
    expect(await w.keys.listByOwner(ANA.ownerRef)).toEqual([]);
  });

  it("no start-step key, or no binding: SAVED_QUESTIONS_OFF, and no question key is made", async () => {
    const off = await world({ key: "NONE" });
    await expect(off.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA))).rejects.toEqual(refusedWith("SAVED_QUESTIONS_OFF"));
    await expect(off.service.list(ANA, gateFor(ANA))).rejects.toEqual(refusedWith("SAVED_QUESTIONS_OFF"));
    expect(await off.keys.listByOwner(ANA.ownerRef)).toEqual([]);
    const unbound = await world();
    await expect(unbound.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA, { binding: null })))
      .rejects.toEqual(refusedWith("SAVED_QUESTIONS_OFF"));
    expect(await unbound.keys.listByOwner(ANA.ownerRef)).toEqual([]);
    expect(unbound.store.calls).toEqual([]);
  });

  it("a body of another shape is MALFORMED_REQUEST, before anything else is read", async () => {
    const w = await world();
    const reads: string[] = [];
    for (const body of [null, {}, { doc: { v: 2 } }, { doc: savedDocOf(ANA_SIGNS), extra: 1 }]) {
      await expect(w.service.create(ANA, body, gateFor(ANA, { consentReads: reads }))).rejects.toEqual(refusedWith("MALFORMED_REQUEST"));
    }
    await expect(w.service.save(ANA, "3f2c1a9e-7b4d-4c2a-9e8f-1a2b3c4d5e6f", { doc: savedDocOf(ANA_SIGNS) }, gateFor(ANA)))
      .rejects.toEqual(refusedWith("MALFORMED_REQUEST"));
    expect(reads).toEqual([]);
    expect(w.store.calls).toEqual([]);
  });
});

describe("size and title", () => {
  it("a page part of 262_145 bytes is SAVED_QUESTION_TOO_LARGE, nothing stored", async () => {
    const w = await world();
    const pad = { ...savedDocOf(ANA_SIGNS).page, pad: "" };
    const doc = savedDocOf(ANA_SIGNS, { page: { pad: "x".repeat(SAVED_QUESTION_LIMITS.pageMaxBytes + 1 - savedQuestionPartBytes(pad)) } });
    expect(savedQuestionPartBytes(doc.page)).toBe(262_145);
    await expect(w.service.create(ANA, createBody(doc), gateFor(ANA))).rejects.toEqual(refusedWith("SAVED_QUESTION_TOO_LARGE"));
    expect(w.store.calls).toEqual([]);
  });

  it("the title is the box's first line, cut at 300 code units; the list shows it, newest first, at most 20", async () => {
    const w = await world();
    const long = `${"Should Romania build new nuclear plants near the Danube ".repeat(8)}?`;
    const older = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS)), gateFor(ANA));
    const newer = await w.service.create(ANA, createBody(savedDocOf(ANA_SIGNS, { page: { box: { text: `${long}\nUp to 2050.`, placed: [] } } })),
      gateFor(ANA));
    const list = await w.service.list(ANA, gateFor(ANA));
    expect(list.questions.map((one) => one.id)).toEqual([newer.id, older.id]);
    expect(list.questions[0]!.question).toBe(long.slice(0, SAVED_QUESTION_LIMITS.titleMaxChars).trimEnd());
    expect(list.questions[1]!.question).toBe(SAVED_Q);
    expect(list.questions[0]!.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  });

  it("a later save over the revision it was given answers the next one; another window's older revision answers REVISION with it", async () => {
    const w = await world();
    const doc = savedDocOf(ANA_SIGNS);
    const { id } = await w.service.create(ANA, createBody(doc), gateFor(ANA));
    expect(await w.service.save(ANA, id, saveBody(1, doc), gateFor(ANA))).toEqual({ id, revision: 2 });
    await expect(w.service.save(ANA, id, saveBody(1, doc), gateFor(ANA))).rejects.toEqual(
      expect.objectContaining({ code: "SAVED_QUESTION_REVISION", revision: 2 }));
    await expect(w.service.save(BEN, id, saveBody(2, savedDocOf(BEN_SIGNS)), gateFor(BEN))).rejects.toEqual(refusedWith("SAVED_QUESTION_GONE"));
    expect(w.store.rows.has(id)).toBe(true);
    expect(await w.opened(id, ANA, "title")).toBe(SAVED_Q);
    expect(SavedQuestionRefused).toBeTypeOf("function");
    expect(SavedQuestionKeyUnresolvedError).toBeTypeOf("function");
  });
});
