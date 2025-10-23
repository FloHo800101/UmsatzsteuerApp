import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface StepPeriodProps {
  data: { month: string; year: string };
  onChange: (data: { month: string; year: string }) => void;
}

const StepPeriod = ({ data, onChange }: StepPeriodProps) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
  
  const months = [
    { value: "01", label: "Januar" },
    { value: "02", label: "Februar" },
    { value: "03", label: "März" },
    { value: "04", label: "April" },
    { value: "05", label: "Mai" },
    { value: "06", label: "Juni" },
    { value: "07", label: "Juli" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "Oktober" },
    { value: "11", label: "November" },
    { value: "12", label: "Dezember" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <Calendar className="h-5 w-5 text-primary" />
        <div className="text-sm">
          <div className="font-medium">Wählen Sie die Abrechnungsperiode</div>
          <div className="text-muted-foreground">Für welchen Zeitraum möchten Sie die UStVA erstellen?</div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="month">Monat</Label>
          <Select value={data.month} onValueChange={(value) => onChange({ ...data, month: value })}>
            <SelectTrigger id="month">
              <SelectValue placeholder="Monat wählen" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="year">Jahr</Label>
          <Select value={data.year} onValueChange={(value) => onChange({ ...data, year: value })}>
            <SelectTrigger id="year">
              <SelectValue placeholder="Jahr wählen" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 bg-muted/50 rounded-lg">
        <div className="text-sm font-medium mb-2">Ausgewählte Periode</div>
        <div className="text-2xl font-bold text-primary">
          {months.find(m => m.value === data.month)?.label} {data.year}
        </div>
      </div>
    </div>
  );
};

export default StepPeriod;
