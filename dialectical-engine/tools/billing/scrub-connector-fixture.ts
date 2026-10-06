// tools/billing/scrub-connector-fixture.ts
// P4/P5 (paid plans): turns an OWNER-RUN connector capture (record-connector.ts) into committable fixtures, one per
// step: tests/fixtures/<connector>/<step>.json. The rules are STATELESS and idempotent, so a replay can scrub what a
// client sends today with the same function and compare it with the recording. Field names, statuses, amounts, rate
// text and document numbers are kept — they are what the fixtures exist to pin.
//   pnpm exec tsx tools/billing/scrub-connector-fixture.ts --capture <capture file> --out tests/fixtures/<connector> \
//     --recorded-on 2026-10-02 [--secret <a VAT id, CIF or e-mail to erase>]…
// A secret is erased wherever it appears, also inside a longer text (a booked invoice may echo the buyer's VAT id in a
// sentence), and a VAT id given with its two country letters (DE811569869) is also erased without them (811569869).
// Afterwards, search every fixture for the id with AND without its country letters.
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
/**
 * P2-M31: a document's own link (SmartBill's `url`, `documentUrl` and `documentViewUrl`; Quaderno's `permalink` and
 * `pdf`) carries the document's access token in its path or query, so rewriting the host is not enough: the whole
 * link becomes one neutral https address (still a link, so a client that reads it reads one on replay too).
 */
const DOCUMENT_LINK_KEYS: ReadonlySet<string> = new Set(["url", "documenturl", "documentviewurl", "permalink", "pdf"]);
const DOCUMENT_LINK_PLACEHOLDER = "https://document.test/SCRUBBED";
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

/** A VAT id's two country letters and what follows (at least six characters, with a digit): DE811569869 -> 811569869. */
const COUNTRY_PREFIXED_ID = /^[A-Za-z]{2}([0-9A-Za-z+*]{6,})$/u;
/** At most this many erasing rounds; a text still changing after them (a pathological secret list) is refused. */
const SECRET_ROUNDS = 8;

/** Every form of the secrets to erase, longest first; an empty one, or one inside the placeholder, would never settle. */
function secretForms(secrets: ReadonlyArray<string>): string[] {
  const forms = new Set<string>();
  for (const secret of secrets) {
    forms.add(secret);
    const bare = COUNTRY_PREFIXED_ID.exec(secret)?.[1];
    if (bare !== undefined && /[0-9]/u.test(bare)) forms.add(bare);
  }
  return [...forms].filter((form) => form.length > 0 && !SECRET_PLACEHOLDER.includes(form))
    .sort((left, right) => right.length - left.length);
}

/**
 * Replaces every occurrence of every secret form with the placeholder, repeating until nothing changes, so a second
 * pass with the same secrets changes nothing (idempotent). Stateless: the result depends only on the inputs.
 */
function eraseSecrets(value: string, forms: ReadonlyArray<string>): string {
  let current = value;
  for (let round = 0; round < SECRET_ROUNDS; round += 1) {
    const next = forms.reduce((text, form) => text.split(form).join(SECRET_PLACEHOLDER), current);
    if (next === current) return current;
    current = next;
  }
  throw new TypeError("CONNECTOR_SECRET_SCRUB_UNSTABLE");
}

export function scrubConnectorValue(value: unknown, secrets: ReadonlyArray<string>, key = ""): unknown {
  return scrubWith(value, secretForms(secrets), key);
}

function scrubWith(value: unknown, forms: ReadonlyArray<string>, key: string): unknown {
  const name = key.toLowerCase();
  if (Array.isArray(value)) return value.map((item) => scrubWith(item, forms, ""));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, scrubWith(child, forms, childKey)]));
  }
  if (typeof value !== "string") return value;
  // The secrets first, wherever they appear; the field rules below then see the erased text (so a second pass agrees).
  const text = eraseSecrets(value, forms);
  if (NAME_KEYS.has(name)) return NAME_KEYS.get(name)!;
  if (SCRUBBED_KEYS.has(name)) return "SCRUBBED";
  if (DOCUMENT_LINK_KEYS.has(name)) return DOCUMENT_LINK_PLACEHOLDER;
  if (EMAIL.test(text)) return text.endsWith("@example.test") ? text : "person@example.test";
  if (IPV4.test(text)) return "203.0.113.10";
  for (const host of ACCOUNT_HOSTS) {
    if (host.pattern.test(text)) return text.replace(host.pattern, host.replacement);
  }
  return text;
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
