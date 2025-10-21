import { ReactNode } from "react";
import { FileText, LayoutDashboard, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                <FileText className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">UmsatzsteuerApp</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive("/")
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <LayoutDashboard className="inline h-4 w-4 mr-2" />
                Dashboard
              </Link>
              <Link
                to="/wizard"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive("/wizard")
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <FileText className="inline h-4 w-4 mr-2" />
                UStVA Assistent
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="rounded-md bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning border border-warning/20">
              ENV: MVP Mock
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary transition-colors">
              <Settings className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container px-4 py-8">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
