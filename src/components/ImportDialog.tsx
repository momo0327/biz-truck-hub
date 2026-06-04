import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Upload, X, Loader2, Sparkles } from "lucide-react";

type Row = { name: string; org_number: string | null };

const NAME_KEYS = ["namn", "name", "company", "företag", "foretag", "company name"];
const ORG_KEYS = ["organisationsnr", "orgnr", "org number", "org_number", "organisationsnummer", "org no", "org"];

function normalizeOrg(s: string | null | undefined): string | null {
  if (!s) return null;
  const digits = String(s).replace(/\D/g, "");
  if (!digits) return null;
  // Format Swedish org numbers as XXXXXX-XXXX when 10 digits
  if (digits.length === 10) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return digits;
}

function pickColumns(headerRow: any[]): { nameIdx: number; orgIdx: number } {
  const norm = headerRow.map((h) => String(h ?? "").trim().toLowerCase());
  const findIdx = (keys: string[]) => norm.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  return { nameIdx: findIdx(NAME_KEYS), orgIdx: findIdx(ORG_KEYS) };
}

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);

    const collected: Row[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!aoa.length) continue;
      const { nameIdx, orgIdx } = pickColumns(aoa[0] ?? []);
      if (nameIdx === -1) continue;
      for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r) continue;
        const rawName = r[nameIdx];
        if (rawName == null || String(rawName).trim() === "") continue;
        const name = String(rawName).trim();
        const org = orgIdx !== -1 ? normalizeOrg(r[orgIdx] != null ? String(r[orgIdx]) : null) : null;
        if (!org) continue;
        const firstDigit = org.replace(/\D/g, "")[0];
        if (!firstDigit || !["2", "3", "5"].includes(firstDigit)) continue;
        collected.push({ name, org_number: org });
      }
    }

    // Dedupe by org_number (preferred) or name
    const seen = new Set<string>();
    const unique: Row[] = [];
    for (const r of collected) {
      const key = (r.org_number || r.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }
    setRows(unique);
    if (!unique.length) toast.error("Couldn't find a 'Namn' column in the file.");
  }

  async function importNow() {
    if (!user || !rows.length) return;
    setBusy(true);
    try {
      // Insert in batches of 500 to avoid request-size / timeout issues on
      // large imports (2000+ rows).
      const BATCH = 500;
      let insertedCount = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH).map((r) => ({ ...r, user_id: user.id }));
        const { data, error } = await supabase.from("companies").insert(slice).select("id");
        if (error) {
          toast.error(error.message);
          return;
        }
        insertedCount += data?.length ?? 0;
        setProgress({ done: insertedCount, total: rows.length });
      }
      toast.success(
        `Imported ${insertedCount} companies. Use "Research all" on the Companies page when you're ready — research runs on demand to avoid long waits.`,
      );
      onImported();
      onClose();
    } finally {
      setBusy(false);
      setProgress(null);
    }
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
              Upload an Excel file. Only the <strong>Namn</strong> and <strong>Organisationsnr</strong> columns
              are used. Rows are imported quickly — run AI research later from the Companies page.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" disabled={busy}>
            <X className="size-5" />
          </button>
        </div>

        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md py-6 cursor-pointer hover:bg-muted/50">
          <Upload className="size-4" />
          <span className="text-sm">{fileName || "Choose .xlsx, .xls or .csv"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {rows.length > 0 && (
          <div className="rounded-md border bg-muted/30 max-h-64 overflow-y-auto">
            <div className="px-3 py-2 text-xs text-muted-foreground border-b sticky top-0 bg-muted/50">
              {rows.length} unique companies detected
            </div>
            <ul className="divide-y text-sm">
              {rows.slice(0, 50).map((r, i) => (
                <li key={i} className="px-3 py-1.5 flex justify-between gap-3">
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{r.org_number ?? "—"}</span>
                </li>
              ))}
              {rows.length > 50 && (
                <li className="px-3 py-1.5 text-xs text-muted-foreground italic">
                  …and {rows.length - 50} more
                </li>
              )}
            </ul>
          </div>
        )}

        {progress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Upload className="size-3" /> Importing companies…
              </span>
              <span>
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md hover:bg-muted disabled:opacity-50"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={importNow}
            disabled={busy || !rows.length}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {busy ? "Importing…" : `Import ${rows.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
