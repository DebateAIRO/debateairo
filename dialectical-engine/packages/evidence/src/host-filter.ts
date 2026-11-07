/**
 * WHICH FOUND PAGES ARE READ (web search plan W1-2, 2026-10-30; design §3.2, owner-approved).
 *
 * - Social and forum pages are never read: LinkedIn, Reddit, Quora, X, Facebook, YouTube, TikTok, Pinterest (any of
 *   their country sites and short links). Blogs and Substack stay.
 * - One page per site within a path.
 * - The same address is never read twice in one investigation: a page already read is reused (its extracts), not read
 *   again.
 *
 * A "site" is the registrable name: the last two labels of the host, or the last three when the second-last is a
 * common second level under a two-letter country ending (bbc.co.uk, abc.net.au, pinterest.com.au).
 */
export type PageDropReason = "INVALID_ADDRESS" | "SOCIAL_OR_FORUM" | "SAME_ADDRESS" | "SAME_SITE_IN_PATH";

/** Any site whose own name is one of these, under any ending (pinterest.de, linkedin.cn, youtube.co.uk). */
const SOCIAL_OR_FORUM_NAMES = new Set(["linkedin", "reddit", "quora", "twitter", "facebook", "youtube", "tiktok", "pinterest"]);
/** Short or other names of the same services. */
const SOCIAL_OR_FORUM_SITES = new Set(["x.com", "fb.com", "fb.watch", "youtu.be", "redd.it", "t.co", "pin.it", "lnkd.in", "vm.tiktok.com"]);
const SECOND_LEVELS = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "gob", "gv", "or", "ne", "go", "mil", "nic", "ltd", "plc", "sch", "nhs"]);
/** Parameters that only say where a click came from; they never make a different page. */
const TRACKING_PARAMETER = /^(?:utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_ga)$/iu;

function webAddress(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hostname === "") return null;
  return parsed;
}

const hostOf = (address: URL): string => address.hostname.toLowerCase().replace(/\.$/u, "").replace(/^www\./u, "");

/** The site an address belongs to ("bbc.co.uk" for news.bbc.co.uk), or null for anything that is not a web address. */
export function siteOf(url: string): string | null {
  const address = webAddress(url);
  if (address === null) return null;
  const host = hostOf(address);
  if (/^[\d.]+$/u.test(host) || host.startsWith("[")) return host;
  const labels = host.split(".");
  if (labels.length < 2) return host;
  const last = labels.at(-1)!;
  const secondLast = labels.at(-2)!;
  const take = labels.length >= 3 && last.length === 2 && SECOND_LEVELS.has(secondLast) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Whether a page is on a social or forum site, which is never read. */
export function isSocialOrForumAddress(url: string): boolean {
  const address = webAddress(url);
  const site = siteOf(url);
  if (address === null || site === null) return false;
  const host = hostOf(address);
  return SOCIAL_OR_FORUM_SITES.has(site) || SOCIAL_OR_FORUM_SITES.has(host)
    || SOCIAL_OR_FORUM_NAMES.has(site.split(".")[0]!);
}

/**
 * One address however it is written: no scheme, no `www.`, no fragment, no trailing slash, no click-tracking
 * parameters; any other query stays (`?page=2` is another page). Null for anything that is not a web address.
 */
export function addressKey(url: string): string | null {
  const address = webAddress(url);
  if (address === null) return null;
  const kept = [...address.searchParams].filter(([name]) => !TRACKING_PARAMETER.test(name));
  const query = kept.length === 0 ? "" : `?${new URLSearchParams(kept).toString()}`;
  const path = address.pathname.replace(/\/+$/u, "");
  const port = address.port === "" ? "" : `:${address.port}`;
  return `${hostOf(address)}${port}${path}${query}`;
}

/**
 * A path's pages, in the order found: the ones to read, the ones already read in this investigation (reused, never
 * read again), and the ones dropped with why. `addresses` are the keys of the pages to read, for the caller to add to
 * the investigation's read set before the next path.
 */
export function selectPathPages<T extends Readonly<{ url: string }>>(
  pages: readonly T[],
  alreadyRead: ReadonlySet<string>
): Readonly<{
  read: readonly T[];
  reuse: readonly T[];
  dropped: readonly Readonly<{ page: T; reason: PageDropReason }>[];
  addresses: readonly string[];
}> {
  const read: T[] = [];
  const reuse: T[] = [];
  const dropped: Readonly<{ page: T; reason: PageDropReason }>[] = [];
  const addresses: string[] = [];
  const seenAddresses = new Set<string>();
  const seenSites = new Set<string>();
  const drop = (page: T, reason: PageDropReason): void => {
    dropped.push(Object.freeze({ page, reason }));
  };
  for (const page of pages) {
    const key = addressKey(page.url);
    const site = siteOf(page.url);
    if (key === null || site === null) {
      drop(page, "INVALID_ADDRESS");
    } else if (isSocialOrForumAddress(page.url)) {
      drop(page, "SOCIAL_OR_FORUM");
    } else if (seenAddresses.has(key)) {
      drop(page, "SAME_ADDRESS");
    } else if (seenSites.has(site)) {
      drop(page, "SAME_SITE_IN_PATH");
    } else {
      seenAddresses.add(key);
      seenSites.add(site);
      if (alreadyRead.has(key)) {
        reuse.push(page);
      } else {
        read.push(page);
        addresses.push(key);
      }
    }
  }
  return Object.freeze({
    read: Object.freeze(read),
    reuse: Object.freeze(reuse),
    dropped: Object.freeze(dropped),
    addresses: Object.freeze(addresses)
  });
}
