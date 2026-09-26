// ARCH-PES-S02 base feasibility spike — THROWAWAY, not product code, never copied into the lane.
// Executes, at base 776359c3, the three things REQ-REV-p3 lists as never executed
// (reviews/REQ-REV-p3.md:117): the fake vendor bound, the resolver awaited, the admission produced.
// It also measures, per refusal fixture of SPEC-v3 R2.7, WHICH shipped function throws (the guard) and
// that every earlier guard passes. It obeys R2.9 itself: it never prints the token, a Bearer value or
// any path at or beneath <scratch>/custody.d.
import { spawnSync } from "node:child_process";
import { promises as dns } from "node:dns";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { Agent as HttpsAgent, createServer, request as httpsRequest } from "node:https";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine";
const pd = await import(`${LANE}/apps/api/src/provider-discovery.ts`);
const cryptoPkg = await import(`${LANE}/packages/crypto/src/index.ts`);
const reg = await import(`${LANE}/packages/register/src/runtime-environment.ts`);

const LITERAL = ["Bearer", "pes-s02-fake-vendor-token"].join(" "); // R2.5e literal, composed so this file's text never holds it whole
const TOKEN = LITERAL.slice("Bearer ".length);
const started = Date.now();
const lines: string[] = [];
let custodyDir = "<unset>";
function say(line: string): void {
  if (line.includes(TOKEN) || /Bearer \S/u.test(line) || line.includes(custodyDir)) {
    lines.push("SPIKE STDOUT-GUARD tripped (line suppressed)");
    console.log("SPIKE STDOUT-GUARD tripped (line suppressed)");
    return;
  }
  lines.push(line);
  console.log(line);
}
const codeOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return /^[A-Z][A-Z0-9_]*:?[A-Za-z0-9:._-]*$/u.test(message) ? message : `<non-code message, ${message.length} chars>`;
};

// 1. DNS for R2.6
try {
  const addresses = await dns.lookup("api.localtest.me", { all: true });
  say(`SPIKE DNS api.localtest.me -> ${addresses.map((a) => `${a.address}/v${a.family}`).join(",")}`);
} catch (error) {
  say(`SPIKE DNS api.localtest.me FAILED ${(error as NodeJS.ErrnoException).code ?? "?"}`);
}
say(`SPIKE hosted checker: api.localtest.me refused=${(await import(`${LANE}/packages/providers/src/index.ts`)).isRefusedHostedProviderHost("api.localtest.me")} 127.0.0.1 refused=${(await import(`${LANE}/packages/providers/src/index.ts`)).isRefusedHostedProviderHost("127.0.0.1")}`);

