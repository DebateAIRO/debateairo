export function createGuideProbeCheckpoint({ mkdir,writeFile,evidenceRoot,outputPath,readResult }) {
  if (typeof mkdir !== "function" || typeof writeFile !== "function"
    || typeof evidenceRoot !== "string" || !evidenceRoot.startsWith("/")
    || typeof outputPath !== "string" || !outputPath.startsWith(`${evidenceRoot}/`)
    || typeof readResult !== "function") {
    throw new Error("GUIDE_UI_PROBE_CHECKPOINT_CONTRACT_INVALID");
  }
  let created=false;
  return async function checkpoint() {
    await mkdir(evidenceRoot,{ recursive:true });
    const value=readResult();
    await writeFile(outputPath,`${JSON.stringify(value,null,2)}\n`,
      created ? {} : { flag:"wx",mode:0o600 });
    created=true;
  };
}
