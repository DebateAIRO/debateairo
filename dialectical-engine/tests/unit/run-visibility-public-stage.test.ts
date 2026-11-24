import { describe, expect, it } from "vitest";
// The contract's index first, then its client (the client's own imports read the index's schemas).
import { RUN_VISIBILITY_PUBLIC_STAGES, RunVisibilitySchema } from "../../packages/contract/src/index.js";
import { createContractClient, ContractHttpError } from "../../packages/contract/src/client.js";
import { publicStageOf } from "../../apps/ui/lib/v4/publicState.js";

/*
 * GET /v1/runs/{id}/visibility's optional `public_stage` (migration 0188): the API sends KEPT_PRIVATE to the owner of a
 * Free debate the publication check refused. The website reads the answer through the contract's strict schema, so the
 * schema names the field with exactly the stages the website's public mark knows, and nothing else.
 */
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_REF = "22222222-2222-4222-8222-222222222222";

/** The website's contract client over one canned answer of the API. */
function clientAnswering(body: unknown) {
  const fetchStub = (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  return createContractClient("https://app.debateai.test", fetchStub);
}

describe("the visibility read's public stage in the contract", () => {
  it("names exactly the stages the website's public mark knows, each read by the website as itself", () => {
    expect([...RUN_VISIBILITY_PUBLIC_STAGES]).toEqual(["WILL_BE_PUBLIC", "BEING_CHECKED", "KEPT_PRIVATE"]);
    for (const stage of RUN_VISIBILITY_PUBLIC_STAGES) {
      const read = RunVisibilitySchema.parse({ state: "PRIVATE", public_ref: null, public_stage: stage });
      expect(publicStageOf(read)).toEqual({ kind: stage });
    }
  });

  it("stays optional: the answers sent before it, a dig's included, read exactly as before", () => {
    for (const answer of [
      { state: "PRIVATE", public_ref: null },
      { state: "PRIVATE", public_ref: null, dig: true },
      { state: "PUBLISHED", public_ref: PUBLIC_REF }
    ]) expect(RunVisibilitySchema.parse(answer)).toStrictEqual(answer);
  });

  it("stays strict: a stage the website does not know, or a field the contract does not name, is refused", () => {
    for (const answer of [
      { state: "PRIVATE", public_ref: null, public_stage: "PUBLIC" },
      { state: "PRIVATE", public_ref: null, public_stage: "kept_private" },
      { state: "PRIVATE", public_ref: null, public_stage: null },
      { state: "PRIVATE", public_ref: null, stage: "KEPT_PRIVATE" }
    ]) expect(RunVisibilitySchema.safeParse(answer).success, JSON.stringify(answer)).toBe(false);
  });

  it("the website's own client reads the API's KEPT_PRIVATE answer, and refuses an answer with a stage it does not know", async () => {
    const kept = { state: "PRIVATE", public_ref: null, public_stage: "KEPT_PRIVATE" } as const;
    expect(await clientAnswering(kept).readRunVisibility(RUN_ID)).toStrictEqual(kept);
    const unknown = clientAnswering({ state: "PRIVATE", public_ref: null, public_stage: "SOMETHING_NEWER" }).readRunVisibility(RUN_ID);
    await expect(unknown).rejects.toBeInstanceOf(ContractHttpError);
    await expect(unknown).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
