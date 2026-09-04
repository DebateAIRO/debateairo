// @ts-nocheck -- scanner-only inventory specimen
import { TypedDomainError as DomainError } from "@debateai/kernel";

const DECLARED_CODE = "DECLARED_CODE";
declare const value: unknown;
declare function send(): Promise<void>;
declare function report(error: unknown): void;

export async function clean(): Promise<void> {
  try {
    throw new TypeError(DECLARED_CODE);
  } catch (caught) {
    const rootAlias = caught;
    throw new DomainError("WRAP_FAILED", "fixed text", { cause: rootAlias });
  }
  void send().catch(report);
  void value;
}

const text = 'import "../../../apps/api/src/registration.js"';
const pattern = /require\(["']\.\.\/\.\.\/\.\.\/apps\/api\/src\/mfa\.js["']\)/u;
// export * from "../../../apps/api/src/mail-channel.js";
void text;
void pattern;
