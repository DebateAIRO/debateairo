export type SupportLanguage = "en" | "ro";
export type SupportAudience = "any" | "anonymous" | "member" | "owner" | "operator";
export type SupportAvailability =
  | "public"
  | "signed-out"
  | "signed-in"
  | "owner"
  | "public-reference"
  | "unresolved"
  | "excluded";
export type SupportRouteDisposition = "action" | "trusted-context-only" | "excluded";

export const SUPPORT_ACTION_IDS = Object.freeze([
  "home",
  "start-debate",
  "sign-in",
  "sign-up",
  "help",
  "support-status",
  "method",
  "sample-transcript",
  "settings",
  "privacy-preferences",
  "public-catalog",
  "your-debates",
  "owner-debate",
  "public-debate",
  "forgot-password",
] as const);

export type SupportActionId = (typeof SUPPORT_ACTION_IDS)[number];

export type SupportAction = Readonly<{
  id: SupportActionId;
  label: string;
  href: string;
}>;

export type SupportActionDefinition = Readonly<{
  id: SupportActionId;
  labels: Readonly<Record<SupportLanguage, string>>;
  availability: SupportAvailability;
  href: string | null;
}>;

export type SupportCapability = Readonly<{
  id: string;
  route: string;
  labels: Readonly<Record<SupportLanguage, string>>;
  audience: SupportAudience;
  availability: SupportAvailability;
  disposition: SupportRouteDisposition;
  actionIds: readonly SupportActionId[];
  articleIds: readonly string[];
  searchTerms: Readonly<Record<SupportLanguage, readonly string[]>>;
}>;

function labels(en: string, ro: string): Readonly<Record<SupportLanguage, string>> {
  return Object.freeze({ en, ro });
}

function terms(en: readonly string[], ro: readonly string[]): Readonly<Record<SupportLanguage, readonly string[]>> {
  return Object.freeze({ en: Object.freeze([...en]), ro: Object.freeze([...ro]) });
}

function capability(value: SupportCapability): SupportCapability {
  return Object.freeze({
    ...value,
    labels: Object.freeze({ ...value.labels }),
    actionIds: Object.freeze([...value.actionIds]),
    articleIds: Object.freeze([...value.articleIds]),
    searchTerms: Object.freeze({
      en: Object.freeze([...value.searchTerms.en]),
      ro: Object.freeze([...value.searchTerms.ro]),
    }),
  });
}

function action(value: SupportActionDefinition): SupportActionDefinition {
  return Object.freeze({ ...value, labels: Object.freeze({ ...value.labels }) });
}

export const SUPPORT_ACTION_CATALOG: readonly SupportActionDefinition[] = Object.freeze([
  action({ id: "home", labels: labels("Home", "Acasă"), availability: "public", href: "/" }),
  action({ id: "start-debate", labels: labels("Start a debate", "Pornește o dezbatere"), availability: "public", href: null }),
  action({ id: "sign-in", labels: labels("Sign in", "Autentificare"), availability: "signed-out", href: "/login" }),
  action({ id: "sign-up", labels: labels("Create account", "Creează un cont"), availability: "signed-out", href: "/sign-up" }),
  action({ id: "help", labels: labels("Help desk", "Centrul de ajutor"), availability: "public", href: "/help" }),
  action({ id: "support-status", labels: labels("Support status", "Starea serviciului de asistență"), availability: "public", href: "/help#service-status" }),
  action({ id: "method", labels: labels("How it works", "Cum funcționează"), availability: "signed-out", href: "/#method" }),
  action({ id: "sample-transcript", labels: labels("Sample debate", "Exemplu de dezbatere"), availability: "signed-out", href: "/#transcripts" }),
  action({ id: "settings", labels: labels("Settings", "Setări"), availability: "signed-in", href: "/settings" }),
  action({ id: "privacy-preferences", labels: labels("Privacy preferences", "Preferințe de confidențialitate"), availability: "signed-in", href: "/settings#consent-privacy-heading" }),
  action({ id: "public-catalog", labels: labels("Public debates", "Dezbateri publice"), availability: "signed-in", href: "/?tab=public" }),
  action({ id: "your-debates", labels: labels("Your debates", "Dezbaterile tale"), availability: "signed-in", href: "/?tab=yours" }),
  action({ id: "owner-debate", labels: labels("Open your debate", "Deschide dezbaterea ta"), availability: "owner", href: null }),
  action({ id: "public-debate", labels: labels("Open public debate", "Deschide dezbaterea publică"), availability: "public-reference", href: null }),
  action({ id: "forgot-password", labels: labels("Forgot password", "Am uitat parola"), availability: "unresolved", href: null }),
]);

