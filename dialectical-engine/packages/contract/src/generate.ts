import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { contractInventory, staffContractInventory, fundedStaffContractInventory,
  BillingUsageResponseSchema, AskRoomResponseSchema,
  StaffEnrollmentResponseSchema, FundedStaffEnrollmentResponseSchema,
  StaffElevationResponseSchema, FundedStaffElevationResponseSchema, StaffTeamPageSchema, FundedStaffTeamPageSchema,
  StaffActionOptionsRequestSchema, FundedStaffActionOptionsRequestSchema, StaffActionVerifyRequestSchema, FundedStaffActionVerifyRequestSchema,
  StaffAuthenticationOptionsResponseSchema, StaffActionProofResponseSchema,
  InternalAllowanceConfigureRequestSchema, InternalAllowanceRevokeRequestSchema, SecurityReceiptSchema } from "./index.js";

const staffEndpointSchemas = {
  BillingUsageResponseSchema, AskRoomResponseSchema,
  StaffEnrollmentResponseSchema, FundedStaffEnrollmentResponseSchema,
  StaffElevationResponseSchema, FundedStaffElevationResponseSchema, StaffTeamPageSchema, FundedStaffTeamPageSchema,
  StaffActionOptionsRequestSchema, FundedStaffActionOptionsRequestSchema, StaffActionVerifyRequestSchema, FundedStaffActionVerifyRequestSchema,
  StaffAuthenticationOptionsResponseSchema, StaffActionProofResponseSchema,
  InternalAllowanceConfigureRequestSchema, InternalAllowanceRevokeRequestSchema, SecurityReceiptSchema
};
type StaffEndpointSchemaName = keyof typeof staffEndpointSchemas;
const reference = (name: StaffEndpointSchemaName) => ({ $ref: `#/components/schemas/${name}` });
const variants = (...names: StaffEndpointSchemaName[]) => ({ anyOf: names.map(reference) });
const request = (schema: unknown) => ({ requestBody: { required: true, content: { "application/json": { schema } } } });
const response = (schema: unknown) => ({ responses: { "200": { description: "Current selected policy response", content: { "application/json": { schema } } } } });
const staffEndpointContracts: Record<string, Record<string, unknown>> = {
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
    components: { schemas: Object.fromEntries(Object.entries(staffEndpointSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)])) },
    paths: contractInventory.routes.reduce<Record<string, Record<string, unknown>>>((paths, route) => {
      const separator = route.indexOf(" ");
      const method = route.slice(0, separator).toLowerCase();
      const path = route.slice(separator + 1);
      (paths[path] ??= {})[method] = {
        operationId: route.replaceAll(/[^A-Za-z0-9]+/g, "_"),
        ...staffEndpointContracts[route],
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
  `export * from "../src/client.js";\n`,
  "utf8"
);
