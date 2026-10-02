// S04-C4 / PLAN S4.1 — the fake API behind the real UI server for the two-page browser test.
// Node `http` on 127.0.0.1:<port> (default 4871). Run with `node --import tsx` so the contract's
// TypeScript schemas load: every body this fake sends on a contract route is parsed by the named
// contract schema BEFORE it is sent (a parse failure answers 500 and logs FAKE_API_SCHEMA_FAIL).
// It catches SHAPE drift from the contract; it cannot catch behaviour drift (D-S04-22) — the real
// stack is V's (SPEC-v2 §5).
//
// usage:
//   node --import tsx fake-api.mjs [--port 4871]     serve until SIGTERM; prints FAKE_API_LISTENING <port>
//   node --import tsx fake-api.mjs --self-check       every route answered once, every contract body parsed
//                                                     -> FAKE_API_SELF_CHECK OK (exit 0) | FAKE_API_SELF_CHECK FAIL (exit 1)
// Harness control (never reached by the browser: the UI proxy forwards /api/<path>, and no page calls /__fake):
//   GET  /__fake/state            -> { supportSessions, messageRequests, unhandled }
//   POST /__fake/hold?delay=<ms>  -> the NEXT support message reply is held <ms> before it is sent (RACE case)
import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import {
  SessionSchema, SessionListSchema, RevokeAllSessionsSchema, AgeConfirmationStatusSchema,
  AgeCheckResultSchema, PublicDebateListSchema, AnswerIndexSchema, AccountErasureStatusSchema
} from "../../../packages/contract/src/index.ts";

