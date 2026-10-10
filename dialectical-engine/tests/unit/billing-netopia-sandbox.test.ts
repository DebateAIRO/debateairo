// tests/unit/billing-netopia-sandbox.test.ts
// N22 (spec 2026-10-05 §2.20.3): the owner-run recording tool, over N5's protocol fake and an in-memory session (the
// production session's database and key files are the owner's; the tool's logic is all here).
import { chmodSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PaymentEnvironment } from "@debateai/billing-core";
import { createSecretToken } from "@debateai/payments-netopia";
import { createNetopiaPaymentsForRecording } from "../../packages/payments-netopia/src/client.js";
import {
  NETOPIA_CAPTURE_FORMAT, captureFetch, newToolOrderId, parseSandboxArguments, redactTokens, runNetopiaSandbox,
  type CapturedExchange, type SandboxSession
} from "../../tools/billing/netopia-sandbox.js";
import { startFakeNetopia, type FakeNetopia } from "../support/fake-netopia.js";

const fakes: FakeNetopia[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const fake of fakes.splice(0)) await fake.close();
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
});

/** Our notify route's stand-in on loopback: the bodies a test hands to the session as "what the API stored". */
async function notifySink(): Promise<Readonly<{ publicAppUrl: string; bodies: Buffer[] }>> {
  const bodies: Buffer[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => { bodies.push(Buffer.concat(chunks)); response.end('{"errorType":0,"errorCode":0,"errorMessage":"OK"}'); });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  return { publicAppUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, bodies };
}

const STORED_AT = Date.parse("2026-10-08T10:00:00.000Z");

type Harness = Readonly<{
  fake: FakeNetopia; session: SandboxSession; dir: string; out: string[]; err: string[];
  toolOrders: Array<Readonly<{ orderId: string; paymentEnvironment: string; purpose: string }>>;
  cards: Map<string, string>; notices: Map<string, Buffer[]>; bodies: Buffer[]; run(...argv: string[]): Promise<number>;
}>;

async function harness(o: Readonly<{ environment?: PaymentEnvironment; apiKey?: string }> = {}): Promise<Harness> {
  const fake = await startFakeNetopia();
  fakes.push(fake);
  const sink = await notifySink();
  const dir = mkdtempSync(join(tmpdir(), "n22-capture-"));
  chmodSync(dir, 0o700);
  const exchanges: CapturedExchange[] = [];
  const toolOrders: Array<Readonly<{ orderId: string; paymentEnvironment: string; purpose: string }>> = [];
  const cards = new Map<string, string>();
  const notices = new Map<string, Buffer[]>();
  const session: SandboxSession = Object.freeze({
    environment: o.environment ?? "sandbox", baseUrl: fake.baseUrl, posSignature: fake.posSignature, publicAppUrl: sink.publicAppUrl,
    exchanges, trustedKeys: [{ fingerprint: "ab".repeat(32) }],
    payments: (facts) => createNetopiaPaymentsForRecording(
      { baseUrl: fake.baseUrl, apiKey: o.apiKey ?? fake.apiKey, posSignature: fake.posSignature },
      { fetch: captureFetch(fetch, (exchange) => exchanges.push(exchange)) }, facts),
    insertToolOrder: async (row) => { toolOrders.push(row); },
    toolOrder: async (orderId) => toolOrders.find((row) => row.orderId === orderId) ?? null,
    latestCard: async (orderId) => (cards.has(orderId) ? createSecretToken(cards.get(orderId)!) : null),
    // As the database does: each stored message keeps its own receivedAt, the same on every read.
    storedNotices: async (orderId) => (notices.get(orderId) ?? []).map((rawBody, index) => ({ receivedAt: new Date(STORED_AT + index * 1_000), rawBody })),
    close: async () => undefined
  });
  const out: string[] = [];
  const err: string[] = [];
  const run = (...argv: string[]) => runNetopiaSandbox(argv, { stdout: (text) => out.push(text), stderr: (text) => err.push(text) }, async () => session);
  return { fake, session, dir, out, err, toolOrders, cards, notices, bodies: sink.bodies, run };
}

