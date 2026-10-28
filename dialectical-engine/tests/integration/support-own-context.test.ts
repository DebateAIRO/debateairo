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

  it("exposes only the stateless message and status routes", async () => {
    expect(SUPPORT_ROUTE_PATHS).toEqual([
      "POST /v1/support/messages", "GET /v1/support/status"
    ]);
    const source = await readFile("apps/api/src/support/index.ts","utf8");
    expect(source).not.toMatch(/ownContext|consentOwnContextAt|run_id|body[.]latest/iu);
    expect(source).not.toContain("openEscalatedCase");
  });
});
