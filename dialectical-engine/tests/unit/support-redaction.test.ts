import { describe,expect,it,vi } from "vitest";

import { redactSupportText } from "../../packages/kernel/src/index.js";
import {
  createSupportCaseService,createSupportMessageCipher,type SupportEncryptedMessageRead
} from "../../apps/api/src/support/session.js";

describe("CP1 Support credential redaction", () => {
  it.each([
    ["My password is hunter2","hunter2"],
    ["password: orchard-pond-9","orchard-pond-9"],
    ["Parola mea este vanilie7","vanilie7"],
    ["parola mea: lac-albastru-4","lac-albastru-4"]
  ])("redacts an ordinary labelled credential while retaining safe intent: %s", (text,secret) => {
    const result = redactSupportText(text);
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain("[REDACTED_SECRET_LIKE]");
    expect(result.text.toLocaleLowerCase("en-US")).toMatch(/password|parol/u);
  });

  it.each([
    ["Passwordul meu este inert-stejar-7","inert-stejar-7"],
    ["My passcode is inert-maple-7","inert-maple-7"],
    ["OTP is INERTABC","INERTABC"],
    ["Reset token is inert-reset-7","inert-reset-7"],
    ["My pass\u200Bword is inert-birch-7","inert-birch-7"],
    ["Paro\u200Bla mea este inert-fag-7","inert-fag-7"],
    ["Codurile de recuperare sunt INERTRECOVERY","INERTRECOVERY"],
    ["Datele de autentificare sunt INERTAUTH","INERTAUTH"]
    ,['My password is "inert horse battery".',"inert horse battery"]
    ,["Parola mea este „inert cal albastru”.","inert cal albastru"]
    ,["Recovery code is inert maple river; keep it private.","inert maple river"]
    ,["Codul de securitate este inert arțar râu, păstrează-l privat.","inert arțar râu"]
    ,["My ｐａｓｓｗｏｒｄ is inert compatibility value; keep it private.","inert compatibility value"]
  ])("redacts every declared labelled credential class before transit: %s", (text,secret) => {
    const result = redactSupportText(text);
    expect(result).toMatchObject({ redacted: true });
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain("[REDACTED_SECRET_LIKE]");
  });

  it.each([
    ['My recovery code is "inert amber fern',"inert amber fern"],
    ["My password is amber birch cedar dogwood elm fir grove hazel; keep it private.","amber birch cedar dogwood elm fir grove hazel"],
    ["My reset token is inert.alpha-beta/gamma; keep it private.","inert.alpha-beta/gamma"]
  ])("removes the complete supplied value through a safe delimiter or end: %s", (text,secret) => {
    const result = redactSupportText(text);
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain("[REDACTED_SECRET_LIKE]");
  });

  it("stops an unquoted value at a declared coordinator without consuming benign prose", () => {
    const result = redactSupportText("My password is inert horse battery and I need help.");
    expect(result.text).toBe("My password is [REDACTED_SECRET_LIKE] and I need help.");
  });

  it.each([
    "I forgot my password",
    "Am uitat parola",
    "Try again at 14:30 on 2026-09-14 with public error SUPPORT_MODEL_UNAVAILABLE."
  ])("preserves benign guidance, dates, times, and public error IDs: %s", (text) => {
    expect(redactSupportText(text)).toEqual({ text,redacted: false });
  });

  it.each([
    ["My pass\u200Bword is inert-birch-7","inert-birch-7"],
    ["OTP is INERTABC","INERTABC"],
    ['My password is "inert horse battery".',"inert horse battery"],
    ["Parola mea este „inert cal albastru”.","inert cal albastru"]
  ])("keeps a supplied credential out of canonical seal, persistence, and model transit: %s", async (
    text,secret
  ) => {
    let sealed = "";
    let persisted = "";
    let transit = "";
    const cipher = createSupportMessageCipher({
      unwrapDataKey: vi.fn(async () => Buffer.alloc(32,1)),
      sealContent: vi.fn((_aad: unknown,_key: Uint8Array,plaintext: Uint8Array) => {
        sealed = Buffer.from(plaintext).toString("utf8");
        return Buffer.from(plaintext);
      }),openContent: vi.fn()
    } as never,{
      readSessionKey: vi.fn(async () => Buffer.from("wrapped")),
      write: vi.fn(async (input) => { persisted = Buffer.from(input.contentCiphertext).toString("utf8"); }),
      read: vi.fn(async () => null),listSession: vi.fn(async () => [])
    });

    const stored = await cipher.writeAndTransit({
      messageId: "40000000-0000-4000-8000-000000000001",
      sessionId: "40000000-0000-4000-8000-000000000002",
      role: "user",text,outcome: "REFUSE_ZONE",language: "en",detectedLanguage: "en",
      overrideLanguage: null,receivedAt: new Date("2026-09-14T10:00:00.000Z"),
      firstTokenAt: null,completedAt: null
    },async (safeText) => { transit = safeText; });

    for (const observed of [stored.text,sealed,persisted,transit]) {
      expect(observed).not.toContain(secret);
      expect(observed).toContain("[REDACTED_SECRET_LIKE]");
    }
    expect(stored.redacted).toBe(true);
  });

  it("screens a legacy labelled credential when an existing encrypted message is read", async () => {
    const legacy = "My password is legacyvalue7";
    const encrypted: SupportEncryptedMessageRead = Object.freeze({
      messageId: "20000000-0000-4000-8000-000000000001",
      sessionId: "20000000-0000-4000-8000-000000000002",
      role: "user",outcome: "REFUSE_ZONE",language: "en",detectedLanguage: "en",
      overrideLanguage: null,redacted: false,
      receivedAt: new Date("2026-09-14T10:00:00.000Z"),firstTokenAt: null,completedAt: null,
      contentCiphertext: Buffer.from("ciphertext"),wrappedKey: Buffer.from("wrapped")
    });
    const cipher = createSupportMessageCipher({
      unwrapDataKey: vi.fn(async () => Buffer.alloc(32,1)),
      openContent: vi.fn(() => Buffer.from(legacy,"utf8")),
      sealContent: vi.fn()
    } as never,{
      readSessionKey: vi.fn(),write: vi.fn(),
      read: vi.fn(async () => encrypted),listSession: vi.fn(async () => [encrypted])
    });

    const read = await cipher.read({
      sessionId: encrypted.sessionId,messageId: encrypted.messageId
    });
    const listed = await cipher.listSession({ sessionId: encrypted.sessionId });

    for (const message of [read!,...listed]) {
      expect(message.text).not.toContain("legacyvalue7");
      expect(message.text).toContain("[REDACTED_SECRET_LIKE]");
      expect(message.redacted).toBe(true);
    }
  });

  it("keeps a legacy labelled credential out of the case snapshot and advisory transit", async () => {
    const legacy = "My pass\u200Bword is replayvalue7";
    const encrypted: SupportEncryptedMessageRead = Object.freeze({
      messageId: "30000000-0000-4000-8000-000000000001",
      sessionId: "30000000-0000-4000-8000-000000000002",
      role: "user",outcome: "REFUSE_ZONE",language: "en",detectedLanguage: "en",
      overrideLanguage: null,redacted: false,
      receivedAt: new Date("2026-09-14T10:00:00.000Z"),firstTokenAt: null,completedAt: null,
      contentCiphertext: Buffer.from("ciphertext"),wrappedKey: Buffer.from("wrapped")
    });
    const cipher = createSupportMessageCipher({
      unwrapDataKey: vi.fn(async () => Buffer.alloc(32,1)),
      openContent: vi.fn(() => Buffer.from(legacy,"utf8")),sealContent: vi.fn()
    } as never,{
      readSessionKey: vi.fn(),write: vi.fn(),read: vi.fn(async () => encrypted),
      listSession: vi.fn(async () => [encrypted])
    });
    let snapshot = "";
    let transit = "";
    const cases = createSupportCaseService({
      messages: cipher,
      create: async (input) => {
        snapshot = Buffer.from(input.transcriptSnapshot).toString("utf8");
        return Object.freeze({
          caseId: input.caseId,sessionId: input.sessionId,
          identityOwnerRef: input.identityOwnerRef,language: input.language,
          createdAt: input.createdAt,triggerPredicate: input.triggerPredicate,
          toolCalls: input.toolCalls,kbVersion: input.kbVersion,
          slaHours: input.slaHours,state: "NEW" as const
        });
      },
      summaries: Object.freeze({ summarize: async (input) => { transit = input.transcript; } }),
      reportSummaryFailure: vi.fn()
    });

    await cases.open({
      sessionId: encrypted.sessionId,language: "en",createdAt: encrypted.receivedAt,
      triggerPredicate: "E3",kbVersion: "a".repeat(64),slaHours: 48
    });
    await vi.waitFor(() => expect(transit).not.toBe(""));

    expect(snapshot).not.toContain("replayvalue7");
    expect(transit).not.toContain("replayvalue7");
    expect(snapshot).toContain("[REDACTED_SECRET_LIKE]");
    expect(transit).toContain("[REDACTED_SECRET_LIKE]");
  });
});