const captures = (dir: string): Array<Readonly<{ name: string; capture: Record<string, unknown>; mode: number }>> =>
  readdirSync(dir).filter((name) => name.endsWith(".json") && !name.startsWith("state-")).sort().map((name) => ({
    name, capture: JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>, mode: statSync(join(dir, name)).mode & 0o777
  }));
const kinds = (dir: string): string[] => captures(dir).map((entry) => String(entry.capture.kind)).sort();
const printed = (lines: string[], name: string): string | null =>
  lines.join("").split("\n").find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

describe("N22 — the tool's arguments (spec §2.20.3)", () => {
  it("reads every subcommand, and refuses what it does not know", () => {
    const order = newToolOrderId();
    expect(order).toMatch(/^t-[0-9a-f]{30}$/u);
    expect(parseSandboxArguments(["check"])).toEqual({ command: "check" });
    expect(parseSandboxArguments(["start", "--capture-dir", "/d"])).toEqual({
      command: "start", captureDir: "/d", amountMicros: 1_000_000, clientIdAt: "order", installments: 0, payerFile: null, live: false
    });
    expect(parseSandboxArguments(["start", "--capture-dir", "/d", "--amount", "2.50", "--client-id-at", "instrument", "--installments", "1",
      "--payer", "/p.json", "--live", "--i-understand-this-charges-my-card"])).toMatchObject({ amountMicros: 2_500_000, clientIdAt: "instrument", installments: 1, payerFile: "/p.json", live: true });
    expect(parseSandboxArguments(["zero", "--capture-dir", "/d"])).toMatchObject({ command: "zero", amountMicros: 0 });
    expect(parseSandboxArguments(["status", "--capture-dir", "/d", "--order", order, "--no-ntp-id"])).toEqual({ command: "status", captureDir: "/d", orderId: order, withNtpId: false });
    expect(parseSandboxArguments(["status", "--capture-dir", "/d", "--unknown-order"])).toEqual({ command: "status", captureDir: "/d", orderId: null, withNtpId: false });
    expect(parseSandboxArguments(["charge", "--capture-dir", "/d", "--from-order", order, "--payer-ip", "198.51.100.9"]))
      .toEqual({ command: "charge", captureDir: "/d", fromOrder: order, amountMicros: 1_000_000, payerFile: null, payerIp: "198.51.100.9", live: false });
    expect(parseSandboxArguments(["fixture", "--capture-dir", "/d", "--order", order])).toEqual({ command: "fixture", captureDir: "/d", orderId: order });
    for (const argv of [[], ["refund", "--capture-dir", "/d"], ["start"], ["start", "--capture-dir", "/d", "--amount", "5.01"],
      ["start", "--capture-dir", "/d", "--amount", "0.001"], ["start", "--capture-dir", "/d", "--amount", "0"], ["zero", "--capture-dir", "/d", "--amount", "1.00"],
      ["start", "--capture-dir", "/d", "--client-id-at", "payment"], ["start", "--capture-dir", "/d", "--installments", "2"],
      ["start", "--capture-dir", "/d", "--live"], ["status", "--capture-dir", "/d"], ["status", "--capture-dir", "/d", "--order", "abc"],
      ["charge", "--capture-dir", "/d"], ["start", "--capture-dir", "/d", "--capture-dir", "/e"], ["start", "--capture-dir"]]) {
      expect(() => parseSandboxArguments(argv), argv.join(" ")).toThrow(/^NETOPIA_SANDBOX_USAGE/u);
    }
  });

  it("redacts every token value in captured text, whatever its place, its key or its letter case, keeping the key as written", () => {
    const secret = ["tok", "n22", "secret", "0001"].join("-");
    const card = ["card", "n22", "secret", "0002"].join("-");
    const id = ["tid", "n22", "secret", "0003"].join("-");
    const auth = ["auth", "n22", "secret", "0004"].join("-");
    const text = `{"payment":{"token":"${secret}","binding":{"Token" : "${secret}","expireMonth":12,"cardToken":"${card}","token_id":"${id}"},`
      + `"instrument":{"token":"a\\"b"}},"customerAction":{"type":"Authentication3D","authenticationToken":"${auth}"}}`;
    const redacted = redactTokens(text);
    for (const value of [secret, card, id, auth]) expect(redacted).not.toContain(value);
    expect(redacted).toBe('{"payment":{"token":"[token]","binding":{"Token":"[token]","expireMonth":12,"cardToken":"[token]","token_id":"[token]"},'
      + '"instrument":{"token":"[token]"}},"customerAction":{"type":"Authentication3D","authenticationToken":"[token]"}}');
  });
});

