import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ownerCliMain } from './owner-cli.js';
export { prepareOwnerCommand, bootstrapOwner } from './owner-command.js';
export { createOwnerRecoveryMaterial } from './owner-recovery-material.js';
if (process.argv[1] !== undefined 
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    await ownerCliMain('BOOTSTRAP');
