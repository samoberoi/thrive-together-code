import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hyperrevamp.bbdo",
  appName: "BBDO",
  webDir: "dist",
  // Serve the WebView from a real-looking https origin so YouTube's IFrame API
  // accepts the Referer header (otherwise it fails with Error 153 —
  // embedder.identity.missing.referrer). Applies to both platforms.
  server: {
    hostname: "app.byebyediabetes.com",
    androidScheme: "https",
    iosScheme: "https",
  },
  // NOTE: No `server.url` — the app runs the locally bundled build from `dist/`,
  // so users get a native app experience with no Lovable sandbox flash.
  // If you want live hot-reload during development, temporarily add:
  //   server: { url: "https://325598b4-464e-4467-b131-0a537fd2ecec.lovableproject.com?forceHideBadge=true", cleartext: true }
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#0B1220",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      // FIT_CENTER preserves aspect ratio and avoids the zoomed/blurred logo
      // seen with the default CENTER_CROP scale on Android.
      androidScaleType: "FIT_CENTER",
    },
    LocalNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
  ios: {
    preferredContentMode: "mobile",
    backgroundColor: "#0B1220",
  },
  android: {
    backgroundColor: "#0B1220",
    // The Aparajita biometric plugin remains available to iOS, but must never
    // be packaged on Android. Its transparent AuthActivity can terminate the
    // host task after fingerprint approval on affected Android versions.
    includePlugins: [
      "@capacitor/app",
      "@capacitor/filesystem",
      "@capacitor/local-notifications",
      "@capacitor/preferences",
      "@capacitor/push-notifications",
      "@capacitor/share",
      "@capawesome/capacitor-badge",
      "capacitor-health-connect",
    ],
  },
};

export default config;
