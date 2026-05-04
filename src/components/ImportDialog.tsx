import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Upload, X, FileSpreadsheet } from "lucide-react";

type Vehicle = {
  registration?: string;
  brand?: string;
  model?: string;
  year?: string;
  notes?: string;
  date?: string;
};

type CompanyDraft = {
  name: string;
  org_number: string | null;
  phones: string[];
  notes: string | null;
  vehicles: Vehicle[];
};

const HEADER_MAP: Record<string, string> = {
  registreringsnr: "registration",
  organisationsnr: "org",
  datum: "date",
  anteckningar: "notes",
  anteckning: "notes",
  namn: "name",
  fabrikatkod: "brand",
  fordonår: "year",
  fordonsbenämning: "model",
  handelsbeteckning: "model",
};

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function excelDateToISO(v: any): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s || undefined;
}

function looksLikePhone(s: string): boolean {
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 && /[\d\s\-+()]/.test(s);
}

function splitBrandModel(brandRaw: string, modelRaw: string): { brand: string; model: string } {
  // Sometimes brand cell contains "SCANIA R450LB6X2*4HLB" and model is empty
  const brand = brandRaw.trim();
  const model = modelRaw.trim();
  if (model) return { brand: brand.split(/\s+/)[0] ?? brand, model: brand.includes(" ") ? brand.split(/\s+/).slice(1).join(" ") + (brand.includes(" ") ? " " : "") + model : model };
  // No model — try splitting brand
  const parts = brand.split(/\s+/);
  if (parts.length > 1) return { brand: parts[0], model: parts.slice(1).join(" ") };
  return { brand, model: "" };
}

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<CompanyDraft[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const allRows: any[][] = [];
    const headers: Record<number, string> = {};

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!aoa.length) continue;
      // Detect header row
      const headerRow = aoa[0];
      const localHeaders: Record<number, string> = {};
      headerRow.forEach((h, i) => {
        const key = HEADER_MAP[norm(h)];
        if (key) localHeaders[i] = key;
      });
      // Use first sheet's header map as canonical
      if (Object.keys(headers).length === 0) Object.assign(headers, localHeaders);
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row || row.every((c) => c == null || c === "")) continue;
        // Map to a normalized object using local headers
        const obj: any = {};
        row.forEach((cell, i) => {
          const key = localHeaders[i];
          if (key) obj[key] = cell;
        });
        allRows.push(obj);
      }
    }

    // Group by company (org_number || name)
    const map = new Map<string, CompanyDraft>();
    for (const r of allRows as any[]) {
      const name = String(r.name ?? "").trim();
      if (!name) continue;
      const org = r.org != null && r.org !== "" ? String(r.org).trim() : null;
      const key = org || name.toLowerCase();
      let draft = map.get(key);
      if (!draft) {
        draft = { name, org_number: org, phones: [], notes: null, vehicles: [] };
        map.set(key, draft);
      }

      const noteRaw = r.notes != null ? String(r.notes).trim() : "";
      if (noteRaw) {
        if (looksLikePhone(noteRaw)) {
          if (!draft.phones.includes(noteRaw)) draft.phones.push(noteRaw);
        } else {
          draft.notes = draft.notes ? draft.notes + "\n" + noteRaw : noteRaw;
        }
      }

      // Count this row as one vehicle (we ignore reg/brand/model from Excel —
      // AI research will web-scrape the actual fleet). We only need the count.
      const reg = String(r.registration ?? "").trim();
      const brandRaw = String(r.brand ?? "").trim();
      const modelRaw = String(r.model ?? "").trim();
      if (reg || brandRaw || modelRaw) {
        // Push a placeholder so the count is correct; details come from AI later.
        draft.vehicles.push({});
      }
    }

    setDrafts(Array.from(map.values()));
  }

  async function importNow() {
    if (!user) return;
    if (!drafts.length) {
      toast.error("No companies detected");
      return;
    }
    setBusy(true);
    const payload = drafts.map((d) => ({
      user_id: user.id,
      name: d.name,
      org_number: d.org_number,
      phones: d.phones,
      notes: d.notes,
      vehicles: [] as any, // empty — AI research will populate from web
      fleet_size: String(d.vehicles.length), // count from Excel rows
    }));
    // Insert in chunks to avoid payload limits
    const chunkSize = 200;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error } = await supabase.from("companies").insert(chunk);
      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
      inserted += chunk.length;
    }
    setBusy(false);
    const totalVehicles = drafts.reduce((s, d) => s + d.vehicles.length, 0);
    toast.success(`Imported ${inserted} companies (${totalVehicles} vehicles)`);
    onImported();
    onClose();
  }

  const totalVehicles = drafts.reduce((s, d) => s + d.vehicles.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl">Import companies & vehicles</h3>
            <p className="text-sm text-muted-foreground">
              Upload a Swedish trucks Excel (Registreringsnr, Organisationsnr, Namn, Fabrikatkod…). Rows are grouped by org number into one company with all its vehicles.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md py-8 cursor-pointer hover:bg-muted/50">
          <Upload className="size-5" />
          <span className="text-sm font-medium">{fileName || "Choose .xlsx or .csv"}</span>
          <span className="text-xs text-muted-foreground">All sheets in the file will be imported</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {drafts.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-primary" />
              <span><strong>{drafts.length}</strong> companies · <strong>{totalVehicles}</strong> vehicles detected</span>
            </div>
            <div className="rounded-md border overflow-hidden flex-1 min-h-0">
              <div className="overflow-auto h-full max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0 text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Company</th>
                      <th className="text-left px-3 py-2">Org #</th>
                      <th className="text-right px-3 py-2">Vehicles</th>
                      <th className="text-right px-3 py-2">Phones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drafts.slice(0, 200).map((d, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5">{d.name}</td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{d.org_number ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">{d.vehicles.length}</td>
                        <td className="px-3 py-1.5 text-right">{d.phones.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {drafts.length > 200 && (
                  <div className="text-xs text-center text-muted-foreground py-2">…and {drafts.length - 200} more</div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={importNow}
            disabled={busy || !drafts.length}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${drafts.length} companies`}
          </button>
        </div>
      </div>
    </div>
  );
}
