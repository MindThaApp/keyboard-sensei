/**
 * The Verovio engraver, run off the main thread: loading the ~7 MB WASM module and
 * laying out a long score each block the thread for a noticeable time, which on a
 * phone is a frozen screen. This file is only ever the entry of a Worker (see
 * engraveClient.ts), so it is a separate, lazily fetched script.
 */
import createVerovioModule from "verovio/wasm";
import { enableLogToBuffer, VerovioToolkit } from "verovio/esm";
import type { EngraveRequest, EngraveResponse } from "./engraveProtocol";

let toolkitPromise: Promise<VerovioToolkit> | null = null;
const loadToolkit = (): Promise<VerovioToolkit> => {
  const pending =
    toolkitPromise ??
    createVerovioModule().then((module) => {
      enableLogToBuffer(true, module);
      return new VerovioToolkit(module);
    });
  toolkitPromise = pending;
  pending.catch(() => {
    toolkitPromise = null;
  });
  return pending;
};

const reply = (response: EngraveResponse) => self.postMessage(response);

self.addEventListener("message", (event: MessageEvent<EngraveRequest>) => {
  const { id, mei, scale, pageWidth } = event.data;
  loadToolkit()
    .then((tk) => {
      tk.setOptions({
        inputFrom: "mei",
        scale,
        pageWidth,
        adjustPageHeight: true,
        breaks: "auto",
        header: "none",
        footer: "none",
        pageMarginTop: 20,
        pageMarginBottom: 20,
        pageMarginLeft: 20,
        pageMarginRight: 20,
      });
      if (!tk.loadData(mei)) throw new Error("Verovio could not read the notation");
      const pages = Array.from({ length: tk.getPageCount() }, (_, index) => tk.renderToSVG(index + 1));
      reply({ id, ok: true, pages, timemap: tk.renderToTimemap({}) });
    })
    .catch((error: unknown) => {
      reply({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
    });
});
