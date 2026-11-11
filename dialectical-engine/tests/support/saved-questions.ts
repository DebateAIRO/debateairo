/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04; owner answers S3 A, S4 A): what the saved-question service, route and export
 * tests share. A made-up user key store, a store that keeps 0162's rows in memory (one account keeps at most 20, the revision moves by
 * one at every save, the newest first), and a saved step 2 whose reading is signed for real with the start step's own functions
 * (signStartCheck, signStartMenu, signStartList): the shared fixture's refs ("menu1.sig", "list3.sig") are made up and never verify.
 * Every question, path and answer here is made up.
 */
import { randomUUID } from "node:crypto";
import type { SavedQuestionDoc, SignedStartList, SignedStartMenu } from "@debateai/contract";
import type { DebateShapePlanKey } from "@debateai/register";
import type { CryptoEnvelope, KeyDestroyResult, ReadableUserDekStore } from "../../packages/crypto/src/index.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import {
  SavedQuestionAccountInvalidError, type SavedQuestionRow, type SavedQuestionStore, type SavedQuestionWrite
} from "../../apps/api/src/saved-questions/store.js";
import { newStartStepKey, signStartCheck, signStartList, signStartMenu, type StartStepKey } from "../../apps/api/src/start-step/signing.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList } from "./v4-start-menu.js";

export const SAVED_Q = START_FIXTURE_QUESTION;
export const SAVED_OTHER_Q = "Should Romania close its nuclear plants?";
/** The settings version every reference below is signed under, unless a case says otherwise. */
export const SAVED_ACTIVE = 31;
/** Words that read as a person in crisis (tests/unit/crisis-check-api.test.ts uses the same line). */
export const SAVED_CRISIS = "I want to kill myself tonight";

export const SAVED_LOCK: QuestionLanguageLock = Object.freeze({
  language: Object.freeze({ code: "en", name: "English" }), source: "ELD_SITE", siteLanguage: "en", rewriteAccepted: false,
  originalQuestionLine: null, trace: Object.freeze({ eld: null, fast: null, contractHash: null }), recordCode: "ELD_SITE", localReason: null
});

/** A made-up person: v4 ids, as the question-key store requires. */
export type SavedPerson = Readonly<{ ownerRef: string; userId: string }>;
export const newSavedPerson = (): SavedPerson => Object.freeze({ ownerRef: randomUUID(), userId: randomUUID() });
/** The start step's owner scope of a signed-in person (ownerScopeOf({ kind: "server", ownerRef })). */
export const savedScopeOf = (person: Readonly<{ ownerRef: string }>): string => `owner:${person.ownerRef}`;

