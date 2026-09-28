import { DEBATE_ROLES } from "@debateai/kernel";
import { ModelStrengthSchema, type AnswerModelAssignment } from "@debateai/contract";
import { RoleAssignmentSchema, type SeatCandidate } from "@debateai/scorecard";

/** One pinned `core.run_role_assignment` row as the answer projection selects it. */
export type PinnedRoleAssignmentRow = Readonly<{ assignment: unknown; strength: unknown; stepped_down: unknown }>;

/** The operator line's typed code (also in the api and runner known-code lists). */
const ANSWER_MODEL_ASSIGNMENT_INVALID = "ANSWER_MODEL_ASSIGNMENT_INVALID";

type AnswerModelSeat = AnswerModelAssignment["roles"][number]["seats"][number]["main"];

function seatView(candidate: SeatCandidate): AnswerModelSeat {
  return { maker: candidate.maker, model_id: candidate.modelId, thinking_level: candidate.thinkingLevel };
}

/**
 * A21 — the pinned assignment as the served answer carries it (the honesty
 * drawer lists only its model names, owner decision O1; the export keeps it
 * whole), or undefined when the run pinned none.
 *
 * Fix round 1 (I1): an optional field never fails an answer. A pinned row that
 * does not parse is a defect in what the engine itself sealed, and the row is
 * immutable, so throwing would fail this answer, publish, the review catch-up
 * and the owner's whole answer index for good. It is therefore omitted WHOLE
 * (never shown half) and reported by name on one operator line that carries
 * the run id and nothing of the row. A future change to DEBATE_ROLES or to
 * RoleAssignmentSchema that stops old pins parsing lands here, not on the page.
 */
export function projectModelAssignment(
  row: PinnedRoleAssignmentRow | null,
  runId: string
): AnswerModelAssignment | undefined {
  if (row === null) return undefined;
  const assignment = RoleAssignmentSchema.safeParse(row.assignment);
  const strength = ModelStrengthSchema.safeParse(row.strength);
  if (!assignment.success || !strength.success || typeof row.stepped_down !== "boolean") {
    console.error(`[${ANSWER_MODEL_ASSIGNMENT_INVALID}] run=${runId}`);
    return undefined;
  }
  return {
    strength: strength.data,
    stepped_down: row.stepped_down,
    scorecard_version: assignment.data.scorecardVersion,
    roles: DEBATE_ROLES.map((role) => ({
      role,
      seats: (assignment.data.roles[role] ?? []).map((seat) => ({
        seat_index: seat.seatIndex,
        source: seat.source,
        main: seatView(seat.main),
        runner_up: seat.runnerUp === null ? null : seatView(seat.runnerUp),
        runner_up_share: seat.diversityShare
      }))
    }))
  };
}
