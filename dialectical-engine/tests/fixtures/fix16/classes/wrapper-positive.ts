// @ts-nocheck -- intentionally invalid inventory specimen
import { TypedDomainError as DomainError } from "@debateai/kernel";

export function wrapped(): never {
  try {
    throw new Error("ROOT_FAILURE");
  } catch (caught) {
    const rootAlias = caught;
    throw new DomainError("WRAP_FAILED", "fixed text");
  }
}
