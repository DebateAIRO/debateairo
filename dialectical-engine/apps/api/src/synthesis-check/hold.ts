import { SynthesisCheckRepository, type SynthesisAnswerAccessState } from "@debateai/serve";

export interface SynthesisAnswerAccess {
  stateOf(input: { runId: string; answerId?: string; answerVersion?: number }): Promise<SynthesisAnswerAccessState>;
  removalNoticeExists(ownerRef: string): Promise<boolean>;
  takeRemovalNotice(ownerRef: string): Promise<boolean>;
  ownerOf?(runId: string): Promise<string | null>;
}

export const OPEN_SYNTHESIS_ANSWER_ACCESS: SynthesisAnswerAccess = Object.freeze({
  stateOf: async () => "SHOW" as const,
  removalNoticeExists: async () => false,
  takeRemovalNotice: async () => false
});

export function createSynthesisAnswerAccess(input: Readonly<{
  repository: SynthesisCheckRepository;
  deadlineMs: number;
}>): SynthesisAnswerAccess {
  return {
    stateOf: (target) => input.repository.readAnswerAccess({ ...target, deadlineMs: input.deadlineMs }),
    removalNoticeExists: (ownerRef) => input.repository.removalNoticeExists(ownerRef),
    takeRemovalNotice: (ownerRef) => input.repository.takeRemovalNotice(ownerRef),
    ownerOf: (runId) => input.repository.ownerRefOfRun(runId)
  };
}
