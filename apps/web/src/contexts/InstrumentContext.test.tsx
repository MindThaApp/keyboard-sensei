// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ACTIVE_INSTRUMENT_KEY, INSTRUMENT_PENDING_KEY, InstrumentProvider, PLAYED_INSTRUMENTS_KEY, useInstrument } from "./InstrumentContext";

let ctx: ReturnType<typeof useInstrument>;
function Probe() {
  ctx = useInstrument();
  return null;
}
const mount = () =>
  render(
    <InstrumentProvider>
      <Probe />
    </InstrumentProvider>,
  );

describe("InstrumentProvider", () => {
  beforeEach(() => localStorage.clear());

  it("an upgraded install with nothing stored is piano, unchosen, and writes nothing", () => {
    localStorage.setItem("ks-experience", "advanced");
    mount();
    expect(ctx.active).toBe("piano");
    expect(ctx.played).toEqual([]);
    expect(ctx.chosen).toBe(false);
    expect(localStorage.getItem(ACTIVE_INSTRUMENT_KEY)).toBeNull();
    expect(localStorage.getItem("ks-experience")).toBe("advanced");
  });

  it("stores a choice, queues it for the account, and keeps the active instrument among those played", async () => {
    mount();
    await act(async () => ctx.choose(["guitar"], "guitar"));
    expect(ctx.active).toBe("guitar");
    expect(localStorage.getItem(ACTIVE_INSTRUMENT_KEY)).toBe("guitar");
    expect(JSON.parse(localStorage.getItem(PLAYED_INSTRUMENTS_KEY)!)).toEqual(["guitar"]);
    expect(localStorage.getItem(INSTRUMENT_PENDING_KEY)).toBe("1");
    await act(async () => ctx.markSynced());
    expect(localStorage.getItem(INSTRUMENT_PENDING_KEY)).toBeNull();
  });

  it("adopting the account's value does not queue a save", async () => {
    mount();
    await act(async () => ctx.adopt(["piano", "violin"], "violin"));
    expect(ctx.active).toBe("violin");
    expect(localStorage.getItem(INSTRUMENT_PENDING_KEY)).toBeNull();
  });

  it("survives corrupt stored values", () => {
    localStorage.setItem(PLAYED_INSTRUMENTS_KEY, "{not json");
    localStorage.setItem(ACTIVE_INSTRUMENT_KEY, "banjo");
    mount();
    expect(ctx.active).toBe("piano");
    expect(ctx.played).toEqual([]);
  });
});
