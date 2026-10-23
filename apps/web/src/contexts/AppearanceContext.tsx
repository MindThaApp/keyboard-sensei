import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_APPEARANCE,
  MEDIA_QUERIES,
  classifyDevice,
  loadAppearance,
  parseAppearance,
  previewBlur as writeBlurPreview,
  readEnvironment,
  resolveAppearance,
  saveAppearance,
  writeAppearance,
  type AppearanceEnvironment,
  type AppearanceSettings,
  type ColorScheme,
  type Density,
  type DeviceClass,
  type Orientation,
  type ResolvedAppearance,
} from "../utils/appearance";

interface AppearanceContextValue {
  /** What the user chose (stored per device). */
  settings: AppearanceSettings;
  /** What is actually painted, after system preferences and fallbacks. */
  resolved: ResolvedAppearance;
  scheme: ColorScheme;
  device: DeviceClass;
  density: Density;
  orientation: Orientation;
  update(patch: Partial<Omit<AppearanceSettings, "v">>): void;
  reset(): void;
  /** Cheap live update while a Blur slider is dragged; call `update` on release. */
  previewBlur(slider: number): void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** Media queries that change the resolved appearance when the system flips them. */
const WATCHED_QUERIES = [
  MEDIA_QUERIES.dark,
  MEDIA_QUERIES.reducedTransparency,
  MEDIA_QUERIES.moreContrast,
  MEDIA_QUERIES.forcedColors,
  MEDIA_QUERIES.finePointer,
];

function viewportKey(env: AppearanceEnvironment): string {
  const orientation = env.width >= env.height ? "landscape" : "portrait";
  return `${classifyDevice(env.width, env.height, env.finePointer)}:${orientation}`;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(() => loadAppearance());
  const [env, setEnv] = useState<AppearanceEnvironment>(() => readEnvironment());

  useEffect(() => {
    const refresh = () => setEnv(readEnvironment());
    const lists = WATCHED_QUERIES.map((query) => window.matchMedia(query));
    lists.forEach((list) => list.addEventListener("change", refresh));

    // Resizes only matter when they cross a device-class or orientation boundary;
    // rewriting every variable on each resize event would restyle the whole page.
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readEnvironment();
        setEnv((current) => (viewportKey(current) === viewportKey(next) ? current : next));
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      lists.forEach((list) => list.removeEventListener("change", refresh));
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  const resolved = useMemo(() => resolveAppearance(settings, env), [settings, env]);

  // Before paint, so a theme or tint change never flashes the old colours.
  useLayoutEffect(() => {
    writeAppearance(resolved);
  }, [resolved]);

  useEffect(() => {
    saveAppearance(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<Omit<AppearanceSettings, "v">>) => {
    setSettings((current) => parseAppearance({ ...current, ...patch }));
  }, []);
  const reset = useCallback(() => setSettings({ ...DEFAULT_APPEARANCE }), []);
  const previewBlur = useCallback((slider: number) => writeBlurPreview(slider), []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      settings,
      resolved,
      scheme: resolved.scheme,
      device: resolved.device,
      density: resolved.density,
      orientation: resolved.orientation,
      update,
      reset,
      previewBlur,
    }),
    [settings, resolved, update, reset, previewBlur],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance requires AppearanceProvider");
  return value;
}

/** Layout branching for screen packages: phone UI vs tablet/laptop UI. */
export function useDeviceClass(): { device: DeviceClass; density: Density; orientation: Orientation } {
  const { device, density, orientation } = useAppearance();
  return { device, density, orientation };
}
