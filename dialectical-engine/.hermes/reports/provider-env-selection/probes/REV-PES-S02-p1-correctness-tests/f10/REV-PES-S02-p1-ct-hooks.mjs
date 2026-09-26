// Records every module URL the ESM loader resolves (F10 probe). Writes to $F10_OUT.
import { appendFileSync } from "node:fs";
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  appendFileSync(process.env.F10_OUT, r.url + "\n");
  return r;
}
