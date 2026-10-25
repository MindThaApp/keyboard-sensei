import { useSyncExternalStore } from "react";
import { ListGroup, SegmentedControl, Slider } from "../ui";
import {
  FX_PRESETS,
  FX_RANGES,
  paramsFor,
  type FxBody,
  type FxColorMode,
  type FxNumericKey,
} from "./renderers/fx/fxParams";
import {
  getFxState,
  selectFxPreset,
  subscribeFx,
  tweakFx,
} from "./renderers/fx/fxStore";

const BODY_OPTIONS: { value: FxBody; label: string }[] = [
  { value: "glass", label: "Glass" },
  { value: "solid", label: "Solid" },
  { value: "gradient", label: "Gradient" },
  { value: "outline", label: "Outline" },
];

const COLOR_OPTIONS: { value: FxColorMode; label: string }[] = [
  { value: "single", label: "One" },
  { value: "byHand", label: "Hands" },
  { value: "byPitch", label: "Pitch" },
  { value: "rainbow", label: "Rainbow" },
  { value: "byHeight", label: "Height" },
];

const percent = (value: number) => `${Math.round(value * 100)}%`;
const degrees = (value: number) => `${Math.round(value)}°`;
const pixels = (value: number) => `${Math.round(value)} px`;

interface SliderSpec {
  key: FxNumericKey;
  label: string;
  format?: (value: number) => string;
}

const GROUPS: { header: string; sliders: SliderSpec[] }[] = [
  {
    header: "FX note body",
    sliders: [
      { key: "cornerRadius", label: "Rounded ends", format: percent },
      { key: "rim", label: "Rim brightness", format: percent },
      { key: "noiseAmt", label: "Smoky inside (glass)", format: percent },
      {
        key: "noiseSpeed",
        label: "Smoke movement",
        format: (v) => `${v.toFixed(2)}×`,
      },
    ],
  },
  {
    header: "FX glow",
    sliders: [
      { key: "glow", label: "Bloom strength", format: percent },
      { key: "noteGlow", label: "Glow around notes", format: percent },
    ],
  },
  {
    header: "FX hit line",
    sliders: [
      { key: "lineBrightness", label: "Line brightness", format: percent },
      { key: "flameHeight", label: "Flame height", format: pixels },
      { key: "flameFlicker", label: "Flicker", format: percent },
      { key: "flare", label: "Flare on press", format: percent },
    ],
  },
  {
    header: "FX sparks",
    sliders: [
      { key: "sparkCount", label: "Amount", format: (v) => `${Math.round(v)}` },
      { key: "sparkSize", label: "Size", format: (v) => `${v.toFixed(1)} px` },
      {
        key: "sparkRise",
        label: "Rise speed",
        format: (v) => `${Math.round(v)} px/s`,
      },
      { key: "sparkSwirl", label: "Swirl", format: percent },
      {
        key: "sparkLife",
        label: "Lifetime",
        format: (v) => `${v.toFixed(1)} s`,
      },
    ],
  },
  {
    header: "FX smoke",
    sliders: [
      { key: "smokeDensity", label: "Density", format: percent },
      { key: "smokeSwirl", label: "Swirl", format: percent },
      { key: "smokeTint", label: "Takes the note's colour", format: percent },
    ],
  },
  {
    header: "FX pressed keys and stage",
    sliders: [
      { key: "keyTint", label: "Pressed key tint", format: percent },
      { key: "background", label: "Black background", format: percent },
      { key: "laneAlpha", label: "Lane lines", format: percent },
      { key: "topFade", label: "Fade at the top", format: percent },
    ],
  },
];

/**
 * The FX look: a preset picker, with every fine control under "Fine tune" (always available). Touching a
 * control starts from the current preset and switches to Custom, which keeps the result.
 */
export default function FxLookSettings() {
  const state = useSyncExternalStore(subscribeFx, getFxState, getFxState);
  const params = paramsFor(state.preset, state.custom);

  return (
    <>
      <ListGroup
        header="FX look"
        footer="Changing any fine control starts from this look and saves it as Custom."
      >
        <li className="ks-row ks-practice-row--stack">
          <div className="ks-row__main">
            <div className="ks-fx-presets" role="group" aria-label="FX look">
              {FX_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="ks-fx-preset"
                  aria-pressed={state.preset === preset.id}
                  onClick={() => selectFxPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </li>
      </ListGroup>
      <details className="ks-fx-fine" data-testid="fx-fine-tune">
        <summary className="ks-fx-fine__summary">Fine tune</summary>
        <ListGroup header="FX note body and colour">
          <li className="ks-row ks-practice-row--stack">
            <div className="ks-row__main">
              <span className="ks-row__title" id="ks-fx-body-label">
                Note body
              </span>
              <SegmentedControl
                aria-labelledby="ks-fx-body-label"
                options={BODY_OPTIONS}
                value={params.body}
                onChange={(body: FxBody) => tweakFx({ body })}
                block
              />
            </div>
          </li>
          <li className="ks-row ks-practice-row--stack">
            <div className="ks-row__main">
              <span className="ks-row__title" id="ks-fx-color-label">
                Colour
              </span>
              <SegmentedControl
                aria-labelledby="ks-fx-color-label"
                options={COLOR_OPTIONS}
                value={params.colorMode}
                onChange={(colorMode: FxColorMode) => tweakFx({ colorMode })}
                block
              />
            </div>
          </li>
          <FxSlider
            spec={{ key: "hue", label: "Hue", format: degrees }}
            value={params.hue}
          />
          <FxSlider
            spec={{ key: "saturation", label: "Saturation", format: percent }}
            value={params.saturation}
          />
          <FxSlider
            spec={{ key: "lightness", label: "Lightness", format: percent }}
            value={params.lightness}
          />
          {params.colorMode === "byHand" && (
            <FxSlider
              spec={{
                key: "handOffset",
                label: "Left hand hue shift",
                format: degrees,
              }}
              value={params.handOffset}
            />
          )}
          {params.colorMode === "byPitch" && (
            <FxSlider
              spec={{
                key: "pitchSpan",
                label: "Hue across the keyboard",
                format: degrees,
              }}
              value={params.pitchSpan}
            />
          )}
          {params.colorMode === "rainbow" && (
            <FxSlider
              spec={{
                key: "cycleSpeed",
                label: "Cycle speed",
                format: (v) => `${Math.round(v)}°/s`,
              }}
              value={params.cycleSpeed}
            />
          )}
        </ListGroup>
        {GROUPS.map((group) => (
          <ListGroup key={group.header} header={group.header}>
            {group.sliders.map((spec) => (
              <FxSlider key={spec.key} spec={spec} value={params[spec.key]} />
            ))}
          </ListGroup>
        ))}
      </details>
    </>
  );
}

function FxSlider({ spec, value }: { spec: SliderSpec; value: number }) {
  const range = FX_RANGES[spec.key];
  return (
    <li className="ks-row ks-practice-row--stack">
      <div className="ks-row__main">
        <span className="ks-row__title">{spec.label}</span>
        <Slider
          aria-label={spec.label}
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          formatValue={spec.format}
          onChange={(next) => tweakFx({ [spec.key]: next })}
        />
      </div>
    </li>
  );
}
