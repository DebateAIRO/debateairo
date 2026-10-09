// tools/billing/scrub-netopia-fixture.ts
// N22 (spec 2026-10-05 §2.20.3): turns the owner's raw NETOPIA captures into scrubbed, committable fixtures. OWNER-RUN:
//   pnpm exec tsx tools/billing/scrub-netopia-fixture.ts --capture-dir <dir> --out tests/fixtures/netopia --recorded-on 2026-10-08
// Standalone on purpose: it must not share code with the package its fixtures test. Every number keeps its own digits (a
// small JSON reader of its own), so "1.00" stays "1.00" and the recorded suite can pin the amount's unit.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const NETOPIA_CAPTURE_FORMAT = "debateai.netopia-capture.v1";
export const NETOPIA_FIXTURE_FORMAT = "debateai.netopia-fixture.v1";
/** Every complete recording holds these (the recorded suite fails naming any that is missing). */
export const NETOPIA_REQUIRED_FIXTURE_KINDS = Object.freeze([
  "start-request", "start-answer", "notice-start", "status-answer", "status-answer-without-ntp-id", "status-no-such-order",
  "zero-request", "zero-answer", "notice-zero", "charge-request", "charge-answer", "notice-charge"
] as const);
/** Recorded only when NETOPIA produces them: a declined or reused-order charge, its follow-up status read. */
export const NETOPIA_OPTIONAL_FIXTURE_KINDS = Object.freeze(["charge-answer-declined", "charge-answer-56", "charge-followup-answer"] as const);
/** A made-up POS signature in NETOPIA's shape, built from pieces (the leak scanner reads long key-like strings). */
export const SCRUBBED_POS_SIGNATURE = ["FAKE", "P0S0", "0000", "0000", "0000"].join("-");

const RUN = "(?:start|zero|charge)(?:-client-id-instrument)?(?:-installments-1)?";
const KIND = new RegExp(`^(?:${RUN}-(?:request|answer|answer-error|answer-declined|answer-56|followup-answer)|notice-${RUN}(?:-[0-9]{1,2})?|status-answer|status-answer-without-ntp-id|status-no-such-order)$`, "u");
export function knownFixtureKind(kind: string): boolean {
  return KIND.test(kind);
}

/** A raw capture as read from the owner's folder: every field is checked before it is used (`environment` included). */
export type NetopiaCapture = Readonly<{
  format: string; kind: string; environment: string; recordedAt: string; httpStatus: number | null; contentType: string | null; bodyText: string;
}>;
export type NetopiaFixture = Readonly<{
  format: typeof NETOPIA_FIXTURE_FORMAT; kind: string; environment: "sandbox" | "live"; recordedOn: string;
  httpStatus: number | null; contentType: string | null; bodyText: string;
}>;

/* A JSON tree that keeps every number's source text and every object's member order. */
type Node =
  | Readonly<{ t: "object"; members: Array<[string, Node]> }> | Readonly<{ t: "array"; items: Node[] }>
  | Readonly<{ t: "string"; value: string }> | Readonly<{ t: "number"; text: string }> | Readonly<{ t: "literal"; text: "true" | "false" | "null" }>;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy;
const STRING = /"(?:[^"\\\u0000-\u001f]|\\.)*"/uy;
const SPACE = /[ \t\r\n]*/uy;

function readJson(text: string): Node {
  let at = 0;
  const skip = (): void => { SPACE.lastIndex = at; SPACE.exec(text); at = SPACE.lastIndex; };
  const fail = (): never => { throw new TypeError("NETOPIA_SCRUB_NOT_JSON"); };
  const value = (): Node => {
    skip();
    const char = text[at];
    if (char === "{") {
      at += 1; const members: Array<[string, Node]> = []; skip();
      if (text[at] === "}") { at += 1; return { t: "object", members }; }
      for (;;) {
        skip(); const key = value(); if (key.t !== "string") fail();
        skip(); if (text[at] !== ":") fail(); at += 1;
        members.push([(key as { value: string }).value, value()]); skip();
        if (text[at] === ",") { at += 1; continue; }
        if (text[at] === "}") { at += 1; return { t: "object", members }; }
        fail();
      }
    }
    if (char === "[") {
      at += 1; const items: Node[] = []; skip();
      if (text[at] === "]") { at += 1; return { t: "array", items }; }
      for (;;) {
        items.push(value()); skip();
        if (text[at] === ",") { at += 1; continue; }
        if (text[at] === "]") { at += 1; return { t: "array", items }; }
        fail();
      }
    }
    if (char === "\"") {
      STRING.lastIndex = at; const match = STRING.exec(text); if (match === null) fail();
      at = STRING.lastIndex; return { t: "string", value: JSON.parse(match![0]) as string };
    }
    for (const literal of ["true", "false", "null"] as const) if (text.startsWith(literal, at)) { at += literal.length; return { t: "literal", text: literal }; }
    NUMBER.lastIndex = at; const number = NUMBER.exec(text); if (number === null) fail();
    at = NUMBER.lastIndex; return { t: "number", text: number![0] };
  };
  const root = value(); skip();
  if (at !== text.length) fail();
  return root;
}

