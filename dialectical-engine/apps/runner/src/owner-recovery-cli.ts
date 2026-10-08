import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ownerCliMain } from './owner-cli.js';
export { prepareOwnerCommand, recoverOwner } from './owner-command.js';
if (process.argv[1] !== undefined 
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    await ownerCliMain('RECOVER_OWNER');