// Mirrors apps/api/src/index.ts:1198-1199 (names) and :1466-1480 (attributes).
export const SESSION_COOKIE_NAME = "__Host-debateai-session";
export const CSRF_COOKIE_NAME = "__Host-debateai-csrf";
const SESSION_IDLE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60; // index.ts:1230 (the UI proxy refuses any other Max-Age, route.ts:137-158)
const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";
const sessionCookie = (value) => `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${SESSION_IDLE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
const csrfCookie = (value) => `${CSRF_COOKIE_NAME}=${value}; Path=/; Max-Age=${SESSION_IDLE_MAX_AGE_SECONDS}; Secure; SameSite=Lax`;
const expiredCookies = () => [
  `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=${EXPIRED}; HttpOnly; Secure; SameSite=Lax`,
  `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=${EXPIRED}; Secure; SameSite=Lax`
];
// packages/contract/src/index.ts:228-230 (the refusal cookie the API adds at index.ts:1920).
const ageRefusalCookie = () => `__Host-debateai-age-refusal=refused; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`;
const KB_VERSION = "a".repeat(64);
const token43 = () => randomBytes(32).toString("base64url"); // 43 chars, /^[A-Za-z0-9_-]{43}$/

/** Accounts are made on first sign-in, one per e-mail. An e-mail that starts with `age` is an account
 *  created before the date-of-birth field: it answers `required` until it confirms (index.ts:1893-1900). */
export const ageRequiredFor = (email) => email.startsWith("age");

export function createFakeApi({ log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const owners = new Map(); // email -> { ownerRef, ageStatus }
  const challenges = new Map(); // challenge_token -> email
  const sessions = new Map(); // cookie token -> session record
  const supportSessions = new Map(); // support session id -> { token, ownerRef, createdAt, language }
  const messageRequests = []; // { sessionId, status, text, at }
  const unhandled = [];
  let holdNextReplyMs = 0;

  const ownerFor = (email) => {
    if (!owners.has(email)) {
      owners.set(email, {
        ownerRef: `owner:${randomUUID()}`,
        ageStatus: ageRequiredFor(email) ? "required" : "confirmed"
      });
    }
    return owners.get(email);
  };

  const cookieValue = (header, name) => {
    for (const part of String(header ?? "").split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === name) return v.join("=");
    }
    return null;
  };
  // The browser path forwards the cookie header through the UI proxy; a server render may carry the
  // session token as a cookie or a bearer — both are read, the cookie first.
  const authenticated = (req) => {
    const fromCookie = cookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
    const bearer = /^Bearer (.+)$/u.exec(String(req.headers.authorization ?? ""))?.[1] ?? null;
    const token = fromCookie || bearer;
    const record = token ? sessions.get(token) : undefined;
    return record && !record.revoked ? record : null;
  };
  const serverSession = (record) => ({
    asker_id: record.ownerRef,
    session_id: record.sessionId,
    caller_scope: "ASKER",
    ownership_provenance: "server_session",
    provisional_identity_model: false
  });
  const summary = (record, current) => {
    const created = new Date(record.createdAtMs);
    const now = Date.now();
    return {
      session_id: record.sessionId,
      created_at: created.toISOString(), // ISO with ms, the fake's clock at sign-in (PLAN S4.1)
      last_seen_at: new Date(now).toISOString(),
      idle_expires_at: new Date(now + SESSION_IDLE_MAX_AGE_SECONDS * 1000).toISOString(),
      absolute_expires_at: new Date(record.createdAtMs + 30 * 24 * 3600 * 1000).toISOString(),
      last_mfa_at: created.toISOString(),
      current
    };
  };
  const revokeOwner = (ownerRef) => {
    let n = 0;
    for (const s of sessions.values()) if (s.ownerRef === ownerRef && !s.revoked) { s.revoked = true; n++; }
    return n;
  };

  function send(res, status, body, { schema, cookies, route } = {}) {
    let payload = body;
    if (schema !== undefined) {
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        log(`FAKE_API_SCHEMA_FAIL ${route} ${JSON.stringify(parsed.error.issues).slice(0, 400)}`);
        status = 500; payload = { error: "FAKE_SCHEMA_FAIL" };
      } else payload = parsed.data;
    }
    const headers = { "cache-control": "no-store" };
    if (cookies) headers["set-cookie"] = cookies;
    if (payload === undefined) { res.writeHead(status, headers); res.end(); return; }
    headers["content-type"] = "application/json; charset=utf-8";
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const who = authenticated(req);

    // ---- harness control ----
    if (path === "/__fake/state" && method === "GET") {
      return send(res, 200, {
        supportSessions: [...supportSessions.entries()].map(([id, s]) => ({ id, ownerRef: s.ownerRef, createdAt: s.createdAt })),
        messageRequests,
        unhandled
      });
    }
    if (path === "/__fake/hold" && method === "POST") {
      const delay = Number(url.searchParams.get("delay") ?? 0);
      // a test-only hold: anything outside 0..30 000 ms is refused, so no long timer can be asked for
      if (!Number.isFinite(delay) || delay < 0 || delay > 30_000) return send(res, 400, { error: "DELAY_OUT_OF_RANGE" });
      holdNextReplyMs = delay;
      return send(res, 200, { holdNextReplyMs });
    }

    // ---- identity ----
    if (path === "/v1/session" && method === "GET") {
      if (!who) return send(res, 401, { error: "UNAUTHENTICATED" });
      return send(res, 200, serverSession(who), { schema: SessionSchema, route: "GET /v1/session" });
    }
    if (path === "/v1/auth/login" && method === "POST") {
      const body = await readBody(req);
      if (typeof body.challenge_token === "string") {
        const email = challenges.get(body.challenge_token);
        if (email === undefined) return send(res, 401, { error: "MFA_CHALLENGE_INVALID" });
        challenges.delete(body.challenge_token);
        const owner = ownerFor(email);
        const token = token43();
        const csrf = token43();
        const record = { token, csrf, email, ownerRef: owner.ownerRef, sessionId: randomUUID(), createdAtMs: Date.now(), revoked: false };
        sessions.set(token, record);
        const session = SessionSchema.parse(serverSession(record));
        // body of packages/contract/src/client.ts:246-250; cookies as apps/api/src/index.ts:1845-1848
        return send(res, 200, { status: "authenticated", csrf_token: csrf, session }, { cookies: [sessionCookie(token), csrfCookie(csrf)] });
      }
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const challenge = token43();
      challenges.set(challenge, email);
      return send(res, 202, { status: "mfa_required", challenge_token: challenge });
    }
    if (path === "/v1/auth/logout" && method === "POST") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      who.revoked = true;
      return send(res, 204, undefined, { cookies: expiredCookies() });
    }
    if (path === "/v1/auth/sessions" && method === "GET") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      const list = [...sessions.values()].filter((s) => s.ownerRef === who.ownerRef && !s.revoked)
        .map((s) => summary(s, s.token === who.token));
      return send(res, 200, { sessions: list }, { schema: SessionListSchema, route: "GET /v1/auth/sessions" });
    }
    const one = /^\/v1\/auth\/sessions\/([^/]+)$/u.exec(path);
    if (one && method === "DELETE") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      const id = decodeURIComponent(one[1]);
      const target = [...sessions.values()].find((s) => s.sessionId === id && s.ownerRef === who.ownerRef && !s.revoked);
      if (!target) return send(res, 404, { error: "NOT_FOUND" });
      target.revoked = true;
      return send(res, 204, undefined, target.token === who.token ? { cookies: expiredCookies() } : {});
    }
    if (path === "/v1/auth/sessions" && method === "DELETE") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      const revoked = revokeOwner(who.ownerRef);
      return send(res, 200, { revoked }, { schema: RevokeAllSessionsSchema, cookies: expiredCookies(), route: "DELETE /v1/auth/sessions" });
    }
    if (path === "/v1/auth/age-confirmation" && method === "GET") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      return send(res, 200, { status: ownerFor(who.email).ageStatus }, { schema: AgeConfirmationStatusSchema, route: "GET /v1/auth/age-confirmation" });
    }
    if (path === "/v1/auth/age-confirmation" && method === "POST") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      const body = await readBody(req);
      const dob = typeof body.date_of_birth === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(body.date_of_birth) ? body.date_of_birth : null;
      if (dob === null) return send(res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      const born = new Date(`${dob}T00:00:00Z`);
      const now = new Date();
      const eighteenth = new Date(Date.UTC(born.getUTCFullYear() + 18, born.getUTCMonth(), born.getUTCDate()));
      const owner = ownerFor(who.email);
      if (eighteenth <= now) {
        owner.ageStatus = "confirmed";
        return send(res, 200, { outcome: "allowed" }, { schema: AgeCheckResultSchema, route: "POST /v1/auth/age-confirmation" });
      }
      // as index.ts:1918-1921: every session of the account is gone; this browser keeps the refusal
      revokeOwner(who.ownerRef);
      return send(res, 200, { outcome: "refused" }, {
        schema: AgeCheckResultSchema, cookies: [...expiredCookies(), ageRefusalCookie()], route: "POST /v1/auth/age-confirmation"
      });
    }

    // ---- what /settings reads (no erasure scheduled) ----
    if (path === "/v1/account/erasure" && method === "GET") {
      if (!who) return send(res, 409, { error: "COOKIE_SESSION_REQUIRED" });
      return send(res, 200, { status: "NONE" }, { schema: AccountErasureStatusSchema, route: "GET /v1/account/erasure" });
    }

    // ---- what the home page reads server-side (client.ts:493, serverApi.ts:95 -> readAnswerIndex) ----
    if (path === "/v1/public/debates" && method === "GET") {
      return send(res, 200, { items: [], total: 0 }, { schema: PublicDebateListSchema, route: "GET /v1/public/debates" });
    }
    if (path === "/v1/answers" && method === "GET") {
      const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50);
      const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
      return send(res, 200, { items: [], open_runs: [], limit, offset, total: 0 }, { schema: AnswerIndexSchema, route: "GET /v1/answers" });
    }

    // ---- support (apps/api/src/support/index.ts; no contract schema exists for these bodies) ----
    if (path === "/v1/support/status" && method === "GET") {
      return send(res, 200, { configuration: { kind: "AVAILABLE" }, relay_state: "AVAILABLE", kb_version: KB_VERSION, kb_loaded: { shipped: 1 } });
    }
    if (path === "/v1/support/cases" && method === "GET") {
      // support/index.ts:926-941: anonymous 401; the account's own cases (none in this fake)
      if (!who) return send(res, 401, { error: "AUTHENTICATION_REQUIRED" });
      return send(res, 200, { cases: [] });
    }
    if (path === "/v1/support/sessions" && method === "POST") {
      const body = await readBody(req);
      const language = typeof body.language === "string" ? body.language : "en";
      const id = randomUUID();
      const token = token43();
      const createdAt = new Date();
      supportSessions.set(id, { token, ownerRef: who?.ownerRef ?? null, createdAt: createdAt.toISOString(), language });
      // support/index.ts:386-393 with publicSession() of :118-127
      return send(res, 201, {
        session: { session_id: id, identity_bound: who !== null, language, state: "OPEN", kb_version: KB_VERSION, created_at: createdAt.toISOString() },
        session_token: token,
        first_message: { role: "assistant", text: "S04 fake support: ask a question." }
      });
    }
    const msg = /^\/v1\/support\/sessions\/([^/]+)\/messages$/u.exec(path);
    if (msg && method === "POST") {
      const id = decodeURIComponent(msg[1]);
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text : "";
      const found = supportSessions.get(id);
      const token = req.headers["x-support-session-token"];
      // support/index.ts:431-452: an unknown session, a wrong capability or another owner (:129-131) all answer 404
      if (!found || typeof token !== "string" || token !== found.token || found.ownerRef !== (who?.ownerRef ?? null)) {
        messageRequests.push({ sessionId: id, status: 404, text, at: Date.now() });
        return send(res, 404, { error: "NOT_FOUND" });
      }
      const hold = holdNextReplyMs; holdNextReplyMs = 0;
      if (hold > 0 && hold <= 30_000) await new Promise((r) => setTimeout(r, hold));
      messageRequests.push({ sessionId: id, status: 200, text, at: Date.now(), heldMs: hold });
      return send(res, 200, {
        message_id: randomUUID(), outcome: "ANSWER_GROUNDED", text: `reply to: ${text}`,
        can_escalate: false, sources: [], actions: []
      });
    }

    unhandled.push(`${method} ${path}`);
    log(`FAKE_API_UNHANDLED ${method} ${path}`);
    return send(res, 404, { error: "NOT_FOUND" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(`FAKE_API_ERROR ${req.method} ${req.url} ${error?.stack ?? error}`);
      if (!res.headersSent) send(res, 500, { error: "FAKE_API_ERROR" });
    });
  });
  return { server, state: { owners, sessions, supportSessions, messageRequests, unhandled } };
}

// ---- self-check: every route answered once, every contract body parsed by its schema ----
async function selfCheck(port) {
  const lines = [];
  const { server } = createFakeApi({ log: (l) => lines.push(l) });
  await new Promise((r, j) => { server.once("error", j); server.listen(port, "127.0.0.1", r); });
  const base = `http://127.0.0.1:${port}`;
  let jar = "";
  const results = [];
  const call = async (label, method, path, { body, schema, expect, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method, headers: { "content-type": "application/json", ...(jar ? { cookie: jar } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookies = res.headers.getSetCookie();
    for (const c of setCookies) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      const rest = jar.split("; ").filter((p) => p && !p.startsWith(`${k}=`));
      if (v) rest.push(`${k}=${v}`);
      jar = rest.join("; ");
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    let ok = res.status === expect;
    let why = ok ? "" : `status ${res.status} != ${expect}`;
    if (ok && schema) { const p = schema.safeParse(json); if (!p.success) { ok = false; why = "schema"; } }
    results.push({ label, ok, why });
    return { res, json, setCookies };
  };
  try {
    await call("session anonymous 401", "GET", "/v1/session", { expect: 401 });
    await call("support cases anonymous 401", "GET", "/v1/support/cases", { expect: 401 });
    const begin = await call("login begin", "POST", "/v1/auth/login", { body: { email: "x@s04.test", password: "pw" }, expect: 202 });
    const done = await call("login complete", "POST", "/v1/auth/login", { body: { challenge_token: begin.json.challenge_token, code: "123456" }, expect: 200 });
    // byte-exact against the API's templates (index.ts:1466-1472, Max-Age 14 d at :1230): the UI proxy drops any other shape
    const sv = /^__Host-debateai-session=([A-Za-z0-9_-]{43}); Path=\/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax$/u.exec(done.setCookies[0] ?? "");
    const cv = /^__Host-debateai-csrf=([A-Za-z0-9_-]{43}); Path=\/; Max-Age=1209600; Secure; SameSite=Lax$/u.exec(done.setCookies[1] ?? "");
    const cookieOk = done.setCookies.length === 2 && sv !== null && cv !== null && cv[1] === done.json.csrf_token
      && SessionSchema.safeParse(done.json.session).success;
    results.push({ label: "login cookies + body", ok: cookieOk, why: cookieOk ? "" : "cookies/body" });
    await call("session live", "GET", "/v1/session", { schema: SessionSchema, expect: 200 });
    const list = await call("sessions list", "GET", "/v1/auth/sessions", { schema: SessionListSchema, expect: 200 });
    const cur = list.json.sessions.find((s) => s.current);
    const msOk = cur !== undefined && /\.\d{3}Z$/u.test(cur.created_at);
    results.push({ label: "created_at ISO ms + current", ok: msOk, why: msOk ? "" : "created_at" });
    await call("age status", "GET", "/v1/auth/age-confirmation", { schema: AgeConfirmationStatusSchema, expect: 200 });
    await call("account erasure status", "GET", "/v1/account/erasure", { schema: AccountErasureStatusSchema, expect: 200 });
    await call("public debates", "GET", "/v1/public/debates?limit=20&offset=0", { schema: PublicDebateListSchema, expect: 200 });
    await call("answer index", "GET", "/v1/answers?limit=50&offset=0", { schema: AnswerIndexSchema, expect: 200 });
    await call("support status", "GET", "/v1/support/status", { expect: 200 });
    await call("support cases signed in", "GET", "/v1/support/cases", { expect: 200 });
    const created = await call("support session", "POST", "/v1/support/sessions", { body: { language: "en" }, expect: 201 });
    const sid = created.json?.session?.session_id; const stok = created.json?.session_token;
    await fetch(`${base}/__fake/hold?delay=150`, { method: "POST" });
    const t0 = Date.now();
    const reply = await call("support message", "POST", `/v1/support/sessions/${sid}/messages`, { body: { text: "hi" }, headers: { "x-support-session-token": stok }, expect: 200 });
    const heldOk = Date.now() - t0 >= 140 && reply.json?.text === "reply to: hi" && reply.json?.outcome === "ANSWER_GROUNDED";
    results.push({ label: "support reply held + text", ok: heldOk, why: heldOk ? "" : "hold/text" });
    await call("support message wrong token 404", "POST", `/v1/support/sessions/${sid}/messages`, { body: { text: "hi" }, headers: { "x-support-session-token": "nope" }, expect: 404 });
    // owner check: a signed-out cookie jar posting to X's support session is refused (support/index.ts:129-131)
    const saved = jar; jar = "";
    await call("support message other owner 404", "POST", `/v1/support/sessions/${sid}/messages`, { body: { text: "hi" }, headers: { "x-support-session-token": stok }, expect: 404 });
    jar = saved;
    // a second session of the same account, revoked by id (not current -> no cookies)
    const b2 = await (await fetch(`${base}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "x@s04.test", password: "pw" }) })).json();
    const c2 = await fetch(`${base}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challenge_token: b2.challenge_token, code: "1" }) });
    const other = (await c2.json()).session.session_id;
    const del = await call("revoke other session", "DELETE", `/v1/auth/sessions/${other}`, { expect: 204 });
    results.push({ label: "revoke other sets no cookie", ok: del.setCookies.length === 0, why: "cookies" });
    const delCur = await call("revoke this session", "DELETE", `/v1/auth/sessions/${cur.session_id}`, { expect: 204 });
    results.push({ label: "revoke this expires cookies", ok: delCur.setCookies.length === 2 && delCur.setCookies.every((c) => /Max-Age=0/u.test(c)), why: "cookies" });
    // sign in again; revoke all
    const b3 = await call("login begin 2", "POST", "/v1/auth/login", { body: { email: "x@s04.test", password: "pw" }, expect: 202 });
    await call("login complete 2", "POST", "/v1/auth/login", { body: { challenge_token: b3.json.challenge_token, code: "1" }, expect: 200 });
    const all = await call("revoke all", "DELETE", "/v1/auth/sessions", { schema: RevokeAllSessionsSchema, expect: 200 });
    results.push({ label: "revoke all expires cookies", ok: all.setCookies.length === 2, why: "cookies" });
    // sign in, logout
    const b4 = await call("login begin 3", "POST", "/v1/auth/login", { body: { email: "y@s04.test", password: "pw" }, expect: 202 });
    await call("login complete 3", "POST", "/v1/auth/login", { body: { challenge_token: b4.json.challenge_token, code: "1" }, expect: 200 });
    const out = await call("logout", "POST", "/v1/auth/logout", { expect: 204 });
    const expiredOk = out.setCookies.length === 2
      && out.setCookies[0] === "__Host-debateai-session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
      && out.setCookies[1] === "__Host-debateai-csrf=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax";
    results.push({ label: "logout expires cookies (byte-exact, index.ts:1474-1480)", ok: expiredOk, why: "cookies" });
    await call("logout without session 409", "POST", "/v1/auth/logout", { expect: 409 });
    // the age account: required, then refused (every session gone, refusal cookie)
    const b5 = await call("login begin age", "POST", "/v1/auth/login", { body: { email: "age@s04.test", password: "pw" }, expect: 202 });
    await call("login complete age", "POST", "/v1/auth/login", { body: { challenge_token: b5.json.challenge_token, code: "1" }, expect: 200 });
    const req = await call("age status required", "GET", "/v1/auth/age-confirmation", { schema: AgeConfirmationStatusSchema, expect: 200 });
    results.push({ label: "age account required", ok: req.json.status === "required", why: req.json.status });
    const young = `${new Date().getUTCFullYear() - 10}-01-01`;
    const refused = await call("age refused", "POST", "/v1/auth/age-confirmation", { body: { date_of_birth: young }, schema: AgeCheckResultSchema, expect: 200 });
    results.push({ label: "age refused + 3 cookies (refusal byte-exact, index.ts:1487-1490)", ok: refused.json.outcome === "refused" && refused.setCookies.length === 3
      && refused.setCookies[2] === "__Host-debateai-age-refusal=refused; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax", why: "refusal" });
    await call("session after refusal 401", "GET", "/v1/session", { expect: 401 });
    await call("unknown route 404", "GET", "/v1/does-not-exist", { expect: 404 });
    const unhandledLogged = lines.some((l) => l === "FAKE_API_UNHANDLED GET /v1/does-not-exist");
    results.push({ label: "unknown route logged", ok: unhandledLogged, why: "log" });
    results.push({ label: "no schema failure logged", ok: !lines.some((l) => l.startsWith("FAKE_API_SCHEMA_FAIL")), why: lines.join(" | ") });
  } finally {
    await new Promise((r) => server.close(r));
  }
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.label}${r.ok ? "" : ` (${r.why})`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`checks=${results.length} failed=${failed}`);
  console.log(failed === 0 ? "FAKE_API_SELF_CHECK OK" : "FAKE_API_SELF_CHECK FAIL");
  return failed === 0;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const portArg = args.indexOf("--port");
  const port = portArg >= 0 ? Number(args[portArg + 1]) : 4871;
  if (args.includes("--self-check")) {
    const ok = await selfCheck(port).catch((e) => { console.log(`FAKE_API_ERROR ${e?.stack ?? e}`); console.log("FAKE_API_SELF_CHECK FAIL"); return false; });
    process.exit(ok ? 0 : 1);
  } else {
    const { server } = createFakeApi();
    server.listen(port, "127.0.0.1", () => console.log(`FAKE_API_LISTENING ${port}`));
    const stop = () => { server.close(() => process.exit(0)); server.closeAllConnections(); setTimeout(() => process.exit(0), 1000).unref(); };
    process.on("SIGTERM", stop); process.on("SIGINT", stop);
  }
}
