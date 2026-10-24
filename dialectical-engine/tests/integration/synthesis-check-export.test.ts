import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun, migrate } from "@debateai/db";
import { SynthesisCheckRepository } from "@debateai/serve";
import { PostgresAskApplication } from "../../apps/api/src/index.js";
import { collectSnapshot, type RawExportRows } from "../../apps/api/src/data-export/snapshot.js";
import { OwnerViewAdapter } from "../../apps/api/src/data-export/owner-view-adapter.js";
import { createSynthesisAnswerAccess } from "../../apps/api/src/synthesis-check/hold.js";
import { renderYourDataHtml } from "../../apps/api/src/data-export/html-page.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import type { SynthesisCheckEntry } from "../../apps/api/src/data-export/types.js";
import { snapshotA } from "../fixtures/data-export/snapshot-a.js";
import { startTestDatabase, createTestAskAdmissionPoolFacades } from "../support/testDatabase.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { persistTerminalRun } from "../support/settledRun.js";

const rawFixture = JSON.parse(readFileSync(new URL("../fixtures/data-export/raw-a.json", import.meta.url), "utf8"));
const checks = [
  { answer_version: 1, verdict: "FLAGGED", categories: ["TERRORISM", "HATE_SPEECH"], checked_at: "2026-10-05T14:03:00.000Z" },
  { answer_version: 2, verdict: "CLEAR", categories: [], checked_at: "2026-10-06T15:04:00.000Z" },
] as const;

function exportHarness() {
  const raw = structuredClone(rawFixture);
  const ownerView = {
    runKeyPresent: vi.fn(async () => true),
    runRemovedByCheck: vi.fn(async () => false),
    readRun: vi.fn(async () => ({ state: "SETTLED", question_line: "Owner question" })),
    readRunAnswer: vi.fn(async (): Promise<{ answer_id: string; answer_version: number } | null> => ({ answer_id: "answer-1", answer_version: 2 })),
    readAnswer: vi.fn(async (_owner: string, _id: string, version: number) => ({ answer_id: "answer-1", answer_version: version, nodes: [] })),
    readInspection: vi.fn(async () => ({})),
    readLedgerDigest: vi.fn(async () => ({})),
    readStory: vi.fn(async () => null),
    readDisclosure: vi.fn(async () => null),
    readNode: vi.fn(async () => null),
    readSynthesisChecks: vi.fn(async (_ownerRef: string, _answerId: string): Promise<readonly SynthesisCheckEntry[]> => checks),
  };
  const collect = (ownerRef = "owner-1", locale = "en") => collectSnapshot({
    claim: { exportId: "export-1", userId: "user-1", ownerRef, sessionId: "session-1", locale,
      requestedAt: new Date("2026-10-07T00:00:00.000Z"), attempt: 1 },
    workerId: "worker-1", source: { readRaw: async () => raw as RawExportRows }, ownerView,
    decrypt: { openUserField: async () => "owner@example.test", openRecord: () => "record", openSupport: async () => "support" },
    now: () => new Date("2026-10-07T01:00:00.000Z"),
  });
  return { raw, ownerView, collect };
}

function pageWithChecks(locale: "en" | "ro") {
  const [flagged, clear] = snapshotA.debates.debates;
  return renderYourDataHtml({ ...snapshotA, locale, debates: { debates: [
    { ...flagged!, answers: flagged!.answers!.map((answer) => ({ ...answer, synthesis_checks: [
      { ...checks[1], answer_version: 1, verdict: "UNAVAILABLE" as const },
      { ...checks[0], answer_version: 2 },
    ] })) },
    { ...clear!, answers: clear!.answers!.map((answer) => ({ ...answer, synthesis_checks: [checks[1]] })) },
  ] } }, loadArchiveCatalog(locale));
}