describe("N22 — start, status and zero on the sandbox", () => {
  it("registers a tool order, starts NETOPIA's page, prints its URL and captures the exchange (0600, no secret)", async () => {
    const h = await harness();
    expect(await h.run("start", "--capture-dir", h.dir)).toBe(0);
    const orderId = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    expect(orderId).toMatch(/^t-[0-9a-f]{30}$/u);
    expect(printed(h.out, "NETOPIA_SANDBOX_PAY")!.startsWith(`${h.fake.baseUrl}/ui/card?p=`)).toBe(true);
    expect(h.toolOrders).toEqual([expect.objectContaining({ orderId, paymentEnvironment: "sandbox", purpose: "SANDBOX_RECORDING" })]);
    expect(kinds(h.dir)).toEqual(["start-answer", "start-request"]);
    for (const { capture, mode } of captures(h.dir)) {
      expect(mode).toBe(0o600);
      expect(capture).toMatchObject({ format: NETOPIA_CAPTURE_FORMAT, environment: "sandbox" });
      expect(JSON.stringify(capture)).not.toContain(h.fake.apiKey);
    }
    const request = JSON.parse(String(captures(h.dir).find((entry) => entry.capture.kind === "start-request")!.capture.bodyText));
    expect(request.order).toMatchObject({ orderID: orderId, amount: 1, clientID: expect.stringMatching(/^[0-9a-f]{32}$/u) });
    expect(request.config.notifyUrl).toBe(`${h.session.publicAppUrl}/api/v1/billing/netopia/notify`);
    expect(h.fake.orders.get(orderId)?.amountText).toBe("1");
  });

  it("names the run after the facts it tries: the client id on the instrument, one installment, a 0 check", async () => {
    const h = await harness();
    expect(await h.run("start", "--capture-dir", h.dir, "--client-id-at", "instrument", "--installments", "1")).toBe(0);
    expect(await h.run("zero", "--capture-dir", h.dir)).toBe(0);
    expect(kinds(h.dir)).toEqual(["start-client-id-instrument-installments-1-answer", "start-client-id-instrument-installments-1-request", "zero-answer", "zero-request"]);
    const request = JSON.parse(String(captures(h.dir).find((entry) => entry.capture.kind === "start-client-id-instrument-installments-1-request")!.capture.bodyText));
    expect([request.payment.instrument.clientID !== undefined, request.order.clientID, request.payment.options.installments]).toEqual([true, undefined, 1]);
  });

  it("reads a status with the stored ntpID, without one, and for an order NETOPIA does not know", async () => {
    const h = await harness();
    await h.run("start", "--capture-dir", h.dir);
    const orderId = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    h.fake.pay(orderId, "APPROVE");
    h.out.length = 0;
    expect(await h.run("status", "--capture-dir", h.dir, "--order", orderId)).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_STATUS")).toBe("PAID:3");
    h.out.length = 0;
    expect(await h.run("status", "--capture-dir", h.dir, "--order", orderId, "--no-ntp-id")).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_STATUS")).toBe("PAID:3");
    h.out.length = 0;
    expect(await h.run("status", "--capture-dir", h.dir, "--unknown-order")).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_STATUS")).toBe("NO_SUCH_ORDER");
    expect(kinds(h.dir)).toEqual(["start-answer", "start-request", "status-answer", "status-answer-without-ntp-id", "status-no-such-order"]);
    expect(await h.run("status", "--capture-dir", h.dir, "--order", newToolOrderId())).toBe(1);
    expect(h.err.join("")).toContain("NETOPIA_SANDBOX_TOOL_ORDER_UNKNOWN");
  });

  it("files an unknown-order read as status-no-such-order even when the package refuses NETOPIA's answer", async () => {
    const h = await harness();
    h.fake.failNext("MERCHANT_SETTINGS", "STATUS");
    expect(await h.run("status", "--capture-dir", h.dir, "--unknown-order")).toBe(1);
    expect(printed(h.out, "NETOPIA_SANDBOX_STATUS")).toBe("PAYMENT_CONFIGURATION_REFUSED:32");
    expect(kinds(h.dir)).toEqual(["status-no-such-order"]);
  });
});

