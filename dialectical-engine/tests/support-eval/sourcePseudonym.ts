import { createProcessNetworkPseudonym } from "../../apps/api/src/index.js";

/** The eval uses the API's process-scoped HMAC without opening a support KEK. */
export function createEvalSourcePseudonym(): (network: string) => string {
  return createProcessNetworkPseudonym();
}
