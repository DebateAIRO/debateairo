// tests/support/netopia-notice.ts
// NETOPIA's signed message for the tests (spec 2026-10-05 §2.4.6), written from the JWT rules directly (never from the
// package), with every refused shape the verifier must catch. Every key is generated here (spec §2.2 rule 2).
import { createHash, createHmac, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { loadTrustedKeys, type NoticeTrust } from "@debateai/payments-netopia";

export type SignedNoticeInput = Readonly<{
  privateKey: KeyObject; posSignature: string; body: object | Buffer;
  aud?: string | ReadonlyArray<string>; alg?: "RS512" | "RS256" | "HS512" | "none"; iss?: string;
}>;

const base64url = (value: string | Buffer): string => Buffer.from(value).toString("base64url");

export function signedNetopiaNotice(input: SignedNoticeInput): Readonly<{ rawBody: Buffer; header: string }> {
  const rawBody = Buffer.isBuffer(input.body) ? input.body : Buffer.from(JSON.stringify(input.body), "utf8");
  const alg = input.alg ?? "RS512";
  const head = base64url(JSON.stringify({ alg, typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: input.iss ?? "NETOPIA Payments", aud: input.aud ?? [input.posSignature], iat: Math.floor(Date.now() / 1000),
    sub: createHash("sha512").update(rawBody).digest("base64")
  }));
  const signingInput = `${head}.${claims}`;
  // HS512 keyed with the PUBLIC key's PEM: the classic algorithm-confusion forgery the verifier must refuse.
  const signature = alg === "none" ? ""
    : alg === "HS512" ? createHmac("sha512", String(createPublicKey(input.privateKey).export({ type: "spki", format: "pem" }))).update(signingInput).digest("base64url")
      : sign(alg === "RS256" ? "sha256" : "sha512", Buffer.from(signingInput), input.privateKey).toString("base64url");
  return Object.freeze({ rawBody, header: `${signingInput}.${signature}` });
}

export type TestNetopiaKeys = Readonly<{ privateKey: KeyObject; publicPem: string; trust(posSignature: string): NoticeTrust }>;

/** A fresh RSA-2048 pair; `trust(pos)` is the NoticeTrust the API would hold for that POS signature. */
export function testNetopiaKeys(): TestNetopiaKeys {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = String(publicKey.export({ type: "spki", format: "pem" }));
  const keys = loadTrustedKeys(publicPem);
  return Object.freeze({ privateKey, publicPem, trust: (posSignature: string): NoticeTrust => Object.freeze({ posSignature, keys }) });
}