export class MemoryUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();
  async store(userId: string, dek: Uint8Array): Promise<void> { this.#keys.set(userId, Buffer.from(dek)); }
  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_NOT_FOUND");
    return Buffer.from(key);
  }
  async exists(userId: string): Promise<boolean> { return this.#keys.has(userId); }
  async destroy(userId: string): Promise<KeyDestroyResult> { return this.#keys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT"; }
}

type KeptRow = { ownerRef: string; id: string; revision: number; title: CryptoEnvelope; content: CryptoEnvelope; createdAt: Date; updatedAt: Date };

/** 0162's five functions over memory: the store port the service uses (apps/api/src/saved-questions/store.ts). */
export class FakeSavedQuestionStore implements SavedQuestionStore {
  readonly rows = new Map<string, KeptRow>();
  /** Every call, in order, by name (`create`, `save`, `list`, `read`, `remove`). */
  readonly calls: string[] = [];
  /** The next create answers FULL, throws, refuses the account, or writes its row and then throws (a lost answer). */
  nextCreate: "FULL" | "THROW" | "ACCOUNT_INVALID" | "WRITE_THEN_THROW" | null = null;
  removeFails = false;
  #clock = Date.parse("2026-11-04T09:00:00.000Z");

  #now(): Date {
    this.#clock += 60_000;
    return new Date(this.#clock);
  }

  async create(ownerRef: string, id: string, title: CryptoEnvelope, content: CryptoEnvelope): Promise<SavedQuestionWrite> {
    this.calls.push("create");
    const next = this.nextCreate;
    this.nextCreate = null;
    if (next === "THROW") throw new Error("CONNECTION_LOST");
    if (next === "ACCOUNT_INVALID") throw new SavedQuestionAccountInvalidError();
    if (next === "FULL" || this.ownedBy(ownerRef).length >= 20) return { outcome: "FULL" };
    const at = this.#now();
    this.rows.set(id, { ownerRef, id, revision: 1, title, content, createdAt: at, updatedAt: at });
    if (next === "WRITE_THEN_THROW") throw new Error("CONNECTION_LOST");
    return { outcome: "CREATED", revision: 1 };
  }

  async save(ownerRef: string, id: string, revision: number, title: CryptoEnvelope, content: CryptoEnvelope): Promise<SavedQuestionWrite> {
    this.calls.push("save");
    const row = this.rows.get(id);
    if (row === undefined || row.ownerRef !== ownerRef) return { outcome: "GONE" };
    if (row.revision !== revision) return { outcome: "REVISION", revision: row.revision };
    Object.assign(row, { revision: row.revision + 1, title, content, updatedAt: this.#now() });
    return { outcome: "SAVED", revision: row.revision };
  }

  async list(ownerRef: string, limit: number): Promise<readonly SavedQuestionRow[]> {
    this.calls.push("list");
    return this.ownedBy(ownerRef).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit)
      .map((row) => ({ id: row.id, revision: row.revision, title: row.title, content: null, createdAt: row.createdAt, updatedAt: row.updatedAt }));
  }

  async read(ownerRef: string, id: string): Promise<SavedQuestionRow | null> {
    this.calls.push("read");
    const row = this.rows.get(id);
    return row === undefined || row.ownerRef !== ownerRef ? null
      : { id: row.id, revision: row.revision, title: row.title, content: row.content, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async remove(ownerRef: string, id: string): Promise<"DELETED" | "GONE"> {
    this.calls.push("remove");
    if (this.removeFails) throw new Error("CONNECTION_LOST");
    const row = this.rows.get(id);
    if (row === undefined || row.ownerRef !== ownerRef) return "GONE";
    this.rows.delete(id);
    return "DELETED";
  }

  ownedBy(ownerRef: string): KeptRow[] {
    return [...this.rows.values()].filter((row) => row.ownerRef === ownerRef);
  }

  /** The rows as 0162's export reader answers them (identity.read_data_export_saved_questions), oldest first. */
  exportRows(ownerRef: string): Record<string, unknown>[] {
    return this.ownedBy(ownerRef).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((row) => ({
      saved_question_id: row.id, revision: row.revision, title_ciphertext: row.title, content_ciphertext: row.content,
      created_at: row.createdAt.toISOString().replace("Z", "+00:00"), updated_at: row.updatedAt.toISOString().replace("Z", "+00:00")
    }));
  }
}

/** How one reference is signed: whose, for which line, plan and version, under which key (the defaults: the test's own). */
export type SavedSigning = Readonly<{ person?: SavedPerson; questionLine?: string; planKey?: DebateShapePlanKey; settingsVersion?: number; key?: StartStepKey }>;

export function savedSigner(key: StartStepKey, person: SavedPerson) {
  const bound = (signing: SavedSigning = {}) => ({ ownerScope: savedScopeOf(signing.person ?? person), questionLine: signing.questionLine ?? SAVED_Q,
    planKey: signing.planKey ?? "premium" as DebateShapePlanKey, settingsVersion: signing.settingsVersion ?? SAVED_ACTIVE });
  return Object.freeze({
    check: (signing: SavedSigning = {}): string => signStartCheck(signing.key ?? key, { ...bound(signing), lock: SAVED_LOCK, originalQuestionLine: null }),
    menu: (signing: SavedSigning = {}): SignedStartMenu => ({ menu: NUCLEAR_MENU, ref: signStartMenu(signing.key ?? key, { ...bound(signing), menu: NUCLEAR_MENU }) }),
    late: (n: number, signing: SavedSigning = {}): SignedStartList => {
      const list = signedList(n).list;
      return { list, ref: signStartList(signing.key ?? key, { ...bound(signing), list }) };
    }
  });
}

const menuPath = (ref: string) => {
  const one = NUCLEAR_MENU.paths.find((path) => path.path_ref === ref)!;
  return { key: ref, title: one.title, question: one.question, wording: "AI",
    viewpoints: one.viewpoint_ids.map((id) => ({ key: id, source: { kind: "MENU", viewpointId: id },
      question: NUCLEAR_MENU.viewpoints.find((viewpoint) => viewpoint.viewpoint_id === id)!.question })) };
};
/** The person's own path: their words, one own viewpoint. */
export const savedOwnPath = (key: string, words: string) => ({ key, title: words.slice(0, 120), question: words, wording: "PERSON",
  viewpoints: [{ key: `o${key}`, source: { kind: "OWN" }, question: words }] });
/** A menu path the person rewrote: their words, the menu's viewpoints. */
export const savedRewrittenPath = (ref: string, title: string, question: string) => ({ ...menuPath(ref), title, question, wording: "PERSON" });

export const SAVED_BOX_TEXT = `${SAVED_Q}\n\nUp to 2050.\n`;
/** A path title with a space at its end, which a parse with words() would trim: it must come back as sent. */
export const SAVED_TRAILING_TITLE = "Whole-system costs ";

export type SavedDocParts = Readonly<{ check?: SavedSigning; menu?: SavedSigning | null; late?: readonly SavedSigning[]; readLine?: string;
  page?: Readonly<Record<string, unknown>>; plan?: Readonly<Record<string, unknown>> }>;

/**
 * Step 2 as the page saves it: the reading of SAVED_Q (its check, the menu of lists 1 and 2, list 3 late), then the page's own state (the
 * box, one picked answer, five paths of which the first has a title ending in a space, four more, Thorough and the carry-on box ticked).
 */
export function savedDocOf(signer: ReturnType<typeof savedSigner>, parts: SavedDocParts = {}): SavedQuestionDoc {
  const paths = [{ ...menuPath("kp01"), title: SAVED_TRAILING_TITLE }, menuPath("kp02"), menuPath("kp03"), menuPath("kp04"), menuPath("kp05")];
  return {
    v: 1,
    reading: {
      read_line: parts.readLine ?? SAVED_Q, reading_level: "plain", check: { ref: signer.check(parts.check) }, language: { code: "en", name: "English" },
      seats: 4, clarify: null, menu: parts.menu === null ? null : signer.menu(parts.menu), late_lists: (parts.late ?? [{}]).map((signing) => signer.late(3, signing)),
      end: "READY"
    },
    page: {
      box: { text: SAVED_BOX_TEXT, placed: [{ key: "Up to when?", text: "Up to 2050." }] },
      sent_goal: { answers: [{ question: "Up to when?", answer: "Up to 2050", other: false }] },
      plan: { paths, more: [menuPath("kp06"), menuPath("kp07"), menuPath("kp08"), menuPath("kp09")], undo: [], ...parts.plan },
      width: 5, mode: "thorough", carry_on: true,
      ...parts.page
    }
  } as SavedQuestionDoc;
}

export { newStartStepKey };
