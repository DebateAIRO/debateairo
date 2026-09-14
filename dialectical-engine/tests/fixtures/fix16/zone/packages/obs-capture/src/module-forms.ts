// @ts-nocheck -- intentionally unresolved zone-import specimen
import { register as registrationAlias } from "../../../apps/api/src/registration.js";
export { enroll as mfaAlias } from "../../../apps/api/src/mfa.js";
export * from "../../../apps/api/src/mail-channel.js";
const dynamicModule = import("../../../apps/api/src/./registration.js?worker");
const legacyModule = require("@debateai/db/src/identity.js");
const load = require;
const aliasedModule = load("../../../apps/api/src/mfa.js#legacy");
import registrationModule = require("../../../apps/api/src/../src/registration.js");
void dynamicModule.catch((error) => error);
