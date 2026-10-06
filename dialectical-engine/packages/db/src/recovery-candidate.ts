import type { CryptoEnvelope } from "@debateai/crypto";
export type PasswordRecoveryCandidate = Readonly<{
  userId: string;
  channels: readonly Readonly<{
    channelId: string;
    channelType: "email" | "recovery_email";
    addressCiphertext: CryptoEnvelope;
    proof: boolean;
  }>[];
}>;
