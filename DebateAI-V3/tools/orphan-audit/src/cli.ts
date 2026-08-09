import { auditArchitecture, auditOrphans, auditSourceRules } from "./index.js";

const command = process.argv[2];
const report = command === "architecture"
  ? await auditArchitecture()
  : command === "source"
    ? await auditSourceRules()
    : command === "orphans"
      ? await auditOrphans()
      : null;

if (report === null) throw new Error(`Unknown audit command: ${String(command)}`);
console.log(JSON.stringify(report, null, 2));
if (("violations" in report && report.violations.length > 0) || ("blocking" in report && report.blocking.length > 0)) {
  process.exitCode = 1;
}
