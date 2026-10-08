// tests/unit/billing-check-cli.test.ts
// N21 (spec 2026-10-05 §2.17.3): `pnpm billing:check` — one tick or cross per item, a plain sentence, never a secret;
// it works with billing off. Real custody files in a temporary 0700 directory; NETOPIA and the notify address are
// scripted fetches; the register is a stub.
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SELLER_COMPANY, type SellerCompany } from "@debateai/billing-core";
import { createNetopiaPayments, NETOPIA_FACTS } from "@debateai/payments-netopia";
import { BILLING_CHECK_ENVIRONMENT_KEYS, readBillingCheckEnvironment } from "@debateai/register";
import {
  renderCheckLines, runBillingCheck, runBillingCheckCli, type BillingCheckDeps, type RegisterFacts
} from "../../apps/api/src/billing/check-cli.js";
import { NETOPIA_NOTIFY_PATH } from "../../apps/api/src/billing/index.js";

const POS = ["CH3C", "K000", "1111", "2222", "3333"].join("-");
const API_KEY = ["check", "netopia", "key", "5c2e"].join("-");
const QUADERNO_KEY = ["check", "quaderno", "key", "81b0"].join("-");
const SMARTBILL_TOKEN = ["check", "smartbill", "token", "d17a"].join("-");
const COMPANY: SellerCompany = Object.freeze({
  ...SELLER_COMPANY, cui: "12345678", registeredOffice: "Str. Exemplu 1, București, România",
  vat: Object.freeze({ kind: "registered", number: "RO12345678" } as const),
  emails: Object.freeze({ ...SELLER_COMPANY.emails, general: "hello@dezbatere.ro" })
});
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const FINGERPRINT = createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
const SECRETS = [API_KEY, QUADERNO_KEY, SMARTBILL_TOKEN];

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function stage(): Promise<Record<string, string>> {
  const directory = await mkdtemp(join(tmpdir(), "billing-check-"));
  directories.push(directory);
  const file = async (name: string, text: string, mode: number) => {
    await writeFile(join(directory, name), text);
    await chmod(join(directory, name), mode);
    return join(directory, name);
  };
  return {
    NETOPIA_API_BASE_URL: "https://secure-sandbox.netopia-payments.com",
    NETOPIA_POS_SIGNATURE: POS,
    NETOPIA_API_KEY_PATH: await file("netopia-api-key", `${API_KEY}\n`, 0o600),
    NETOPIA_IPN_KEYS_PATH: await file("netopia-ipn-keys.pem", PEM, 0o644),
    QUADERNO_API_BASE_URL: "https://debateai.sandbox-quadernoapp.com/api",
    QUADERNO_API_KEY_PATH: await file("quaderno-api-key", `${QUADERNO_KEY}\n`, 0o600),
    SMARTBILL_API_BASE_URL: "https://smartbill.invalid/SBORO/api",
    SMARTBILL_SERIES: "DBAI",
    SMARTBILL_CREDENTIALS_PATH: await file("smartbill-credentials", `api@dezbatere.test:${SMARTBILL_TOKEN}\n`, 0o600),
    OWNER_REPORT_EMAIL_PATH: await file("owner-report-email", "owner@example.test\n", 0o600),
    PUBLIC_APP_URL: "https://dezbatere.test"
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NOT_FOUND = () => json({ error: { code: NETOPIA_FACTS.notFoundCodes[0]!, message: "order not found" } });
const OFF: RegisterFacts = Object.freeze({ registerVersion: 7, billingEnabled: false, planCurrency: "USD", countryPolicy: true });

function depsFor(environment: Record<string, string>, script: Partial<{
  status: () => Response; notify: () => Response | Promise<Response>; register: () => Promise<RegisterFacts>; company: SellerCompany;
}> = {}): BillingCheckDeps & { requests: string[] } {
  const requests: string[] = [];
  const netopia = (async (url: unknown, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${String(url)}`);
    return (script.status ?? NOT_FOUND)();
  }) as typeof fetch;
  const probe = (async (url: unknown, init?: RequestInit) => {
    requests.push(`${init?.method ?? "GET"} ${String(url)} redirect=${String(init?.redirect)}`);
    return (script.notify ?? (() => json({ error: "NOT_FOUND" }, 404)))();
  }) as typeof fetch;
  return {
    environment, company: script.company ?? COMPANY, trustedKeyOwners: { ownerUid: process.getuid!(), apiUid: -1 },
    fetch: probe, payments: (config) => createNetopiaPayments(config, { fetch: netopia }),
    randomOrderId: () => `t-${"0".repeat(30)}`, register: script.register ?? (async () => OFF), requests
  };
}

const texts = (lines: ReadonlyArray<{ ok: boolean; text: string }>, ok: boolean) =>
  lines.filter((line) => line.ok === ok).map((line) => line.text);

describe("N21 pnpm billing:check", () => {
  it("ticks every item of a complete sandbox setup with billing off, and prints no secret", async () => {
    const deps = depsFor(await stage());
    const lines = await runBillingCheck(deps);
    const text = renderCheckLines(lines);
    expect(texts(lines, false), text).toEqual([]);
    for (const sentence of [
      "✓ Every billing setting is present and well formed.",
      "✓ NETOPIA_API_BASE_URL is NETOPIA's sandbox: payments made here are tests, and no card is really charged.",
      "✓ NETOPIA_POS_SIGNATURE has NETOPIA's form (five groups of four).",
      "✓ Quaderno's sandbox and a .invalid SmartBill address go with NETOPIA's sandbox, so no real invoice can be issued.",
      "✓ NETOPIA_API_KEY_PATH: the file is there, holds one line, and only the API's user can read it.",
      "✓ OWNER_REPORT_EMAIL_PATH: the file is there, holds one line, and only the API's user can read it.",
      "✓ NETOPIA_IPN_KEYS_PATH: 1 trusted key, in a file owned by root and not writable by the API's user.",
      `✓ Key 1: RSA 2048 bits, SHA-256 ${FINGERPRINT}, not NETOPIA's published plugin key: confirm this fingerprint with NETOPIA.`,
      "✓ NETOPIA accepted the API key (it answered that our made-up order does not exist; nothing was charged).",
      "✓ https://dezbatere.test/api/v1/billing/netopia/notify answers a GET without a redirect (HTTP 404), so NETOPIA's messages can reach it.",
      "✓ Billing is off in register version 7: with NETOPIA's four settings complete, the API serves only NETOPIA's message (the provider-only mode).",
      "✓ The plans of register version 7 are priced in USD.",
      "✓ Register version 7 carries countryPolicy.",
      "✓ The company's facts (CUI, name, registered office, general address) are filled in."
    ]) expect(text, sentence).toContain(`${sentence}\n`);
    expect(text.trimEnd().split("\n").at(-1)).toBe(`All ${lines.length} checks passed.`);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(deps.requests).toEqual([
      "POST https://secure-sandbox.netopia-payments.com/operation/status",
      "GET https://dezbatere.test/api/v1/billing/netopia/notify redirect=manual"
    ]);
    expect(`/api${NETOPIA_NOTIFY_PATH}`).toBe("/api/v1/billing/netopia/notify");
  });

  it("names what is wrong, item by item, and never a value", async () => {
    const environment = await stage();
    const { QUADERNO_API_KEY_PATH: _missing, ...incomplete } = environment;
    await chmod(environment.NETOPIA_API_KEY_PATH!, 0o644);
    await chmod(environment.NETOPIA_IPN_KEYS_PATH!, 0o666);
    const lines = await runBillingCheck(depsFor({ ...incomplete, NETOPIA_API_BASE_URL: "https://secure.netopia-payments.com/api" }, {
      notify: () => new Response(null, { status: 301, headers: { location: "https://www.dezbatere.test/" } }),
      register: async () => ({ registerVersion: 8, billingEnabled: true, planCurrency: null, countryPolicy: false }),
      company: SELLER_COMPANY
    }));
    const crosses = texts(lines, false);
    expect(crosses).toEqual(expect.arrayContaining([
      "BILLING_CONFIGURATION_INCOMPLETE:QUADERNO_API_KEY_PATH: that setting is missing from api.env (deploy/vps/billing-setup.sh writes it).",
      "BILLING_LIVE_SANDBOX_INVOICER_REFUSED: Quaderno and SmartBill must match NETOPIA's system (sandbox with sandbox, live with live).",
      "QUADERNO_API_KEY_PATH is not set, so its file was not checked.",
      "NETOPIA_API_KEY_PATH: the file's mode or owner is wrong (it must be 0600 and the API's user's, in a 0700 directory of the same user).",
      "NETOPIA_IPN_KEYS_PATH: BILLING_IPN_KEYS_FILE_UNSAFE:GROUP_OR_OTHER_WRITABLE: the file must not be writable by anyone but root (chmod 0644).",
      "NETOPIA's acceptance of the API key was not asked: the API key file cannot be read.",
      "https://dezbatere.test/api/v1/billing/netopia/notify answers with a redirect (HTTP 301): NETOPIA does not follow redirects, so PUBLIC_APP_URL must be the site's exact public address.",
      "Register version 8 has no billingPlans row.",
      "Register version 8 has no countryPolicy row: billing cannot be switched on without it (README §14.8).",
      "BILLING_COMPANY_FACTS_UNVERIFIED:cui: that company fact is still in square brackets or malformed in COMPANY and SELLER_COMPANY (README §14.7)."
    ]));
    expect(texts(lines, true)).toContain("Billing is switched on in register version 8.");
    expect(texts(lines, true)).toContain("NETOPIA_API_BASE_URL is NETOPIA's live system: payments made here are real.");
    const text = renderCheckLines(lines);
    expect(text.trimEnd().split("\n").at(-1)).toBe(`${crosses.length} of ${lines.length} checks need attention.`);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it("reads NETOPIA's answer to the made-up order: refused, accepted with an error, a redirect, unreachable", async () => {
    const environment = await stage();
    const answerTo = async (status: () => Response) => (await runBillingCheck(depsFor(environment, { status })))
      .find((line) => /^(NETOPIA( refused| accepted| could not|'s address|'s client|'s answer)|The address did not answer)/u.test(line.text));
    expect(await answerTo(() => json({ code: "401", message: "Unauthorized" }, 401))).toEqual({
      ok: false, text: "NETOPIA refused the API key (PAYMENT_CREDENTIALS_REFUSED:401): check that it is this system's key (a sandbox key works only on the sandbox)."
    });
    expect((await answerTo(() => json({ error: { code: "99", message: "general error" } })))?.ok).toBe(true);
    expect(await answerTo(() => new Response(null, { status: 302, headers: { location: "https://elsewhere.test/" } }))).toEqual({
      ok: false, text: "NETOPIA's address answered with a redirect (PAYMENT_CONFIGURATION_REFUSED:redirect): NETOPIA_API_BASE_URL must be one of its API addresses exactly."
    });
    expect((await answerTo(() => json({}, 503)))?.text).toBe("NETOPIA could not be reached (PAYMENT_PROVIDER_UNAVAILABLE:503); try again in a few minutes.");
  });

  it("exits 0 when every item is ticked, 1 when any is crossed or nothing could start, 2 for any argument", async () => {
    const environment = await stage();
    const out: string[] = [];
    const err: string[] = [];
    const output = { stdout: (text: string) => { out.push(text); }, stderr: (text: string) => { err.push(text); } };
    const open = (deps: BillingCheckDeps) => async () => Object.freeze({ ...deps, close: async () => undefined });
    expect(await runBillingCheckCli([], output, open(depsFor(environment)))).toBe(0);
    expect(await runBillingCheckCli([], output, open(depsFor(environment, { company: SELLER_COMPANY })))).toBe(1);
    expect(await runBillingCheckCli(["--verbose"], output, open(depsFor(environment)))).toBe(2);
    expect(await runBillingCheckCli([], output, async () => { throw new TypeError("DATABASE_URL_MISSING"); })).toBe(1);
    expect(err).toEqual(["BILLING_CHECK_USAGE\n", "DATABASE_URL_MISSING\n"]);
    for (const secret of SECRETS) expect(out.join("")).not.toContain(secret);
  });

  it("reads the API's billing settings as they are, and nothing else", () => {
    expect(BILLING_CHECK_ENVIRONMENT_KEYS).toContain("PUBLIC_APP_URL");
    expect(BILLING_CHECK_ENVIRONMENT_KEYS).toContain("NETOPIA_IPN_KEYS_PATH");
    expect(readBillingCheckEnvironment({ NETOPIA_POS_SIGNATURE: " A ", DATABASE_URL: "postgres://x", PATH: "/bin" }))
      .toEqual({ NETOPIA_POS_SIGNATURE: " A " });
  });
});
