import { createHash } from "node:crypto";

/**
 * Per-debate rotation of the four single-model roles (spec 2026-10-11, Part 2, rule
 * LEAST_SHARE_SEEDED_TIE_V1): each role goes to the debate's own panel member with the
 * smallest share of that role among the earlier rotated debates it was eligible for
 * (picked / eligible, compared exactly; never eligible = share 0), then the fewest picks,
 * then a fixed shuffle seeded from the ask. A checker is never its writer's maker.
 * Pure: the caller reads the counts.
 *
 * Opener rotation (spec 2026-10-11 Part 2, option B; owner rulings R2, R5-R7): root position 0 is a fifth
 * pick by the same rule (role OPENER in the tie key), with no maker constraint and independent of the four
 * roles. It is not stored in a column of its own: the pin's `eligible_model_ids` is written in the
 * debate's position order, opener first (R5: [opener, the members after it in panel order, then the
 * members before it]), and the counts read the opener as that array's first entry. Pins written before
 * this were in panel order, whose first entry was the debate's actual opener, so they count as true
 * history (R6). The same `answerRoleRotationPolicy` switch governs it (R7).
 */
export const ROTATED_ROLES = Object.freeze(["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"] as const);
export type RotatedRole = typeof ROTATED_ROLES[number];
/** The roles the counts are kept for: the four rotated roles and the opener (root position 0). */
export type RotationCountRole = RotatedRole | "OPENER";
export const ROLE_ROTATION_RULE = "LEAST_SHARE_SEEDED_TIE_V1" as const;
const TIE_SALT = "ROLE_ROTATION_V1";

export type RotationPanelMember = Readonly<{ provider_ref: string; maker: string; model_id: string }>;
export type RotationPick = Readonly<{ providerRef: string; modelId: string; maker: string }>;
export type RotatedRoles = Readonly<{
  rule: typeof ROLE_ROTATION_RULE;
  answerWriter: RotationPick; answerChecker: RotationPick; storyteller: RotationPick; storyChecker: RotationPick;
  /** Root position 0's member (owner ruling R2); always the first entry of `eligibleModelIds`. */
  opener: RotationPick;
  /**
   * The eligible members' model ids (one per maker), in the debate's position order, opener first (R5):
   * what the pin records, and the order the runner seats the debaters in.
   */
  eligibleModelIds: readonly string[];
}>;
/** One model in one role: earlier pins naming it (`picked`) out of earlier pins it was eligible in (`eligible`). */
export type RoleRotationTally = Readonly<{ picked: number; eligible: number }>;
/** Per role (the opener included), per model id. A model absent here counts as picked 0 of eligible 0 (share 0). */
export type RoleRotationCounts = Readonly<Partial<Record<RotationCountRole, Readonly<Record<string, RoleRotationTally>>>>>;

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
  const ordered = (role: RotationCountRole): readonly RotationPick[] => eligible
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
  const first = (role: RotationCountRole, avoidMaker?: string): RotationPick => ordered(role).find((pick) => pick.maker !== avoidMaker)!;
  const answerWriter = first("ANSWER_WRITER");
  const storyteller = first("STORYTELLER");
  const opener = first("OPENER");
  // R5: the members shift round in turn, so the second speaker (root position 1) rotates as well.
  const at = eligible.indexOf(opener);
  const positionOrder = [...eligible.slice(at), ...eligible.slice(0, at)];
  return Object.freeze({
    rule: ROLE_ROTATION_RULE,
    answerWriter, answerChecker: first("ANSWER_CHECKER", answerWriter.maker),
    storyteller, storyChecker: first("STORY_CHECKER", storyteller.maker),
    opener,
    eligibleModelIds: Object.freeze(positionOrder.map((pick) => pick.modelId))
  });
}

/**
 * Opener rotation (spec 2026-10-11 Part 2, option B): the fields the pin stores. The opener has no column of its
 * own; it is the first entry of `eligibleModelIds`, which the pin keeps in this order.
 */
export function rotationPinFields(rotated: RotatedRoles): Omit<RotatedRoles, "opener"> {
  return Object.freeze({
    rule: rotated.rule,
    answerWriter: rotated.answerWriter, answerChecker: rotated.answerChecker,
    storyteller: rotated.storyteller, storyChecker: rotated.storyChecker,
    eligibleModelIds: rotated.eligibleModelIds
  });
}
