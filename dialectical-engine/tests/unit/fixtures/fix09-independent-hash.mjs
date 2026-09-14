import { createHash } from "node:crypto";

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, ordered(value[key])]),
    );
  }
  return value;
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const canonical = JSON.stringify(ordered(JSON.parse(input)));
process.stdout.write(createHash("sha256").update(canonical, "utf8").digest("hex"));
