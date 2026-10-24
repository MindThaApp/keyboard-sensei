import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Set KS_ANDROID_DEV_API=1 when running `cap sync` for a debug build that talks to
 * a plain-HTTP local API (the emulator's http://10.0.2.2:3112). It lets the
 * https://localhost page call an http:// API. Release builds refuse to build while
 * this is on (see android/app/build.gradle, checkReleaseCapacitorConfig), so a
 * stale dev sync can never ship.
 */
const devApi = process.env.KS_ANDROID_DEV_API === "1";

const config: CapacitorConfig = {
  appId: "com.midivory.app",
  appName: "Midivory",
  // The production build of apps/web. Build it first (`pnpm build:web`).
  webDir: "../web/dist",
  server: {
    // The page is served from https://localhost inside the app. Add that origin to
    // the API's CORS_ORIGIN list.
    androidScheme: "https",
  },
  android: {
    allowMixedContent: devApi,
    // Deliberately not webContentsDebuggingEnabled: Capacitor already turns
    // WebView debugging on for debug builds only.
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#17171a",
      showSpinner: false,
    },
    SystemBars: {
      // The WebView keeps the page out from under the status and gesture bars:
      // padding on older WebViews, the page's own viewport (no viewport-fit=cover)
      // on newer ones. The piano can never sit behind the gesture bar.
      insetsHandling: "native",
    },
  },
};

export default config;
