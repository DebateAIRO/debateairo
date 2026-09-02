import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

const helperUrl = new URL("./serverApi.ts", import.meta.url).href;
const load = () => import(`${helperUrl}?cacheBust=${Date.now()}`);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const GOOD = "a".repeat(43);

after(() => {
  delete process.env.DIALECTICAL_API_BASE;
});

test("L3-F5: sessionCookieValue accepts exactly the 43-character grammar the proxy enforces", async () => {
  const { sessionCookieValue } = await load();
  assert.equal(sessionCookieValue(GOOD), GOOD);
  assert.equal(sessionCookieValue("Az09_-".padEnd(43, "x")), "Az09_-".padEnd(43, "x"));
  for (const bad of [
    undefined, null, "", 42,
    "a".repeat(42), "a".repeat(44),
    `${"a".repeat(41)}\r\n`,
    `x; __Host-debateai-csrf=${"c".repeat(19)}`,
    `${"a".repeat(42)};`,
    `${"a".repeat(42)}=`,
    `${"a".repeat(42)} `,
    ` ${"a".repeat(42)}`,
    `${"a".repeat(42)}+`
  ]) {
    assert.equal(sessionCookieValue(bad), null, `${JSON.stringify(bad)} is not a session`);
  }
});

test("L3-F5: readSessionCookie treats a decoded, smuggling or absent cookie as signed out", async () => {
  const { readSessionCookie, USER_TOKEN_COOKIE } = await load();
  const store = (value) => ({ get: (name) => (name === USER_TOKEN_COOKIE && value !== undefined ? { name, value } : undefined) });
  assert.equal(readSessionCookie(store(GOOD)), GOOD);
  assert.equal(readSessionCookie(store(undefined)), null);
  // Next decodes %3B/%20 before handing the value over: a second pair would ride along.
  assert.equal(readSessionCookie(store(`x; __Host-debateai-csrf=${"c".repeat(20)}`)), null);
  assert.equal(readSessionCookie(store("a".repeat(42))), null);
  assert.equal(readSessionCookie(store(`${"a".repeat(42)}\r`)), null);
});

test("L3-F5: createServerContractClient never forwards a malformed session cookie upstream", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  const { createServerContractClient } = await load();
  const seen = [];
  const fetchStub = async (_url, init) => {
    seen.push(new Headers(init?.headers).get("cookie"));
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  };
  for (const cookie of [GOOD, `x; __Host-debateai-csrf=${"c".repeat(20)}`, "a".repeat(42), undefined]) {
    try {
      await createServerContractClient(fetchStub, cookie, "S5 SSR").readSession();
    } catch {
      // the stub answers 401; only the request headers matter here
    }
  }
  assert.deepEqual(seen, [`__Host-debateai-session=${GOOD}`, null, null, null]);
});

test("L3-F5: every SSR page reads the session through readSessionCookie, never the raw cookie value", () => {
  for (const page of ["../app/page.tsx", "../app/debate/[id]/page.tsx", "../app/login/page.tsx"]) {
    const source = read(page);
    assert.match(source, /readSessionCookie\(await cookies\(\)\)/, `${page} uses the guarded reader`);
    assert.doesNotMatch(source, /\.get\(USER_TOKEN_COOKIE\)\?\.value/, `${page} no longer reads the raw value`);
  }
});
