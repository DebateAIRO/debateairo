// tests/unit/billing-xmoney-fixture-scrub.test.ts
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  XMONEY_FIXTURE_FORMAT,
  XMONEY_FIXTURE_TEST_KEY,
  XMONEY_OPTIONAL_FIXTURE_KINDS,
  XMONEY_REQUIRED_FIXTURE_KINDS,
  XMONEY_SIGNATURE_CONSTRUCTIONS,
  XMoneyScrubber,
  decryptOpensslResult,
  noticeFraming,
  readXMoneyKeyFile,
  signatureCandidate,
  writeXMoneyFixtures
} from "../../tools/billing/scrub-xmoney-fixture.js";
import {
  RECORDING_PERMISSIONS_POLICY,
  describeXMoneyKeyShape,
  inFlightListing,
  linkedRefundRows,
  recordingContentSecurityPolicy,
  recordingHeaders,
  recordingOrder,
  recordingPage,
  signRecordingOrder,
  transactionListCapture
} from "../../tools/billing/xmoney-sandbox.js";

const roots: string[] = [];
function privateRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "x0-scrub-"));
  chmodSync(root, 0o700);
  roots.push(root);
  return root;
}
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function captureFolder(root: string): string {
  const captures = join(root, "captures");
  mkdirSync(captures, { mode: 0o700 });
  return captures;
}

function ownerKeyFile(root: string): Readonly<{ key: Buffer; path: string }> {
  const key = Buffer.from(randomBytes(16).toString("hex"), "latin1");
  const path = join(root, "private-key");
  writeFileSync(path, `${key.toString("latin1")}\n`, { mode: 0o600 });
  return { key, path };
}

function encryptUnder(key: Buffer, plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return `${iv.toString("base64")},${Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64")}`;
}

const NOTICE = {
  transactionStatus: "complete-ok", orderId: 7, transactionId: 8, customerId: 9,
  externalOrderId: "00112233445566778899aabbccddeeff", amount: 1, currency: "USD", cardId: 10,
  identifier: "ffeeddccbbaa99887766554433221100"
};

