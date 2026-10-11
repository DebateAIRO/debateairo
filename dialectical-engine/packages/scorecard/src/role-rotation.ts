import { createHash } from "node:crypto";

/**
 * Per-debate rotation of the four single-model roles (spec 2026-10-11, Part 2, rule
 * LEAST_SHARE_SEEDED_TIE_V1): each role goes to the debate's own panel member with the
 * smallest share of that role among the earlier rotated debates it was eligible for
 * (picked / eligible, compared exactly; never eligible = share 0), then the fewest picks,
 * then a fixed shuffle seeded from the ask. A checker is never its writer's maker.
 * Pure: the caller reads the counts.
 */
export const ROTATED_ROLES = Object.freeze(["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"] as const);
export type RotatedRole = typeof ROTATED_ROLES[number];
export const ROLE_ROTATION_RULE = "LEAST_SHARE_SEEDED_TIE_V1" as const;
const TIE_SALT = "ROLE_ROTATION_V1";

export type RotationPanelMember = Readonly<{ provider_ref: string; maker: string; model_id: string }>;
export type RotationPick = Readonly<{ providerRef: string; modelId: string; maker: string }>;
export type RotatedRoles = Readonly<{
  rule: typeof ROLE_ROTATION_RULE;
  answerWriter: RotationPick; answerChecker: RotationPick; storyteller: RotationPick; storyChecker: RotationPick;
  /** The eligible members' model ids (one per maker), in panel order: what the pin records. */
  eligibleModelIds: readonly string[];
}>;
/** One model in one role: earlier pins naming it (`picked`) out of earlier pins it was eligible in (`eligible`). */
export type RoleRotationTally = Readonly<{ picked: number; eligible: number }>;
/** Per role, per model id. A model absent here counts as picked 0 of eligible 0 (share 0). */
export type RoleRotationCounts = Readonly<Partial<Record<RotatedRole, Readonly<Record<string, RoleRotationTally>>>>>;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const invalid = (): never => { throw new TypeError("ROLE_ROTATION_INPUT_INVALID"); };
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The ask's own seed: in memory only, never stored, logged or sent. */
export function roleRotationSeed(ask: Readonly<{ as_of: string; question_line: string }>): string {
  return sha256(JSON.stringify([ask.as_of, ask.question_line]));
}

/** The panel, one member per maker (first in panel order): two refs of one model are one candidate. */
export function rotationEligible(panel: readonly RotationPanelMember[]): readonly RotationPick[] {
  const seen = new Set<string>();
  const eligible: RotationPick[] = [];
  for (const member of panel) {
    if (seen.has(member.maker)) continue;
    seen.add(member.maker);
    eligible.push(Object.freeze({ providerRef: member.provider_ref, modelId: member.model_id, maker: member.maker }));
  }
  return Object.freeze(eligible);
}

function assertCounts(counts: RoleRotationCounts): void {
  if (typeof counts !== "object" || counts === null) invalid();
  for (const byModel of Object.values(counts) as unknown[]) {
    if (byModel === undefined) continue;
    if (typeof byModel !== "object" || byModel === null) invalid();
    for (const tally of Object.values(byModel as object) as unknown[]) {
      if (typeof tally !== "object" || tally === null) invalid();
      const { picked, eligible } = tally as { picked?: unknown; eligible?: unknown };
      if (!isCount(picked) || !isCount(eligible) || picked > eligible) invalid();
    }
  }
}

type Candidate = Readonly<{ pick: RotationPick; picked: bigint; eligible: bigint; tie: string }>;

/** share ascending (a/b vs c/d as a*d vs c*b, eligible 0 = share 0), then picked, then tie key (text). */
function compareCandidates(left: Candidate, right: Candidate): number {
  const leftShare = left.eligible === 0n ? [0n, 1n] : [left.picked, left.eligible];
  const rightShare = right.eligible === 0n ? [0n, 1n] : [right.picked, right.eligible];
  const crossLeft = leftShare[0]! * rightShare[1]!;
  const crossRight = rightShare[0]! * leftShare[1]!;
  if (crossLeft !== crossRight) return crossLeft < crossRight ? -1 : 1;
  if (left.picked !== right.picked) return left.picked < right.picked ? -1 : 1;
  return left.tie < right.tie ? -1 : left.tie > right.tie ? 1 : 0;
}

export function pickRotatedRoles(input: Readonly<{
  panel: readonly RotationPanelMember[]; counts: RoleRotationCounts; seed: string;
}>): RotatedRoles | null {
  if (typeof input.seed !== "string" || !/^[0-9a-f]{64}$/u.test(input.seed)) invalid();
  assertCounts(input.counts);
  const eligible = rotationEligible(input.panel);
  if (eligible.length < 2) return null;
  const ordered = (role: RotatedRole): readonly RotationPick[] => eligible
    .map((pick): Candidate => {
      const tally = Object.hasOwn(input.counts[role] ?? {}, pick.modelId) ? input.counts[role]![pick.modelId] : undefined;
      return {
        pick,
        picked: BigInt(tally?.picked ?? 0),
        eligible: BigInt(tally?.eligible ?? 0),
        tie: sha256([TIE_SALT, input.seed, role, pick.modelId].join("\u0000"))
      };
    })
    .sort(compareCandidates)
    .map((candidate) => candidate.pick);
  const first = (role: RotatedRole, avoidMaker?: string): RotationPick => ordered(role).find((pick) => pick.maker !== avoidMaker)!;
  const answerWriter = first("ANSWER_WRITER");
  const storyteller = first("STORYTELLER");
  return Object.freeze({
    rule: ROLE_ROTATION_RULE,
    answerWriter, answerChecker: first("ANSWER_CHECKER", answerWriter.maker),
    storyteller, storyChecker: first("STORY_CHECKER", storyteller.maker),
    eligibleModelIds: Object.freeze(eligible.map((pick) => pick.modelId))
  });
}
