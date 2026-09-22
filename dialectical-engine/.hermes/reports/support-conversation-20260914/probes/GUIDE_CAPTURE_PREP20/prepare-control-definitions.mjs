import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const sourcePath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_HARNESS_BIND17-control-proof.json";
const outputPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_CAPTURE_PREP20-control-definitions.json";
const bytes=await readFile(sourcePath);
const source=JSON.parse(bytes.toString("utf8"));
if (source.controls !== 151 || source.passed !== 151 || source.names.length !== 151) {
  throw new Error("GUIDE_CAPTURE_PRIOR_CONTROL_PURPOSES_INVALID");
}
const value={
  schemaVersion:1,node:"GUIDE_CAPTURE_PREP20",revision:null,
  preparationBase:"0f4290c290fd38caa0ccfb3b6781fb8c33999a22",
  verdict:"PREPARED_NOT_EXECUTED",
  priorPurposes:{ path:sourcePath,sha256:createHash("sha256").update(bytes).digest("hex"),count:151,names:source.names },
  explicitPlanSupersessions:[
    { prior:"execution order covers every canonical row exactly once",replacement:"offline proof covers all canonical54 plus owner4; actual execution covers the exact reviewed fresh31 once" },
    { prior:"injection controls are deterministic and model ceiling is forty two",replacement:"deterministic boundaries remain exact and the focused31 model ceiling is twenty seven" },
    { prior:"affected plan retains only complete groups one and two and reruns whole groups three through five",replacement:"no historical sample is retained; all fixed31 rows are fresh" },
    { prior:"fresh three group lifecycle creates distinct sessions and preserves every continuation",replacement:"fresh fixed31 lifecycle creates five distinct sessions and preserves every continuation" },
    { prior:"fresh pacing validates exactly thirty nine canonical request starts",replacement:"fresh pacing validates exactly thirty one reviewed request starts" },
    { prior:"fresh capacity requires three sessions and thirty nine daily messages without relaxing other limits",replacement:"fresh capacity requires five capture sessions and thirty one messages plus six owner messages and two owner sessions" },
    { prior:"sealed retention manifest binds exactly fifteen complete public rows and excludes the partial group",replacement:"fresh31 explicitly rejects every retained-sample provenance" }
  ],
  affectedDefinitions:[
    "canonical54 plus owner4 matrix identity remains exact",
    "fixed31 sequence membership and five group order remain exact",
    "fixed31 contains fourteen English and seventeen Romanian prompts",
    "fixed31 contains exactly twenty seven model-eligible rows",
    "all four owner rows and both Help navigation rows are present",
    "capacity reserves six owner messages and two natural owner sessions",
    "running API kb_version must equal the bound reviewed KB in the single fresh status frame",
    "all seven phase commands use absolute executable script cwd output and log paths",
    "future receipt profile diagnostics and ninety three screenshot segments must be absent before capture",
    "each answer screenshot preserves original-pane top and footer reachability plus a labeled evidence-only expanded capture",
    "existing Help tab uses exposed reload and normal supported session behavior without storage or DevTools manipulation"
  ],
  executedControls:0
};
await writeFile(outputPath,`${JSON.stringify(value,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({ outputPath,priorPurposes:value.priorPurposes.count,affectedDefinitions:value.affectedDefinitions.length })}\n`);
