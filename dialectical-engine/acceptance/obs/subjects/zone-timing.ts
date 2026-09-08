import { hrtime } from "node:process";

const onUrl = process.env.OBS_G1_ZONE_ON_HTTPS_URL;
const offUrl = process.env.OBS_G1_ZONE_OFF_HTTPS_URL;
const count = Number(process.env.OBS_G1_ZONE_SAMPLE_SIZE);
if (onUrl === undefined || offUrl === undefined || !Number.isSafeInteger(count) || count < 20 || count > 200) {
  throw new Error("FIX08_ZONE_INPUT_INVALID");
}

async function distribution(url: string): Promise<number[]> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/v1/auth/login") {
    throw new Error("FIX08_ZONE_URL_INVALID");
  }
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const started = hrtime.bigint();
    await fetch(parsed, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(3_000),
    });
    samples.push(Number((hrtime.bigint() - started) / 1_000n));
  }
  return samples;
}

const on = await distribution(onUrl);
const off = await distribution(offUrl);
process.stdout.write(`FIX08_ZONE_TIMING ${JSON.stringify({ on, off })}\n`);
