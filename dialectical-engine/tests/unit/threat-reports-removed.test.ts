import { describe, expect, it } from "vitest";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import * as contract from "@debateai/contract";
import { MAIL_TEMPLATE_IDS } from "@debateai/mail-templates";
import { staffAuthorizationPolicyInventory } from "../../apps/api/src/staff/routes.js";
import { RAW_SECTIONS, KEEP_COLUMNS } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { renderReadme } from "../../apps/api/src/data-export/readme.js";
import { SUPPORT_PAGE_ROUTES } from "../../packages/support-kb/src/catalog.js";
import { snapshotA } from "../fixtures/data-export/snapshot-a.js";
import { readZip } from "../support/zip-reader.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication } from "../support/httpSession.js";

/**
 * 2026-11-19: the dormant staff threat reports were removed from the code (PR A; the database objects and the
 * THREAT_REPORT capability stay until the migration that drops them). Nothing may serve, show, mail or export a kept
 * question: no /v1/admin/threat-reports route, no staff page, no alert mail, and no kept_questions in the export.
 */
const application = {
  withContentLease: async (_id: string, use: () => unknown) => use(), submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
  readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
  readAnswerIndex: async (_session: unknown, limit: number, offset: number) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
  readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
  recordInvestigation: async () => null, unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
  readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
  events: async function* () {}
} as unknown as AskApplication;
const THREAT_ROUTE = /threat-report/iu;

describe("the threat reports are gone", () => {
  it("serves no /v1/admin/threat-reports route, in any inventory or on the built API", async () => {
    expect(staffAuthorizationPolicyInventory.filter(entry => THREAT_ROUTE.test(entry.route))).toEqual([]);
    expect(authorizationPolicyInventory.filter(entry => THREAT_ROUTE.test(entry.route))).toEqual([]);
    expect(contract.staffContractInventory.routes.filter(route => THREAT_ROUTE.test(route))).toEqual([]);
    expect(contract.contractInventory.routes.filter(route => THREAT_ROUTE.test(route))).toEqual([]);
    const server = buildApi({ application, sessions: testSessionApplication([testHttpIdentity("threat-gone")]),
      allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2 } as Parameters<typeof buildApi>[0]);
    try {
      for (const [method, url] of [["GET", "/v1/admin/threat-reports"], ["GET", "/v1/admin/threat-reports/summary"],
        ["GET", "/v1/admin/threat-reports/:reportRef"], ["POST", "/v1/admin/threat-reports/:reportRef/decision"]] as const) {
        expect(server.hasRoute({ method, url }), `${method} ${url}`).toBe(false);
      }
      const response = await server.inject({ method: "GET", url: "/v1/admin/threat-reports/11111111-1111-4111-8111-111111111111" });
      expect(response.statusCode).toBe(404);
    } finally { await server.close(); }
  });

  it("has no threat-report wire shapes, decision intent, mail or staff page", () => {
    for (const name of ["ThreatReportSchema", "ThreatReportListSchema", "ThreatReportSummarySchema", "ThreatReportDecisionRequestSchema"]) {
      expect(contract, name).not.toHaveProperty(name);
    }
    expect(contract.StaffActionIntentSchema.safeParse({ action: "THREAT_REPORT_DECIDE", target_report_ref: "11111111-1111-4111-8111-111111111111",
      decision: "REPORTED", expected_revision: 1, operation_id: "22222222-2222-4222-8222-222222222222" }).success).toBe(false);
    expect(MAIL_TEMPLATE_IDS).not.toContain("THREAT_REPORT_WAITING");
    expect(SUPPORT_PAGE_ROUTES).not.toContain("/admin/threat-reports");
  });

  it("keeps the capability and the old audit events readable until the database drops them", () => {
    expect(contract.StaffCapabilitySchema.safeParse("THREAT_REPORT").success).toBe(true);
    expect(contract.ThreatReportAuditEventSchema.safeParse({ event_id: "11111111-1111-4111-8111-111111111111",
      actor_staff_id: "22222222-2222-4222-8222-222222222222", event: "THREAT_REPORT_READ",
      threat_report_ref: "33333333-3333-4333-8333-333333333333", recorded_at: "2026-11-01T00:00:00.000Z" }).success).toBe(true);
  });

  it("exports no kept_questions and its README describes none", () => {
    expect(RAW_SECTIONS).not.toContain("threat_reports");
    expect(KEEP_COLUMNS).not.toHaveProperty("threat_reports");
    expect(snapshotA.account).not.toHaveProperty("kept_questions");
    const archive = readZip(buildArchive(snapshotA, loadArchiveCatalog("en")).zip);
    const account = JSON.parse(archive.find(entry => entry.name === "account.json")!.bytes.toString("utf8"));
    expect(Object.keys(account)).not.toContain("kept_questions");
    expect(renderReadme()).not.toMatch(/kept[ _]questions?|staff review/iu);
  });
});
