/// <reference types="vite/client" />

declare const __DAYWEAVE_MODE__: 'demo' | 'local';

declare module '*.cjs?raw' {
  const source: string;
  export default source;
}
