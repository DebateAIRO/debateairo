import type { SupportActionId,SupportLanguage } from "@debateai/support-kb/catalog";

export type SupportSecurityNavigation = Readonly<{
  kind: "FORGOT_PASSWORD";
  language: SupportLanguage;
  actionId: Extract<SupportActionId,"forgot-password">;
}>;

const FORGOT_PASSWORD_RO = /(?:\bam\s+uitat\s+parol(?:a|ă)\b|\bnu(?:-mi)?\s+(?:mai\s+)?amintesc\s+parol(?:a|ă)\b)/u;
const FORGOT_PASSWORD_EN = /(?:\bforgot(?:ten)?\s+(?:my\s+)?password\b|\b(?:can(?:not|'t)|do\s+not|don't)\s+remember\s+(?:my\s+)?password\b)/u;
const RECOVERY_SUBJECT_EN = /(?:\bpassword\b.{0,32}\b(?:recovery|reset)\b|\b(?:recover\w*|recovery|reset)\b.{0,32}\bpassword\b)/u;
const RECOVERY_NAVIGATION_NOUN_EN = /\b(?:link|page|option|button|screen|opener)\b/u;
const RECOVERY_SUBJECT_RO = /(?:(?:recuper\p{L}*|reset\p{L}*).{0,32}(?<!\p{L})parol\p{L}*|(?<!\p{L})parol\p{L}*.{0,32}(?:recuper\p{L}*|reset\p{L}*))/u;
const RECOVERY_NAVIGATION_NOUN_RO = /(?<!\p{L})(?:link\p{L}*|pagin\p{L}*|opțiun\p{L}*|optiun\p{L}*|buton\p{L}*|ecran\p{L}*|deschidere)(?!\p{L})/u;
const RECOVERY_CREDENTIAL_OPERATION_EN = /(?:(?:\bvalidate|\bverify|\bcheck)\w*.{0,56}\b(?:reset|recovery)?\s*(?:token|code)\b|\b(?:reset|recovery)?\s*(?:token|code)\b.{0,56}(?:\bvalidate|\bverify|\bcheck)\w*)/u;
const RECOVERY_EXECUTION_EN = /(?:(?:\bsubmit|\bexecute|\bperform|\bapply|\bchange|\breplace|\bset)\w*.{0,56}\b(?:password\s+)?reset\b|\b(?:password\s+)?reset\b.{0,56}(?:\bsubmit|\bexecute|\bperform|\bapply|\bchange|\breplace|\bset)\w*)/u;
const RECOVERY_CREDENTIAL_OPERATION_RO = /(?:(?:valid\p{L}*|verific\p{L}*).{0,56}(?<!\p{L})(?:token|cod)\p{L}*|(?<!\p{L})(?:token|cod)\p{L}*.{0,56}(?:valid\p{L}*|verific\p{L}*))/u;
const RECOVERY_EXECUTION_RO = /(?:(?:trimit\p{L}*|execut\p{L}*|efectu\p{L}*|schimb\p{L}*|înlocu\p{L}*|inlocu\p{L}*).{0,56}reset\p{L}*|reset\p{L}*.{0,56}(?:trimit\p{L}*|execut\p{L}*|efectu\p{L}*|schimb\p{L}*|înlocu\p{L}*|inlocu\p{L}*))/u;
const NEGATED_RECOVERY_OPERATION_EN = /\b(?:do\s+not\s+want\s+to|don't\s+want\s+to|cannot|can't|do\s+not|don't|never)\s+(?:\p{L}+\s+){0,3}(?:validate|verify|check|submit|execute|perform|apply|change|replace|set)\w*/gu;
const NEGATED_RECOVERY_OPERATION_RO = /(?<!\p{L})nu\s+(?:(?:vreau|dorim)\s+s[ăa]\s+|(?:poate|pot|putem)\s+)?(?:valid\p{L}*|verific\p{L}*|trimit\p{L}*|execut\p{L}*|efectu\p{L}*|schimb\p{L}*|înlocu\p{L}*|inlocu\p{L}*)/gu;

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function normalizedViews(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values.flatMap((value) => {
    const plain = value.toLocaleLowerCase("en-US");
    const decoded = plain.replace(/%([0-7][0-9a-f])/giu,(_match,hex: string) =>
      String.fromCharCode(Number.parseInt(hex,16)));
    return decoded === plain ? [plain] : [plain,decoded];
  }))));
}

function recoveryNavigation(value: string,language: SupportLanguage): boolean {
  if (language === "ro") {
    return RECOVERY_SUBJECT_RO.test(value) && RECOVERY_NAVIGATION_NOUN_RO.test(value);
  }
  return RECOVERY_SUBJECT_EN.test(value) && RECOVERY_NAVIGATION_NOUN_EN.test(value);
}

function hasAffirmativeRecoveryOperation(value: string): boolean {
  const withoutNegatedOperations = value
    .replace(NEGATED_RECOVERY_OPERATION_EN," ")
    .replace(NEGATED_RECOVERY_OPERATION_RO," ");
  return RECOVERY_CREDENTIAL_OPERATION_EN.test(withoutNegatedOperations)
    || RECOVERY_EXECUTION_EN.test(withoutNegatedOperations)
    || RECOVERY_CREDENTIAL_OPERATION_RO.test(withoutNegatedOperations)
    || RECOVERY_EXECUTION_RO.test(withoutNegatedOperations);
}

export function classifySecurityNavigation(text: string): SupportSecurityNavigation | null {
  return classifySecurityNavigationViews([normalized(text)]);
}

export function classifySecurityNavigationViews(
  values: readonly string[]
): SupportSecurityNavigation | null {
  const views = normalizedViews(values);
  if (views.some(hasAffirmativeRecoveryOperation)) {
    return null;
  }
  if (views.some((value) => FORGOT_PASSWORD_RO.test(value) || recoveryNavigation(value,"ro"))) {
    return Object.freeze({ kind: "FORGOT_PASSWORD",language: "ro",actionId: "forgot-password" });
  }
  if (views.some((value) => FORGOT_PASSWORD_EN.test(value) || recoveryNavigation(value,"en"))) {
    return Object.freeze({ kind: "FORGOT_PASSWORD",language: "en",actionId: "forgot-password" });
  }
  return null;
}

const GUIDANCE: Readonly<Record<SupportLanguage,string>> = Object.freeze({
  en: "Use the product's Forgot password option. Support cannot receive your password or submit a reset for you.",
  ro: "Folosește opțiunea Am uitat parola din produs. Asistența nu îți poate primi parola și nu poate trimite o resetare în locul tău."
});

export function forgotPasswordGuidance(language: SupportLanguage): string {
  return GUIDANCE[language];
}
