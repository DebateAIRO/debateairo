import type { PublicStoryShort } from "@debateai/contract";
import type { RunOwnershipAccess } from "@debateai/db";
import { toPublicStoryShort, type StoredStory, type StoryRepository } from "@debateai/story";
import type { PublicationStoryReader } from "./publications.js";

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

/** Publish-time reader: the owner's own story for the exact answer version being published. */
export class RepositoryPublicationStoryReader implements PublicationStoryReader {
  constructor(private readonly repository: Pick<StoryRepository, "readForAnswer">) {}

  async readStoryShort(input: Readonly<{
    answerId: string;
    answerVersion: number;
    ownerRef: string;
  }>): Promise<PublicStoryShort | null> {
    const stored = await this.repository.readForAnswer({
      answerId: input.answerId,
      answerVersion: input.answerVersion,
      ownership: { ownerRef: input.ownerRef }
    });
    return stored === null ? null : toPublicStoryShort(stored);
  }
}
