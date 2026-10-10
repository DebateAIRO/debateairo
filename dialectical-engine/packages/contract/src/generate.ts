import { passwordResetEndpointContracts, passwordResetContractSchemas } from "./password-reset.js";
import { mfaRecoveryEndpointContracts, backupEmailEndpointContracts, mfaRecoveryContractSchemas } from "./mfa-recovery.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { contractInventory, staffContractInventory, fundedStaffContractInventory,
  consumerAuthContractSchemas, consumerSecurityContractSchemas, accountProfileContractSchemas, SocialLoginStatusRequestSchema, SocialLoginStatusResponseSchema,
  BillingUsageResponseSchema, AskRoomResponseSchema,
  StaffEnrollmentResponseSchema, FundedStaffEnrollmentResponseSchema,
  StaffElevationResponseSchema, FundedStaffElevationResponseSchema, StaffTeamPageSchema, FundedStaffTeamPageSchema,
  StaffActionOptionsRequestSchema, FundedStaffActionOptionsRequestSchema, StaffActionVerifyRequestSchema, FundedStaffActionVerifyRequestSchema,
  StaffAuthenticationOptionsResponseSchema, StaffActionProofResponseSchema,
  InternalAllowanceConfigureRequestSchema, InternalAllowanceRevokeRequestSchema, SecurityReceiptSchema } from "./index.js";

