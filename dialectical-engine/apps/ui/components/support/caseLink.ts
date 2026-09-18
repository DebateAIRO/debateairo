/**
 * DL3-F4. Where a support-case bearer is allowed to live in the browser.
 *
 * A case token is the sole capability to read a whole case — the reporter's
 * words, V's replies, the model's summary — and to reply as the reporter, for
 * the case's lifetime. It used to travel as `/help?case=<43 chars>`, so it sat
 * in the address bar, in browser history, in any shared link, in any future
 * access log, and was re-read from the query on every reload.
 *
 * It travels in the URL FRAGMENT now. A fragment is never sent to a server or a
 * proxy, so it cannot be logged upstream, and this reader takes it out of
 * navigation state with `history.replaceState` before doing anything with it —
 * the same shape B27 uses for the mailed one-shot tokens
 * (`apps/ui/lib/mfaEnrollment.ts`, L3-F8).
 *
 * The retired query form is still read for one release: it is first rewritten
 * to the fragment form, so the query form leaves navigation state, and then
 * consumed exactly like a fragment bearer.
 *
 * The API still takes the token in the path (`/v1/support/cases/<token>`);
 * changing that is a contract decision ruled elsewhere.
 */

/** The API's grammar for a case capability (`apps/api/src/support/session.ts`). */
const CASE_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const CASE_FRAGMENT_PREFIX = "case=";

export function supportCaseLink(token: string): string {
  return `/help#${CASE_FRAGMENT_PREFIX}${encodeURIComponent(token)}`;
}

type CaseLocation = Readonly<{ href: string }>;
type CaseHistory = Readonly<{
  state: unknown;
  replaceState(state: unknown, unused: string, url?: string | URL | null): void;
}>;

/** The `&`-separated pieces of a fragment; an empty fragment has none. */
function fragmentPieces(hash: string): string[] {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  return body === "" ? [] : body.split("&");
}

function navigationPath(url: URL, pieces: readonly string[]): string {
  return `${url.pathname}${url.search}${pieces.length === 0 ? "" : `#${pieces.join("&")}`}`;
}

/**
 * The case bearer this page was opened with, taken out of the address on the
 * way out. Returns null when there is none, and also when what is there is not
 * a case capability — a value that fails the API's grammar is cleared and never
 * turned into a request path.
 */
export function consumeSupportCaseTokenFromUrl(
  location: CaseLocation,
  history: CaseHistory
): string | null {
  const url = new URL(location.href);
  let pieces = fragmentPieces(url.hash);
  const legacyToken = url.searchParams.get("case");
  if (legacyToken !== null) {
    url.searchParams.delete("case");
    pieces = [...pieces, `${CASE_FRAGMENT_PREFIX}${encodeURIComponent(legacyToken)}`];
    history.replaceState(history.state, "", navigationPath(url, pieces));
  }
  const index = pieces.findIndex((piece) => piece.startsWith(CASE_FRAGMENT_PREFIX));
  if (index === -1) return null;
  const raw = pieces[index]!.slice(CASE_FRAGMENT_PREFIX.length);
  history.replaceState(history.state, "", navigationPath(url, pieces.filter((_, at) => at !== index)));
  let token: string;
  try {
    token = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return CASE_TOKEN.test(token) ? token : null;
}
