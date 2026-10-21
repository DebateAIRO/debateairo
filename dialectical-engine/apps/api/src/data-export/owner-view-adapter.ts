import type { RunContentKeyStore } from "@debateai/crypto";
import {
  ownerSession, readOwnerRun, readOwnerRunAnswer, readOwnerAnswer, readOwnerInspection,
  readOwnerLedgerDigest, readOwnerStory, readOwnerDisclosure, readOwnerNode,
  type OwnerReadDeps
} from "../owner-read.js";
import type { OwnerViewPort } from "./snapshot.js";
import type { SynthesisCheckEntry } from "./types.js";
import { OPEN_SYNTHESIS_ANSWER_ACCESS } from "../synthesis-check/hold.js";

export class OwnerViewAdapter implements OwnerViewPort {
  constructor(
    private readonly deps: OwnerReadDeps,
    private readonly keys: Pick<RunContentKeyStore, "exists">,
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
}
