import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// Public (publishable) backend config. Safe to ship in the client bundle.
// Used as a fallback so native/CI builds never produce a bundle that is
// missing auth configuration when no .env file is present.
const FALLBACK_SUPABASE_PROJECT_ID = "obnmevwjgleelpvmstjd";
const FALLBACK_SUPABASE_URL = "https://obnmevwjgleelpvmstjd.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ibm1ldndqZ2xlZWxwdm1zdGpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1OTk3NDksImV4cCI6MjEwMjE3NTc0OX0.IonN77XqygsKZPxCqa0h_RnxknWa5eoKe4O_KD-5Oos";

// Legacy (pre-migration) backend. Production bundles must never ship this.
const LEGACY_SUPABASE_PROJECT_ID = "ogmhspwsvzvwqoavlxjn";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isLegacy =
    mode === "production" &&
    (env.VITE_SUPABASE_PROJECT_ID === LEGACY_SUPABASE_PROJECT_ID ||
      (env.VITE_SUPABASE_URL ?? "").includes(LEGACY_SUPABASE_PROJECT_ID));

  const supabaseUrl = (!isLegacy && env.VITE_SUPABASE_URL) || FALLBACK_SUPABASE_URL;
  const supabaseKey = (!isLegacy && env.VITE_SUPABASE_PUBLISHABLE_KEY) || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  const supabaseProjectId = (!isLegacy && env.VITE_SUPABASE_PROJECT_ID) || FALLBACK_SUPABASE_PROJECT_ID;

  if (isLegacy) {
    console.warn("[build] Ignoring legacy Supabase env values; using production Cloud project.");
  }


  return {
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "1.0.0"),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mcpPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return "vendor-react";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  };
});
