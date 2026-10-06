/**
 * One templated message: multipart/mixed around multipart/alternative (text + html), then the attachments
 * (AMENDMENTS-R1 A26(b)). Every part is base64 in 76-character lines, so no UTF-8 text reaches the MTA raw.
 * The header block has no folded line: the dev capture (deploy/dev-auth/sendmail-capture.mjs) refuses one.
 */
export type MailAttachment = Readonly<{
  filename: string;
  contentType: "text/plain; charset=UTF-8" | "application/pdf";
  content: Uint8Array;
}>;

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const BOUNDARY = /^[A-Za-z0-9]{16,64}$/;

/** RFC 2047 B-encoding, split on character boundaries so each word stays within 75 characters. */
export function encodeHeaderText(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const character of value) {
    if (Buffer.byteLength(chunk + character, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk !== "") words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`).join(" ");
}

function base64Lines(bytes: Uint8Array): string {
  return (Buffer.from(bytes).toString("base64").match(/.{1,76}/g) ?? [""]).join("\r\n");
}

export function buildTemplatedMessage(input: Readonly<{
  from: string;
  to: string;
  messageId: string | null;
  subject: string;
  text: string;
  html: string;
  attachments: ReadonlyArray<MailAttachment>;
  boundary: string;
}>): string {
  if (!BOUNDARY.test(input.boundary)) throw new TypeError("MAIL_BOUNDARY_INVALID");
  const mixed = `mixed-${input.boundary}`;
  const alternative = `alt-${input.boundary}`;
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    ...(input.messageId === null ? [] : [`Message-ID: <${input.messageId}@debateai.local>`]),
    `Subject: ${encodeHeaderText(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.text, "utf8")),
    `--${alternative}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.html, "utf8")),
    `--${alternative}--`
  ];
  for (const attachment of input.attachments) {
    if (!FILENAME.test(attachment.filename)) throw new TypeError("MAIL_ATTACHMENT_INVALID");
    lines.push(
      `--${mixed}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(attachment.content)
    );
  }
  lines.push(`--${mixed}--`, "");
  return lines.join("\r\n");
}