describe("N22 — charge and fixture", () => {
  it("charges the card the API stored for a tool order, as a new tool order, and never captures the token", async () => {
    const h = await harness();
    await h.run("start", "--capture-dir", h.dir);
    const first = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    h.fake.pay(first, "APPROVE");
    const token = h.fake.orders.get(first)!.token!;
    h.cards.set(first, token);
    h.out.length = 0;
    expect(await h.run("charge", "--capture-dir", h.dir, "--from-order", first)).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_CHARGE")).toBe("PAID:3:card=new");
    const second = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    expect(h.toolOrders.map((row) => row.orderId)).toEqual([first, second]);
    const files = captures(h.dir).filter((entry) => String(entry.capture.kind).startsWith("charge-"));
    expect(files.map((entry) => entry.capture.kind).sort()).toEqual(["charge-answer", "charge-request"]);
    for (const { capture } of files) expect(String(capture.bodyText)).toContain('"token":"[token]"');
    expect(JSON.stringify(captures(h.dir))).not.toContain(token);
    expect(JSON.stringify(h.out)).not.toContain(token);
  });

  it("refuses a charge from an unknown tool order or one without a stored card", async () => {
    const h = await harness();
    expect(await h.run("charge", "--capture-dir", h.dir, "--from-order", newToolOrderId())).toBe(1);
    await h.run("start", "--capture-dir", h.dir);
    const order = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    expect(await h.run("charge", "--capture-dir", h.dir, "--from-order", order)).toBe(1);
    expect(h.err.join("")).toMatch(/NETOPIA_SANDBOX_TOOL_ORDER_UNKNOWN[\s\S]*NETOPIA_SANDBOX_NO_SAVED_CARD/u);
  });

  it("copies what the API stored for an order into the capture folder, tokens redacted", async () => {
    const h = await harness();
    await h.run("start", "--capture-dir", h.dir);
    const orderId = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    h.fake.pay(orderId, "DECLINE", "20");
    h.fake.pay(orderId, "APPROVE");
    await h.fake.deliverNotices();
    h.notices.set(orderId, [...h.bodies]);
    h.out.length = 0;
    expect(await h.run("fixture", "--capture-dir", h.dir, "--order", orderId)).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_NOTICES")).toBe("2");
    const stored = captures(h.dir).filter((entry) => String(entry.capture.kind).startsWith("notice-"));
    expect(stored.map((entry) => entry.capture.kind).sort()).toEqual(["notice-start", "notice-start-2"]);
    expect(JSON.stringify(stored)).not.toContain(h.fake.orders.get(orderId)!.token!);
    expect(String(stored.find((entry) => entry.capture.kind === "notice-start-2")!.capture.bodyText)).toContain('"token":"[token]"');
  });

  it("copies again into the same folder: what is already there is skipped, only messages that arrived since are added", async () => {
    const h = await harness();
    await h.run("start", "--capture-dir", h.dir);
    const orderId = printed(h.out, "NETOPIA_SANDBOX_ORDER")!;
    h.fake.pay(orderId, "DECLINE", "20");
    h.fake.pay(orderId, "APPROVE");
    await h.fake.deliverNotices();
    h.notices.set(orderId, [...h.bodies]);
    const noticeFiles = (): string[] => captures(h.dir).filter((entry) => String(entry.capture.kind).startsWith("notice-")).map((entry) => entry.name);
    expect(await h.run("fixture", "--capture-dir", h.dir, "--order", orderId)).toBe(0);
    const first = noticeFiles();
    expect(first).toHaveLength(2);
    h.out.length = 0;
    expect(await h.run("fixture", "--capture-dir", h.dir, "--order", orderId)).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_NOTICES")).toBe("2");
    expect(noticeFiles()).toEqual(first);
    h.notices.get(orderId)!.push(Buffer.from(h.bodies[1]!));
    h.out.length = 0;
    expect(await h.run("fixture", "--capture-dir", h.dir, "--order", orderId)).toBe(0);
    expect(printed(h.out, "NETOPIA_SANDBOX_NOTICES")).toBe("3");
    const third = noticeFiles().filter((name) => !first.includes(name));
    expect(third).toHaveLength(1);
    expect(captures(h.dir).find((entry) => entry.name === third[0])!.capture.kind).toBe("notice-start-3");
  });
});

