// apps/runner/src/web-page-text-gateway.ts
/**
 * WEB SEARCH: THE GATEWAY STEP THE WEB READERS NEED (Perplexity plan 2026-10-30, task W3-0; the owner's privacy rows).
 *
 * Plain words: a page's text is never copied into the records of the AI calls. It lives only in its own encrypted store
 * (identity.web_page_text, migration 0132), deleted on schedule. A reader's call record (`ledger.call_prompt`) names each
 * page by `webPageTextRef(pageId, textDigest)`; the gateway puts the texts in only for the vendor, just before each POST
 * (`ProviderCallRequest.vendorPacketOf`, packages/providers/src/sent-form.ts). This file holds the runner's two halves:
 *
 * - The keyed digest. `textDigest` is an HMAC-SHA-256 of the page's text under the run's own secret (the run content
 *   lease's attestation secret, `databaseAttestationSecret`), never a plain hash: a plain hash of public text would tell
 *   anyone holding the call record which page was read. Erasing the run's secret makes every digest unlinkable.
 * - The sent form from the store (`storedWebPageTextsSentForm`). For a call made after a restart (a resumed run), or for
 *   any call whose texts the caller does not hold, the texts are read back from the store just before the POST, opened
 *   under the run's lease, and their digests checked against the references. A page whose text was wiped (or never
 *   kept) refuses the call cleanly, before anything is sent or recorded (WEB_PAGE_TEXT_WIPED, naming the pages, so W4-2
 *   can fetch them again); a text whose digest does not match its reference refuses it too (WEB_PAGE_TEXT_CHANGED).
 *
 * How a caller uses it (W3-1): build the reader's request with `packet` = the reader's packet (the references) and
 * `vendorPacketOf` = reader 1's own `vendorPacketOf`, or `(packet) => packetWithPageTexts(packet, pageTexts)` for readers 2
 * and 3, or this file's `storedWebPageTextsSentForm(...)`; set `sentInputTokensBelow: 100_000` for Haiku's line. A
 * replayed call (run-replay.ts) is answered from its record, matched on the reference form, and sends nothing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { webPageTextRef, type CryptoEnvelope } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { packetWithPageTexts, type PromptPacket } from "@debateai/providers";

/** The digest's own domain, so the run's secret never signs the same bytes for two purposes. */
export const WEB_PAGE_TEXT_DIGEST_DOMAIN = "debateai:web-page-text:keyed-digest:v1\0" as const;
export const WEB_PAGE_TEXT_WIPED = "WEB_PAGE_TEXT_WIPED" as const;
export const WEB_PAGE_TEXT_CHANGED = "WEB_PAGE_TEXT_CHANGED" as const;
/** The store reads at most this many pages at once (`identity.read_web_page_texts`). */
const STORE_READ_PAGES_MAX = 64;

/** The keyed digest of one page's text: HMAC-SHA-256 under `secret` (at least 32 bytes) over the domain, page id and text. */
export function webPageTextDigest(secret: Buffer, pageId: string, text: string): Buffer {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new TypeError("WEB_PAGE_TEXT_DIGEST_KEY_INVALID");
  if (typeof pageId !== "string" || pageId === "" || typeof text !== "string") throw new TypeError("WEB_PAGE_TEXT_DIGEST_INPUT_INVALID");
  return createHmac("sha256", secret)
    .update(WEB_PAGE_TEXT_DIGEST_DOMAIN, "utf8").update(pageId, "utf8").update("\0", "utf8").update(text, "utf8")
    .digest();
}

/** The run's own secret, as the run content lease hands it out (a fresh copy each time). */
export type WebPageTextDigestKey = Readonly<{ databaseAttestationSecret: () => Buffer }>;

/** The digest under the run's own secret; the secret's copy is wiped once used. */
export function runWebPageTextDigest(lease: WebPageTextDigestKey, pageId: string, text: string): Buffer {
  const secret = lease.databaseAttestationSecret();
  try {
    return webPageTextDigest(secret, pageId, text);
  } finally {
    secret.fill(0);
  }
}

