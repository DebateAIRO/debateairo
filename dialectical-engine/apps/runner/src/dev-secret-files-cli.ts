import { generateDevelopmentSecretFiles } from "./dev-secret-files.js";

const receipt = await generateDevelopmentSecretFiles({ repositoryRoot: process.cwd() });
console.log(`DEV_AUTH_SECRETS_READY=${receipt.secretFileCount}:${receipt.secretStoreCount}`);
