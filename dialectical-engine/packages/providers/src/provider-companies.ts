/**
 * Side-by-side spec §13, ADDITION D24 (owner's answer to Q-L6, 2026-10-22: "providers only, not the models, listed
 * automatically"): which serving COMPANIES the API's declared provider targets reach, so the "AI providers" legal page
 * lists exactly the companies that receive text, and a company added with an upload appears there by itself.
 *
 * Plain words: every declared target names a base URL; its host says which company serves it. The two reviewed
 * connections' hosts (`PREVIEW_DEEPINFRA_BASE_URL`, `PREVIEW_ANTHROPIC_BASE_URL`) map to the company keys the website's
 * reviewed catalogue knows (`apps/ui/lib/legal/pages.ts`). A loopback or private host (local mode only; hosted refuses
 * them, `assertHostedProviderTargets`) sends nothing to an outside company and is left out. Any other public host is
 * `host:<hostname>` (ruling R20): the page still shows it, as an unchecked row headed by its host name, so a company
 * that receives text is never hidden. No model id, no URL path, no price leaves this function.
 */
import { isRefusedHostedProviderHost, type ProviderDiscoveryTarget } from "./index.js";

/** Addition D24: the reviewed connections' hosts and the company each one is (lower case, no trailing dot). */
export const PROVIDER_COMPANY_HOSTS: Readonly<Record<string, "anthropic" | "deepinfra">> = Object.freeze({
  "api.anthropic.com": "anthropic",
  "api.deepinfra.com": "deepinfra"
});

/** The prefix of a company the table does not know, followed by its host name (ruling R20). */
const PROVIDER_COMPANY_HOST_PREFIX = "host:" as const;

/** Case, one trailing dot and an IPv6 literal's brackets, normalised away (the hosted host rule's own spelling). */
function companyHostOf(baseUrl: string): string {
  const hostname = new URL(baseUrl).hostname;
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return bare.toLowerCase().replace(/\.$/u, "");
}

/**
 * Addition D24 item 2: the sorted, unique company keys the targets reach — `anthropic`, `deepinfra`, or
 * `host:<hostname>` for a public host the table does not know; a loopback or private host is omitted (it names no
 * outside company). The API computes it once at boot from its declared targets (`apps/api/src/main.ts`) and answers it
 * on `GET /v1/public/ai-providers`. Never throws for a parsed target (`parseProviderDiscoveryTargets` admits only an
 * absolute http(s) URL).
 */
export function providerCompaniesOfTargets(targets: readonly ProviderDiscoveryTarget[]): readonly string[] {
  const companies = new Set<string>();
  for (const target of targets) {
    const host = companyHostOf(target.baseUrl);
    if (isRefusedHostedProviderHost(host)) continue;
    companies.add(Object.hasOwn(PROVIDER_COMPANY_HOSTS, host) ? PROVIDER_COMPANY_HOSTS[host]! : `${PROVIDER_COMPANY_HOST_PREFIX}${host}`);
  }
  return Object.freeze([...companies].sort());
}
