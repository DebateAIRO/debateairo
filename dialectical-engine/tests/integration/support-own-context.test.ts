import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";
import { SUPPORT_ROUTE_PATHS } from "../../apps/api/src/support/index.js";
import { contractInventory } from "../../packages/contract/src/index.js";
import { authorizationPolicyInventory } from "../../apps/api/src/index.js";

describe("SUP-03 no private-context authority", () => {
  it("removes the consent route from every public contract surface", () => {
    const consent = "POST /v1/support/sessions/{id}/consent";
    expect(SUPPORT_ROUTE_PATHS).not.toContain(consent);
    expect(contractInventory.routes).not.toContain(consent);
    expect(authorizationPolicyInventory.map(({ route }) => route)).not.toContain(consent);
  });

  it("keeps human cases while removing private-context composition", async () => {
    expect(SUPPORT_ROUTE_PATHS).toEqual(expect.arrayContaining([
      "POST /v1/support/sessions/{id}/escalate","GET /v1/support/cases",
      // DL1-F5c/DL3-F4: the case bearer rides a header, never a path segment.
      "GET /v1/support/case","POST /v1/support/case/messages"
    ]));
    const source = await readFile("apps/api/src/support/index.ts","utf8");
    expect(source).not.toMatch(/ownContext|consentOwnContextAt|run_id|body[.]latest/iu);
    expect(source).toContain("openEscalatedCase");
  });
});
