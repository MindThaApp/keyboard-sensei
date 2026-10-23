import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { App } from "@capacitor/app";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { isNativeApp } from "./platform";
import { isPracticeRoute } from "./practiceRoutes";

/**
 * Android's back button walks the router's history (react-router listens to
 * popstate), and leaves the app only from the first page.
 */
export function installNativeBackButton(): void {
  if (!isNativeApp()) return;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}

/** Keeps the screen awake while a practice route is open (Android app only). */
export function useNativeKeepAwake(): void {
  const { pathname } = useLocation();
  const awake = isNativeApp() && isPracticeRoute(pathname);
  useEffect(() => {
    if (!awake) return;
    void KeepAwake.keepAwake().catch(() => {});
    return () => {
      void KeepAwake.allowSleep().catch(() => {});
    };
  }, [awake]);
}
