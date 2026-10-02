import { describe, expect, it } from "vitest";
import { buildTemplatedMessage, encodeHeaderText } from "../../apps/api/src/mail-mime.js";

function decodeWords(header: string): string {
  return header.split(" ").map((word) => {
    const match = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/.exec(word);
    if (match === null) throw new Error(`not an encoded word: ${word}`);
    return Buffer.from(match[1]!, "base64").toString("utf8");
  }).join("");
}

const BASE = Object.freeze({
  from: "noreply@debateai.test",
  to: "person@example.test",
  messageId: "11111111-1111-4111-8111-111111111111",
  subject: "Your Plus plan is active",
  text: "Hello,\n\nThank you.",
  html: "<!doctype html>\n<p>Hello,</p>",
  attachments: [] as const,
  boundary: "0123456789abcdef0123456789abcdef"
});

describe("P17 MIME assembly", () => {
  it("keeps an ASCII subject as it is and encodes any other in words of at most 75 characters", () => {
    expect(encodeHeaderText("Your Plus plan is active")).toBe("Your Plus plan is active");
    const subject = "Ваш план Plus активен — спасибо, что выбрали DebateAI для своих дебатов";
    const encoded = encodeHeaderText(subject);
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
    for (const word of encoded.split(" ")) expect(word.length).toBeLessThanOrEqual(75);
    expect(decodeWords(encoded)).toBe(subject);
  });

  it("builds multipart/mixed around text + html, with each attachment base64-encoded", () => {
    const pdf = Buffer.from("%PDF-1.4 fake", "utf8");
    const message = buildTemplatedMessage({
      ...BASE,
      attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", content: pdf }]
    });
    const [head, ...rest] = message.split("\r\n\r\n");
    const headers = head!.split("\r\n");
    expect(headers.filter((line) => /^To:/i.test(line))).toEqual(["To: person@example.test"]);
    expect(headers.some((line) => /^[ \t]/.test(line))).toBe(false);
    expect(headers).toContain('Content-Type: multipart/mixed; boundary="mixed-0123456789abcdef0123456789abcdef"');
    expect(headers).toContain("Message-ID: <11111111-1111-4111-8111-111111111111@debateai.local>");
    const body = rest.join("\r\n\r\n");
    expect(body).toContain('Content-Type: multipart/alternative; boundary="alt-0123456789abcdef0123456789abcdef"');
    expect(body).toContain("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64");
    expect(body).toContain("Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64");
    expect(body).toContain('Content-Disposition: attachment; filename="invoice.pdf"');
    expect(body).toContain(pdf.toString("base64"));
    expect(body).toContain(Buffer.from(BASE.text, "utf8").toString("base64"));
    expect(message.endsWith("--mixed-0123456789abcdef0123456789abcdef--\r\n")).toBe(true);
    for (const line of message.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
  });

  it("refuses a filename or boundary that could break the structure", () => {
    expect(() => buildTemplatedMessage({
      ...BASE, attachments: [{ filename: 'x"; evil=".pdf', contentType: "application/pdf", content: Buffer.alloc(1) }]
    })).toThrow("MAIL_ATTACHMENT_INVALID");
    expect(() => buildTemplatedMessage({ ...BASE, boundary: "short" })).toThrow("MAIL_BOUNDARY_INVALID");
  });
});