// 2. port measured free with lsof, above 4400, excluding every NO-TOUCH port and the never-bound 4455
const EXCLUDED = new Set([3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455]);
let port = 0;
for (let candidate = 4460; candidate <= 4499; candidate += 1) {
  if (EXCLUDED.has(candidate)) continue;
  const probe = spawnSync("lsof", ["-nP", `-iTCP:${candidate}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (probe.status === 1 && probe.stdout === "") {
    port = candidate;
    say(`SPIKE PORT ${candidate} free before bind: lsof -nP -iTCP:${candidate} -sTCP:LISTEN rc=1 lines=0`);
    break;
  }
}
if (port === 0) throw new Error("SPIKE no free port in 4460..4499");

// 3. scratch root, TLS material with both openssl binaries
const rndBefore = await stat(join(homedir(), ".rnd")).then(() => "present", () => "absent");
const scratch = await mkdtemp(join(tmpdir(), "pes-s02-arch-spike-"));
say(`SPIKE scratch base name begins pes-s02-: ${scratch.split("/").pop()!.startsWith("pes-s02-")} · contains custody: ${scratch.includes("custody")} · json-safe chars: ${/^[A-Za-z0-9/._-]+$/u.test(scratch)}`);
const tls = join(scratch, "tls");
await mkdir(tls, { mode: 0o700 });
await writeFile(join(tls, "openssl.cnf"), [
  "[req]", "distinguished_name = dn", "x509_extensions = ext", "prompt = no",
  "[dn]", "CN = api.localtest.me",
  "[ext]", "subjectAltName = DNS:api.localtest.me", "basicConstraints = critical,CA:TRUE", ""
].join("\n"));
const certs: Record<string, { key: string; cert: string; ms: number } | string> = {};
for (const [label, executable] of [["libressl", "/usr/bin/openssl"], ["path-openssl", "openssl"]] as const) {
  const t0 = Date.now();
  const result = spawnSync(executable, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", join(tls, `${label}.key.pem`), "-out", join(tls, `${label}.cert.pem`),
    "-config", join(tls, "openssl.cnf")
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    certs[label] = `FAILED rc=${result.status} ${String(result.stderr).split("\n")[0]}`;
  } else {
    certs[label] = {
      key: await readFile(join(tls, `${label}.key.pem`), "utf8"),
      cert: await readFile(join(tls, `${label}.cert.pem`), "utf8"),
      ms: Date.now() - t0
    };
  }
  say(`SPIKE CERT ${label} (${executable}): ${typeof certs[label] === "string" ? certs[label] : `ok in ${(certs[label] as { ms: number }).ms} ms`}`);
}
const rndAfter = await stat(join(homedir(), ".rnd")).then(() => "present", () => "absent");
say(`SPIKE ~/.rnd before=${rndBefore} after=${rndAfter}`);

// 4. custody layout of R2.8
custodyDir = join(scratch, "custody.d");
await mkdir(custodyDir, { mode: 0o700 });
await chmod(custodyDir, 0o700);
const credentialPath = join(custodyDir, "vendor.header");
await writeFile(credentialPath, `${LITERAL}\n`, { mode: 0o600 });
await chmod(credentialPath, 0o600);
const credentialStat = await lstat(credentialPath);
say(`SPIKE custody: dir mode ${((await lstat(custodyDir)).mode & 0o777).toString(8)} · file mode ${(credentialStat.mode & 0o777).toString(8)} · nlink ${credentialStat.nlink} · symlink ${credentialStat.isSymbolicLink()}`);
try {
  const header = cryptoPkg.readCustodyAuthorizationHeader(credentialPath);
  say(`SPIKE readCustodyAuthorizationHeader accepted the layout: equals literal ${header === LITERAL}`);
} catch (error) {
  say(`SPIKE readCustodyAuthorizationHeader REFUSED the layout: ${codeOf(error)}`);
}

// 5. the chain, stage by stage, over the five R2.7 fixtures (byte-exact from SPEC-v3 :141-145) — twice: nodeEnv production and undefined
const configured = [{ providerRef: "vendor:a", maker: "Acme" }];
const mode = reg.resolveDeploymentMode("hosted", "production");
const FIXTURES: readonly (readonly [string, string, string])[] = [
  ["refused-loopback", `{"provider_ref":"vendor:a","base_url":"https://127.0.0.1:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`, "PROVIDER_TARGET_LOOPBACK_REFUSED:"],
  ["refused-inline", `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_header":"Bearer inline-not-provisioned","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`, "PROVIDER_INLINE_CREDENTIAL_REFUSED:"],
  ["refused-conflict", `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header","authorization_header":"Bearer inline-not-provisioned","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`, "PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT"],
  ["refused-absent", `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/absent.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`, "PROVIDER_AUTHORIZATION_FILE_ABSENT:"],
  ["refused-price", `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header"}`, "PROVIDER_TARGET_PRICE_REQUIRED:"]
];
type Stage = "parse" | "deployment" | "priced" | "credentials";
function runChain(text: string, nodeEnv: string | undefined): { stage: Stage | "none"; code: string; resolved?: readonly unknown[] } {
  let stage: Stage = "parse";
  try {
    const declared = pd.parseProviderDiscoveryTargets(`[${text}]`, configured);
    stage = "deployment";
    pd.assertDeploymentProviderTargets(declared, { mode, nodeEnv });
    stage = "priced";
    pd.assertPricedProviderTargets(declared, mode);
    stage = "credentials";
    const resolved = pd.resolveProviderTargetCredentials(declared, cryptoPkg.readCustodyAuthorizationHeader);
    return { stage: "none", code: "ADMITTED", resolved };
  } catch (error) {
    return { stage, code: codeOf(error) };
  }
}
for (const nodeEnv of ["production", undefined]) {
  for (const [name, fixture, expectedPrefix] of FIXTURES) {
    const outcome = runChain(fixture.replaceAll("/SCRATCH", scratch), nodeEnv);
    const matches = expectedPrefix.endsWith(":") ? outcome.code === `${expectedPrefix}vendor:a` : outcome.code === expectedPrefix;
    say(`SPIKE CHAIN nodeEnv=${nodeEnv ?? "undefined"} ${name}: threw at stage=${outcome.stage} code=${outcome.code} matches-SPEC=${matches}`);
  }
}
// the http: sweep member of SPEC-v3 :148-150
const httpLoopback = FIXTURES[0]![1].replace("https://127.0.0.1", "http://127.0.0.1").replaceAll("/SCRATCH", scratch);
const httpOutcome = runChain(httpLoopback, "production");
say(`SPIKE CHAIN http-loopback sweep: stage=${httpOutcome.stage} code=${httpOutcome.code}`);

// 6. fake vendor on 127.0.0.1:<port> with the libressl certificate (the one the plan pins)
const material = certs.libressl as { key: string; cert: string };
let matched = 0;
let rejected = 0;
const server = createServer({ key: material.key, cert: material.cert }, (request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization === LITERAL) {
      matched += 1;
      response.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ model: "fake-model", choices: [{ message: { content: "OK" } }] }));
    } else {
      rejected += 1;
      response.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
    }
  });
});
await new Promise<void>((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(port, "127.0.0.1", () => resolveListen());
});
say(`SPIKE FAKE-VENDOR bound https://api.localtest.me:${port}/v1 (listening 127.0.0.1 only)`);

