import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  function parseRows(): Array<{ name: string; org_number: string | null }> {
    if (!text.trim()) return [];
    const lines = text.trim().split(/\r?\n/);
    const rows: Array<{ name: string; org_number: string | null }> = [];
    for (const line of lines) {
      const parts = line.split(/[\t,;]/).map((s) => s.trim());
      const name = parts[0]?.replace(/^"|"$/g, "");
      const org = parts[1]?.replace(/^"|"$/g, "") || null;
      if (!name || /company\s*name|namn/i.test(name)) continue;
      rows.push({ name, org_number: org });
    }
    return rows;
  }

  async function handleFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const lines = aoa
      .filter((r) => r && r.length)
      .map((r) => r.slice(0, 2).map((c) => (c == null ? "" : String(c))).join("\t"));
    setText(lines.join("\n"));
  }

  async function importNow() {
    if (!user) return;
    const rows = parseRows();
    if (!rows.length) {
      toast.error("No rows detected. Use: Name, OrgNumber per line.");
      return;
    }
    setBusy(true);
    const payload = rows.map((r) => ({ ...r, user_id: user.id }));
    const { error } = await supabase.from("companies").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Imported ${rows.length} companies`);
    onImported();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl">Import companies</h3>
            <p className="text-sm text-muted-foreground">
              Upload an Excel/CSV or paste rows: <code>Name, OrgNumber</code>
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md py-6 cursor-pointer hover:bg-muted/50">
          <Upload className="size-4" />
          <span className="text-sm">Choose .xlsx or .csv</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Acme AB\t5566778899\nFraktbolaget AB\t5512345678"}
          className="w-full h-48 p-3 border rounded-md text-sm font-mono bg-background"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={importNow}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
