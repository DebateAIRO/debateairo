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
const RULES: readonly Rule[] = Object.freeze([
  { kind: "pem", pattern: /-----BEGIN [A-Z0-9 ]{1,64}-----[\s\S]*?-----END [A-Z0-9 ]{1,64}-----/gu },
  { kind: "bearer", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gu },
  { kind: "authorization", pattern: /\b(?:Authorization|x-api-key|x-goog-api-key)\s*[:=]\s*[^\s"',;]{4,}/giu },
  { kind: "vendor-key", pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}/gu },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu },
  {
    kind: "named-secret",
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd)\b\s*["']?\s*[:=]\s*["']?[^\s"',;]{4,}/giu
  },
  { kind: "long-run", pattern: /[A-Za-z0-9_-]{32,}/gu },
  { kind: "long-hex", pattern: /\b[0-9a-fA-F]{32,}\b/gu }
]);

/** Blanks every key-shaped string. Ordinary prose, model ids and short identifiers are left as they are. */
export function redactKeyShapes(text: string): string {
  let out = text;
  for (const rule of RULES) out = out.replace(rule.pattern, `[REDACTED:${rule.kind}]`);
  return out;
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

/** The one function every reply text goes through before it enters a report. */
export function reportableReplyText(text: string, capBytes: number = PRACTICE_REPLY_CAP_BYTES): string {
  return capReplyText(redactKeyShapes(text), capBytes);
}
