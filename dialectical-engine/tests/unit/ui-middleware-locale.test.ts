import { describe, expect, it } from "vitest";
import { NextRequest, type NextResponse } from "../../apps/ui/node_modules/next/server.js";

// Loaded by a computed path: the root type check resolves modules as Node does, and there the middleware's
// `next/server` import (resolved by Next's own bundler) has no declarations. The website's type check covers the file.
const { middleware } = await import("../../apps/ui/" + "middleware.js") as { middleware: (request: NextRequest) => NextResponse };

/**
 * The middleware hands the pages a locale cookie for this one request when the visitor has not picked a language and
 * the browser prefers Romanian. Next passes the request headers the middleware returns to the page as
 * `x-middleware-override-headers` plus one `x-middleware-request-<name>` per header; the pages' cookies() reads that
 * cookie header. tests/integration/s5-ui-security-smoke.mjs proves the same on a built server.
 */
function run(headers: Record<string, string>) {
  const response = middleware(new NextRequest("https://dezbatere.test/terms", { headers }));
  return {
    cookie: response.headers.get("x-middleware-request-cookie"),
    overridden: (response.headers.get("x-middleware-override-headers") ?? "").split(","),
    vary: response.headers.get("vary"),
    setCookie: response.headers.getSetCookie()
  };
}

/** The locale the pages read from a cookie header, as Next's cookie store reads it: the last of two same-named wins. */
function pageLocale(cookieHeader: string | null): string | undefined {
  return new NextRequest("https://dezbatere.test/", cookieHeader === null ? {} : { headers: { cookie: cookieHeader } })
    .cookies.get("debateai.locale")?.value;
}

describe("the first-visit language in the middleware", () => {
  it("gives a Romanian browser with no language cookie the Romanian locale for this request only", () => {
    for (const acceptLanguage of ["ro", "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7", "ro-MD", "de-DE,de;q=0.9,ro;q=0.8"]) {
      const result = run({ "accept-language": acceptLanguage });
      expect(result.cookie, acceptLanguage).toBe("debateai.locale=ro");
      expect(result.overridden, acceptLanguage).toContain("cookie");
      expect(pageLocale(result.cookie), acceptLanguage).toBe("ro");
      // Nothing is stored in the browser: no cookie is set.
      expect(result.setCookie, acceptLanguage).toEqual([]);
    }
  });

  it("keeps the browser's other cookies and adds the locale last", () => {
    const session = "s".repeat(43);
    const result = run({ "accept-language": "ro", cookie: `__Host-debateai-session=${session}; debateai.consent=1` });
    expect(result.cookie).toBe(`__Host-debateai-session=${session}; debateai.consent=1; debateai.locale=ro`);
    expect(pageLocale(result.cookie)).toBe("ro");
  });

  it("leaves English browsers, browsers that name no offered language, and crawlers that send nothing on English", () => {
    for (const headers of [
      {},
      { "accept-language": "en-US,en;q=0.9,ro;q=0.8" },
      { "accept-language": "en" },
      { "accept-language": "de-DE,de" },
      { "accept-language": "*" },
      { "accept-language": "ro;q=0" },
      { "accept-language": "ro;q=nonsense" },
      { "accept-language": `${"de,".repeat(342)}ro` }
    ]) {
      const result = run(headers);
      expect(result.cookie, JSON.stringify(headers)).toBeNull();
      expect(pageLocale(result.cookie), JSON.stringify(headers)).toBeUndefined();
    }
  });

  it("never overrides the language the visitor picked in the language list", () => {
    for (const choice of ["en", "en-GB", "en-US", "ro"]) {
      const cookie = `debateai.locale=${choice}`;
      const result = run({ "accept-language": choice === "ro" ? "en-US,en" : "ro-RO,ro", cookie });
      expect(result.cookie, choice).toBe(cookie);
      expect(pageLocale(result.cookie), choice).toBe(choice);
    }
  });

  it("reads an older cookie naming a language the site no longer offers as no choice, as the pages do", () => {
    const result = run({ "accept-language": "ro-RO", cookie: "debateai.locale=de" });
    expect(result.cookie).toBe("debateai.locale=de; debateai.locale=ro");
    expect(pageLocale(result.cookie)).toBe("ro");
    // An English browser with the same older cookie keeps reading English, exactly as before.
    expect(run({ "accept-language": "en", cookie: "debateai.locale=de" }).cookie).toBe("debateai.locale=de");
  });

  // Next replaces this Vary on a rendered page with its own; server.mjs adds the name there (the built-server smoke).
  it("says its answer varies with Accept-Language, whatever it decided", () => {
    for (const headers of [{}, { "accept-language": "ro" }, { "accept-language": "en" }, { "accept-language": "ro", cookie: "debateai.locale=en-GB" }]) {
      expect(run(headers).vary, JSON.stringify(headers)).toBe("Accept-Language");
    }
  });

  it("still stamps the nonce policy beside the language", () => {
    const response = middleware(new NextRequest("https://dezbatere.test/", { headers: { "accept-language": "ro" } }));
    expect(response.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u);
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(/^[A-Za-z0-9+/=]{24}$/u);
  });
});
