import { describe, expect, it, vi } from "vitest";
import {
  consumeMailedEnrollmentTokenFromUrl,
  verifyMfaEmail
} from "../../apps/ui/lib/mfaEnrollment.js";

describe("S4 mailed-token enrolment UI", () => {
  it("takes the query bearer once, removes it before verification, and preserves unrelated URL state", async () => {
    const order: string[] = [];
    let replacedWith = "";
    const token = "A".repeat(43);
    const consumed = await consumeMailedEnrollmentTokenFromUrl(
      { href: `https://debate.test/enroll-mfa?campaign=welcome&token=${token}#setup` },
      {
        state: { navigation: 1 },
        replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
          order.push("replace");
          replacedWith = String(url);
        }
      },
      async (presented) => {
        order.push("verify");
        expect(presented).toBe(token);
      }
    );
    expect(consumed).toBe(token);
    expect(order).toEqual(["replace", "verify"]);
    expect(replacedWith).toBe("/enroll-mfa?campaign=welcome#setup");
  });

  it("POSTs verify-email through the same-origin proxy without persisting the bearer", async () => {
    const token = "B".repeat(43);
    const observed: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImplementation: typeof fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observed.push({ input: String(input), ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify({ status: "mfa_required" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    await expect(verifyMfaEmail(token, fetchImplementation, "/api")).resolves.toBeUndefined();
    expect(observed).toHaveLength(1);
    expect(observed[0]!.input).toBe("/api/v1/auth/verify-email");
    expect(observed[0]!.init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ token })
    });
  });
});
