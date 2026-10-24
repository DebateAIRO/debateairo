import type { ApiOptions } from "../../apps/api/src/index.js";

/** A configured, ordinary question check for API tests whose subject lies after the ask gate. */
export const questionCheckPass: NonNullable<ApiOptions["questionCheck"]> = {
  check: async () => ({ outcome: "PASS" }),
  keep: async () => {}
};
