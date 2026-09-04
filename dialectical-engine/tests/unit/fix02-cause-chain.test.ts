import { describe, expect, expectTypeOf, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";

describe("FIX-02 C1 — TypedDomainError cause", () => {
  it("keeps an Error cause by identity", () => {
    const cause = new Error("root failure");

    const error = new TypedDomainError("WRAPPER_FAILED", "wrapper failed", { cause });

    expect(error.cause).toBe(cause);
  });

  it("keeps the error shape when a cause is present", () => {
    const error = new TypedDomainError("WRAPPER_FAILED", "wrapper failed", {
      cause: new Error("root failure")
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TypedDomainError");
    expect(error.code).toBe("WRAPPER_FAILED");
    expect(error.message).toBe("wrapper failed");
    expect(error.stack?.split("\n", 1)[0]).toBe("TypedDomainError: wrapper failed");
  });

  it("keeps a primitive cause by identity", () => {
    const cause = 17;

    const error = new TypedDomainError("WRAPPER_FAILED", "wrapper failed", { cause });

    expect(error.cause).toBe(cause);
  });

  it("keeps an explicit undefined cause as an own property", () => {
    const error = new TypedDomainError("WRAPPER_FAILED", "wrapper failed", {
      cause: undefined
    });

    expect(error.cause).toBeUndefined();
    expect(Object.hasOwn(error, "cause")).toBe(true);
  });

  it("keeps the two-argument call and its error shape unchanged", () => {
    const error = new TypedDomainError("LEGACY_CODE", "legacy message");

    expectTypeOf(error).toMatchTypeOf<TypedDomainError>();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TypedDomainError");
    expect(error.code).toBe("LEGACY_CODE");
    expect(error.message).toBe("legacy message");
    expect(Object.hasOwn(error, "cause")).toBe(false);
    expect(error.stack?.split("\n", 1)[0]).toBe("TypedDomainError: legacy message");
  });
});