function writeJson(node: Node): string {
  if (node.t === "object") return `{${node.members.map(([key, member]) => `${JSON.stringify(key)}:${writeJson(member)}`).join(",")}}`;
  if (node.t === "array") return `[${node.items.map(writeJson).join(",")}]`;
  if (node.t === "string") return JSON.stringify(node.value);
  return node.text;
}

/** Digits → 0 and letters → X: the value's shape stays, the value goes. */
const shapeOf = (value: string): string => value.replace(/[0-9]/gu, "0").replace(/[A-Za-z]/gu, "X");
const FIXED: Readonly<Record<string, string>> = Object.freeze({
  firstname: "Test", lastname: "Payer", email: "payer@example.test", phone: "+40700000000", city: "Test City",
  state: "Test Region", details: "Test Street 1", issuer: "TEST BANK", ip_address: "192.0.2.1"
});
const SHAPED: ReadonlySet<string> = new Set(["postalcode", "bin", "rrn", "authcode"]);
const URL_KEYS: ReadonlySet<string> = new Set(["notifyurl", "redirecturl", "returnurl", "cancelurl"]);
const POS_KEYS: ReadonlySet<string> = new Set(["possignature", "posid"]);
/** Shorter originals are never checked for leftovers (a city like "Iasi" could match NETOPIA's own words). */
const LEFTOVER_MIN = 5;

export class NetopiaScrubber {
  readonly #tokens = new Map<string, string>();

