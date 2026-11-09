// V4 start step, Task 53 (plan Review Focus 2): the runner tells the preview call policy a v2 run's final-writer terms, by run id, from
// the claimed run's receipt, so its four final writers ask the shared rule (Task 3): a v2 run's plan, Free or paid; a v1 run and a run
// this runner never claimed get none (R22's asks, byte for byte).
import { describe, expect, it } from "vitest";
import {
  createRunFinalWriterTerms, finalWriterTermsOfShape, finalWriterTermsResolver
} from "../../apps/runner/src/run-settings.js";

const V2_PAID = "aaaaaaaa-0000-4000-8000-000000000001";
const V2_FREE = "aaaaaaaa-0000-4000-8000-000000000002";
const V1 = "aaaaaaaa-0000-4000-8000-000000000003";

describe("a run's final-writer terms", () => {
  it("a claimed v2 run answers its plan, Free or paid; a v1 run's id and an unknown id answer nothing", () => {
    const terms = createRunFinalWriterTerms();
    terms.set(V2_PAID, finalWriterTermsOfShape({ plan: "plus" }));
    terms.set(V2_FREE, finalWriterTermsOfShape({ plan: "free" }));
    terms.set(V1, finalWriterTermsOfShape(null));
    const termsOf = finalWriterTermsResolver(terms);
    expect(termsOf(V2_PAID)).toEqual({ plan: "paid" });
    expect(termsOf(V2_FREE)).toEqual({ plan: "free" });
    expect(termsOf(V1)).toBeUndefined();
    expect(termsOf("aaaaaaaa-0000-4000-8000-00000000ffff")).toBeUndefined();
    expect(termsOf(null)).toBeUndefined();
  });

  it("every paid plan is paid", () => {
    for (const plan of ["plus", "pro", "max", "premium"]) expect(finalWriterTermsOfShape({ plan })).toEqual({ plan: "paid" });
    expect(finalWriterTermsOfShape(undefined)).toBeNull();
  });

  it("the store keeps what the claim told it: a v1 run stays without terms", () => {
    const terms = createRunFinalWriterTerms();
    terms.set(V1, null);
    expect(terms.termsOf(V1)).toBeNull();
    expect(terms.termsOf(V2_PAID)).toBeUndefined();
  });
});
