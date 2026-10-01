// S04-C4 / PLAN S4.2 — the two-page browser test (SPEC-v2 R01-R04, R08; O1-1).
// The real UI server (`node server.mjs`, a `next build` made by c4.sh's ensure_build) on 127.0.0.1:4870, in front
// of the fake API (fake-api.mjs) on 127.0.0.1:4871. Chromium new headless (playwright-core via NODE_PATH).
//
// usage: node --import tsx tests/browser/s04-support-cross-tab/run.mjs --ui-root <apps/ui dir> --no-build [--only <regex>]
//   --no-build  required: this harness never builds; c4.sh builds first when the build stamp differs (B3, D-S04-26).
//   --only      a debugging subset (never used by c4.sh): the run then ends with the marker PARTIAL, never CLUSTER_GREEN.
//   env: S04_PID_DIR (c4.sh: this run's <log>.pids/) — both PIDs are written there and killed by PID at teardown.
//   env: S04_INJECT=<fault> — the refutation matrix only (packet charge 2: every oracle must be able to fail). It injects
//        one known fault into tab A so an oracle that passes on the product is shown to bite; c4.sh never sets it, and
//        a run with it ends with the marker INJECTED, never CLUSTER_GREEN. Faults: flash (a marker node shown for 100 ms
//        after a reload wake) · gate-at-sleep (an identity request at pagehide) · second-at-sleep (an /auth/sessions
//        request at pagehide — must NOT fail, N4-p3) · erase-on-wake (the key removed before the woken page reads it) ·
//        erase-at-<ms> (tab A's copy erased <ms> after tab B's member request) · no-date (the first support-session
//        response loses its date header).
// Output: one `PASS <id> <ms> …` or `FAIL <id> <reason>` per counted case, `RECORDED …` lines (not counted),
//   `cases=<n> failures=<n>`, then the marker as the LAST line: CLUSTER_GREEN | CLUSTER_RED | BROKEN (| PARTIAL).
//
// Oracles (PLAN S4.2):
//   absent     no text node of tab A contains the case marker, and `debateai.support.conversation.v2` is absent or its
//              stored value contains no occurrence of it (stricter than "no message's text": any field counts).
//   moment     an init-script MutationObserver records every marker text node added in tab A with performance.now();
//              and at each wake event (resume / pageshow) the init script records whether a marker text node is present.
//              Fails on an addition after the wake moment (navigation start of a new document, or the first wake event
//              of the sleep pair) or a marker present at a wake event.
//   asleep     sleep family: identity requests (`/api/v1/session`) STARTED in [synthetic pagehide, first wake event),
//              wake excluded (B2-p2). Only the identity request begins a gate, so an in-flight settle's second request
//              (`/api/v1/auth/sessions`) in that window is printed but is not a failure (N4-p3, packet charge 3).
//   keep       the marker is rendered in tab A and the key still holds it. The sleep keep case (R02-keep-sleep-0) also
//              holds the rest of the conversation across the sleep (FIX p2, PT2-N5; SPEC-v2 Terms, R04): the case
//              link opened before the sleep is shown, the unsent draft is back in the composer, and the next message
//              goes to the support session opened before the sleep.
//   R01 timing from tab B's session request completing until `absent` holds; FAIL above 2000 ms.
//   DATE-HEADER precondition: the first `/api/v1/support/sessions` response carries a parseable `date`.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_PORT = 4870;
const API_PORT = 4871;
const ORIGIN = `http://localhost:${UI_PORT}`;
const PARK = `http://127.0.0.1:${UI_PORT}/cookies`; // another origin: tab A's page and listeners are gone, its localhost storage kept
const KEY = "debateai.support.conversation.v2";
const R01_BOUND_MS = 2000;
const CASE_LIMIT_MS = 120000; // a case that hangs is a FAIL naming its step, never a stuck run
const SETTLE_MS = 2500; // a woken or reloaded tab A is judged this long after the wake, with the observer covering every moment before
const INJECT = process.env.S04_INJECT ?? "";
const lines = [];
const out = (line) => { lines.push(line); process.stdout.write(`${line}\n`); };

// ---------- arguments and preconditions ----------
const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const uiRoot = argOf("--ui-root") ? path.resolve(argOf("--ui-root")) : undefined;
const only = argOf("--only") ? new RegExp(argOf("--only")) : null;
const pidDir = process.env.S04_PID_DIR ? path.resolve(process.env.S04_PID_DIR) : path.join(HERE, ".pids-unused");
function broken(reason) { out(`BROKEN ${reason}`); out("BROKEN"); process.exit(1); }
if (!argv.includes("--no-build")) broken("--no-build is required: the harness never builds (c4.sh ensure_build does, B3)");
if (!uiRoot || !fs.existsSync(path.join(uiRoot, "server.mjs"))) broken(`--ui-root must be an apps/ui dir holding server.mjs (got ${uiRoot})`);
if (!fs.existsSync(path.join(uiRoot, ".next", "BUILD_ID"))) broken(`no build at ${uiRoot}/.next (run through c4.sh, which builds)`);
if (!process.env.S04_PID_DIR) broken("S04_PID_DIR is unset (c4.sh sets it to this run's <log>.pids/, N2)");
fs.mkdirSync(pidDir, { recursive: true });

