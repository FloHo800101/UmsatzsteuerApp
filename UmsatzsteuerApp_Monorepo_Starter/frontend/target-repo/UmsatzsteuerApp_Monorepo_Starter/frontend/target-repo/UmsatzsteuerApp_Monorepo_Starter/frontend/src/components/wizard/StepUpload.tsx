import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, X, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StepUploadProps {
  period: { month: string; year: string };
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
}

const StepUpload = ({ period }: StepUploadProps) => {
  const [files, setFiles] = useState<UploadedFile[]>([
    { id: "1", name: "Rechnung_Amazon_2025-09-15.pdf", size: 245000, status: "done" },
    { id: "2", name: "Beleg_Telekom_089.pdf", size: 128000, status: "done" },
    { id: "3", name: "Quittung_Bürobedarf.jpg", size: 532000, status: "done" },
  ]);
  const { toast } = useToast();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleFiles = (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map((file, idx) => ({
      id: `new-${Date.now()}-${idx}`,
      name: file.name,
      size: file.size,
      status: "uploading" as const,
    }));

    setFiles(prev => [...prev, ...uploadedFiles]);

    // Simulate upload
    uploadedFiles.forEach((file) => {
      setTimeout(() => {
        setFiles(prev => 
          prev.map(f => f.id === file.id ? { ...f, status: "done" as const } : f)
        );
        toast({
          title: "Beleg hochgeladen",
          description: `${file.name} wurde erfolgreich hochgeladen und wird verarbeitet.`,
        });
      }, 1000);
    });
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      {/* Drag & Drop Area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <div className="text-lg font-semibold mb-2">Belege hochladen</div>
        <div className="text-sm text-muted-foreground mb-4">
          Ziehen Sie Dateien hierher oder klicken Sie zum Auswählen
        </div>
        <div className="text-xs text-muted-foreground">
          Unterstützte Formate: PDF, JPG, PNG (max. 10 MB)
        </div>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
        />
      </div>

      {/* Uploaded Files List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Hochgeladene Belege ({files.length})
            </div>
            <Badge variant="secondary">
              Periode: {period.month}/{period.year}
            </Badge>
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors"
              >
                <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {file.status === "done" && (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  )}
                  {file.status === "uploading" && (
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(file.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-sm">
        <div className="font-medium mb-1">💡 Hinweis</div>
        <div className="text-muted-foreground">
          Die Belege werden automatisch verarbeitet und die Daten extrahiert (Mock). 
          Im nächsten Schritt können Sie die extrahierten Einträge prüfen und korrigieren.
        </div>
      </div>
    </div>
  );
};

export default StepUpload;
