import { MicProcessorCore, type FromMainMessage, type MicProcessorOptions } from "./micProcessorCore";

/**
 * AudioWorklet module "mic-analyser" (spec 4.1). Bundled by Vite as its own
 * file; see micPipeline.ts for how it is loaded.
 */

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
}

class MicAnalyserProcessor extends AudioWorkletProcessor {
  private readonly core: MicProcessorCore;
  private stopped = false;

  constructor(options: { processorOptions?: MicProcessorOptions }) {
    super(options);
    const processorOptions = options.processorOptions ?? { profile: "guitar" };
    this.core = new MicProcessorCore(processorOptions, sampleRate, (message) => {
      if (message.type === "samples") this.port.postMessage(message, [message.samples.buffer]);
      else this.port.postMessage(message);
    });
    this.port.onmessage = (event: MessageEvent<FromMainMessage | { type: "stop" }>) => {
      if (event.data.type === "stop") this.stopped = true;
      else this.core.handle(event.data);
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel && channel.length) this.core.process(channel, currentTime);
    return !this.stopped;
  }
}

registerProcessor("mic-analyser", MicAnalyserProcessor);
