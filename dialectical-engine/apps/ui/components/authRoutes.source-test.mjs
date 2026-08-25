import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  try {
    return readFileSync(new URL(path, import.meta.url), "utf8");
  } catch {
    return "";
  }
};

const login = read("../app/login/page.tsx");
const signUp = read("../app/sign-up/page.tsx");
const shell = read("./AuthShell.tsx");
const gate = read("./AuthGate.tsx");
const topBar = read("./TopBar.tsx");
const styles = read("../app/globals.css");

test("dedicated login keeps the two-phase mandatory-MFA contract", () => {
  assert.match(login, /contractClient\.beginLogin/);
  assert.match(login, /contractClient\.completeLogin/);
  assert.match(login, /Authenticator or recovery code/);
  assert.match(login, /replacement_recovery_code/);
  assert.match(login, /role="alert"/);
  assert.match(login, /window\.location\.assign\(HOME_PATH\)/);
  assert.doesNotMatch(login, /localStorage|sessionStorage|Bearer|keep me signed|forgot/i);
});

test("sign-up exposes only fields backed by the registration contract", () => {
  assert.match(signUp, /contractClient\.register/);
  assert.match(signUp, /contractClient\.resendVerification/);
  assert.match(signUp, /name="recovery-email"[\s\S]*?required/);
  assert.match(signUp, /name="password"[\s\S]*?minLength=\{8\}/);
  assert.match(signUp, /name="adult-affirmed"[\s\S]*?required/);
  assert.match(signUp, /result\.message/);
  assert.match(signUp, /role="status"/);
  assert.doesNotMatch(signUp, /localStorage|sessionStorage|Bearer|Google|Model API|terms|privacy notice/i);
});

test("auth screens share the reference hierarchy and replace the inline gate", () => {
  assert.match(shell, /authEyebrow/);
  assert.match(shell, /authHeadline/);
  assert.match(styles, /\.authColumn\s*\{/);
  assert.match(styles, /\.authHeadline\s*\{/);
  assert.match(styles, /\.authPrimary\s*\{/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.authScreen/);
  assert.match(gate, /window\.location\.replace\("\/login"\)/);
  assert.doesNotMatch(gate, /beginLogin|completeLogin/);
  assert.match(topBar, /AUTH_PATHS/);
});