export const SUPPORT_CAPABILITIES: readonly SupportCapability[] = Object.freeze([
  capability({
    id: "product-identity",
    route: "/",
    labels: labels("About Dialectical Engine", "Despre Dialectical Engine"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: [],
    articleIds: ["product-identity"],
    searchTerms: terms(
      ["product", "identity", "overview", "purpose"],
      ["produs", "identitate", "prezentare", "scop"]
    ),
  }),
  capability({
    id: "home-library",
    route: "/",
    labels: labels("Home and debate library", "Pagina principală și biblioteca de dezbateri"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: ["home", "public-catalog", "your-debates", "method", "sample-transcript"],
    articleIds: ["browse-public-debates", "getting-started-debate"],
    searchTerms: terms(["home", "library", "browse", "public", "debates"], ["acasă", "bibliotecă", "răsfoire", "public", "dezbateri"]),
  }),
  capability({
    id: "new-debate",
    route: "/new",
    labels: labels("Create a debate with plan controls", "Creează o dezbatere cu opțiunile planului"),
    audience: "member",
    availability: "signed-in",
    disposition: "action",
    actionIds: ["start-debate"],
    articleIds: ["getting-started-debate", "debate-topic-and-description", "risk-tier-choice", "budget-tier-choice"],
    searchTerms: terms(["create", "start", "topic", "risk", "budget", "depth", "plan"], ["creează", "pornește", "subiect", "risc", "buget", "adâncime", "plan"]),
  }),
  capability({
    id: "owner-debate",
    route: "/debate/[id]",
    labels: labels("Owner debate workspace", "Spațiul de lucru al proprietarului"),
    audience: "owner",
    availability: "owner",
    disposition: "trusted-context-only",
    actionIds: ["owner-debate"],
    articleIds: ["guide-how-it-works", "export-json", "publish-a-debate", "unpublish-a-debate", "delete-a-private-debate", "unsupported-capabilities"],
    searchTerms: terms(["workspace", "tree", "thread", "split", "map", "export", "publish", "delete"], ["spațiu", "arbore", "fir", "hartă", "export", "publicare", "ștergere"]),
  }),
  capability({
    id: "public-debate",
    route: "/public/debate/[id]",
    labels: labels("Published debate", "Dezbatere publicată"),
    audience: "any",
    availability: "public-reference",
    disposition: "trusted-context-only",
    actionIds: ["public-debate"],
    articleIds: ["view-public-debate", "public-answer-disclosure", "export-json"],
    searchTerms: terms(["public", "published", "shared", "link", "snapshot"], ["public", "publicată", "distribuit", "link", "copie"]),
  }),
  capability({
    id: "help-desk",
    route: "/help",
    labels: labels("Support conversations and human cases", "Conversații de asistență și cazuri umane"),
    audience: "any",
    availability: "public",
    disposition: "action",
    actionIds: ["help", "support-status"],
    articleIds: ["support-cases", "support-status-limits"],
    searchTerms: terms(["help", "support", "case", "human", "status"], ["ajutor", "asistență", "caz", "persoană", "stare"]),
  }),
  capability({
    id: "sign-in",
    route: "/login",
    labels: labels("Sign in and saved MFA recovery", "Autentificare și recuperare MFA salvată"),
    audience: "anonymous",
    availability: "signed-out",
    disposition: "action",
    actionIds: ["sign-in", "forgot-password"],
    articleIds: ["account-access"],
    searchTerms: terms(["login", "sign in", "authenticator", "recovery code", "forgot password"], ["autentificare", "autentificator", "cod de recuperare", "am uitat parola"]),
  }),
  capability({
    id: "sign-up",
    route: "/sign-up",
    labels: labels("Create an account", "Creează un cont"),
    audience: "anonymous",
    availability: "signed-out",
    disposition: "action",
    actionIds: ["sign-up"],
    articleIds: ["account-access"],
    searchTerms: terms(["register", "sign up", "account", "email verification"], ["înregistrare", "cont", "verificare email"]),
  }),
  capability({
    id: "settings",
    route: "/settings",
    labels: labels("Account settings", "Setările contului"),
    audience: "member",
    availability: "signed-in",
    disposition: "action",
    actionIds: ["settings", "privacy-preferences"],
    articleIds: ["account-settings", "privacy-consent"],
    searchTerms: terms(["settings", "sessions", "privacy", "consent", "legacy", "delete account"], ["setări", "sesiuni", "confidențialitate", "consimțământ", "cont vechi", "ștergere cont"]),
  }),
  capability({
    id: "verify-email",
    route: "/verify-email",
    labels: labels("Email verification state", "Starea verificării emailului"),
    audience: "anonymous",
    availability: "excluded",
    disposition: "excluded",
    actionIds: [],
    articleIds: ["account-access"],
    searchTerms: terms(["verify email", "verification link"], ["verificare email", "link de verificare"]),
  }),
  capability({
    id: "enroll-mfa",
    route: "/enroll-mfa",
    labels: labels("MFA enrollment state", "Starea înscrierii MFA"),
    audience: "anonymous",
    availability: "excluded",
    disposition: "excluded",
    actionIds: [],
    articleIds: ["account-access"],
    searchTerms: terms(["MFA", "authenticator", "enrollment"], ["MFA", "autentificator", "înscriere"]),
  }),
  capability({
    id: "operator-workers",
    route: "/admin/workers",
    labels: labels("Operator-only worker view", "Vizualizare a lucrătorilor doar pentru operatori"),
    audience: "operator",
    availability: "excluded",
    disposition: "excluded",
    actionIds: [],
    articleIds: ["unsupported-capabilities"],
    searchTerms: terms(["workers", "operator", "deployment"], ["lucrători", "operator", "implementare"]),
  }),
]);

export const SUPPORT_PAGE_ROUTES: readonly string[] = Object.freeze(
  [...new Set(SUPPORT_CAPABILITIES.map(({ route }) => route))].sort(),
);

export const SUPPORT_PROXY_ROUTES: readonly string[] = Object.freeze(["/api/[...path]"]);

export const SUPPORT_CATALOG_CANONICAL = JSON.stringify({
  schemaVersion: 1,
  actions: SUPPORT_ACTION_CATALOG,
  capabilities: SUPPORT_CAPABILITIES,
  proxies: SUPPORT_PROXY_ROUTES,
});
