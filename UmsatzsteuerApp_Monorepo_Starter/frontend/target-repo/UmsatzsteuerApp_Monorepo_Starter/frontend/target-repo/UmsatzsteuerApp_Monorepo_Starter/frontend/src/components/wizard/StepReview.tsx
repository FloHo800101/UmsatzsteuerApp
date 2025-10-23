import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Entry {
  id: string;
  date: string;
  partner: string;
  serviceType: string;
  kenziffer: string;
  net: number;
  vatRate: 7 | 19;
  vat: number;
  gross: number;
  skr03: string;
  skr04: string;
  source: string;
}

interface StepReviewProps {
  period: { month: string; year: string };
}

const StepReview = ({ period }: StepReviewProps) => {
  const [entries, setEntries] = useState<Entry[]>([
    {
      id: "1",
      date: "2025-09-15",
      partner: "Amazon Web Services",
      serviceType: "Hosting",
      kenziffer: "81",
      net: 89.00,
      vatRate: 19,
      vat: 16.91,
      gross: 105.91,
      skr03: "4910",
      skr04: "6805",
      source: "Rechnung_Amazon_2025-09-15.pdf",
    },
    {
      id: "2",
      date: "2025-09-10",
      partner: "Deutsche Telekom",
      serviceType: "Telefon & Internet",
      kenziffer: "81",
      net: 49.99,
      vatRate: 19,
      vat: 9.50,
      gross: 59.49,
      skr03: "4910",
      skr04: "6805",
      source: "Beleg_Telekom_089.pdf",
    },
    {
      id: "3",
      date: "2025-09-08",
      partner: "Büro Express GmbH",
      serviceType: "Büromaterial",
      kenziffer: "81",
      net: 24.80,
      vatRate: 19,
      vat: 4.71,
      gross: 29.51,
      skr03: "4930",
      skr04: "6815",
      source: "Quittung_Bürobedarf.jpg",
    },
    {
      id: "4",
      date: "2025-09-05",
      partner: "Buch & Mehr",
      serviceType: "Fachliteratur",
      kenziffer: "93",
      net: 35.00,
      vatRate: 7,
      vat: 2.45,
      gross: 37.45,
      skr03: "4945",
      skr04: "6825",
      source: "Quittung_Bürobedarf.jpg",
    },
  ]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Entry | null>(null);
  const { toast } = useToast();

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditData({ ...entry });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = () => {
    if (editData) {
      // Recalculate VAT and gross based on net and vatRate
      const vat = Number((editData.net * editData.vatRate / 100).toFixed(2));
      const gross = Number((editData.net + vat).toFixed(2));
      
      const updatedEntry = { ...editData, vat, gross };
      
      setEntries(prev => prev.map(e => e.id === editData.id ? updatedEntry : e));
      setEditingId(null);
      setEditData(null);
      
      toast({
        title: "Eintrag aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
    }
  };

  const totals = entries.reduce(
    (acc, entry) => ({
      net: acc.net + entry.net,
      vat7: acc.vat7 + (entry.vatRate === 7 ? entry.vat : 0),
      vat19: acc.vat19 + (entry.vatRate === 19 ? entry.vat : 0),
      vat: acc.vat + entry.vat,
      gross: acc.gross + entry.gross,
    }),
    { net: 0, vat7: 0, vat19: 0, vat: 0, gross: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4 rounded-lg bg-secondary border border-border">
          <div className="text-sm text-muted-foreground mb-1">Netto gesamt</div>
          <div className="text-2xl font-bold">€{totals.net.toFixed(2)}</div>
        </div>
        <div className="p-4 rounded-lg bg-secondary border border-border">
          <div className="text-sm text-muted-foreground mb-1">USt 7%</div>
          <div className="text-2xl font-bold">€{totals.vat7.toFixed(2)}</div>
        </div>
        <div className="p-4 rounded-lg bg-secondary border border-border">
          <div className="text-sm text-muted-foreground mb-1">USt 19%</div>
          <div className="text-2xl font-bold">€{totals.vat19.toFixed(2)}</div>
        </div>
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
          <div className="text-sm text-muted-foreground mb-1">Brutto gesamt</div>
          <div className="text-2xl font-bold text-primary">€{totals.gross.toFixed(2)}</div>
        </div>
      </div>

      {/* Entries Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Datum</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Leistungsart</TableHead>
                <TableHead className="w-[80px]">Kz</TableHead>
                <TableHead className="text-right">Netto €</TableHead>
                <TableHead className="text-center w-[90px]">USt-Satz</TableHead>
                <TableHead className="text-right">USt €</TableHead>
                <TableHead className="text-right">Brutto €</TableHead>
                <TableHead className="w-[80px]">SKR03</TableHead>
                <TableHead className="w-[80px]">SKR04</TableHead>
                <TableHead className="w-[100px]">Quelle</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isEditing = editingId === entry.id;
                const data = isEditing && editData ? editData : entry;
                
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-sm">{data.date}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={data.partner}
                          onChange={(e) => setEditData({ ...data, partner: e.target.value })}
                          className="h-8"
                        />
                      ) : (
                        <div className="font-medium">{data.partner}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={data.serviceType}
                          onChange={(e) => setEditData({ ...data, serviceType: e.target.value })}
                          className="h-8"
                        />
                      ) : (
                        data.serviceType
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={data.kenziffer}
                          onChange={(e) => setEditData({ ...data, kenziffer: e.target.value })}
                          className="h-8 w-16"
                        />
                      ) : (
                        <Badge variant="outline">{data.kenziffer}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={data.net}
                          onChange={(e) => setEditData({ ...data, net: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-24 text-right"
                        />
                      ) : (
                        data.net.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isEditing ? (
                        <Select
                          value={data.vatRate.toString()}
                          onValueChange={(value) => setEditData({ ...data, vatRate: parseInt(value) as 7 | 19 })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">7%</SelectItem>
                            <SelectItem value="19">19%</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={data.vatRate === 19 ? "bg-primary" : "bg-success"}>
                          {data.vatRate}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {data.vat.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {data.gross.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{data.skr03}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{data.skr04}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[100px]" title={data.source}>
                      {data.source}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={saveEdit} className="h-7 w-7 p-0">
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 w-7 p-0">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(entry)} className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="p-4 bg-warning/5 border border-warning/20 rounded-lg text-sm">
        <div className="font-medium mb-1">⚠️ Validierung</div>
        <div className="text-muted-foreground">
          Bitte überprüfen Sie alle Einträge sorgfältig. Nur USt-Sätze von 7% und 19% sind im MVP unterstützt.
        </div>
      </div>
    </div>
  );
};

export default StepReview;
