import { cutQuoteAtWordEdge, type WebOtherPage, type WebResearched, type WebSearchStatus, type WebSource } from "@debateai/contract";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import type { V4WebNote } from "@/lib/v4/types";

/*
 * Perplexity plan W2-6 (2026-10-30): the web part of the V4 pages — the sources under a point, a path's search note and
 * the other pages it found — read from the answer's optional web fields (contract W1-6). Owner rules (OWNER-ANSWERS,
 * "Perplexity design round" to the end):
 *  - each quote shown is at most 120 characters (cut again here at a word edge; a served quote is already cut), with
 *    reader 1's one line ABOVE it saying what the page is about and why it matters (in the site's language), then the
 *    link and the site;
 *  - pages we could read only in part are marked "preview only"; a page fewer AIs read than planned says so;
 *  - never a grade or a score (the contract carries none);
 *  - Free says "Not checked on the web; paid plans look things up."; a failed search says so.
 * The quote and the page title are the page's own words; reader 1's line and the planner's reason are AI text (marked).
 * W4-4: "Add to researched" is offered only where the map passes `onAddResearched`: never on Free, on the report or when new starts wait.
 * Nothing here fetches or stores anything.
 */

/** A note's catalogue key. */
const NOTE_KEYS: Readonly<Record<V4WebNote, string>> = Object.freeze({
  FREE: "v4.web.free",
  FAILED: "v4.web.failed",
  SWITCHED_OFF: "v4.web.switchedOff"
});

/** The debate's one web note (Free, a failed search, the web switched off), or nothing. */
export function V4WebNoteLine(props: Readonly<{ note: V4WebNote | null | undefined; catalog: MessageCatalog; className?: string }>) {
  if (props.note === null || props.note === undefined) return null;
  return <p className={`v4WebNote${props.className === undefined ? "" : ` ${props.className}`}`}>{t(props.catalog, NOTE_KEYS[props.note])}</p>;
}

/** A sign the planner's reason can never contain, so the sentence splits around it and the reason alone is marked AI text. */
const REASON_SLOT = "⁣⁣";

/** One path's search note: why it was not looked up, that the search failed, Free, or switched off; nothing if it searched. */
export function V4SearchNote(props: Readonly<{ search: WebSearchStatus; catalog: MessageCatalog; className?: string }>) {
  const { search, catalog } = props;
  const className = `v4WebNote${props.className === undefined ? "" : ` ${props.className}`}`;
  if (search.status === "SEARCHED") return null;
  if (search.status === "NO_SEARCH_PLANNED") {
    const reason = search.reason?.trim() ?? "";
    if (reason.length === 0) return <p className={className}>{t(catalog, "v4.web.noSearch.noReason")}</p>;
    const [before = "", after = ""] = t(catalog, "v4.web.noSearch", { reason: REASON_SLOT }).split(REASON_SLOT);
    return <p className={className}>{before}<span data-ai-generated="true">{reason}</span>{after}</p>;
  }
  const note: V4WebNote = search.status === "NOT_ON_PLAN" ? "FREE" : search.status;
  return <p className={className}>{t(catalog, NOTE_KEYS[note])}</p>;
}

/** The page's date, as written on it (a calendar day: read in UTC so it never moves a day). */
function pageDate(locale: string, day: string): string {
  return formatDate(locale, `${day}T00:00:00Z`, { dateStyle: "medium", timeZone: "UTC" });
}

type PageLike = Readonly<Pick<WebSource, "title" | "site" | "link" | "read_depth" | "explanation">>;

/** Reader 1's one line about the page (AI text, in the language it was written in). */
function Explanation(props: Readonly<{ page: PageLike }>) {
  const explanation = props.page.explanation;
  if (explanation === null) return null;
  return <p className="v4SourceWhy" data-ai-generated="true" lang={explanation.language}>{explanation.text}</p>;
}

/** The link (the page's title, else its site) and the site; a new tab, and no referrer is sent. */
function PageLine(props: Readonly<{ page: PageLike; date?: string | null; locale: string }>) {
  const { page } = props;
  const title = page.title?.trim() ?? "";
  return (
    <p className="v4SourceMeta">
      <a className="v4Link v4SourceLink" href={page.link} target="_blank" rel="noopener noreferrer nofollow">
        {title.length > 0 ? title : page.site}
      </a>
      <span className="v4SourceSite">{page.site}</span>
      {props.date !== undefined && props.date !== null
        ? <time className="v4SourceDate" dateTime={props.date}>{pageDate(props.locale, props.date)}</time>
        : null}
    </p>
  );
}

function PreviewOnly(props: Readonly<{ page: PageLike; catalog: MessageCatalog }>) {
  return props.page.read_depth === "WHOLE" ? null : <p className="v4SourceFlag">{t(props.catalog, "v4.web.previewOnly")}</p>;
}