const portBusy = (port) => new Promise((resolve) => {
  const s = net.connect({ port, host: "127.0.0.1" });
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("error", () => resolve(false));
});
for (const p of [UI_PORT, API_PORT]) if (await portBusy(p)) broken(`PORTS ${p} busy before start`);
out(`precondition PORTS ${UI_PORT}/${API_PORT} free`);

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(`${process.env.NODE_PATH}/playwright-core`)); } catch (e) { broken(`PLAYWRIGHT playwright-core not found at NODE_PATH=${process.env.NODE_PATH}: ${e.message}`); }

const lane = path.resolve(HERE, "..", "..", "..");
const childEnv = { ...process.env }; delete childEnv.NODE_PATH;
const selfCheck = spawnSync(process.execPath, ["--import", "tsx", path.join(HERE, "fake-api.mjs"), "--self-check"], { cwd: lane, env: childEnv, encoding: "utf8" });
if (!/FAKE_API_SELF_CHECK OK/.test(selfCheck.stdout ?? "")) broken(`FAKE-API self-check failed: ${(selfCheck.stdout + selfCheck.stderr).slice(-600)}`);
out("precondition FAKE-API self-check OK");

// ---------- the two servers, PIDs in S04_PID_DIR ----------
const children = [];
function startChild(name, args, cwd, env) {
  const log = fs.openSync(path.join(pidDir, `${name}.log`), "w");
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", log, log] });
  fs.writeFileSync(path.join(pidDir, `${name}.pid`), String(child.pid));
  children.push({ name, child });
  return child;
}
function teardown() {
  for (const { name, child } of children) {
    try { process.kill(child.pid, "SIGTERM"); } catch { /* already gone */ }
    try { fs.rmSync(path.join(pidDir, `${name}.pid`)); } catch { /* c4.sh sweeps what is left */ }
  }
}
process.on("exit", teardown);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { teardown(); process.exit(130); });

startChild("fake-api", ["--import", "tsx", path.join(HERE, "fake-api.mjs"), "--port", String(API_PORT)], lane, childEnv);
startChild("ui-server", ["server.mjs"], uiRoot, { ...childEnv, PORT: String(UI_PORT), DIALECTICAL_API_BASE: `http://127.0.0.1:${API_PORT}`, NODE_ENV: "production" });
async function waitHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
// 60 s: under a loaded machine tsx's first transpile of the contract took over 20 s once (measured: a BROKEN refutation run)
if (!(await waitHttp(`http://127.0.0.1:${API_PORT}/__fake/state`, 60000))) broken("fake API did not answer on :4871 within 60 s");
if (!(await waitHttp(`http://127.0.0.1:${UI_PORT}/cookies`, 90000))) broken("UI server did not answer on :4870");
out(`servers up: ui-root=${uiRoot}`);
const fakeState = async () => (await fetch(`http://127.0.0.1:${API_PORT}/__fake/state`)).json();
const fakeHold = async (ms) => fetch(`http://127.0.0.1:${API_PORT}/__fake/hold?delay=${ms}`, { method: "POST" });

const browser = await chromium.launch({ channel: "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"] });
out(`browser chromium ${browser.version()}`);

// ---------- tab A init script ----------
function s04Init(marker) {
  const now = () => performance.now();
  const hasMarker = () => {
    const root = document.documentElement;
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.data || "").includes(marker)) return true;
    return false;
  };
  const S = { marker, adds: [], events: [], fetches: [], docStart: now() }; // docStart: this document's first in-page moment
  Object.defineProperty(window, "__s04", { value: S });
  const touches = (n) => n && ((n.nodeType === 3 && (n.data || "").includes(marker)) || (n.nodeType === 1 && (n.textContent || "").includes(marker)));
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData" ? touches(m.target) : [...m.addedNodes].some(touches)) { S.adds.push(now()); return; }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  for (const t of ["pagehide", "pageshow"]) addEventListener(t, (e) => S.events.push({ type: t, t: now(), persisted: e.persisted === true, present: hasMarker() }), { capture: true });
  for (const t of ["freeze", "resume"]) document.addEventListener(t, () => S.events.push({ type: t, t: now(), present: hasMarker() }), { capture: true });
  const original = window.fetch;
  window.fetch = function s04Fetch(input, init) {
    let p = "";
    try { p = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : String(input), location.href).pathname; } catch { /* keep "" */ }
    const rec = { p, start: now(), end: null, status: null };
    if (p.startsWith("/api/v1/")) S.fetches.push(rec);
    const r = original.apply(this, arguments);
    r.then((x) => { rec.end = now(); rec.status = x.status; }, () => { rec.end = now(); rec.status = 0; });
    return r;
  };
  window.__s04Hide = () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  window.__s04Check = () => {
    let storage = "absent";
    try {
      const raw = sessionStorage.getItem("debateai.support.conversation.v2");
      if (raw !== null) storage = raw.includes(marker) ? "holds" : "clean";
    } catch { storage = "unreadable"; }
    return { dom: hasMarker(), storage, t: now() };
  };
}
const SLEEP = `dispatchEvent(Object.defineProperty(new Event("pagehide"),"persisted",{value:true})); document.dispatchEvent(new Event("freeze"));`;
const WAKE = `document.dispatchEvent(new Event("resume")); dispatchEvent(Object.defineProperty(new Event("pageshow"),"persisted",{value:true}));`;