// 7. the trusting fetch — node:https with ca = the run-time certificate, a dedicated agent, no env
const agent = new HttpsAgent({ ca: [material.cert], keepAlive: false });
const trustingFetch = ((input: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolveFetch, rejectFetch) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => { headers[key] = value; });
  const outgoing = httpsRequest(url, {
    method: init?.method ?? "GET", headers, agent, signal: init?.signal ?? undefined
  }, (incoming) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("error", rejectFetch);
    incoming.on("end", () => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string") responseHeaders.set(key, value);
        else if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, item);
      }
      resolveFetch(new Response(Buffer.concat(chunks), {
        status: incoming.statusCode ?? 500, statusText: incoming.statusMessage ?? "", headers: responseHeaders
      }));
    });
  });
  outgoing.on("error", rejectFetch);
  if (typeof init?.body === "string") outgoing.write(init.body);
  outgoing.end();
})) as typeof fetch;
say(`SPIKE env NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "<unset>"} NODE_EXTRA_CA_CERTS=${process.env.NODE_EXTRA_CA_CERTS === undefined ? "<unset>" : "<set>"}`);

// 7b. negative control: the DEFAULT fetch must refuse the fixture's certificate (trust flows through the seam only)
try {
  await fetch(`https://api.localtest.me:${port}/v1/chat/completions`, { method: "POST", body: "{}" });
  say("SPIKE NEGATIVE-CONTROL default fetch SUCCEEDED (trust leaked)");
} catch (error) {
  const cause = (error as { cause?: { code?: string } }).cause;
  say(`SPIKE NEGATIVE-CONTROL default fetch refused: ${cause?.code ?? codeOf(error)}`);
}
say(`SPIKE counts after negative control: matched=${matched} rejected=${rejected}`);

