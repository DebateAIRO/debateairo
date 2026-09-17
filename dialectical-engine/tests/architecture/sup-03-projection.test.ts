import { access,readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe,expect,it } from "vitest";
import { TOOL_REGISTRY } from "../../apps/api/src/support/tools.js";

describe("SUP-03 no private Support projection", () => {
  it("removes the private projection module and capability", async () => {
    await expect(access("apps/api/src/support/own-context.ts",constants.F_OK)).rejects.toThrow();
    expect(Object.keys(TOOL_REGISTRY)).toEqual([
      "answer_from_corpus","link_first_party","refuse"
    ]);
  });

  it("contains no live ownership query, consent SQL, port, or composition", async () => {
    const [api,main,database,index,contract] = await Promise.all([
      "apps/api/src/support/index.ts","apps/api/src/main.ts","packages/db/src/support.ts",
      "packages/db/src/index.ts","packages/contract/src/index.ts"
    ].map((path) => readFile(path,"utf8")));
    const sources = [api,main,database,index,contract].join("\n");
    expect(sources).not.toMatch(/SupportOwnContext|PostgresSupportOwnContext|setConsent|read_own_run_state/iu);
    expect([api,main,database].join("\n"))
      .not.toMatch(/core[.]run_is_owned_by\(run[.]run_id/iu);
    expect(database.match(/consent_own_context_at/gu)).toHaveLength(1);
    expect(database).toMatch(/\('session','consent_own_context_at'\)/u);
  });
});
