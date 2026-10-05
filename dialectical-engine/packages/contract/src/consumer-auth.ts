import { z } from "zod";
import { LegalDocumentPairSchema, SessionSchema } from "./auth-shared.js";

export const CatalogLocaleCodeSchema = z.enum([
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it",
  "lv", "lt", "mt", "pl", "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi",
  "id", "ja", "ko", "vi", "ar", "he", "tr"
]);
export type CatalogLocaleCode = z.infer<typeof CatalogLocaleCodeSchema>;
export const LocaleCodeSchema = z.union([CatalogLocaleCodeSchema, z.enum(["en-US", "en-GB"])]);
export type LocaleCode = z.infer<typeof LocaleCodeSchema>;

const EmailSchema = z.email().max(254);
const TurnstileTokenSchema = z.string().min(1).max(2048).regex(/\S/u);
const LocalePreferenceShape = {
  locale: CatalogLocaleCodeSchema,
  ui_locale: LocaleCodeSchema,
  time_zone: z.string().min(1).max(128).nullable(),
  turnstile_token: TurnstileTokenSchema
};

/** Submitted facts only: age, account identity and verification are server decisions. */
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(1024),
  phone: z.string().trim().min(1).max(128),
  date_of_birth: z.iso.date(),
  terms: LegalDocumentPairSchema,
  privacy: LegalDocumentPairSchema,
  ...LocalePreferenceShape
}).strict();
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export const ResendVerificationRequestSchema = z.object({ email: EmailSchema, ...LocalePreferenceShape }).strict();
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;

export const REGISTRATION_PUBLIC_MESSAGE =
  "If this address can be registered, verification instructions will arrive. Check your spam folder." as const;
export const RESEND_VERIFICATION_PUBLIC_MESSAGE =
  "If this address is awaiting verification, new instructions will arrive. Check your spam folder." as const;
export const RegistrationVerificationAckSchema = z.object({
  message: z.literal(REGISTRATION_PUBLIC_MESSAGE), retry_after_seconds: z.literal(60)
}).strict();
export const ResendVerificationAckSchema = z.object({
  message: z.literal(RESEND_VERIFICATION_PUBLIC_MESSAGE), retry_after_seconds: z.literal(60)
}).strict();
export const VerificationAckSchema = z.union([RegistrationVerificationAckSchema, ResendVerificationAckSchema]);
export type VerificationAck = z.infer<typeof VerificationAckSchema>;

export const AuthenticationResponseSchema = z.object({
  status: z.literal("authenticated"),
  csrf_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  session: SessionSchema,
  replacement_recovery_code: z.string().min(1).max(1024).optional()
}).strict();
export type AuthenticationResponse = z.infer<typeof AuthenticationResponseSchema>;

const EncodedValueSchema = z.string().min(1).max(32768).regex(/^[A-Za-z0-9_-]+$/u);
const CredentialIdSchema = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/u);
const HandleSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
export const BeginTotpEnrollmentRequestSchema = z.union([
  z.object({ enrollment_token: HandleSchema }).strict(),
  z.object({ step_up_grant: HandleSchema }).strict()
]);
export type BeginTotpEnrollmentRequest = z.infer<typeof BeginTotpEnrollmentRequestSchema>;
export const CompleteTotpEnrollmentRequestSchema = z.object({ enrollment_token: HandleSchema, code: z.string().regex(/^\d{6}$/u) }).strict();
export type CompleteTotpEnrollmentRequest = z.infer<typeof CompleteTotpEnrollmentRequestSchema>;
export const TotpEnrollmentOptionsResponseSchema = z.object({
  status: z.literal("verification_required"), secret: z.string().regex(/^[A-Z2-7]{32}$/u),
  otpauthUri: z.string().startsWith("otpauth://totp/"), enrollment_token: HandleSchema, expires_at: z.iso.datetime()
}).strict();
export type TotpEnrollmentOptionsResponse = z.infer<typeof TotpEnrollmentOptionsResponseSchema>;
export const TotpEnrollmentResponseSchema = z.union([AuthenticationResponseSchema, z.object({ status: z.literal("enrolled") }).strict()]);
export type TotpEnrollmentResponse = z.infer<typeof TotpEnrollmentResponseSchema>;
export const LoginContinuationResponseSchema = z.object({ status: z.literal("mfa_required"), challenge_token: HandleSchema,
  available_methods: z.array(z.enum(["passkey", "totp", "recovery_code"])).min(1).max(3)
}).strict();
export type LoginContinuationResponse = z.infer<typeof LoginContinuationResponseSchema>;

