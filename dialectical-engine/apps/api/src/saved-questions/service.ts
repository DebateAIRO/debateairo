import { randomUUID } from "node:crypto";
import {
  CRISIS_SUPPORT_OFFERED, SAVED_QUESTION_LIMITS, SENSITIVE_DATA_CONSENT_REQUIRED, START_PATHS_STALE, SavedQuestionCreateSchema,
  SavedQuestionDocSchema, SavedQuestionSaveSchema, detectCrisis, savedQuestionDocFits, savedQuestionOwnWords, savedQuestionTitleOf,
  startListNosOfMenu, type SavedQuestionDoc, type SavedQuestionList, type SavedQuestionRead, type SavedQuestionRefusal,
  type SavedQuestionWritten
} from "@debateai/contract";
import {
  SavedQuestionKeyUnresolvedError, decrypt, encrypt, generateDek, savedQuestionKeyId, type AeadAad, type CryptoEnvelope,
  type SavedQuestionKeyStore
} from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import { PREVIEW_TEAM_ONLY } from "@debateai/providers";
import type { DebateShapePlanKey } from "@debateai/register";
import {
  startQuestionHashOf, startRefQuestionOf, startRefVersionOf, verifyStartCheck, verifyStartList, verifyStartMenu, type StartRefCheck,
  type StartStepKey
} from "../start-step/signing.js";
import type { SavedQuestionStore } from "./store.js";

