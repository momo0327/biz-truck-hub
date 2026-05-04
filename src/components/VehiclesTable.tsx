import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Download } from "lucide-react";

export type Vehicle = {
  registration?: string;
  brand?: string;
  model?: string;
  type?: string;
  year?: string;
  fuel?: string;
  weight?: string;
  source?: "excel" | "ai";
  matched?: boolean;
};

type SortKey = keyof Vehicle;

export function VehiclesTable({ vehicles }: { vehicles: Vehicle[] }) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [fuelFilter, setFuelFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("registration");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const types = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.type).filter(Boolean) as string[])).sort(),
    [vehicles],
  );
  const brands = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.brand).filter(Boolean) as string[])).sort(),
    [vehicles],
  );
  const fuels = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.fuel).filter(Boolean) as string[])).sort(),
    [vehicles],
  );

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    const list = vehicles.filter((v) => {
      if (typeFilter && v.type !== typeFilter) return false;
      if (brandFilter && v.brand !== brandFilter) return false;
      if (fuelFilter && v.fuel !== fuelFilter) return false;
      if (sourceFilter === "excel" && v.source !== "excel") return false;
      if (sourceFilter === "ai" && v.source !== "ai") return false;
      if (sourceFilter === "matched" && !v.matched) return false;
      if (!ql) return true;
      return [v.registration, v.brand, v.model, v.type, v.year, v.fuel]
        .filter(Boolean)
        .some((x) => x!.toLowerCase().includes(ql));
    });
    list.sort((a, b) => {
      // matched first
      if ((a.matched ? 1 : 0) !== (b.matched ? 1 : 0)) return a.matched ? -1 : 1;
      const av = (a[sortKey] ?? "").toString().toLowerCase();
      const bv = (b[sortKey] ?? "").toString().toLowerCase();
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * (sortDir === "asc" ? 1 : -1);
    });
    return list;
  }, [vehicles, q, typeFilter, brandFilter, fuelFilter, sourceFilter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function downloadCsv() {
    const headers = ["registration", "brand", "model", "type", "year", "fuel", "weight"];
    const rows = filtered.map((v) =>
      headers.map((h) => `"${(v[h as SortKey] ?? "").toString().replace(/"/g, '""')}"`).join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vehicles.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!vehicles.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No vehicles extracted yet — click "Research with AI".
      </p>
    );
  }

  const cols: { key: SortKey; label: string }[] = [
    { key: "registration", label: "Reg." },
    { key: "brand", label: "Brand" },
    { key: "model", label: "Model" },
    { key: "type", label: "Type" },
    { key: "year", label: "Year" },
    { key: "fuel", label: "Fuel" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full pl-7 pr-2 py-1.5 rounded-md border bg-background text-xs"
          />
        </div>
        {types.length > 1 && (
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border bg-background">
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {brands.length > 1 && (
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border bg-background">
            <option value="">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {fuels.length > 1 && (
          <select value={fuelFilter} onChange={(e) => setFuelFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border bg-background">
            <option value="">All fuels</option>
            {fuels.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded-md border bg-background">
          <option value="">All sources</option>
          <option value="excel">From Excel</option>
          <option value="ai">AI-found</option>
          <option value="matched">✓ Matched (AI confirmed)</option>
        </select>
        <button onClick={downloadCsv} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border hover:bg-muted">
          <Download className="size-3" /> CSV
        </button>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
        <span>{filtered.length} of {vehicles.length} vehicles</span>
        <span className="text-success">✓ {vehicles.filter((v) => v.matched).length} matched</span>
        <span>📄 {vehicles.filter((v) => v.source === "excel").length} from Excel</span>
        <span>✨ {vehicles.filter((v) => v.source === "ai").length} AI-found</span>
      </div>
      <div className="rounded-md border overflow-hidden">
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-muted-foreground sticky top-0">
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className="text-left px-2 py-2 font-medium">
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label} <ArrowUpDown className="size-3 opacity-50" />
                    </button>
                  </th>
                ))}
                <th className="text-left px-2 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((v, i) => (
                <tr
                  key={(v.registration ?? "") + i}
                  className={
                    v.matched
                      ? "bg-success/10 hover:bg-success/20 ring-1 ring-success/30"
                      : "hover:bg-muted/30"
                  }
                >
                  <td className="px-2 py-1.5 font-mono uppercase">
                    <span className="inline-flex items-center gap-1">
                      {v.matched && <span title="Confirmed by AI research" className="text-success">✓</span>}
                      {v.registration ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{v.brand ?? "—"}</td>
                  <td className="px-2 py-1.5">{v.model ?? "—"}</td>
                  <td className="px-2 py-1.5">{v.type ?? "—"}</td>
                  <td className="px-2 py-1.5">{v.year ?? "—"}</td>
                  <td className="px-2 py-1.5">{v.fuel ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    {v.source === "excel" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Excel</span>
                    ) : v.source === "ai" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">AI</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-muted-foreground italic">No matches</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