const endpointSchemas = {
  ...passwordResetContractSchemas,
  ...mfaRecoveryContractSchemas,
  SocialLoginStatusRequestSchema, SocialLoginStatusResponseSchema,
  ...consumerAuthContractSchemas,
  ...consumerSecurityContractSchemas,
  ...accountProfileContractSchemas,
  BillingUsageResponseSchema, AskRoomResponseSchema,
  StaffEnrollmentResponseSchema, FundedStaffEnrollmentResponseSchema,
  StaffElevationResponseSchema, FundedStaffElevationResponseSchema, StaffTeamPageSchema, FundedStaffTeamPageSchema,
  StaffActionOptionsRequestSchema, FundedStaffActionOptionsRequestSchema, StaffActionVerifyRequestSchema, FundedStaffActionVerifyRequestSchema,
  StaffAuthenticationOptionsResponseSchema, StaffActionProofResponseSchema,
  InternalAllowanceConfigureRequestSchema, InternalAllowanceRevokeRequestSchema, SecurityReceiptSchema
};
type EndpointSchemaName = keyof typeof endpointSchemas;
const reference = (name: EndpointSchemaName) => ({ $ref: `#/components/schemas/${name}` });
const variants = (...names: EndpointSchemaName[]) => ({ anyOf: names.map(reference) });
const request = (schema: unknown) => ({ requestBody: { required: true, content: { "application/json": { schema } } } });
const response = (schema: unknown, status = "200") => ({ responses: { [status]: { description: status === "202" ? "Generic verification acknowledgement" : "Current selected policy response", content: { "application/json": { schema } } } } });
const staffEndpointContracts: Record<string, Record<string, unknown>> = {
  "POST /v1/auth/social/login/status": {...request(reference("SocialLoginStatusRequestSchema")),...response(reference("SocialLoginStatusResponseSchema"))},
  "POST /v1/auth/recovery/prove": {...request(reference("ConsumerRecoveryProveRequestSchema")),...response(reference("ConsumerRecoveryProofResponseSchema"))},
  "POST /v1/auth/recovery/enrollment/options": {...request(reference("RecoveryEnrollmentBeginRequestSchema")),...response(reference("RecoveryEnrollmentOptionsResponseSchema"))},
  "POST /v1/auth/recovery/enrollment/complete": {...request(reference("RecoveryEnrollmentCompleteRequestSchema")),...response(reference("AuthenticationResponseSchema"))},
  "POST /v1/auth/recovery/enrollment/status": {...request(reference("RecoveryEvidenceStatusRequestSchema")),...response(reference("OnboardingRequirementsResponseSchema"))},
  "POST /v1/auth/recovery/enrollment/complete-evidence": {...request(reference("RecoveryEvidenceCompleteRequestSchema")),responses:{"204":{description:"Current evidence recorded; no session or capability renewal"}}},
  "POST /v1/auth/onboarding/status": {...request(reference("PendingOnboardingStatusRequestSchema")),...response(reference("OnboardingRequirementsResponseSchema"))},
  "POST /v1/auth/onboarding/complete": {...request(reference("PendingOnboardingCompleteRequestSchema")),responses:{"204":{description:"Current pending evidence recorded; no session or factor reset"}}},
  "POST /v1/auth/passkeys/step-up/options": {...request(reference("BeginPasskeyStepUpRequestSchema")),...response(reference("PasskeyAuthenticationOptionsResponseSchema"))},
  "POST /v1/auth/passkeys/step-up/complete": {...request(reference("CompletePasskeyStepUpRequestSchema")),...response(reference("StepUpResponseSchema"))},
  "GET /v1/account/auth-methods": response(reference("AuthMethodsResponseSchema")),
  "POST /v1/account/auth-methods/remove": {...request(reference("RemoveAuthMethodRequestSchema")),responses:{"204":{description:"Authentication method removed with a viable sign-in path retained"}}},
  "POST /v1/account/recovery-codes/regenerate": {...request(reference("RegenerateRecoveryCodesRequestSchema")),...response(reference("RecoveryCodesResponseSchema"))},
  "GET /v1/account/mfa-recovery": response(reference("MfaRecoveryPendingResponseSchema")),
  "POST /v1/account/mfa-recovery/cancel": {...request(reference("MfaRecoveryPendingCancelRequestSchema")),...response(reference("MfaRecoveryPendingCancelledSchema"))},

  "POST /v1/auth/mfa/totp/begin": {...request(reference("BeginTotpEnrollmentRequestSchema")),...response(reference("TotpEnrollmentOptionsResponseSchema"))},
  "POST /v1/auth/mfa/totp/verify": {...request(reference("CompleteTotpEnrollmentRequestSchema")),...response(reference("TotpEnrollmentResponseSchema"))},
  "POST /v1/auth/passkeys/enrollment/options": {...request(reference("BeginPasskeyEnrollmentRequestSchema")),...response(reference("PasskeyRegistrationOptionsResponseSchema"))},
  "POST /v1/auth/passkeys/enrollment/complete": {...request(reference("CompletePasskeyEnrollmentRequestSchema")),...response(reference("PasskeyEnrollmentResponseSchema"))},
  "POST /v1/auth/passkeys/login/options": {...request(reference("BeginPasskeyLoginRequestSchema")),...response(reference("PasskeyAuthenticationOptionsResponseSchema"))},
  "POST /v1/auth/passkeys/login/complete": {...request(reference("CompletePasskeyLoginRequestSchema")),...response(reference("AuthenticationResponseSchema"))},
  "POST /v1/auth/login": { ...request(variants("LoginBeginRequestSchema", "LoginCompleteRequestSchema")), responses: {
    "202": { description: "Second factor required", content: { "application/json": { schema: reference("LoginContinuationResponseSchema") } } },
    "200": { description: "Authenticated", content: { "application/json": { schema: reference("AuthenticationResponseSchema") } } } } },
  "POST /v1/auth/recovery/start": request(reference("RecoveryStartRequestSchema")),
  "POST /v1/auth/register": { ...request(reference("RegisterRequestSchema")), ...response(reference("RegistrationVerificationAckSchema"), "202") },
  "POST /v1/auth/resend-verification": { ...request(reference("ResendVerificationRequestSchema")), ...response(reference("ResendVerificationAckSchema"), "202") },
  "GET /v1/account/profile": response(reference("AccountPhoneProfileSchema")),
  "POST /v1/account/profile/reveal": { ...request(reference("PhoneProfileRevealRequestSchema")), ...response(reference("PhoneProfileRevealSchema")) },
  "POST /v1/account/profile": { ...request(reference("PhoneProfileUpdateRequestSchema")), ...response(reference("AccountPhoneProfileSchema")) },
  "GET /v1/account/recovery-email": response(reference("RecoveryEmailSettingsSchema")),
  "POST /v1/account/recovery-email": { ...request(reference("RecoveryEmailRequestSchema")), ...response(reference("RecoveryEmailSettingsSchema"), "202") },
  "DELETE /v1/account/recovery-email": { ...request(reference("RecoveryEmailRemoveRequestSchema")), responses: { "204": {description:"Optional recovery address removed"} } },
  "POST /v1/account/recovery-email/confirm": { ...request(reference("EmailChangeLinkRequestSchema")), ...response(reference("EmailChangeConfirmedSchema")) },
  "GET /v1/billing/usage": response(reference("BillingUsageResponseSchema")),
  "GET /v1/asks/room": response(reference("AskRoomResponseSchema")),
  "GET /v1/admin/enrollment": response(variants("StaffEnrollmentResponseSchema","FundedStaffEnrollmentResponseSchema")),
  "POST /v1/admin/webauthn/elevation/verify": response(variants("StaffElevationResponseSchema", "FundedStaffElevationResponseSchema")),
  "GET /v1/admin/team": response(variants("StaffTeamPageSchema", "FundedStaffTeamPageSchema")),
  "POST /v1/admin/webauthn/action/options": { ...request(variants("StaffActionOptionsRequestSchema", "FundedStaffActionOptionsRequestSchema")), ...response(reference("StaffAuthenticationOptionsResponseSchema")) },
  "POST /v1/admin/webauthn/action/verify": { ...request(variants("StaffActionVerifyRequestSchema", "FundedStaffActionVerifyRequestSchema")), ...response(reference("StaffActionProofResponseSchema")) },
  "POST /v1/admin/internal-allowances": { ...request(reference("InternalAllowanceConfigureRequestSchema")), ...response(reference("SecurityReceiptSchema")) },
  "DELETE /v1/admin/internal-allowances/{grantId}": { ...request(reference("InternalAllowanceRevokeRequestSchema")), ...response(reference("SecurityReceiptSchema")),
    parameters: [{ name: "grantId", in: "path", required: true, schema: { type: "string", format: "uuid" } }] }
};

