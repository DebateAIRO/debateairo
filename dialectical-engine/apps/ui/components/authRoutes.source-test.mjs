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
const mfaRecovery = read("./MfaRecoveryFlow.tsx");
const loginPage = read("../app/login/page.tsx");
const signUp = read("./SignUpFlow.tsx");
const shell = read("./AuthShell.tsx");
const gate = read("./AuthGate.tsx");
const topBar = read("./TopBar.tsx");
const settingsPage = read("../app/settings/page.tsx");
const settingsClient = read("./SettingsPageClient.tsx");
const styles = read("../app/globals.css");
const home = read("../app/page.tsx");
const verifyEmail = read("../app/verify-email/page.tsx");
const enrollMfa = read("../app/enroll-mfa/page.tsx");
const returnPath = read("../lib/returnPath.ts");
const packageJson = read("../package.json");
const authMessages = JSON.parse(read("../messages/en/auth.json"));

test("login offers passkeys and only server-offered secure continuations",()=>{
 assert.match(login,/client\.beginLogin/);assert.match(login,/client\.completeLogin/);assert.match(login,/client\.completePasskeyLogin/);assert.match(login,/available_methods/);assert.match(login,/cancelConditional/);assert.match(login,/ageConfirmationRequired/);assert.match(login,/safeReturnPath/);
 assert.doesNotMatch(login,/localStorage|sessionStorage|failure\.message|authRules/);assert.equal(authMessages["auth.login.signInFailed"],"Email or password are incorrect. Please try again.");
});
test("signup has one email, phone, password, age and displayed consent evidence",()=>{
 assert.doesNotMatch(signUp,/name="(?:confirm-email|confirm-password|recovery-email)"|localStorage|sessionStorage|failure\.message/);
 assert.match(signUp,/<PhoneField/);assert.match(signUp,/name="password"/);assert.match(signUp,/autoComplete="new-password"/);assert.match(signUp,/<DateOfBirthField/);assert.match(signUp,/validateSignup/);assert.match(signUp,/flight\.current/);assert.ok(signUp.indexOf('await client.checkAge')<signUp.indexOf('await client.register'));assert.match(signUp,/termsDocument\.sha256/);assert.match(signUp,/privacyDocument\.sha256/);assert.match(signUp,/name="privacy-accepted"/);assert.match(signUp,/name="terms-accepted"/);assert.match(signUp,/<EmailPendingScreen/);
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
  // AccountMenu reads current session metadata; both account routes retain the real gate.
  assert.match(topBar, /<AccountMenu catalog=\{catalog\}/);
  // Review F2 (REV-FIX-CATALOGS): the gate now receives the served newDebate
  // catalogue; the route (settings behind the AuthGate) is unchanged.
  // L4: the settings page is never covered by the accept screen.
  // B10c: the page also serves the billing catalogue, for the usage bars.
  // N19 (spec 2026-10-05 §2.18): and the card-saving sentence's manifest pair, for the upgrade's agreement.
  assert.match(settingsPage, /<SettingsPageClient catalog=\{catalog\} locale=\{locale\} newDebateCatalog=\{newDebateCatalog\} billingCatalog=\{billingCatalog\}\s+renewalConsent=\{currentDocument\("CONSENT_RENEWAL", locale\)\} \/>/);
  assert.match(settingsClient, /<AuthGate catalog=\{newDebateCatalog\} legalGate=\{false\}>/);
  assert.match(home, /href="\/login"/);
  assert.match(home, /href="\/sign-up"/);
  assert.match(login, /useState\(["']\/sign-up["']\)/);
  assert.match(login, /href=\{signUpHref\}/);
  assert.match(signUp, /useState\(["']\/login["']\)/);
  assert.match(signUp, /href=\{loginHref\}/);
  // W11 fix 1: /login redirects a signed-in visitor to its ?next, which can be a card page
  // (/checkout?plan=…). A client-side <Link> would carry that redirect out inside the /sign-up
  // document, under the site's strict policy. A plain <a> makes /login a
  // full page load, so the card page arrives as a new document with its own policy.
  assert.match(signUp, /<a href=\{loginHref\}>/);
  assert.doesNotMatch(signUp, /<Link\b/);
  assert.doesNotMatch(signUp, /from "next\/link"/);
  assert.match(gate, /window\.location\.replace\("\/login"\)/);
});

test("the project home confirms a real session before exposing its debate composer", () => {
  // The Turn 3 design replaced the "you're signed in" banner with the library
  // itself, so the session gate is now proven by the composer's own guard
  // rather than by that copy.
  assert.match(home, /let sessionConfirmed = false/);
  assert.match(home, /sessionConfirmed = true/);
  // Task M8 (spec 2026-09-26 §14.4.7): the composer also reads the newDebate
  // catalogue, to say today's limit for new debates where the person typed.
  // Sensitive-data consent (V, 2026-09-29): it also records the interface locale with the consent.
  // Crisis check (V, 2026-09-30): and the edge's country, for the help-numbers screen.
  assert.match(home, /sessionConfirmed \? \([\s\S]*?<LibraryComposer catalog=\{catalog\} newDebateCatalog=\{newDebateCatalog\} roomCatalog=\{roomCatalog\} locale=\{locale\} crisisCountryHint=\{crisisCountryHint\} \/>/);
  // Task 16 (M8 review): only the two values the daily-limit message prints ship to the browser.
  assert.match(home, /const newDebateCatalog = dailyLimitMessageCatalog\(await loadNamespace\(locale, "newDebate"\)\);/);
  assert.match(home, /id="start-a-debate"/);
  assert.doesNotMatch(home, /<LibraryComposer catalog=\{catalog\} newDebateCatalog=\{newDebateCatalog\} roomCatalog=\{roomCatalog\} locale=\{locale\} crisisCountryHint=\{crisisCountryHint\} \/>[\s\S]*?\{error \?/);
});

test("the login route sends an already-authenticated browser back to its debate workspace", () => {
  // pin updated 2026-09-02: the page reads the session through readSessionCookie
  // (grammar-checked, L3-F5) instead of touching USER_TOKEN_COOKIE directly.
  assert.match(loginPage, /const cookieStore = await cookies\(\);[\s\S]*?readSessionCookie\(cookieStore\)/);
  assert.match(loginPage, /createServerContractClient/);
  assert.match(loginPage, /\.readSession\(\)/);
  assert.match(loginPage, /redirect\(safeReturnPath\(typeof requested === "string" \? requested : null\)\)/);
  assert.match(loginPage, /catch \{/);
  assert.match(loginPage, /return <LoginFlow catalog=\{catalog\} turnstile=\{turnstile\} \/>/);
});

test("verification remains one canonical mailed-link path and production builds gate every auth route", () => {
  assert.match(verifyEmail, /export \{ default \} from "\.\.\/enroll-mfa\/page"/);
  assert.match(packageJson, /assert-auth-front-door-routes\.mjs/);
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

test("auth headline keeps one size the phone breakpoint does not fight", () => {
  // The design document's auth screens are a fixed-width card, not a hero, so
  // the headline has one size rather than a viewport clamp.
  assert.match(styles, /\.authHeadline\s*\{[\s\S]*?font-size:\s*28px;[\s\S]*?\}/);
  const phoneRules = styles.slice(styles.indexOf("@media (max-width: 640px)"));
  const phoneHeadline = phoneRules.match(/\.authHeadline\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(phoneHeadline, /font-size:/);
});

test("desktop auth content is the document's 540px card", () => {
  assert.match(styles, /\.authCard\s*\{[\s\S]*?width:\s*540px;[\s\S]*?max-width:\s*100%;[\s\S]*?\}/);
});

test("auth failures retain public generic copy",()=>{assert.doesNotMatch(login,/failure\.message/);assert.doesNotMatch(signUp,/failure\.message/);assert.match(login,/auth\.login\.tooManyAttempts/);assert.match(login,/auth\.login\.recoveryCodeRejected/);assert.match(signUp,/auth\.signUp\.creationFailed/);});
test("signup uses password-manager autofill without recovery or confirmation fields",()=>{assert.match(signUp,/autoComplete="username"/);assert.match(signUp,/autoComplete="new-password"/);assert.doesNotMatch(signUp,/name="recovery-email"/);});

test("ordinary top bar delegates authenticated account navigation to the shared menu", () => {
  assert.match(topBar, /<AccountMenu catalog=\{catalog\}/);
  assert.doesNotMatch(topBar, /chrome.askerRolePlaceholder|chrome.asker/);
  const menu = read("./AccountMenu.tsx");
  assert.match(menu, /client.readSession/);
  assert.match(menu, /href="\/settings\/security"/);
  assert.match(menu, /endSession/);
  assert.doesNotMatch(menu, /localStorage|sessionStorage/);
});

test("every credential-bearing auth form has an explicit query-free POST fallback", () => {
  const forms = [
    ...(login.match(/<form\b[^>]*>/g) ?? []).map((tag) => ({ route: "/login", tag })),
    ...(signUp.match(/<form\b[^>]*>/g) ?? []).map((tag) => ({ route: "/sign-up", tag }))
  ];

  assert.equal(forms.length, 3, "expected login credentials, login MFA, and sign-up forms");
  for (const { route, tag } of forms) {
    assert.match(tag, /\bmethod="post"/, `${route} form must never default to GET`);
    assert.match(tag, new RegExp(`\\baction="${route}"`), `${route} form must use a safe same-origin action`);
    assert.doesNotMatch(tag, /\baction="[^"]*\?/, `${route} action must not preserve a sensitive query`);
  }
});

test("mailed-token enrollment has no native form that could submit secrets before hydration", () => {
  const enrollment=read("./auth/SecurityEnrollment.tsx");
  assert.match(enrollment, /id="enrollment-code"/);
  assert.doesNotMatch(enrollMfa, /id="recovery-typeback"/);
  assert.match(enrollMfa, /<SecurityEnrollment/);
  assert.match(enrollment,/result.status\s*===\s*["']authenticated["']/);
  assert.doesNotMatch(enrollMfa, /<form\b/);
  assert.doesNotMatch(verifyEmail, /<form\b/);
});

// Review M4 2026-10-09: a used recovery code is never refilled, so sign-in shows no replacement code; the custody guard
// now covers the ten new codes shown during authenticator recovery.
test("new recovery-code custody synchronously blocks only home navigation", () => {
  assert.doesNotMatch(login, /replacement_recovery_code|EphemeralCodes|setRecoveryAcknowledgementPending\(true\)/);
  assert.match(mfaRecovery, /setRecoveryAcknowledgementPending\(true\)/);
  assert.match(mfaRecovery, /setRecoveryAcknowledgementPending\(false\)/);
  assert.match(topBar, /useRecoveryAcknowledgementPending\(\)/);
  assert.match(topBar, /homeNavigationAvailable=\{!recoveryAcknowledgementPending\}/);
  assert.match(topBar, /aria-disabled="true"/);
  assert.doesNotMatch(topBar, /href=\{href\}[\s\S]*?aria-disabled="true"/);
});
