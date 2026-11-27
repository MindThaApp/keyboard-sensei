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
import { I18nProvider, initI18n } from "./i18n";
import ExperienceSync from "./contexts/ExperienceSync";
import { installNativeBackButton } from "./native/nativeShell";
import { isNativeApp } from "./native/platform";
import "./index.css";

startMonitoring();

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Load the device language first so the first paint is already translated.
void initI18n().finally(() => root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppearanceProvider>
        <ExperienceProvider>
          <BrowserRouter>
            <AuthProvider>
              <MonitoringBridge />
              <ExperienceSync />
              <MidiProvider>
                <I18nProvider>
                  <App />
                </I18nProvider>
              </MidiProvider>
            </AuthProvider>
          </BrowserRouter>
        </ExperienceProvider>
      </AppearanceProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
));

installNativeBackButton();

// The Android app ships its pages inside the APK, so an offline-shell service
// worker would only add a second, stale copy of them.
if (import.meta.env.PROD && !isNativeApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
