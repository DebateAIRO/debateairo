// REV-S01-p1-correctness-tests — the R-6 assertion the slice's own suites never make.
// SPEC-v2 R-6: the system snapshot carries the account pseudonym "and carries no other
// value that names the owner … the decrypted snapshot contains no user id, owner ref,
// session id or email address anywhere in it."
// Written against slice head db4758da. TEMPORARY: deleted before the seat's handoff.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";

const RUN_ID = randomUUID();
const USER_ID = randomUUID();
const OWNER_REF = randomUUID();
const SESSION_ID = randomUUID();
const PSEUDONYM = "Public Thinker 41";

function answer(): unknown {
  return {
    question_line: "Does a public square need a gatekeeper?",
    terminal: "SERVED",
    verdict_state: "SUPPORTED",
    confidence_band: "high",
    composed_text: [{ text: "A public answer." }],
    badges: [],
    residual_objections: [],
    reversal_point: "New evidence",
    as_of: "2026-09-21T00:00:00.000Z",
    nodes: [],
    edges: []
  };
}

describe("REV(S01) p1 — R-6 system snapshot identity content", () => {
  it("encrypts the account pseudonym and no owner-naming value", async () => {
    const encrypted: unknown[] = [];
    const repository = {
      async runIsFreePublicBound() { return true; },
      async readOwnedVisibility() { return { state: "PRIVATE", publicRef: null }; },
      async readAuthorPseudonym() { return PSEUDONYM; },
      async prepareSystemKeyProvision() { return true; },
      async systemPublish(input: { publicationRef: string }) { return input.publicationRef; },
      async clearAutoPublishWork() { return true; },
      async upsertAutoPublishWork() { return true; },
      async auditSystemPublicationAttempt() { return true; },
      async abandonSystemKeyProvision() { return true; }
    };
    const cipher = {
      async create() {
        return {
          encrypt(value: unknown) {
            encrypted.push(value);
            return { v: 1, keyId: "k", nonce: "n", ct: "c", tag: "t" };
          },
          close() { /* no key material is held by this stub */ }
        };
      }
    };
    const application = new PostgresPublicationApplication(
      repository as never,
      cipher as never,
      () => new Date("2026-09-21T00:00:00.000Z")
    );
    await application.tryAutoPublish({
      runId: RUN_ID, answer: answer() as never, userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(encrypted).toHaveLength(1);
    const snapshot = encrypted[0] as Record<string, unknown>;
    expect(snapshot.author_pseudonym).toBe(PSEUDONYM);
    const serialized = JSON.stringify(snapshot);
    for (const identifier of [OWNER_REF, USER_ID, RUN_ID, SESSION_ID]) {
      expect(serialized.includes(identifier)).toBe(false);
    }
  });

  it("R-9/R-10: a key-provision failure records outstanding work, and the retry clears it", async () => {
    const calls: string[] = [];
    let provisionSucceeds = false;
    const repository = {
      async runIsFreePublicBound() { return true; },
      async readOwnedVisibility() { return { state: "PRIVATE", publicRef: null }; },
      async readAuthorPseudonym() { return PSEUDONYM; },
      async prepareSystemKeyProvision() { return provisionSucceeds; },
      async systemPublish(input: { publicationRef: string }) { return input.publicationRef; },
      async clearAutoPublishWork() { calls.push("clear"); return true; },
      async upsertAutoPublishWork(_r: string, _u: string, _o: string, reason: string) {
        calls.push(`upsert:${reason}`); return true;
      },
      async auditSystemPublicationAttempt(_a: string, _r: string, reason: string) {
        calls.push(`audit:${reason}`); return true;
      },
      async abandonSystemKeyProvision() { return true; }
    };
    const cipher = {
      async create() {
        return {
          encrypt() { return { v: 1, keyId: "k", nonce: "n", ct: "c", tag: "t" }; },
          close() { /* no key material is held by this stub */ }
        };
      }
    };
    const application = new PostgresPublicationApplication(
      repository as never, cipher as never, () => new Date("2026-09-21T00:00:00.000Z")
    );
    const input = {
      runId: RUN_ID, answer: answer() as never, userId: USER_ID, ownerRef: OWNER_REF
    };
    await application.tryAutoPublish(input);
    expect(calls).toStrictEqual([
      "upsert:AUTO_PUBLISH_KEY_PROVISION_FAILED",
      "audit:AUTO_PUBLISH_KEY_PROVISION_FAILED"
    ]);
    provisionSucceeds = true;
    await application.tryAutoPublish(input);
    expect(calls.at(-1)).toBe("clear");
  });

  it("R-8: a BLOCKED answer clears the work and never reaches the publish path", async () => {
    const calls: string[] = [];
    const repository = {
      async runIsFreePublicBound() { calls.push("bound"); return true; },
      async readOwnedVisibility() { calls.push("visibility"); return null; },
      async readAuthorPseudonym() { calls.push("pseudonym"); return PSEUDONYM; },
      async prepareSystemKeyProvision() { calls.push("prepare"); return true; },
      async systemPublish() { calls.push("publish"); return null; },
      async clearAutoPublishWork() { calls.push("clear"); return true; },
      async upsertAutoPublishWork() { calls.push("upsert"); return true; },
      async auditSystemPublicationAttempt() { calls.push("audit"); return true; },
      async abandonSystemKeyProvision() { calls.push("abandon"); return true; }
    };
    const application = new PostgresPublicationApplication(
      repository as never, {} as never, () => new Date("2026-09-21T00:00:00.000Z")
    );
    await application.tryAutoPublish({
      runId: RUN_ID,
      answer: { ...(answer() as Record<string, unknown>), terminal: "BLOCKED" } as never,
      userId: USER_ID,
      ownerRef: OWNER_REF
    });
    expect(calls).toStrictEqual(["clear"]);
  });
});
