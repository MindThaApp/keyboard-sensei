// The verovio npm package ships no type declarations; these cover what the API uses.
declare module "verovio/wasm" {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module "verovio/esm" {
  export interface TimemapEntry {
    /** Milliseconds from the start, tempo applied. */
    tstamp: number;
    /** Quarter notes from the start. */
    qstamp: number;
    on?: string[];
    off?: string[];
    measureOn?: string;
    tempo?: number;
  }

  /** Send Verovio's log to the buffer `getLog()` reads instead of stdout. */
  export function enableLogToBuffer(value: boolean, module: unknown): void;

  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    getLog(): string;
    getMEI(options?: Record<string, unknown>): string;
    getPageCount(): number;
    renderToMIDI(): string;
    renderToTimemap(options?: Record<string, unknown>): TimemapEntry[];
    destroy(): void;
  }
}