describe("X0 — xMoney fixture scrubbing", () => {
  it("replaces personal data and keeps id equalities across records of one run", () => {
    const scrubber = new XMoneyScrubber();
    const notice = scrubber.scrub({
      transactionStatus: "complete-ok", orderId: 88123, transactionId: 99001, customerId: 5501,
      externalOrderId: "9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f", amount: 24.2, currency: "USD",
      identifier: "c0ffee00c0ffee00c0ffee00c0ffee00"
    }) as Record<string, unknown>;
    const transaction = scrubber.scrub({
      id: 99001, orderId: 88123, customerId: 5501, ip: "81.196.12.34", email: "owner@realmail.ro",
      transactionStatus: "complete-ok", amount: "24.20", currency: "USD", customerCountry: "RO",
      cardHolderName: "Stefan Real", cardNumber: "411111******1111",
      backUrl: "https://dezbatere.ro/checkout/return?charge=9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f",
      components: [{ componentId: 1, providerRrn: "123456789012", data: { raw: "anything" } }]
    }) as Record<string, unknown>;
    expect(notice.orderId).toBe(transaction.orderId);
    expect(notice.transactionId).toBe(transaction.id);
    expect(notice.orderId).not.toBe(88123);
    expect(typeof notice.orderId).toBe("number");
    expect(notice.externalOrderId).toMatch(/^[0-9a-f]{32}$/u);
    expect(notice.externalOrderId).not.toBe("9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f");
    expect(transaction.ip).toBe("203.0.113.10");
    expect(transaction.email).toBe("person@example.test");
    expect(transaction.cardHolderName).toBe("Test Person");
    expect(transaction.cardNumber).toBe("411111******1111");
    expect(transaction.backUrl).toBe("https://debateai.test/checkout/return?charge=SCRUBBED");
    expect(transaction.components).toEqual([{ componentId: expect.any(Number), providerRrn: "SCRUBBED", data: {} }]);
    expect(transaction.transactionStatus).toBe("complete-ok");
    expect(transaction.amount).toBe("24.20");
    expect(transaction.customerCountry).toBe("RO");
    expect(JSON.stringify(transaction)).not.toContain("Stefan");
    expect(JSON.stringify(transaction)).not.toContain("realmail");
    // The Customer and Transaction fields xMoney's schema adds that name a person's region or card.
    const customer = scrubber.scrub({
      customerData: { firstName: "Stefan", lastName: "Real", state: "Cluj", city: "Cluj-Napoca", country: "RO" },
      cardHolderState: "Cluj", cardExpiryDate: "09/29", cardHolderCountry: "RO"
    });
    expect(customer).toEqual({
      customerData: { firstName: "Test", lastName: "Person", state: "SCRUBBED", city: "SCRUBBED", country: "RO" },
      cardHolderState: "SCRUBBED", cardExpiryDate: "12/99", cardHolderCountry: "RO"
    });
    for (const original of ["Stefan", "Real", "Cluj", "09/29"]) {
      expect(JSON.stringify(customer), original).not.toContain(original);
    }
  });

  it("gives one id one pseudonym whether a capture carries it as a number or as its digit text", () => {
    const scrubber = new XMoneyScrubber();
    const payment = scrubber.scrub({ code: 200, data: { id: 7, orderId: 88123 } }) as { data: { id: unknown } };
    const listing = scrubber.scrub({
      code: 200, data: [{ id: 8, transactionType: "refund", relatedTransactionIds: ["7"] }]
    }) as { data: Array<{ relatedTransactionIds: unknown[] }> };
    const related = listing.data[0]!.relatedTransactionIds[0];
    expect(typeof payment.data.id).toBe("number");
    expect(payment.data.id).not.toBe(7);
    expect(typeof related).toBe("string");
    expect(String(related)).toBe(String(payment.data.id));
    expect(linkedRefundRows(listing, String(payment.data.id))).toHaveLength(1);
    const asText = scrubber.scrub({ siteId: "4242" }) as { siteId: unknown };
    const asNumber = scrubber.scrub({ siteId: 4242 }) as { siteId: unknown };
    expect(typeof asText.siteId).toBe("string");
    expect(typeof asNumber.siteId).toBe("number");
    expect(asText.siteId).not.toBe("4242");
    expect(String(asNumber.siteId)).toBe(asText.siteId);
  });

  it("scrubs a named field whole when xMoney sends it as an object or a list, not only as text", () => {
    const scrubbed = new XMoneyScrubber().scrub({
      address: { line1: "Str. Reala 5", city: "Cluj" },
      customData: { note: "Stefan" },
      externalCustomData: ["Stefan Real"],
      cardExpiryDate: { month: 9, year: 29 }
    });
    expect(scrubbed).toEqual({
      address: "SCRUBBED", customData: "SCRUBBED", externalCustomData: "SCRUBBED", cardExpiryDate: "12/99"
    });
    for (const original of ["Reala", "Stefan"]) {
      expect(JSON.stringify(scrubbed), original).not.toContain(original);
    }
    expect(new XMoneyScrubber().scrub({ firstName: { given: "Stefan" }, nameOnCard: ["Stefan", "Real"] }))
      .toEqual({ firstName: "Test", nameOnCard: "Test Person" });
  });

  it("decrypts a captured notice with the owner's key, records its framing and outer field names, and re-encrypts it under the test key", () => {
    const root = privateRoot();
    const captures = captureFolder(root);
    const out = join(root, "fixtures");
    const owner = ownerKeyFile(root);
    const opensslResult = encryptUnder(owner.key, JSON.stringify(NOTICE));
    const signature = "ab".repeat(64);
    writeFileSync(
      join(captures, "notice-success.raw"),
      `content-type: application/x-www-form-urlencoded\n\n${new URLSearchParams({ opensslResult, signature }).toString()}`
    );
    writeFileSync(join(captures, "card.json"), JSON.stringify({
      code: 200, message: "Success", data: { id: 10, customerId: 9, binInfo: { countryCode: "RO", bank: "Real Bank" } }
    }));
    const written = writeXMoneyFixtures({
      captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: out, recordedOn: "2026-10-02"
    });
    expect(written.sort()).toEqual(["card.json", "notice-success.json"]);
    const text = readFileSync(join(out, "notice-success.json"), "utf8");
    const notice = JSON.parse(text) as Record<string, unknown>;
    expect(notice.format).toBe(XMONEY_FIXTURE_FORMAT);
    expect(notice.contentType).toBe("application/x-www-form-urlencoded");
    expect(notice.framing).toEqual({ ivBytes: 16, alphabet: "standard", padded: true, lineBreaks: false, plusArrivedAsSpace: false });
    // A signature that is none of the candidate constructions is named null (W1's X0 follow-up), never shown.
    expect(notice.outerFields).toEqual({ signature: { length: 128, charset: "hex", construction: null } });
    expect(text).not.toContain(signature);
    const body = notice.body as Record<string, unknown>;
    expect(body.transactionStatus).toBe("complete-ok");
    expect(body.orderId).not.toBe(7);
    const reopened = JSON.parse(decryptOpensslResult(
      notice.testKeyOpensslResult as string, Buffer.from(XMONEY_FIXTURE_TEST_KEY, "latin1")
    ).toString("utf8"));
    expect(reopened).toEqual(body);
    const card = JSON.parse(readFileSync(join(out, "card.json"), "utf8")) as Record<string, unknown>;
    expect((card.body as { data: { binInfo: { countryCode: string } } }).data.binInfo.countryCode).toBe("RO");
    expect((card.body as { data: { customerId: number } }).data.customerId).toBe(body.customerId);
    expect(card).toMatchObject({ testKeyOpensslResult: null, framing: null, outerFields: null, testKeySignature: null });
    expect(text).not.toContain(owner.key.toString("latin1"));
  });

  it("names which candidate construction a notice's signature is, by name only, for each of the candidates (W1's X0 follow-up)", () => {
    expect(XMONEY_SIGNATURE_CONSTRUCTIONS).toHaveLength(8);
    for (const construction of XMONEY_SIGNATURE_CONSTRUCTIONS) {
      const root = privateRoot();
      const captures = captureFolder(root);
      const owner = ownerKeyFile(root);
      const plaintext = JSON.stringify(NOTICE);
      const opensslResult = encryptUnder(owner.key, plaintext);
      const signature = signatureCandidate(construction, {
        opensslResult, plaintext: Buffer.from(plaintext, "utf8"), key: owner.key
      });
      writeFileSync(
        join(captures, "notice-success.raw"),
        `content-type: application/x-www-form-urlencoded\n\n${new URLSearchParams({ opensslResult, signature }).toString()}`
      );
      const out = join(root, "fixtures");
      writeXMoneyFixtures({ captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: out, recordedOn: "2026-10-02" });
      const text = readFileSync(join(out, "notice-success.json"), "utf8");
      const fixture = JSON.parse(text) as { outerFields: { signature: Record<string, unknown> } };
      expect(fixture.outerFields.signature, construction).toEqual({
        length: signature.length, charset: construction.includes("-hex(") ? "hex" : "base64", construction
      });
      expect(text, construction).not.toContain(signature);
      expect(text, construction).not.toContain(encodeURIComponent(signature));
    }
  });

  it("names a base64 signature whose + arrived as a space, and a hex one in capitals, and nothing for a near miss", () => {
    const root = privateRoot();
    const owner = ownerKeyFile(root);
    const plaintext = JSON.stringify(NOTICE);
    let opensslResult = encryptUnder(owner.key, plaintext);
    const over = (text: string, construction: typeof XMONEY_SIGNATURE_CONSTRUCTIONS[number]) =>
      signatureCandidate(construction, { opensslResult: text, plaintext: Buffer.from(plaintext, "utf8"), key: owner.key });
    while (!over(opensslResult, "hmac-sha512-base64(opensslResult)").includes("+")) {
      opensslResult = encryptUnder(owner.key, plaintext);
    }
    const base64 = over(opensslResult, "hmac-sha512-base64(opensslResult)");
    const hex = over(opensslResult, "sha512-hex(plaintext)");
    const nearMiss = `${hex.slice(0, -1)}${hex.endsWith("0") ? "1" : "0"}`;
    const cases = [
      // The form body carries both fields unescaped, as a sender that skips percent-encoding would.
      { name: "plus", body: `opensslResult=${opensslResult}&signature=${base64}`, expected: "hmac-sha512-base64(opensslResult)" },
      { name: "upper", body: new URLSearchParams({ opensslResult, signature: hex.toUpperCase() }).toString(), expected: "sha512-hex(plaintext)" },
      { name: "miss", body: new URLSearchParams({ opensslResult, signature: nearMiss }).toString(), expected: null }
    ];
    for (const { name, body, expected } of cases) {
      const captures = join(root, name);
      mkdirSync(captures, { mode: 0o700 });
      writeFileSync(join(captures, "notice-success.raw"), `content-type: application/x-www-form-urlencoded\n\n${body}`);
      const out = join(root, `${name}-out`);
      writeXMoneyFixtures({ captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: out, recordedOn: "2026-10-02" });
      const fixture = JSON.parse(readFileSync(join(out, "notice-success.json"), "utf8")) as {
        outerFields: { signature: { construction: unknown } };
      };
      expect(fixture.outerFields.signature.construction, name).toBe(expected);
    }
  });

  it("records a + that the form body carried unescaped (it arrives as a space) and still decrypts the notice", () => {
    const root = privateRoot();
    const captures = captureFolder(root);
    const owner = ownerKeyFile(root);
    let opensslResult = encryptUnder(owner.key, JSON.stringify(NOTICE));
    while (!opensslResult.includes("+")) opensslResult = encryptUnder(owner.key, JSON.stringify(NOTICE));
    writeFileSync(
      join(captures, "notice-rebill.raw"),
      `content-type: application/x-www-form-urlencoded\n\nopensslResult=${opensslResult}`
    );
    const out = join(root, "fixtures");
    writeXMoneyFixtures({ captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: out, recordedOn: "2026-10-02" });
    const fixture = JSON.parse(readFileSync(join(out, "notice-rebill.json"), "utf8")) as {
      framing: { plusArrivedAsSpace: boolean }; body: { transactionStatus: string };
    };
    expect(fixture.framing.plusArrivedAsSpace).toBe(true);
    expect(fixture.body.transactionStatus).toBe("complete-ok");
  });

  it("refuses a form notice body that ends with a line break, whichever field comes last, instead of stripping it", () => {
    const root = privateRoot();
    const owner = ownerKeyFile(root);
    const opensslResult = encryptUnder(owner.key, JSON.stringify(NOTICE));
    const signature = "ab".repeat(64);
    const bodies = {
      opensslResultLast: `${new URLSearchParams({ signature, opensslResult }).toString()}\n`,
      signatureLast: `${new URLSearchParams({ opensslResult, signature }).toString()}\n`,
      signatureLastWindows: `${new URLSearchParams({ opensslResult, signature }).toString()}\r\n`
    };
    for (const [order, body] of Object.entries(bodies)) {
      const captures = join(root, order);
      mkdirSync(captures, { mode: 0o700 });
      writeFileSync(join(captures, "notice-success.raw"), `content-type: application/x-www-form-urlencoded\n\n${body}`);
      expect(() => writeXMoneyFixtures({
        captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: join(root, `${order}-out`), recordedOn: "2026-10-02"
      }), order).toThrow("XMONEY_CAPTURE_FRAMING_UNEXPECTED:TRAILING_LINE_BREAK");
    }
  });

  it("refuses a real notice outside P3a's grammar — wrapped lines or the URL-safe alphabet — before decrypting it", () => {
    const iv = Buffer.alloc(16, 1).toString("base64");
    const ciphertext = randomBytes(96).toString("base64");
    const wrapped = `${iv},${ciphertext.slice(0, 64)}\n${ciphertext.slice(64)}`;
    // 0xfb 0xff 0xbf encodes as "-_-_" in the URL-safe alphabet, so the case never passes by chance.
    const urlSafe = `${iv},${Buffer.concat([Buffer.from([0xfb, 0xff, 0xbf]), randomBytes(93)]).toString("base64url")}`;
    expect(() => noticeFraming(wrapped, false)).toThrow("XMONEY_CAPTURE_FRAMING_UNEXPECTED:CIPHERTEXT_ALPHABET");
    expect(() => noticeFraming(urlSafe, false)).toThrow("XMONEY_CAPTURE_FRAMING_UNEXPECTED:CIPHERTEXT_ALPHABET");
    expect(() => noticeFraming(`${Buffer.alloc(8, 1).toString("base64")},${ciphertext}`, false))
      .toThrow("XMONEY_CAPTURE_FRAMING_UNEXPECTED:IV_LENGTH");
    expect(() => noticeFraming(`${iv},${randomBytes(20).toString("base64")}`, false))
      .toThrow("XMONEY_CAPTURE_FRAMING_UNEXPECTED:CIPHERTEXT_LENGTH");
    // Through the writer, with a key that could not decrypt it anyway: the framing refusal comes first.
    const root = privateRoot();
    const captures = captureFolder(root);
    writeFileSync(join(captures, "notice-failed.raw"), `content-type: application/json\n\n${JSON.stringify({ opensslResult: wrapped })}`);
    expect(() => writeXMoneyFixtures({
      captureDir: captures, key: Buffer.alloc(32, 1), outDir: join(root, "out"), recordedOn: "2026-10-02"
    })).toThrow("XMONEY_CAPTURE_FRAMING_UNEXPECTED:CIPHERTEXT_ALPHABET");
  });

  it("refuses a key file other users can read, a capture it cannot classify, and two captures of one kind", () => {
    expect(XMONEY_REQUIRED_FIXTURE_KINDS).toHaveLength(27);
    expect(XMONEY_OPTIONAL_FIXTURE_KINDS).toHaveLength(7);
    // W1 (P2-I1, P2-I6): the customer POST /customer created is required; a second POST of it is optional.
    expect(XMONEY_REQUIRED_FIXTURE_KINDS as readonly string[]).toContain("customer-response");
    // W13 (P2-I18): the daily money check's charge-back listing, which X0 must show xMoney accepts.
    expect(XMONEY_REQUIRED_FIXTURE_KINDS as readonly string[]).toContain("transaction-list-charge-back");
    expect(XMONEY_OPTIONAL_FIXTURE_KINDS as readonly string[]).toContain("customer-response-repeat");
    for (const kind of ["transaction-list-refund-after-partial", "transaction-refund-second-partial",
      "transaction-list-refund-after-second-partial"]) {
      expect(XMONEY_REQUIRED_FIXTURE_KINDS as readonly string[], kind).toContain(kind);
    }
    expect(XMONEY_OPTIONAL_FIXTURE_KINDS as readonly string[]).toEqual(expect.arrayContaining([
      "rebill-declined-response", "transaction-rebill-declined"
    ]));
    expect(XMONEY_REQUIRED_FIXTURE_KINDS.filter((kind) => (XMONEY_OPTIONAL_FIXTURE_KINDS as readonly string[]).includes(kind))).toEqual([]);
    const root = privateRoot();
    const keyFile = join(root, "loose-key");
    writeFileSync(keyFile, XMONEY_FIXTURE_TEST_KEY, { mode: 0o644 });
    chmodSync(keyFile, 0o644);
    expect(() => readXMoneyKeyFile(keyFile)).toThrow("XMONEY_KEY_FILE_MODE_UNSAFE");
    const write = (captures: string) => writeXMoneyFixtures({
      captureDir: captures, key: Buffer.alloc(32, 1), outDir: join(root, "out"), recordedOn: "2026-10-02"
    });
    const unknown = join(root, "unknown");
    mkdirSync(unknown, { mode: 0o700 });
    writeFileSync(join(unknown, "mystery.json"), "{}");
    expect(() => write(unknown)).toThrow("XMONEY_CAPTURE_KIND_UNKNOWN");
    // The single "transaction" kind is retired: each read now names its step (transaction-initial, -rebill, …).
    const retired = join(root, "retired");
    mkdirSync(retired, { mode: 0o700 });
    writeFileSync(join(retired, "transaction.json"), "{}");
    expect(() => write(retired)).toThrow("XMONEY_CAPTURE_KIND_UNKNOWN");
    const duplicates = join(root, "duplicates");
    mkdirSync(duplicates, { mode: 0o700 });
    writeFileSync(join(duplicates, "transaction-rebill-1790000000001.json"), "{}");
    writeFileSync(join(duplicates, "transaction-rebill-1790000000002.json"), "{}");
    expect(() => write(duplicates)).toThrow("XMONEY_CAPTURE_KIND_DUPLICATE:transaction-rebill");
  });

  it("turns the order the stage form accepted into a test-key vector, and refuses a payload that is not its order", () => {
    const root = privateRoot();
    const captures = captureFolder(root);
    const owner = ownerKeyFile(root);
    const order = recordingOrder({
      publicKey: "pk_stage_real_owner", siteId: "4242", identifier: "c0ffee00c0ffee00c0ffee00c0ffee00",
      email: "owner@realmail.ro", country: "RO", chargeId: "9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f", amount: "1.00",
      mode: "authAndCapture", description: "DebateAI stage recording",
      backUrl: "http://127.0.0.1:8780/return?charge=9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f"
    });
    const signed = signRecordingOrder(order, owner.key);
    writeFileSync(join(captures, "order-payload-1790000000000.json"), JSON.stringify({ order, ...signed }));
    const out = join(root, "fixtures");
    writeXMoneyFixtures({ captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: out, recordedOn: "2026-10-02" });
    const text = readFileSync(join(out, "order-payload.json"), "utf8");
    const fixture = JSON.parse(text) as {
      body: { order: Record<string, unknown> }; testKeySignature: { payload: string; checksum: string };
    };
    const json = JSON.stringify(fixture.body.order);
    expect(Object.keys(fixture.body.order)).toEqual(Object.keys(order));
    expect(fixture.testKeySignature).toEqual({
      payload: Buffer.from(json, "utf8").toString("base64"),
      checksum: createHmac("sha512", Buffer.from(XMONEY_FIXTURE_TEST_KEY, "latin1")).update(json, "utf8").digest("base64")
    });
    for (const original of ["owner@realmail.ro", "pk_stage_real_owner", "9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f", signed.checksum]) {
      expect(text, original).not.toContain(original);
    }
    rmSync(join(captures, "order-payload-1790000000000.json"));
    writeFileSync(join(captures, "order-payload.json"), JSON.stringify({ order: { ...order, saveCard: false }, ...signed }));
    expect(() => writeXMoneyFixtures({ captureDir: captures, key: owner.key, outDir: out, recordedOn: "2026-10-02" }))
      .toThrow("XMONEY_CAPTURE_ORDER_PAYLOAD_MISMATCH");
  });

  it("keeps the created customer equal to the paying one, and the repeated identifier equal to the order's, in one scrub run (W1)", () => {
    const root = privateRoot();
    const captures = captureFolder(root);
    const owner = ownerKeyFile(root);
    const identifier = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
    const order = recordingOrder({
      publicKey: "pk_stage_real_owner", siteId: "4242", identifier, email: "owner@realmail.ro", country: "RO",
      chargeId: "9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f", amount: "1.00", mode: "authAndCapture",
      description: "DebateAI stage recording", backUrl: "http://127.0.0.1:8780/return?charge=9f0c2a1e5b7d4c3a8e6f1b2d3c4a5e6f"
    });
    writeFileSync(join(captures, "order-payload-1.json"), JSON.stringify({ order, ...signRecordingOrder(order, owner.key) }));
    writeFileSync(join(captures, "customer-response-2.json"), JSON.stringify({ code: 201, message: "Created", data: { id: 5501 } }));
    writeFileSync(join(captures, "customer-response-repeat-3.json"), JSON.stringify({
      httpStatus: 400, reply: { code: 400, message: "Duplicate" },
      lookup: { httpStatus: 200, reply: { code: 200, data: [{ id: 5501, identifier, email: "owner@realmail.ro" }] } }
    }));
    writeFileSync(join(captures, "transaction-initial-4.json"), JSON.stringify({
      code: 200, data: { id: 99001, orderId: 88123, customerId: 5501, transactionStatus: "complete-ok", amount: "1.00" }
    }));
    const out = join(root, "fixtures");
    writeXMoneyFixtures({ captureDir: captures, key: readXMoneyKeyFile(owner.path), outDir: out, recordedOn: "2026-10-02" });
    const read = <T>(kind: string): T => (JSON.parse(readFileSync(join(out, `${kind}.json`), "utf8")) as { body: T }).body;
    const created = read<{ data: { id: unknown } }>("customer-response").data.id;
    expect(created).not.toBe(5501);
    expect(read<{ data: { customerId: unknown } }>("transaction-initial").data.customerId).toBe(created);
    const repeat = read<{
      httpStatus: number; lookup: { reply: { data: Array<{ id: unknown; identifier: unknown }> } };
    }>("customer-response-repeat");
    expect(repeat.httpStatus).toBe(400);
    expect(repeat.lookup.reply.data[0]!.id).toBe(created);
    const scrubbedIdentifier = read<{ order: { customer: { identifier: unknown } } }>("order-payload").order.customer.identifier;
    expect(scrubbedIdentifier).not.toBe(identifier);
    expect(repeat.lookup.reply.data[0]!.identifier).toBe(scrubbedIdentifier);
    for (const kind of ["customer-response-repeat", "order-payload"]) {
      const text = readFileSync(join(out, `${kind}.json`), "utf8");
      for (const original of [identifier, "owner@realmail.ro"]) expect(text, `${kind} ${original}`).not.toContain(original);
    }
  });

  it("describes a key without revealing it, and serves a report-only page with production's other headers", () => {
    expect(describeXMoneyKeyShape(Buffer.from("0123456789abcdef0123456789abcdef", "latin1"))).toEqual({
      bytes: 32, printableAscii: true, lowerHex: true, underscorePrefix: false, aes256KeyLength: true
    });
    expect(describeXMoneyKeyShape(Buffer.from("sk_test_abc", "latin1"))).toEqual({
      bytes: 11, printableAscii: true, lowerHex: false, underscorePrefix: true, aes256KeyLength: false
    });
    const policy = recordingContentSecurityPolicy("n0nce");
    expect(policy).toContain("script-src 'nonce-n0nce' 'strict-dynamic'");
    expect(policy).toContain("frame-src 'self'");
    expect(policy).toContain("report-uri /csp-report");
    const production = recordingHeaders("n0nce", "production");
    expect(production["content-security-policy-report-only"]).toBe(policy);
    expect(production["cross-origin-opener-policy"]).toBe("same-origin");
    expect(production["referrer-policy"]).toBe("no-referrer");
    expect(production["permissions-policy"]).toBe(RECORDING_PERMISSIONS_POLICY);
    expect(production["permissions-policy"]).toContain("payment=()");
    const without = recordingHeaders("n0nce", "none");
    expect(Object.keys(without)).not.toContain("permissions-policy");
    expect(without["referrer-policy"]).toBe("no-referrer");
    // The referrer comparison (D7 Open question 16): production's no-referrer is the default; strict-origin is the
    // one other policy P19 may give the card routes, so it is the one the owner compares against.
    const referred = recordingHeaders("n0nce", "production", "strict-origin");
    expect(referred["referrer-policy"]).toBe("strict-origin");
    expect(referred["permissions-policy"]).toBe(RECORDING_PERMISSIONS_POLICY);
    expect(recordingHeaders("n0nce", "production", "production")).toEqual(production);
    const signed = signRecordingOrder({ a: 1 }, Buffer.from("0123456789abcdef0123456789abcdef", "latin1"));
    expect(signed.payload).toBe(Buffer.from('{"a":1}', "utf8").toString("base64"));
    const page = recordingPage({
      nonce: "n0nce", sdkOrigin: "https://secure-stage.xmoney.com", publicKey: "pk</script>", payload: signed.payload,
      checksum: signed.checksum, locale: "ro"
    });
    expect(page).toContain('<script nonce="n0nce" src="https://secure-stage.xmoney.com/sdk/v2/xmoney.js"></script>');
    expect(page).not.toContain("pk</script>");
    expect(page).toContain("pk\\u003c/script>");
    // Production hides the save-card box (spec §2.5.3); an unticked box would skew the rebill measurement.
    expect(page).toContain("displaySaveCardOption: false");
    expect(page).toContain('locale: "ro"');
    // The same call P19's XMoneyCardForm makes (D7 Open question 4): the container element, xMoney's own button
    // hidden, our button pressing the handle's submit(), destroy() once done — so the recording confirms each name.
    expect(page).toContain("displaySubmitButton: false");
    expect(page).not.toContain("displaySubmitButton: true");
    expect(page).toContain('container: document.getElementById("card")');
    expect(page).toContain("form.submit();");
    expect(page).toContain("form.destroy();");
    expect(page).toContain("onPaymentComplete(transaction)");
    expect(page).toContain("handle: shape()");
  });

  it("says only whether the in-flight attempt is listed and carries a customerId (X0 item 9, P2-I6's listing)", () => {
    const listing = { code: 200, message: "Success", data: [
      { id: 7, orderId: 3, customerId: 11, transactionStatus: "3d-pending" },
      { id: 8, orderId: 3, transactionStatus: "3d-pending" },
      { id: "9", orderId: 3, customerId: "12", transactionStatus: "3d-pending" },
      { id: 10, orderId: 3, customerId: null, transactionStatus: "start" }
    ] };
    expect(inFlightListing(listing, "7")).toEqual({ listed: true, customerId: true });
    expect(inFlightListing(listing, "8")).toEqual({ listed: true, customerId: false });
    expect(inFlightListing(listing, "9")).toEqual({ listed: true, customerId: true });
    expect(inFlightListing(listing, "10")).toEqual({ listed: true, customerId: false });
    expect(inFlightListing(listing, "70")).toEqual({ listed: false, customerId: false });
    expect(inFlightListing(null, "7")).toEqual({ listed: false, customerId: false });
  });

  it("counts the rows a refund listing links to one payment, and nothing else (X0 (g))", () => {
    const listing = { code: 200, message: "Success", data: [
      { id: 7, transactionType: "deposit", transactionStatus: "complete-ok", amount: "1.00" },
      { id: 8, transactionType: "refund", transactionStatus: "complete-ok", amount: "0.40", relatedTransactionIds: [7] },
      { id: 9, transactionType: "refund", transactionStatus: "complete-ok", amount: "0.30", relatedTransactionIds: ["7"] },
      { id: 10, transactionType: "refund", transactionStatus: "complete-ok", amount: "0.50", relatedTransactionIds: [70] },
      // The payment itself, listed again under its refund date, never counts as one of its own refunds.
      { id: 7, transactionType: "deposit", transactionStatus: "refund-ok", relatedTransactionIds: [7] }
    ] };
    expect(linkedRefundRows(listing, "7").map((row) => row.id)).toEqual([8, 9]);
    expect(linkedRefundRows({ code: 200, message: "Success", data: {} }, "7")).toEqual([]);
    expect(linkedRefundRows(null, "7")).toEqual([]);
  });
});

