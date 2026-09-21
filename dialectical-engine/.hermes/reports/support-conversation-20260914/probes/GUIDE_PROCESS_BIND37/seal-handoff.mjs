import { createHash } from "node:crypto";
import { readFile,stat,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`,A=`${R}/agent-reports`,P=`${R}/probes/GUIDE_PROCESS_BIND37`;
const revision="0d34f82f4a2188d0ce1db04655b693798ffd2169";
const verdict="PASS_PROCESS_IDENTITY_BOUND_REVIEW_REQUIRED";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const desc=async path=>{ const bytes=await readFile(path);return { absolute:path,sha256:sha(bytes),bytes:bytes.byteLength }; };
const proof=JSON.parse(await readFile(`${E}/GUIDE_PROCESS_BIND37-control-proof.json`));
const command=JSON.parse(await readFile(`${E}/GUIDE_PROCESS_BIND37-command-contract.json`));
const operator=JSON.parse(await readFile(`${E}/GUIDE_PROCESS_BIND37-operator-contract.json`));
const inventory=JSON.parse(await readFile(`${E}/GUIDE_PROCESS_BIND37-runtime-dependency-inventory.json`));

const narrative=`# GUIDE_PROCESS_BIND37

Verdict: **${verdict}** at product \`${revision}\`.

The final readiness and idle phases now authenticate the same pure process-row validator bytes from the final contract, parse exactly one \`ps\` row, and require returned PID and PGID to equal the validated custody/readiness identity, PPID to equal 1, and the existing command marker to be present. Empty, malformed and multiple rows are rejected. READINESS and IDLE output shapes are unchanged. Runtime9 is referenced through authenticated custody; no PID is hardcoded in executable guards.

Focused controlled-I/O verification passes ${proof.passed}/${proof.controls}. The predecessor readiness guard reproduces its false acceptance of a mismatched \`123/1/123\` row against Runtime9 custody. Corrected readiness and idle accept the sealed public Runtime9 identity \`${proof.processIdentity.actualFixture.pid}/1/${proof.processIdentity.actualFixture.pgid}\`. Each phase rejects wrong PID, wrong PGID, wrong PPID, empty, malformed and multirow responses before TLS or a success write. Validator hash/byte tampering and predecessor custody reject before operational I/O. No live process, HTTP, browser, status, capacity, database, Support or model action occurred.

The exact ${inventory.phaseCount}-phase inventory binds corrected readiness and idle plus six transitive validators. All seven argv values self-bind command SHA \`${operator.commandContract.sha256}\`; the real non-inert operator rejects the predecessor hash and reaches a controlled first-phase boundary with the finalized hash. All 123 LIVE30/actual GUIDE22 future paths remain unique and absent. Runtime9 custody, product 0d34, FINAL18, KB7ef, fixed31/five-session plan, full58 evidence, FIX30 screenshot helper and owner-capacity contract are retained.

No operational phase or capture ran. Independent review is required before LIVE30. Forgot remains unresolved; this is not CP1 acceptance or CP2 authorization.

Efficiency finding: process ownership was previously inferred from a substring even though the same \`ps\` row already carried the authoritative PID, PPID and PGID. A single authenticated parser shared by readiness and idle prevents repeated weak-guard rediscovery. Future lifecycle contracts should define and test the complete process identity at their first implementation, including malformed and multirow output, rather than validating liveness and ownership in separate later passes.

SKILLS LOADED: retained mission BODY/protocol context; no new skill invoked. Native session: original Sol \`/root/preview\`, ticket \`t_ebade6b9\`.

Self-report prompt retained verbatim: “treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.”
`;
const reportPath=`${E}/GUIDE_PROCESS_BIND37.md`,agentPath=`${A}/GUIDE_PROCESS_BIND37.md`;
await writeFile(reportPath,narrative,{ flag:"wx",mode:0o600 });
await writeFile(agentPath,narrative,{ flag:"wx",mode:0o600 });
const selfPath=`${E}/GUIDE_PROCESS_BIND37-self-report.json`;
await writeFile(selfPath,`${JSON.stringify({ schemaVersion:1,node:"GUIDE_PROCESS_BIND37",ticket:"t_ebade6b9",revision,verdict,controls:{ passed:proof.passed,total:proof.controls },processIdentity:proof.processIdentity,binding:{ commandSha256:operator.commandContract.sha256,operatorScriptSha256:operator.script.sha256,validatorSha256:command.processIdentityValidator.sha256,phaseCount:7,futurePathsAbsent:123 },traffic:proof.traffic,limitations:["INDEPENDENT_REVIEW_REQUIRED","LIVE30_NOT_RUN","FORGOT_UNRESOLVED"] },null,2)}\n`,{ flag:"wx",mode:0o600 });
const paths=[
  `${root}/.hermes/planning/support-conversation-20260914/packets/GUIDE_PROCESS_BIND37.md`,
  `${E}/GUIDE_PROCESS_BIND37-inputs.json`,`${E}/GUIDE_PROCESS_BIND37-freeze-resume.json`,
  `${P}/process-row.mjs`,`${P}/phase-readiness.mjs`,`${P}/phase-idle.mjs`,`${P}/controlled-io.mjs`,`${P}/generate-binding.mjs`,`${P}/run-operator.mjs`,`${P}/run-controls.mjs`,`${P}/seal-handoff.mjs`,
  `${R}/logs/GUIDE_PROCESS_BIND37-controls-final.log`,
  `${E}/GUIDE_PROCESS_BIND37-command-contract.json`,`${E}/GUIDE_PROCESS_BIND37-operator-contract.json`,`${E}/GUIDE_PROCESS_BIND37-runtime-dependency-inventory.json`,`${E}/GUIDE_PROCESS_BIND37-control-proof.json`,
  `${E}/GUIDE_PREVIEW_RECOVER34-runtime-custody.json`,`${E}/GUIDE_PREVIEW_RECOVER34-runtime-custody-contract.json`,`${E}/GUIDE_PREVIEW_RECOVER34-owner-capacity-contract.json`,
  `${E}/GUIDE_ROW_PROOF-run-PREVIEW_BIND32.json`,`${R}/probes/GUIDE_PREVIEW_RECOVER34/screenshot-evidence-successor.mjs`,
  `${E}/GUIDE_RUNTIME_REVIEW36-receipt.json`,`${E}/GUIDE_RUNTIME_REVIEW36-consumption.json`,
  reportPath,agentPath,selfPath
];
const manifestPath=`${E}/GUIDE_PROCESS_BIND37-manifest.json`;
await writeFile(manifestPath,`${JSON.stringify({ schemaVersion:1,node:"GUIDE_PROCESS_BIND37",ticket:"t_ebade6b9",revision,verdict,artifacts:await Promise.all(paths.map(desc)) },null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptPath=`${E}/GUIDE_PROCESS_BIND37-receipt.json`;
const receipt={ schemaVersion:1,node:"GUIDE_PROCESS_BIND37",ticket:"t_ebade6b9",revision,verdict,artifacts:await Promise.all([...paths,manifestPath].map(desc)) };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const bytes=await readFile(receiptPath),metadata=await stat(receiptPath);
console.log(JSON.stringify({ verdict,receiptPath,receiptSha256:sha(bytes),receiptBytes:metadata.size,artifacts:receipt.artifacts.length,controls:proof.passed,commandSha256:operator.commandContract.sha256,operatorSha256:operator.script.sha256 }));
