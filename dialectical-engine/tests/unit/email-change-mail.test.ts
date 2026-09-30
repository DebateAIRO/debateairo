import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emailChangeLink,
  MailDeliveryError,
  SendmailEmailChangeMailSender
} from "../../apps/api/src/mail-channel.js";

// Turn 14 — the three change-email messages through the real `sendmail -t`
// path, captured by the dev sink (deploy/dev-auth/sendmail-capture.mjs).

const capture = fileURLToPath(new URL("../../deploy/dev-auth/sendmail-capture.mjs", import.meta.url));
const token = "A".repeat(21) + "_" + "b".repeat(20) + "-";
const expiresAt = new Date("2026-09-29T12:00:00.000Z");
let directory: string;
let previous: string | undefined;

async function captured(): Promise<readonly string[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".eml"));
  return Promise.all(names.map((name) => readFile(join(directory, name), "utf8")));
}

function sender(): SendmailEmailChangeMailSender {
  return new SendmailEmailChangeMailSender({
    executable: capture, from: "noreply@debate.test", publicAppUrl: "https://debate.test", timeoutMs: 10_000
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "t14-mail-"));
  previous = process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
  process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = directory;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
  else process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = previous;
  await rm(directory, { recursive: true, force: true });
});

describe("Turn 14 change-email mail", () => {
  it("builds Settings links that carry the bearer only in the fragment", () => {
    expect(emailChangeLink("https://debate.test", "confirm", token))
      .toBe(`https://debate.test/settings#email-change=confirm&token=${token}`);
    expect(emailChangeLink("https://debate.test/", "cancel", token))
      .toBe(`https://debate.test/settings#email-change=cancel&token=${token}`);
    expect(() => emailChangeLink("https://debate.test", "confirm", "short")).toThrow(MailDeliveryError);
  });

  it("mails the confirmation link to the new address", async () => {
    await sender().sendEmailChange({ kind: "confirmation", recipient: "ana.popescu@icub.ro", token, expiresAt });
    const [message] = await captured();
    expect(message).toContain("To: ana.popescu@icub.ro\r\n");
    expect(message).toContain("Subject: Confirm your new DebateAI email\r\n");
    expect(message).toContain(`https://debate.test/settings#email-change=confirm&token=${token}\r\n`);
    expect(message).toContain("This link expires at 2026-09-29T12:00:00.000Z.");
  });

  it("mails the current address a notice naming the new one, with a cancel link and no confirm link", async () => {
    await sender().sendEmailChange({
      kind: "notice", recipient: "ana.popescu@unibuc.ro", newEmail: "ana.popescu@icub.ro", cancelToken: token, expiresAt
    });
    const [message] = await captured();
    expect(message).toContain("To: ana.popescu@unibuc.ro\r\n");
    expect(message).toContain("Subject: Your DebateAI email is being changed\r\n");
    expect(message).toContain("change its email to ana.popescu@icub.ro.");
    expect(message).toContain(`https://debate.test/settings#email-change=cancel&token=${token}\r\n`);
    expect(message).not.toContain("email-change=confirm");
  });

  it("mails an address that already has an account a note with no link", async () => {
    await sender().sendEmailChange({ kind: "address-unavailable", recipient: "owner@icub.ro" });
    const [message] = await captured();
    expect(message).toContain("To: owner@icub.ro\r\n");
    expect(message).toContain("already belongs to one");
    expect(message).not.toContain("https://");
  });

  it("refuses a second recipient smuggled into either address before spawning sendmail", async () => {
    await expect(sender().sendEmailChange({ kind: "address-unavailable", recipient: "a@b.ro,c@d.ro" }))
      .rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
    await expect(sender().sendEmailChange({
      kind: "notice", recipient: "a@b.ro", newEmail: "x@y.ro\r\nBcc: z@w.ro", cancelToken: token, expiresAt
    })).rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
    expect(await captured()).toEqual([]);
  });
});