describe("N22 — the live guards and the check", () => {
  it("refuses start, zero and charge on live without both flags, before any request or row", async () => {
    const h = await harness({ environment: "live" });
    for (const argv of [["start", "--capture-dir", h.dir], ["zero", "--capture-dir", h.dir], ["charge", "--capture-dir", h.dir, "--from-order", newToolOrderId()]]) {
      expect(await h.run(...argv), argv[0]).toBe(1);
    }
    expect(h.err.join("").match(/NETOPIA_SANDBOX_LIVE_NOT_CONFIRMED/gu)).toHaveLength(3);
    expect(await h.run("start", "--capture-dir", h.dir, "--live")).toBe(2);
    expect(await h.run("start", "--capture-dir", h.dir, "--live", "--i-understand-this-charges-my-card")).toBe(1);
    expect(h.err.join("")).toContain("NETOPIA_SANDBOX_PAYER_REQUIRED");
    expect([h.fake.lastRequests.length, h.toolOrders.length, captures(h.dir).length]).toEqual([0, 0, 0]);
  });

  it("runs on live with both flags and the owner's details, as a LIVE_TEST tool order", async () => {
    const h = await harness({ environment: "live" });
    const payer = join(mkdtempSync(join(tmpdir(), "n22-payer-")), "payer.json");
    writeFileSync(payer, JSON.stringify({ firstName: "Owner", lastName: "Person", email: "owner@example.test", phone: "+40711111111",
      country: "RO", region: "Iasi", city: "Iasi", postalCode: "700001", street: "Strada Owner 1" }), { mode: 0o600 });
    expect(await h.run("start", "--capture-dir", h.dir, "--payer", payer, "--live", "--i-understand-this-charges-my-card")).toBe(0);
    expect(h.toolOrders).toEqual([expect.objectContaining({ paymentEnvironment: "live", purpose: "LIVE_TEST" })]);
  });

  it("refuses a capture folder others can read", async () => {
    const h = await harness();
    chmodSync(h.dir, 0o755);
    expect(await h.run("start", "--capture-dir", h.dir)).toBe(1);
    expect(h.err.join("")).toContain("NETOPIA_SANDBOX_CAPTURE_DIR_UNSAFE");
    expect(h.toolOrders).toEqual([]);
  });

  it("checks the settings, the trusted keys and whether NETOPIA accepts the API key, printing no secret", async () => {
    const good = await harness();
    expect(await good.run("check")).toBe(0);
    const text = good.out.join("");
    expect(text).toContain("✓ NETOPIA sandbox at http://127.0.0.1:");
    expect(text).toContain(`✓ trusted key ${"ab".repeat(32)}`);
    expect(text).toContain("✓ NETOPIA accepts the API key");
    expect(text).not.toContain(good.fake.apiKey);
    const refused = await harness({ apiKey: ["wrong", "key", "0001"].join("-") });
    expect(await refused.run("check")).toBe(1);
    expect(refused.out.join("")).toContain("✗ NETOPIA refused the API key");
  });
});

describe("N22 — captureFetch", () => {
  it("records the request and the answer without the Authorization header, and hands the client an equal answer", async () => {
    const seen: CapturedExchange[] = [];
    const inner = (async () => new Response('{"error":{"code":"00"},"payment":{"token":"tok-zzzzz"}}', { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const wrapped = captureFetch(inner, (exchange) => seen.push(exchange));
    const answer = await wrapped("https://secure-sandbox.netopia-payments.com/operation/status", {
      method: "POST", headers: { authorization: ["key", "0001"].join("-") }, body: '{"posID":"X","token":"tok-yyyyy"}'
    });
    expect(await answer.text()).toBe('{"error":{"code":"00"},"payment":{"token":"tok-zzzzz"}}');
    expect(seen).toEqual([{ path: "/operation/status", requestText: '{"posID":"X","token":"[token]"}', httpStatus: 200,
      contentType: "application/json", responseText: '{"error":{"code":"00"},"payment":{"token":"[token]"}}' }]);
    expect(JSON.stringify(seen)).not.toContain("key-0001");
  });
});