const generatedDirectory = fileURLToPath(new URL("../generated", import.meta.url));
await mkdir(generatedDirectory, { recursive: true });
const fieldInventory = {
  contractVersion: "v1",
  staffPolicyVersion: staffContractInventory.policyVersion,
  routes: contractInventory.routes,
  resources: Object.fromEntries(Object.entries(contractInventory.resources).map(([name, schema]) => [
    name,
    "shape" in schema ? Object.keys(schema.shape) : []
  ]))
};
await writeFile(
  new URL("../generated/field-inventory.json", import.meta.url),
  `${JSON.stringify(fieldInventory, null, 2)}\n`,
  "utf8"
);
await writeFile(
  new URL("../generated/openapi.json", import.meta.url),
  `${JSON.stringify({
    openapi: "3.1.0",
    info: { title: "DebateAI V3", version: "v1" },
    components: { schemas: Object.fromEntries(Object.entries(endpointSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)])) },
    paths: contractInventory.routes.reduce<Record<string, Record<string, unknown>>>((paths, route) => {
      const separator = route.indexOf(" ");
      const method = route.slice(0, separator).toLowerCase();
      const path = route.slice(separator + 1);
      (paths[path] ??= {})[method] = {
        operationId: route.replaceAll(/[^A-Za-z0-9]+/g, "_"),
        ...staffEndpointContracts[route],
        ...passwordResetEndpointContracts[route],
        ...mfaRecoveryEndpointContracts[route],
        ...backupEmailEndpointContracts[route],
        ...(staffContractInventory.routes.includes(route) || fundedStaffContractInventory.routes.some(funded => funded === route)
          ? { "x-required-product-role-policy-version": staffContractInventory.policyVersion } : {}),
        ...(fundedStaffContractInventory.routes.some(funded => funded === route) ? { "x-required-internal-funding-policy-version": 1 } : {}),
        ...(staffEndpointContracts[route] !== undefined && staffContractInventory.routes.includes(route) && !fundedStaffContractInventory.routes.some(funded => funded === route)
          ? { "x-staff-policy-variants": { coreA: { internalFunding: "DISABLED" }, fundedV2: { internalFundingPolicyVersion: 1, sealedSelectionRequired: true } } } : {})
      };
      return paths;
    }, {})
  }, null, 2)}\n`,
  "utf8"
);
await writeFile(
  new URL("../generated/client.ts", import.meta.url),
  `// Generated from packages/contract/src/index.ts; do not edit.\n` +
  `export * from "../src/index.js";\n` +
  `export * from "../src/client.js";\n` +
  `export * from "../src/consumer-auth.js";\n`,
  "utf8"
);
