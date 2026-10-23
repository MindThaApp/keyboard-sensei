import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { MidiProvider } from "./components/midi/MidiContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { installNativeBackButton } from "./native/nativeShell";
import { isNativeApp } from "./native/platform";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider><BrowserRouter><AuthProvider><MidiProvider><App /></MidiProvider></AuthProvider></BrowserRouter></ThemeProvider>
  </React.StrictMode>,
);

installNativeBackButton();

// The Android app ships its pages inside the APK, so an offline-shell service
// worker would only add a second, stale copy of them.
if (import.meta.env.PROD && !isNativeApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
