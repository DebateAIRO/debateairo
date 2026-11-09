import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "__Host-debateai-session" ? { value: "t".repeat(43) } : undefined)
  }),
  headers: async () => new Headers({ "user-agent": "login-next-test" })
}));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readSession: async () => ({}) })
}));

import LoginPage from "../../apps/ui/app/login/page.js";
import { readRedirects, resetRedirects } from "./stubs/next-navigation.js";

describe("P19 a signed-in visit to /login honours a safe next", () => {
  beforeEach(() => resetRedirects());

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
