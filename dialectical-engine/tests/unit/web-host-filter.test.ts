import { describe, expect, it } from "vitest";
import { addressKey, isSocialOrForumAddress, selectPathPages, siteOf } from "../../packages/evidence/src/host-filter.js";

// W1-2 (plan 2026-10-30, design §3.2): social and forum pages are never read (LinkedIn, Reddit, Quora, X, Facebook,
// YouTube, TikTok, Pinterest); blogs and Substack stay. One page per site per path, and the same address is never read
// twice in one investigation (it is reused instead). All addresses are made up.

describe("the social and forum filter", () => {
  it.each([
    "https://www.linkedin.com/pulse/nurse-pay",
    "https://ro.linkedin.com/in/someone",
    "https://www.reddit.com/r/nursing/comments/1",
    "https://old.reddit.com/r/romania",
    "https://www.quora.com/What-do-nurses-earn",
    "https://ro.quora.com/Cat-castiga",
    "https://x.com/someone/status/1",
    "https://twitter.com/someone/status/1",
    "https://mobile.twitter.com/someone",
    "https://www.facebook.com/groups/1",
    "https://m.facebook.com/story.php",
    "https://fb.com/page",
    "https://www.youtube.com/watch?v=abc",
    "https://m.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://www.tiktok.com/@someone/video/1",
    "https://www.pinterest.com/pin/1",
    "https://ro.pinterest.com/pin/1",
    "https://www.pinterest.co.uk/pin/1",
    "https://pinterest.de/pin/1",
    "https://www.pinterest.com.au/pin/1"
  ])("drops %s", (url) => {
    expect(isSocialOrForumAddress(url)).toBe(true);
  });

  it.each([
    "https://someone.substack.com/p/nurse-pay",
    "https://substack.com/home",
    "https://medium.com/@someone/nurse-pay",
    "https://example.blogspot.com/2026/10/post.html",
    "https://www.notreddit.com/a",
    "https://www.xbox.com/en-US",
    "https://linkedin.example.com/a",
    "https://www.nytimes.com/2026/10/30/health/nurses.html",
    "https://insse.ro/cms/ro/content/castiguri"
  ])("keeps %s", (url) => {
    expect(isSocialOrForumAddress(url)).toBe(false);
  });
});

describe("sites and addresses", () => {
  it.each([
    ["https://news.bbc.co.uk/a", "bbc.co.uk"],
    ["https://www.bbc.co.uk/news", "bbc.co.uk"],
    ["https://www.gov.ro/a", "gov.ro"],
    ["https://ec.europa.eu/eurostat/a", "europa.eu"],
    ["https://insse.ro/cms", "insse.ro"],
    ["https://www.abc.net.au/news", "abc.net.au"],
    ["https://WWW.Example.COM:443/a", "example.com"]
  ])("the site of %s is %s", (url, site) => {
    expect(siteOf(url)).toBe(site);
  });

  it("reads one address the same way however it is written", () => {
    expect(addressKey("https://www.Example.com/a/?utm_source=news&fbclid=1#top")).toBe(addressKey("http://example.com/a"));
    expect(addressKey("https://example.com/a?page=2")).not.toBe(addressKey("https://example.com/a?page=3"));
    expect(addressKey("ftp://example.com/a")).toBeNull();
    expect(addressKey("not an address")).toBeNull();
  });
});

describe("choosing a path's pages", () => {
  const page = (url: string, title = url) => ({ url, title });

  it("drops social pages, a second page of the same site and repeats; reuses an address already read; keeps the order", () => {
    const chosen = selectPathPages([
      page("https://www.reddit.com/r/nursing/1"),
      page("https://insse.ro/a"),
      page("https://www.insse.ro/b"),
      page("https://someone.substack.com/p/x"),
      page("https://insse.ro/a#again"),
      page("https://ec.europa.eu/eurostat/x"),
      page("ftp://example.com/file"),
      page("https://example.org/already")
    ], new Set([addressKey("https://example.org/already")!]));

    expect(chosen.read.map((p) => p.url)).toEqual([
      "https://insse.ro/a", "https://someone.substack.com/p/x", "https://ec.europa.eu/eurostat/x"
    ]);
    expect(chosen.reuse.map((p) => p.url)).toEqual(["https://example.org/already"]);
    expect(chosen.dropped.map((d) => [d.page.url, d.reason])).toEqual([
      ["https://www.reddit.com/r/nursing/1", "SOCIAL_OR_FORUM"],
      ["https://www.insse.ro/b", "SAME_SITE_IN_PATH"],
      ["https://insse.ro/a#again", "SAME_ADDRESS"],
      ["ftp://example.com/file", "INVALID_ADDRESS"]
    ]);
    expect(chosen.addresses).toEqual([
      addressKey("https://insse.ro/a"), addressKey("https://someone.substack.com/p/x"), addressKey("https://ec.europa.eu/eurostat/x")
    ]);
  });

  it("counts a reused page as its site's one page in the path", () => {
    const chosen = selectPathPages(
      [page("https://insse.ro/old"), page("https://insse.ro/new")],
      new Set([addressKey("https://insse.ro/old")!])
    );
    expect(chosen.reuse.map((p) => p.url)).toEqual(["https://insse.ro/old"]);
    expect(chosen.read).toEqual([]);
    expect(chosen.dropped.map((d) => d.reason)).toEqual(["SAME_SITE_IN_PATH"]);
  });
});
