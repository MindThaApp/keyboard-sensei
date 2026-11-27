// Must stay the first import: brings local storage up to date before anything reads it.
import "./state/migrateStorageOnStartup";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { MidiProvider } from "./components/midi/MidiContext";
import { AuthProvider } from "./contexts/AuthContext";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { ExperienceProvider } from "./contexts/ExperienceContext";
import { monitoring, startMonitoring } from "./monitoring";
import { AppErrorBoundary, MonitoringBridge } from "./monitoring/MonitoringBridge";
import TunerSync from "./components/tuner/TunerSync";
import ExperienceSync from "./contexts/ExperienceSync";
import { InstrumentProvider } from "./contexts/InstrumentContext";
import InstrumentSync from "./contexts/InstrumentSync";
import OfflineStatusBanner from "./offline/OfflineStatusBanner";
import { installNativeBackButton } from "./native/nativeShell";
import { isNativeApp, isWindowsApp } from "./native/platform";
import "./index.css";

startMonitoring();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppearanceProvider>
        <ExperienceProvider>
          <InstrumentProvider>
          <BrowserRouter>
            <AuthProvider>
              <MonitoringBridge />
              <ExperienceSync />
              <InstrumentSync />
              <TunerSync />
              <OfflineStatusBanner />
              <MidiProvider>
                <App />
              </MidiProvider>
            </AuthProvider>
          </BrowserRouter>
          </InstrumentProvider>
        </ExperienceProvider>
      </AppearanceProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);

installNativeBackButton();

// The Android and Windows apps ship their pages inside the package, so an
// offline-shell service worker would only add a second, stale copy of them.
if (import.meta.env.PROD && !isNativeApp() && !isWindowsApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
