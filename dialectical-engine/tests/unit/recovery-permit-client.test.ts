import { describe, expect, it } from "vitest";
import { ContractHttpError } from "../../packages/contract/src/http-error.js";
import { createRecoveryPermitClient } from "../../packages/contract/src/mfa-recovery.js";

/**
 * The person's client of the Owner's permit (migration 0188): every call carries its own emailed link, so no call sends
 * a header made from a cookie, and a refusal reaches the page with the server's own code only when it is one of the
 * email-recovery family's.
 */
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const TOKEN = "T".repeat(43), PASSWORD = "current password fixture";
const GENERIC = { message: "If this account can be recovered, instructions will arrive through an eligible channel." };
const OPENED = { status: "RECOVERY_ENROLL_ONLY", available_methods: ["passkey", "totp"], totp_unavailable_reason: null, recovery_capability: "R".repeat(43), expires_at: "2030-01-01T00:05:00.000Z" };
type Sent = { url: string; init: RequestInit };
/** A fetch that records each call and answers what `answer` gives for its path. */
function recorder(answer: (url: string) => Response) {
  const sent: Sent[] = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => { sent.push({ url: String(url), init: init! }); return answer(String(url)); }) as typeof fetch;
  return { sent, fetcher };
}

describe("each method's request", () => {
  it("sends each call to its own path as a POST with exactly the fields it names", async () => {
    const { sent, fetcher } = recorder((url) => url.endsWith("/start") ? json(GENERIC, 202) : url.endsWith("/request") ? json({ status: "requested" })
      : url.endsWith("/cancel") ? json({ status: "cancelled" }) : url.endsWith("/finish/status") ? json({ status: "waiting", not_before: "2030-01-01T00:00:00.000Z" }) : json(OPENED));
    const client = createRecoveryPermitClient(fetcher, "/api");
    await expect(client.start("person@example.test")).resolves.toEqual(GENERIC);
    await client.start("person@example.test", "turnstile-fixture");
    await expect(client.request(TOKEN, PASSWORD)).resolves.toEqual({ status: "requested" });
    await expect(client.cancel(TOKEN)).resolves.toEqual({ status: "cancelled" });
    await expect(client.finishStatus(TOKEN)).resolves.toEqual({ status: "waiting", not_before: "2030-01-01T00:00:00.000Z" });
    await expect(client.finish(TOKEN, PASSWORD)).resolves.toEqual(OPENED);
    expect(sent.map((s) => [s.url, s.init.method, s.init.body])).toEqual([
      ["/api/v1/auth/recovery-permit/start", "POST", JSON.stringify({ email: "person@example.test" })],
      ["/api/v1/auth/recovery-permit/start", "POST", JSON.stringify({ email: "person@example.test", turnstile_token: "turnstile-fixture" })],
      ["/api/v1/auth/recovery-permit/request", "POST", JSON.stringify({ token: TOKEN, password: PASSWORD })],
      ["/api/v1/auth/recovery-permit/cancel", "POST", JSON.stringify({ token: TOKEN })],
      ["/api/v1/auth/recovery-permit/finish/status", "POST", JSON.stringify({ token: TOKEN })],
      ["/api/v1/auth/recovery-permit/finish", "POST", JSON.stringify({ token: TOKEN, password: PASSWORD })]
    ]);
  });
  it("sends no header made from a cookie: only accept and content-type, whatever cookies the page holds", async () => {
    const holder = globalThis as { document?: unknown };
    const before = holder.document;
    // A page that holds every cookie the other recovery clients read their CSRF headers from.
    holder.document = { cookie: `__Host-debateai-csrf=${"B".repeat(43)}; __Host-debateai-mfa-recovery-csrf=${"C".repeat(43)}; __Host-debateai-staff-csrf=${"D".repeat(43)}` };
    try {
      const { sent, fetcher } = recorder((url) => url.endsWith("/start") ? json(GENERIC, 202) : url.endsWith("/request") ? json({ status: "requested" })
        : url.endsWith("/cancel") ? json({ status: "cancelled" }) : url.endsWith("/finish/status") ? json({ status: "ready_to_finish", expires_at: "2030-01-01T00:00:00.000Z" }) : json(OPENED));
      const client = createRecoveryPermitClient(fetcher);
      await client.start("person@example.test");
      await client.request(TOKEN, PASSWORD);
      await client.cancel(TOKEN);
      await client.finishStatus(TOKEN);
      await client.finish(TOKEN, PASSWORD);
      for (const s of sent) {
        expect([...new Headers(s.init.headers).keys()].sort()).toEqual(["accept", "content-type"]);
        expect(s.init.cache).toBe("no-store");
      }
    } finally {
      if (before === undefined) delete holder.document; else holder.document = before;
    }
  });
  it("refuses an answer that is not the promised shape", async () => {
    await expect(createRecoveryPermitClient(async () => json({ status: "requested", session: "forged" })).request(TOKEN, PASSWORD)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(createRecoveryPermitClient(async () => json({ ...OPENED, recovery_capability: "short" })).finish(TOKEN, PASSWORD)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(createRecoveryPermitClient(async () => json(GENERIC, 200)).start("person@example.test")).rejects.toBeInstanceOf(ContractHttpError);
  });
});

describe("a refusal", () => {
  it("reaches the page as a ContractHttpError carrying the server's own code", async () => {
    const refused = await createRecoveryPermitClient(async () => json({ error: "RECOVERY_PERMIT_PROOF_INVALID" }, 401)).request(TOKEN, "wrong").catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ContractHttpError);
    expect(refused).toMatchObject({ status: 401, serverCode: "RECOVERY_PERMIT_PROOF_INVALID" });
    for (const [code, status] of [["RECOVERY_PERMIT_TOO_EARLY", 409], ["RECOVERY_PERMIT_INVALID", 410], ["MFA_RECOVERY_INVALID", 410], ["BACKUP_EMAIL_INVALID", 410], ["RECOVERY_PERMIT_RATE_LIMITED", 429]] as const)
      await expect(createRecoveryPermitClient(async () => json({ error: code }, status)).finish(TOKEN, PASSWORD)).rejects.toMatchObject({ status, serverCode: code });
  });
  it("drops a code outside the email-recovery family, and a body with no code", async () => {
    for (const body of [{ error: "STAFF_REQUEST_REFUSED" }, { error: "RECOVERY_PERMITS_STALE" }, { error: "recovery_permit_invalid" }, { error: 7 }, {}]) {
      const refused = await createRecoveryPermitClient(async () => json(body, 410)).cancel(TOKEN).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(ContractHttpError);
      expect((refused as ContractHttpError).serverCode, JSON.stringify(body)).toBeNull();
    }
  });
});
