import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DEV-06 mail capture executable contract", () => {
  it("is a file-only executable with bounded input and no network listener", () => {
    const source = readFileSync("deploy/dev-auth/sendmail-capture.mjs", "utf8");
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(source).toContain("DEBATEAI_DEV_MAIL_CAPTURE_DIR");
    expect(source).toContain("MAX_MESSAGE_BYTES");
    expect(source).toContain("0o700");
    expect(source).toContain("0o600");
    expect(source).toContain("randomUUID");
    expect(source).toContain("O_EXCL");
    expect(source).toContain("file.chmod(MESSAGE_MODE)");
    expect(source).toContain("sync()");
    expect(source).not.toMatch(/node:(?:net|http|https|http2|dgram|tls)/);
    expect(source).not.toMatch(/\.listen\s*\(/);
    expect(source).not.toContain("console.log");
  });

  it("keeps the topology wired to the exact executable and private spool", () => {
    const topology = JSON.parse(readFileSync(
      "docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json",
      "utf8"
    )) as {
      apiEnvironment: Record<string, string>;
      persistentPaths: Array<{ id: string; path: string; mode: string }>;
    };
    expect(topology.apiEnvironment.MAIL_SENDMAIL_PATH).toBe("deploy/dev-auth/sendmail-capture.mjs");
    expect(topology.apiEnvironment.DEBATEAI_DEV_MAIL_CAPTURE_DIR).toBe(".local/dev-auth/mail");
    expect(topology.persistentPaths).toContainEqual({
      id: "mail",
      path: ".local/dev-auth/mail",
      mode: "0700"
    });
  });
});
