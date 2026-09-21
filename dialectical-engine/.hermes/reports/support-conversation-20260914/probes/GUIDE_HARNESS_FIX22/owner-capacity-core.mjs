import { closeSync,ftruncateSync,openSync,writeSync } from 'node:fs';
const FIXED=/^GUIDE_[A-Z0-9_]+$/u;
export async function materializeOwnerCapacity({outputPath,revision,kbVersion,readCapacity,validateCapacity}) {
  let fd;
  try { fd=openSync(outputPath,'wx',0o600); }
  catch (error) { if(error?.code==='EEXIST') throw new Error('GUIDE_OWNER_CAPACITY_OUTPUT_EXISTS'); throw error; }
  try {
    const capacity=await readCapacity();
    const validated=validateCapacity(capacity);
    const out={schemaVersion:1,node:'GUIDE_OWNER_CAPACITY21',revision,kbVersion,requirements:{maxMessages:6,maxSessions:2,modelCallCeiling:6},measuredAtUtc:validated.measuredAtUtc,capacity:validated};
    const bytes=Buffer.from(`${JSON.stringify(out,null,2)}\n`);ftruncateSync(fd,0);writeSync(fd,bytes);return out;
  } catch(error) {
    const code=FIXED.test(error?.message??'')?error.message:'GUIDE_OWNER_CAPACITY_READ_FAILED';
    const failure=Buffer.from(`${JSON.stringify({schemaVersion:1,node:'GUIDE_OWNER_CAPACITY21',revision,result:'FAIL',code},null,2)}\n`);ftruncateSync(fd,0);writeSync(fd,failure);throw error;
  } finally { closeSync(fd); }
}
