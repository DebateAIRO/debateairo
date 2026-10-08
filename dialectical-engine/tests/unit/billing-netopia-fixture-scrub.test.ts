// tests/unit/billing-netopia-fixture-scrub.test.ts
// N22 (spec 2026-10-05 §2.20.3): raw NETOPIA captures become committable fixtures with fixed fakes for every personal or
// secret value, keeping the shapes, the status numbers, the codes, NETOPIA's formats and every number's own digits.
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NETOPIA_CAPTURE_FORMAT, NETOPIA_FIXTURE_FORMAT, NETOPIA_OPTIONAL_FIXTURE_KINDS, NETOPIA_REQUIRED_FIXTURE_KINDS, NetopiaScrubber,
  SCRUBBED_POS_SIGNATURE, knownFixtureKind, runNetopiaScrubber, scrubCapture
} from "../../tools/billing/scrub-netopia-fixture.js";
import { NETOPIA_CAPTURE_FORMAT as TOOL_CAPTURE_FORMAT } from "../../tools/billing/netopia-sandbox.js";

const POS = ["RE41", "LPOS", "1234", "5678", "ABCD"].join("-");
const startRequest = JSON.stringify({
  config: { emailTemplate: "", notifyUrl: "https://test.dezbatere.ro/api/v1/billing/netopia/notify", redirectUrl: "https://test.dezbatere.ro/", language: "ro" },
  payment: { options: { installments: 0, bonus: 0 }, instrument: { type: "card" } },
  order: { ntpID: "", posSignature: POS, dateTime: "2026-10-08T10:00:00Z", description: "DebateAI sandbox recording", orderID: `t-${"a".repeat(30)}`,
    amount: 1, currency: "USD", clientID: "c".repeat(32), billing: { email: "stefan.real@example.org", phone: "+40722333444", firstName: "Stefan",
      lastName: "Realname", city: "Iasi", country: 642, countryName: "Romania", state: "Iasi", postalCode: "700259", details: "Strada Reala 12" } }
}).replace('"amount":1,', '"amount":1.00,');
const notice = '{"payment":{"method":"card","ntpID":"1234567","status":3,"amount":1.00,"currency":"USD","token":"[token]",'
  + '"binding":{"token":"[token]","expireMonth":11,"expireYear":2029},"instrument":{"panMasked":"411111******1234","issuer":"Banca Reala","country":642},'
  + '"data":{"BIN":"411111","ISSUER":"Banca Reala SA","ISSUER_COUNTRY":"642","RRN":"615012345678","AuthCode":"A1B2C3","IP_ADDRESS":"86.120.1.2"},'
  + '"code":"00","message":"Tranzacție aprobată","operationDate":"2026-10-08T13:01:02+03:00"},"order":{"orderID":"t-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}';
const capture = (kind: string, bodyText: string) => ({
  format: NETOPIA_CAPTURE_FORMAT, kind, environment: "sandbox", recordedAt: "2026-10-08T10:00:00.000Z", httpStatus: 200, contentType: "application/json", bodyText
});

describe("N22 — the fixture vocabulary", () => {
  it("shares the capture format with the tool and knows every kind the tool writes", () => {
    expect(TOOL_CAPTURE_FORMAT).toBe(NETOPIA_CAPTURE_FORMAT);
    expect(NETOPIA_FIXTURE_FORMAT).toBe("debateai.netopia-fixture.v1");
    expect([...NETOPIA_REQUIRED_FIXTURE_KINDS]).toEqual(["start-request", "start-answer", "notice-start", "status-answer",
      "status-answer-without-ntp-id", "status-no-such-order", "zero-request", "zero-answer", "notice-zero", "charge-request", "charge-answer", "notice-charge"]);
    for (const kind of [...NETOPIA_REQUIRED_FIXTURE_KINDS, ...NETOPIA_OPTIONAL_FIXTURE_KINDS, "notice-start-2", "notice-charge-3",
      "start-client-id-instrument-installments-1-request", "notice-start-client-id-instrument", "charge-answer-error"]) expect(knownFixtureKind(kind), kind).toBe(true);
    for (const kind of ["notice", "start", "start-answer-x", "refund-answer"]) expect(knownFixtureKind(kind), kind).toBe(false);
    expect(SCRUBBED_POS_SIGNATURE).toMatch(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4}$/u);
  });
});

