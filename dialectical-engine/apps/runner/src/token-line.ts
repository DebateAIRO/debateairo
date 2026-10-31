import { createHash } from "node:crypto";
import { ANTHROPIC_TOKEN_COUNT_FROM_ESTIMATE, ANTHROPIC_TOKEN_LINE, buildFramedPrompt, type PromptContract, type PromptPacket, type TokenCounter } from "@debateai/providers";
import { PATH_REWRITE_WRITER_V2_PROMPT_CONTRACT, REPORT_STORY_PROMPT_CONTRACT, type ReportAnswerDraft, type ReportCallMaterial } from "@debateai/story";
import {
  INVESTIGATION_REPORT_ASK_ROOM_BYTES, INVESTIGATION_REPORT_ROUND_TWO_ROOM_BYTES, buildInvestigationDossier, type DossierBuilt, type DossierInput
} from "./investigation-dossier.js";
import {
  PATH_REWRITE_ROUND_TWO_ROOM_BYTES, buildPathRewriteMaterial, pathRewriteBodyBytes, type PathRewriteMaterial, type PathRewriteMaterialInput
} from "./path-rewrite-material.js";

/**
 * R22 DECISION 28, THE REAL COUNT WHERE MATERIAL IS FITTED. Haiku's calls stay under 100,000 tokens, and bytes are only an estimate. The
 * byte ladders (the dossier's, the rewrite's) fit first; then, when the largest call looks close to the line
 * (`ANTHROPIC_TOKEN_COUNT_FROM_ESTIMATE`, on its bytes with the room it must keep for round 2), Anthropic's free count is asked for that
 * call, and one over the line goes down the same ladder. Every attempt is checked again as it leaves (the gateway's `sentInputTokensBelow`).
 * A small call has no extra step. A failed count stops nothing: the byte guard's answer stands, and the counter logs it.
 *
 * It only ever trims. A count under the line never lets a call past the byte guard (see the report to the owner: bytes / 2 is far above the
 * real count for Latin text, so a real count could carry much more).
 *
 * THE FENCE COUNTED is fixed by code, not the call's own random one, so a closing run again counts the same bytes and lands on the same step.
 */
const COUNT_TRIES = 6;
const roomTokens = (bytes: number): number => Math.ceil(bytes / 2);
const looksClose = (bytes: number): boolean => bytes / 2 >= ANTHROPIC_TOKEN_COUNT_FROM_ESTIMATE;
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
  return real !== null && real + roomTokens(room) >= ANTHROPIC_TOKEN_LINE;
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
    if (real === null || real + roomTokens(PATH_REWRITE_ROUND_TWO_ROOM_BYTES) < ANTHROPIC_TOKEN_LINE) return built;
    log("PATH_REWRITE_OVER_THE_TOKEN_LINE", { ladderStep: built.ladderStep });
    built = buildPathRewriteMaterial(input, { fromStep: built.ladderStep + 1 });
  }
  return built;
}
