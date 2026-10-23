/**
 * Preview practice: what a reply may carry into a report.
 *
 * Plain words: the practice sends only our own fixed questions, so a reply is our own practice content. A model can
 * still echo anything, so before any reply text enters report.json every key-shaped string is blanked, and a reply
 * longer than 64 KiB keeps its head and its tail with a marker in between. No digest of a blanked value is kept:
 * the marker names only the kind of thing that was blanked.
 */

/** The longest reply text a report keeps (UTF-8 bytes), head and tail together. */
export const PRACTICE_REPLY_CAP_BYTES = 64 * 1024;

type Rule = Readonly<{ kind: string; pattern: RegExp }>;

/**
 * Order matters: the specific shapes first, so a PEM block or a bearer header is named for what it is before the
 * generic long-run rule could catch part of it.
 */
const SPECIFIC_RULES: readonly Rule[] = Object.freeze([
  { kind: "pem", pattern: /-----BEGIN [A-Z0-9 ]{1,64}-----[\s\S]*?-----END [A-Z0-9 ]{1,64}-----/gu },
  { kind: "bearer", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gu },
  { kind: "authorization", pattern: /\b(?:Authorization|x-api-key|x-goog-api-key)\s*[:=]\s*[^\s"',;]{4,}/giu },
  { kind: "vendor-key", pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}/gu },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu },
  {
    kind: "named-secret",
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd)\b\s*["']?\s*[:=]\s*["']?[^\s"',;]{4,}/giu
  }
]);

/** Any long unbroken run: catches an unknown key shape, but also every UUID and fingerprint. */
const GENERIC_RULES: readonly Rule[] = Object.freeze([
  { kind: "long-run", pattern: /[A-Za-z0-9_-]{32,}/gu },
  { kind: "long-hex", pattern: /\b[0-9a-fA-F]{32,}\b/gu }
]);

const RULES: readonly Rule[] = Object.freeze([...SPECIFIC_RULES, ...GENERIC_RULES]);

/** Blanks every key-shaped string. Ordinary prose, model ids and short identifiers are left as they are. */
export function redactKeyShapes(text: string): string {
  let out = text;
  for (const rule of RULES) out = out.replace(rule.pattern, `[REDACTED:${rule.kind}]`);
  return out;
}

/**
 * The transcript's safety net (practice-transcript.ts): blanks only the named key shapes (PEM block, bearer header,
 * authorization header, vendor key, JWT, `secret=`-style pair) and counts what it blanked, by kind. The two generic
 * rules are left out on purpose: a transcript is made of run, attempt and node ids (UUIDs) and prompt fingerprints,
 * and those rules would blank every one of them, so they would say "changed" on every file and hide a real hit.
 */
export function redactNamedKeyShapes(text: string): Readonly<{ text: string; blanked: Readonly<Record<string, number>> }> {
  let out = text;
  const blanked: Record<string, number> = {};
  for (const rule of SPECIFIC_RULES) {
    out = out.replace(rule.pattern, () => {
      blanked[rule.kind] = (blanked[rule.kind] ?? 0) + 1;
      return `[REDACTED:${rule.kind}]`;
    });
  }
  return Object.freeze({ text: out, blanked: Object.freeze(blanked) });
}

/** Keeps at most `capBytes` UTF-8 bytes: the head and the tail, with a marker naming how much was left out. */
export function capReplyText(text: string, capBytes: number = PRACTICE_REPLY_CAP_BYTES): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.byteLength <= capBytes) return text;
  const half = Math.floor((capBytes - 64) / 2);
  // toString on a cut multi-byte sequence yields U+FFFD, never an exception; trim those edges away.
  const head = bytes.subarray(0, half).toString("utf8").replace(/�+$/u, "");
  const tail = bytes.subarray(bytes.byteLength - half).toString("utf8").replace(/^�+/u, "");
  const omitted = bytes.byteLength - Buffer.byteLength(head, "utf8") - Buffer.byteLength(tail, "utf8");
  return `${head}\n[... ${String(omitted)} bytes left out ...]\n${tail}`;
}

/**
 * Final fix wave S14 — THE COMMON RULE for an owner-typed detail in a code (`CODE:detail[:detail…]`), the same rule the
 * runner's settings journal lines (apps/runner/src/index.ts `settingsJournalCode`) and the native operator's
 * THINKING_REFUSAL pass-through apply, so the three places stay aligned. The detail is key-shaped when it holds an
 * unbroken run of 24+ letters and digits, a `//` (a socket or URL path) or a vendor `sk-` prefix.
 */
const SETTINGS_DETAIL_KEY_SHAPED = /[A-Za-z0-9]{24,}|\/\/|\bsk-/u;
/** Final fix wave S14: one detail part a code may name whole (a model id, a step or level word, a row key). */
const SETTINGS_DETAIL_PART = /^[A-Za-z0-9_.\/-]{1,64}$/u;

/**
 * Final fix wave S14: the code printed whole only when every detail part is plainly an id and the detail is not
 * key-shaped; otherwise the bare code (the part before the first ':'), and nothing of the detail.
 */
export function printableSettingsCode(code: string): string {
  const colon = code.indexOf(":");
  if (colon === -1) return code;
  const detail = code.slice(colon + 1);
  const plain = detail.split(":").every((part) => SETTINGS_DETAIL_PART.test(part)) && !SETTINGS_DETAIL_KEY_SHAPED.test(detail);
  return plain ? code : code.slice(0, colon);
}

/** The one function every reply text goes through before it enters a report. */
export function reportableReplyText(text: string, capBytes: number = PRACTICE_REPLY_CAP_BYTES): string {
  return capReplyText(redactKeyShapes(text), capBytes);
}
