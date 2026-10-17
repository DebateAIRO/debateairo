import {
  PROVIDER_CONTENT_LENGTH_EXCEEDED,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderGateway
} from "@debateai/providers";
import type { StoryRoleMaker } from "./writer.js";

/**
 * THE BACKUP STORYTELLER (engine redesign R1d; spec 2026-10-15 §7.2 item 11, P4.6, G7; INTERFACE §5.3; R1d decision 5).
 *
 * Under story v4 only, and only when the FIRST run of the write-and-check loop ends FAILED with no draft because round 1's
 * write failed, the writer reads that write's error here. Four signals mean the first AI really could not provide the
 * story: it could not be reached (the transport failed, or it was busy past its wait budget), it was too slow for the
 * deadline (its call timed out), it ran out of room thinking twice, the second time at its lowest level (two of the
 * call's attempts were cut off at the token ceiling, and the last ran at LG-B's one-level-lower level, or at the call's
 * own level when it has no lower one: the gateway's `outOfRoom` facts; a single cut-off is no signal), or its reply
 * stayed unusable after the code fixer, LG-A's structure-repair call and the salvage's follow-up (a repair try that was
 * itself cut off after an earlier refusal counts here). A follow-up that died records the transport signal. Every other
 * ending — the story's money, the run's money, the day's or the person's allowance, the attempt allowance, the call lane
 * stopping or holding the call back, an erased run, anything unknown — is no signal: another AI would meet the same
 * wall, so no backup is asked. A money stop the structure-repair call met keeps its name (structure-repair.ts passed
 * stops), so it is no signal either. The picker then names the first candidate, in the order the runner hands them over
 * (the run's stored panel order, already without the makers the sit-out book has benched, Task 18), whose maker is
 * neither the first storyteller's nor the checker's. Those two makers are read from every claim-eligible member of the
 * run BEFORE the sit-out filter (`makers`), so a benched first storyteller or an out-of-panel register checker still
 * excludes its maker: the maker exclusion comes first, the sit-out filter after it. Pure; codes only. (Pre-flight
 * PF-D6.1, PF-D6.4, PF-D6.5; controller rulings "backup vs sit-out book" and W1.)
 */

export const STORY_BACKUP_SIGNALS = Object.freeze(["UNREACHABLE", "TOO_SLOW", "OUT_OF_ROOM", "UNUSABLE"] as const);
export type StoryBackupSignal = typeof STORY_BACKUP_SIGNALS[number];

/** The code stored on a story a backup storyteller wrote (sealed content member `backup`) and logged when one is asked. */
export const STORY_BACKUP_USED = "STORY_BACKUP_USED" as const;

/** The sealed record: the code, the signal, and the first storyteller's provider ref (`firstModel`). */
export type StoryBackupRecord = Readonly<{
  code: typeof STORY_BACKUP_USED;
  signal: StoryBackupSignal;
  firstModel: string;
}>;

/**
 * One of the run's claim-eligible members, as the runner hands it over: its own gateway, its ref, its maker. The runner
 * leaves out the makers its sit-out book has benched (Task 18, controller ruling "backup vs sit-out book").
 */
export type StoryBackupCandidate = Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>;

/**
 * One claim-eligible member's maker, as the runner hands every one over BEFORE the sit-out filter (whole-branch review
 * Minor 1, ruling W1): the backup's maker rule reads the resolved roles' makers here, even when their refs are not
 * candidates (benched, or a register ref outside the panel).
 */
export type StoryBackupMaker = Readonly<{ providerRef: string; maker: string }>;

/** Spec §7.2 item 11 (c): out of room thinking TWICE, the second time at the lowest level (pre-flight PF-D6.5). */
const STORY_OUT_OF_ROOM_RULE = Object.freeze({ cutOffs: 2 });

/** The signal a failed round-1 write gives, or null (no backup). Reads the typed error's class and fields only. */
export function storyBackupSignalOf(error: unknown): StoryBackupSignal | null {
  if (error instanceof ProviderContentUnacceptedError) {
    if (error.lastParseStatus !== PROVIDER_CONTENT_LENGTH_EXCEEDED) return "UNUSABLE";
    // Pre-flight PF-D6.5 (controller ruling: the spec exactly). A cut-off is (c) only after two, the last at the lowest
    // level. A repair try cut off after an earlier refusal of another kind (fewer cut-offs than attempts) left the reply
    // unusable after repair: (d). A single cut-off, two above the lowest level, or facts the gateway did not give: none.
    const room = error.outOfRoom;
    if (room === null) return null;
    if (room.cutOffs >= STORY_OUT_OF_ROOM_RULE.cutOffs && room.lastAtLowestLevel) return "OUT_OF_ROOM";
    return room.cutOffs < error.attempts ? "UNUSABLE" : null;
  }
  if (error instanceof ProviderCallFailedError) return error.lastOutcome === "TIMED_OUT" ? "TOO_SLOW" : "UNREACHABLE";
  return null;
}

/**
 * The backup storyteller: the first candidate, in the given order, whose maker is neither the first storyteller's maker nor
 * the checker's maker. A role's maker is read from `makers` (every claim-eligible member, before the sit-out filter),
 * then from the candidates; a ref found in neither excludes only that ref. None: null.
 */
export function pickBackupStoryteller(input: Readonly<{
  candidates: readonly StoryBackupCandidate[];
  firstRef: string;
  checkerRef: string;
  makers?: readonly StoryBackupMaker[] | undefined;
}>): StoryRoleMaker | null {
  const known: readonly StoryBackupMaker[] = [...(input.makers ?? []), ...input.candidates];
  const makerOf = (ref: string): string | null => known.find((member) => member.providerRef === ref)?.maker ?? null;
  const excludedMakers = new Set([makerOf(input.firstRef), makerOf(input.checkerRef)].filter((maker): maker is string => maker !== null));
  const chosen = input.candidates.find((candidate) => candidate.providerRef !== input.firstRef
    && candidate.providerRef !== input.checkerRef
    && !excludedMakers.has(candidate.maker));
  return chosen === undefined ? null : Object.freeze({ provider: chosen.provider, providerRef: chosen.providerRef });
}
