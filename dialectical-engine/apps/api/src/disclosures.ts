import { FloorReasonSchema, type AnswerDisclosure, type AnswerFloor, type MakerLineage } from "@debateai/contract";
import type {
  RunOwnershipAccess,
  ServeDisclosureModel,
  ServeDisclosureRead,
  ServeDisclosureRepository,
  StoredServeDisclosure,
  StoredServeFloor
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
  /**
   * The floor alone (M5 review, M6), for the story route: is this
   * components-only answer one whose label stands as its floor? No model
   * lookups. Same ownership and latest-version rule as `readDisclosure`.
   */
  readFloor(input: Readonly<{
    answerId: string;
    ownership: RunOwnershipAccess;
  }>): Promise<AnswerFloor | null>;
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

/**
 * The floor of a components-only answer, or null. The row's CHECK keeps its
 * three stored fields all set or all null, and the repository refuses a floor
 * read without the label receipt `basisIncomplete` comes from.
 */
export function floorOfDisclosure(row: StoredServeDisclosure): AnswerFloor | null {
  return row.floorVerdictState === null || row.floorLeadingNodeId === null || row.floorBasisIncomplete === null
    ? null
    : {
      verdict_state: row.floorVerdictState,
      leading_node_id: row.floorLeadingNodeId,
      basis_incomplete: row.floorBasisIncomplete
    };
}

/** The same floor, from the floor-only read. */
export function floorOfStored(floor: StoredServeFloor): AnswerFloor {
  return { verdict_state: floor.verdictState, leading_node_id: floor.leadingNodeId, basis_incomplete: floor.basisIncomplete };
}

export function buildAnswerDisclosure(read: ServeDisclosureRead): AnswerDisclosure {
  const { row, models } = read;
  const floor = floorOfDisclosure(row);
  return {
    answer_id: row.answerId,
    answer_version: row.answerVersion,
    floor,
    // Owner-only: the sealed cause, a closed list the contract names. The
    // runner writes only the sealed crash classes; anything else is refused at
    // the parse, never shown as it is.
    floor_reason: floor === null ? null : FloorReasonSchema.parse(row.floorReason),
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
    // Any rung above the whole digest is a shortened one (spec §14.4.3); no
    // rung means no digest was handed to the answer-writer at all.
    digest: row.digestRung === null ? null : {
      compacted: row.digestRung > 0,
      points_left_out: row.digestPointsOmitted ?? 0
    },
    cut_short: { arguing: row.bodyStop, answer_writing: row.serveStop }
  };
}

export class RepositoryAnswerDisclosureApplication implements AnswerDisclosureApplication {
  constructor(
    private readonly repository: Pick<ServeDisclosureRepository, "readLatestForAnswer" | "readLatestFloorForAnswer">
  ) {}

  async readFloor(input: Readonly<{
    answerId: string;
    ownership: RunOwnershipAccess;
  }>): Promise<AnswerFloor | null> {
    const floor = await this.repository.readLatestFloorForAnswer({
      answerId: input.answerId,
      ownership: { ownerRef: input.ownership.ownerRef, legacyAskerId: input.ownership.legacyAskerId }
    });
    return floor === null ? null : floorOfStored(floor);
  }

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
