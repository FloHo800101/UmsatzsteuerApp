import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Send, Download, AlertCircle, RefreshCw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StepSubmitProps {
  period: { month: string; year: string };
}

type SubmissionStatus = "idle" | "pending" | "ack" | "nack";

const StepSubmit = ({ period }: StepSubmitProps) => {
  const [isApproved, setIsApproved] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();

  const handleApprove = () => {
    setIsApproved(true);
    toast({
      title: "Periode freigegeben",
      description: "Die UStVA ist jetzt bereit zum Versand.",
    });
  };

  const handleElsterSubmit = () => {
    setSubmissionStatus("pending");
    setErrorMessage("");

    // Simulate ELSTER API call with 80/20 ACK/NACK ratio
    setTimeout(() => {
      const isSuccess = Math.random() < 0.8;
      
      if (isSuccess) {
        setSubmissionStatus("ack");
        toast({
          title: "ELSTER Versand erfolgreich",
          description: "Ihre UStVA wurde erfolgreich übermittelt. (ACK)",
        });
      } else {
        setSubmissionStatus("nack");
        setErrorMessage("Fehler bei der Übermittlung: Ungültige Steuernummer oder technischer Fehler.");
        toast({
          title: "ELSTER Versand fehlgeschlagen",
          description: "Die Übermittlung ist fehlgeschlagen. Bitte versuchen Sie es erneut. (NACK)",
          variant: "destructive",
        });
      }
    }, 2000);
  };

  const handleRetry = () => {
    handleElsterSubmit();
  };

  const handleExport = (format: "csv" | "json") => {
    toast({
      title: "Export wird erstellt",
      description: `Die ${format.toUpperCase()}-Datei wird heruntergeladen...`,
    });

    // Simulate file download
    setTimeout(() => {
      const filename = `ustva_${period.month}_${period.year}.${format}`;
      toast({
        title: "Export erfolgreich",
        description: `${filename} wurde heruntergeladen.`,
      });
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className={isApproved ? "border-success" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isApproved ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <AlertCircle className="h-5 w-5 text-warning" />
            )}
            Zusammenfassung
          </CardTitle>
          <CardDescription>
            Periode: {period.month}/{period.year}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Belege</div>
              <div className="text-lg font-semibold">3 Dokumente</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Einträge</div>
              <div className="text-lg font-semibold">4 Positionen</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Netto gesamt</div>
              <div className="text-lg font-semibold">€198.79</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">USt gesamt</div>
              <div className="text-lg font-semibold text-primary">€33.57</div>
            </div>
          </div>

          {!isApproved && (
            <Button onClick={handleApprove} className="w-full gap-2" size="lg">
              <CheckCircle2 className="h-5 w-5" />
              Periode jetzt freigeben
            </Button>
          )}

          {isApproved && (
            <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="text-sm font-medium">Periode freigegeben</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ELSTER Submission */}
      <Card className={submissionStatus === "ack" ? "border-success" : submissionStatus === "nack" ? "border-destructive" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            ELSTER Versand (Mock)
          </CardTitle>
          <CardDescription>
            Übermittlung der UStVA an das Finanzamt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {submissionStatus === "idle" && (
            <Button
              onClick={handleElsterSubmit}
              disabled={!isApproved}
              className="w-full gap-2"
              size="lg"
            >
              <Send className="h-5 w-5" />
              An ELSTER senden
            </Button>
          )}

          {submissionStatus === "pending" && (
            <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Übermittlung läuft...</span>
            </div>
          )}

          {submissionStatus === "ack" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Erfolgreich übermittelt (ACK)</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Transfer-Ticket: MOCK-{Date.now()}
                  </div>
                </div>
              </div>
              <Badge className="bg-success">Status: Gesendet & Bestätigt</Badge>
            </div>
          )}

          {submissionStatus === "nack" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Übermittlung fehlgeschlagen (NACK)</div>
                  <div className="text-xs text-muted-foreground mt-1">{errorMessage}</div>
                </div>
              </div>
              <Button onClick={handleRetry} variant="destructive" className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Erneut versuchen
              </Button>
            </div>
          )}

          {!isApproved && (
            <div className="text-sm text-muted-foreground text-center">
              Bitte geben Sie die Periode zuerst frei.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tax Advisor Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            An Steuerberater senden
          </CardTitle>
          <CardDescription>
            Export der Daten als CSV oder JSON
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => handleExport("csv")}
              disabled={!isApproved}
              variant="outline"
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              entries.csv
            </Button>
            <Button
              onClick={() => handleExport("json")}
              disabled={!isApproved}
              variant="outline"
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              ustva_summary.json
            </Button>
          </div>

          {!isApproved && (
            <div className="text-sm text-muted-foreground text-center">
              Bitte geben Sie die Periode zuerst frei.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="p-4 bg-muted/50 rounded-lg text-sm">
        <div className="font-medium mb-1">💡 Hinweis zum MVP</div>
        <div className="text-muted-foreground">
          Dies ist ein Mock-Prototyp. Die ELSTER-Übermittlung simuliert ACK (80%) / NACK (20%) Antworten.
          In der Production-Version würde hier die echte ELSTER-Schnittstelle angebunden.
        </div>
      </div>
    </div>
  );
};

export default StepSubmit;
