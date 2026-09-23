import type { SupportActionId,SupportLanguage } from "@debateai/support-kb/catalog";
import {
  analyzePreparedRecoverySemanticsViews,type RecoverySemantics
} from "./recovery-intent.js";

export type SupportSecurityRecoveryKind =
  | "FORGOT_PASSWORD"
  | "CREDENTIAL_OPERATION"
  | "CREDENTIAL_OPERATION_AND_FORGOT_PASSWORD";

export type SupportSecurityRecovery = Readonly<{
  kind: SupportSecurityRecoveryKind;
  language: SupportLanguage;
}>;

export type SupportSecurityNavigation = Readonly<{
  kind: "FORGOT_PASSWORD";
  language: SupportLanguage;
  actionId: Extract<SupportActionId,"forgot-password">;
}>;

function normalized(value: string): string {
  return value.normalize("NFKC")
    .replace(/[‘’‛`´]/gu,"'")
    .toLocaleLowerCase("en-US");
}

function normalizedViews(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values.flatMap((value) => {
    const plain = normalized(value);
    const decoded = plain.replace(/%([0-7][0-9a-f])/giu,(_match,hex: string) =>
      String.fromCharCode(Number.parseInt(hex,16)));
    return decoded === plain ? [plain] : [plain,decoded];
  }))));
}

function decodedPreparedViews(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values.flatMap((value) => {
    const decoded = value.replace(/%([0-7][0-9a-f])/giu,(_match,hex: string) =>
      String.fromCharCode(Number.parseInt(hex,16)));
    return decoded === value ? [value] : [value,decoded];
  }))));
}

function inferredPreparedLanguage(value: string,fallback: SupportLanguage): SupportLanguage {
  const text = value;
  return /[ăâîșşțţ]/u.test(text)
    || /\b(?:am|arat\p{L}*|g[ăa]sesc|parol\p{L}*|recupera\p{L}*|uitat\p{L}*|unde|vreau)\b/u.test(text)
    ? "ro" : fallback;
}

function recoveryDecision(semantics: RecoverySemantics): SupportSecurityRecovery | null {
  if (semantics.navigation === "AFFIRMATIVE") {
    return Object.freeze({
      kind:semantics.credentialOperation === "AFFIRMATIVE"
        ? "CREDENTIAL_OPERATION_AND_FORGOT_PASSWORD"
        : "FORGOT_PASSWORD",
      language:semantics.language
    });
  }
  if (semantics.credentialOperation === "AFFIRMATIVE") {
    return Object.freeze({ kind:"CREDENTIAL_OPERATION",language:semantics.language });
  }
  return null;
}

export function classifySecurityRecoveryViews(
  values: readonly string[],languageHint: SupportLanguage
): SupportSecurityRecovery | null {
  const prepared = decodedPreparedViews(values);
  const language = inferredPreparedLanguage(prepared.join(" "),languageHint);
  return recoveryDecision(analyzePreparedRecoverySemanticsViews(prepared,language));
}

export function classifySecurityRecovery(
  text: string,languageHint: SupportLanguage = "en"
): SupportSecurityRecovery | null {
  const views = normalizedViews([text]);
  return classifySecurityRecoveryViews(
    views,inferredPreparedLanguage(views.join(" "),languageHint)
  );
}

export function classifySecurityNavigation(text: string): SupportSecurityNavigation | null {
  const recovery = classifySecurityRecovery(text);
  if (recovery === null || recovery.kind === "CREDENTIAL_OPERATION") return null;
  return Object.freeze({
    kind:"FORGOT_PASSWORD",language:recovery.language,actionId:"forgot-password"
  });
}

export function classifySecurityNavigationViews(
  values: readonly string[],languageHint: SupportLanguage = "en"
): SupportSecurityNavigation | null {
  const recovery = classifySecurityRecoveryViews(values,languageHint);
  if (recovery === null || recovery.kind === "CREDENTIAL_OPERATION") return null;
  return Object.freeze({
    kind:"FORGOT_PASSWORD",language:recovery.language,actionId:"forgot-password"
  });
}

const GUIDANCE: Readonly<Record<SupportLanguage,string>> = Object.freeze({
  en: "Use the product's Forgot password option. Support cannot receive your password or submit a reset for you.",
  ro: "Folosește opțiunea Am uitat parola din produs. Asistența nu îți poate primi parola și nu poate trimite o resetare în locul tău."
});
const OPERATION_REFUSAL: Readonly<Record<SupportLanguage,string>> = Object.freeze({
  en: "Support cannot receive credentials or reset, validate, or submit a password, reset token, or recovery code.",
  ro: "Asistența nu poate primi credențiale și nu poate reseta, valida sau trimite o parolă, un token de resetare ori un cod de recuperare."
});
const MIXED_GUIDANCE: Readonly<Record<SupportLanguage,string>> = Object.freeze({
  en: `${OPERATION_REFUSAL.en} Use the product's Forgot password option.`,
  ro: `${OPERATION_REFUSAL.ro} Folosește opțiunea Am uitat parola din produs.`
});

export function forgotPasswordGuidance(language: SupportLanguage): string {
  return GUIDANCE[language];
}

export function recoverySecurityGuidance(
  kind: SupportSecurityRecoveryKind,language: SupportLanguage
): string {
  if (kind === "FORGOT_PASSWORD") return GUIDANCE[language];
  return kind === "CREDENTIAL_OPERATION"
    ? OPERATION_REFUSAL[language]
    : MIXED_GUIDANCE[language];
}
