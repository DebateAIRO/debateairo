import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { archivedDocument } from "@debateai/legal-manifest";
import { renderWithdrawalForm } from "@debateai/mail-templates";
import type { BillingAudit } from "../../apps/api/src/billing/audit.js";
import {
  acceptedTermsAttachment,
  billingMailAttachmentResolvers,
  termsArchivePath,
  withdrawalFormAttachment
} from "../../apps/api/src/mail-attachments.js";

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function recordingAudit() {
  const lines: Array<Readonly<Record<string, unknown>>> = [];
  const audit: BillingAudit = (event, fields) => { lines.push(Object.freeze({ event, ...fields })); };
  return { audit, lines };
}

/** A legal root in the ruling Q-3 layout: the current draft, and `archive/<locale>/<sha256>.md` for each version. */
function legalTree(root: string, locale: string, current: Buffer, older: ReadonlyArray<Buffer>): void {
  mkdirSync(join(root, locale), { recursive: true });
  writeFileSync(join(root, locale, "terms-of-service.md"), current);
  mkdirSync(join(root, "archive", locale), { recursive: true });
  for (const bytes of [current, ...older]) writeFileSync(join(root, "archive", locale, `${sha(bytes)}.md`), bytes);
}

describe("P17 mail attachments", () => {
  it("attaches the version the person ACCEPTED from the archive, even after the Terms moved on (ruling Q-3)", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-legal-"));
    try {
      const accepted = Buffer.from("# Nutzungsbedingungen 2.0\n", "utf8");
      const current = Buffer.from("# Nutzungsbedingungen 2.1\n", "utf8");
      legalTree(root, "de", current, [accepted]);
      const legalRoot = pathToFileURL(`${root}/`);
      expect(termsArchivePath("de", sha(accepted))).toBe(`archive/de/${sha(accepted)}.md`);
      // The older version is attached though the current draft is another text.
      expect(await acceptedTermsAttachment({ locale: "de", expectedSha256: sha(accepted), legalRoot }))
        .toEqual({ filename: "terms-of-service.txt", contentType: "text/plain; charset=UTF-8", content: accepted });
      expect((await acceptedTermsAttachment({ locale: "de", expectedSha256: sha(current), legalRoot }))?.content.equals(current))
        .toBe(true);
      // A hash the archive never held, another locale's archive, or a path trick: nothing.
      expect(await acceptedTermsAttachment({ locale: "de", expectedSha256: "0".repeat(64), legalRoot })).toBeNull();
      expect(await acceptedTermsAttachment({ locale: "fr", expectedSha256: sha(accepted), legalRoot })).toBeNull();
      expect(await acceptedTermsAttachment({ locale: "../de", expectedSha256: sha(accepted), legalRoot })).toBeNull();
      // An archive file whose bytes do not hash to its name is never attached as that version.
      writeFileSync(join(root, "archive", "de", `${sha(accepted)}.md`), Buffer.from("# tampered\n", "utf8"));
      expect(await acceptedTermsAttachment({ locale: "de", expectedSha256: sha(accepted), legalRoot })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds the repository's own archived Terms from apps/api without a machine path (L2 archives every current draft)", async () => {
    const english = readFileSync(resolve("apps/ui/legal/en/terms-of-service.md"));
    expect(readFileSync(resolve("apps/ui/legal", termsArchivePath("en", sha(english)))).equals(english)).toBe(true);
    // Ruling Q-3: the manifest maps the hash to the same file this module reads (paths relative to dialectical-engine/).
    expect(archivedDocument("TERMS", "en", sha(english))?.path).toBe(`apps/ui/legal/${termsArchivePath("en", sha(english))}`);
    const attached = await acceptedTermsAttachment({ locale: "en", expectedSha256: sha(english) });
    expect(attached?.content.equals(english)).toBe(true);
  });

  it("attaches only a text the manifest's archive lists, even when a file with that hash sits in the folder (D1, Q-3)", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-legal-"));
    try {
      const unlisted = Buffer.from("# Terms never published\n", "utf8");
      legalTree(root, "en", unlisted, []);
      const legalRoot = pathToFileURL(`${root}/`);
      // The file itself is sound: the low-level reader would attach it.
      expect((await acceptedTermsAttachment({ locale: "en", expectedSha256: sha(unlisted), legalRoot }))?.content.equals(unlisted))
        .toBe(true);
      // The resolver asks the manifest first, which never archived this text, so nothing is attached.
      expect(archivedDocument("TERMS", "en", sha(unlisted))).toBeNull();
      const { audit, lines } = recordingAudit();
      const terms = billingMailAttachmentResolvers({ audit, legalRoot }).get("ACCEPTED_TERMS")!;
      expect(await terms({ sha256: sha(unlisted), locale: "en" }, "en")).toBeNull();
      expect(lines).toEqual([{ event: "billing.mail.attachment_missing", kind: "ACCEPTED_TERMS", code: "MAIL_TERMS_NOT_ARCHIVED" }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("attaches the model withdrawal form in the person's locale", () => {
    const attachment = withdrawalFormAttachment("de");
    expect(attachment.filename).toBe("withdrawal-form.txt");
    expect(Buffer.from(attachment.content).toString("utf8")).toBe(renderWithdrawalForm("de"));
  });

  it("gives P7's EMAIL job exactly the two resolvers this task owns, the Terms checked against the ACCEPTED row", async () => {
    const { audit, lines } = recordingAudit();
    const resolvers = billingMailAttachmentResolvers({ audit });
    expect([...resolvers.keys()].sort()).toEqual(["ACCEPTED_TERMS", "WITHDRAWAL_FORM"]);
    const terms = resolvers.get("ACCEPTED_TERMS")!;
    const english = readFileSync(resolve("apps/ui/legal/en/terms-of-service.md"));
    // The accepted pair is in the archive: attached, whatever the email's own locale is.
    const attached = await terms({ sha256: sha(english), locale: "en", version: "3.0" }, "de");
    expect(attached !== null && Buffer.from(attached.content).equals(english)).toBe(true);
    // The person accepted in German: the German version is the one attached, not the email locale's.
    const german = readFileSync(resolve("apps/ui/legal/de/terms-of-service.md"));
    const acceptedInGerman = await terms({ sha256: sha(german), locale: "de" }, "en");
    expect(acceptedInGerman !== null && Buffer.from(acceptedInGerman.content).equals(german)).toBe(true);
    expect(lines).toEqual([]);
    // A hash no published version ever had: nothing attached, and the content-free reason is logged.
    expect(await terms({ sha256: "0".repeat(64), locale: "en" }, "en")).toBeNull();
    // No acceptance row (fields {}), or fields that are not a hash and a locale: nothing attached either.
    expect(await terms({}, "en")).toBeNull();
    expect(await terms({ sha256: "not-a-hash", locale: "en" }, "en")).toBeNull();
    expect(await terms({ sha256: sha(english), locale: "../en" }, "en")).toBeNull();
    expect(lines).toEqual([
      { event: "billing.mail.attachment_missing", kind: "ACCEPTED_TERMS", code: "MAIL_TERMS_NOT_ARCHIVED" },
      { event: "billing.mail.attachment_missing", kind: "ACCEPTED_TERMS", code: "MAIL_TERMS_NOT_RECORDED" },
      { event: "billing.mail.attachment_missing", kind: "ACCEPTED_TERMS", code: "MAIL_TERMS_NOT_RECORDED" },
      { event: "billing.mail.attachment_missing", kind: "ACCEPTED_TERMS", code: "MAIL_TERMS_NOT_RECORDED" }
    ]);
    const form = await resolvers.get("WITHDRAWAL_FORM")!({}, "ro");
    expect(Buffer.from(form!.content).toString("utf8")).toBe(renderWithdrawalForm("ro"));
  });

  it("main.ts hands the billing runtime the sendmail sender and the resolvers, no longer `mail: undefined`", () => {
    const main = readFileSync(resolve("apps/api/src/main.ts"), "utf8");
    const runtime = main.slice(main.indexOf("createBillingRuntime({"), main.indexOf("reportPending", main.indexOf("createBillingRuntime({")));
    expect(runtime).toContain("new TemplatedMailSender({");
    expect(runtime).toContain("attachments: billingMailAttachmentResolvers({ audit: consoleBillingAudit })");
    expect(runtime).not.toContain("mail: undefined");
  });
});
