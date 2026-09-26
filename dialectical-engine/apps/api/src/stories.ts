import type { RunOwnershipAccess } from "@debateai/db";
import type { StoredStory, StoryRepository } from "@debateai/story";

/**
 * Verdict story (spec 2026-09-26 §10): the owner-gated read behind
 * GET /v1/answers/{id}/story. The repository applies the ownership predicate;
 * this layer only adapts the API's ownership record to the repository's shape.
 */
export interface AnswerStoryApplication {
  readStory(input: Readonly<{
    answerId: string;
    answerVersion: number;
    ownership: RunOwnershipAccess;
  }>): Promise<StoredStory | null>;
}

/** The API resolves exactly one of the two keys; the repository takes it as an optional field. */
export function storyOwnership(ownership: RunOwnershipAccess): { ownerRef?: string; legacyAskerId?: string } {
  return {
    ...(ownership.ownerRef === null ? {} : { ownerRef: ownership.ownerRef }),
    ...(ownership.legacyAskerId === null ? {} : { legacyAskerId: ownership.legacyAskerId })
  };
}

export class RepositoryAnswerStoryApplication implements AnswerStoryApplication {
  constructor(private readonly repository: Pick<StoryRepository, "readForAnswer">) {}

  readStory(input: Readonly<{
    answerId: string;
    answerVersion: number;
    ownership: RunOwnershipAccess;
  }>): Promise<StoredStory | null> {
    return this.repository.readForAnswer({
      answerId: input.answerId,
      answerVersion: input.answerVersion,
      ownership: storyOwnership(input.ownership)
    });
  }
}
