import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SELLER_COMPANY } from "@debateai/billing-core";
import {
  BreachNoticeRefusal,
  parseBreachNoticeText,
  readBreachNoticeTexts,
  renderBreachNotice
} from "../../apps/api/src/breach-notice/text.js";

// The notice a person reads after a personal data breach (docs/operations/breach-runbook.md part 6). The owner writes it,
// one file per language; the command refuses a file it cannot send as written, before anything is sent.

const ENGLISH = [
  "Subject: Notice of Data Breach",
  "",
  "What Happened?",
  "On 3 May someone read a copy of our database.",
  "",
  "What You Can Do",
  "Change your password here and wherever else you used it.",
  "",
  "For More Information",
  "Write to privacy@dezbatere.ro."
].join("\n");

const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof BreachNoticeRefusal) return error.code;
    throw error;
  }
  return "NO_REFUSAL";
};

const folders: string[] = [];
function folderWith(files: Readonly<Record<string, string>>): string {
  const folder = mkdtempSync(join(tmpdir(), "debateai-breach-texts-"));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content, "utf8");
  return folder;
}
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("one notice text: a subject line, an empty line, then the message", () => {
  it("reads the subject and the paragraphs, and keeps the lines of a paragraph", () => {
    const text = parseBreachNoticeText("en", ENGLISH);
    expect(text.language).toBe("en");
    expect(text.subject).toBe("Notice of Data Breach");
    expect(text.paragraphs).toEqual([
      "What Happened?\nOn 3 May someone read a copy of our database.",
      "What You Can Do\nChange your password here and wherever else you used it.",
      "For More Information\nWrite to privacy@dezbatere.ro."
    ]);
    expect(text.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes a file saved on Windows or with a byte-order mark as the same text", () => {
    const plain = parseBreachNoticeText("en", ENGLISH);
    expect(parseBreachNoticeText("en", `\ufeff${ENGLISH.replaceAll("\n", "\r\n")}\r\n\r\n`).paragraphs).toEqual(plain.paragraphs);
  });

  it("names the file's bytes by their SHA-256, so the log says which text went out", () => {
    expect(parseBreachNoticeText("en", ENGLISH).sha256).not.toBe(parseBreachNoticeText("en", ENGLISH.replace("3 May", "4 May")).sha256);
  });

  it.each([
    ["no subject line", ENGLISH.replace("Subject: ", ""), "BREACH_NOTICE_TEXT_NO_SUBJECT"],
    ["an empty subject", ENGLISH.replace("Notice of Data Breach", "  "), "BREACH_NOTICE_TEXT_NO_SUBJECT"],
    ["a subject longer than 200 characters", ENGLISH.replace("Notice of Data Breach", "N".repeat(201)), "BREACH_NOTICE_TEXT_NO_SUBJECT"],
    ["no empty line after the subject", ENGLISH.replace("Breach\n\n", "Breach\n"), "BREACH_NOTICE_TEXT_NO_SUBJECT"],
    ["no message", "Subject: Notice of Data Breach\n\n   \n", "BREACH_NOTICE_TEXT_EMPTY"],
    ["a control character", ENGLISH.replace("3 May", "3\u0007May"), "BREACH_NOTICE_TEXT_CONTROL_CHARACTER"],
    ["a placeholder left in the message", ENGLISH.replace("3 May", "[the date]"), "BREACH_NOTICE_TEXT_PLACEHOLDER_LEFT"],
    ["a placeholder left in the subject", ENGLISH.replace("Notice of Data Breach", "Notice [title]"), "BREACH_NOTICE_TEXT_PLACEHOLDER_LEFT"],
    ["no address to write to", ENGLISH.replace("privacy@dezbatere.ro", "us"), "BREACH_NOTICE_TEXT_NO_CONTACT"],
    ["a message longer than 20,000 characters", `${ENGLISH}\n\n${"a".repeat(20_001)}`, "BREACH_NOTICE_TEXT_TOO_LONG"]
  ])("refuses %s", (_name, raw, code) => {
    expect(refusal(() => parseBreachNoticeText("en", raw))).toBe(code);
  });

  it("refuses bytes that are not UTF-8, and a language mail is not written in", () => {
    expect(refusal(() => parseBreachNoticeText("en", Buffer.from([0x53, 0xff, 0xfe])))).toBe("BREACH_NOTICE_TEXT_NOT_UTF8");
    expect(refusal(() => parseBreachNoticeText("xx", ENGLISH))).toBe("BREACH_NOTICE_TEXT_LANGUAGE_UNKNOWN");
    expect(refusal(() => parseBreachNoticeText("en-US", ENGLISH))).toBe("BREACH_NOTICE_TEXT_LANGUAGE_UNKNOWN");
  });

  it("a refusal names the file and never repeats the text", () => {
    try {
      parseBreachNoticeText("fi", ENGLISH.replace("privacy@dezbatere.ro", "us"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BreachNoticeRefusal);
      expect((error as BreachNoticeRefusal).message).toContain("fi.txt");
      expect((error as BreachNoticeRefusal).message).not.toContain("database");
    }
  });
});

describe("the folder of notice texts: one <language>.txt per language", () => {
  it("reads every language file and ignores what is not a .txt file", () => {
    const folder = folderWith({ "en.txt": ENGLISH, "ro.txt": ENGLISH.replace("Notice of Data Breach", "Notificare"), "notes.md": "x", ".DS_Store": "x" });
    const texts = readBreachNoticeTexts(folder);
    expect([...texts.keys()].sort()).toEqual(["en", "ro"]);
    expect(texts.get("ro")!.subject).toBe("Notificare");
  });

  it("refuses a .txt file whose name is not a language, a folder with no text, a missing folder and an oversized file", () => {
    expect(refusal(() => readBreachNoticeTexts(folderWith({ "english.txt": ENGLISH })))).toBe("BREACH_NOTICE_TEXT_LANGUAGE_UNKNOWN");
    expect(refusal(() => readBreachNoticeTexts(folderWith({ "notes.md": "x" })))).toBe("BREACH_NOTICE_TEXTS_NONE");
    expect(refusal(() => readBreachNoticeTexts(join(tmpdir(), "debateai-breach-texts-missing")))).toBe("BREACH_NOTICE_TEXTS_UNREADABLE");
    expect(refusal(() => readBreachNoticeTexts(folderWith({ "en.txt": `${ENGLISH}\n\n${"é".repeat(70_000)}` })))).toBe("BREACH_NOTICE_TEXT_TOO_LONG");
  });

  it("refuses a folder inside the folder", () => {
    const folder = folderWith({ "en.txt": ENGLISH });
    mkdirSync(join(folder, "fr.txt"));
    expect(refusal(() => readBreachNoticeTexts(folder))).toBe("BREACH_NOTICE_TEXTS_UNREADABLE");
  });
});

describe("the mail a notice text becomes", () => {
  it("prints the message as written, then who we are and where to write", () => {
    const mail = renderBreachNotice(parseBreachNoticeText("en", ENGLISH));
    expect(mail.subject).toBe("Notice of Data Breach");
    expect(mail.text.startsWith("What Happened?\nOn 3 May someone read a copy of our database.\n\nWhat You Can Do\n")).toBe(true);
    expect(mail.text.endsWith(`\n\n-- \n${SELLER_COMPANY.legalName}, ${SELLER_COMPANY.registeredOffice}. ${SELLER_COMPANY.emails.privacy}\n`)).toBe(true);
    expect(mail.html).toContain('<html lang="en" dir="ltr">');
    expect(mail.html).toContain("<p>What Happened?<br>On 3 May someone read a copy of our database.</p>");
    expect(mail.html).toContain("<title>Notice of Data Breach</title>");
  });

  it("escapes the text in the HTML part and writes Arabic and Hebrew right to left", () => {
    const text = parseBreachNoticeText("he", ENGLISH.replace("3 May", "3 <b>May</b> & \"so\" on"));
    const mail = renderBreachNotice(text);
    expect(mail.html).toContain('<html lang="he" dir="rtl">');
    expect(mail.html).toContain("3 &lt;b&gt;May&lt;/b&gt; &amp; &quot;so&quot; on");
    expect(mail.html).not.toContain("<b>");
    expect(mail.text).toContain("3 <b>May</b> & \"so\" on");
  });
});
