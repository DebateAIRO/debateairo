import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const conversationUrl = new URL("./conversation.ts", import.meta.url).href;
const loadConversation = () => import(`${conversationUrl}?cacheBust=${Date.now()}`);
const httpUrl = new URL("./http.ts", import.meta.url).href;
const loadHttp = () => import(`${httpUrl}?cacheBust=${Date.now()}`);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const KEY = "debateai.support.conversation.v2";
/** The name the pre-fix build wrote under, which no build may read again. */
const RETIRED_KEY = "debateai.support.conversation.v1";
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
    messages: MESSAGES
  });
});

test("DL3-F3: a conversation left by the pre-fix build is dropped, capability and all", async () => {
  const { readStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage({
    [KEY]: JSON.stringify({
      language: "en",
      session: { sessionId: "session-1", token: "K".repeat(43), identityBound: true },
      messages: MESSAGES
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
    messages: MESSAGES
  });
  assert.deepEqual(readStoredSupportConversation(storage), {
    language: "ro",
    identityBound: false,
    messages: MESSAGES
  });
});

// ---------------------------------------------- DL3-F3: the transcript belongs to one identity

test("DL3-F3: a transcript from another identity is erased, never shown to the next user", async () => {
  const { restoreSupportConversation, writeStoredSupportConversation } = await loadConversation();
  for (const [wrote, reads] of [[true, false], [false, true]]) {
    const storage = memoryStorage();
    writeStoredSupportConversation(storage, {
      language: "en", identityBound: wrote, messages: MESSAGES
    });
    assert.equal(restoreSupportConversation(storage, reads), null);
    assert.equal(storage.getItem(KEY), null, "an identity change erases the previous conversation");
  }
});

test("DL3-F3: the same identity keeps its own conversation across a reload", async () => {
  const { restoreSupportConversation, writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en", identityBound: true, messages: MESSAGES
  });
  assert.deepEqual(restoreSupportConversation(storage, true)?.messages, MESSAGES);
});

test("DL3-F3: clearing is what logout calls, and it survives an absent storage", async () => {
  const { clearStoredSupportConversation, writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en", identityBound: true, messages: MESSAGES
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
    language: "en", identityBound: false, messages: []
  }));
});

// ---------------------------------------------- SYNC3: dev's reviewed decorations, both doors

/**
 * dev's reviewed-response rework gives an assistant answer its reviewed
 * `sources` and canonical `actions`. They rest in the browser only through the
 * same validators the response boundary uses: a stored action whose href is
 * not the canonical one for its identity and language would otherwise be a
 * link of the payload's own choosing, restored straight onto the page.
 */
const DECORATED = Object.freeze({
  id: "answer-1",
  role: "assistant",
  text: "Current product guidance.",
  outcome: "ANSWER_GROUNDED",
  language: "en",
  sources: [{ id: "getting-started-debate", label: "Create a debate" }],
  actions: [{ id: "start-debate", label: "Start a debate", href: "/login?next=%2Fnew" }]
});

test("SYNC3: reviewed sources and canonical actions round-trip through the whitelist", async () => {
  const { readStoredSupportConversation, writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en", identityBound: false, messages: [...MESSAGES, DECORATED]
  });
  assert.deepEqual(readStoredSupportConversation(storage)?.messages, [...MESSAGES, DECORATED]);
});

test("SYNC3: a stored forged action or source refuses the whole payload, and erases it", async () => {
  const { readStoredSupportConversation } = await loadConversation();
  for (const forged of [
    { ...DECORATED, actions: [{ id: "home", label: "Reset account", href: "/settings" }] },
    { ...DECORATED, actions: [{ id: "start-debate", label: "Start a debate", href: "/new" }] },
    { ...DECORATED, sources: [{ id: "not-a-reviewed-article", label: "Anything" }] },
    { ...DECORATED, sources: [{ id: "getting-started-debate", label: "x", path: "/internal" }] }
  ]) {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ language: "en", identityBound: false, messages: [...MESSAGES, forged] })
    });
    assert.equal(readStoredSupportConversation(storage), null);
    assert.equal(storage.getItem(KEY), null, "a forged decoration is erased, not merely ignored");
  }
});

test("SYNC3: the writer never stores a decoration the response boundary would refuse", async () => {
  const { writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en",
    identityBound: false,
    messages: [...MESSAGES, { ...DECORATED, actions: [{ id: "home", label: "Home", href: "/elsewhere" }] }]
  });
  const raw = storage.entries()[KEY];
  assert.doesNotMatch(raw, /elsewhere/u);
  assert.deepEqual(JSON.parse(raw).messages, MESSAGES);
});

// ---------------------------------------------- DL1-F5c: the case bearer never rests on disk

/**
 * A case token is the sole capability to read a whole case — the reporter's
 * words, V's replies, the model summary — and to reply as the reporter, for
 * thirty days, with no cookie. The acknowledgement the API writes carries it
 * three times over: in the message id, in the sentence, and in the link. The
 * widget kept that message in the transcript it writes to `sessionStorage`, so
 * the strongest bearer the support surface mints was the one thing that rested
 * on disk for the life of a tab — exactly what DL3-F3 removed for the weaker
 * session capability.
 */
