import { DEBATE_ROLES, TypedDomainError } from "@debateai/kernel";
import { ModelStrengthSchema, type AnswerModelAssignment } from "@debateai/contract";
import { RoleAssignmentSchema, type SeatCandidate } from "@debateai/scorecard";

/** One pinned `core.run_role_assignment` row as the answer projection selects it. */
export type PinnedRoleAssignmentRow = Readonly<{ assignment: unknown; strength: unknown; stepped_down: unknown }>;

type AnswerModelSeat = AnswerModelAssignment["roles"][number]["seats"][number]["main"];

function seatView(candidate: SeatCandidate): AnswerModelSeat {
  return { maker: candidate.maker, model_id: candidate.modelId, thinking_level: candidate.thinkingLevel };
}

/**
 * A21 — the pinned assignment as the served answer carries it (the honesty
 * drawer lists only its model names, owner decision O1; the export keeps it
 * whole), or undefined when the run pinned none. A pinned row that does not
 * parse is a defect in what the engine itself sealed, so it is refused by name
 * rather than shown half.
 */
export function projectModelAssignment(row: PinnedRoleAssignmentRow | null): AnswerModelAssignment | undefined {
  if (row === null) return undefined;
  const assignment = RoleAssignmentSchema.safeParse(row.assignment);
  const strength = ModelStrengthSchema.safeParse(row.strength);
  if (!assignment.success || !strength.success || typeof row.stepped_down !== "boolean") {
    throw new TypedDomainError("ANSWER_MODEL_ASSIGNMENT_INVALID", "The run's pinned model assignment does not parse");
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