// ---------- helpers ----------
let dateHeaderChecked = false;
function watchDateHeader(page) {
  page.on("response", (r) => {
    if (dateHeaderChecked || r.request().method() !== "POST" || new URL(r.url()).pathname !== "/api/v1/support/sessions") return;
    dateHeaderChecked = true;
    const d = r.headers().date;
    if (d && Number.isFinite(Date.parse(d))) out(`precondition DATE-HEADER ok (${d})`);
    else { out(`BROKEN DATE-HEADER the first /api/v1/support/sessions response has no parseable date (${d})`); dateBroken = true; }
  });
}
let dateBroken = false;

// The marker is words, not a token: the panel shows and stores a token-like string as "[REDACTED_SECRET_LIKE]"
// (measured: "S04-R01-REVOKE-THIS-visible-<8 hex>" was redacted), which would make the absent oracle vacuous.
// sendA() therefore proves the marker is shown AND stored verbatim before any case goes on.
const nonce = () => [...randomBytes(5)].map((x) => "bcdfghjklmnpqrstvwxz"[x % 20]).join("");
const markerFor = (id) => `S04 case ${id.replace(/-/g, " ")} nonce ${nonce()}`;
async function openCase(id, { clockOffset } = {}) {
  const context = await browser.newContext();
  context.setDefaultNavigationTimeout(60000); // a loaded machine (other lanes building) slows loads; a hang still ends at CASE_LIMIT_MS
  if (clockOffset !== undefined) await context.clock.install({ time: Date.now() + clockOffset });
  const marker = markerFor(id);
  const a = await context.newPage();
  await a.addInitScript(s04Init, marker);
  if (INJECT === "no-date") {
    await a.route("**/api/v1/support/sessions", async (route) => {
      const resp = await route.fetch();
      const headers = { ...resp.headers() }; delete headers.date;
      await route.fulfill({ response: resp, headers });
    });
  }
  watchDateHeader(a);
  const b = await context.newPage();
  const pending = new Map();
  for (const [tab, page] of [["A", a], ["B", b]]) {
    page.on("request", (r) => pending.set(r, `${tab} ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`));
    page.on("requestfinished", (r) => pending.delete(r));
    page.on("requestfailed", (r) => pending.delete(r));
  }
  context.__pending = pending;
  const tag = `${id.toLowerCase()}-${randomBytes(3).toString("hex")}`;
  return { context, a, b, marker, id, tag };
}
async function ackConsent(page) {
  const btn = page.locator("button.consentPrimary");
  try { await btn.waitFor({ state: "visible", timeout: 3000 }); await btn.click(); } catch { /* not shown */ }
}
async function gotoA(c, url) { c.step = `tab A goto ${url}`; await c.a.goto(url, { waitUntil: "load" }); }
/** Tab B: sign in or out by direct fetch through the UI proxy (no UI, so no announcement from this call). */
async function bFetch(c, op, email) {
  c.step = `tab B fetch ${op}`;
  if (!c.b.url().startsWith(ORIGIN)) await c.b.goto(`${ORIGIN}/cookies`, { waitUntil: "load" });
  return c.b.evaluate(async ({ op, email }) => {
    const csrf = () => (document.cookie.split("; ").find((p) => p.startsWith("__Host-debateai-csrf=")) ?? "").split("=")[1] ?? "";
    const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (op === "signin") {
      const a = await (await fetch("/api/v1/auth/login", json({ email, password: "s04-password" }))).json();
      const r = await fetch("/api/v1/auth/login", json({ challenge_token: a.challenge_token, code: "123456" }));
      const body = await r.json();
      return { status: r.status, sessionId: body?.session?.session_id ?? null };
    }
    if (op === "logout") {
      const r = await fetch("/api/v1/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf() } });
      return { status: r.status };
    }
    throw new Error(`op ${op}`);
  }, { op, email });
}
/** Tab A: send `text` from the help panel and wait for the fake's reply to render. */
async function sendA(c, text, { waitReply = true } = {}) {
  c.step = "tab A send";
  await c.a.locator("#support-message").fill(text);
  await c.a.locator("#support-message").press("Enter");
  if (!waitReply) return;
  try {
    await c.a.getByText(`reply to: ${text}`, { exact: true }).first().waitFor({ state: "visible", timeout: 10000 });
  } catch {
    const diag = await c.a.evaluate(() => ({
      api: window.__s04.fetches.map((f) => `${f.p}:${f.status}`).join(" "),
      conv: (document.querySelector(".supportConversation")?.textContent ?? "").slice(-160)
    })).catch(() => ({}));
    throw new Error(`no reply rendered for the sent text; tab A api=[${diag.api}] conversation="${diag.conv}"`);
  }
  if (text.includes(c.marker)) {
    const st = await check(c);
    if (!st.dom || st.storage !== "holds") throw new Error(`MARKER not shown and stored verbatim after sending (${absentReason(st)}) — the absent oracle would be vacuous`);
  }
}
const check = (c) => c.a.evaluate(() => window.__s04Check());
const s04 = (c) => c.a.evaluate(() => ({ adds: window.__s04.adds, events: window.__s04.events, fetches: window.__s04.fetches, docStart: window.__s04.docStart, now: performance.now() }));
const absentReason = (st) => `dom=${st.dom ? "marker-shown" : "clean"} storage=${st.storage}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The member action in tab B through its UI; resolves when the session request has completed. */
async function member(c, kind, ctx) {
  c.step = `tab B member ${kind}`;
  const b = c.b;
  // "tab B's request completing" = the response event (the answer reached tab B), stamped when it fires. Not
  // requestfinished: sign-out navigates at once and Chromium then reports the answered 204 as ERR_ABORTED (measured).
  // The response event is the earlier stamp, so the 2000 ms bound is measured from no later than the completion.
  const finished = (pred) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { b.off("response", on); reject(new Error(`member request for ${kind} was never answered`)); }, 15000);
    function on(resp) {
      const req = resp.request();
      let hit = false;
      try { hit = pred(req, new URL(req.url()).pathname); } catch { hit = false; }
      if (!hit) return;
      clearTimeout(timer); b.off("response", on);
      resolve({ status: resp.status(), doneAt: Date.now() });
    }
    b.on("response", on);
  });
  let p;
  if (kind === "SIGNIN") {
    await b.goto(`${ORIGIN}/login`, { waitUntil: "load" });
    await b.locator("#login-email").fill(ctx.email);
    await b.locator("#login-password").fill("s04-password");
    await b.locator("button.authPrimary").click();
    await b.locator("#login-code").waitFor({ state: "visible", timeout: 10000 });
    await b.locator("#login-code").fill("123456");
    p = finished((r, pth) => pth === "/api/v1/auth/login" && r.method() === "POST" && (r.postData() ?? "").includes("challenge_token"));
    await b.locator("button.authPrimary").click({ noWaitAfter: true });
  } else if (kind === "AGE-REFUSED") {
    // tab B is on `/` with the age form (the account answers `required`)
    const young = String(new Date().getUTCFullYear() - 10);
    await b.locator('input[name="dob-m"]').fill("01");
    await b.locator('input[name="dob-d"]').fill("15");
    await b.locator('input[name="dob-y"]').fill(young);
    p = finished((r, pth) => pth === "/api/v1/auth/age-confirmation" && r.method() === "POST");
    await b.locator('form.authForm button[type="submit"]').click({ noWaitAfter: true });
  } else {
    // tab B is on /settings
    const sel = kind === "LOGOUT" ? b.getByRole("button", { name: "Sign out", exact: true })
      : kind === "REVOKE-ALL" ? b.getByRole("button", { name: "Revoke all sessions", exact: true })
        : b.locator(`button[aria-label="Revoke session ${ctx.sessionId}"]`);
    const pred = kind === "LOGOUT" ? (r, pth) => pth === "/api/v1/auth/logout" && r.method() === "POST"
      : kind === "REVOKE-ALL" ? (r, pth) => pth === "/api/v1/auth/sessions" && r.method() === "DELETE"
        : (r, pth) => pth === `/api/v1/auth/sessions/${ctx.sessionId}` && r.method() === "DELETE";
    p = finished(pred);
    await sel.click({ noWaitAfter: true });
  }
  return p;
}

/** Build tab A's conversation for an R01/R03 member, and put tab B where the member starts. */
async function setupMember(c, kind) {
  const email = kind === "AGE-REFUSED" ? `age.${c.tag}@s04.test` : `x.${c.tag}@s04.test`;
  const ctx = { email };
  if (kind !== "SIGNIN") {
    const s = await bFetch(c, "signin", email);
    if (s.status !== 200) throw new Error(`setup sign-in ${s.status}`);
    ctx.sessionId = s.sessionId;
  }
  await gotoA(c, `${ORIGIN}/help`);
  await ackConsent(c.a);
  await sendA(c, c.marker);
  c.step = "tab B to the member's page";
  if (kind === "AGE-REFUSED") { await c.b.goto(`${ORIGIN}/`, { waitUntil: "load" }); await c.b.locator('input[name="dob-y"]').waitFor({ state: "visible", timeout: 10000 }); }
  else if (kind !== "SIGNIN") { await c.b.goto(`${ORIGIN}/settings`, { waitUntil: "load" }); await c.b.locator("#active-sessions-heading").waitFor({ state: "visible", timeout: 10000 }); }
  return ctx;
}

/** S04_INJECT=erase-at-<ms>: tab A's copy (key + marker text) erased <ms> after tab B's member request — a
 *  harness-side erase that leaves the panel's React state (its support session, a pending reply) untouched. */
async function injectEraseAt(c, doneAt) {
  const eraseAt = /^erase-at-(\d+)$/.exec(INJECT);
  if (!eraseAt) return;
  await c.a.evaluate(({ ms, m }) => setTimeout(() => {
    try { sessionStorage.removeItem("debateai.support.conversation.v2"); } catch { /* injected fault only */ }
    const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.includes(m)) n.data = "";
  }, ms), { ms: Math.max(0, Number(eraseAt[1]) - (Date.now() - doneAt)), m: c.marker });
}

/** The member really changed the session: the session cookie is set after a sign-in and gone after an end. */
async function sessionChanged(c, kind) {
  const has = (await c.context.cookies(ORIGIN)).some((k) => k.name === "__Host-debateai-session" && k.value !== "");
  if (kind === "SIGNIN" ? !has : has) return `the member did not change the session (session cookie ${has ? "still set" : "absent"} after ${kind})`;
  if (kind === "AGE-REFUSED" && !(await c.context.cookies(ORIGIN)).some((k) => k.name === "__Host-debateai-age-refusal")) return "the age check was not refused (no refusal cookie)";
  return null;
}

/** Poll `absent` in tab A from `doneAt` for at most bound + 500 ms. */
async function waitAbsent(c, doneAt, bound) {
  let st;
  while (true) {
    st = await check(c);
    const ms = Date.now() - doneAt;
    if (!st.dom && st.storage !== "holds") return { ok: ms <= bound, ms, st };
    if (ms > bound + 500) return { ok: false, ms, st };
    await sleep(25);
  }
}

// ---------- the cases ----------
const MEMBERS = ["SIGNIN", "LOGOUT", "REVOKE-THIS", "REVOKE-ALL", "AGE-REFUSED"];
const cases = [];
for (const m of MEMBERS) for (const state of ["visible", "hidden-flag"]) cases.push({ id: `R01-${m}-${state}`, run: (c) => runR01(c, m, state) });
cases.push({ id: "R03-SIGNOUT", run: (c) => runR03(c, "LOGOUT") });
cases.push({ id: "R03-SIGNIN", run: (c) => runR03(c, "SIGNIN") });
cases.push({ id: "RACE-SIGNOUT", run: runRace });
cases.push({ id: "R04-LIVE", run: runR04 });
for (const fam of ["a", "b", "c", "keep"]) for (const how of ["reload", "back"]) for (const clk of ["0", "p600", "m600"]) {
  cases.push({ id: `R02-${fam}-${how}-${clk}`, clockOffset: { 0: 0, p600: 600_000, m600: -600_000 }[clk], run: (c) => runR02(c, fam, how) });
}
for (const fam of ["a", "b", "c", "keep"]) cases.push({ id: `R02-${fam}-sleep-0`, run: (c) => runSleep(c, fam) });
const recorded = [
  { id: "R02-d-reload-0", clockOffset: 0, run: runR02d },
  { id: "BFCACHE-PROBE", run: runBfcacheProbe }
];

async function runR01(c, kind, state) {
  const ctx = await setupMember(c, kind);
  if (state === "hidden-flag") await c.a.evaluate(() => window.__s04Hide());
  const { status, doneAt } = await member(c, kind, ctx);
  if (status >= 400) return { fail: `member request answered ${status}` };
  await injectEraseAt(c, doneAt);
  const r = await waitAbsent(c, doneAt, R01_BOUND_MS);
  const changed = await sessionChanged(c, kind);
  if (changed) return { fail: changed };
  if (!r.ok) return { fail: `absent not met within ${R01_BOUND_MS} ms (${absentReason(r.st)}, waited ${r.ms} ms)` };
  await sleep(700);
  const later = await check(c);
  const { adds } = await s04(c);
  if (later.dom || later.storage === "holds") return { fail: `old conversation back after the erase (${absentReason(later)})` };
  if (adds.some((t) => t > r.st.t)) return { fail: "moment: a marker text node was added after the erase" };
  return { ms: r.ms };
}

async function runR03(c, kind) {
  const before = new Set((await fakeState()).supportSessions.map((s) => s.id));
  const ctx = await setupMember(c, kind);
  const mine = (await fakeState()).supportSessions.map((s) => s.id).filter((id) => !before.has(id));
  const { status, doneAt } = await member(c, kind, ctx);
  if (status >= 400) return { fail: `member request answered ${status}` };
  await injectEraseAt(c, doneAt);
  const r = await waitAbsent(c, doneAt, R01_BOUND_MS);
  const changed = await sessionChanged(c, kind);
  if (changed) return { fail: changed };
  if (!r.ok) return { fail: `absent not met within ${R01_BOUND_MS} ms (${absentReason(r.st)}) — the panel was not reset` };
  const next = `S04 next message ${nonce()}`;
  try { await sendA(c, next); } catch { /* judged below */ }
  const st = await fakeState();
  const req = st.messageRequests.filter((m) => m.text === next);
  if (req.length === 0) return { fail: "no support message request carried the new text" };
  if (req.some((m) => mine.includes(m.sessionId))) return { fail: `the new message used a support session from before the change (${req.map((m) => m.status).join(",")})` };
  const fresh = st.supportSessions.find((s) => s.id === req[0].sessionId && !before.has(s.id) && !mine.includes(s.id));
  if (!fresh) return { fail: "the new message's support session was not created after the change" };
  if (req[0].status !== 200) return { fail: `the new message was answered ${req[0].status}` };
  const rendered = await c.a.getByText(`reply to: ${next}`, { exact: true }).count();
  if (rendered === 0) return { fail: "the reply to the new message did not render" };
  const again = await check(c);
  if (again.dom || again.storage === "holds") return { fail: `old conversation back (${absentReason(again)})` };
  return { ms: r.ms };
}

async function runRace(c) {
  const ctx = await setupMember(c, "LOGOUT"); // signed in, tab A holds the marker conversation, tab B on /settings
  await fakeHold(3000);
  const held = `${c.marker} held`; // the held reply ("reply to: …") carries the marker
  const replyP = c.a.waitForResponse((r) => /\/api\/v1\/support\/sessions\/[^/]+\/messages$/.test(new URL(r.url()).pathname), { timeout: 15000 });
  await sendA(c, held, { waitReply: false });
  await sleep(500);
  const { status, doneAt } = await member(c, "LOGOUT", ctx);
  if (status >= 400) return { fail: `sign-out answered ${status}` };
  await injectEraseAt(c, doneAt);
  const changed = await sessionChanged(c, "LOGOUT");
  if (changed) return { fail: changed };
  const reply = await replyP;
  await reply.finished();
  await sleep(2000);
  const st = await check(c);
  if (st.dom || st.storage === "holds") return { fail: `2000 ms after the held reply: ${absentReason(st)}` };
  return { ms: 2000 };
}

async function runR04(c) {
  const email = `x.${c.tag}@s04.test`;
  const s = await bFetch(c, "signin", email);
  if (s.status !== 200) return { fail: `setup sign-in ${s.status}` };
  await gotoA(c, `${ORIGIN}/help`);
  await ackConsent(c.a);
  await sendA(c, c.marker);
  await c.b.goto(`${ORIGIN}/cookies`, { waitUntil: "load" });
  await c.b.reload({ waitUntil: "load" });
  await sleep(500);
  await c.b.close();
  const t0 = Date.now();
  await sleep(3000);
  const st = await check(c);
  if (!st.dom || st.storage !== "holds") return { fail: `keep: 3000 ms after tab B closed ${absentReason(st)} (expected marker-shown/holds)` };
  return { ms: Date.now() - t0 };
}

/** R02 setups: a = signed in → out · b = anonymous → in · c = X → out, Y in · keep = signed in, first reply ≥ 1500 ms after sign-in. */
async function r02Setup(c, fam) {
  const X = `x.${c.tag}@s04.test`;
  if (fam !== "b") {
    const s = await bFetch(c, "signin", X);
    if (s.status !== 200) throw new Error(`setup sign-in ${s.status}`);
    if (fam === "keep") await sleep(1600);
  }
  await gotoA(c, `${ORIGIN}/help`);
  await ackConsent(c.a);
  await sendA(c, c.marker);
}
async function r02Change(c, fam) {
  const Y = `y.${c.tag}@s04.test`;
  const X = `x.${c.tag}@s04.test`;
  const res = [];
  if (fam === "a") res.push(await bFetch(c, "logout"));
  if (fam === "b") res.push(await bFetch(c, "signin", X));
  if (fam === "c") { res.push(await bFetch(c, "logout")); res.push(await bFetch(c, "signin", Y)); }
  const bad = res.find((r) => r.status >= 400);
  if (bad) throw new Error(`session change answered ${bad.status}`);
}
async function judgeWoken(c, fam, wakeT) {
  // wakeT: the in-page wake moment (0 = navigation start of a new document)
  if (fam === "keep") {
    const end = Date.now() + 4000;
    let st;
    do { st = await check(c); if (st.dom && st.storage === "holds") break; await sleep(50); } while (Date.now() < end);
    if (!st.dom || st.storage !== "holds") return { fail: `keep: after the wake ${absentReason(st)} (expected marker-shown/holds)` };
    return { ok: true };
  }
  await sleep(SETTLE_MS);
  const st = await check(c);
  const { adds, events } = await s04(c);
  const reasons = [];
  if (st.dom || st.storage === "holds") reasons.push(`absent: ${absentReason(st)}`);
  const late = adds.filter((t) => t >= wakeT);
  if (late.length) reasons.push(`moment: marker text added at ${late.map((t) => Math.round(t - wakeT)).join(",")} ms after the wake`);
  const shownAtWake = events.filter((e) => (e.type === "resume" || e.type === "pageshow") && e.t >= wakeT && e.present);
  if (shownAtWake.length) reasons.push(`moment: marker shown at ${shownAtWake.map((e) => e.type).join("+")}`);
  return reasons.length ? { fail: reasons.join("; ") } : { ok: true };
}

async function runR02(c, fam, how) {
  await r02Setup(c, fam);
  await c.a.goto(PARK, { waitUntil: "load" });
  await r02Change(c, fam);
  if (INJECT === "erase-on-wake") await c.a.addInitScript(() => { if (location.host.startsWith("localhost")) try { sessionStorage.removeItem("debateai.support.conversation.v2"); } catch { /* injected */ } });
  let restore = "reload";
  c.step = `tab A wakes by ${how}`;
  if (how === "reload") await c.a.goto(`${ORIGIN}/help`, { waitUntil: "commit" });
  else await c.a.goBack({ waitUntil: "commit" });
  await c.a.waitForURL((u) => u.href.startsWith(`${ORIGIN}/help`), { waitUntil: "load", timeout: 30000 });
  // a new document: every marker text node it ever held was shown after the wake (navigation start = docStart)
  let { docStart: wakeT } = await s04(c);
  if (how === "back") {
    const { events } = await s04(c);
    const ps = events.filter((e) => e.type === "pageshow").at(-1);
    if (ps?.persisted) { restore = "bfcache"; wakeT = ps.t; }
  }
  if (INJECT === "flash") await c.a.evaluate((m) => { const n = document.createElement("p"); n.textContent = m; document.body.append(n); setTimeout(() => n.remove(), 100); }, c.marker);
  const t0 = Date.now();
  const v = await judgeWoken(c, fam, wakeT);
  const extra = how === "back" ? ` restore=${restore}` : "";
  if (restore === "bfcache") out(`NOTE restore=bfcache ${c.id} (pageshow persisted — Chrome restored a no-store page; same oracles applied)`);
  return v.fail ? { fail: `${v.fail}${extra}` } : { ms: Date.now() - t0, extra };
}

/** PT2-N5: before a no-change sleep — a case opened (its code lives in memory only) and an unsent draft. */
async function keepExtrasBefore(c) {
  c.step = "tab A open a case and leave a draft";
  const caseToken = ("K" + randomBytes(4).toString("hex") + "a".repeat(43)).slice(0, 43);
  await c.a.route("**/api/v1/support/sessions/*/escalate", (route) => route.fulfill({
    status: 200, contentType: "application/json", headers: { date: new Date().toUTCString() },
    body: JSON.stringify({ case_token: caseToken, text: "Case opened words" })
  }));
  await c.a.locator(".supportEscalation button").click();
  await c.a.locator('a[href*="#case="]').first().waitFor({ state: "visible", timeout: 10000 });
  // A1: words, never c.tag. The tag's 6 random hex chars are all digits ~6% of the time ((10/16)^6), and the panel shows a
  // 6-digit run as "[REDACTED_SECRET_LIKE]" (packages/kernel/src/index.ts:446 \b\d{6}\b), which made the exact-text waits flaky.
  const draft = `unsent draft ${nonce()}`;
  await c.a.locator("#support-message").fill(draft);
  const st = await fakeState();
  const sessionId = st.messageRequests.filter((r) => r.status === 200).at(-1)?.sessionId ?? null;
  return { draft, sessionId };
}
/** PT2-N5: after the keep — the case link, the draft and the support session are the ones from before the sleep. */
async function keepExtrasAfter(c, before) {
  const reasons = [];
  const caseLink = await c.a.locator('a[href*="#case="]').count();
  if (caseLink === 0) reasons.push("keep: the case link opened before the sleep is gone");
  const draft = await c.a.locator("#support-message").inputValue();
  if (draft !== before.draft) reasons.push(`keep: the draft is "${draft}", expected "${before.draft}"`);
  const next = `after the keep ${nonce()}`; // A1: words, as in every other sent text (see markerFor)
  await sendA(c, next);
  const st = await fakeState();
  const used = st.messageRequests.filter((r) => (r.text ?? "") === next).at(-1)?.sessionId ?? null;
  if (before.sessionId === null || used !== before.sessionId) reasons.push(`keep: the next message used support session ${used}, expected ${before.sessionId}`);
  return reasons;
}

async function runSleep(c, fam) {
  await r02Setup(c, fam);
  const keepBefore = fam === "keep" ? await keepExtrasBefore(c) : null;
  if (INJECT === "gate-at-sleep" || INJECT === "second-at-sleep") {
    await c.a.evaluate((p) => addEventListener("pagehide", () => { void fetch(p, { cache: "no-store" }); }), INJECT === "gate-at-sleep" ? "/api/v1/session" : "/api/v1/auth/sessions");
  }
  await c.a.evaluate(SLEEP);
  await r02Change(c, fam); // keep: tab B does nothing (N3-p2)
  await sleep(300);
  await c.a.evaluate(WAKE);
  const { events } = await s04(c);
  const hide = events.find((e) => e.type === "pagehide" && e.persisted);
  const wakes = events.filter((e) => (e.type === "resume" || e.type === "pageshow") && hide && e.t >= hide.t);
  if (!hide || wakes.length < 2) return { fail: `the synthetic sleep/wake events were not seen (${JSON.stringify(events.map((e) => e.type))})` };
  const firstWake = Math.min(...wakes.map((e) => e.t));
  const t0 = Date.now();
  const v = await judgeWoken(c, fam, firstWake);
  const { fetches } = await s04(c);
  const inWindow = fetches.filter((f) => f.start >= hide.t && f.start < firstWake);
  const gates = inWindow.filter((f) => f.p === "/api/v1/session");
  const seconds = inWindow.filter((f) => f.p === "/api/v1/auth/sessions");
  const info = ` asleep:identity=${gates.length} auth-sessions=${seconds.length}`;
  const reasons = [];
  if (gates.length) reasons.push(`asleep: ${gates.length} identity request(s) started between the sleep and the first wake`);
  if (v.fail) reasons.push(v.fail);
  else if (keepBefore !== null) reasons.push(...await keepExtrasAfter(c, keepBefore));
  return reasons.length ? { fail: `${reasons.join("; ")};${info}` } : { ms: Date.now() - t0, extra: info };
}

async function runR02d(c) {
  // written signed out; while parked someone signs in and out; nobody signed in at the reload (V-14: not required either way)
  await gotoA(c, `${ORIGIN}/help`);
  await ackConsent(c.a);
  await sendA(c, c.marker);
  await c.a.goto(PARK, { waitUntil: "load" });
  await bFetch(c, "signin", `x.${c.tag}@s04.test`);
  await bFetch(c, "logout");
  await c.a.goto(`${ORIGIN}/help`, { waitUntil: "load" });
  await sleep(SETTLE_MS);
  const st = await check(c);
  out(`RECORDED R02-d outcome=${st.dom || st.storage === "holds" ? "kept" : "erased"} (${absentReason(st)})`);
}

async function runBfcacheProbe(c) {
  await gotoA(c, `${ORIGIN}/help`);
  await ackConsent(c.a);
  await c.a.goto(PARK, { waitUntil: "load" });
  await c.a.goBack({ waitUntil: "commit" });
  await c.a.waitForLoadState("load");
  await sleep(300);
  const r = await c.a.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const ps = window.__s04.events.filter((e) => e.type === "pageshow").at(-1);
    return { persisted: ps?.persisted === true, reasons: nav?.notRestoredReasons ?? null };
  });
  out(`RECORDED BFCACHE-PROBE bfcache-eligible=${r.persisted} notRestoredReasons=${JSON.stringify(r.reasons)}`);
}

// ---------- run ----------
let failures = 0, counted = 0;
const selected = cases.filter((k) => !only || only.test(k.id));
for (const k of selected) {
  counted++;
  const c = await openCase(k.id, { clockOffset: k.clockOffset });
  let result;
  c.step = "start";
  let timer;
  const limit = new Promise((resolve) => { timer = setTimeout(() => resolve({ fail: `timeout: case exceeded ${CASE_LIMIT_MS} ms at step "${c.step}"` }), CASE_LIMIT_MS); });
  try { result = await Promise.race([k.run(c), limit]); } catch (e) { result = { fail: `error at step "${c.step}": ${String(e?.message ?? e).split("\n")[0].slice(0, 240)}` }; }
  if (result.fail && /timeout|Timeout/.test(result.fail)) result.fail += ` [pending: ${[...c.context.__pending.values()].slice(0, 6).join(" | ") || "none"}]`;
  clearTimeout(timer);
  if (result.fail) { failures++; out(`FAIL ${k.id} ${result.fail}`); }
  else out(`PASS ${k.id} ${result.ms}${result.extra ?? ""}`);
  await c.context.close().catch(() => {});
}
for (const k of recorded.filter((r) => !only || only.test(r.id))) {
  const c = await openCase(k.id, { clockOffset: k.clockOffset });
  try { await k.run(c); } catch (e) { out(`RECORDED ${k.id} error: ${String(e?.message ?? e).split("\n")[0].slice(0, 240)}`); }
  await c.context.close().catch(() => {});
}
await browser.close();
const st = await fakeState().catch(() => ({ unhandled: [] }));
const unhandled = [...new Set(st.unhandled)];
out(`fake API unhandled routes: ${unhandled.length ? unhandled.join(", ") : "none"}`);
if (!dateHeaderChecked && counted > 0) { out("BROKEN DATE-HEADER no /api/v1/support/sessions response was seen"); dateBroken = true; }
out(`cases=${counted} failures=${failures}`);
teardown();
if (dateBroken) out("BROKEN");
else if (INJECT) out("INJECTED");
else if (only) out("PARTIAL");
else out(counted === 42 && failures === 0 ? "CLUSTER_GREEN" : "CLUSTER_RED");
process.exit(0);
