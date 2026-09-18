import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const conversationUrl = new URL("./conversation.ts", import.meta.url).href;
const loadConversation = () => import(`${conversationUrl}?cacheBust=${Date.now()}`);
const httpUrl = new URL("./http.ts", import.meta.url).href;
const loadHttp = () => import(`${httpUrl}?cacheBust=${Date.now()}`);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const KEY = "debateai.support.conversation.v1";
const MESSAGES = [
  { id: "disclosure", role: "assistant", text: "Hi — I'm the support assistant." },
  { id: "user-1", role: "user", text: "Why is my debate stuck?" }
];

function memoryStorage(seed = {}) {
  const cells = new Map(Object.entries(seed));
  return {
    getItem: (key) => (cells.has(key) ? cells.get(key) : null),
    setItem: (key, value) => { cells.set(key, value); },
    removeItem: (key) => { cells.delete(key); },
    entries: () => Object.fromEntries(cells)
  };
}

// ---------------------------------------------- DL3-F3: the capability never rests on disk

test("DL3-F3: a persisted conversation carries no session capability token", async () => {
  const { writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en",
    identityBound: true,
    messages: MESSAGES,
    ownContext: { latest: true },
    // A caller that still holds a session must not be able to smuggle it in.
    session: { sessionId: "session-1", token: "K".repeat(43), identityBound: true }
  });
  const raw = storage.entries()[KEY];
  assert.equal(typeof raw, "string");
  assert.doesNotMatch(raw, /token/iu, "no capability, and no field named like one");
  assert.doesNotMatch(raw, /"session"/u);
  assert.doesNotMatch(raw, /K{10}/u);
  assert.deepEqual(JSON.parse(raw), {
    language: "en",
    identityBound: true,
    messages: MESSAGES,
    ownContext: { latest: true }
  });
});

test("DL3-F3: a conversation left by the pre-fix build is dropped, capability and all", async () => {
  const { readStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage({
    [KEY]: JSON.stringify({
      language: "en",
      session: { sessionId: "session-1", token: "K".repeat(43), identityBound: true },
      messages: MESSAGES,
      ownContext: { latest: true }
    })
  });
  assert.equal(readStoredSupportConversation(storage), null);
  assert.equal(storage.getItem(KEY), null, "the stale capability is erased, not merely ignored");
});

test("DL3-F3: a restored conversation round-trips without a session", async () => {
  const { readStoredSupportConversation, writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "ro",
    identityBound: false,
    messages: MESSAGES,
    ownContext: { runId: "run-7" }
  });
  assert.deepEqual(readStoredSupportConversation(storage), {
    language: "ro",
    identityBound: false,
    messages: MESSAGES,
    ownContext: { runId: "run-7" }
  });
});

// ---------------------------------------------- DL3-F3: the transcript belongs to one identity

test("DL3-F3: a transcript from another identity is erased, never shown to the next user", async () => {
  const { restoreSupportConversation, writeStoredSupportConversation } = await loadConversation();
  for (const [wrote, reads] of [[true, false], [false, true]]) {
    const storage = memoryStorage();
    writeStoredSupportConversation(storage, {
      language: "en", identityBound: wrote, messages: MESSAGES, ownContext: { latest: true }
    });
    assert.equal(restoreSupportConversation(storage, reads), null);
    assert.equal(storage.getItem(KEY), null, "an identity change erases the previous conversation");
  }
});

test("DL3-F3: the same identity keeps its own conversation across a reload", async () => {
  const { restoreSupportConversation, writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en", identityBound: true, messages: MESSAGES, ownContext: { latest: true }
  });
  assert.deepEqual(restoreSupportConversation(storage, true)?.messages, MESSAGES);
});

test("DL3-F3: clearing is what logout calls, and it survives an absent storage", async () => {
  const { clearStoredSupportConversation, writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en", identityBound: true, messages: MESSAGES, ownContext: { latest: true }
  });
  clearStoredSupportConversation(storage);
  assert.equal(storage.getItem(KEY), null);
  assert.doesNotThrow(() => clearStoredSupportConversation(null));
});

test("DL3-F3: a malformed or throwing store never breaks the widget", async () => {
  const { readStoredSupportConversation, writeStoredSupportConversation } = await loadConversation();
  assert.equal(readStoredSupportConversation(null), null);
  assert.equal(readStoredSupportConversation(memoryStorage({ [KEY]: "{" })), null);
  assert.equal(readStoredSupportConversation(memoryStorage({ [KEY]: '{"language":"de"}' })), null);
  const hostile = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); }
  };
  assert.equal(readStoredSupportConversation(hostile), null);
  assert.doesNotThrow(() => writeStoredSupportConversation(hostile, {
    language: "en", identityBound: false, messages: [], ownContext: { latest: true }
  }));
});

// ---------------------------------------------- DL3-F3: a stale session is not an outage

test("DL3-F3: the API's 404 is classified as a stale session, not a dead end", async () => {
  const { SupportHttpError, isStaleSupportSession } = await loadHttp();
  assert.equal(isStaleSupportSession(new SupportHttpError(404)), true);
  for (const other of [
    new SupportHttpError(401), new SupportHttpError(429), new SupportHttpError(503),
    new Error("SUPPORT_REQUEST_UNAVAILABLE"), null, undefined, 404
  ]) {
    assert.equal(isStaleSupportSession(other), false, `${String(other)} is not a stale session`);
  }
});

// ---------------------------------------------- DL3-F3: the call sites

test("DL3-F3: the assistant persists through the whitelisting writer and holds the capability in memory", () => {
  const source = read("./Assistant.tsx");
  assert.match(source, /writeStoredSupportConversation\(/u, "the assistant writes through the whitelist");
  assert.match(source, /restoreSupportConversation\(/u, "and restores only an identity-matched transcript");
  assert.doesNotMatch(
    source,
    /sessionStorage\.setItem/u,
    "no raw write can put the capability back in sessionStorage"
  );
  assert.doesNotMatch(
    source,
    /stored\?\.session|session:\s*stored/u,
    "the session is never seeded from storage"
  );
  assert.match(source, /isStaleSupportSession\(/u, "a 404 starts a new session instead of dead-ending");
});

test("DL3-F3: ending a session erases the support conversation in the same tab", () => {
  const source = read("../SessionControls.tsx");
  assert.match(source, /clearStoredSupportConversation/u);
  const finish = source.slice(source.indexOf("const finishSession"));
  assert.match(
    finish.slice(0, finish.indexOf("}")),
    /clearStoredSupportConversation\(\)/u,
    "logout, revoke-all and revoking this session all run through finishSession"
  );
});