describe("synthesis checks in the owner's data export", () => {
  it("the export of an owner with one FLAGGED and one CLEAR version lists both: verdict, category codes and checked_at in the JSON", async () => {
    const db = await startTestDatabase();
    let runtime: ReturnType<typeof createPool> | undefined;
    let owner: Awaited<ReturnType<typeof provisionStoryEncryptedOwner>> | undefined;
    try {
      await migrate(db.pool);
      owner = await provisionStoryEncryptedOwner(db.pool);
      const url = new URL(db.connectionString);
      url.searchParams.set("options", "-c role=debateai_runtime");
      runtime = createPool(url.toString());
      configureContentEncryption(runtime, contentCipherFor(db.pool)!);
      const runId = await createEncryptedStoryRun(db.pool, owner, `Export check ${randomUUID()}?`);
      const { answerId } = await persistTerminalRun({
        pool: db.pool, runId, fixtureKey: randomUUID(),
        factBundle: { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
          reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null }
      });
      const repository = new SynthesisCheckRepository(runtime);
      const composedId = randomUUID();
      const composed = await encryptAttestedContentForRun(db.pool, runId, "serve.composed_text", composedId, {
        segments: [{ segment_id: randomUUID(), text: "A different synthesis", load_bearing: true, served_number_refs: [] }]
      });
      if (composed === null) throw new Error("TEST_COMPOSED_CIPHER_MISSING");
      const rawArtifactId = randomUUID();
      const rawArtifact = await encryptAttestedContentForRun(db.pool, runId, "ledger.raw_artifact", rawArtifactId,
        { rawText: "fixture", metadataJson: {} });
      if (rawArtifact === null) throw new Error("TEST_RAW_ARTIFACT_CIPHER_MISSING");
      await db.pool.query(`INSERT INTO ledger.raw_artifact
        (raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,raw_text,metadata_json,
         parse_status,input_hash,input_hash_version,contract_hash,content_hash,content_hash_version,at_seq,
         content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,'test','test','test','test','⟦DEBATEAI:CIPHERTEXT:V1⟧',
          '{}'::jsonb,'PARSED','test',1,'test','test',1,
          ledger.allocate_sequence(),$4::jsonb,$5)`,
        [rawArtifactId, randomUUID(), runId, JSON.stringify(rawArtifact.envelope), rawArtifact.attestation]);
      await db.pool.query(`INSERT INTO serve.composed_text
        (composed_text_id,fact_bundle_id,segments,raw_artifact_ref,attempt,content_ciphertext,content_attestation)
        SELECT $2,fact_bundle_id,'[]'::jsonb,$3,1,$4::jsonb,$5 FROM serve.answer
        WHERE answer_id=$1 AND answer_version=1`,
        [answerId, composedId, rawArtifactId, JSON.stringify(composed.envelope), composed.attestation]);
      const second = await encryptAttestedContentForRun(db.pool, runId, "serve.answer", `${answerId}:2`, { answerForm: null });
      if (second === null) throw new Error("TEST_ANSWER_CIPHER_MISSING");
      await db.pool.query(`INSERT INTO serve.answer (
        answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,
        answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
        sealed_at_seq,confidence_band,band_ceiling,reversal_point,builds_on_previous,badges,
        verdict_unavailable,memory_disclosure,content_ciphertext,content_attestation
      ) SELECT answer_id,2,run_id,work_item_id,terminal,'COMPOSED',verdict_state,
        answer_form,condition_marks,fact_bundle_id,$2,conformance_record_id,
        ledger.allocate_sequence(),confidence_band,band_ceiling,reversal_point,
        builds_on_previous,badges,verdict_unavailable,memory_disclosure,$3::jsonb,$4
        FROM serve.answer WHERE answer_id=$1 AND answer_version=1`,
        [answerId, composedId, JSON.stringify(second.envelope), second.attestation]);
      const attempt = await repository.startPublishAttempt({ runId, answerId, answerVersion: 1 });
      expect(await repository.insertResult({
        attemptId: attempt.attemptId, runId, answerId, answerVersion: 1, synthesisOriginVersion: 1,
        outcome: { verdict: "FLAGGED", categories: ["HATE_SPEECH"] }, modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
        policyVersion: "synthesis.content-check.v1@0123456789abcdef", callCount: 1, deadlineMs: 60_000
      })).toBe("INSERTED");
      const secondAttempt = await repository.startPublishAttempt({ runId, answerId, answerVersion: 2 });
      expect(await repository.insertResult({
        attemptId: secondAttempt.attemptId, runId, answerId, answerVersion: 2, synthesisOriginVersion: 2,
        outcome: { verdict: "CLEAR", categories: [] }, modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
        policyVersion: "synthesis.content-check.v1@0123456789abcdef", callCount: 1, deadlineMs: 60_000
      })).toBe("INSERTED");
      const application = new PostgresAskApplication(runtime, {} as never, {} as never, undefined, runtime,
        createTestAskAdmissionPoolFacades(runtime));
      const adapter = new OwnerViewAdapter({ application }, { exists: async () => true });
      const real = exportHarness();
      real.ownerView.readRunAnswer.mockResolvedValue({ answer_id: answerId, answer_version: 2 });
      real.ownerView.readSynthesisChecks.mockImplementation((ownerRef, id) => adapter.readSynthesisChecks(ownerRef, id));
      const exported = (await real.collect(owner.ownerRef)).debates.debates[0]?.answers?.[0]?.synthesis_checks;
      expect(exported).toEqual([
        { answer_version: 1, verdict: "FLAGGED", categories: ["HATE_SPEECH"], checked_at: expect.any(String) },
        { answer_version: 2, verdict: "CLEAR", categories: [], checked_at: expect.any(String) }
      ]);
    } finally {
      await runtime?.end();
      await db.stop();
      if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
    }
    const h = exportHarness();
    const answer = (await h.collect()).debates.debates[0]?.answers?.[0];
    expect(answer?.synthesis_checks).toEqual(checks);
    expect(JSON.stringify(answer)).toContain('"TERRORISM"');
    expect(h.ownerView.readSynthesisChecks).toHaveBeenCalledWith("owner-1", "answer-1");
  }, 180_000);

  it("the export lists nothing of another account's checks", async () => {
    const h = exportHarness();
    const readSynthesisChecks = vi.fn(async (_answerId: string, _session: unknown, ownership: { ownerRef: string }) =>
      ownership.ownerRef === "owner-1" ? checks : []);
    const adapter = new OwnerViewAdapter({ application: { readSynthesisChecks } as never }, { exists: async () => true });
    h.ownerView.readSynthesisChecks.mockImplementation((ownerRef, answerId) => adapter.readSynthesisChecks(ownerRef, answerId));
    const snapshot = await h.collect("owner-2");
    expect(snapshot.debates.debates[0]?.answers?.[0]?.synthesis_checks).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("TERRORISM");
    expect(readSynthesisChecks).toHaveBeenCalledWith("answer-1", expect.objectContaining({ asker_id: "owner:owner-2" }),
      { ownerRef: "owner-2", legacyAskerId: null });
  });

  it("the readable page shows the Content check block: Flagged in a strong.flagged with the category words and a time for the FLAGGED version, and Clear for the CLEAR one, in ordinary case", () => {
    const html = pageWithChecks("en");
    expect(html).toContain('<p class="label section-label">Content check</p>');
    expect(html).toMatch(/<p class="check"><strong class="flagged">Flagged<\/strong> · Possible terrorism, hate speech of any kind · [^<]*2026[^<]* UTC<\/p>/u);
    expect(html.split("</article>")[0]).not.toContain("Unavailable");
    expect(html).toMatch(/<p class="check"><strong>Clear<\/strong> · [^<]*2026[^<]* UTC<\/p>/u);
    expect(html).toContain(".check strong.flagged{color:var(--dispute)}");
  });

  it("a Romanian export prints Verificarea conținutului, Marcată and Fără probleme, and the flagged version's category in the Romanian policies' words", () => {
    const html = pageWithChecks("ro");
    expect(html).toContain("Verificarea conținutului");
    expect(html).toContain('<strong class="flagged">Marcată</strong>');
    expect(html).toContain("posibil terorism, discurs de ură de orice fel");
    expect(html).toContain("<strong>Fără probleme</strong>");
  });

  it("a debate removed by the check is listed as UNRECOVERABLE with no answer and no check", async () => {
    const h = exportHarness();
    h.ownerView.runRemovedByCheck.mockResolvedValue(true);
    const entry = (await h.collect()).debates.debates[0];
    expect(entry).toMatchObject({ reference: "run-1", content_status: "UNRECOVERABLE" });
    expect(entry).not.toHaveProperty("answers");
    expect(h.ownerView.readRunAnswer).not.toHaveBeenCalled();
    expect(h.ownerView.readSynthesisChecks).not.toHaveBeenCalled();
  });

  it("a held debate is listed with no answer", async () => {
    const db = await startTestDatabase();
    let runtime: ReturnType<typeof createPool> | undefined;
    let owner: Awaited<ReturnType<typeof provisionStoryEncryptedOwner>> | undefined;
    try {
      await migrate(db.pool);
      owner = await provisionStoryEncryptedOwner(db.pool);
      const url = new URL(db.connectionString);
      url.searchParams.set("options", "-c role=debateai_runtime");
      runtime = createPool(url.toString());
      configureContentEncryption(runtime, contentCipherFor(db.pool)!);
      const runId = await createEncryptedStoryRun(db.pool, owner, `Held export ${randomUUID()}?`);
      const { answerId } = await persistTerminalRun({
        pool: db.pool, runId, fixtureKey: randomUUID(),
        factBundle: { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
          reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null }
      });
      const repository = new SynthesisCheckRepository(runtime);
      await repository.insertRequest({ runId, answerId, answerVersion: 1 });
      const application = new PostgresAskApplication(runtime, {} as never, {} as never, undefined, runtime,
        createTestAskAdmissionPoolFacades(runtime));
      const adapter = new OwnerViewAdapter({ application,
        synthesisAnswerAccess: createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 }) },
      { exists: async () => true });
      const heldAnswer = await adapter.readRunAnswer(owner.ownerRef, runId);
      expect(heldAnswer).toBeNull();
      const h = exportHarness();
      h.ownerView.readRunAnswer.mockResolvedValue(heldAnswer as null);
      const entry = (await h.collect()).debates.debates[0];
      expect(entry).toMatchObject({ content_status: "READABLE", answers: [] });
      expect(entry?.run_answer).toBeNull();
      expect(h.ownerView.runRemovedByCheck).toHaveBeenCalledWith("run-1");
      expect(h.ownerView.readSynthesisChecks).not.toHaveBeenCalled();
    } finally {
      await runtime?.end();
      await db.stop();
      if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
    }
  }, 180_000);
});
