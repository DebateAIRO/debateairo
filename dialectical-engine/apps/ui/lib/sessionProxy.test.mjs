import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const outDir = join(process.cwd(), ".tmp-s5-api-route-test");

async function loadRoute() {
  rmSync(outDir, { recursive: true, force: true });
  const tsc = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  execFileSync(tsc, [
    join("app", "api", "[...path]", "route.ts"),
    "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--rootDir", ".", "--outDir", outDir, "--skipLibCheck", "--types", "node",
    "--typeRoots", join(process.cwd(), "node_modules", "@types"), "--strict"
  ], { cwd: process.cwd(), stdio: "pipe" });
  mkdirSync(outDir, { recursive: true });
  copyFileSync("trusted-client-ip.mjs", join(outDir, "trusted-client-ip.mjs"));
  return import(`${pathToFileURL(join(outDir, "app", "api", "[...path]", "route.js")).href}?${Date.now()}`);
}

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.fetch;
  delete process.env.DIALECTICAL_API_BASE;
});

test("S5 proxy filters request cookies and response cookies/headers", async () => {
  process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
  let forwarded;
  globalThis.fetch = async (_url, init) => {
    forwarded = new Headers(init.headers);
    const headers = new Headers({
      "content-type": "application/json",
      "access-control-allow-origin": "https://evil.test",
      "x-internal": "secret"
    });
    headers.append("set-cookie", `__Host-debateai-session=${"s".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`);
    headers.append("set-cookie", `__Host-debateai-csrf=${"c".repeat(43)}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`);
    headers.append("set-cookie", "tracking=1; Path=/; Secure; SameSite=Lax");
    headers.append("set-cookie", `__Host-debateai-session=${"x".repeat(43)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax; Priority=High`);
    return new Response("{}", { headers });
  };
  const { POST } = await loadRoute();
  const response = await POST(new Request("https://app.test/api/v1/asks", {
    method: "POST",
    headers: {
      cookie: `private=drop; __Host-debateai-session=${"s".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`,
      origin: "https://app.test",
      "user-agent": "S5 Browser",
      "x-csrf-token": "c".repeat(43),
      authorization: "Bearer drop",
      "x-user-dev-token": "drop",
      "x-forwarded-host": "evil.test"
    },
    body: "{}"
  }), { params: Promise.resolve({ path: ["v1", "asks"] }) });
  assert.equal(forwarded.get("cookie"), `__Host-debateai-session=${"s".repeat(43)}; __Host-debateai-csrf=${"c".repeat(43)}`);
  assert.equal(forwarded.get("origin"), "https://app.test");
  assert.equal(forwarded.get("x-csrf-token"), "c".repeat(43));
  assert.equal(forwarded.get("user-agent"), "S5 Browser");
  for (const name of ["authorization", "x-user-dev-token", "x-forwarded-host"]) assert.equal(forwarded.get(name), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("x-internal"), null);
  assert.deepEqual(response.headers.getSetCookie().map((value) => value.split("=", 1)[0]), [
    "__Host-debateai-session", "__Host-debateai-csrf"
  ]);
});
