import type { PostgresAccountProfileRepository, ProfileSession, PhoneProfileRecord, AuthSourceContext } from "@debateai/db";
import { decrypt, encrypt, hashToken, type ReadableUserDekStore } from "@debateai/crypto";
import { normalizeManualPhone } from "./phone-profile.js";
export class AccountProfileError extends Error {
  constructor(readonly code: "STEP_UP_REQUIRED" | "PHONE_INVALID") {
    super(code);
    this.name = "AccountProfileError";
  }
}
export interface PhoneProfile {
  readonly phone_present: boolean;
  readonly phone_masked: string | null;
  readonly phone_verified: false;
  readonly updated_at: string | null;
}
export const phoneProfileAad = (id: string) => ["identity", "user.phone_ciphertext", id, "run:none", id, `user-dek:${id}`, "1"] as const;
export class AccountProfileService {
  constructor(private readonly dependencies: {
    readonly repository: Pick<PostgresAccountProfileRepository, "read" | "use">;
    readonly users: ReadableUserDekStore;
  }) {
  }
  async phoneProfile(session: ProfileSession, source: AuthSourceContext): Promise<PhoneProfile | null> {
    const record = await this.dependencies.repository.read(session, source);
    return record === null ? null : this.mask(session.userId, record);
  }
  async revealPhoneProfile(session: ProfileSession, grantToken: unknown, source: AuthSourceContext): Promise<Readonly<{
    phone: string | null;
    phone_verified: false;
  }>> {
    const record = await this.dependencies.repository.use(session, {
      action: "READ_PHONE_PROFILE", grantTokenHash: this.grantHash(grantToken)
    }, source);
    if (record === null)
      throw new AccountProfileError("STEP_UP_REQUIRED");
    return {
      phone: await this.open(session.userId, record), phone_verified: false
    };
  }
  async updatePhoneProfile(session: ProfileSession, input: Readonly<{
    phone: unknown;
    grantToken: unknown;
  }>, source: AuthSourceContext): Promise<PhoneProfile> {
    let phone: string;
    try {
      phone = normalizeManualPhone(input.phone);
    }
    catch {
      throw new AccountProfileError("PHONE_INVALID");
    }
    const grantTokenHash = this.grantHash(input.grantToken), dek = await this.dependencies.users.load(session.userId), plaintext = Buffer.from(phone);
    let ciphertext;
    try {
      ciphertext = encrypt(dek, plaintext, phoneProfileAad(session.userId));
    }
    finally {
      dek.fill(0);
      plaintext.fill(0);
    }
    const record = await this.dependencies.repository.use(session, {
      action: "CHANGE_PHONE_PROFILE", grantTokenHash, ciphertext
    }, source);
    if (record === null)
      throw new AccountProfileError("STEP_UP_REQUIRED");
    return this.mask(session.userId, record);
  }
  private grantHash(token: unknown): string {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AccountProfileError("STEP_UP_REQUIRED");
    return hashToken("step-up-grant", token);
  }
  private async mask(id: string, record: PhoneProfileRecord): Promise<PhoneProfile> {
    const phone = await this.open(id, record);
    return {
      phone_present: phone !== null, phone_masked: phone === null ? null : `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`, phone_verified: false, updated_at: record.updatedAt?.toISOString() ?? null
    };
  }
  private async open(id: string, record: PhoneProfileRecord): Promise<string | null> {
    if (record.ciphertext === null)
      return null;
    const dek = await this.dependencies.users.load(id);
    let plaintext: Buffer | undefined;
    try {
      plaintext = decrypt(dek, record.ciphertext, phoneProfileAad(id));
      return plaintext.toString("utf8");
    }
    finally {
      dek.fill(0);
      plaintext?.fill(0);
    }
  }
}
