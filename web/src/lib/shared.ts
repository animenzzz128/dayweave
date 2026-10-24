// The planning rules live in ../../src/*.cjs and are shared with the Node server and its tests. They are plain
// CommonJS-or-browser scripts. The `?shared` import (vite.config.ts) wraps each in a function at build time, so no string is
// evaluated at run time (the private instance's CSP has no 'unsafe-eval') and nothing is rewritten. Load order
// matters only for require() calls made at load time (phase2, workload and planner read core immediately).
import emailSrc from '../../../src/email.cjs?shared';
import coreSrc from '../../../src/core.cjs?shared';
import phase2Src from '../../../src/phase2.cjs?shared';
import phase3Src from '../../../src/phase3.cjs?shared';
import effortSrc from '../../../src/effort.cjs?shared';
import workloadSrc from '../../../src/workload.cjs?shared';
import plannerSrc from '../../../src/planner.cjs?shared';
import todosSrc from '../../../src/todos.cjs?shared';
import demoSrc from '../../../src/demo.cjs?shared';
import aiSrc from '../../../src/ai.cjs?shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Module = Record<string, any>;
const registry: Record<string, Module> = {};

type Factory = (module: { exports: Module }, exports: Module, require: (path: string) => Module) => void;

function load(name: string, factory: Factory): Module {
  const module = { exports: {} as Module };
  const require = (path: string) => {
    const key = path.replace(/^\.\//, '').replace(/\.cjs$/, '');
    if (!(key in registry)) throw new Error(`Shared module ${key} is not loaded`);
    return registry[key];
  };
  factory(module, module.exports, require);
  registry[name] = module.exports;
  return module.exports;
}

export const Email = load('email', emailSrc);
export const Core = load('core', coreSrc);
export const Phase2 = load('phase2', phase2Src);
export const Phase3 = load('phase3', phase3Src);
export const Effort = load('effort', effortSrc);
export const Workload = load('workload', workloadSrc);
export const Planner = load('planner', plannerSrc);
export const Todos = load('todos', todosSrc);
export const Demo = load('demo', demoSrc);
export const AI = load('ai', aiSrc);