const TransportSchema = z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const TransportsSchema = z.array(TransportSchema).max(7).refine((values) => new Set(values).size === values.length);
const AttachmentSchema = z.enum(["platform", "cross-platform"]);
const ExtensionResultsSchema = z.object({
  credProps: z.object({ rk: z.boolean().optional() }).strict().optional()
}).strict();
const CredentialDescriptorSchema = z.object({
  id: CredentialIdSchema, type: z.literal("public-key"), transports: TransportsSchema.optional()
}).strict();
function ceremonyBodyBound(value: unknown, context: z.RefinementCtx): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32768) {
    context.addIssue({ code: "custom", message: "Consumer WebAuthn body exceeds 32 KiB" });
  }
}

/** Browser JSON convenience fields are data; only server verification can establish authority. */
export const ConsumerRegistrationCredentialSchema = z.object({
  id: CredentialIdSchema, rawId: CredentialIdSchema, type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: EncodedValueSchema, attestationObject: EncodedValueSchema,
    transports: TransportsSchema.optional(),
    publicKeyAlgorithm: z.number().int().min(-65536).max(65536).optional(),
    publicKey: EncodedValueSchema.optional(), authenticatorData: EncodedValueSchema.optional()
  }).strict(),
  clientExtensionResults: ExtensionResultsSchema,
  authenticatorAttachment: AttachmentSchema.optional()
}).strict().superRefine(ceremonyBodyBound);
export type ConsumerRegistrationCredential = z.infer<typeof ConsumerRegistrationCredentialSchema>;
export const ConsumerAuthenticationCredentialSchema = z.object({
  id: CredentialIdSchema, rawId: CredentialIdSchema, type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: EncodedValueSchema, authenticatorData: EncodedValueSchema, signature: EncodedValueSchema,
    userHandle: EncodedValueSchema.optional()
  }).strict(),
  clientExtensionResults: ExtensionResultsSchema,
  authenticatorAttachment: AttachmentSchema.optional()
}).strict().superRefine(ceremonyBodyBound);
export type ConsumerAuthenticationCredential = z.infer<typeof ConsumerAuthenticationCredentialSchema>;

