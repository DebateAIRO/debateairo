import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * THE WEBSITE EDGE OF A RELEASE (side-by-side uploads spec 2026-10-21 §1, §6, §7; plan C12).
 *
 * server.mjs is plain JavaScript and cannot import the kernel's TypeScript, so the one key form is copied here from the
 * INTERFACE ("RELEASE_KEY"); tests/unit/ui-release-edge.test.ts pins that it agrees with the kernel's parseReleaseKey.
 *
 * - The website knows its release key (RELEASE_KEY), required outside `--dev`, and refuses to serve a build made for
 *   another release: `next build && node release-edge.mjs --stamp` writes the build's release code into the dist dir,
 *   and the boot compares it with the key (O1: a person is never served another release's pages).
 * - GET /readyz is answered ahead of Next from its own API's /readyz (spec §6): ready only when that API is ready under
 *   the SAME key, so Caddy never sends traffic to a website whose API is another release.
 * - SIGTERM drains: /readyz says DRAINING, the server stops accepting, and the process exits 0 once closed or at a
 *   20 s deadline (spec §6: a planned stop is never a failure).
 *
 * Refusals are content-free: they name a code, never the value they were given.
 */

/** INTERFACE "RELEASE_KEY", copied verbatim (the kernel's RELEASE_KEY_PATTERN). */
export const RELEASE_KEY_PATTERN = /^r[1-9][0-9]*-[0-9a-f]{12}$/u;

/** The build stamp, inside NEXT_DIST_DIR || ".next": `{"releaseCode":"<12 lowercase hex>"}`. */
export const BUILD_STAMP_FILE = "debateai-release-code.json";

/** The code part of a development key, a build that knows no source revision (INTERFACE "RELEASE_KEY"). */
const DEVELOPMENT_CODE = "000000000000";
const RELEASE_CODE_PATTERN = /^[0-9a-f]{12}$/u;
/** A full or abbreviated git revision as an operator or `git rev-parse` gives it; only its first 12 are kept. */
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{12,64}$/iu;
const READINESS_PATH = "/readyz";
/** The same-origin proxy (app/api/[...path]/route.ts), whose answers carry their API's own release header. */
const API_PATH = "/api";
/** A reason from the API is passed on only in the shape of a code, at most this many (content-free, bounded). */
const REASON_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;
const MAX_REASONS = 16;

function refuse(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

/**
 * RELEASE_KEY of this website. Absent or empty refuses RELEASE_KEY_REQUIRED, except under `--dev`, which may run
 * without one (null: no header, no build check); a malformed value (upper case, `legacy`, a leading zero) refuses
 * RELEASE_KEY_INVALID in every mode.
 */
export function parseWebsiteReleaseKey(raw, { development }) {
  if (raw === undefined || raw === "") {
    if (development === true) return null;
    throw refuse("RELEASE_KEY_REQUIRED");
  }
  if (typeof raw !== "string" || !RELEASE_KEY_PATTERN.test(raw)) throw refuse("RELEASE_KEY_INVALID");
  return raw;
}

function codeOfKey(releaseKey) {
  return releaseKey.slice(releaseKey.indexOf("-") + 1);
}

/**
 * The release code a build carries (the stamp, and NEXT_PUBLIC_DEBATEAI_RELEASE_CODE for the browser's comparison,
 * spec §7), first found of: RELEASE_KEY's code part; the first 12 of DEBATEAI_SOURCE_REVISION; the first 12 of the git
 * head; the development code when not production. A malformed RELEASE_KEY refuses RELEASE_KEY_INVALID and a malformed
 * DEBATEAI_SOURCE_REVISION refuses RELEASE_CODE_UNRESOLVED: a value that was set is never silently passed over. A
 * production build that finds none refuses RELEASE_CODE_UNRESOLVED. `production` defaults to NODE_ENV=production,
 * which `next build` sets. `gitHead` may be a function, called only when neither variable is set (C12 review: a build
 * told its release never runs git).
 */
export function resolveBuildReleaseCode(env, gitHead, { production = env.NODE_ENV === "production" } = {}) {
  const key = env.RELEASE_KEY;
  if (key !== undefined && key !== "") {
    if (!RELEASE_KEY_PATTERN.test(key)) throw refuse("RELEASE_KEY_INVALID");
    return codeOfKey(key);
  }
  const revision = env.DEBATEAI_SOURCE_REVISION;
  if (revision !== undefined && revision !== "") {
    if (!SOURCE_REVISION_PATTERN.test(revision)) throw refuse("RELEASE_CODE_UNRESOLVED");
    return revision.slice(0, 12).toLowerCase();
  }
  const head = typeof gitHead === "function" ? gitHead() : gitHead;
  if (typeof head === "string" && SOURCE_REVISION_PATTERN.test(head)) return head.slice(0, 12).toLowerCase();
  if (production) throw refuse("RELEASE_CODE_UNRESOLVED");
  return DEVELOPMENT_CODE;
}

/** The git head of the checkout holding `cwd`, or null (no git, not a checkout): the build then needs a revision set. */
export function readGitHead(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim();
  } catch {
    return null;
  }
}

/**
 * Refuses RELEASE_KEY_BUILD_MISMATCH unless the build in `distDir` was stamped with this key's code part. A missing or
 * malformed stamp refuses the same: a build of unknown release is never served (O1).
 */
export function assertBuildMatchesRelease(distDir, releaseKey) {
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(join(distDir, BUILD_STAMP_FILE), "utf8"));
  } catch {
    throw refuse("RELEASE_KEY_BUILD_MISMATCH");
  }
  if (typeof releaseKey !== "string" || !RELEASE_KEY_PATTERN.test(releaseKey)
    || stamp === null || typeof stamp !== "object" || stamp.releaseCode !== codeOfKey(releaseKey)) {
    throw refuse("RELEASE_KEY_BUILD_MISMATCH");
  }
}

