import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { currentDocument } from "@debateai/legal-manifest";
import { openRecord } from "@debateai/crypto";
import type { AcceptanceInput, AcceptanceKind } from "@debateai/db";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { RepositoryLegalAcceptanceApplication } from "../../apps/api/src/legal.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("legal-reacceptance");
const NOW = new Date("2026-10-01T09:00:00.000Z");

function fakeAcceptances(latest: Partial<Record<AcceptanceKind, string>>) {
  const recorded: AcceptanceInput[] = [];
  return {
    recorded,
    repository: {
      // The full shape L3a's latest() answers; L4 reads only documentVersion.
      latest: vi.fn(async (_ownerRef: string, kind: AcceptanceKind) =>
        latest[kind] === undefined ? null
          : { documentVersion: latest[kind]!, documentSha256: "0".repeat(64), locale: "en", acceptedAt: NOW }),
      recordAll: vi.fn(async (rows: ReadonlyArray<AcceptanceInput>) => { recorded.push(...rows); })
    }
  };
}

describe("re-acceptance (paid plans L4, spec §2.3.2)", () => {
  it("in hosted mode, owes both documents to an account with no record at all, whatever the floor", async () => {
    // Accounts created before L3b hold no TERMS or PRIVACY_SHOWN row; the Terms and the Privacy
    // Policy claim a record exists, so in hosted mode such an account must accept before it can pay.
    // The L2 floors are null, so only owedWithoutRecord makes these documents owed.
    const legal = new RepositoryLegalAcceptanceApplication({
      acceptances: fakeAcceptances({}).repository as never, recordsKey: randomBytes(32),
      owedWithoutRecord: true, clock: () => NOW
    });
    await expect(legal.status(IDENTITY.authenticated.ownerRef, "de")).resolves.toEqual([
      { kind: "TERMS", ...currentDocument("TERMS", "de")! },
      { kind: "PRIVACY", ...currentDocument("PRIVACY", "de")! }
    ]);
    await expect(legal.requiresReacceptance(IDENTITY.authenticated.ownerRef)).resolves.toBe(true);
  });

  it("in local mode, owes nothing to an account with no record while no floor is set, and both once one is", async () => {
    // Spec §2.2 rule 1 ("Local mode keeps today's behaviour exactly") and §2.3.2 ("none, unless the
    // manifest's marker moved past their last acceptance"): an older local account sees no screen.
    const { repository, recorded } = fakeAcceptances({});
    const local = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey: randomBytes(32),
      owedWithoutRecord: false, clock: () => NOW, floorOf: () => null
    });
    await expect(local.status(IDENTITY.authenticated.ownerRef, "de")).resolves.toEqual([]);
    await expect(local.requiresReacceptance(IDENTITY.authenticated.ownerRef)).resolves.toBe(false);
    await expect(local.accept({
      ownerRef: IDENTITY.authenticated.ownerRef, locale: "ro", source: { ip: "81.196.1.2", userAgent: "test/1" },
      documents: [{ kind: "TERMS", ...currentDocument("TERMS", "ro")! }, { kind: "PRIVACY", ...currentDocument("PRIVACY", "ro")! }]
    })).resolves.toBe("ACCEPTED");
    expect(recorded).toEqual([]);
    expect(repository.recordAll).not.toHaveBeenCalled();

    // Once the manifest sets a floor, a local account with no record is below it like any other.
    const floored = new RepositoryLegalAcceptanceApplication({
      acceptances: fakeAcceptances({}).repository as never, recordsKey: randomBytes(32),
      owedWithoutRecord: false, clock: () => NOW, floorOf: () => "2.0"
    });
    await expect(floored.status(IDENTITY.authenticated.ownerRef, "de")).resolves.toEqual([
      { kind: "TERMS", ...currentDocument("TERMS", "de")! },
      { kind: "PRIVACY", ...currentDocument("PRIVACY", "de")! }
    ]);
    await expect(floored.requiresReacceptance(IDENTITY.authenticated.ownerRef)).resolves.toBe(true);
  });

  it("requires nothing of an account WITH records while no floor is set, and every document below a floor once one is", async () => {
    // A valid manifest's floor never exceeds the current version (final review I-2; parseLegalManifest
    // refuses it): the owner raises the floor TO the current Terms, and a person whose last acceptance is
    // an older version owes them.
    const { repository } = fakeAcceptances({ TERMS: "1.9", PRIVACY_SHOWN: "3.0" });
    const revised = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey: randomBytes(32), owedWithoutRecord: true, clock: () => NOW
    });
    await expect(revised.status(IDENTITY.authenticated.ownerRef, "ro")).resolves.toEqual([
      { kind: "TERMS", ...currentDocument("TERMS", "ro")! },
      { kind: "PRIVACY", ...currentDocument("PRIVACY", "ro")! }
    ]);
    await expect(revised.requiresReacceptance(IDENTITY.authenticated.ownerRef)).resolves.toBe(true);

    const noFloor = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey: randomBytes(32), owedWithoutRecord: true,
      clock: () => NOW, floorOf: () => null
    });
    await expect(noFloor.status(IDENTITY.authenticated.ownerRef, "ro")).resolves.toEqual([]);
    await expect(noFloor.requiresReacceptance(IDENTITY.authenticated.ownerRef)).resolves.toBe(false);

    const floors = { TERMS: currentDocument("TERMS", "ro")!.version, PRIVACY: null } as const;
    const moved = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey: randomBytes(32), owedWithoutRecord: true, clock: () => NOW,
      floorOf: (kind) => floors[kind]
    });
    await expect(moved.status(IDENTITY.authenticated.ownerRef, "ro")).resolves.toEqual([
      { kind: "TERMS", ...currentDocument("TERMS", "ro")! }
    ]);
    await expect(moved.requiresReacceptance(IDENTITY.authenticated.ownerRef)).resolves.toBe(true);

    // An account with no record at all (created before the record existed) is below every floor.
    const none = new RepositoryLegalAcceptanceApplication({
      acceptances: fakeAcceptances({}).repository as never, recordsKey: randomBytes(32),
      owedWithoutRecord: true, clock: () => NOW, floorOf: () => "2.0"
    });
    await expect(none.status(IDENTITY.authenticated.ownerRef, "de")).resolves.toEqual([
      { kind: "TERMS", ...currentDocument("TERMS", "de")! },
      { kind: "PRIVACY", ...currentDocument("PRIVACY", "de")! }
    ]);
  });

  it("records REACCEPT rows with sealed evidence, and refuses a stale pair whole", async () => {
    const recordsKey = randomBytes(32);
    const { repository, recorded } = fakeAcceptances({});
    // The fake holds no rows yet, so under this floor both documents are owed.
    const legal = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey, owedWithoutRecord: true, clock: () => NOW, floorOf: () => "2.0"
    });
    const source = { ip: "81.196.1.2", userAgent: "test/1" };
    await expect(legal.accept({
      ownerRef: IDENTITY.authenticated.ownerRef, locale: "ro", source,
      documents: [
        { kind: "TERMS", ...currentDocument("TERMS", "ro")! },
        { kind: "PRIVACY", ...currentDocument("PRIVACY", "ro")!, sha256: "0".repeat(64) }
      ]
    })).resolves.toBe("STALE");
    expect(recorded).toEqual([]);
    await expect(legal.accept({
      ownerRef: IDENTITY.authenticated.ownerRef, locale: "ro", source,
      documents: [{ kind: "TERMS", ...currentDocument("TERMS", "ro")! }, { kind: "PRIVACY", ...currentDocument("PRIVACY", "ro")! }]
    })).resolves.toBe("ACCEPTED");
    expect(recorded.map((row) => [row.kind, row.surface, row.locale])).toEqual([
      ["TERMS", "REACCEPT", "ro"], ["PRIVACY_SHOWN", "REACCEPT", "ro"]
    ]);
    const evidence = openRecord(recordsKey, {
      table: "legal.acceptance", column: "evidence_ciphertext", rowId: recorded[0]!.acceptanceId
    }, recorded[0]!.evidenceCiphertext);
    expect(JSON.parse(evidence.toString("utf8"))).toEqual({ ip: "81.196.1.2", user_agent: "test/1" });
    expect(recorded[0]!.acceptedAt).toEqual(NOW);
  });

  it("writes nothing when nothing is owed: the route is idempotent and cannot grow the table", async () => {
    // legal.acceptance is append-only for the life of the account, so a free signed-in account
    // posting the current pairs over and over must not add a row per request.
    const { repository, recorded } = fakeAcceptances({ TERMS: "2.1", PRIVACY_SHOWN: "3.2" });
    const legal = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey: randomBytes(32), owedWithoutRecord: true, clock: () => NOW
    });
    await expect(legal.accept({
      ownerRef: IDENTITY.authenticated.ownerRef, locale: "ro", source: { ip: "81.196.1.2", userAgent: "test/1" },
      documents: [{ kind: "TERMS", ...currentDocument("TERMS", "ro")! }, { kind: "PRIVACY", ...currentDocument("PRIVACY", "ro")! }]
    })).resolves.toBe("ACCEPTED");
    expect(recorded).toEqual([]);
    expect(repository.recordAll).not.toHaveBeenCalled();
  });

  it("records only the documents owed when some are posted that are not", async () => {
    // The floor sits AT the current Terms (a valid manifest, final review I-2), the last Terms acceptance
    // below it; the Privacy Policy has no floor and a record, so it is not owed.
    const { repository, recorded } = fakeAcceptances({ TERMS: "1.9", PRIVACY_SHOWN: "3.0" });
    const floors = { TERMS: currentDocument("TERMS", "ro")!.version, PRIVACY: null } as const;
    const legal = new RepositoryLegalAcceptanceApplication({
      acceptances: repository as never, recordsKey: randomBytes(32), owedWithoutRecord: true, clock: () => NOW,
      floorOf: (kind) => floors[kind]
    });
    await expect(legal.accept({
      ownerRef: IDENTITY.authenticated.ownerRef, locale: "ro", source: { ip: "81.196.1.2", userAgent: "test/1" },
      documents: [{ kind: "TERMS", ...currentDocument("TERMS", "ro")! }, { kind: "PRIVACY", ...currentDocument("PRIVACY", "ro")! }]
    })).resolves.toBe("ACCEPTED");
    expect(recorded.map((row) => row.kind)).toEqual(["TERMS"]);
    expect(repository.recordAll).toHaveBeenCalledTimes(1);
    // The row it wrote carries the current version, which has reached the floor: the screen clears.
    expect(recorded[0]!.documentVersion).toBe(floors.TERMS);
  });

  it("serves both routes to a signed-in person only, with CSRF on the POST", async () => {
    const status = vi.fn(async () => [{ kind: "TERMS" as const, ...currentDocument("TERMS", "en")! }]);
    const accept = vi.fn(async () => "ACCEPTED" as const);
    const api = buildApi({
      application: {} as AskApplication,
      sessions: testSessionApplication([IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN,
      legal: { status, accept, requiresReacceptance: async () => true }
    });
    const anonymous = await api.inject({ method: "GET", url: "/v1/account/legal-status" });
    expect(anonymous.statusCode).toBe(401);
    const read = await api.inject({
      method: "GET", url: "/v1/account/legal-status?locale=en", headers: testSessionHeaders(IDENTITY)
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ must_accept: [{ kind: "TERMS", ...currentDocument("TERMS", "en")! }] });
    const badLocale = await api.inject({
      method: "GET", url: "/v1/account/legal-status?locale=english", headers: testSessionHeaders(IDENTITY)
    });
    expect(badLocale.statusCode).toBe(400);
    const payload = { documents: [{ kind: "TERMS", ...currentDocument("TERMS", "en")! }], locale: "en" };
    const noCsrf = await api.inject({
      method: "POST", url: "/v1/account/legal-accept", headers: testSessionHeaders(IDENTITY), payload
    });
    expect(noCsrf.statusCode).toBe(403);
    const accepted = await api.inject({
      method: "POST", url: "/v1/account/legal-accept", headers: testSessionHeaders(IDENTITY, true), payload
    });
    expect(accepted.statusCode).toBe(204);
    expect(accept).toHaveBeenCalledWith(expect.objectContaining({
      ownerRef: IDENTITY.authenticated.ownerRef, locale: "en", documents: payload.documents
    }));
    accept.mockResolvedValueOnce("STALE" as never);
    const stale = await api.inject({
      method: "POST", url: "/v1/account/legal-accept", headers: testSessionHeaders(IDENTITY, true), payload
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: "LEGAL_DOCUMENT_STALE" });
    await api.close();
  });

  it("answers 503 when no acceptance application is composed", async () => {
    const api = buildApi({
      application: {} as AskApplication, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN
    });
    const response = await api.inject({ method: "GET", url: "/v1/account/legal-status", headers: testSessionHeaders(IDENTITY) });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "LEGAL_ACCEPTANCE_UNAVAILABLE" });
    await api.close();
  });

  it("is composed with the acceptance repository, the records key and the mode's no-record rule in the API boot", async () => {
    const { readFile } = await import("node:fs/promises");
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("new RepositoryLegalAcceptanceApplication({");
    // The no-record rule follows the deployment mode: hosted owes, local needs a floor.
    expect(main).toContain('owedWithoutRecord: environment.DEPLOYMENT_MODE === "hosted"');
    expect(main.slice(main.indexOf("const api = buildApi({"))).toContain("legal,");
  });
});
