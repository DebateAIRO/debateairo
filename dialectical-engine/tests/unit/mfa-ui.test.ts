import { describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SendmailMailSender } from "../../apps/api/src/mail-channel.js";
import {
  consumeMailedEnrollmentTokenFromUrl,
  verifyMfaEmail
} from "../../apps/ui/lib/mfaEnrollment.js";

describe("S4 mailed-token enrolment UI", () => {
  it("takes the fragment bearer once, removes it before verification, and preserves unrelated URL state", async () => {
    const order: string[] = [];
    const replacedWith: string[] = [];
    const token = "A".repeat(43);
    const consumed = await consumeMailedEnrollmentTokenFromUrl(
      { href: `https://debate.test/enroll-mfa?campaign=welcome#setup&token=${token}` },
      {
        state: { navigation: 1 },
        replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
          order.push("replace");
          replacedWith.push(String(url));
        }
      },
      async (presented) => {
        order.push("verify");
        expect(presented).toBe(token);
      }
    );
    expect(consumed).toBe(token);
    expect(order).toEqual(["replace", "verify"]);
    expect(replacedWith).toEqual(["/enroll-mfa?campaign=welcome#setup"]);
  });

  it("keeps the legacy query form for one release: rewrites it to the fragment form, then clears it before verification", async () => {
    const order: string[] = [];
    const replacedWith: string[] = [];
    const token = "L".repeat(43);
    const consumed = await consumeMailedEnrollmentTokenFromUrl(
      { href: `https://debate.test/verify-email?campaign=welcome&token=${token}#setup` },
      {
        state: null,
        replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
          order.push("replace");
          replacedWith.push(String(url));
        }
      },
      async (presented) => {
        order.push("verify");
        expect(presented).toBe(token);
      }
    );
    expect(consumed).toBe(token);
    expect(order).toEqual(["replace", "replace", "verify"]);
    expect(replacedWith).toEqual([
      `/verify-email?campaign=welcome#setup&token=${token}`,
      "/verify-email?campaign=welcome#setup"
    ]);
    expect(replacedWith.at(-1)).not.toContain(token);
  });

  it("returns null and touches navigation state when neither form carries a bearer", async () => {
    let replaced = 0;
    const consumed = await consumeMailedEnrollmentTokenFromUrl(
      { href: "https://debate.test/enroll-mfa#setup" },
      { state: null, replaceState() { replaced += 1; } },
      async () => { throw new Error("must not verify without a bearer"); }
    );
    expect(consumed).toBeNull();
    expect(replaced).toBe(0);
  });

  it("mounts the one-shot consumer at the exact URL emitted by the real mailer", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s4-mailed-route-"));
    const executable = join(root, "capture-sendmail");
    const messageFile = join(root, "message.txt");
    await writeFile(executable, `#!/bin/sh\ncat > "${messageFile}"\n`, "utf8");
    await chmod(executable, 0o700);
    const mail = new SendmailMailSender({
      executable,
      from: "noreply@debateai.test",
      publicAppUrl: "https://debate.test",
      timeoutMs: 1_000
    });
    const expectedToken = "C".repeat(43);
    try {
      await mail.sendVerification({
        attemptId: "00000000-0000-4000-8000-000000000804",
        recipient: "alice@example.test",
        token: expectedToken,
        expiresAt: new Date("2026-08-23T12:00:00.000Z")
      });
      const message = await readFile(messageFile, "utf8");
      const mailedHref = message.match(/https:\/\/[^\s]+/)?.[0];
      expect(mailedHref).toBe(`https://debate.test/verify-email#token=${expectedToken}`);
      expect(message).not.toContain("?token=");
      const mailedUrl = new URL(mailedHref!);
      // The bearer rides in the fragment: the request line a server, proxy or
      // access log ever sees is the bare path (L3-F8).
      expect(mailedUrl.search).toBe("");

      const routeModule = await readFile(
        join(process.cwd(), "apps/ui/app", mailedUrl.pathname, "page.tsx"),
        "utf8"
      );
      expect(routeModule).toMatch(/export \{ default \} from "\.\.\/enroll-mfa\/page"/);

      const order: string[] = [];
      let cleanedPath = "";
      const consumed = await consumeMailedEnrollmentTokenFromUrl(
        { href: mailedUrl.href },
        {
          state: null,
          replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
            order.push("replace");
            cleanedPath = String(url);
          }
        },
        async (token) => {
          order.push("verify");
          expect(token).toBe(expectedToken);
        }
      );
      expect(consumed).toBe(expectedToken);
      expect(order).toEqual(["replace", "verify"]);
      expect(cleanedPath).toBe("/verify-email");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
