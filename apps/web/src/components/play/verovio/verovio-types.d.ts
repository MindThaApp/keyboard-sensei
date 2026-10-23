// The verovio npm package ships no type declarations; these cover what the web app uses.
declare module "verovio/wasm" {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module "verovio/esm" {
  export function enableLogToBuffer(value: boolean, module: unknown): void;

  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    redoLayout(options?: Record<string, unknown>): void;
    getPageCount(): number;
    renderToSVG(page?: number, xmlDeclaration?: boolean): string;
    renderToTimemap(options?: Record<string, unknown>): { tstamp: number; on?: string[]; off?: string[] }[];
  }
}
