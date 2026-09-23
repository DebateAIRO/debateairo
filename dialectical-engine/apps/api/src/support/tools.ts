export const TOOL_REGISTRY = Object.freeze({
  answer_from_corpus: "answer_from_corpus",
  link_first_party: "link_first_party",
  refuse: "refuse"
} as const);

export const FIRST_PARTY_ROUTES = Object.freeze([
  "/",
  "/new",
  "/login",
  "/sign-up",
  "/settings",
  "/help",
  "/public/debate/{id}"
] as const);

export function isFirstPartyRoute(route: string): boolean {
  return FIRST_PARTY_ROUTES.includes(route as typeof FIRST_PARTY_ROUTES[number]);
}
