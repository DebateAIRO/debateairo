// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EnrollMfaPage from "../../web/app/enroll-mfa/page.js";
import {
  consumeMailedEnrollmentTokenFromUrl,
  verifyMfaEmail
} from "../../web/lib/mfaEnrollment.js";

describe("duplicate web verification and MFA-enrolment routes", () => {
  it("keeps verify-email as the exact canonical alias and exposes no native credential form", () => {
    const verifySource = readFileSync(join(process.cwd(), "web/app/verify-email/page.tsx"), "utf8");
    const enrollSource = readFileSync(join(process.cwd(), "web/app/enroll-mfa/page.tsx"), "utf8");
    expect(verifySource).toMatch(/export \{ default \} from "\.\.\/enroll-mfa\/page"/);
    expect(enrollSource).toContain('id="totp-code"');
    expect(enrollSource).toContain('id="recovery-typeback"');
    expect(verifySource).not.toMatch(/<form\b/);
    expect(enrollSource).not.toMatch(/<form\b/);
    expect(renderToStaticMarkup(<EnrollMfaPage />)).not.toMatch(/<form\b/);
  });

  it("removes the mailed bearer before verification and preserves unrelated URL state", async () => {
    const order: string[] = [];
    let replacedWith = "";
    const token = "A".repeat(43);
    const consumed = await consumeMailedEnrollmentTokenFromUrl(
      { href: `https://debate.test/verify-email?campaign=welcome&token=${token}#setup` },
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
    expect(replacedWith).toBe("/verify-email?campaign=welcome#setup");
  });

  it("POSTs the bearer through the same-origin proxy without persisting it", async () => {
    const token = "B".repeat(43);
    const observed: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImplementation: typeof fetch = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
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
