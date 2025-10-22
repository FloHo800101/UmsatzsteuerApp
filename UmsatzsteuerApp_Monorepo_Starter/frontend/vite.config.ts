import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Hinweis: lovable-tagger nur in DEV verwenden
export default defineConfig(async ({ mode }) => {
  const plugins = [react()];

  if (mode === "development") {
    try {
      const mod = await import("lovable-tagger");
      if (mod?.componentTagger) {
        plugins.push(mod.componentTagger());
      }
    } catch {
      // Paket ist außerhalb von Lovable evtl. nicht vorhanden -> ignorieren
    }
  }

  // Robust: zuerst VITE_BASE (vom Workflow), sonst fixer Fallback
  const repoBase = process.env.VITE_BASE ?? "/UmsatzsteuerApp/";

  return {
    base: mode === "production" ? repoBase : "/",
    server: {
      host: "::",
      port: 8080,
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