describe("N22 — NetopiaScrubber", () => {
  it("replaces the payer, the POS signature and our host, and keeps the amount's digits and NETOPIA's shapes", () => {
    const scrubbed = new NetopiaScrubber().scrub(startRequest);
    for (const original of [POS, "stefan.real@example.org", "+40722333444", "Stefan", "Realname", "Iasi", "700259", "Strada Reala 12", "test.dezbatere.ro"]) {
      expect(scrubbed, original).not.toContain(original);
    }
    expect(scrubbed).toContain('"amount":1.00,');
    const body = JSON.parse(scrubbed);
    expect(body.order).toMatchObject({ posSignature: SCRUBBED_POS_SIGNATURE, orderID: `t-${"a".repeat(30)}`, clientID: "c".repeat(32), currency: "USD" });
    expect(body.order.billing).toEqual({ email: "payer@example.test", phone: "+40700000000", firstName: "Test", lastName: "Payer", city: "Test City",
      country: 642, countryName: "Romania", state: "Test Region", postalCode: "000000", details: "Test Street 1" });
    expect(body.config.notifyUrl).toBe("https://debateai.example/api/v1/billing/netopia/notify");
  });

  it("replaces tokens, the card's details and the bank's references, keeping the status, the codes and the country", () => {
    const scrubber = new NetopiaScrubber();
    const scrubbed = scrubber.scrub(notice);
    for (const original of ["Banca Reala", "411111", "615012345678", "A1B2C3", "86.120.1.2", "1234\""]) expect(scrubbed, original).not.toContain(original);
    const body = JSON.parse(scrubbed);
    expect(body.payment).toMatchObject({ ntpID: "1234567", status: 3, currency: "USD", code: "00", message: "Tranzacție aprobată", operationDate: "2026-10-08T13:01:02+03:00" });
    expect(body.payment.token).toBe("fake-token-1");
    expect(body.payment.binding).toEqual({ token: "fake-token-1", expireMonth: 12, expireYear: 2030 });
    expect(body.payment.instrument).toEqual({ panMasked: "111111******1111", issuer: "TEST BANK", country: 642 });
    expect(body.payment.data).toEqual({ BIN: "000000", ISSUER: "TEST BANK", ISSUER_COUNTRY: "642", RRN: "000000000000", AuthCode: "X0X0X0", IP_ADDRESS: "192.0.2.1" });
    expect(scrubbed).toContain('"amount":1.00,');
  });

  it("keeps one fake per distinct token across a run, and replaces only the payment link's query", () => {
    const scrubber = new NetopiaScrubber();
    const a = JSON.parse(scrubber.scrub('{"payment":{"token":"tok-one-aaaa","binding":{"token":"tok-one-aaaa"}}}'));
    const b = JSON.parse(scrubber.scrub('{"payment":{"token":"tok-two-bbbb"},"x":{"token":"tok-one-aaaa"}}'));
    expect([a.payment.token, a.payment.binding.token, b.payment.token, b.x.token]).toEqual(["fake-token-1", "fake-token-1", "fake-token-2", "fake-token-1"]);
    const link = JSON.parse(scrubber.scrub('{"payment":{"paymentURL":"https://secure-sandbox.netopia-payments.com/ui/card?p=SECRETPAGE123"}}'));
    expect(link.payment.paymentURL).toBe("https://secure-sandbox.netopia-payments.com/ui/card?p=SCRUBBED");
  });

  it("refuses to write a body where a personal value survives under a key it does not know", () => {
    const leaky = '{"order":{"billing":{"email":"stefan.real@example.org"},"data":{"note":"stefan.real@example.org"}}}';
    expect(() => new NetopiaScrubber().scrub(leaky)).toThrow("NETOPIA_SCRUB_LEFT_A_VALUE:email");
    expect(() => new NetopiaScrubber().scrub("{not json")).toThrow("NETOPIA_SCRUB_NOT_JSON");
  });
});

describe("N22 — captures to fixtures", () => {
  it("turns a capture into a v1 fixture, and refuses an unknown kind or format", () => {
    const fixture = scrubCapture(capture("start-request", startRequest), new NetopiaScrubber(), "2026-10-08");
    expect(fixture).toMatchObject({ format: NETOPIA_FIXTURE_FORMAT, kind: "start-request", environment: "sandbox", recordedOn: "2026-10-08", httpStatus: 200 });
    expect(fixture.bodyText).not.toContain(POS);
    expect(() => scrubCapture(capture("refund-answer", "{}"), new NetopiaScrubber(), "2026-10-08")).toThrow("NETOPIA_SCRUB_KIND_UNKNOWN");
    expect(() => scrubCapture({ ...capture("start-request", "{}"), format: "other" }, new NetopiaScrubber(), "2026-10-08")).toThrow("NETOPIA_SCRUB_CAPTURE_INVALID");
  });

  it("writes one fixture per kind from a capture folder, the newest capture winning", () => {
    const dir = mkdtempSync(join(tmpdir(), "n22-scrub-in-"));
    chmodSync(dir, 0o700);
    const out = mkdtempSync(join(tmpdir(), "n22-scrub-out-"));
    writeFileSync(join(dir, "start-request-1.json"), JSON.stringify({ ...capture("start-request", startRequest), recordedAt: "2026-10-08T09:00:00.000Z" }));
    writeFileSync(join(dir, "start-request-2.json"), JSON.stringify({ ...capture("start-request", startRequest.replace("1.00", "2.00")), recordedAt: "2026-10-08T10:00:00.000Z" }));
    writeFileSync(join(dir, "notice-start-3.json"), JSON.stringify(capture("notice-start", notice)));
    writeFileSync(join(dir, "state-t-x.json"), "{}");
    const lines: string[] = [];
    expect(runNetopiaScrubber(["--capture-dir", dir, "--out", out, "--recorded-on", "2026-10-08"], { stdout: (text) => lines.push(text), stderr: (text) => lines.push(text) })).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["notice-start.json", "start-request.json"]);
    expect(readFileSync(join(out, "start-request.json"), "utf8")).toContain('"amount\\":2.00');
    expect(lines.join("")).toContain("NETOPIA_FIXTURES_WRITTEN=2");
    expect(runNetopiaScrubber(["--capture-dir", dir, "--out", out], { stdout: () => undefined, stderr: () => undefined })).toBe(2);
  });
});
