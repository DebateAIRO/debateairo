import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { constants } from "node:fs";
import { chmod, lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { deploymentHostname, siteverifyOutcome, validProof, validSocketPath } from "./siteverify-response.mjs";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const REJECTED = Object.freeze({ success: false, "error-codes": ["invalid-input-response"] });
/** Test injection is at the HTTPS boundary only; no URL, proxy, redirect or TLS override exists. */
export function fixedSiteverify(secret, token, signal, requestImplementation = httpsRequest) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; signal.removeEventListener("abort", aborted); error ? reject(new Error("TURNSTILE_TRANSPORT_UNAVAILABLE")) : resolve(value); };
    const req = requestImplementation(SITEVERIFY, { method: "POST", agent: false, maxHeaderSize: 4096,
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" } }, response => {
      if (response.statusCode !== 200) { response.destroy(); finish(true); return; }
      const chunks = []; let bytes = 0;
      response.on("data", chunk => { bytes += chunk.length; if (bytes > 8192) { response.destroy(); req.destroy(); finish(true); } else chunks.push(chunk); });
      response.on("error", () => finish(true)); response.on("aborted", () => finish(true));
      response.on("end", () => { try { finish(false, JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { finish(true); } });
    });
    const aborted = () => { req.destroy(); finish(true); };
    req.on("error", () => finish(true));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    req.end(new URLSearchParams({ secret, response: token }).toString());
  });
}
export function createSiteverifyRelay({ secret, publicAppUrl, siteverify = fixedSiteverify }) {
  const hostname = deploymentHostname(publicAppUrl); const used = new Map(); let active = 0;
  const server = createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, async (request, response) => {
    const send = (status, body) => { if (!response.destroyed && !response.writableEnded) { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(body)); } };
    if (request.method !== "POST" || request.url !== "/siteverify") { request.resume(); send(404, { error: "TURNSTILE_OPERATION_INVALID" }); return; }
    if (request.headers["content-type"] !== "application/json") { request.resume(); send(400, { error: "TURNSTILE_INPUT_INVALID" }); return; }
    if (active >= 64) { request.resume(); send(503, { error: "TURNSTILE_UNAVAILABLE" }); return; }
    active++;
    const controller = new AbortController();
    // This deadline includes upload, parsing, DNS, TLS and provider response body.
    const deadline = setTimeout(() => { controller.abort(); send(503, { error: "TURNSTILE_UNAVAILABLE" }); request.destroy(); }, 5000);
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 8192) { send(413, { error: "TURNSTILE_INPUT_INVALID" }); return; } chunks.push(chunk); }
      let input; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { send(400, { error: "TURNSTILE_INPUT_INVALID" }); return; }
      if (!validProof(input) || Array.isArray(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input,"token") || !Object.hasOwn(input,"action")) { send(400, { error: "TURNSTILE_INPUT_INVALID" }); return; }
      const now = Date.now(); for (const [digest, until] of used) if (until <= now) used.delete(digest);
      const digest = createHash("sha256").update(input.token).digest("hex");
      if (used.has(digest)) { send(200, REJECTED); return; }
      if (used.size >= 10_000) { send(503, { error: "TURNSTILE_UNAVAILABLE" }); return; }
      used.set(digest, now + 300_000);
      const result = await siteverify(secret, input.token, controller.signal);
      const outcome = siteverifyOutcome(result, input.action, hostname);
      if (outcome === "unavailable") send(503, { error: "TURNSTILE_UNAVAILABLE" });
      else if (outcome === "rejected") send(200, REJECTED);
      else send(200, { success: true, hostname: result.hostname, action: result.action, challenge_ts: result.challenge_ts, "error-codes": [] });
    } catch { send(503, { error: "TURNSTILE_UNAVAILABLE" }); }
    finally { clearTimeout(deadline); active--; }
  });
  return server;
}
const ENVIRONMENT_KEYS = new Set(["NODE_ENV", "PUBLIC_APP_URL", "TURNSTILE_SOCKET_PATH", "CREDENTIALS_DIRECTORY",
  "RUNTIME_DIRECTORY", "PATH", "LANG", "LC_ALL", "TZ", "USER", "LOGNAME", "HOME", "SHELL", "INVOCATION_ID", "JOURNAL_STREAM", "SYSTEMD_EXEC_PID", "MEMORY_PRESSURE_WATCH", "MEMORY_PRESSURE_WRITE"]);
