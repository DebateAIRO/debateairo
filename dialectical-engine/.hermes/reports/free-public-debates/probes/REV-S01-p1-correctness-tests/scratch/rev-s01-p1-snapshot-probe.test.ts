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
});
