import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import { rm, stat } from "node:fs/promises";
import { basename } from "node:path";
import { afterAll, expect, it } from "vitest";
import { FAKE_VENDOR_AUTHORIZATION, isPortListening } from "./pes-s02-fake-vendor.js";
import {
  PES_S02_REFUSAL_CASES,
  runHostedAcceptance,
  violatesStdoutLaw,
  type HostedAcceptanceDeps,
  type HostedAcceptanceResult
} from "./pes-s02-hosted.js";

function callbackLookup(answer: readonly LookupAddress[] | NodeJS.ErrnoException): LookupFunction {
  return (hostname, options: LookupOptions, callback) => {
    if (answer instanceof Error) { callback(answer, ""); return; }
    if (hostname !== "api.localtest.me") {
      callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), "");
      return;
    }
    if (options.all === true) callback(null, [...answer]);
    else callback(null, answer[0]!.address, answer[0]!.family);
  };
}
const lookupStub = callbackLookup([{ address: "127.0.0.1", family: 4 }]);
const token = FAKE_VENDOR_AUTHORIZATION.slice("Bearer ".length);
const roots: string[] = [];

async function run(deps: Partial<HostedAcceptanceDeps> = {}): Promise<HostedAcceptanceResult> {
  const result = await runHostedAcceptance({ lookup: lookupStub, ...deps });
  if (result.scratchRoot !== null) roots.push(result.scratchRoot);
  return result;
}
let passingRun: Promise<HostedAcceptanceResult> | undefined;
const pass = () => passingRun ??= run();
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

it("passes end to end and prints the exact lines of SPEC-v4 §5 steps 5, 6 and 8", async () => {
  const result = await pass();
  expect(result.outcome).toBe("PASS");
  expect(result.lines).toEqual([
    `PES-S02 SCRATCH-DIR ${result.scratchRoot}`,
    "PES-S02 DNS api.localtest.me 127.0.0.1",
    `PES-S02 PORT-FREE ${result.port} lsof -nP -iTCP:${result.port} -sTCP:LISTEN rc=1 lines=0`,
    `PES-S02 FAKE-VENDOR https://api.localtest.me:${result.port}/v1`,
    "PES-S02 TRUST seam-handshake=authorized default-fetch=DEPTH_ZERO_SELF_SIGNED_CERT",
    "PES-S02 REFUSED PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a",
    "PES-S02 REFUSED PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a",
    "PES-S02 REFUSED PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT",
    "PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a",
    "PES-S02 REFUSED PROVIDER_TARGET_PRICE_REQUIRED:vendor:a",
    "PES-S02 ADMITTED vendor:a",
    "PES-S02 VENDOR-REQUESTS 1 matched 0 rejected",
    "PES-S02-ACCEPT: PASS"
  ]);
  expect(result.refusals).toEqual([
    { id: "refused-loopback", message: "PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a", stage: "deployment" },
    { id: "refused-inline", message: "PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a", stage: "deployment" },
    { id: "refused-conflict", message: "PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT", stage: "parse" },
    { id: "refused-absent", message: "PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a", stage: "credentials" },
    { id: "refused-price", message: "PROVIDER_TARGET_PRICE_REQUIRED:vendor:a", stage: "priced" }
  ]);
});

it("never prints the token, a scheme-prefixed credential or a path at or beneath the custody directory", async () => {
  const result = await pass();
  for (const line of result.lines) {
    expect(line.includes(token)).toBe(false);
    expect(/Bearer \S/u.test(line)).toBe(false);
    expect(line.includes(`${result.scratchRoot}/custody.d`)).toBe(false);
  }
  expect(result.lines[0]).toBe(`PES-S02 SCRATCH-DIR ${result.scratchRoot}`);
  expect(basename(result.scratchRoot!)).toMatch(/^pes-s02-/u);
  expect(basename(result.scratchRoot!)).not.toContain("custody");
});

it("removes the scratch root and releases the port before it returns", async () => {
  const result = await pass();
  await expect(stat(result.scratchRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  expect(isPortListening(result.port!)).toBe(false);
});

it("names the first case that did not hold when the vendor rejects the provisioned credential", async () => {
  const result = await run({ credentialLiteral: "Bearer pes-s02-not-the-vendor-literal" });
  expect(result.outcome).toBe("FAIL");
  expect(result.lines.at(-1)).toBe("PES-S02-ACCEPT: FAIL admitted");
  expect(result.lines.some((line) => line.startsWith("PES-S02 ADMITTED "))).toBe(false);
  expect(result.lines.filter((line) => line.startsWith("PES-S02 REFUSED "))).toHaveLength(5);
  await expect(stat(result.scratchRoot!)).rejects.toMatchObject({ code: "ENOENT" });
});

it("names the refusal case whose message differs from the table", async () => {
  const result = await run({ refusalCases: PES_S02_REFUSAL_CASES.map((row) => row.id === "refused-conflict"
    ? { ...row, expected: "PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT:vendor:a" } : row) });
  expect(result.outcome).toBe("FAIL");
  expect(result.lines.at(-1)).toBe("PES-S02-ACCEPT: FAIL refused-conflict");
  expect(result.lines.filter((line) => line.startsWith("PES-S02 REFUSED "))).toHaveLength(2);
  await expect(stat(result.scratchRoot!)).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports UNVERIFIED with the resolver's own error and never falls back", async () => {
  for (const [lookup, verdict] of [
    [callbackLookup(Object.assign(new Error("getaddrinfo ENOTFOUND api.localtest.me"), { code: "ENOTFOUND" })),
      "PES-S02-ACCEPT: UNVERIFIED dns ENOTFOUND"],
    [callbackLookup([{ address: "192.0.2.10", family: 4 }]),
      "PES-S02-ACCEPT: UNVERIFIED dns non-loopback"]
  ] as const) {
    const result = await run({ lookup });
    expect(result.outcome).toBe("UNVERIFIED");
    expect(result.lines).toEqual([`PES-S02 SCRATCH-DIR ${result.scratchRoot}`, verdict]);
    await expect(stat(result.scratchRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

it("reports UNVERIFIED when the run-time certificate cannot be built", async () => {
  const result = await run({ opensslExecutable: "/nonexistent/openssl" });
  expect(result.outcome).toBe("UNVERIFIED");
  expect(result.lines.at(-1)).toBe("PES-S02-ACCEPT: UNVERIFIED tls-material openssl-unavailable");
  expect(result.lines).toHaveLength(2);
  await expect(stat(result.scratchRoot!)).rejects.toMatchObject({ code: "ENOENT" });
});

it("flags every line the stdout law forbids and passes the lawful refusal codes", () => {
  const forbidden = { tokens: [token], paths: ["/x/pes-s02-y/custody.d"] };
  for (const line of [
    `a ${token} b`, "x Bearer abc", "/x/pes-s02-y/custody.d", "/x/pes-s02-y/custody.d/vendor.header"
  ]) expect(violatesStdoutLaw(line, forbidden)).toBe(true);
  for (const line of [
    "PES-S02 SCRATCH-DIR /x/pes-s02-y",
    "PES-S02 REFUSED PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT",
    "PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a",
    "PES-S02 REFUSED PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a",
    "PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_UNUSABLE:vendor:a"
  ]) expect(violatesStdoutLaw(line, forbidden)).toBe(false);
});
