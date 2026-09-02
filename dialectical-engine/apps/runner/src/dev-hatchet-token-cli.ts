import {
  createDevelopmentHatchetTokenOperations,
  DevelopmentHatchetTokenError,
  provisionDevelopmentHatchetToken
} from "./dev-hatchet-token.js";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";

const rotate = process.argv.slice(2).includes("--rotate");

try {
  const receipt = await provisionDevelopmentHatchetToken({
    repositoryRoot: process.cwd(),
    rotate,
    operations: createDevelopmentHatchetTokenOperations(
      process.cwd(),
      loadDevelopmentCommandEnvironment()
    )
  });
  console.log(
    `DEV_HATCHET_AUTHORITY_READY=${receipt.authority}:${receipt.workflowApi}:`
      + `${receipt.reused ? "REUSED" : rotate ? "ROTATED" : "CREATED"}`
  );
} catch (error) {
  const code = error instanceof DevelopmentHatchetTokenError
    ? error.message
    : "DEV_HATCHET_TOKEN_FAILED";
  console.error(code);
  // Operator guidance only; the detail never carries credential material.
  if (error instanceof DevelopmentHatchetTokenError && error.detail !== undefined) {
    console.error(error.detail);
  }
  process.exitCode = 1;
}
