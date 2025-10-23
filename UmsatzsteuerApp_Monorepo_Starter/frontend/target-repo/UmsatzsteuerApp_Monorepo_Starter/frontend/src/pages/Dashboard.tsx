import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Plus,
  TrendingUp,
  Calendar
} from "lucide-react";
import { Link } from "react-router-dom";

const Dashboard = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Übersicht Ihrer Umsatzsteuervoranmeldungen</p>
        </div>
        <Link to="/wizard">
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Neue UStVA
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offene Perioden</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">3</div>
            <p className="text-xs text-muted-foreground mt-1">
              2 in Bearbeitung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Belege hochgeladen</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">24</div>
            <p className="text-xs text-muted-foreground mt-1">
              Diesen Monat
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Freigegeben</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">12</div>
            <p className="text-xs text-muted-foreground mt-1">
              Letzte 3 Monate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gesamt USt (2024)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">€8.450</div>
            <p className="text-xs text-muted-foreground mt-1">
              7% + 19% kombiniert
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Periods */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Aktuelle Perioden
            </CardTitle>
            <CardDescription>Übersicht der zu bearbeitenden Perioden</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
              <div>
                <div className="font-semibold">September 2025</div>
                <div className="text-sm text-muted-foreground">6 Belege · 12 Einträge</div>
              </div>
              <Badge className="bg-warning/10 text-warning hover:bg-warning/20 border-warning/20">
                In Bearbeitung
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
              <div>
                <div className="font-semibold">August 2025</div>
                <div className="text-sm text-muted-foreground">8 Belege · 16 Einträge</div>
              </div>
              <Badge className="bg-success/10 text-success hover:bg-success/20 border-success/20">
                Freigegeben
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
              <div>
                <div className="font-semibold">Juli 2025</div>
                <div className="text-sm text-muted-foreground">4 Belege · 9 Einträge</div>
              </div>
              <Badge className="bg-muted text-muted-foreground border-border">
                Gesendet
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Letzte Aktivitäten
            </CardTitle>
            <CardDescription>Audit-Log der letzten Aktionen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">Periode freigegeben</div>
                <div className="text-muted-foreground">August 2025 · vor 2 Stunden</div>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <Upload className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">3 Belege hochgeladen</div>
                <div className="text-muted-foreground">September 2025 · vor 5 Stunden</div>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">Korrektur vorgenommen</div>
                <div className="text-muted-foreground">September 2025 · vor 1 Tag</div>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">ELSTER ACK empfangen</div>
                <div className="text-muted-foreground">Juli 2025 · vor 2 Tagen</div>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">Export an Steuerberater</div>
                <div className="text-muted-foreground">Juli 2025 · vor 2 Tagen</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backlog Features (Deactivated) */}
      <Card className="border-dashed opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Geplante Features (Backlog)
          </CardTitle>
          <CardDescription>Diese Funktionen sind in Planung und derzeit deaktiviert</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
              <div className="font-medium text-sm">Multi-Tenant Portal</div>
              <div className="text-xs text-muted-foreground mt-1">Steuerberater + Mandanten</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
              <div className="font-medium text-sm">E-Mail Import</div>
              <div className="text-xs text-muted-foreground mt-1">Automatischer Beleg-Eingang</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
              <div className="font-medium text-sm">Drive Integration</div>
              <div className="text-xs text-muted-foreground mt-1">Cloud-Speicher Anbindung</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
              <div className="font-medium text-sm">Bank-Abgleich</div>
              <div className="text-xs text-muted-foreground mt-1">Automatisches Matching</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
              <div className="font-medium text-sm">GoBD/DSGVO Center</div>
              <div className="text-xs text-muted-foreground mt-1">Compliance Management</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
              <div className="font-medium text-sm">Spezialfälle</div>
              <div className="text-xs text-muted-foreground mt-1">§13b, EU, Drittland</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
