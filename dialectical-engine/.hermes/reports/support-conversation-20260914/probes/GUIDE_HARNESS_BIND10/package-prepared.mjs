import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const harness=`${root}/probes/GUIDE_HARNESS_BIND10`;
const adapter=`${root}/probes/GUIDE_ROW_PROOF_BIND10`;
const evidence=`${root}/evidence`;
const agentReports=`${root}/agent-reports`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const record=async absolute=>{const bytes=await readFile(absolute);return {absolute,sha256:sha256(bytes),bytes:bytes.length};};
const records=[];
for (const directory of [harness,adapter]) {
  for (const name of (await readdir(directory)).sort()) {
    const absolute=resolve(directory,name);
    if ((await stat(absolute)).isFile()) records.push(await record(absolute));
  }
}
for (const absolute of [
  `${evidence}/GUIDE_HARNESS_BIND10-inputs.json`,
  `${evidence}/GATE_GUIDE_FINAL7-manifest.json`,
  `${evidence}/GUIDE_INJECTION_FIX-snapshot-receipt.json`,
  `${evidence}/GUIDE_INJECTION_FIX-required-suites.json`
]) records.push(await record(absolute));

const prepared={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND10",ticket:"t_f694e6ed",session:"/root/preview",
  verdict:"PREPARED_NOT_EXECUTED_AWAITING_CORRECTED_PRODUCT",
  candidateRevision:"78988fc2e5e24595bd9cd6ec0a3965c6039dc718",
  candidateCustody:{headMatched:true,workingTreeClean:true},
  externalBlocker:"A separate technical review reported a concrete blocking candidate after preparation began. No successful proof is claimed on this revision.",
  binding:{
    sourceHarness:"GUIDE_HARNESS_FIX9",sourceAdapter:"GUIDE_ROW_PROOF_FIX9",
    futureOutputNamespace:"GUIDE_LIVE_GUIDE10",
    retainedControlPurposes:112,matrixRows:54,
    requiredSuiteMembership:{before:33,prepared:34,added:["tests/integration/dev-database-principals.test.ts"],removed:[]},
    removedProductionSymbolAdjustmentRequired:false,
    preparedOrderedEightSha256:"c41ca153c25a795e37678350a490d8dee9ac4394559beeacd2bf196deda76217",
    matrixSha256:"4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c",
    preRequestVerifierSha256:"c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733"
  },
  execution:{syntax:false,controls:false,adapterNegative:false,finalBranches:false,rowProof54:false},
  traffic:{browser:0,runtime:0,http:0,database:0,status:0,capacity:0,supportRequests:0,modelRequests:0},
  heavyLeaseHeld:false,gitLeaseUsed:false,
  preparedFiles:records,
  limits:[
    "The prepared digest and bindings describe unexecuted candidate files; they are not a PASS proof.",
    "A corrected final product must be frozen and mechanically rebound before any inert execution.",
    "No GUIDE10 actual receipt, screenshot, browser profile, runtime gate, or capacity record was created."
  ]
};
await writeFile(`${evidence}/GUIDE_HARNESS_BIND10-prepared.json`,`${JSON.stringify(prepared,null,2)}\n`,{mode:0o600,flag:"wx"});

const report=`# GUIDE_HARNESS_BIND10 — prepared, not executed\n\nThe reviewed FIX9 harness and row-proof adapter were copied into new BIND10 namespaces and mechanically pointed at product candidate \`78988fc2e5e24595bd9cd6ec0a3965c6039dc718\` and unused \`GUIDE_LIVE_GUIDE10\` outputs. The exact producer suite grew from 33 to 34 files by adding only \`tests/integration/dev-database-principals.test.ts\`; the prepared membership check retains all prior members, argv coverage, duplicate rejection, and unsupported-flag rejection. Matrix54, the 112 reviewed purposes, capacity contract, staging/privacy semantics, and normal limits remain intact.\n\nBefore syntax or inert execution, a separate technical review reported a concrete blocking candidate in the product revision. Preparation stopped immediately. The candidate ordered-eight digest is \`c41ca153c25a795e37678350a490d8dee9ac4394559beeacd2bf196deda76217\`, but it is an unexecuted preparation hash and must not be treated as a successful proof. No heavy lease was requested or held, and no browser, runtime, HTTP, database, status, capacity, Support, or model activity occurred.\n\nThe prepared README records exact future \`node --import tsx\` argv and the genuine later gate requirement. A corrected clean product revision must be supplied, rebound, and verified before the control proof or GUIDE10 live capture can exist.\n`;
await writeFile(`${evidence}/GUIDE_HARNESS_BIND10.md`,report,{mode:0o600,flag:"wx"});

const self=`# GUIDE_HARNESS_BIND10 self-report\n\n- Ticket/session: \`t_f694e6ed\` / \`/root/preview\`\n- Candidate revision: \`78988fc2e5e24595bd9cd6ec0a3965c6039dc718\`\n- Verdict: \`PREPARED_NOT_EXECUTED_AWAITING_CORRECTED_PRODUCT\`\n- Usage: unavailable; no token budget was exposed.\n\n## SKILLS LOADED\n\n- \`superpowers:using-superpowers\`\n- \`superpowers:receiving-code-review\`\n- \`superpowers:systematic-debugging\`\n- \`superpowers:test-driven-development\`\n- \`superpowers:verification-before-completion\`\n- retained mission worker and verification instructions from the original session\n\n## Handoff\n\nThe mechanical copy, namespace/revision binding, exact34 suite-membership adjustment, candidate digest calculation, and exact future argv documentation are prepared. No controls ran because an independent technical review blocked the candidate first. No PASS, readiness, or acceptance claim is made.\n\n> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.\n\nStopping before the heavy frame avoided spending another full control cycle on a product already known to require correction. The repeated cost in this sequence is rebinding frozen receipt membership and output namespaces by hand after each product revision. A generated typed binder should ingest the final inventory, attestation, suite receipt, prior reviewed harness, and requested output namespace, then emit the exact digest, gate template, argv, and delta manifest. It should refuse to run controls until the product's independent reviews are consumed. That preserves the current safety boundary while eliminating most manual path, count, and revision edits.\n`;
await writeFile(`${agentReports}/GUIDE_HARNESS_BIND10.md`,self,{mode:0o600,flag:"wx"});
process.stdout.write(`${JSON.stringify({verdict:prepared.verdict,preparedFiles:records.length})}\n`);
