import type { PromptPacket } from "../../packages/providers/src/index.js";
import { PublicationJudgeFailure, type PublicationJudgePort } from "../../apps/api/src/publication-check/check.js";

export type JudgeStubStep = string | Error | ((input: Parameters<PublicationJudgePort["complete"]>[0]) => Promise<{ text: string }>);

/** Only the external judge is scripted; framing, validation and recording remain real. */
export function createJudgeStub(script: readonly JudgeStubStep[]): PublicationJudgePort & { packets: PromptPacket[] } {
  const packets: PromptPacket[] = [];
  return {
    providerRef: "test:judge", modelId: "test-model", packets,
    async complete(input) {
      const step = script[packets.length];
      packets.push(input.packet);
      if (step instanceof Error) throw step;
      if (typeof step === "function") return step(input);
      if (typeof step !== "string") throw new PublicationJudgeFailure("JUDGE_TRANSPORT_FAILED");
      return { text: step };
    }
  };
}
