import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import WizardWrapper from "./pages/WizardWrapper";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * GitHub Pages: Die App liegt unter /UmsatzsteuerApp/.
 * Vite setzt import.meta.env.BASE_URL entsprechend der vite.config.ts (z. B. "/UmsatzsteuerApp/").
 * Wir entfernen den evtl. abschließenden Slash, damit React Router einen sauberen basename erhält.
 * - Dev (base="/")  -> basename = ""
 * - Prod (base="/UmsatzsteuerApp/") -> basename = "/UmsatzsteuerApp"
 */
const BASENAME = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={BASENAME}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/wizard" element={<WizardWrapper />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
