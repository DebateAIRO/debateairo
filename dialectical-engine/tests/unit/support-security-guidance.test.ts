import { describe,expect,it } from "vitest";
import {
  classifySecurityNavigation,
  forgotPasswordGuidance
} from "../../apps/api/src/support/security-guidance.js";

describe("CP1 deterministic Forgot password guidance", () => {
  it.each([
    ["Forgot password", "en"],
    ["I forgot my password", "en"],
    ["Can't remember my password", "en"],
    ["Am uitat parola", "ro"],
    ["Am uitat parola and I need a replacement password", "ro"],
    ["Give me the password recovery link", "en"],
    ["Where is the password reset page?", "en"],
    ["Where can I find the link to recover my password?", "en"],
    ["Can you show me the recovery page for my password?", "en"],
    ["Can you check where the password reset page is?", "en"],
    ["I do not want to validate a reset token; show me the password recovery page.", "en"],
    ["Where is the password reset page? Support cannot perform the reset.", "en"],
    ["Show the p%61ssword recovery link.", "en"],
    ["Vreau linkul de recuperare a parolei", "ro"],
    ["Unde este pagina pentru resetarea parolei?", "ro"],
    ["Unde găsesc linkul pentru a-mi recupera parola?", "ro"],
    ["Verifică unde este pagina de resetare a parolei.", "ro"],
    ["Nu vreau să validez tokenul de resetare; arată pagina de recuperare a parolei.", "ro"],
    ["Unde este pagina de resetare a parolei? Asistența nu poate efectua resetarea.", "ro"],
    ["Arată pagina pentru recuperarea p%61rolei.", "ro"]
  ] as const)("recognizes %s before generic security routing", (text,language) => {
    expect(classifySecurityNavigation(text)).toEqual({
      kind: "FORGOT_PASSWORD",language,actionId: "forgot-password"
    });
  });

  it.each([
    "Where is my saved MFA recovery code?",
    "Unde este codul de recuperare MFA salvat?",
    "Codurile de autentificare rămân private.",
    "Authentication codes remain private.",
    "How do I change my password?",
    "Reset my password now",
    "Validate my password reset token",
    "Can the password reset page validate my reset token?",
    "Use the password reset button to submit a reset for me",
    "Where is the page to validate my password reset token?",
    "Poate pagina de resetare a parolei să valideze tokenul meu de resetare?",
    "Unde este pagina pentru validarea tokenului de resetare a parolei?",
    "Unde este pagina pentru validarea codului de recuperare a parolei?"
  ])("keeps saved-MFA and ordinary password requests distinct: %s", (text) => {
    expect(classifySecurityNavigation(text)).toBeNull();
  });

  it("uses concise guidance that claims no reset and names no guessed destination", () => {
    expect(forgotPasswordGuidance("en")).toBe(
      "Use the product's Forgot password option. Support cannot receive your password or submit a reset for you."
    );
    expect(forgotPasswordGuidance("ro")).toBe(
      "Folosește opțiunea Am uitat parola din produs. Asistența nu îți poate primi parola și nu poate trimite o resetare în locul tău."
    );
    expect(`${forgotPasswordGuidance("en")} ${forgotPasswordGuidance("ro")}`)
      .not.toMatch(/\/settings|\/login|recovery code|cod de recuperare/iu);
  });
});
