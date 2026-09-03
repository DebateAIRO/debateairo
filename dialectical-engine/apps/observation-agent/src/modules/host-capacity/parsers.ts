export type DiskCapacity = Readonly<{
  totalBytes: number;
  freeBytes: number;
  freePercent: number;
}>;

export type MemoryCapacity = Readonly<{
  totalBytes: number;
  availableBytes: number;
  availablePercent: number;
}>;

export type ContainerCapacity = Readonly<{
  name: string;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
}>;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`OBSERVATION_HOST_PARSE_INVALID:${label}`);
  return value;
}

function decimal(value: string): number {
  return Number(value.trim().replace(/\s+/gu, "").replace(",", "."));
}

export function parseDf(output: string): DiskCapacity {
  const line = output.split(/\r?\n/u).map((value) => value.trim())
    .filter(Boolean).findLast((value) => /\s\/\s*$/u.test(` ${value} `));
  if (line === undefined) throw new Error("OBSERVATION_HOST_PARSE_INVALID:df");
  const fields = line.split(/\s+/u);
  if (fields.length < 6) throw new Error("OBSERVATION_HOST_PARSE_INVALID:df");
  const totalBytes = finite(Number(fields[1]) * 1_024, "disk_total");
  const freeBytes = finite(Number(fields[3]) * 1_024, "disk_free");
  return Object.freeze({ totalBytes, freeBytes, freePercent: finite(freeBytes / totalBytes * 100, "disk_percent") });
}

export function parseVmStat(output: string, totalBytes: number): MemoryCapacity {
  const pageMatch = output.match(/page size of\s+([0-9.,]+)\s+bytes/iu);
  if (pageMatch === null) throw new Error("OBSERVATION_HOST_PARSE_INVALID:page_size");
  const pageSize = finite(Number(pageMatch[1]!.replace(/[.,](?=\d{3}(?:\D|$))/gu, "")), "page_size");
  const pages = new Map<string, number>();
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^\s*Pages\s+(free|inactive|speculative):\s*([0-9.,]+)\.?\s*$/iu);
    if (match !== null) pages.set(match[1]!.toLowerCase(), Number(match[2]!.replace(/[.,]$/u, "")));
  }
  const availablePages = ["free", "inactive", "speculative"]
    .reduce((sum, key) => sum + finite(pages.get(key) ?? 0, `pages_${key}`), 0);
  const availableBytes = finite(availablePages * pageSize, "memory_available");
  const checkedTotal = finite(totalBytes, "memory_total");
  if (checkedTotal === 0) throw new Error("OBSERVATION_HOST_PARSE_INVALID:memory_total");
  return Object.freeze({
    totalBytes: checkedTotal,
    availableBytes,
    availablePercent: finite(availableBytes / checkedTotal * 100, "memory_percent")
  });
}

export function parseLoadAverage(output: string): number {
  const match = output.match(/[-+]?[0-9]+(?:[.,][0-9]+)?/u);
  if (match === null) throw new Error("OBSERVATION_HOST_PARSE_INVALID:load");
  return finite(decimal(match[0]), "load");
}

function parseBytes(value: string): number {
  const match = value.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*([kmgt]?i?b)$/iu);
  if (match === null) throw new Error("OBSERVATION_HOST_PARSE_INVALID:bytes");
  const powers: Readonly<Record<string, number>> = Object.freeze({
    b: 1, kb: 1_000, mb: 1_000_000, gb: 1_000_000_000, tb: 1_000_000_000_000,
    kib: 1_024, mib: 1_048_576, gib: 1_073_741_824, tib: 1_099_511_627_776
  });
  return finite(decimal(match[1]!) * powers[match[2]!.toLowerCase()]!, "bytes");
}

function jsonLines(output: string): readonly Record<string, unknown>[] {
  return Object.freeze(output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("OBSERVATION_HOST_PARSE_INVALID:docker_json");
    }
    return value as Record<string, unknown>;
  }));
}

export function parseDockerSystemDf(output: string): number {
  return finite(jsonLines(output).reduce((sum, row) => {
    if (typeof row.Size !== "string") throw new Error("OBSERVATION_HOST_PARSE_INVALID:docker_size");
    return sum + parseBytes(row.Size);
  }, 0), "docker_disk");
}

export function parseDockerStats(output: string): readonly ContainerCapacity[] {
  return Object.freeze(jsonLines(output).map((row) => {
    if (typeof row.Name !== "string" || typeof row.CPUPerc !== "string"
      || typeof row.MemUsage !== "string" || typeof row.MemPerc !== "string") {
      throw new Error("OBSERVATION_HOST_PARSE_INVALID:docker_stats");
    }
    const memory = row.MemUsage.split("/");
    if (memory.length !== 2) throw new Error("OBSERVATION_HOST_PARSE_INVALID:docker_memory");
    return Object.freeze({
      name: row.Name,
      cpuPercent: finite(decimal(row.CPUPerc.replace("%", "")), "container_cpu"),
      memoryUsedBytes: parseBytes(memory[0]!),
      memoryLimitBytes: parseBytes(memory[1]!),
      memoryPercent: finite(decimal(row.MemPerc.replace("%", "")), "container_memory_percent")
    });
  }));
}
