import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies, type Company } from "@/lib/companies";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import { Folder, ArrowLeft, Trash2, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/archives")({ component: ArchivesPage });

type ArchiveFolder = { id: string; name: string; created_at: string };

function ArchivesPage() {
  const [folders, setFolders] = useState<ArchiveFolder[]>([]);
  const [open, setOpen] = useState<ArchiveFolder | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const { refresh: refreshCompanies } = useCompanies();

  async function loadFolders() {
    const { data, error } = await (supabase as any)
      .from("archive_folders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setFolders((data ?? []) as ArchiveFolder[]);
  }

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("archived_folder_id" as any, open.id);
      if (error) return toast.error(error.message);
      setCompanies((data ?? []) as Company[]);
    })();
  }, [open]);

  const counts = useMemo(() => new Map(folders.map((f) => [f.id, 0])), [folders]);

  async function deleteFolder(folder: ArchiveFolder) {
    if (!confirm(`Delete folder "${folder.name}"? Companies inside will be restored to the main list.`))
      return;
    // Unarchive companies first
    const { error: e1 } = await supabase
      .from("companies")
      .update({ archived_folder_id: null, archived_at: null } as any)
      .eq("archived_folder_id" as any, folder.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await (supabase as any).from("archive_folders").delete().eq("id", folder.id);
    if (e2) return toast.error(e2.message);
    toast.success("Folder deleted, companies restored");
    setOpen(null);
    await loadFolders();
    await refreshCompanies();
  }

  async function restoreFolder(folder: ArchiveFolder) {
    if (!confirm(`Restore folder "${folder.name}"? All companies inside will return to the Companies page.`))
      return;
    const { error: e1 } = await supabase
      .from("companies")
      .update({ archived_folder_id: null, archived_at: null } as any)
      .eq("archived_folder_id" as any, folder.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await (supabase as any).from("archive_folders").delete().eq("id", folder.id);
    if (e2) return toast.error(e2.message);
    toast.success(`Restored ${folder.name} to Companies`);
    setOpen(null);
    await loadFolders();
    await refreshCompanies();
  }

  async function restoreCompany(companyId: string) {
    const { error } = await supabase
      .from("companies")
      .update({ archived_folder_id: null, archived_at: null } as any)
      .eq("id", companyId);
    if (error) return toast.error(error.message);
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    toast.success("Company restored");
    await refreshCompanies();
  }

  if (open) {
    return (
      <div className="p-8 space-y-6 w-full">
        <button
          onClick={() => setOpen(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All folders
        </button>
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-wide uppercase">{open.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{companies.length} companies archived</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => restoreFolder(open)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 text-primary text-sm hover:bg-primary/10"
            >
              <ArchiveRestore className="size-4" /> Restore to Companies
            </button>
            <button
              onClick={() => deleteFolder(open)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/30 text-destructive text-sm hover:bg-destructive/10"
            >
              <Trash2 className="size-4" /> Delete folder
            </button>
          </div>
        </header>

        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-left px-4 py-3">Fleet</th>
                <th className="text-left px-4 py-3">Archived</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedCompany(c)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.org_number ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">{c.contact_person || "—"}</td>
                  <td className="px-4 py-3">{c.fleet_size || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {(c as any).archived_at
                      ? new Date((c as any).archived_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    Folder is empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedCompany && (
          <CompanyDrawer
            company={selectedCompany}
            onClose={() => setSelectedCompany(null)}
            readOnly
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 w-full">
      <header>
        <h1 className="font-display text-3xl tracking-wide uppercase">Archives</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse archived companies grouped into folders.
        </p>
      </header>

      {folders.length === 0 ? (
        <div className="bg-card border rounded-xl p-12 text-center">
          <Folder className="mx-auto size-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No archive folders yet. Select companies on the Companies page and archive them to start.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setOpen(f)}
              className="text-left bg-card border rounded-xl p-5 hover:border-primary/40 transition"
            >
              <Folder className="size-6 text-primary mb-3" />
              <div className="font-medium truncate">{f.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Created {new Date(f.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
