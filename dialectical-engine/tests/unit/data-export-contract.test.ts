import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_ERROR_CODES,
  DATA_EXPORT_LOCALES,
  DataExportDownloadRequestSchema,
  DataExportRequestSchema,
  DataExportStatusSchema,
  StepUpAuthorizationRequestSchema,
  StepUpGrantResponseSchema
} from "../../packages/contract/src/index.js";
import { ContractHttpError, createContractClient } from "../../packages/contract/src/client.js";

const grant = "g".repeat(43);
const token = "t".repeat(43);
const requestedAt = "2026-10-08T10:00:00.000Z";
const expiresAt = "2026-10-09T10:02:00.000Z";

describe("data export contract", () => {
  it("K-1 accepts an account-scoped EXPORT_DATA authorization", () => {
    expect(StepUpAuthorizationRequestSchema.parse({ action: "EXPORT_DATA" })).toEqual({ action: "EXPORT_DATA" });
  });

  it("K-2 rejects a run target on EXPORT_DATA", () => {
    expect(() => StepUpAuthorizationRequestSchema.parse({
      action: "EXPORT_DATA", target_run_id: "00000000-0000-4000-8000-000000000001"
    })).toThrow();
  });

  it("K-3 accepts a targetless EXPORT_DATA grant and rejects a run target", () => {
    const response = { action: "EXPORT_DATA", token: grant, expires_at: requestedAt };
    expect(StepUpGrantResponseSchema.parse(response)).toEqual(response);
    expect(() => StepUpGrantResponseSchema.parse({
      ...response, target_run_id: "00000000-0000-4000-8000-000000000001"
    })).toThrow();
  });

  it("K-4 accepts the exact export request body", () => {
    const request = { step_up_grant: grant, locale: "ro" };
    expect(DataExportRequestSchema.parse(request)).toEqual(request);
  });

  it("K-5 rejects eight malformed export request bodies", () => {
    const valid = { step_up_grant: grant, locale: "ro" };
    const invalid = [
      { step_up_grant: grant },
      { locale: "ro" },
      { ...valid, x: true },
      { ...valid, locale: 1 },
      { ...valid, step_up_grant: "g".repeat(42) },
      { ...valid, step_up_grant: "g".repeat(44) },
      { ...valid, step_up_grant: `${"g".repeat(42)}+` },
      { ...valid, locale: "xx" }
    ];
    expect(invalid).toHaveLength(8);
    for (const body of invalid) expect(DataExportRequestSchema.safeParse(body).success).toBe(false);
  });

  it("K-6 lists exactly the sorted UI locale directories", () => {
    const directories = readdirSync("apps/ui/messages", { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(directories).toHaveLength(35);
    expect(DATA_EXPORT_LOCALES).toEqual(directories);
  });

  it("K-7 accepts four exact statuses and rejects extensions or an incomplete SENT status", () => {
    const statuses = [
      { status: "NONE" },
      { status: "PREPARING", requested_at: requestedAt },
      { status: "SENT", requested_at: requestedAt, expires_at: expiresAt },
      { status: "FAILED", requested_at: requestedAt }
    ];
    for (const status of statuses) {
      expect(DataExportStatusSchema.parse(status)).toEqual(status);
      expect(DataExportStatusSchema.safeParse({ ...status, x: true }).success).toBe(false);
    }
    expect(DataExportStatusSchema.safeParse({ status: "SENT", requested_at: requestedAt }).success).toBe(false);
  });

  it("K-8 accepts a 43-character download token only", () => {
    expect(DataExportDownloadRequestSchema.parse({ token })).toEqual({ token });
    expect(DataExportDownloadRequestSchema.safeParse({ token, x: true }).success).toBe(false);
    expect(DataExportDownloadRequestSchema.safeParse({ token: "t".repeat(42) }).success).toBe(false);
  });

  it("K-9 declares the eight export refusal codes", () => {
    expect(DATA_EXPORT_ERROR_CODES).toEqual([
      "EXPORT_UNAVAILABLE", "EXPORT_EMAIL_REQUIRED", "EXPORT_ACCOUNT_ERASING", "EXPORT_ACCOUNT_HELD",
      "EXPORT_IN_PROGRESS", "EXPORT_RATE_LIMITED", "EXPORT_WRONG_ACCOUNT", "EXPORT_LINK_INVALID"
    ]);
  });

  it("K-10 sends exact route methods and JSON bodies and returns download bytes and filename", async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      if (path === "/v1/account/export/download") {
        return new Response("zip", { headers: { "content-disposition": 'attachment; filename="dialectical-engine-export-2026-10-08.zip"' } });
      }
      return Response.json(path === "/v1/account/export" && init?.method === "POST"
        ? { status: "PREPARING", requested_at: requestedAt } : { status: "NONE" });
    };
    const client = createContractClient("https://example.test", fetchStub);
    expect(await client.requestDataExport(grant, "ro")).toEqual({ status: "PREPARING", requested_at: requestedAt });
    expect(await client.readDataExportStatus()).toEqual({ status: "NONE" });
    const download = await client.downloadDataExport(token);
    expect(Array.from(new Uint8Array(download.bytes))).toEqual([122, 105, 112]);
    expect(download.filename).toBe("dialectical-engine-export-2026-10-08.zip");
    expect(calls).toEqual([
      { path: "/v1/account/export", method: "POST", body: { step_up_grant: grant, locale: "ro" } },
      { path: "/v1/account/export", method: "GET", body: undefined },
      { path: "/v1/account/export/download", method: "POST", body: { token } }
    ]);
  });

  it("K-11 carries Retry-After as milliseconds on rate limit errors and rejects unusable forms", async () => {
    // One field for the wait (retryAfterMs, shared with the live page): delay-seconds or a future HTTP date.
    const cases: readonly [string | null, number | null][] = [
      ["3600", 3_600_000],
      ["60", 60_000],
      [null, null],
      ["0", null],
      ["soon", null],
      ["Wed, 21 Oct 2015 07:28:00 GMT", null]
    ];
    for (const [header, expected] of cases) {
      const fetchStub: typeof fetch = async () => Response.json(
        { error: "EXPORT_RATE_LIMITED" },
        { status: 429, headers: header === null ? {} : { "retry-after": header } }
      );
      const client = createContractClient("https://example.test", fetchStub);
      const error: unknown = await client.requestDataExport(grant, "ro").catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(ContractHttpError);
      expect((error as ContractHttpError).retryAfterMs).toBe(expected);
    }
  });
});
