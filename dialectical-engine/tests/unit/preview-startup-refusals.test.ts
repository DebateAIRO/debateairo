import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PublicSite = Readonly<{ origin: string; hostname: string; turnstileSiteKey: string; hostedOnly: boolean }>;
// The operator files are plain .mjs without type declarations; they are loaded as the other launcher tests load them.
const operator = "../../deploy/" + "preview-auth-dev/v1/";
const { isNamedRefusal, namedRefusal, refuseNamed, startupRefusedLine } = await import(operator + "startup-refusals.mjs") as {
  isNamedRefusal: (code: unknown) => boolean;
  namedRefusal: (error: unknown) => string | undefined;
  refuseNamed: (code: string) => never;
  startupRefusedLine: (line: string, error: unknown) => string;
};
const { MAIN_ORIGIN, PUBLIC_ORIGINS, PUBLIC_SITES, publicSiteOf } = await import(operator + "public-origins.mjs") as {
  MAIN_ORIGIN: string; PUBLIC_ORIGINS: readonly string[]; PUBLIC_SITES: readonly PublicSite[];
  publicSiteOf: (value: string | undefined) => PublicSite | undefined;
};
const { PREVIEW_ORIGIN, PREVIEW_SITE_KEY } = await import(operator + "turnstile-custody.mjs") as { PREVIEW_ORIGIN: string; PREVIEW_SITE_KEY: string };

/**
 * The launchers name a refusal only when it has one of a few closed forms, so the journal can say which owner setting
 * is wrong without ever printing a setting's value. Everything else prints the bare line, as before.
 */
describe("named startup refusals", () => {
  it("names only codes of the closed forms", () => {
    for (const code of [
      "PREVIEW_ORIGIN_NOT_LISTED", "PREVIEW_MAIN_ORIGIN_NOT_HOSTED", "PREVIEW_STAFF_ORIGIN_MISMATCH",
      "PREVIEW_ASKS_OPEN_TO_INVALID", "PREVIEW_MAIL_ORIGIN_MISMATCH", "PREVIEW_LIVE_PAYMENTS_REFUSED:netopia-base"
    ]) expect(isNamedRefusal(code)).toBe(true);
    for (const code of [
      "PREVIEW_ENVIRONMENT_REFUSED", "PREVIEW_MAIL_REFUSED https://dezbatere.ro", "PREVIEW_ORIGIN_NOT_LISTED:https://evil.test",
      "PREVIEW_MAIL_", "preview_mail_origin_mismatch", "PREVIEW_ORIGIN_NOT_LISTED\nx", "PREVIEW_LIVE_PAYMENTS_REFUSED:Secret1",
      `PREVIEW_MAIL_${"A".repeat(200)}`, "", undefined, 7, null
    ]) expect(isNamedRefusal(code)).toBe(false);
  });

  it("reads the name from the cause, then the code, then the message", () => {
    expect(namedRefusal(new TypeError("PREVIEW_ENVIRONMENT_REFUSED", { cause: "PREVIEW_ORIGIN_NOT_LISTED" }))).toBe("PREVIEW_ORIGIN_NOT_LISTED");
    expect(namedRefusal(Object.assign(new Error("x"), { code: "PREVIEW_MAIL_ORIGIN_MISMATCH" }))).toBe("PREVIEW_MAIL_ORIGIN_MISMATCH");
    expect(namedRefusal(new TypeError("PREVIEW_ASKS_OPEN_TO_INVALID"))).toBe("PREVIEW_ASKS_OPEN_TO_INVALID");
    expect(namedRefusal(new TypeError("PREVIEW_ENVIRONMENT_REFUSED"))).toBeUndefined();
    expect(namedRefusal(new TypeError("anything", { cause: "password=hunter2" }))).toBeUndefined();
    expect(namedRefusal(undefined)).toBeUndefined();
  });

  it("refuses by name with the launcher's one message", () => {
    let thrown: unknown;
    try { refuseNamed("PREVIEW_MAIN_ORIGIN_NOT_HOSTED"); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toBe("PREVIEW_ENVIRONMENT_REFUSED");
    expect((thrown as Error).cause).toBe("PREVIEW_MAIN_ORIGIN_NOT_HOSTED");
    try { refuseNamed("a value https://x"); } catch (error) { thrown = error; }
    expect((thrown as Error).message).toBe("PREVIEW_ENVIRONMENT_REFUSED");
    expect((thrown as Error).cause).toBeUndefined();
  });

  it("prints the bare line, or the line and the name", () => {
    expect(startupRefusedLine("PREVIEW_API_STARTUP_REFUSED", new TypeError("boom"))).toBe("PREVIEW_API_STARTUP_REFUSED");
    expect(startupRefusedLine("PREVIEW_API_STARTUP_REFUSED", new TypeError("PREVIEW_ENVIRONMENT_REFUSED", { cause: "PREVIEW_MAIL_PLAN_SCHEMA" })))
      .toBe("PREVIEW_API_STARTUP_REFUSED PREVIEW_MAIL_PLAN_SCHEMA");
  });

  it("every launcher prints its refusal through the one helper", () => {
    for (const [file, line] of [["launch-api.mjs", "PREVIEW_API_STARTUP_REFUSED"], ["launch-ui.mjs", "PREVIEW_UI_STARTUP_REFUSED"], ["launch-runner.mjs", "PREVIEW_RUNNER_STARTUP_REFUSED"]] as const) {
      const source = readFileSync(resolve("deploy/preview-auth-dev/v1", file), "utf8");
      expect(source).toContain(`startupRefusedLine('${line}',error)`);
      expect(source.split(`'${line}`).length).toBe(2);
    }
  });
});

describe("the public names this setup may answer as", () => {
  it("lists exactly the test name and the main site's name", () => {
    expect(PUBLIC_ORIGINS).toEqual(["https://v3-preview.dezbatere.ro", "https://dezbatere.ro"]);
    expect(PUBLIC_ORIGINS[0]).toBe(PREVIEW_ORIGIN);
    expect(MAIN_ORIGIN).toBe("https://dezbatere.ro");
    expect(PUBLIC_SITES.map((site) => site.hostedOnly)).toEqual([false, true]);
    expect(PUBLIC_SITES.every((site) => site.turnstileSiteKey === PREVIEW_SITE_KEY)).toBe(true);
    expect(PUBLIC_SITES.map((site) => site.hostname)).toEqual(PUBLIC_ORIGINS.map((origin) => new URL(origin).hostname));
    expect(Object.isFrozen(PUBLIC_SITES) && PUBLIC_SITES.every(Object.isFrozen)).toBe(true);
  });

  it("matches an origin only by its exact text", () => {
    expect(publicSiteOf("https://dezbatere.ro")?.hostname).toBe("dezbatere.ro");
    for (const other of ["https://dezbatere.ro/", "https://www.dezbatere.ro", "http://dezbatere.ro", "https://Dezbatere.ro", "https://dezbatere.ro.evil.test", undefined])
      expect(publicSiteOf(other)).toBeUndefined();
  });
});
