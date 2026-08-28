import { assembleDevelopmentApiEnvironment } from "./dev-api-environment.js";

try {
  const receipt = await assembleDevelopmentApiEnvironment({ repositoryRoot: process.cwd() });
  console.log(`DEV_API_ENVIRONMENT_READY=${receipt.keyCount}:${receipt.reused ? "REUSED" : "CREATED"}`);
} catch (error) {
  const code = error instanceof TypeError && /^DEV_API_ENVIRONMENT_[A-Z_]+$/u.test(error.message)
    ? error.message
    : "DEV_API_ENVIRONMENT_FAILED";
  console.error(code);
  process.exitCode = 1;
}
