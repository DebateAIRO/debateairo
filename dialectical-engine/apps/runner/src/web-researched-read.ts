// apps/runner/src/web-researched-read.ts
/**
 * THE PAGES A PERSON ADDED TO RESEARCHED, AS LATER AIs READ THEM (dig-model revision W4-4; owner Q-D9: it does not rewrite the path; "the
 * next dig on that path or the report weighs it"; decision 6: AI text only). A page that added to the argument, with reader 1's note and
 * its shown quotes (0139, at most 120 characters, kept for good): never a passage or a page's text, so this reads the same before and
 * after the wipe. Pure over what the caller read and opened, but for the quotes it reads itself.
 */
import {
  PostgresPassageRetentionRepository, WEB_EVIDENCE_CARRIERS, WEB_SHOWN_QUOTE_CARRIER, type CryptoEnvelope, type Pool, type WebEvidenceRead
} from "@debateai/db";

export type AddedPage = Readonly<{ pageId: string; pathRef: string; site: string; title: string | null; note: string | null; quotes: readonly string[] }>;
type OpenAdded = (carrier: typeof WEB_EVIDENCE_CARRIERS.page | typeof WEB_EVIDENCE_CARRIERS.reading | typeof WEB_SHOWN_QUOTE_CARRIER,
  id: string, envelope: CryptoEnvelope) => unknown;

const textOf = (value: unknown, key: string): string | null => {
  if (typeof value !== "object" || value === null) return null;
  const found = (value as Readonly<Record<string, unknown>>)[key];
  return typeof found === "string" && found.trim() !== "" ? found : null;
};

/** One debate's added pages that added something, in the order they were added; only those settled by `cutAt` when it is given (the same bytes on a re-claim). */
export async function addedPagesOf(pool: Pool, runId: string, evidence: WebEvidenceRead, open: OpenAdded, cutAt?: string): Promise<readonly AddedPage[]> {
  const chosen = evidence.researched.filter((row) => row.outcome === "ADDS"
    && (cutAt === undefined || (row.settled_at !== null && Date.parse(row.settled_at) <= Date.parse(cutAt))));
  if (chosen.length === 0) return [];
  const quotes = (await new PostgresPassageRetentionRepository(pool).readShownQuotes(runId)) ?? [];
  return chosen.flatMap((row): AddedPage[] => {
    const page = evidence.pages.find((candidate) => candidate.page_id === row.page_id);
    if (page === undefined) return [];
    const about = open(WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content);
    const site = textOf(about, "site");
    if (site === null) return [];
    const opened = quotes.filter((quote) => quote.page_id === row.page_id).map((quote) => open(WEB_SHOWN_QUOTE_CARRIER, quote.extract_id, quote.content));
    const reading = evidence.readings.find((candidate) => candidate.page_id === row.page_id && candidate.reader === 1 && candidate.outcome === "READ" && candidate.content !== null);
    const line = reading === undefined ? null : open(WEB_EVIDENCE_CARRIERS.reading, reading.reading_id, reading.content!);
    return [Object.freeze({ pageId: row.page_id, pathRef: row.path_ref, site, title: textOf(about, "title"),
      note: textOf(line, "note") ?? textOf(line, "line") ?? opened.map((quote) => textOf(quote, "note")).find((note) => note !== null) ?? null,
      quotes: Object.freeze(opened.flatMap((quote) => { const text = textOf(quote, "quote"); return text === null ? [] : [text]; })) })];
  });
}
