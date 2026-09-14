// @ts-nocheck -- scanner-only zone-import specimen
declare const requestedModule: string;
const prose = 'import "../../../apps/api/src/registration.js"';
const pattern = /export\s+\*\s+from\s+["']\.\.\/\.\.\/\.\.\/apps\/api\/src\/mfa\.js["']/u;
const dynamicModule = import(requestedModule);
// require("../../../apps/api/src/mail-channel.js");
void prose;
void pattern;
void dynamicModule.catch((error) => error);
