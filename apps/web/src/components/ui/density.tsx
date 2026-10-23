import { createContext, useContext, useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type Density = "regular" | "compact";

const DensityContext = createContext<Density | null>(null);

function readRootDensity(): Density {
  if (typeof document === "undefined") return "regular";
  return document.documentElement.getAttribute("data-density") === "compact" ? "compact" : "regular";
}

/**
 * The density the kit should render in: the nearest DensityScope, otherwise the
 * `data-density` attribute on <html> (set by the appearance engine from the viewport).
 * Sizing itself is pure CSS through the --ui-* tokens; this only drives the few
 * behaviours that change structure (Sheet height, Toolbar overflow, scrollable segments).
 */
export function useDensity(): Density {
  const scoped = useContext(DensityContext);
  const [root, setRoot] = useState<Density>(readRootDensity);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => setRoot(readRootDensity()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-density"] });
    setRoot(readRootDensity());
    return () => observer.disconnect();
  }, []);

  return scoped ?? root;
}

interface DensityScopeProps extends HTMLAttributes<HTMLDivElement> {
  density: Density;
  children?: ReactNode;
}

/** Pins a subtree to one density (used by KitPreview to show both side by side). */
export function DensityScope({ density, className, children, ...rest }: DensityScopeProps) {
  return (
    <DensityContext.Provider value={density}>
      <div {...rest} data-density={density} className={cx("ks-density-scope", className)}>
        {children}
      </div>
    </DensityContext.Provider>
  );
}
