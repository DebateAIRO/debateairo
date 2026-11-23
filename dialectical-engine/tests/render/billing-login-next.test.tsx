import { beforeEach, describe, expect, it, vi } from "vitest";

/** The cookies the browser sent: a signed-in browser holds the HttpOnly session cookie and the readable one beside it. */
const browser = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
const confirmed = vi.hoisted(() => ({ reads: 0 }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (browser.cookies.has(name) ? { value: browser.cookies.get(name)! } : undefined)
  }),
  headers: async () => new Headers({ "user-agent": "login-next-test" })
}));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({
    readSession: async () => { confirmed.reads += 1; return {}; },
    getGeoAvailability: async () => ({ signup: true, pay: true, service: true })
  })
}));

import LoginPage from "../../apps/ui/app/login/page.js";
import { readRedirects, resetRedirects } from "./stubs/next-navigation.js";

beforeEach(() => {
  resetRedirects();
  confirmed.reads = 0;
  browser.cookies = new Map([["__Host-debateai-session", "t".repeat(43)], ["__Host-debateai-csrf", "c".repeat(43)]]);
});

describe("P19 a signed-in visit to /login honours a safe next", () => {
  it.each([
    ["/checkout?plan=MAX", "/checkout?plan=MAX"],
    ["/settings/card", "/settings/card"],
    // V4 review ask-f1: with no safe next, sign-in lands on the new ask page.
    ["//evil.example/checkout", "/v4"],
    ["https://evil.example", "/v4"],
    [undefined, "/v4"]
  ])("next=%s lands on %s", async (next, expected) => {
    await expect(LoginPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual([expected]);
  });
});

describe("a session without its readable cookie is not sent back to where it came from", () => {
  /*
   * The browser's pages treat a session whose readable cookie is gone as signed out and send the person to /login: the
   * website removes that cookie itself once the API has said the session ended. Were /login to send them back because
   * the HttpOnly cookie still reads as a session, the two would send the person to and fro without end.
   */
  it.each([
    ["missing", null],
    ["of a form the API never sets", "short"]
  ])("with the readable cookie %s, the sign-in form shows and nothing is redirected", async (_case, value) => {
    if (value === null) browser.cookies.delete("__Host-debateai-csrf");
    else browser.cookies.set("__Host-debateai-csrf", value);
    const page = await LoginPage({ searchParams: Promise.resolve({ next: "/settings" }) });
    expect(page).toBeTruthy();
    expect(readRedirects()).toEqual([]);
    expect(confirmed.reads, "the session is not asked about").toBe(0);
  });
});
