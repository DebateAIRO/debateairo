import type { AnswerModelAssignment } from "@debateai/contract";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";

function candidate(
  providerRef: string, maker: string, modelId: string, thinkingLevel: string, candidateId: string | null
): SeatCandidate {
  return Object.freeze({ candidateId, providerRef, maker, modelId, thinkingLevel });
}

const ALPHA = candidate("provider:test-layer", "Alpha", "alpha-large", "high", "alpha-large@high");
const BETA = candidate("provider:test-layer:secondary", "Beta", "beta-large", "DEFAULT_ONLY", "beta-large@DEFAULT_ONLY");
const BETA_FALLBACK = candidate("provider:test-layer:secondary", "Beta", "beta-large", "DEFAULT_ONLY", null);

function seat(
  seatIndex: number, main: SeatCandidate, runnerUp: SeatCandidate | null = null,
  source: RoleSeat["source"] = "SCORECARD"
): RoleSeat {
  return Object.freeze({ seatIndex, main, runnerUp, diversityShare: runnerUp === null ? 0 : 0.2, source });
}

const DEBATERS = Object.freeze([seat(0, ALPHA), seat(1, BETA)]);

/** A21 test support: a two-debater assignment as the picker pins it — one runner-up, one FALLBACK seat. */
export const PINNED_ROLE_ASSIGNMENT: RoleAssignment = Object.freeze({
  scorecardVersion: 4,
  strength: "BALANCED",
  roles: Object.freeze({
    POSITION: DEBATERS,
    SUPPORT_ATTACK: DEBATERS,
    CROSS_EXCHANGE: DEBATERS,
    JUDGE: DEBATERS,
    REVIEWER: Object.freeze([seat(0, BETA), seat(1, ALPHA)]),
    ANSWER_WRITER: Object.freeze([seat(0, ALPHA, BETA)]),
    ANSWER_CHECKER: Object.freeze([seat(0, BETA_FALLBACK, null, "FALLBACK")])
  })
});

type SeatView = AnswerModelAssignment["roles"][number]["seats"][number]["main"];

const ALPHA_VIEW: SeatView = { maker: "Alpha", model_id: "alpha-large", thinking_level: "high" };
const BETA_VIEW: SeatView = { maker: "Beta", model_id: "beta-large", thinking_level: "DEFAULT_ONLY" };

function viewSeat(
  seatIndex: number, main: SeatView, runnerUp: SeatView | null = null,
  source: "SCORECARD" | "FALLBACK" = "SCORECARD"
): AnswerModelAssignment["roles"][number]["seats"][number] {
  return { seat_index: seatIndex, source, main, runner_up: runnerUp, runner_up_share: runnerUp === null ? 0 : 0.2 };
}

const DEBATER_VIEWS = [viewSeat(0, ALPHA_VIEW), viewSeat(1, BETA_VIEW)];

/** What the answer projection serves for PINNED_ROLE_ASSIGNMENT pinned with `steppedDown: true`. */
export const EXPECTED_ANSWER_MODEL_ASSIGNMENT: AnswerModelAssignment = {
  strength: "BALANCED",
  stepped_down: true,
  scorecard_version: 4,
  roles: [
    { role: "POSITION", seats: DEBATER_VIEWS },
    { role: "SUPPORT_ATTACK", seats: DEBATER_VIEWS },
    { role: "CROSS_EXCHANGE", seats: DEBATER_VIEWS },
    { role: "JUDGE", seats: DEBATER_VIEWS },
    { role: "REVIEWER", seats: [viewSeat(0, BETA_VIEW), viewSeat(1, ALPHA_VIEW)] },
    { role: "ANSWER_WRITER", seats: [viewSeat(0, ALPHA_VIEW, BETA_VIEW)] },
    { role: "ANSWER_CHECKER", seats: [viewSeat(0, BETA_VIEW, null, "FALLBACK")] }
  ]
};
