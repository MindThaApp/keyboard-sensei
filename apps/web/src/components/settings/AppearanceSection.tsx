import { useEffect, useState } from "react";
import { useAppearance } from "../../contexts/AppearanceContext";
import {
  TINT_PRESETS,
  tintPreset,
  type GlassStyle,
  type SheenLevel,
  type ThemePreference,
} from "../../utils/appearance";
import { ListGroup, ListRow, SegmentedControl, Slider } from "../ui";
import { SettingsRow } from "./SettingsRow";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto" },
];

const GLASS_OPTIONS: { value: GlassStyle; label: string }[] = [
  { value: "clear", label: "Clear" },
  { value: "frosted", label: "Frosted" },
  { value: "solid", label: "Solid" },
];

const SHEEN_OPTIONS: { value: SheenLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "subtle", label: "Subtle" },
  { value: "vivid", label: "Vivid" },
];

function TintPicker() {
  const { settings, update } = useAppearance();
  return (
    <div className="settings-tints" role="radiogroup" aria-label="Tint">
      {TINT_PRESETS.map((preset) => {
        const selected = settings.tint === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={preset.label}
            title={preset.label}
            className="settings-tint"
            data-selected={selected}
            style={{ backgroundColor: preset.light }}
            onClick={() => update({ tint: preset.id })}
          />
        );
      })}
    </div>
  );
}

/** Blur: dragging only repaints the blur variable; the full appearance is written on release. */
function BlurSlider({ disabled }: { disabled: boolean }) {
  const { settings, update, previewBlur } = useAppearance();
  const [draft, setDraft] = useState(settings.blur);

  useEffect(() => setDraft(settings.blur), [settings.blur]);

  const commit = () => {
    if (draft !== settings.blur) update({ blur: draft });
  };

  return (
    <div onPointerUp={commit} onKeyUp={commit} onBlur={commit} style={{ width: "100%" }}>
      <Slider
        aria-label="Blur"
        min={0}
        max={100}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(value) => {
          setDraft(value);
          previewBlur(value);
        }}
      />
    </div>
  );
}

/** Settings > Appearance: five controls, one set of CSS variables behind them (useAppearance). */
export default function AppearanceSection() {
  const { settings, resolved, update, reset } = useAppearance();
  // Not chosen yet means Frosted, or Solid on a device that cannot blur.
  const glass: GlassStyle = settings.glass ?? resolved.glass;
  const blurDisabled = resolved.glass === "solid";

  return (
    <div className="space-y-6">
      <ListGroup header="Appearance" aria-label="Appearance">
        <SettingsRow title="Theme">
          <SegmentedControl
            aria-label="Theme"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => update({ theme })}
          />
        </SettingsRow>
        <SettingsRow title="Glass">
          <SegmentedControl
            aria-label="Glass"
            options={GLASS_OPTIONS}
            value={glass}
            onChange={(style) => update({ glass: style })}
          />
        </SettingsRow>
        <SettingsRow title="Blur" hint={blurDisabled ? "Not used with Solid glass." : undefined}>
          <BlurSlider disabled={blurDisabled} />
        </SettingsRow>
        <SettingsRow title="Tint" value={tintPreset(settings.tint).label}>
          <TintPicker />
        </SettingsRow>
        <SettingsRow title="Sheen">
          <SegmentedControl
            aria-label="Sheen"
            options={SHEEN_OPTIONS}
            value={settings.sheen}
            onChange={(sheen) => update({ sheen })}
          />
        </SettingsRow>
      </ListGroup>
      <ListGroup aria-label="Reset appearance">
        <ListRow title="Reset to default" onClick={reset} />
      </ListGroup>
    </div>
  );
}
