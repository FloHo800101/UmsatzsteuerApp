import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import WizardWrapper from "./pages/WizardWrapper";
import NotFound from "./pages/NotFound";
import Belege from "./pages/Belege"; // ✨ neu

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* Wichtig für GitHub Pages */}
      <BrowserRouter basename="/UmsatzsteuerApp">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/wizard" element={<WizardWrapper />} />
          <Route path="/belege" element={<Belege />} /> {/* ✨ neu */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
