// tools/billing/scrub-connector-fixture.ts
// P4/P5 (paid plans): turns an OWNER-RUN connector capture (record-connector.ts) into committable fixtures, one per
// step: tests/fixtures/<connector>/<step>.json. The rules are STATELESS and idempotent, so a replay can scrub what a
// client sends today with the same function and compare it with the recording. Field names, statuses, amounts, rate
// text and document numbers are kept — they are what the fixtures exist to pin.
//   pnpm exec tsx tools/billing/scrub-connector-fixture.ts --capture <capture file> --out tests/fixtures/<connector> \
//     --recorded-on 2026-10-02 [--secret <a VAT id, CIF or e-mail to erase>]…
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectorCapture, RecordedExchange } from "./record-connector.js";

export const CONNECTOR_FIXTURE_FORMATS = Object.freeze({
  quaderno: "debateai.quaderno-fixture.v1",
  smartbill: "debateai.smartbill-fixture.v1"
} as const);

export type ConnectorFixture = Readonly<{
  format: string; connector: ConnectorCapture["connector"]; step: string; recordedOn: string; outcome: string;
  exchanges: ReadonlyArray<RecordedExchange>;
}>;

const SECRET_PLACEHOLDER = "SCRUBBED-ID";
const NAME_KEYS: ReadonlyMap<string, string> = new Map([
  ["first_name", "Test"], ["last_name", "Person"], ["full_name", "Test Person"], ["contact_name", "Test Person"]
]);
/** Personal or account fields a provider may echo; our own recording inputs are synthetic anyway. */
const SCRUBBED_KEYS: ReadonlySet<string> = new Set([
  "street_line_1", "street_line_2", "address", "phone", "phone_1", "business_name", "legal_name", "company_name", "web"
]);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
/** An account's own host (https://<account>.quadernoapp.com, *.smartbill.ro) is rewritten to a neutral one. */
const ACCOUNT_HOSTS: ReadonlyArray<Readonly<{ pattern: RegExp; replacement: string }>> = Object.freeze([
  { pattern: /^https:\/\/[a-z0-9-]+\.sandbox-quadernoapp\.com/u, replacement: "https://account.sandbox-quadernoapp.test" },
  { pattern: /^https:\/\/[a-z0-9-]+\.quadernoapp\.com/u, replacement: "https://account.quadernoapp.test" },
  { pattern: /^https:\/\/[a-z0-9.-]*smartbill\.ro/u, replacement: "https://smartbill.test" }
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scrubConnectorValue(value: unknown, secrets: ReadonlyArray<string>, key = ""): unknown {
  const name = key.toLowerCase();
  if (Array.isArray(value)) return value.map((item) => scrubConnectorValue(item, secrets));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, scrubConnectorValue(child, secrets, childKey)]));
  }
  if (typeof value !== "string") return value;
  if (secrets.includes(value)) return SECRET_PLACEHOLDER;
  if (NAME_KEYS.has(name)) return NAME_KEYS.get(name)!;
  if (SCRUBBED_KEYS.has(name)) return "SCRUBBED";
  if (EMAIL.test(value)) return value.endsWith("@example.test") ? value : "person@example.test";
  if (IPV4.test(value)) return "203.0.113.10";
  for (const host of ACCOUNT_HOSTS) {
    if (host.pattern.test(value)) return value.replace(host.pattern, host.replacement);
  }
  return value;
}

export function writeConnectorFixtures(input: Readonly<{
  capturePath: string; outDir: string; recordedOn: string; secrets: ReadonlyArray<string>;
}>): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.recordedOn)) throw new TypeError("CONNECTOR_RECORDED_ON_INVALID");
  const capture = JSON.parse(readFileSync(input.capturePath, "utf8")) as ConnectorCapture;
  if (capture.format !== "debateai.connector-capture.v1") throw new TypeError("CONNECTOR_CAPTURE_FORMAT_UNKNOWN");
  const format = CONNECTOR_FIXTURE_FORMATS[capture.connector];
  if (format === undefined) throw new TypeError("CONNECTOR_CAPTURE_FORMAT_UNKNOWN");
  const written: string[] = [];
  for (const step of capture.steps) {
    if (!/^[a-z0-9-]{1,64}$/u.test(step.step)) throw new TypeError("CONNECTOR_STEP_NAME_INVALID");
    const fixture: ConnectorFixture = {
      format, connector: capture.connector, step: step.step, recordedOn: input.recordedOn, outcome: step.outcome,
      exchanges: scrubConnectorValue(step.exchanges, input.secrets) as ReadonlyArray<RecordedExchange>
    };
    const target = `${step.step}.json`;
    writeFileSync(join(input.outDir, target), `${JSON.stringify(fixture, null, 2)}\n`);
    written.push(target);
  }
  return written;
}

function values(argv: readonly string[], name: string): string[] {
  return argv.flatMap((entry, index) => (entry === name && argv[index + 1] !== undefined ? [argv[index + 1]!] : []));
}

function argument(argv: readonly string[], name: string): string {
  const found = values(argv, name)[0];
  if (found === undefined || found.startsWith("--")) throw new TypeError(`CONNECTOR_ARGUMENT_REQUIRED:${name}`);
  return found;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const written = writeConnectorFixtures({
    capturePath: argument(argv, "--capture"), outDir: argument(argv, "--out"),
    recordedOn: argument(argv, "--recorded-on"), secrets: values(argv, "--secret")
  });
  console.log(`CONNECTOR_FIXTURES_WRITTEN=${written.join(",")}`);
}
