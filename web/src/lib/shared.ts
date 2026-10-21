// The planning rules live in ../../src/*.cjs and are shared with the Node server and its tests. They are plain
// CommonJS-or-browser scripts, so we evaluate them with a tiny CommonJS shim instead of rewriting them. Load order
// matters only for require() calls made at load time (phase2, workload and planner read core immediately).
import emailSrc from '../../../src/email.cjs?raw';
import coreSrc from '../../../src/core.cjs?raw';
import phase2Src from '../../../src/phase2.cjs?raw';
import phase3Src from '../../../src/phase3.cjs?raw';
import effortSrc from '../../../src/effort.cjs?raw';
import workloadSrc from '../../../src/workload.cjs?raw';
import plannerSrc from '../../../src/planner.cjs?raw';
import todosSrc from '../../../src/todos.cjs?raw';
import demoSrc from '../../../src/demo.cjs?raw';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Module = Record<string, any>;
const registry: Record<string, Module> = {};

function load(name: string, source: string): Module {
  const module = { exports: {} as Module };
  const require = (path: string) => {
    const key = path.replace(/^\.\//, '').replace(/\.cjs$/, '');
    if (!(key in registry)) throw new Error(`Shared module ${key} is not loaded`);
    return registry[key];
  };
  new Function('module', 'exports', 'require', source)(module, module.exports, require);
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