/**
 * Outside `--dev`, a missing or unusable DIALECTICAL_API_BASE (not an http(s) URL) is named once at boot in one
 * content-free line (C12 review), so a website whose /readyz stays BOOTING says why. It warns rather than refuses, like
 * the retired-setting line: the refusals above guard the edge itself (port, proxy trust, secret, release, build), while
 * without an API base nothing unsafe is served — every proxied call already refuses DIALECTICAL_API_BASE_REQUIRED or
 * _INVALID and /readyz stays not ready. Returns whether it warned.
 */
export function noteUnusableApiBase(apiBase, { development, warn = console.warn }) {
  if (development === true || readinessUrl(apiBase) !== null) return false;
  warn(JSON.stringify({ event: "ui.api_base.unusable", key: "DIALECTICAL_API_BASE" }));
  return true;
}

/**
 * The x-debateai-release value the edge presets on an answer (spec §7): the website's own key on its pages, assets and
 * /readyz; none on a proxied /api answer, which carries only its API's own header through the proxy's allowlist, so an
 * API that sends none shows as missing to the browser instead of borrowing the website's (C12 review). Null under --dev
 * without a key.
 */
export function releaseHeaderFor(releaseKey, url) {
  if (releaseKey === null) return null;
  const path = typeof url === "string" ? url.split("?", 1)[0] : "";
  return path === API_PATH || path.startsWith(`${API_PATH}/`) ? null : releaseKey;
}

/** The API's /readyz beside its other routes: the proxy's base (DIALECTICAL_API_BASE) plus `/readyz`; null if unusable. */
function readinessUrl(apiBase) {
  try {
    const url = new URL(apiBase);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}${READINESS_PATH}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** The API's readiness answer, or null when it is not one (unreachable, late, not JSON, another shape). */
async function readApiReadiness(fetchImpl, url, timeoutMs) {
  if (url === null) return null;
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    const body = JSON.parse(await response.text());
    if (body === null || typeof body !== "object" || typeof body.ready !== "boolean" || !Array.isArray(body.reasons)) {
      return null;
    }
    return { status: response.status, body };
  } catch {
    return null;
  }
}

function writeJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * GET /readyz ahead of Next (spec §6). The answer is the API's own body (200) when that API is ready under the same
 * key; otherwise 503 `{ready:false, releaseKey, reasons}` with the API's reasons, BOOTING when the API is unreachable,
 * late (`timeoutMs`), not JSON or not a readiness answer, RELEASE_KEY_MISMATCH when it is another release (its reasons
 * are about that release, so they are not passed on), and DRAINING added once `draining()` is true (after SIGTERM).
 * Under `--dev` without a key (`releaseKey` null) the key comparison is skipped. Returns whether it handled the request.
 */
export function createReadinessResponder({ apiBase, releaseKey, fetch: fetchImpl, timeoutMs = 1000, draining }) {
  const url = readinessUrl(apiBase);
  return (req, res) => {
    if (req.method !== "GET" || typeof req.url !== "string") return false;
    const query = req.url.indexOf("?");
    if ((query === -1 ? req.url : req.url.slice(0, query)) !== READINESS_PATH) return false;
    void (async () => {
      const api = await readApiReadiness(fetchImpl, url, timeoutMs);
      let reasons;
      if (api === null) {
        reasons = ["BOOTING"];
      } else if (releaseKey !== null && api.body.releaseKey !== releaseKey) {
        reasons = ["RELEASE_KEY_MISMATCH"];
      } else if (api.status === 200 && api.body.ready === true) {
        reasons = [];
      } else {
        reasons = api.body.reasons.filter((reason) => typeof reason === "string" && REASON_PATTERN.test(reason))
          .slice(0, MAX_REASONS);
        if (reasons.length === 0) reasons = ["BOOTING"];
      }
      if (draining() && !reasons.includes("DRAINING")) reasons.push("DRAINING");
      if (reasons.length === 0) writeJson(res, 200, api.body);
      else writeJson(res, 503, { ready: false, releaseKey, reasons });
    })().catch(() => {
      try { writeJson(res, 503, { ready: false, releaseKey, reasons: ["BOOTING"] }); } catch { /* the socket is gone */ }
    });
    return true;
  };
}

/**
 * SIGTERM, once (spec §6; Caddy stops routing on DRAINING): `onDrain()`, then `server.close()` (no new connections)
 * and `closeIdleConnections()`; exit 0 when the close completes or, at `deadlineMs`, after `closeAllConnections()` (an
 * open event stream must not hold a planned stop). A planned stop exits 0, never a failure. Later SIGTERMs do nothing.
 */
export function installGracefulClose({ server, process: proc, deadlineMs = 20_000, onDrain }) {
  let closing = false;
  let exited = false;
  const exit = () => {
    if (exited) return;
    exited = true;
    proc.exit(0);
  };
  proc.on("SIGTERM", () => {
    if (closing) return;
    closing = true;
    onDrain?.();
    server.close(() => exit());
    server.closeIdleConnections();
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      exit();
    }, deadlineMs);
    deadline.unref?.();
  });
}

/**
 * `node release-edge.mjs --stamp` (the build script, right after `next build`): writes the build stamp into
 * NEXT_DIST_DIR || ".next" under the current directory. It runs only after a production build, so an unresolved code
 * refuses RELEASE_CODE_UNRESOLVED exactly as next.config.mjs did.
 */
function stampBuild() {
  const cwd = process.cwd();
  const releaseCode = resolveBuildReleaseCode(process.env, readGitHead(cwd), { production: true });
  if (!RELEASE_CODE_PATTERN.test(releaseCode)) throw refuse("RELEASE_CODE_UNRESOLVED");
  const distDir = resolve(cwd, process.env.NEXT_DIST_DIR || ".next");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, BUILD_STAMP_FILE), `${JSON.stringify({ releaseCode })}\n`);
  console.log(JSON.stringify({ event: "ui.build.stamped", releaseCode }));
}

/** True when this file is the program node was asked to run (Node names the main module by its real path). */
function runAsProgram() {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (runAsProgram()) {
  if (process.argv.includes("--stamp")) stampBuild();
  else throw refuse("RELEASE_EDGE_USAGE");
}
