import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { API } from "typescript/unstable/sync";
import {
  isComputedPropertyName,
  isGetAccessorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteralLikeNode,
  type Node,
  type PropertyName,
  type SourceFile
} from "typescript/unstable/ast";
import { ObservationError } from "./errors.js";
import type {
  RouterBootstrapInput,
  SignalRouter,
  SignalRouterFactory
} from "./routing.js";
import type { Module } from "./types.js";

export type RouterContribution = Readonly<{
  moduleName: string;
  targetFragmentBasename: string;
  factory: SignalRouterFactory;
}>;

export type ObservationModuleCatalog = Readonly<{
  modules: readonly Module[];
  targetFragments: readonly string[];
  routerContribution: RouterContribution | null;
}>;

const OBSERVATION_MODULE_KEYS: ReadonlySet<PropertyKey> = new Set([
  "name",
  "cadence",
  "lifecycle",
  "targetFragmentBasename",
  "router",
  "probe",
  "samples",
  "signals"
]);

function requireModule(candidate: unknown, directory: string): Module {
  if (candidate === null || typeof candidate !== "object") {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  if (Reflect.ownKeys(candidate).some((key) => !OBSERVATION_MODULE_KEYS.has(key))) {
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
    || (module.lifecycle !== undefined
      && (module.lifecycle === null
        || typeof module.lifecycle !== "object"
        || typeof module.lifecycle.legacyCorrelationKey !== "function"
        || typeof module.lifecycle.restore !== "function"))
    || (module.router !== undefined
      && (module.router === null
        || typeof module.router !== "object"
        || typeof module.router.create !== "function"
        || module.targetFragmentBasename === undefined))
    || (module.targetFragmentBasename !== undefined
      && !/^OBS-[0-9]{2}\.json$/u.test(module.targetFragmentBasename))) {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  return Object.freeze(module as Module);
}

export async function createOwnedSignalRouter(
  contribution: RouterContribution,
  input: RouterBootstrapInput
): Promise<SignalRouter> {
  if (contribution.moduleName !== input.moduleName
    || contribution.targetFragmentBasename !== input.targetFragment.basename) {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  const bootstrap = Object.freeze({
    ...input,
    configuration: Object.freeze({ ...input.configuration }),
    thresholds: Object.freeze({ ...input.thresholds })
  });
  const router: unknown = await contribution.factory.create(bootstrap);
  if (router === null
    || typeof router !== "object"
    || typeof (router as Partial<SignalRouter>).onSignal !== "function"
    || typeof (router as Partial<SignalRouter>).onTick !== "function"
    || typeof (router as Partial<SignalRouter>).status !== "function") {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  return Object.freeze(router as SignalRouter);
}

async function importDefault(path: string): Promise<unknown> {
  const imported = await import(pathToFileURL(path).href) as Readonly<{ default?: unknown }>;
  return imported.default;
}

function isForbiddenRuntimeManifestPropertyName(name: PropertyName): boolean {
  if (isComputedPropertyName(name)) return true;
  return (isIdentifier(name) || isStringLiteralLikeNode(name)) && name.text === "oactl";
}

function hasForbiddenRuntimeManifestField(sourceFile: SourceFile): boolean {
  let found = false;
  const visit = (node: Node): void => {
    if (found) return;
    if (isObjectLiteralExpression(node) && node.properties.some((property) =>
      (isPropertyAssignment(property)
        || isShorthandPropertyAssignment(property)
        || isGetAccessorDeclaration(property)
        || isSetAccessorDeclaration(property)
        || isMethodDeclaration(property))
      && isForbiddenRuntimeManifestPropertyName(property.name))) {
      found = true;
      return;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
}

function assertRuntimeModuleSources(modulePaths: readonly string[], modulesRoot: string): void {
  if (modulePaths.length === 0) return;
  let compiler: API | null = null;
  try {
    compiler = new API({ cwd: modulesRoot });
    const snapshot = compiler.updateSnapshot({ openFiles: [...modulePaths] });
    try {
      for (const modulePath of modulePaths) {
        const project = snapshot.getDefaultProjectForFile(modulePath);
        const sourceFile = project?.program.getSourceFile(modulePath);
        if (project === undefined
          || sourceFile === undefined
          || project.program.getSyntacticDiagnostics(modulePath).length !== 0
          || hasForbiddenRuntimeManifestField(sourceFile)) {
          throw new ObservationError("OBSERVATION_MODULE_INVALID");
        }
      }
    } finally {
      snapshot.dispose();
    }
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    throw new ObservationError("OBSERVATION_MODULE_INVALID", error);
  } finally {
    try {
      compiler?.close();
    } catch {
      // Parsing has already failed closed or completed; shutdown cannot weaken the boundary.
    }
  }
}

export async function discoverObservationRuntimeModules(
  modulesRoot: string
): Promise<ObservationModuleCatalog> {
  const directories = (await readdir(modulesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const modules: Module[] = [];
  const targetFragments: string[] = [];
  const moduleNames = new Set<string>();
  const fragmentNames = new Set<string>();
  let routerContribution: RouterContribution | null = null;
  const candidates: Array<Readonly<{ directory: string; modulePath: string }>> = [];

  for (const directory of directories) {
    const moduleRoot = join(modulesRoot, directory);
    const modulePath = join(moduleRoot, "module.ts");
    try {
      await access(modulePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    candidates.push(Object.freeze({ directory, modulePath }));
  }
  assertRuntimeModuleSources(candidates.map(({ modulePath }) => modulePath), modulesRoot);

  for (const { directory, modulePath } of candidates) {
    const manifest = requireModule(await importDefault(modulePath), directory);
    if (moduleNames.has(manifest.name)) {
      throw new ObservationError("OBSERVATION_DUPLICATE_MODULE");
    }
    moduleNames.add(manifest.name);
    modules.push(manifest);

    if (manifest.router !== undefined) {
      if (routerContribution !== null) {
        throw new ObservationError("OBSERVATION_DUPLICATE_ROUTER");
      }
      routerContribution = Object.freeze({
        moduleName: manifest.name,
        targetFragmentBasename: manifest.targetFragmentBasename!,
        factory: manifest.router
      });
    }

    if (manifest.targetFragmentBasename !== undefined) {
      if (fragmentNames.has(manifest.targetFragmentBasename)) {
        throw new ObservationError("OBSERVATION_DUPLICATE_TARGET");
      }
      fragmentNames.add(manifest.targetFragmentBasename);
      targetFragments.push(manifest.targetFragmentBasename);
    }
  }

  return Object.freeze({
    modules: Object.freeze(modules),
    targetFragments: Object.freeze(targetFragments),
    routerContribution
  });
}

export const discoverObservationModules = discoverObservationRuntimeModules;
