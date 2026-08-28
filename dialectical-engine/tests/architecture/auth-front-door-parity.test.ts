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
  it("uses one exact four-route production-manifest gate from both Next builds", async () => {
    expect(REQUIRED_AUTH_ROUTES).toEqual([
      "/login",
      "/sign-up",
      "/verify-email",
      "/enroll-mfa"
    ]);
    for (const packagePath of ["apps/ui/package.json", "web/package.json"]) {
      const packageJson = JSON.parse(await read(packagePath)) as { scripts: { build: string } };
      expect(packageJson.scripts.build).toContain("assert-auth-front-door-routes.mjs");
    }

    await expect(assertProductionAuthRoutes(await fakeBuild(), "fixture"))
      .resolves.toEqual(REQUIRED_AUTH_ROUTES);
    await expect(assertProductionAuthRoutes(
      await fakeBuild(REQUIRED_AUTH_ROUTES.filter((route) => route !== "/enroll-mfa")),
      "mutant"
    )).rejects.toThrow("/enroll-mfa is absent");
  });

  it("pins the same supported auth state machines and excludes invented affordances", async () => {
    const [uiLogin, webLogin, uiSignUp, webSignUp, uiVerify, webVerify, uiEnroll, webEnroll] =
      await Promise.all([
        read("apps/ui/components/LoginFlow.tsx"),
        read("web/components/LoginFlow.tsx"),
        read("apps/ui/components/SignUpFlow.tsx"),
        read("web/components/SignUpFlow.tsx"),
        read("apps/ui/app/verify-email/page.tsx"),
        read("web/app/verify-email/page.tsx"),
        read("apps/ui/app/enroll-mfa/page.tsx"),
        read("web/app/enroll-mfa/page.tsx")
      ]);

    for (const login of [uiLogin, webLogin]) {
      expect(login).toMatch(/client\.beginLogin/);
      expect(login).toMatch(/client\.completeLogin/);
      expect(login).toMatch(/replacement_recovery_code/);
      expect(login).toMatch(/Enter your authentication code\./);
      expect(login).toMatch(/Use a recovery code/);
      expect(login).toMatch(/Enter a recovery code\./);
      expect(login).toMatch(/Back to sign in/);
      expect(login).not.toMatch(/localStorage|sessionStorage|Bearer|OAuth|forgot|remember/i);
    }
    for (const signUp of [uiSignUp, webSignUp]) {
      expect(signUp).toMatch(/client\.register/);
      expect(signUp).toMatch(/client\.resendVerification/);
      expect(signUp).toMatch(/section-primary-email email/);
      expect(signUp).toMatch(/section-recovery-email email/);
      expect(signUp).not.toMatch(/localStorage|sessionStorage|Bearer|Google|Model API|terms/i);
    }
    for (const verify of [uiVerify, webVerify]) {
      expect(verify).toMatch(/export \{ default \} from "\.\.\/enroll-mfa\/page"/);
      expect(verify).not.toMatch(/<form\b/);
    }
    for (const enroll of [uiEnroll, webEnroll]) {
      expect(enroll).toContain('id="totp-code"');
      expect(enroll).toContain('id="recovery-typeback"');
      expect(enroll).not.toMatch(/<form\b/);
    }
  });
});
