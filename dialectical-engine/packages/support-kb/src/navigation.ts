import { exhaustive } from "@debateai/kernel";
import {
  SUPPORT_ACTION_CATALOG,
  type SupportAction,
  type SupportActionDefinition,
  type SupportActionId,
  type SupportLanguage,
} from "./catalog.js";
import { SUPPORT_UI_LABELS } from "./ui-labels.js";

export type SupportNavigationContext = Readonly<{
  signedIn: boolean;
  language: SupportLanguage;
  ownerDebateId?: string;
  publicDebateRef?: string;
}>;

const ACTIONS_BY_ID = new Map<SupportActionId, SupportActionDefinition>(
  SUPPORT_ACTION_CATALOG.map((definition) => [definition.id, definition]),
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_QUERIES = new Set(["next=%2Fnew", "tab=public", "tab=yours"]);
const ALLOWED_FRAGMENTS = new Set([
  "service-status",
  "method",
  "transcripts",
  "active-sessions-heading",
  "consent-privacy-heading",
  "legacy-run-claim-heading",
  "account-deletion-heading",
]);
const TOKEN_PARAMETER = /(?:^|&)(?:token|code|secret|key|case)=/iu;

function isSafeHref(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || /[\p{Cc}\p{Cf}]/u.test(href)) {
    return false;
  }
  try {
    const parsed = new URL(href, "https://support.invalid");
    if (parsed.origin !== "https://support.invalid" || parsed.username !== "" || parsed.password !== "") return false;
    const query = parsed.search.slice(1);
    if (query !== "" && (!ALLOWED_QUERIES.has(query) || TOKEN_PARAMETER.test(query))) return false;
    if (parsed.hash !== "" && !ALLOWED_FRAGMENTS.has(parsed.hash.slice(1))) return false;
    return true;
  } catch {
    return false;
  }
}

function hrefFor(definition: SupportActionDefinition, context: SupportNavigationContext): string | null {
  switch (definition.id) {
    case "start-debate":
      return context.signedIn ? "/new" : "/login?next=%2Fnew";
    case "owner-debate":
      return context.signedIn && UUID.test(context.ownerDebateId ?? "")
        ? `/debate/${context.ownerDebateId}`
        : null;
    case "public-debate":
      return UUID.test(context.publicDebateRef ?? "")
        ? `/public/debate/${context.publicDebateRef}`
        : null;
    case "forgot-password":
      return null;
    default:
      return definition.href;
  }
}

function isApplicable(definition: SupportActionDefinition, context: SupportNavigationContext): boolean {
  switch (definition.availability) {
    case "public": return true;
    case "signed-out": return !context.signedIn;
    case "signed-in": return context.signedIn;
    case "owner": return context.signedIn && UUID.test(context.ownerDebateId ?? "");
    case "public-reference": return UUID.test(context.publicDebateRef ?? "");
    case "unresolved":
    case "excluded": return false;
    default: return exhaustive(definition.availability);
  }
}

export function resolveSupportActions(
  ids: readonly (SupportActionId | string)[],
  context: SupportNavigationContext,
): readonly SupportAction[] {
  const seen = new Set<string>();
  const resolved: SupportAction[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const definition = ACTIONS_BY_ID.get(id as SupportActionId);
    if (definition === undefined || !isApplicable(definition, context)) continue;
    const href = hrefFor(definition, context);
    if (href === null || !isSafeHref(href)) continue;
    if (definition.id === "forgot-password") continue;
    resolved.push(Object.freeze({
      id: definition.id,
      label: SUPPORT_UI_LABELS[context.language][definition.id],
      href,
    }));
  }
  return Object.freeze(resolved);
}
