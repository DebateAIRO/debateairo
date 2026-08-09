import { describe, expect, it } from "vitest";
import { selectPrototypeDatabaseMechanism } from "../support/testDatabase.js";

describe("DR-121 — prototype database provisioning policy", () => {
  it("selects real embedded PostgreSQL without probing a Docker-family runtime", () => {
    expect(selectPrototypeDatabaseMechanism()).toEqual({
      mechanism: "embedded-postgres",
      testcontainersStatus: "DEFERRED BY DR-121"
    });
  });
});
