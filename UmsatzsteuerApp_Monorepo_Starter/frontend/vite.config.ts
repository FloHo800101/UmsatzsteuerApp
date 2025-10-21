import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Hinweis: lovable-tagger nur in DEV verwenden (und dynamisch importieren),
// damit der Build auf GitHub Pages ohne das Paket funktioniert.
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

  return {
    // WICHTIG für GitHub Pages: REPO-Namen exakt einsetzen
    base: mode === "production" ? "/UmsatzsteuerApp/" : "/",

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
