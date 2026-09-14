import type { SupportActionId,SupportLanguage } from "@debateai/support-kb/catalog";

export type SupportSecurityNavigation = Readonly<{
  kind: "FORGOT_PASSWORD";
  language: SupportLanguage;
  actionId: Extract<SupportActionId,"forgot-password">;
}>;

const FORGOT_PASSWORD_RO = /(?:\bam\s+uitat\s+parol(?:a|ă)\b|\bnu(?:-mi)?\s+(?:mai\s+)?amintesc\s+parol(?:a|ă)\b)/u;
const FORGOT_PASSWORD_EN = /(?:\bforgot(?:ten)?\s+(?:my\s+)?password\b|\b(?:can(?:not|'t)|do\s+not|don't)\s+remember\s+(?:my\s+)?password\b)/u;

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

export function classifySecurityNavigation(text: string): SupportSecurityNavigation | null {
  return classifySecurityNavigationViews([normalized(text)]);
}

export function classifySecurityNavigationViews(
  values: readonly string[]
): SupportSecurityNavigation | null {
  if (values.some((value) => FORGOT_PASSWORD_RO.test(value))) {
    return Object.freeze({ kind: "FORGOT_PASSWORD",language: "ro",actionId: "forgot-password" });
  }
  if (values.some((value) => FORGOT_PASSWORD_EN.test(value))) {
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
