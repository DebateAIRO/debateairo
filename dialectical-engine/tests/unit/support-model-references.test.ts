import { describe,expect,it } from "vitest";

import {
  createSupportModelReferenceFactory,translateSupportDraftReferences
} from "../../apps/api/src/support/model-references.js";

describe("CP1 request-local model references", () => {
  const requestA = "10000000-0000-4000-8000-000000000001";
  const requestB = "20000000-0000-4000-8000-000000000002";

  it("binds opaque source and action aliases to one request namespace", () => {
    const first = createSupportModelReferenceFactory(requestA);
    const second = createSupportModelReferenceFactory(requestB);
    const firstSource = first.referenceFor("source",0);
    const firstAction = first.referenceFor("action",0);

    expect(firstSource).not.toContain("getting-started-debate");
    expect(firstAction).not.toContain("start-debate");
    expect(second.referenceFor("source",0)).not.toBe(firstSource);
    expect(first.referenceFor("source",0)).toBe(firstSource);
  });

  it("maps only unique references from the current request to canonical ids", () => {
    const current = createSupportModelReferenceFactory(requestA);
    const stale = createSupportModelReferenceFactory(requestB);
    const sourceReference = current.referenceFor("source",0);
    const actionReference = current.referenceFor("action",0);
    const references = {
      sources: [{ reference: sourceReference,canonicalId: "getting-started-debate" }],
      actions: [{ reference: actionReference,canonicalId: "start-debate" }]
    } as const;
    const base = {
      kind: "answer" as const,text: "Choose Start a debate to continue.",
      sourceIds: [sourceReference],actionIds: [actionReference]
    };

    expect(translateSupportDraftReferences(base,references)).toEqual({
      kind: "answer",text: base.text,
      sourceIds: ["getting-started-debate"],actionIds: ["start-debate"]
    });
    expect(translateSupportDraftReferences({
      ...base,sourceIds: [stale.referenceFor("source",0)]
    },references)).toBeNull();
    expect(translateSupportDraftReferences({
      ...base,sourceIds: [sourceReference,sourceReference]
    },references)).toBeNull();
    expect(translateSupportDraftReferences({
      ...base,actionIds: ["unknown-reference"]
    },references)).toBeNull();
  });
});
