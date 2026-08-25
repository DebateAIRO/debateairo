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

const login = read("./LoginFlow.tsx");
const signUp = read("./SignUpFlow.tsx");
const shell = read("./AuthShell.tsx");
const gate = read("./AuthGate.tsx");
const topBar = read("./TopBar.tsx");
const styles = read("../app/globals.css");
const home = read("../app/page.tsx");
const verifyEmail = read("../app/verify-email/page.tsx");
const packageJson = read("../package.json");

test("dedicated login keeps the two-phase mandatory-MFA contract", () => {
  assert.match(login, /client\.beginLogin/);
  assert.match(login, /client\.completeLogin/);
  assert.match(login, /Authenticator or recovery code/);
  assert.match(login, /replacement_recovery_code/);
  assert.match(login, /role="alert"/);
  assert.match(login, /window\.location\.assign\(HOME_PATH\)/);
  assert.doesNotMatch(login, /localStorage|sessionStorage|Bearer|keep me signed|forgot/i);
});

test("sign-up exposes only fields backed by the registration contract", () => {
  assert.match(signUp, /client\.register/);
  assert.match(signUp, /client\.resendVerification/);
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

test("every public and protected entry point reaches the dedicated auth routes", () => {
  assert.match(topBar, /href="\/login"/);
  assert.match(home, /href="\/login"/);
  assert.match(home, /href="\/sign-up"/);
  assert.match(login, /href="\/sign-up"/);
  assert.match(signUp, /href="\/login"/);
  assert.match(gate, /window\.location\.replace\("\/login"\)/);
});

test("verification remains one canonical mailed-link path and production builds gate every auth route", () => {
  assert.match(verifyEmail, /export \{ default \} from "\.\.\/enroll-mfa\/page"/);
  assert.match(packageJson, /assert-production-auth-routes\.mjs/);
});

test("ordinary top bar compacts without horizontal overflow at phone widths", () => {
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.topBar\s*\{[\s\S]*?height:\s*56px;[\s\S]*?padding-inline:\s*12px;[\s\S]*?\}/
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.topBar \.brandText,[\s\S]*?\.topBarContext\s*\{[\s\S]*?display:\s*none;[\s\S]*?\}/
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.topBarActions\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?gap:\s*6px;[\s\S]*?\}/
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*?\.topBarActions \.btn\s*\{[\s\S]*?padding-inline:\s*10px;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/
  );
});

test("auth headline sizing stays monotonic across the 640px breakpoint", () => {
  assert.match(
    styles,
    /\.authHeadline\s*\{[\s\S]*?font-size:\s*clamp\(42px,\s*9vw,\s*76px\);[\s\S]*?\}/
  );
  const phoneRules = styles.slice(styles.indexOf("@media (max-width: 640px)"));
  const phoneHeadline = phoneRules.match(/\.authHeadline\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(phoneHeadline, /font-size:/);
});

test("desktop auth content is 862px wide after its outer padding is accounted for", () => {
  assert.match(
    styles,
    /\.authColumn\s*\{[\s\S]*?max-width:\s*calc\(862px \+ 56px\);[\s\S]*?padding:\s*64px 28px 88px;[\s\S]*?\}/
  );
});

test("auth failures use stable public copy instead of exception text", () => {
  assert.doesNotMatch(login, /failure\.message/);
  assert.doesNotMatch(signUp, /failure\.message/);
  assert.match(login, /setError\("Sign-in could not be completed\."\)/);
  assert.match(login, /setError\("Authenticator verification could not be completed\."\)/);
  assert.match(signUp, /setError\("Account creation could not be completed\."\)/);
  assert.match(signUp, /setError\("Verification instructions could not be resent\."\)/);
});

test("primary and recovery emails occupy distinct autocomplete sections", () => {
  assert.match(
    signUp,
    /name="email"[^>]*autoComplete="section-primary-email email"/
  );
  assert.match(
    signUp,
    /name="recovery-email"[^>]*autoComplete="section-recovery-email email"/
  );
});

test("ordinary top bar exposes a neutral account entry without inventing session state", () => {
  assert.match(topBar, /href="\/login"[\s\S]*?>\s*Account\s*</);
  assert.doesNotMatch(topBar, />\s*Log in\s*</);
  assert.doesNotMatch(topBar, /Signed in|Signed out|authenticated|useSession/);
});
