import type { AnswerDisclosure, AnswerFloor, MakerLineage } from "@debateai/contract";
import type {
  RunOwnershipAccess,
  ServeDisclosureModel,
  ServeDisclosureRead,
  ServeDisclosureRepository,
  StoredServeDisclosure
} from "@debateai/db";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.5), TASK M5 — the owner-gated read
 * behind GET /v1/answers/{id}/disclosure. The repository applies the run's
 * ownership predicate and picks the answer's LATEST version that has a record
 * (a DR-184 review catch-up version has none of its own); this layer only turns
 * the record into the contract's words.
 */
export interface AnswerDisclosureApplication {
  readDisclosure(input: Readonly<{
    answerId: string;
    ownership: RunOwnershipAccess;
  }>): Promise<AnswerDisclosure | null>;
}

/**
 * A model as the story's "Written by" shows one (`lineageOf` in
 * packages/story/src/writer.ts): maker, model id, transport, provider ref, read
 * from a call the model made. Never a provider address or a credential.
 */
function lineageOfModel(model: ServeDisclosureModel | null): MakerLineage | null {
  return model === null
    ? null
    : { maker: model.maker, model_id: model.modelId, transport: model.transport, provider_ref: model.providerRef };
}

/** The floor of a components-only answer, or null. The row's CHECK keeps its fields all set or all null. */
export function floorOfDisclosure(row: StoredServeDisclosure): AnswerFloor | null {
  return row.floorVerdictState === null || row.floorLeadingNodeId === null
    ? null
    : { verdict_state: row.floorVerdictState, leading_node_id: row.floorLeadingNodeId };
}

export function buildAnswerDisclosure(read: ServeDisclosureRead): AnswerDisclosure {
  const { row, models } = read;
  return {
    answer_id: row.answerId,
    answer_version: row.answerVersion,
    floor: floorOfDisclosure(row),
    writer: row.writerServedRef === null ? null : {
      planned_model: lineageOfModel(models.writerPlanned),
      served_model: lineageOfModel(models.writerServed),
      lower_cost: row.writerFallback
    },
    checker: row.checkerServedRef === null ? null : {
      planned_model: lineageOfModel(models.checkerPlanned),
      served_model: lineageOfModel(models.checkerServed),
      lower_cost: row.checkerFallback
    },
    checker_same_as_writer: row.checkerSameAsWriter,
    digest: {
      // Any rung above the whole digest is a shortened one (spec §14.4.3).
      compacted: row.digestRung !== null && row.digestRung > 0,
      points_left_out: row.digestPointsOmitted ?? 0
    },
    cut_short: { arguing: row.bodyStop, answer_writing: row.serveStop }
  };
}

export class RepositoryAnswerDisclosureApplication implements AnswerDisclosureApplication {
  constructor(private readonly repository: Pick<ServeDisclosureRepository, "readLatestForAnswer">) {}

  async readDisclosure(input: Readonly<{
    answerId: string;
    ownership: RunOwnershipAccess;
  }>): Promise<AnswerDisclosure | null> {
    const read = await this.repository.readLatestForAnswer({
      answerId: input.answerId,
      ownership: { ownerRef: input.ownership.ownerRef, legacyAskerId: input.ownership.legacyAskerId }
    });
    return read === null ? null : buildAnswerDisclosure(read);
  }
}
