import { describe, expect, it } from "vitest";

import { evaluateGrantFacts } from "../../acceptance/obs/cases/grants.js";
import { percentileMicroseconds } from "../../acceptance/obs/cases/overhead.js";
import { mannWhitneyU } from "../../acceptance/obs/cases/zone-timing.js";

describe("FIX-08 C4 named grants", () => {
  it("rejects listener access to detail, identity by name, and core.run", () => {
    expect(evaluateGrantFacts({
      roleNames: ["debateai_obs_writer", "debateai_obs_listener", "debateai_obs_watchdog", "debateai_obs_human"],
      productUrl: "postgresql://product@localhost/debateai",
      roleUrls: [
        "postgresql://writer@localhost/debateai",
        "postgresql://listener@localhost/debateai",
        "postgresql://watchdog@localhost/debateai",
        "postgresql://human@localhost/debateai",
      ],
      grants: [
        { grantee: "debateai_obs_listener", table_schema: "identity", table_name: "account", privilege_type: "SELECT" },
      ],
      listenerDetail: false,
      listenerCoreRun: false,
    })).toEqual({ passed: false, violations: ["LISTENER_IDENTITY_GRANT"] });
  });

  it("rejects DELETE and a role URL equal to the product URL", () => {
    const same = "postgresql://same@localhost/debateai";
    expect(evaluateGrantFacts({
      roleNames: ["debateai_obs_writer", "debateai_obs_listener", "debateai_obs_watchdog", "debateai_obs_human"],
      productUrl: same,
      roleUrls: [same, "b", "c", "d"],
      grants: [
        { grantee: "debateai_obs_writer", table_schema: "obs", table_name: "occurrence", privilege_type: "DELETE" },
      ],
      listenerDetail: false,
      listenerCoreRun: false,
    })).toEqual({ passed: false, violations: ["DELETE_GRANT", "PRODUCT_URL_REUSED"] });
  });

  it("accepts the four distinct least-privilege role identities", () => {
    expect(evaluateGrantFacts({
      roleNames: ["debateai_obs_writer", "debateai_obs_listener", "debateai_obs_watchdog", "debateai_obs_human"],
      productUrl: "product",
      roleUrls: ["writer", "listener", "watchdog", "human"],
      grants: [],
      listenerDetail: false,
      listenerCoreRun: false,
    })).toEqual({ passed: true, violations: [] });
  });
});

describe("FIX-08 C4 bounded timing calculations", () => {
  it("computes a hand-checked Mann-Whitney U with tied values", () => {
    expect(mannWhitneyU([1, 2, 2], [2, 3, 4])).toEqual({ uOn: 1, uOff: 8, u: 1 });
  });

  it("computes nearest-rank p99 in integer microseconds", () => {
    expect(percentileMicroseconds([900_000n, 100_000n, 500_000n, 700_000n], 99)).toBe(900);
    expect(percentileMicroseconds([], 99)).toBeUndefined();
  });
});
