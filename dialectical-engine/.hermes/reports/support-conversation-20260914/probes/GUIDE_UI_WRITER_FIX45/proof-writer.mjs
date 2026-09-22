import { writeFile } from "node:fs/promises";
export async function writePrivateJsonExclusive(path,value){await writeFile(path,`${JSON.stringify(value,null,2)}\n`,{flag:"wx",mode:0o600});}