/** The sources under one point: reader 1's line, the quote (at most 120 characters), the link and site, then marks. */
export function V4SourceList(props: Readonly<{ sources: readonly WebSource[] | undefined; catalog: MessageCatalog; locale: string }>) {
  const sources = props.sources ?? [];
  if (sources.length === 0) return null;
  return (
    <ul className="v4Sources">
      {sources.map((source) => (
        <li key={source.extract_id} className="v4Source">
          <Explanation page={source} />
          <blockquote className="v4SourceQuote" cite={source.link}>
            <p>{cutQuoteAtWordEdge(source.quote)}</p>
          </blockquote>
          <PageLine page={source} date={source.published_on} locale={props.locale} />
          <PreviewOnly page={source} catalog={props.catalog} />
          {source.fewer_readers === true ? <p className="v4SourceFlag">{t(props.catalog, "v4.web.fewerReaders")}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** What became of a page the person added to the researched part (the AIs read it at once, owner Q7). */
function ResearchedLine(props: Readonly<{ researched: WebResearched; catalog: MessageCatalog; locale: string }>) {
  const { researched } = props;
  return (
    <div className="v4OtherPageOutcome" role={researched.state === "READING" ? "status" : undefined}>
      <p className="v4SourceFlag">{t(props.catalog, `v4.web.researched.${researched.state}`)}</p>
      {researched.state === "ADDS" ? <V4SourceList sources={researched.sources} catalog={props.catalog} locale={props.locale} /> : null}
    </div>
  );
}

/** The button on a page not added yet, and what the page knows of a press the answer does not say yet. */
function AddResearched(props: Readonly<{ page: string; press: V4ResearchedPress | undefined; onAdd: ((pageRef: string) => void) | undefined; catalog: MessageCatalog; locale: string }>) {
  const { press, catalog } = props;
  const onAdd = props.onAdd;
  if (press === "READING") return <ResearchedLine researched={{ state: "READING" }} catalog={catalog} locale={props.locale} />;
  if (press === "WAITS_FOR_RESET") return <p className="v4SourceFlag">{t(catalog, "v4.web.researched.waitsForReset")}</p>;
  if (onAdd === undefined) return null;
  const adding = press === "ADDING";
  return (
    <>
      {press === "TRY_AGAIN" ? <p className="v4SourceFlag" role="alert">{t(catalog, "v4.web.researched.tryAgain")}</p> : null}
      <button type="button" className="v4Btn v4OtherPageAdd" disabled={adding} aria-busy={adding} onClick={() => onAdd(props.page)}>
        {t(catalog, adding ? "v4.web.researched.ADDING" : "v4.web.addResearched")}
      </button>
    </>
  );
}

/**
 * What the page knows of a press before the answer says so, kept in the page's state only: sending it, sent (the answer will say READING),
 * refused with nothing used (try again, or once the quota resets).
 */
export type V4ResearchedPress = "ADDING" | "READING" | "TRY_AGAIN" | "WAITS_FOR_RESET";

/**
 * A path's other pages (found outside its top pages): the link, site and reader 1's line, never a grade; on the map each
 * has "Add to researched" (`actions`), the report only lists them.
 */
export function V4OtherPages(props: Readonly<{
  pages: readonly WebOtherPage[];
  catalog: MessageCatalog;
  locale: string;
  /** false on the report (a document): no buttons. */
  actions: boolean;
  /** Without it (Free, a full quota, the report) no page offers the button; what became of an added page still shows. */
  onAddResearched?: (pageRef: string) => void;
  /** W4-4: the presses the answer does not say yet, by page. */
  presses?: ReadonlyMap<string, V4ResearchedPress>;
  /** false when the caller already heads the list. */
  heading?: boolean;
  headingClassName?: string;
}>) {
  const { pages, catalog } = props;
  if (pages.length === 0) return null;
  const onAdd = props.onAddResearched;
  return (
    <div className="v4OtherPages">
      {props.heading === false
        ? null
        : <h4 className={props.headingClassName ?? "v4PanelSmallHead"}>{t(catalog, "v4.web.otherPages")}</h4>}
      {props.actions && onAdd !== undefined && pages.some((page) => page.researched === undefined)
        ? <p className="v4PanelHint v4Muted">{t(catalog, "v4.web.addResearchedHint")}</p>
        : null}
      <ul className="v4Sources">
        {pages.map((page) => (
          <li key={page.page_ref} className="v4Source v4OtherPage">
            <PageLine page={page} locale={props.locale} />
            <Explanation page={page} />
            <PreviewOnly page={page} catalog={catalog} />
            {page.researched !== undefined
              ? <ResearchedLine researched={page.researched} catalog={catalog} locale={props.locale} />
              : <AddResearched page={page.page_ref} press={props.presses?.get(page.page_ref)} onAdd={props.actions ? onAdd : undefined} catalog={catalog} locale={props.locale} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
