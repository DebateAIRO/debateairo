import { randomUUID } from "node:crypto";
import type { SupportActionId } from "@debateai/support-kb/catalog";
import type { SupportDraft } from "./response-policy.js";

export type SupportModelReferenceKind = "source" | "action";
export type SupportModelReferenceFactory = Readonly<{
  referenceFor(kind: SupportModelReferenceKind,index: number): string;
}>;
export type SupportModelReferencePair<CanonicalId extends string = string> = Readonly<{
  reference: string;
  canonicalId: CanonicalId;
}>;
export type SupportModelReferenceMap = Readonly<{
  sources: readonly SupportModelReferencePair[];
  actions: readonly SupportModelReferencePair<SupportActionId>[];
}>;
export type CanonicalSupportDraft = Readonly<{
  kind: "answer";
  text: string;
  sourceIds: readonly string[];
  actionIds: readonly SupportActionId[];
}>;

export function createSupportModelReferenceFactory(
  requestId: string = randomUUID()
): SupportModelReferenceFactory {
  const namespace = requestId.toLocaleLowerCase("en-US").replaceAll("-","");
  if (!/^[0-9a-f]{32}$/u.test(namespace)) throw new TypeError("SUPPORT_MODEL_REFERENCE_NAMESPACE_INVALID");
  return Object.freeze({
    referenceFor: (kind,index) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= 3) {
        throw new TypeError("SUPPORT_MODEL_REFERENCE_INDEX_INVALID");
      }
      return `${kind === "source" ? "s" : "a"}-${namespace}-${index + 1}`;
    }
  });
}

export function translateSupportDraftReferences(
  draft: SupportDraft,references: SupportModelReferenceMap
): CanonicalSupportDraft | null {
  if (new Set(draft.sourceIds).size !== draft.sourceIds.length
    || new Set(draft.actionIds).size !== draft.actionIds.length) return null;
  const sources = new Map(references.sources.map(({ reference,canonicalId }) => [reference,canonicalId]));
  const actions = new Map(references.actions.map(({ reference,canonicalId }) => [reference,canonicalId]));
  const sourceIds = draft.sourceIds.map((reference) => sources.get(reference));
  const actionIds = draft.actionIds.map((reference) => actions.get(reference));
  if (sourceIds.some((id) => id === undefined) || actionIds.some((id) => id === undefined)) return null;
  return Object.freeze({
    kind:"answer",text:draft.text,
    sourceIds:Object.freeze(sourceIds as string[]),
    actionIds:Object.freeze(actionIds as SupportActionId[])
  });
}
