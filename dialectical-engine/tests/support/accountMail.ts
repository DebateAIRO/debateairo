/** Decode the two alternatives to assert visible copy rather than base64 artifacts. */
export function mailAlternatives(message: string): { text: string; html: string } {
  const parts = [...message.matchAll(/Content-Type: text\/(plain|html); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)];
  if (parts.length !== 2) throw new Error("EXPECTED_TWO_MAIL_ALTERNATIVES");
  return { text: Buffer.from(parts[0]![2]!.replaceAll("\r\n", ""), "base64").toString("utf8"), html: Buffer.from(parts[1]![2]!.replaceAll("\r\n", ""), "base64").toString("utf8") };
}
