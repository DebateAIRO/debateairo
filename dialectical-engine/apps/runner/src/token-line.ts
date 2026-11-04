import { createHash } from "node:crypto";
import { ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND, ANTHROPIC_TOKEN_COUNT, buildFramedPrompt, createAnthropicTokenCounter, type PromptContract, type PromptPacket, type TokenCounter } from "@debateai/providers";
import {
  PATH_REWRITE_WRITER_V2_PROMPT_CONTRACT, REPORT_STORY_PROMPT_CONTRACT, STORY_PATHS_LADDER, STORY_PATHS_LIMITS, STORY_PATHS_PROMPT_CONTRACT, storyPathsBodyBytes,
  storyPathsMaterial, type ReportAnswerDraft, type ReportCallMaterial
} from "@debateai/story";
import {
  INVESTIGATION_REPORT_ASK_ROOM_BYTES, INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES, buildInvestigationDossier, type DossierBuilt, type DossierInput
} from "./investigation-dossier.js";
import {
  PATH_REWRITE_ROUND_TWO_ROOM_BYTES, buildPathRewriteMaterial, pathRewriteBodyBytes, type PathRewriteMaterial, type PathRewriteMaterialInput
} from "./path-rewrite-material.js";

/**
 * R22 DECISION 28, THE REAL COUNT WHERE MATERIAL IS FITTED. Haiku's calls stay under 100,000 tokens, and bytes are only an estimate. The
 * byte ladders (the dossier's, the rewrite's) fit first; then, when the largest call looks close to the line
 * (`ANTHROPIC_TOKEN_COUNT.fromEstimate`, on its bytes with the room it must keep for round 2), Anthropic's free count is asked for that
 * call, and one over the line goes down the same ladder. Every attempt is checked again as it leaves (the gateway's `sentInputTokensBelow`).
 * A small call has no extra step. A failed count stops nothing: the byte guard's answer stands, and the counter logs it.
 *
 * It only ever trims. A count under the line never lets a call past the byte guard (bytes / 2 is far above the
 * real count for Latin text, so a real count could carry much more).
 *
 * THE FENCE COUNTED is fixed by code, not the call's own random one, so a closing run again counts the same bytes and lands on the same step.
 */
/**
 * The count for a target whose calls go on Anthropic's wire, by the way those calls reach it: the same base URL, the same key, the same
 * fetch (on the preview, the guarded fetch to its gate). Any other target has none.
 */
export function targetTokenCounter(target: Readonly<{ adapterKind?: string; baseUrl: string; model: string; authorizationHeader?: string }>,
  fetchImplementation: typeof fetch | undefined, log: Log): TokenCounter | undefined {
  if (target.adapterKind !== ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND) return undefined;
  return createAnthropicTokenCounter({ endpoint: target.baseUrl, model: target.model,
    ...(target.authorizationHeader === undefined ? {} : { authorizationHeader: target.authorizationHeader }),
    ...(fetchImplementation === undefined ? {} : { fetchImplementation }), log });
}

const COUNT_TRIES = 6;
const roomTokens = (bytes: number): number => Math.ceil(bytes / 2);
const looksClose = (bytes: number): boolean => bytes / 2 >= ANTHROPIC_TOKEN_COUNT.fromEstimate;
const countingBytes = (size: number): Buffer => createHash("sha256").update(`debateai.token-count.fence.${String(size)}`, "utf8").digest().subarray(0, Math.min(size, 32));

/** The packet to count: `null` when it cannot be framed under the counted fence (then there is no count, and the byte guard stands). */
function countedPacket(contract: PromptContract, material: Parameters<typeof buildFramedPrompt>[0]["material"]): PromptPacket | null {
  try {
    return buildFramedPrompt({ contract, material, randomBytes: countingBytes }).packet;
  } catch {
    return null;
  }
}

type Log = (event: string, detail: Record<string, unknown>) => void;
const PLACEHOLDER: ReportAnswerDraft = Object.freeze({ segments: [Object.freeze({ text: "-", rests_on: [] })] });