/** A page reference as it stands in a packet: `web-page-text:<page id>@<64 hex digits>`. */
const PAGE_TEXT_REF = /web-page-text:([^\s"\\@]+)@([0-9a-f]{64})/gu;
export type WebPageTextRefFound = Readonly<{ ref: string; pageId: string; textDigest: Buffer }>;

/** Every page reference a packet holds, each once, in the order first found. */
export function webPageTextRefsIn(packet: PromptPacket): readonly WebPageTextRefFound[] {
  const found = new Map<string, WebPageTextRefFound>();
  for (const message of packet.messages) {
    for (const match of message.content.matchAll(PAGE_TEXT_REF)) {
      const [ref, pageId, hex] = match as unknown as [string, string, string];
      const textDigest = Buffer.from(hex, "hex");
      if (found.has(ref) || webPageTextRef(pageId, textDigest) !== ref) continue;
      found.set(ref, Object.freeze({ ref, pageId, textDigest }));
    }
  }
  return Object.freeze([...found.values()]);
}

/** The pages whose text is gone from the store: the call is refused, and W4-2 fetches them again. */
export class WebPageTextWipedError extends TypedDomainError {
  constructor(readonly pageIds: readonly string[]) {
    super(WEB_PAGE_TEXT_WIPED, `${String(pageIds.length)} page text(s) of this call are no longer stored: fetch them again`);
    this.name = "WebPageTextWipedError";
  }
}

/** The store's side (`PostgresWebEvidenceRepository.readPageTexts`): a wiped or never-kept text is absent. */
export type WebPageTextStore = Readonly<{
  readPageTexts: (runId: string, pageIds: readonly string[]) =>
    Promise<readonly Readonly<{ pageId: string; textDigest: Buffer; envelope: CryptoEnvelope }>[]>;
}>;

/**
 * A `vendorPacketOf` that reads the texts back from the store for every packet it is handed: the references found,
 * their pages read (64 at a time), each text opened under the run's lease and its digest checked twice (the stored one
 * and the one recomputed under the run's secret, both against the reference's), then put in (`packetWithPageTexts`).
 * A packet with no reference comes back as it is. Nothing read is kept between calls.
 */
export function storedWebPageTextsSentForm(input: Readonly<{
  runId: string;
  store: WebPageTextStore;
  /** Opens one sealed text (carrier identity.web_page_text, primary key the page id) under the run's content lease. */
  openText: (pageId: string, envelope: CryptoEnvelope) => string;
  lease: WebPageTextDigestKey;
}>): (recorded: PromptPacket) => Promise<PromptPacket> {
  return async (recorded) => {
    const refs = webPageTextRefsIn(recorded);
    if (refs.length === 0) return recorded;
    const pageIds = [...new Set(refs.map((found) => found.pageId))];
    const stored = new Map<string, Readonly<{ textDigest: Buffer; envelope: CryptoEnvelope }>>();
    for (let from = 0; from < pageIds.length; from += STORE_READ_PAGES_MAX) {
      for (const row of await input.store.readPageTexts(input.runId, pageIds.slice(from, from + STORE_READ_PAGES_MAX))) {
        stored.set(row.pageId, row);
      }
    }
    const wiped = pageIds.filter((pageId) => !stored.has(pageId));
    if (wiped.length > 0) throw new WebPageTextWipedError(Object.freeze(wiped));
    const texts = new Map<string, string>();
    for (const found of refs) {
      const row = stored.get(found.pageId)!;
      const text = input.openText(found.pageId, row.envelope);
      const recomputed = runWebPageTextDigest(input.lease, found.pageId, text);
      if (row.textDigest.length !== 32 || !timingSafeEqual(row.textDigest, found.textDigest)
        || !timingSafeEqual(recomputed, found.textDigest)) {
        throw new TypedDomainError(WEB_PAGE_TEXT_CHANGED, "A stored page text does not match the reference its call was recorded with");
      }
      texts.set(found.ref, text);
    }
    return packetWithPageTexts(recorded, texts);
  };
}
