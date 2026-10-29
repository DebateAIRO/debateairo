import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const api = readFileSync("apps/api/src/index.ts", "utf8");
const db = readFileSync("packages/db/src/index.ts", "utf8");

/** Mask comments and literals so call and scope checks read TypeScript code, not prose or SQL. */
function codeMask(source: string): string {
  const out = source.split("");
  type State = { kind: "code" | "interpolation" | "single" | "double" | "template" | "line" | "block"; depth?: number };
  const stack: State[] = [{ kind: "code" }];
  const hidden = () => stack.length > 1;
  for (let i = 0; i < source.length; i++) {
    const state = stack.at(-1)!;
    const ch = source[i]!;
    const next = source[i + 1];
    if (state.kind === "line") {
      if (ch === "\n") stack.pop(); else out[i] = " ";
      continue;
    }
    if (state.kind === "block") {
      out[i] = " ";
      if (ch === "*" && next === "/") { out[++i] = " "; stack.pop(); }
      continue;
    }
    if (state.kind === "single" || state.kind === "double") {
      out[i] = " ";
      if (ch === "\\") { if (next !== undefined) out[++i] = " "; }
      else if (ch === (state.kind === "single" ? "'" : '"')) stack.pop();
      continue;
    }
    if (state.kind === "template") {
      out[i] = " ";
      if (ch === "\\") { if (next !== undefined) out[++i] = " "; }
      else if (ch === "`" ) stack.pop();
      else if (ch === "$" && next === "{") { out[++i] = " "; stack.push({ kind: "interpolation", depth: 1 }); }
      continue;
    }
    if (hidden()) out[i] = " ";
    if (ch === "/" && next === "/") { out[i] = out[++i] = " "; stack.push({ kind: "line" }); continue; }
    if (ch === "/" && next === "*") { out[i] = out[++i] = " "; stack.push({ kind: "block" }); continue; }
    if (ch === "'") { out[i] = " "; stack.push({ kind: "single" }); continue; }
    if (ch === '"') { out[i] = " "; stack.push({ kind: "double" }); continue; }
    if (ch === "`") { out[i] = " "; stack.push({ kind: "template" }); continue; }
    if (state.kind === "interpolation") {
      if (ch === "{") state.depth = (state.depth ?? 0) + 1;
      if (ch === "}") {
        state.depth = (state.depth ?? 0) - 1;
        if (state.depth === 0) stack.pop();
      }
    }
  }
  return out.join("");
}

function allIndices(source: string, expression: RegExp): number[] {
  return [...source.matchAll(new RegExp(expression.source, "gu"))].map((match) => match.index);
}

const submitCall = /\.submit\s*\(/u;

function scope(source: string, open: number): { start: number; end: number } {
  expect(source[open]).toBe("{");
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return { start: open, end: i + 1 };
  }
  throw new Error("Unclosed TypeScript scope");
}

function method(source: string, name: string): { start: number; end: number } {
  const masked = codeMask(source);
  const hits = allIndices(masked, new RegExp(`\\basync\\s+${name.replace("#", "#")}\\s*\\(`, "u"));
  expect(hits).toHaveLength(1);
  // The body opens after the parameter list closes: a parameter's type may hold braces of its own.
  let depth = 0;
  let close = masked.indexOf("(", hits[0]!);
  for (; close < masked.length; close++) {
    if (masked[close] === "(") depth++;
    if (masked[close] === ")" && --depth === 0) break;
  }
  return scope(masked, masked.indexOf("{", close));
}

function tsFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? tsFiles(path) : entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

describe("S04 run creation stays behind the ask gate", () => {
  // Merged with origin/dev d78d58b4f (2026-10-26): side-by-side C11 moved the row's insert into the private #insertRun,
  // shared by startRun (a new ask) and startReadmittedRun (re-admitting a waiting run, whose stored ask passed the check
  // when it was first submitted). Neither is reachable any other way.
  it("core.run has one writer, #insertRun, behind startRun (inside submit and #submitWithRoom) and the re-admission", () => {
    const insertions = allIndices(db, /INSERT\s+INTO\s+core\.run\s*\(/u);
    expect(insertions).toHaveLength(1);
    const insertRun = method(db, "#insertRun");
    expect(insertions[0]).toBeGreaterThan(insertRun.start);
    expect(insertions[0]).toBeLessThan(insertRun.end);
    const helperCalls = allIndices(codeMask(db), /\.#insertRun\s*\(/u);
    expect(helperCalls).toHaveLength(2);
    for (const owner of ["startRun", "startReadmittedRun"]) {
      const body = method(db, owner);
      expect(helperCalls.filter((at) => at > body.start && at < body.end), owner).toHaveLength(1);
    }
    const calls = allIndices(codeMask(api), /\.startRun\s*\(/u);
    expect(calls).toHaveLength(2);
    const submit = method(api, "submit");
    const room = method(api, "#submitWithRoom");
    expect(calls.filter((at) => at > submit.start && at < submit.end)).toHaveLength(1);
    expect(calls.filter((at) => at > room.start && at < room.end)).toHaveLength(1);
    const readmissions = allIndices(codeMask(api), /\.startReadmittedRun\s*\(/u);
    expect(readmissions).toHaveLength(1);
    const readmit = method(api, "#readmit");
    expect(readmissions[0]).toBeGreaterThan(readmit.start);
    expect(readmissions[0]).toBeLessThan(readmit.end);
  });

  it("submit is called only by POST /v1/asks, after the question check", () => {
    const masked = codeMask(api);
    const calls = allIndices(masked, submitCall);
    expect(calls).toHaveLength(1);
    const routeAt = api.indexOf('api.post("/v1/asks"');
    expect(routeAt).toBeGreaterThan(-1);
    const route = scope(masked, masked.indexOf("{", masked.indexOf("async (request, reply) =>", routeAt)));
    expect(calls[0]).toBeGreaterThan(route.start);
    expect(calls[0]).toBeLessThan(route.end);
    const checkAt = masked.indexOf("options.questionCheck.check(", route.start);
    expect(checkAt).toBeGreaterThan(route.start);
    expect(calls[0]).toBeGreaterThan(checkAt);
    const roomCalls = allIndices(masked, /\.#submitWithRoom\s*\(/u);
    expect(roomCalls).toHaveLength(1);
    const submit = method(api, "submit");
    expect(roomCalls[0]).toBeGreaterThan(submit.start);
    expect(roomCalls[0]).toBeLessThan(submit.end);
  });

  it("recognizes a submit call through an aliased application", () => {
    const alias = "const app = options.application; app.submit(question);";
    expect(allIndices(codeMask(alias), submitCall)).toHaveLength(1);
  });

  it("core.create_encrypted_run has one call in apps and packages, inside #insertRun", () => {
    const calls = [...tsFiles("apps"), ...tsFiles("packages")].flatMap((path) =>
      allIndices(readFileSync(path, "utf8"), /SELECT\s+core\.create_encrypted_run\s*\(/u)
        .map((at) => ({ path, at })));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("packages/db/src/index.ts");
    const insertRun = method(db, "#insertRun");
    expect(calls[0]!.at).toBeGreaterThan(insertRun.start);
    expect(calls[0]!.at).toBeLessThan(insertRun.end);
  });
});
