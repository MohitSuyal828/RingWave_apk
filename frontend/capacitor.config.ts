import type { CapacitorConfig } from "@capacitor/cli";

// ─── RingWave Android app config ───────────────────────────────────────────
//
// appId follows Java package-name convention (reverse domain) — Google
// Play requires this to be globally unique and, once published, it can
// never change. "com.ringwave.app" is a placeholder; if you don't own the
// ringwave.com domain, change this to something you actually control
// before publishing (e.g. com.yourcompany.ringwave) — Android treats this
// as the app's permanent identity, not just a display name.
const config: CapacitorConfig = {
  appId: "com.ringwave.app",
  appName: "RingWave",
  webDir: "dist",

  server: {
    // IMPORTANT: androidScheme "https" (not Capacitor's default "http")
    // is required for WebRTC (getUserMedia) and the Web Crypto APIs
    // (subtle.generateKey, IndexedDB key storage) used by the call
    // verification feature — both are restricted to secure contexts, and
    // a plain "http" webview origin is not one. This is not optional.
    androidScheme: "https",
  },

  android: {
    // Uses the system WebView already on the device rather than bundling
    // a fixed Chromium build — smaller APK, and picks up WebView security
    // patches via normal Android system/Play Store updates rather than
    // requiring an app update for every WebView CVE.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