export function relayConfiguration(source) {
  if (Object.keys(source).some(key => !ENVIRONMENT_KEYS.has(key)) || source.NODE_ENV !== "production"
    || !validSocketPath(source.TURNSTILE_SOCKET_PATH) || typeof source.CREDENTIALS_DIRECTORY !== "string"
    || !source.CREDENTIALS_DIRECTORY.startsWith("/") || source.CREDENTIALS_DIRECTORY.includes("\0")
    || source.CREDENTIALS_DIRECTORY.split("/").some(part => part === "." || part === "..")) throw new TypeError("TURNSTILE_RELAY_ENVIRONMENT_INVALID");
  deploymentHostname(source.PUBLIC_APP_URL);
  return Object.freeze({ publicAppUrl: source.PUBLIC_APP_URL, socketPath: source.TURNSTILE_SOCKET_PATH, secretPath: join(source.CREDENTIALS_DIRECTORY, "turnstile-secret") });
}
const custodyFailure = () => { throw new TypeError("TURNSTILE_SECRET_CUSTODY_INVALID"); };
function exactCredentialAcl(acl, uid, permissions) {
  if (!acl || Object.keys(acl).sort().join(",") !== "entries,version" || acl.version !== 2 || !Array.isArray(acl.entries) || acl.entries.length !== 5) return false;
  const expected = [[1,permissions,4294967295],[2,permissions,uid],[4,0,4294967295],[16,permissions,4294967295],[32,0,4294967295]];
  return acl.entries.every((entry, i) => entry && Object.keys(entry).sort().join(",") === "id,permissions,tag"
    && entry.tag === expected[i][0] && entry.permissions === expected[i][1] && entry.id === expected[i][2]);
}
/** Existing private owned files and the exact systemd root-owned named-user ACL. */
export function relaySecretCustody(parent, metadata, uid, acl = null) {
  if (!Number.isSafeInteger(uid) || uid < 0 || !parent.isDirectory() || parent.isSymbolicLink() || !metadata.isFile()
    || metadata.nlink !== 1 || metadata.size < 1 || metadata.size > 2048) custodyFailure();
  if (parent.uid === uid && metadata.uid === uid && (parent.mode & 0o077) === 0 && (metadata.mode & 0o077) === 0) return "owned";
  if (uid > 0 && parent.uid === 0 && parent.gid === 0 && (parent.mode & 0o7777) === 0o550
    && metadata.uid === 0 && metadata.gid === 0 && (metadata.mode & 0o7777) === 0o440
    && acl && Object.keys(acl).sort().join(",") === "file,parent" && exactCredentialAcl(acl.parent, uid, 5) && exactCredentialAcl(acl.file, uid, 4)) return "systemd";
  custodyFailure();
}
const ACL_METADATA_PROGRAM = `import os,struct,json
result={}
for name,fd in (("parent",3),("file",4)):
 raw=os.getxattr(fd,"system.posix_acl_access")
 if len(raw)!=44:raise ValueError()
 result[name]={"version":struct.unpack("<I",raw[:4])[0],"entries":[dict(zip(("tag","permissions","id"),struct.unpack("<HHI",raw[i:i+8]))) for i in range(4,44,8)]}
print(json.dumps(result,separators=(",",":")))
`;
function credentialAclMetadata(parentFd, fileFd) {
  let result;
  try {
    if (process.platform !== "linux") custodyFailure();
    result = spawnSync("/usr/bin/python3", ["-I", "-S", "-c", ACL_METADATA_PROGRAM], {
      env: {}, timeout: 1000, maxBuffer: 2048, stdio: ["ignore", "pipe", "pipe", parentFd, fileFd]
    });
    if (result.error || result.signal || result.status !== 0 || result.stderr?.length || !result.stdout?.length || result.stdout.length > 2048) custodyFailure();
    return JSON.parse(result.stdout.toString("utf8"));
  } catch { custodyFailure(); }
  finally { result?.stdout?.fill(0); result?.stderr?.fill(0); }
}
function sameCredentialMetadata(a, b) {
  return ["dev","ino","uid","gid","mode","nlink","size","mtimeMs","ctimeMs"].every(key => a[key] === b[key]);
}
export async function loadRelaySecret(path, nodeEnv = "production") {
  const parentPath = join(path, "..");
  const parent = await lstat(parentPath);
  if (!parent.isDirectory() || parent.isSymbolicLink()) custodyFailure();
  const parentHandle = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let handle, bytes;
  try {
    if (!sameCredentialMetadata(parent, await parentHandle.stat())) custodyFailure();
    const named = await lstat(path);
    if (!named.isFile() || named.isSymbolicLink()) custodyFailure();
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = await handle.stat();
    if (!sameCredentialMetadata(named, metadata)) custodyFailure();
    const uid = process.getuid?.();
    const systemd = parent.uid === 0 && metadata.uid === 0 && uid !== 0;
    const acl = systemd ? credentialAclMetadata(parentHandle.fd, handle.fd) : null;
    relaySecretCustody(parent, metadata, uid, acl);
    if (!sameCredentialMetadata(metadata, await handle.stat()) || !sameCredentialMetadata(metadata, await lstat(path))
      || !sameCredentialMetadata(parent, await parentHandle.stat()) || !sameCredentialMetadata(parent, await lstat(parentPath))) custodyFailure();
    bytes = Buffer.alloc(2049); let length = 0;
    for (;;) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
      if (length >= bytes.length) custodyFailure();
    }
    if (length !== metadata.size || !sameCredentialMetadata(metadata, await handle.stat()) || !sameCredentialMetadata(metadata, await lstat(path))
      || !sameCredentialMetadata(parent, await parentHandle.stat()) || !sameCredentialMetadata(parent, await lstat(parentPath))) custodyFailure();
    if (systemd) {
      relaySecretCustody(parent, metadata, uid, credentialAclMetadata(parentHandle.fd, handle.fd));
      if (!sameCredentialMetadata(metadata, await handle.stat()) || !sameCredentialMetadata(metadata, await lstat(path))
        || !sameCredentialMetadata(parent, await parentHandle.stat()) || !sameCredentialMetadata(parent, await lstat(parentPath))) custodyFailure();
    }
    const secret = bytes.subarray(0, length).toString("utf8").trim();
    if (!/^[A-Za-z0-9_-]{20,2048}$/u.test(secret) || (nodeEnv === "production" && /^[123]x0{30,}/u.test(secret))) throw new TypeError("TURNSTILE_SECRET_INVALID");
    return secret;
  } finally { bytes?.fill(0); await handle?.close(); await parentHandle.close(); }
}
async function main() {
  const config = relayConfiguration(process.env);
  // The worker keeps no inherited environment material once its public configuration is read.
  for (const key of Object.keys(process.env)) delete process.env[key];
  const secret = await loadRelaySecret(config.secretPath);
  const server = createSiteverifyRelay({ secret, publicAppUrl: config.publicAppUrl });
  // Never unlink an existing endpoint: a stale socket needs operator recovery, not a second worker.
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(config.socketPath, resolve); });
  await chmod(config.socketPath, 0o660);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { server.close(); server.closeAllConnections(); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { const code = error instanceof TypeError && /^TURNSTILE_[A-Z_]+$/u.test(error.message) ? error.message : "TURNSTILE_RELAY_STARTUP_FAILED"; console.error(code); process.exitCode = 1; });
}