describe("W13 X0 records each daily listing the money check asks for (P2-I18)", () => {
  it("names a required kind for every --date-type it takes, and refuses any other", () => {
    for (const dateType of ["creation", "refund", "charge-back"]) {
      const { kind } = transactionListCapture(dateType);
      expect(XMONEY_REQUIRED_FIXTURE_KINDS as readonly string[], dateType).toContain(kind);
    }
    expect(transactionListCapture("creation").kind).toBe("transaction-list");
    expect(transactionListCapture("refund").kind).toBe("transaction-list-refund");
    expect(transactionListCapture("charge-back").kind).toBe("transaction-list-charge-back");
    for (const dateType of ["approval", "cancellation", "chargeback", ""]) {
      expect(() => transactionListCapture(dateType), dateType).toThrow("XMONEY_ARGUMENT_REQUIRED:--date-type");
    }
  });

  it("asks the charge-back listing over the daily check's own window: the last 120 days, up to now", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    const window = transactionListCapture("charge-back").defaultWindow(now);
    expect(window).toEqual({ from: "2026-06-12T12:00:00+00:00", to: "2026-10-10T12:00:00+00:00" });
    // The creation and refund listings keep X0's first window: a week back, a day ahead.
    expect(transactionListCapture("refund").defaultWindow(now))
      .toEqual({ from: "2026-10-03T12:00:00+00:00", to: "2026-10-11T12:00:00+00:00" });
  });
});