const CASE_TOKEN = "T".repeat(43);
const TOKEN_SHAPED = /[A-Za-z0-9_-]{43}/u;
const CASE_ACKNOWLEDGEMENT = Object.freeze({
  id: `case-${CASE_TOKEN}`,
  role: "assistant",
  text: `I've opened case ${CASE_TOKEN} for a person. Expected reply: within 48 hours. Check replies at /help#case=${CASE_TOKEN}. I can't promise an outcome.`,
  link: `/help#case=${CASE_TOKEN}`
});

test("DL1-F5c: a persisted acknowledgement carries no case bearer in its id, text or link", async () => {
  const { writeStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage();
  writeStoredSupportConversation(storage, {
    language: "en",
    identityBound: false,
    messages: [...MESSAGES, { ...CASE_ACKNOWLEDGEMENT, caseOpened: true }]
  });
  const raw = storage.entries()[KEY];
  assert.equal(typeof raw, "string");
  assert.ok(!raw.includes(CASE_TOKEN), "the 30-day case capability is not in what rests in the browser");
  assert.doesNotMatch(raw, TOKEN_SHAPED, "and nothing token-shaped survives the writer");
  assert.doesNotMatch(raw, /case=[A-Za-z0-9_-]/u, "nor any link fragment still carrying one");
  const stored = JSON.parse(raw).messages.at(-1);
  assert.equal(stored.caseOpened, true, "the transcript still says a case was opened");
  assert.equal(stored.link, undefined, "the bearer link is dropped, never half-written");
});

test("DL1-F5c: a bearer left by the pre-fix build is never read back into the page", async () => {
  const { readStoredSupportConversation } = await loadConversation();
  const storage = memoryStorage({
    [KEY]: JSON.stringify({
      language: "en",
      identityBound: false,
      messages: [...MESSAGES, CASE_ACKNOWLEDGEMENT]
    })
  });
  const restored = readStoredSupportConversation(storage);
  assert.notEqual(restored, null);
  const raw = JSON.stringify(restored);
  assert.ok(!raw.includes(CASE_TOKEN), "a tab open across the deploy hands its bearer to nobody");
  assert.doesNotMatch(raw, TOKEN_SHAPED);
  assert.equal(restored.messages.at(-1).link, undefined);
});

/**
 * Fix round 1. The reader stripped what it RETURNED, so the page was clean —
 * but a payload it refused (a shape it does not recognise, JSON it cannot
 * parse) was left exactly where it was, and the key itself was reused across
 * the deploy. A bearer the reader will not hand to the page is still a bearer
 * resting in the browser: the tab that wrote it keeps its `sessionStorage`
 * until it is closed. So the key is retired and every non-success path erases.
 */
test("DL1-F5c: the retired key and any payload the reader refuses are erased, not left behind", async () => {
  const { readStoredSupportConversation, SUPPORT_CONVERSATION_STORAGE_KEY } = await loadConversation();
  assert.equal(SUPPORT_CONVERSATION_STORAGE_KEY, KEY, "the pre-fix key name is not reused");

  const legacy = JSON.stringify({
    language: "en",
    identityBound: false,
    messages: [...MESSAGES, CASE_ACKNOWLEDGEMENT]
  });
  // (a) A tab open across the deploy: the old key, written by the old build.
  const carried = memoryStorage({ [RETIRED_KEY]: legacy });
  assert.equal(readStoredSupportConversation(carried), null, "the retired key is not read");
  assert.equal(carried.getItem(RETIRED_KEY), null, "it does not outlive the deploy either");
  assert.doesNotMatch(JSON.stringify(carried.entries()), TOKEN_SHAPED);

  // (b) Under the current key: a shape the reader refuses, and unparsable JSON.
  for (const raw of [
    JSON.stringify({ language: "de", identityBound: false, messages: [CASE_ACKNOWLEDGEMENT] }),
    `{"language":"en","messages":[${JSON.stringify(CASE_ACKNOWLEDGEMENT)}`
  ]) {
    const refused = memoryStorage({ [KEY]: raw });
    assert.equal(readStoredSupportConversation(refused), null);
    assert.equal(refused.getItem(KEY), null, "a payload the reader will not use is erased");
    assert.doesNotMatch(JSON.stringify(refused.entries()), TOKEN_SHAPED);
  }
});

test("DL1-F5c: the assistant holds the case bearer in memory and stores a token-free notice", () => {
  const source = read("./Assistant.tsx");
  assert.doesNotMatch(
    source,
    /id:\s*`case-\$\{[^}]*[Tt]oken\}`/u,
    "no message id is minted from the bearer"
  );
  assert.match(source, /setCaseBearer\(/u, "the bearer is React state, like the session capability");
  assert.match(
    source,
    /supportCaseLink\(bearer\.token\)/u,
    "the link is rebuilt from the in-memory bearer when rendering"
  );
  assert.match(
    source,
    /CASE_OPENED_NOTICE/u,
    "and the transcript keeps a token-free notice for when the bearer is gone"
  );
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