// 7c. the fixture's 401s (R2.5d), through the trusting fetch, BEFORE the admission — counted separately
const noAuth = await trustingFetch(`https://api.localtest.me:${port}/v1/chat/completions`, { method: "POST", body: "{}" });
const wrongAuth = await trustingFetch(`https://api.localtest.me:${port}/v1/chat/completions`, { method: "POST", headers: { authorization: ["Bearer", "wrong-token"].join(" ") }, body: "{}" });
const wrongBody = await wrongAuth.text();
say(`SPIKE 401s: absent=${noAuth.status} wrong=${wrongAuth.status} wrong-body-names-no-credential=${!wrongBody.includes(TOKEN) && !wrongBody.includes("wrong-token")}`);
const matchedBefore = matched;
const rejectedBefore = rejected;

// 8. admission through the chain and the IN-PROCESS resolver (R2.8)
const admission = `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:${port}/v1","model":"fake-model","authorization_file":"${credentialPath}","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`;
const admitted = runChain(admission, "production");
say(`SPIKE ADMISSION chain: ${admitted.code} (stage ${admitted.stage})`);
const resolvedTargets = admitted.resolved as readonly { authorizationHeader?: string; authorizationFile?: string; providerRef: string }[];
say(`SPIKE resolved target: providerRef=${resolvedTargets[0]!.providerRef} header-equals-literal=${resolvedTargets[0]!.authorizationHeader === LITERAL} still-has-authorizationFile=${resolvedTargets[0]!.authorizationFile !== undefined}`);
const recorded: unknown[] = [];
const store = {
  async readLatest(refs: readonly string[]) { return recorded.filter((r) => refs.includes((r as { providerRef: string }).providerRef)) as never; },
  async record(observation: unknown) { recorded.push(observation); }
};
const resolver = pd.createProviderDiscoveryResolver({
  configuredProviders: configured,
  targets: resolvedTargets,
  probes: store,
  probeFreshnessMs: 600000,
  probeTimeoutMs: 5000,
  fetchImplementation: trustingFetch
});
const t0 = Date.now();
const panel = await resolver() as readonly { provider_ref: string; maker: string; model_id: string }[];
say(`SPIKE RESOLVER awaited in ${Date.now() - t0} ms: panel=${JSON.stringify(panel.map((m) => [m.provider_ref, m.maker, m.model_id]))} store-records=${recorded.length} state=${(recorded[0] as { state?: string } | undefined)?.state}`);
say(`SPIKE VENDOR-REQUESTS during admission: ${matched - matchedBefore} matched ${rejected - rejectedBefore} rejected`);

// 8b. what a resolver given the PARSED (unresolved) targets does — SPEC-v3 DECISIONS :47
const parsedOnly = pd.parseProviderDiscoveryTargets(`[${admission}]`, configured);
const recorded2: unknown[] = [];
const resolver2 = pd.createProviderDiscoveryResolver({
  configuredProviders: configured, targets: parsedOnly,
  probes: { async readLatest() { return [] as never; }, async record(o: unknown) { recorded2.push(o); } },
  probeFreshnessMs: 600000, probeTimeoutMs: 5000, fetchImplementation: trustingFetch
});
const panel2 = await resolver2() as readonly unknown[];
say(`SPIKE PARSED-ONLY resolver: panel size=${panel2.length} rejected-total=${rejected}`);

// 9. teardown and the scratch-gone check
agent.destroy();
server.closeAllConnections();
await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
await rm(scratch, { recursive: true, force: true });
say(`SPIKE scratch removed: ${await stat(scratch).then(() => false, () => true)} · port ${port} listening after close: ${spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout !== ""}`);
say(`SPIKE total ${Date.now() - started} ms · stdout lines ${lines.length}`);
