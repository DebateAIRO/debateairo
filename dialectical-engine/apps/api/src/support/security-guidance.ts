import type { SupportActionId,SupportLanguage } from "@debateai/support-kb/catalog";

export type SupportSecurityNavigation = Readonly<{
  kind: "FORGOT_PASSWORD";
  language: SupportLanguage;
  actionId: Extract<SupportActionId,"forgot-password">;
}>;

const FORGOT_PASSWORD_RO = /(?:\bam\s+uitat\s+parol(?:a|ă)\b|\bnu(?:-mi)?\s+(?:mai\s+)?amintesc\s+parol(?:a|ă)\b)/u;
const FORGOT_PASSWORD_EN = /(?:\bforgot(?:ten)?\s+(?:my\s+)?password\b|\b(?:can(?:not|'t)|do\s+not|don't)\s+remember\s+(?:my\s+)?password\b)/u;
const RECOVERY_NAVIGATION_EN = /(?:(?:password\s+(?:recovery|reset)|(?:recovery|reset)\s+(?:my\s+)?password).{0,40}\b(?:link|page|option|button|screen|opener)\b|\b(?:link|page|option|button|screen|opener)\b.{0,40}(?:password\s+(?:recovery|reset)|(?:recovery|reset)\s+(?:my\s+)?password))/u;
const RECOVERY_NAVIGATION_RO = /(?:(?:recuperarea|resetarea|recuperare(?:a)?|resetare(?:a)?)\s+(?:a\s+)?parol(?:ei|a|ă).{0,40}\b(?:link(?:ul)?|pagin(?:a|ă)|opțiun(?:ea|e)|optiun(?:ea|e)|buton(?:ul)?|ecran(?:ul)?|deschidere)\b|\b(?:link(?:ul)?|pagin(?:a|ă)|opțiun(?:ea|e)|optiun(?:ea|e)|buton(?:ul)?|ecran(?:ul)?|deschidere)\b.{0,40}(?:recuperarea|resetarea|recuperare(?:a)?|resetare(?:a)?)\s+(?:a\s+)?parol(?:ei|a|ă))/u;

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

export function classifySecurityNavigation(text: string): SupportSecurityNavigation | null {
  return classifySecurityNavigationViews([normalized(text)]);
}

export function classifySecurityNavigationViews(
  values: readonly string[]
): SupportSecurityNavigation | null {
  if (values.some((value) => FORGOT_PASSWORD_RO.test(value) || RECOVERY_NAVIGATION_RO.test(value))) {
    return Object.freeze({ kind: "FORGOT_PASSWORD",language: "ro",actionId: "forgot-password" });
  }
  if (values.some((value) => FORGOT_PASSWORD_EN.test(value) || RECOVERY_NAVIGATION_EN.test(value))) {
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
