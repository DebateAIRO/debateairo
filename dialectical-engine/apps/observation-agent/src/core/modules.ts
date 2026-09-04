import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ObservationError } from "./errors.js";
import type { SignalRouterFactory } from "./routing.js";
import type { Module, OactlVerbContribution } from "./types.js";

export type ObservationModuleCatalog = Readonly<{
  modules: readonly Module[];
  verbs: readonly OactlVerbContribution[];
  targetFragments: readonly string[];
  routerFactory: SignalRouterFactory | null;
}>;

function requireModule(candidate: unknown, directory: string): Module {
  if (candidate === null || typeof candidate !== "object") {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  const module = candidate as Partial<Module>;
  if (typeof module.name !== "string" || module.name.length === 0
    || module.cadence === undefined
    || !Number.isFinite(module.cadence.intervalMs)
    || !Number.isFinite(module.cadence.timeoutMs)
    || typeof module.probe !== "function"
    || typeof module.samples !== "function"
    || typeof module.signals !== "function"
    || (module.router !== undefined
      && (module.router === null
        || typeof module.router !== "object"
        || typeof module.router.create !== "function"))
    || (module.targetFragmentBasename !== undefined
      && !/^OBS-[0-9]{2}\.json$/u.test(module.targetFragmentBasename))) {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  return Object.freeze(module as Module);
}

function requireVerb(candidate: unknown): OactlVerbContribution {
  if (candidate === null || typeof candidate !== "object") {
    throw new ObservationError("OBSERVATION_VERB_INVALID");
  }
  const contribution = candidate as Partial<OactlVerbContribution>;
  if (typeof contribution.verb !== "string"
    || !/^[a-z][a-z0-9-]*$/u.test(contribution.verb)
    || typeof contribution.run !== "function") {
    throw new ObservationError("OBSERVATION_VERB_INVALID");
  }
  return Object.freeze(contribution as OactlVerbContribution);
}

async function importDefault(path: string): Promise<unknown> {
  const imported = await import(pathToFileURL(path).href) as Readonly<{ default?: unknown }>;
  return imported.default;
}

async function moduleVerbFiles(moduleRoot: string): Promise<readonly string[]> {
  const root = join(moduleRoot, "oactl");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(root, entry.name))
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function discoverObservationModules(modulesRoot: string): Promise<ObservationModuleCatalog> {
  const directories = (await readdir(modulesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const modules: Module[] = [];
  const verbs: OactlVerbContribution[] = [];
  const targetFragments: string[] = [];
  const moduleNames = new Set<string>();
  const verbNames = new Set<string>();
  const fragmentNames = new Set<string>();
  let routerFactory: SignalRouterFactory | null = null;

  for (const directory of directories) {
    const moduleRoot = join(modulesRoot, directory);
    const modulePath = join(moduleRoot, "module.ts");
    try {
      await access(modulePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    const manifest = requireModule(await importDefault(modulePath), directory);
    if (moduleNames.has(manifest.name)) {
      throw new ObservationError("OBSERVATION_DUPLICATE_MODULE");
    }
    moduleNames.add(manifest.name);
    modules.push(manifest);

    if (manifest.router !== undefined) {
      if (routerFactory !== null) {
        throw new ObservationError("OBSERVATION_DUPLICATE_ROUTER");
      }
      routerFactory = manifest.router;
    }

    if (manifest.targetFragmentBasename !== undefined) {
      if (fragmentNames.has(manifest.targetFragmentBasename)) {
        throw new ObservationError("OBSERVATION_DUPLICATE_TARGET");
      }
      fragmentNames.add(manifest.targetFragmentBasename);
      targetFragments.push(manifest.targetFragmentBasename);
    }

    const moduleVerbs = [
      ...(manifest.oactl ?? []),
      ...await Promise.all((await moduleVerbFiles(moduleRoot)).map(async (path) =>
        requireVerb(await importDefault(path))))
    ];
    for (const contribution of moduleVerbs) {
      const verb = requireVerb(contribution);
      if (verbNames.has(verb.verb)) {
        throw new ObservationError("OBSERVATION_DUPLICATE_VERB");
      }
      verbNames.add(verb.verb);
      verbs.push(verb);
    }
  }

  return Object.freeze({
    modules: Object.freeze(modules),
    verbs: Object.freeze(verbs),
    targetFragments: Object.freeze(targetFragments),
    routerFactory
  });
}
