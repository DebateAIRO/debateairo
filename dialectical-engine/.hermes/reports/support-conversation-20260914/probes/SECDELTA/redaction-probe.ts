import { redactSupportText } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/kernel/src/index.ts";

const cases = [
  ["covered-en-my-password", "My password is inert-orchid-7"],
  ["covered-ro-parola-mea", "Parola mea este inert-lalea-7"],
  ["en-your-password", "Your password is inert-cedar-7"],
  ["ro-passwordul-meu", "Passwordul meu este inert-stejar-7"],
  ["en-passcode-label", "My passcode is inert-maple-7"],
  ["en-otp-label", "OTP is INERTABC"],
  ["en-reset-token-label", "Reset token is inert-reset-7"],
  ["en-control-obfuscated-password", "My pass\u200Bword is inert-birch-7"],
  ["ro-control-obfuscated-parola", "Paro\u200Bla mea este inert-fag-7"],
  ["benign-en", "I forgot my password"],
  ["benign-ro", "Am uitat parola"]
] as const;

console.log(JSON.stringify(cases.map(([id,input]) => {
  const result = redactSupportText(input);
  return { id,redacted: result.redacted,output: result.text };
}),null,2));