/** Whether this material's largest call, with `room` bytes more to come, is over the line by the real count; a failed count: no. */
async function reportOver(material: ReportCallMaterial, room: number, tokenCount: TokenCounter): Promise<boolean> {
  const packet = countedPacket(REPORT_STORY_PROMPT_CONTRACT, material.storyWriterOf(PLACEHOLDER));
  if (packet === null || !looksClose(pathRewriteBodyBytes(packet) + room)) return false;
  const real = await tokenCount({ packet, ...(material.sharedFieldCount === undefined ? {} : { sharedFirstFieldCount: material.sharedFieldCount }) });
  return real !== null && real + roomTokens(room) >= ANTHROPIC_TOKEN_COUNT.line;
}

/** The dossier, on the first ladder place whose largest call the real count also lets through. */
export async function fitDossierToTokenLine(input: DossierInput, tokenCount: TokenCounter | undefined, log: Log): Promise<DossierBuilt> {
  if (tokenCount === undefined) return buildInvestigationDossier(input);
  const askedFits = async (material: ReportCallMaterial) => !(await reportOver(material, INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES, tokenCount));
  let built = buildInvestigationDossier(input, { askedFits });
  // A place further down each time: a tree far over the line is not counted many times over.
  for (let tries = 0, jump = 1; tries < COUNT_TRIES && built.kind === "BUILT"; tries += 1, jump *= 2) {
    const room = INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES + (built.material.deeper === undefined ? 0 : INVESTIGATION_REPORT_ASK_ROOM_BYTES);
    if (!(await reportOver(built.material, room, tokenCount))) return built;
    log("INVESTIGATION_REPORT_OVER_THE_TOKEN_LINE", { ladderAt: built.ladderAt });
    built = buildInvestigationDossier(input, { askedFits, fromLadderAt: built.ladderAt + jump });
  }
  return built;
}

/** The rewrite's material, on the first ladder step whose largest call the real count also lets through. */
export async function fitRewriteToTokenLine(input: PathRewriteMaterialInput, tokenCount: TokenCounter | undefined, log: Log): Promise<PathRewriteMaterial> {
  let built = buildPathRewriteMaterial(input);
  if (tokenCount === undefined) return built;
  while (built.kind === "BUILT") {
    const packet = countedPacket(PATH_REWRITE_WRITER_V2_PROMPT_CONTRACT, built.material.writer);
    if (packet === null || !looksClose(pathRewriteBodyBytes(packet) + PATH_REWRITE_ROUND_TWO_ROOM_BYTES)) return built;
    const real = await tokenCount({ packet });
    if (real === null || real + roomTokens(PATH_REWRITE_ROUND_TWO_ROOM_BYTES) < ANTHROPIC_TOKEN_COUNT.line) return built;
    log("PATH_REWRITE_OVER_THE_TOKEN_LINE", { ladderStep: built.ladderStep });
    built = buildPathRewriteMaterial(input, { fromStep: built.ladderStep + 1 });
  }
  return built;
}

/**
 * V4 start step, Task 51: a path run's story material, on the first ladder step whose storyteller packet (the larger of its two first
 * packets) the real count also lets through with the round-two room, counted with its shared fields first as they are sent. The step
 * found goes to the story writer as `pathsFromStep`, so the writer never starts again at step 1. The last step has nothing below it,
 * so it is not counted.
 */
export async function fitStoryPathsToTokenLine(input: Parameters<typeof storyPathsMaterial>[0], tokenCount: TokenCounter | undefined,
  log: Log): Promise<ReturnType<typeof storyPathsMaterial>> {
  let built = storyPathsMaterial(input);
  if (tokenCount === undefined) return built;
  const room = STORY_PATHS_LIMITS.roundTwoRoomBytes;
  while (built.ladderStep < STORY_PATHS_LADDER.length) {
    const packet = countedPacket(STORY_PATHS_PROMPT_CONTRACT, built.fields);
    if (packet === null || !looksClose(storyPathsBodyBytes(packet) + room)) return built;
    const real = await tokenCount({ packet, sharedFirstFieldCount: built.sharedFieldCount });
    if (real === null || real + roomTokens(room) < ANTHROPIC_TOKEN_COUNT.line) return built;
    log("STORY_PATHS_OVER_THE_TOKEN_LINE", { ladderStep: built.ladderStep });
    built = storyPathsMaterial(input, { fromStep: built.ladderStep + 1 });
  }
  return built;
}
