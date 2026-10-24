/// <reference types="vite/client" />

declare const __GOATCOUNTER_URL__: string;
declare const __DAYWEAVE_MODE__: 'demo' | 'local';

// Shared rule files wrapped at build time by the `dayweave-shared` plugin in vite.config.ts.
declare module '*.cjs?shared' {
  const factory: (module: { exports: Record<string, unknown> }, exports: Record<string, unknown>, require: (path: string) => unknown) => void;
  export default factory;
}
