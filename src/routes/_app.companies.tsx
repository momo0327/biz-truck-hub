import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImportDialog } from "@/components/ImportDialog";
import { AddCompanyDialog } from "@/components/AddCompanyDialog";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import { ArchiveDialog } from "@/components/ArchiveDialog";
import { PhoneButtons } from "@/components/PhoneButtons";
import { DialerButton } from "@/components/DialerButton";


import { useCompanies, STATUS_META, STATUS_ORDER, type Company, type Status } from "@/lib/companies";
import { CompaniesSkeleton } from "@/components/PageSkeletons";
import { researchCompanyFn, deleteCompaniesFn } from "@/server/research.functions";
import { Plus, Loader2, Sparkles, Search, UserPlus, Trash2, Archive as ArchiveIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/companies")({ component: CompaniesPage });

function CompaniesPage() {
  const { companies, loading, refresh, upsertCompany, refetchCompany, removeCompanies } = useCompanies();
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selected, setSelected] = useState<Company | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const research = useServerFn(researchCompanyFn);
  const deleteMany = useServerFn(deleteCompaniesFn);

  const statusCounts = STATUS_ORDER.reduce(
    (acc, status) => ({ ...acc, [status]: companies.filter((c) => c.status === status).length }),
    {} as Record<Status, number>,
  );

  const filtered = companies.filter((c) => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.org_number?.includes(q);
    return matchesStatus && matchesSearch;
  });

  async function researchOne(id: string) {
    setBusyIds((s) => new Set(s).add(id));
    try {
      const res = await research({ data: { companyId: id } });
      if (res.ok) await refetchCompany(id);
      else toast.error(res.error ?? "Research failed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function researchAll() {
    const targets = filtered.filter((c) => !c.researched_at);
    if (!targets.length) return toast.info("Nothing to research");
    if (!confirm(`Research ${targets.length} companies? This may take a while.`)) return;
    setBulkBusy(true);
    for (const c of targets) {
      await researchOne(c.id);
    }
    setBulkBusy(false);
    toast.success("Research batch finished");
  }

  if (loading) return <CompaniesSkeleton />;

  return (
    <div className="p-6 md:p-8 space-y-6 w-full max-w-none">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-end gap-4 flex-wrap">
          <h1 className="font-display text-3xl tracking-wide">Companies</h1>
          <p className="text-sm text-muted-foreground mb-1">{companies.length} imported</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setArchiveOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm hover:bg-muted"
              >
                <ArchiveIcon className="size-4" /> Archive {selectedIds.size}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete ${selectedIds.size} selected companies?`)) return;
                  const ids = Array.from(selectedIds);
                  try {
                    const res = await deleteMany({ data: { ids } });
                    toast.success(`Deleted ${res.deleted} companies`);
                    setSelectedIds(new Set());
                    removeCompanies(ids);
                  } catch (e: any) {
                    toast.error(e.message ?? "Failed to delete");
                  }
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/30 text-destructive text-sm hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Delete {selectedIds.size}
              </button>
            </>
          )}
          <DialerButton />
          <button
            onClick={researchAll}
            disabled={bulkBusy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm hover:bg-muted disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Research All
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm hover:bg-muted"
          >
            <UserPlus className="size-4" /> Add company
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
          >
            <Plus className="size-4" /> Import
          </button>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={`inline-flex shrink-0 items-center gap-3 rounded-full border px-5 py-3 text-sm font-medium transition ${
              statusFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
            }`}
          >
            All
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusFilter === "all" ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
              {companies.length}
            </span>
          </button>
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const active = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`inline-flex shrink-0 items-center gap-3 rounded-full border px-5 py-3 text-sm font-medium transition ${
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                }`}
              >
                {meta.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
                  {statusCounts[status]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or org number…"
            className="w-full max-w-md pl-9 pr-3 py-2 rounded-md border bg-card text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                  ref={(el) => {
                    if (el) {
                      const some = filtered.some((c) => selectedIds.has(c.id));
                      const all = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
                      el.indeterminate = some && !all;
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map((c) => c.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="size-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Company</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Primary Contact</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Phone</th>
              <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Status</th>
              <th className="text-right px-4 py-3 w-[60px]"></th>
            </tr>

          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => {
              const meta = STATUS_META[c.status];
              const busy = busyIds.has(c.id);
              const city = c.address?.split(",")[0]?.trim() || "";
              return (
                <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(c)}>
                  <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(c.id);
                          else n.delete(c.id);
                          return n;
                        });
                      }}
                      className="size-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[city, c.org_number].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{c.contact_person || "—"}</div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <PhoneButtons phones={c.phones ?? []} companyId={c.id} contactName={c.name} compact readOnly />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] uppercase px-2.5 py-1 rounded-full ${meta.tone}`}>
                      <span className={`size-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right w-[60px]" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => researchOne(c.id)}
                      disabled={busy}
                      title={c.researched_at ? "Refresh research" : "Research"}
                      className="inline-flex items-center justify-center size-8 rounded-md border hover:bg-muted disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  No companies. Click <strong>Import</strong> to add your Excel list.
                </td>
              </tr>

            )}
          </tbody>
        </table>
      </div>


      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={refresh} />}
      {addOpen && (
        <AddCompanyDialog
          onClose={() => setAddOpen(false)}
          onAdded={async (id) => {
            await refresh();
            researchOne(id);
          }}
        />
      )}
      {selected && (
        <CompanyDrawer
          company={companies.find((c) => c.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onCompanyChange={(company) => {
            upsertCompany(company);
            setSelected(company);
          }}
          onCompanyDeleted={(id) => removeCompanies([id])}
        />
      )}
      {archiveOpen && (
        <ArchiveDialog
          companyIds={Array.from(selectedIds)}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => {
            removeCompanies(Array.from(selectedIds));
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