/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §3.1-§3.7, §3.10, §3.12, §3.14; owner answers S3 A, S4 A, Q1, Q8): THE
 * SERVICE behind the five saved-question routes and the removal at Start. The account keeps step 2 exactly as the page sent it (the
 * document's JSON text), each question sealed under a 32-byte key of its own that the person's user key wraps (`saved-question:<id>:v1`,
 * the question-key store of Task 39d), so Delete and Start, which destroy that key first, leave nothing that can be opened. A save is
 * kept only when the reading in it is this person's one reading, signed by this server; Pick up says whether it still holds under
 * today's key and plan. The account always comes from the sign-in, never from the body. No log line carries a word, a key or a key
 * file's path: `report` gets a code and, at most, the question's id.
 */
export type SavedQuestionCaller = Readonly<{ ownerRef: string; userId: string }>;
/** startStepBindingOf (Task 30) without its version: whose reading it must be, and the plan it is compared with. */
export type SavedQuestionBinding = Readonly<{ ownerScope: string; planKey: DebateShapePlanKey }>;
/**
 * What only the request knows (Task 39e ruling): the person's data consent, the preview team and the start step's binding, each read
 * as POST /v1/asks and the step before Start read them. Read lazily and in the spec's order: the consent only once the crisis check
 * has passed, the binding only after the consent and the team.
 */
export type SavedQuestionGate = Readonly<{
  teamAdmits: boolean;
  consentGiven(): Promise<boolean>;
  bindingOf(): Promise<SavedQuestionBinding | null>;
}>;

export type SavedQuestionRefusedCode = SavedQuestionRefusal | typeof CRISIS_SUPPORT_OFFERED | typeof SENSITIVE_DATA_CONSENT_REQUIRED
  | typeof PREVIEW_TEAM_ONLY | "MALFORMED_REQUEST";
/** A refusal the routes answer with its own status; `revision` is the current one on SAVED_QUESTION_REVISION. Carries no words. */
export class SavedQuestionRefused extends Error {
  constructor(readonly code: SavedQuestionRefusedCode, readonly revision?: number) {
    super(code);
    this.name = "SavedQuestionRefused";
  }
}

export interface SavedQuestionService {
  list(caller: SavedQuestionCaller, gate: SavedQuestionGate): Promise<SavedQuestionList>;
  create(caller: SavedQuestionCaller, body: unknown, gate: SavedQuestionGate): Promise<SavedQuestionWritten>;
  save(caller: SavedQuestionCaller, id: string, body: unknown, gate: SavedQuestionGate): Promise<SavedQuestionWritten>;
  /** null: no such question of this person (missing, another person's, or its key already gone, which deletes the row). */
  read(caller: SavedQuestionCaller, id: string, gate: SavedQuestionGate): Promise<SavedQuestionRead | null>;
  /** Delete and the removal at Start: the key destroyed and read back absent, then the row. Another person's id destroys nothing. */
  remove(caller: SavedQuestionCaller, id: string): Promise<void>;
}

export type SavedQuestionServiceDeps = Readonly<{
  store: SavedQuestionStore;
  keys: SavedQuestionKeyStore;
  /** Task 31's start-step key (what signs the references), never a question's key. Absent: SAVED_QUESTIONS_OFF. */
  key: StartStepKey | undefined;
  newId?: () => string;
  /** One content-free log line: a code, and at most the question's id. */
  report(code: string, id?: string): void;
}>;

/** The AAD each part is sealed under: the row's id, the part, "run:none" (a saved question is not a run), the owner and the key's name. */
export function savedQuestionAad(column: "title" | "content", id: string, ownerRef: string): AeadAad {
  return ["identity", `saved_question.${column}_ciphertext`, id, "run:none", ownerRef, savedQuestionKeyId(id), "1"];
}

const refused = (code: SavedQuestionRefusedCode, revision?: number): never => { throw new SavedQuestionRefused(code, revision); };
const UTF8 = new TextDecoder("utf-8", { fatal: false });
type Parsed = ReturnType<typeof SavedQuestionDocSchema.parse>;

/**
 * Step 7: the reading is this person's one reading, signed by this server. The check, the menu and every late list verify with the
 * question, the version and the original not compared (Start compares those), so their only START_PATHS_STALE is the plan; every
 * reference carries the check's question hash, which is the read line's, and the check's version; the menu's lists and the late lists
 * do not overlap. Anything else that does not verify is SAVED_QUESTION_INVALID. "STALE": a plan changed (or a mix of plans), which a
 * save keeps and Pick up reads as NEEDS_READING.
 */
function readingOf(key: StartStepKey, binding: SavedQuestionBinding, reading: Parsed["reading"]): "READY" | "STALE" {
  const check: StartRefCheck = { ownerScope: binding.ownerScope, questionLine: null, planKey: binding.planKey, settingsVersion: null };
  let stale = false;
  const verified = (verify: () => unknown): void => {
    try {
      verify();
    } catch (error) {
      if (error instanceof TypedDomainError && error.code === START_PATHS_STALE) {
        stale = true;
        return;
      }
      refused("SAVED_QUESTION_INVALID");
    }
  };
  verified(() => verifyStartCheck(key, { ...check, ref: reading.check.ref, originalQuestionLine: undefined }));
  const menu = reading.menu;
  if (menu !== null) verified(() => verifyStartMenu(key, { ...check, signed: menu }));
  for (const signed of reading.late_lists) verified(() => verifyStartList(key, { ...check, signed }));
  const refs = [reading.check.ref, ...(menu === null ? [] : [menu.ref]), ...reading.late_lists.map((signed) => signed.ref)];
  const question = startRefQuestionOf(key, reading.check.ref);
  if (question === null || question !== startQuestionHashOf(reading.read_line) || refs.some((ref) => startRefQuestionOf(key, ref) !== question)) {
    refused("SAVED_QUESTION_INVALID");
  }
  const version = startRefVersionOf(key, reading.check.ref);
  if (version === null || refs.some((ref) => startRefVersionOf(key, ref) !== version)) refused("SAVED_QUESTION_INVALID");
  if (menu !== null) {
    const held = new Set(startListNosOfMenu(menu.menu));
    if (reading.late_lists.some((signed) => held.has(signed.list.list_no))) refused("SAVED_QUESTION_INVALID");
  }
  return stale ? "STALE" : "READY";
}

export function createSavedQuestionService(deps: SavedQuestionServiceDeps): SavedQuestionService {
  const { store, keys } = deps;
  const newId = deps.newId ?? randomUUID;

  /** Steps 2 to 7 of a first or later save, in the spec's order; nothing is stored or made before they all pass. */
  async function admitted(body: unknown, gate: SavedQuestionGate, first: boolean): Promise<Readonly<{ raw: SavedQuestionDoc; parsed: Parsed;
    revision: number }>> {
    const shape = first ? SavedQuestionCreateSchema.safeParse(body) : SavedQuestionSaveSchema.safeParse(body);
    if (!shape.success) return refused("MALFORMED_REQUEST");
    // The document as received: what is stored, and what is measured (a parse is a check, never the stored value).
    const raw = (body as Readonly<{ doc: SavedQuestionDoc }>).doc;
    const parsed = shape.data.doc;
    if (savedQuestionDocFits(raw) !== "FITS") return refused("SAVED_QUESTION_TOO_LARGE");
    // Each text is bounded by its schema's cap, which keeps the check quick (as on POST /v1/asks); only the person's own words.
    if (savedQuestionOwnWords(parsed).some((text) => detectCrisis(text).crisis)) return refused(CRISIS_SUPPORT_OFFERED);
    if (!await gate.consentGiven()) return refused(SENSITIVE_DATA_CONSENT_REQUIRED);
    if (!gate.teamAdmits) return refused(PREVIEW_TEAM_ONLY);
    const binding = deps.key === undefined ? null : await gate.bindingOf();
    if (deps.key === undefined || binding === null) return refused("SAVED_QUESTIONS_OFF");
    readingOf(deps.key, binding, parsed.reading);
    const revision = "revision" in shape.data && typeof shape.data.revision === "number" ? shape.data.revision : 1;
    return Object.freeze({ raw, parsed, revision });
  }

  /** Step 9: both parts sealed under the question's own key; the title as its UTF-8 text (at most 300 code units), the content as sent. */
  function sealed(key: Uint8Array, id: string, caller: SavedQuestionCaller, raw: SavedQuestionDoc, parsed: Parsed):
    Readonly<{ title: CryptoEnvelope; content: CryptoEnvelope }> {
    return Object.freeze({
      title: encrypt(key, Buffer.from(savedQuestionTitleOf(parsed), "utf8"), savedQuestionAad("title", id, caller.ownerRef)),
      content: encrypt(key, Buffer.from(JSON.stringify(raw), "utf8"), savedQuestionAad("content", id, caller.ownerRef))
    });
  }

  /** One part opened under the question's own key (which the caller zeroes); SAVED_QUESTIONS_UNAVAILABLE when it does not open. */
  function opened(key: Uint8Array, envelope: CryptoEnvelope, column: "title" | "content", id: string, caller: SavedQuestionCaller): string {
    let plain: Buffer | undefined;
    try {
      plain = decrypt(key, envelope, savedQuestionAad(column, id, caller.ownerRef));
      return UTF8.decode(plain);
    } catch {
      return refused("SAVED_QUESTIONS_UNAVAILABLE");
    } finally {
      plain?.fill(0);
    }
  }

  /**
   * The question's key, or why not: GONE when no key is there (Delete or Start destroyed it), or when it is another person's (an id
   * that is not the caller's answers as a missing one); UNAVAILABLE when the caller's key is there but does not open.
   */
  async function keyOf(caller: SavedQuestionCaller, id: string): Promise<Buffer | "GONE" | "UNAVAILABLE"> {
    try {
      return await keys.load(id, caller);
    } catch (error) {
      if (!(error instanceof SavedQuestionKeyUnresolvedError)) throw error;
      if (!await keys.exists(id)) return "GONE";
      const owner = await keys.ownerRef(id).catch(() => null);
      return owner !== null && owner !== caller.ownerRef ? "GONE" : "UNAVAILABLE";
    }
  }

  /** A row whose key is gone can never be opened: it is removed (best effort; the next read or list tries again). */
  async function removeKeyless(caller: SavedQuestionCaller, id: string): Promise<void> {
    try {
      await store.remove(caller.ownerRef, id);
    } catch {
      deps.report("api.saved_question.keyless_row_remove_failed", id);
    }
  }

  async function bindingFor(gate: SavedQuestionGate): Promise<Readonly<{ key: StartStepKey; binding: SavedQuestionBinding }>> {
    const binding = deps.key === undefined ? null : await gate.bindingOf();
    return deps.key === undefined || binding === null ? refused("SAVED_QUESTIONS_OFF") : Object.freeze({ key: deps.key, binding });
  }

  return Object.freeze({
    async list(caller: SavedQuestionCaller, gate: SavedQuestionGate): Promise<SavedQuestionList> {
      await bindingFor(gate);
      const questions: SavedQuestionList["questions"] = [];
      for (const row of await store.list(caller.ownerRef, SAVED_QUESTION_LIMITS.kept)) {
        const key = await keyOf(caller, row.id);
        if (key === "GONE") {
          await removeKeyless(caller, row.id);
          continue;
        }
        if (key === "UNAVAILABLE") return refused("SAVED_QUESTIONS_UNAVAILABLE");
        try {
          questions.push({ id: row.id, question: opened(key, row.title, "title", row.id, caller), saved_at: row.updatedAt.toISOString() });
        } finally {
          key.fill(0);
        }
      }
      return Object.freeze({ questions });
    },

    async create(caller: SavedQuestionCaller, body: unknown, gate: SavedQuestionGate): Promise<SavedQuestionWritten> {
      const { raw, parsed } = await admitted(body, gate, true);
      const id = newId();
      const key = generateDek();
      let written = false;
      try {
        await keys.store(id, caller, key);
        const parts = sealed(key, id, caller, raw, parsed);
        let outcome: Awaited<ReturnType<SavedQuestionStore["create"]>>;
        try {
          outcome = await store.create(caller.ownerRef, id, parts.title, parts.content);
        } catch (error) {
          // A row that landed before the answer was lost (or SAVED_QUESTION_ID_TAKEN on this person's own id) was created: its key stays.
          const landed = await store.read(caller.ownerRef, id).catch(() => null);
          if (landed === null) throw error;
          written = true;
          return Object.freeze({ id, revision: landed.revision });
        }
        if (outcome.outcome === "FULL") return refused("SAVED_QUESTIONS_FULL");
        if (outcome.outcome !== "CREATED") return refused("SAVED_QUESTIONS_UNAVAILABLE");
        written = true;
        return Object.freeze({ id, revision: outcome.revision });
      } finally {
        key.fill(0);
        // Step 11: a first save that wrote no row destroys the key it made, before answering.
        if (!written) {
          await keys.destroy(id).catch(() => { deps.report("api.saved_question.key_cleanup_failed", id); });
        }
      }
    },

    async save(caller: SavedQuestionCaller, id: string, body: unknown, gate: SavedQuestionGate): Promise<SavedQuestionWritten> {
      const { raw, parsed, revision } = await admitted(body, gate, false);
      const key = await keyOf(caller, id);
      if (key === "GONE") {
        await removeKeyless(caller, id);
        return refused("SAVED_QUESTION_GONE");
      }
      if (key === "UNAVAILABLE") return refused("SAVED_QUESTIONS_UNAVAILABLE");
      let parts: ReturnType<typeof sealed>;
      try {
        parts = sealed(key, id, caller, raw, parsed);
      } finally {
        key.fill(0);
      }
      const outcome = await store.save(caller.ownerRef, id, revision, parts.title, parts.content);
      if (outcome.outcome === "SAVED") return Object.freeze({ id, revision: outcome.revision });
      if (outcome.outcome === "GONE") return refused("SAVED_QUESTION_GONE");
      if (outcome.outcome === "REVISION") return refused("SAVED_QUESTION_REVISION", outcome.revision);
      return refused("SAVED_QUESTIONS_UNAVAILABLE");
    },

    async read(caller: SavedQuestionCaller, id: string, gate: SavedQuestionGate): Promise<SavedQuestionRead | null> {
      const { key: stepKey, binding } = await bindingFor(gate);
      const row = await store.read(caller.ownerRef, id);
      if (row === null || row.content === null) return null;
      const key = await keyOf(caller, id);
      if (key === "GONE") {
        await removeKeyless(caller, id);
        return null;
      }
      if (key === "UNAVAILABLE") return refused("SAVED_QUESTIONS_UNAVAILABLE");
      let text: string;
      try {
        text = opened(key, row.content, "content", id, caller);
      } finally {
        key.fill(0);
      }
      // Sent as stored: the page checks it; a parse here only decides the state (a document of another shape needs a new reading).
      const doc: unknown = JSON.parse(text);
      const parsed = SavedQuestionDocSchema.safeParse(doc);
      let state: SavedQuestionRead["state"] = "NEEDS_READING";
      if (parsed.success) {
        try {
          state = readingOf(stepKey, binding, parsed.data.reading) === "READY" ? "READY" : "NEEDS_READING";
        } catch (error) {
          if (!(error instanceof SavedQuestionRefused)) throw error;
        }
      }
      return Object.freeze({ id, revision: row.revision, saved_at: row.updatedAt.toISOString(), state, doc });
    },

    async remove(caller: SavedQuestionCaller, id: string): Promise<void> {
      // 1. The row as the caller's: a missing id, or another person's, destroys nothing.
      if (await store.read(caller.ownerRef, id) === null) return;
      // 2. The key file must name the same owner; a key already gone skips to the row.
      let owner: string | null;
      try {
        owner = await keys.ownerRef(id);
      } catch (error) {
        if (!(error instanceof SavedQuestionKeyUnresolvedError)) return refused("SAVED_QUESTIONS_UNAVAILABLE");
        if (await keys.exists(id).catch(() => true)) return refused("SAVED_QUESTIONS_UNAVAILABLE");
        owner = null;
      }
      if (owner !== null) {
        if (owner !== caller.ownerRef) {
          deps.report("api.saved_question.key_owner_mismatch", id);
          return refused("SAVED_QUESTIONS_UNAVAILABLE");
        }
        // 3. Destroy the key and read back that it is gone; otherwise the row stays.
        try {
          await keys.destroy(id);
        } catch {
          return refused("SAVED_QUESTIONS_UNAVAILABLE");
        }
        if (await keys.exists(id).catch(() => true)) return refused("SAVED_QUESTIONS_UNAVAILABLE");
      }
      // 4. Only then the row. A failure here leaves a row without a key, which the next list or read removes.
      await store.remove(caller.ownerRef, id);
    }
  });
}

/**
 * The data export's opener (ExportDecryptors.openSavedQuestion), over the same question-key store: the part opened with the question's
 * own key, under the export claim's { userId, ownerRef }, and the key zeroed (the user key is zeroed inside the store). null when the
 * key is gone (the question is deleted in effect, so it is left out); a key that is there but does not open throws, so the export fails.
 */
export function savedQuestionOpener(keys: Pick<SavedQuestionKeyStore, "exists" | "load">):
  (userId: string, ownerRef: string, id: string, column: "title" | "content", envelope: unknown) => Promise<string | null> {
  return async (userId, ownerRef, id, column, envelope) => {
    if (!await keys.exists(id)) return null;
    const key = await keys.load(id, { userId, ownerRef });
    let plain: Buffer | undefined;
    try {
      plain = decrypt(key, envelope as CryptoEnvelope, savedQuestionAad(column, id, ownerRef));
      return UTF8.decode(plain);
    } finally {
      plain?.fill(0);
      key.fill(0);
    }
  };
}