  scrub(bodyText: string): string {
    const originals = new Map<string, string>();
    const scrubbed = writeJson(this.#node(readJson(bodyText), null, false, originals));
    for (const [original, key] of originals) if (original.length >= LEFTOVER_MIN && scrubbed.includes(original)) throw new TypeError(`NETOPIA_SCRUB_LEFT_A_VALUE:${key}`);
    return scrubbed;
  }

  /**
   * `inFormData`: below a `formData` member (NETOPIA's 3-D Secure customerAction.formData, e.g. paReq and MD). NETOPIA's
   * OpenAPI says that data must not be stored and no code of ours reads it, so every string there keeps only its shape.
   */
  #node(node: Node, key: string | null, inFormData: boolean, originals: Map<string, string>): Node {
    if (node.t === "object") {
      return { t: "object", members: node.members.map(([name, member]) => [name, this.#node(member, name, inFormData || name.toLowerCase() === "formdata", originals)]) };
    }
    if (node.t === "array") return { t: "array", items: node.items.map((item) => this.#node(item, key, inFormData, originals)) };
    const name = (key ?? "").toLowerCase();
    if (name === "expiremonth" || name === "expmonth") return node.t === "string" ? { t: "string", value: "12" } : { t: "number", text: "12" };
    if (name === "expireyear" || name === "expyear") return node.t === "string" ? { t: "string", value: "2030" } : { t: "number", text: "2030" };
    if (node.t !== "string") return node;
    const value = node.value;
    const keep = (replacement: string): Node => { if (value !== replacement) originals.set(value, key ?? ""); return { t: "string", value: replacement }; };
    if (inFormData) return keep(shapeOf(value));
    // Any key holding "token" (token, Token, cardToken, token_id, customerAction.authenticationToken, …): spec §2.2 rule 5.
    if (name.includes("token")) return keep(this.#token(value));
    if (POS_KEYS.has(name)) return keep(SCRUBBED_POS_SIGNATURE);
    if (FIXED[name] !== undefined) return keep(FIXED[name]!);
    if (SHAPED.has(name)) return keep(shapeOf(value));
    if (name === "panmasked") return keep(value.replace(/[0-9]/gu, "1"));
    if (URL_KEYS.has(name)) return keep(this.#ourUrl(value));
    if (name === "paymenturl") return keep(this.#pageUrl(value));
    return node;
  }

  #token(value: string): string {
    const known = this.#tokens.get(value);
    if (known !== undefined) return known;
    const fake = `fake-token-${this.#tokens.size + 1}`;
    this.#tokens.set(value, fake);
    return fake;
  }

  #ourUrl(value: string): string {
    try { const url = new URL(value); return `https://debateai.example${url.pathname}${url.search}`; } catch { return "https://debateai.example/"; }
  }

  #pageUrl(value: string): string {
    try { const url = new URL(value); return `${url.origin}${url.pathname}${url.search === "" ? "" : "?p=SCRUBBED"}`; } catch { return "https://invalid.example/"; }
  }
}

const RECORDED_ON = /^\d{4}-\d{2}-\d{2}$/u;

export function scrubCapture(capture: NetopiaCapture, scrubber: NetopiaScrubber, recordedOn: string): NetopiaFixture {
  const environment = capture.environment;
  if (capture.format !== NETOPIA_CAPTURE_FORMAT || typeof capture.bodyText !== "string" || (environment !== "sandbox" && environment !== "live")) {
    throw new TypeError("NETOPIA_SCRUB_CAPTURE_INVALID");
  }
  if (!knownFixtureKind(capture.kind)) throw new TypeError("NETOPIA_SCRUB_KIND_UNKNOWN");
  if (!RECORDED_ON.test(recordedOn)) throw new TypeError("NETOPIA_SCRUB_RECORDED_ON_INVALID");
  return Object.freeze({
    format: NETOPIA_FIXTURE_FORMAT, kind: capture.kind, environment, recordedOn,
    httpStatus: capture.httpStatus, contentType: capture.contentType, bodyText: scrubbedBody(capture.bodyText, scrubber)
  });
}

/**
 * A body that is not JSON (an HTTP 404 or 405 with an empty or HTML page, which NETOPIA's own clients treat as distinct
 * cases) is kept only as a fixed marker of its length: not one original character, so nothing personal or secret can
 * survive, and the rest of the recording is still written. The fixture's httpStatus and contentType carry the facts.
 */
function scrubbedBody(bodyText: string, scrubber: NetopiaScrubber): string {
  try {
    return scrubber.scrub(bodyText);
  } catch (error) {
    if (error instanceof TypeError && error.message === "NETOPIA_SCRUB_NOT_JSON") return `[not JSON: ${bodyText.length} characters]`;
    throw error;
  }
}

export type ScrubberOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;

/** `--capture-dir D --out O --recorded-on YYYY-MM-DD`: one fixture per kind (the newest capture of a kind wins). */
export function runNetopiaScrubber(argv: readonly string[], output: ScrubberOutput): number {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === undefined || value === undefined || !["--capture-dir", "--out", "--recorded-on"].includes(name) || values.has(name)) {
      output.stderr("NETOPIA_SCRUB_USAGE\n");
      return 2;
    }
    values.set(name, value);
  }
  const captureDir = values.get("--capture-dir");
  const out = values.get("--out");
  const recordedOn = values.get("--recorded-on");
  if (captureDir === undefined || out === undefined || recordedOn === undefined) {
    output.stderr("NETOPIA_SCRUB_USAGE\n");
    return 2;
  }
  try {
    const newest = new Map<string, NetopiaCapture>();
    for (const name of readdirSync(captureDir).filter((entry) => entry.endsWith(".json") && !entry.startsWith("state-"))) {
      const capture = JSON.parse(readFileSync(join(captureDir, name), "utf8")) as NetopiaCapture;
      const seen = newest.get(capture.kind);
      if (seen === undefined || capture.recordedAt > seen.recordedAt) newest.set(capture.kind, capture);
    }
    const scrubber = new NetopiaScrubber();
    mkdirSync(out, { recursive: true });
    for (const capture of [...newest.values()].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
      const fixture = scrubCapture(capture, scrubber, recordedOn);
      writeFileSync(join(out, `${fixture.kind}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    }
    output.stdout(`NETOPIA_FIXTURES_WRITTEN=${newest.size}\n`);
    return 0;
  } catch (error) {
    output.stderr(`${error instanceof TypeError && /^NETOPIA_SCRUB_[A-Z_]+(?::[A-Za-z0-9_]+)?$/u.test(error.message) ? error.message : "NETOPIA_SCRUB_FAILED"}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runNetopiaScrubber(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text)
  });
}
