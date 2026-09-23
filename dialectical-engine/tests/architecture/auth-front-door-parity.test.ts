import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REQUIRED_AUTH_ROUTES,
  assertProductionAuthRoutes
} from "../../scripts/assert-auth-front-door-routes.mjs";

const roots: string[] = [];
const read = (path: string) => readFile(join(process.cwd(), path), "utf8");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fakeBuild(routes: readonly string[] = REQUIRED_AUTH_ROUTES): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "auth-front-door-"));
  roots.push(root);
  await mkdir(join(root, ".next/server/app"), { recursive: true });
  const appPaths = Object.fromEntries(routes.map((route) => [
    `${route}/page`,
    `app${route}/page.js`
  ]));
  await writeFile(join(root, ".next/server/app-paths-manifest.json"), JSON.stringify(appPaths));
  await writeFile(join(root, ".next/routes-manifest.json"), JSON.stringify({
    staticRoutes: routes.map((route) => ({ page: route }))
  }));
  for (const compiledPath of Object.values(appPaths)) {
    const target = join(root, ".next/server", compiledPath);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "compiled");
  }
  return root;
}

describe("auth front-door parity", () => {
  // `web/` was the second Next build this gate compared against. It is retired
  // in favour of apps/ui (.hermes/reports/2026-09-01-algorithm-live-loop/
  // PROGRESS.md:32, DECISIONS.md:810), so the manifest gate is asserted over the
  // one surviving build. Nothing else about the gate changes.
  it("uses one exact four-route production-manifest gate from the surviving Next build", async () => {
    expect(REQUIRED_AUTH_ROUTES).toEqual([
      "/login",
      "/sign-up",
      "/verify-email",
      "/enroll-mfa"
    ]);
    const packageJson = JSON.parse(await read("apps/ui/package.json")) as { scripts: { build: string } };
    expect(packageJson.scripts.build).toContain("assert-auth-front-door-routes.mjs");

    await expect(assertProductionAuthRoutes(await fakeBuild(), "fixture"))
      .resolves.toEqual(REQUIRED_AUTH_ROUTES);
    await expect(assertProductionAuthRoutes(
      await fakeBuild(REQUIRED_AUTH_ROUTES.filter((route) => route !== "/enroll-mfa")),
      "mutant"
    )).rejects.toThrow("/enroll-mfa is absent");
  });

  // Same retirement: the four `web/` halves of this parity pair are gone
  // (PROGRESS.md:32, DECISIONS.md:810). Each assertion's PURPOSE — the shipped
  // auth flows carry exactly the supported state machines and no invented
  // affordance — survives on apps/ui, where every one of the four artifacts
  // exists, so the arm is re-pointed rather than retired. The assertion texts
  // below are unchanged.
  it("pins the supported auth state machines and excludes invented affordances", async () => {
    const [login, signUp, verify, enroll, englishAuth] = await Promise.all([
      read("apps/ui/components/LoginFlow.tsx"),
      read("apps/ui/components/SignUpFlow.tsx"),
      read("apps/ui/app/verify-email/page.tsx"),
      read("apps/ui/app/enroll-mfa/page.tsx"),
      read("apps/ui/messages/en/auth.json")
    ]);
    const englishAuthCatalog = JSON.parse(englishAuth) as Readonly<Record<string, string>>;

    expect(login).toMatch(/client\.beginLogin/);
    expect(login).toMatch(/client\.completeLogin/);
    expect(login).toMatch(/replacement_recovery_code/);
    for (const [key, english] of [
      ["auth.login.authenticatorTitle", "Enter your authentication code."],
      ["auth.login.useRecoveryCode", "Use a recovery code"],
      ["auth.login.recoveryTitle", "Enter a recovery code."],
      ["auth.login.backToSignIn", "Back to sign in"]
    ] as const) {
      expect(login).toContain(`t(catalog, "${key}")`);
      expect(englishAuthCatalog[key], `${key} English catalogue value`).toBe(english);
    }
    expect(login).not.toMatch(/localStorage|sessionStorage|Bearer|OAuth|forgot|remember/i);

    expect(signUp).toMatch(/client\.register/);
    expect(signUp).toMatch(/client\.resendVerification/);
    expect(signUp).toMatch(/section-primary-email email/);
    expect(signUp).toMatch(/section-recovery-email email/);
    expect(signUp).not.toMatch(/localStorage|sessionStorage|Bearer|Google|Model API|terms/i);

    expect(verify).toMatch(/export \{ default \} from "\.\.\/enroll-mfa\/page"/);
    expect(verify).not.toMatch(/<form\b/);

    expect(enroll).toContain('id="totp-code"');
    expect(enroll).toContain('id="recovery-typeback"');
    expect(enroll).not.toMatch(/<form\b/);
  });
});
