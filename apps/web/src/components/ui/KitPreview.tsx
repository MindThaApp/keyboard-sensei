/**
 * Dev-only gallery of the component kit, shown at both densities side by side.
 * WP1 registers the route; nothing in production imports this file.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { MemoryRouter, useInRouterContext } from "react-router-dom";
import "./ui.css";
import { useAppearance } from "../../contexts/AppearanceContext";
import { Button } from "./Button";
import { Card } from "./Card";
import { Badge, Chip } from "./Chip";
import { DensityScope, type Density } from "./density";
import { GlassSurface } from "./GlassSurface";
import { InfoTip } from "./InfoTip";
import { ListGroup, ListRow } from "./List";
import { ProgressRing } from "./ProgressRing";
import { SegmentedControl } from "./SegmentedControl";
import { Sheet } from "./Sheet";
import { Slider } from "./Slider";
import { Stepper } from "./Stepper";
import { EmptyState, ErrorState, Skeleton } from "./States";
import { TabBar, type TabBarItem } from "./TabBar";
import { Toast, ToastProvider, useToast } from "./Toast";
import { Toggle } from "./Toggle";
import { Toolbar } from "./Toolbar";

const icon = (path: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const TABS: TabBarItem[] = [
  { to: "/", label: "Today", icon: icon("M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"), end: true },
  { to: "/learn", label: "Learn", icon: icon("M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6") },
  { to: "/play", label: "Play", icon: icon("M8 5l11 7-11 7z") },
  { to: "/progress", label: "Progress", icon: icon("M4 20V10M10 20V4M16 20v-7M22 20H2"), badge: 3 },
];

const BANNER: CSSProperties = {
  background: "linear-gradient(100deg, #b4323e 0%, #e0861c 35%, #f5b800 50%, #7f8c8d 75%, #2f6fd6 100%)",
  borderRadius: 22,
  padding: 24,
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "center",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, font: "600 var(--ui-fs-body)/var(--ui-lh-body) var(--font-text)" }}>{title}</h2>
      {children}
    </Card>
  );
}

function TabBarDemo() {
  const bars = (
    <div style={{ position: "relative", minHeight: 76 }}>
      <TabBar items={TABS} placement="inline" aria-label="Demo navigation" />
    </div>
  );
  // The app already provides a Router; the standalone harness does not.
  return useInRouterContext() ? bars : <MemoryRouter>{bars}</MemoryRouter>;
}

function Sections({ density }: { density: Density }) {
  const toast = useToast();
  const [hand, setHand] = useState<"left" | "right" | "both">("right");
  const [level, setLevel] = useState("Full");
  const [speed, setSpeed] = useState(70);
  const [bars, setBars] = useState(4);
  const [wait, setWait] = useState(true);
  const [namesOn, setNamesOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<"medium" | "large" | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Button">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button variant="filled">Filled</Button>
          <Button variant="tinted">Tinted</Button>
          <Button variant="gray">Gray</Button>
          <Button variant="plain">Plain</Button>
          <Button variant="gray" disabled>
            Disabled
          </Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button size="sm" variant="tinted">
            Small
          </Button>
          <Button
            variant="gray"
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            Loading
          </Button>
          <Button variant="tinted" icon={<span aria-hidden="true">{"♪"}</span>}>
            With icon
          </Button>
        </div>
        <Button size="lg" variant="filled">
          Start playing
        </Button>
      </Section>

      <Section title="Segmented control">
        <SegmentedControl
          aria-label="Hands"
          value={hand}
          onChange={setHand}
          options={[
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
            { value: "both", label: "Both" },
          ]}
        />
        <SegmentedControl
          aria-label="Version"
          block
          value={level}
          onChange={setLevel}
          options={["Full", "Fewer notes", "Tune + bass", "Just the tune", "Single notes"].map((v) => ({ value: v, label: v }))}
        />
      </Section>

      <Section title="Toggle, stepper">
        <Toggle label="Wait for me" description="The song pauses until you press the right key." checked={wait} onChange={setWait} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>Loop bars</span>
          <Stepper aria-label="loop bars" value={bars} onChange={setBars} min={1} max={16} formatValue={(v) => `${v} bars`} />
        </div>
      </Section>

      <Section title="Slider">
        <Slider aria-label="Speed" min={25} max={200} step={5} value={speed} onChange={setSpeed} formatValue={(v) => `${v}%`} />
      </Section>

      <Section title="Chip, badge, info tip">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Chip>70% speed</Chip>
          <Chip tone="tint">Up next</Chip>
          <Chip tone="success" icon={"✓"}>
            Done
          </Chip>
          <Badge count={3} />
          <Badge count={120} />
          <span>
            Look-ahead
            <InfoTip>Seconds of upcoming notes shown. More is easier to read.</InfoTip>
          </span>
        </div>
      </Section>

      <Section title="Progress ring">
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <ProgressRing value={0.6} label="6" sublabel="of 10" aria-label="6 of 10 minutes" />
          <ProgressRing value={0.25} size={56} stroke={6} label="25%" aria-label="25 percent" />
        </div>
      </Section>

      <Section title="Inset grouped list">
        <ListGroup header="Settings" footer="Rows group related controls.">
          <ListRow icon={"⌨"} iconColor="var(--success)" title="Keyboard" accessory="Not connected" onClick={() => undefined} />
          <ListRow icon={"♪"} iconColor="#ff9500" title="Sound" subtitle="Grand piano" accessory="chevron" onClick={() => undefined} />
          <ListRow
            icon={"◑"}
            iconColor="#8e8e93"
            title="Show note names"
            accessory={<Toggle hideLabel label="Show note names" checked={namesOn} onChange={setNamesOn} />}
          />
        </ListGroup>
      </Section>

      <Section title="Sheet, toast">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button variant="tinted" onClick={() => setSheet("medium")}>
            Open sheet
          </Button>
          <Button variant="gray" onClick={() => toast.show({ tone: "reward", title: "+45 points", body: "Achievement: Flawless" })}>
            Show toast
          </Button>
          <Button variant="gray" onClick={() => toast.show({ tone: "error", title: "Could not save", action: { label: "Retry", onClick: () => undefined } })}>
            Error toast
          </Button>
        </div>
        <Toast tone="reward" title="+45 points" body="Achievement: Flawless" duration={0} onDismiss={() => undefined} className="" />
        <Sheet
          open={sheet !== null}
          onClose={() => setSheet(null)}
          detents={["medium", "large"]}
          title="Practice settings"
          leading={
            <Button variant="plain" onClick={() => setSheet(null)}>
              Cancel
            </Button>
          }
          trailing={
            <Button variant="plain" data-autofocus onClick={() => setSheet(null)}>
              Done
            </Button>
          }
        >
          <ListGroup>
            <ListRow title="Speed" accessory={`${speed}%`} />
            <ListRow title="Wait for me" accessory={<Toggle hideLabel label="Wait for me" checked={wait} onChange={setWait} />} />
          </ListGroup>
        </Sheet>
      </Section>

      <Section title="Toolbar">
        <div style={{ ...BANNER, padding: 16, justifyContent: "flex-start" }}>
          <Toolbar placement="floating" aria-label="Playback" maxInline={density === "compact" ? 2 : undefined} className="">
            <Button variant="plain" aria-label="Back">
              {"◀"}
            </Button>
            <Button variant="tinted">Play</Button>
            <Button variant="plain">Loop</Button>
            <Button variant="plain">Metronome</Button>
          </Toolbar>
        </div>
      </Section>

      <Section title="Tab bar">
        <TabBarDemo />
      </Section>

      <Section title="States">
        <EmptyState title="No songs yet" message="Import a song to see it here." action={<Button variant="tinted">Import</Button>} />
        <ErrorState title="Could not load progress" message="Check your connection and try again." action={<Button variant="gray">Try again</Button>} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="Loading placeholder">
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
        </div>
      </Section>
    </div>
  );
}

function ThemeSwitch() {
  const { scheme, update } = useAppearance();
  return (
    <SegmentedControl
      aria-label="Theme"
      value={scheme}
      onChange={(theme) => update({ theme })}
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}

export default function KitPreview() {
  return (
    <ToastProvider>
      <div
        style={{
          minHeight: "100vh",
          padding: "24px 16px 120px",
          background: "var(--bg)",
          color: "var(--label)",
          fontFamily: "var(--font-text)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, font: "800 36px/42px var(--font-display)" }}>Component kit</h1>
              <p style={{ margin: "4px 0 0", color: "var(--label-2a)" }}>Regular and compact density, side by side.</p>
            </div>
            <ThemeSwitch />
          </header>

          <div style={BANNER}>
            <GlassSurface style={{ padding: "14px 24px", borderRadius: 999, font: "600 17px/22px var(--font-text)" }}>
              <span className="glass-text">Regular glass</span>
            </GlassSurface>
            <GlassSurface variant="clear-dark" style={{ padding: "14px 24px", borderRadius: 999, font: "600 17px/22px var(--font-text)" }}>
              <span className="glass-text">Clear glass + dimming</span>
            </GlassSurface>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 24, alignItems: "start" }}>
            <DensityScope density="regular">
              <h2 style={{ margin: "0 0 12px", font: "700 22px/28px var(--font-display)" }}>Regular density</h2>
              <Sections density="regular" />
            </DensityScope>
            <DensityScope density="compact" style={{ maxWidth: 420 }}>
              <h2 style={{ margin: "0 0 12px", font: "700 22px/28px var(--font-display)" }}>Compact density</h2>
              <Sections density="compact" />
            </DensityScope>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
