import type { RunContentKeyStore } from "@debateai/crypto";
import {
  ownerSession, readOwnerRun, readOwnerRunAnswer, readOwnerAnswer, readOwnerInspection,
  readOwnerLedgerDigest, readOwnerStory, readOwnerDisclosure, readOwnerNode,
  type OwnerReadDeps
} from "../owner-read.js";
import type { OwnerViewPort } from "./snapshot.js";
import type { SynthesisCheckEntry } from "./types.js";
import type { PublicationReviewEntry } from "./types.js";
import type { PublicationReviewRepository } from "@debateai/serve";
import { OPEN_SYNTHESIS_ANSWER_ACCESS } from "../synthesis-check/hold.js";

export class OwnerViewAdapter implements OwnerViewPort {
  constructor(
    private readonly deps: OwnerReadDeps,
    private readonly keys: Pick<RunContentKeyStore, "exists">,
    private readonly reviews: Pick<PublicationReviewRepository, "readStates">,
    private readonly sessionId: string = "00000000-0000-0000-0000-000000000000"
  ) {}

  private access(ownerRef: string) {
    return { session: ownerSession(ownerRef, this.sessionId), ownership: { ownerRef, legacyAskerId: null } };
  }

  readonly runKeyPresent = (runId: string): Promise<boolean> => this.keys.exists(runId);
  readonly runRemovedByCheck = async (runId: string): Promise<boolean> =>
    (await (this.deps.synthesisAnswerAccess ?? OPEN_SYNTHESIS_ANSWER_ACCESS).stateOf({ runId })) === "REMOVED";
  readonly readSynthesisChecks = (ownerRef: string, answerId: string): Promise<readonly SynthesisCheckEntry[]> => {
    const a = this.access(ownerRef);
    return this.deps.application.readSynthesisChecks?.(answerId, a.session, a.ownership) ?? Promise.resolve([]);
  };
  readonly readPublicationReviews = async (ownerRef: string, runId: string, answerId: string): Promise<readonly PublicationReviewEntry[]> => {
    const records = await this.reviews.readStates({ ownerRef, runId, answerId });
    return records.map((record) => {
      if (!(record.askedAt instanceof Date) || !Number.isFinite(record.askedAt.getTime())) {
        throw new Error("PUBLICATION_REVIEW_ASKED_AT_MISSING");
      }
      return {
        asked_at: record.askedAt.toISOString(),
        outcome: record.decision?.outcome ?? null,
        decided_at: record.decision?.decidedAt.toISOString() ?? null,
        reason: record.decision?.outcome === "REFUSE" ? record.decision.reason ?? null : null,
      };
    });
  };
  readonly readRun = (ownerRef: string, runId: string): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerRun(this.deps, runId, a.session, a.ownership);
  };
  readonly readRunAnswer = (ownerRef: string, runId: string): Promise<unknown | null> => {
    const a = this.access(ownerRef); return readOwnerRunAnswer(this.deps, runId, a.session, a.ownership);
  };
  readonly readAnswer = (ownerRef: string, answerId: string, version: number): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerAnswer(this.deps, answerId, version, a.session, a.ownership);
  };
  readonly readInspection = (ownerRef: string, answerId: string, version: number): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerInspection(this.deps, answerId, version, a.session, a.ownership);
  };
  readonly readLedgerDigest = (ownerRef: string, answerId: string): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerLedgerDigest(this.deps, answerId, a.session, a.ownership);
  };
  readonly readStory = (ownerRef: string, answerId: string): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerStory(this.deps, answerId, a.session, a.ownership);
  };
  readonly readDisclosure = (ownerRef: string, answerId: string): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerDisclosure(this.deps, answerId, a.session, a.ownership);
  };
  readonly readNode = (ownerRef: string, answerId: string, nodeId: string): Promise<unknown> => {
    const a = this.access(ownerRef); return readOwnerNode(this.deps, answerId, nodeId, a.session, a.ownership);
  };
  /** Side-by-side C9: the application's resolution, or the id itself when the application has none. */
  readonly resolveRunRef = async (runId: string): Promise<string> =>
    this.deps.application.resolveRunRef === undefined ? runId : this.deps.application.resolveRunRef(runId);
}
