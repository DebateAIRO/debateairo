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

  it("keeps every recipient address off the sendmail argv (L7-F7)", () => {
    const mailer = readFileSync("apps/api/src/mail-channel.ts", "utf8");
    // The argv array literal of each `spawn(...)`, whitespace removed.
    const spawnArgv = [...mailer.matchAll(/spawn\([\s\S]{0,200}?\[([^\]]*)\]/g)]
      .map((match) => match[1]!.replace(/\s+/g, ""));
    expect(spawnArgv).toHaveLength(2);
    for (const argv of spawnArgv) {
      // `-t` makes the MTA read recipients from the header block on stdin, so
      // only the fixed envelope sender may reach argv, which every local user
      // can read out of `ps`. No `--`, no recipient, nothing else.
      expect(argv).toBe('"-i","-t","-f",this.options.from');
    }
    // Both senders route the recipient through the one guard that refuses a
    // separator, which would fan the message out to a second mailbox once the
    // MTA parses `To:`. One definition, two call sites.
    expect(mailer).toContain("[,;]");
    expect(mailer.match(/isSingleDeliverableRecipient\(/g) ?? []).toHaveLength(3);

    const capture = readFileSync("deploy/dev-auth/sendmail-capture.mjs", "utf8");
    expect(capture).toContain('argv[1] !== "-t"');
    expect(capture).not.toContain('argv[3] !== "--"');
    expect(capture).toContain("RECIPIENT_GRAMMAR");
    expect(capture).toContain("DEV_MAIL_CAPTURE_RECIPIENT_INVALID");
  });

});