export const ConsumerRegistrationOptionsSchema = z.object({
  challenge: HandleSchema,
  rp: z.object({ id: z.string().min(1).max(253), name: z.string().min(1).max(128) }).strict(),
  user: z.object({
    id: z.string().min(1).max(86).regex(/^[A-Za-z0-9_-]+$/u),
    name: z.string().min(1).max(254), displayName: z.string().min(1).max(254)
  }).strict(),
  pubKeyCredParams: z.array(z.object({
    type: z.literal("public-key"), alg: z.number().int().min(-65536).max(65536)
  }).strict()).min(1).max(16),
  timeout: z.number().int().positive().max(300000).optional(),
  attestation: z.literal("none").optional(),
  authenticatorSelection: z.object({
    userVerification: z.literal("required"),
    residentKey: z.enum(["preferred", "required"]).optional(), requireResidentKey: z.boolean().optional(),
    authenticatorAttachment: AttachmentSchema.optional()
  }).strict(),
  excludeCredentials: z.array(CredentialDescriptorSchema).max(100).optional(),
  extensions: z.object({ credProps: z.boolean().optional() }).strict().optional(),
  hints: z.array(z.enum(["security-key", "client-device", "hybrid"])).max(3).optional()
}).strict();
export type ConsumerRegistrationOptions = z.infer<typeof ConsumerRegistrationOptionsSchema>;
export const ConsumerAuthenticationOptionsSchema = z.object({
  challenge: HandleSchema, rpId: z.string().min(1).max(253),
  timeout: z.number().int().positive().max(300000).optional(),
  userVerification: z.literal("required"),
  allowCredentials: z.array(CredentialDescriptorSchema).max(100).optional(),
  hints: z.array(z.enum(["security-key", "client-device", "hybrid"])).max(3).optional()
}).strict();
export type ConsumerAuthenticationOptions = z.infer<typeof ConsumerAuthenticationOptionsSchema>;
export const PasskeyRegistrationOptionsResponseSchema = z.object({
  challenge_handle: HandleSchema, expires_at: z.iso.datetime(), options: ConsumerRegistrationOptionsSchema
}).strict().superRefine(ceremonyBodyBound);
export type PasskeyRegistrationOptionsResponse = z.infer<typeof PasskeyRegistrationOptionsResponseSchema>;
export const PasskeyAuthenticationOptionsResponseSchema = z.object({
  challenge_handle: HandleSchema, expires_at: z.iso.datetime(), options: ConsumerAuthenticationOptionsSchema
}).strict().superRefine(ceremonyBodyBound);
export type PasskeyAuthenticationOptionsResponse = z.infer<typeof PasskeyAuthenticationOptionsResponseSchema>;

export const BeginPasskeyEnrollmentRequestSchema = z.union([
  z.object({enrollment_token:HandleSchema}).strict(), z.object({step_up_grant:HandleSchema}).strict()
]);
export const CompletePasskeyEnrollmentRequestSchema = z.object({
  challenge_handle:HandleSchema, credential:ConsumerRegistrationCredentialSchema, label:z.string().trim().min(1).max(128).optional()
}).strict().superRefine(ceremonyBodyBound);
export const BeginPasskeyLoginRequestSchema = z.object({continuation_token:HandleSchema.optional()}).strict();
export const CompletePasskeyLoginRequestSchema = z.object({challenge_handle:HandleSchema,credential:ConsumerAuthenticationCredentialSchema}).strict().superRefine(ceremonyBodyBound);
export const PasskeyEnrollmentResponseSchema = z.union([AuthenticationResponseSchema,z.object({status:z.literal("enrolled")}).strict()]);
export type BeginPasskeyEnrollmentRequest=z.infer<typeof BeginPasskeyEnrollmentRequestSchema>;
export type CompletePasskeyEnrollmentRequest=z.infer<typeof CompletePasskeyEnrollmentRequestSchema>;
export type BeginPasskeyLoginRequest=z.infer<typeof BeginPasskeyLoginRequestSchema>;
export type CompletePasskeyLoginRequest=z.infer<typeof CompletePasskeyLoginRequestSchema>;
export type PasskeyEnrollmentResponse=z.infer<typeof PasskeyEnrollmentResponseSchema>;

export const consumerAuthContractSchemas = Object.freeze({
  BeginTotpEnrollmentRequestSchema, CompleteTotpEnrollmentRequestSchema, TotpEnrollmentOptionsResponseSchema, TotpEnrollmentResponseSchema, LoginContinuationResponseSchema,
  BeginPasskeyEnrollmentRequestSchema, CompletePasskeyEnrollmentRequestSchema, BeginPasskeyLoginRequestSchema, CompletePasskeyLoginRequestSchema, PasskeyEnrollmentResponseSchema,
  CatalogLocaleCodeSchema, LocaleCodeSchema, RegisterRequestSchema, ResendVerificationRequestSchema,
  RegistrationVerificationAckSchema, ResendVerificationAckSchema, VerificationAckSchema, AuthenticationResponseSchema,
  ConsumerRegistrationCredentialSchema, ConsumerAuthenticationCredentialSchema,
  ConsumerRegistrationOptionsSchema, ConsumerAuthenticationOptionsSchema,
  PasskeyRegistrationOptionsResponseSchema, PasskeyAuthenticationOptionsResponseSchema
});
