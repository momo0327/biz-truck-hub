import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Folder = { id: string; name: string };

export function ArchiveDialog({
  companyIds,
  onClose,
  onArchived,
}: {
  companyIds: string[];
  onClose: () => void;
  onArchived: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [name, setName] = useState("");
  const [existingId, setExistingId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("archive_folders")
        .select("id,name")
        .order("created_at", { ascending: false });
      setFolders((data ?? []) as Folder[]);
    })();
  }, []);

  async function submit() {
    if (!name.trim() && !existingId) {
      toast.error("Choose an existing folder or name a new one");
      return;
    }
    setBusy(true);
    try {
      let folderId = existingId;
      if (!folderId) {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Not authenticated");
        const { data, error } = await (supabase as any)
          .from("archive_folders")
          .insert({ user_id: u.user.id, name: name.trim() })
          .select()
          .single();
        if (error) throw error;
        folderId = data.id;
      }
      const { error: updErr } = await supabase
        .from("companies")
        .update({ archived_folder_id: folderId, archived_at: new Date().toISOString() } as any)
        .in("id", companyIds);
      if (updErr) throw updErr;
      toast.success(`Archived ${companyIds.length} companies`);
      onArchived();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to archive");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border rounded-xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-display text-lg tracking-wide">Move to archive</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Archiving {companyIds.length} {companyIds.length === 1 ? "company" : "companies"}.
          </p>

          {folders.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Existing folder
              </label>
              <select
                value={existingId}
                onChange={(e) => {
                  setExistingId(e.target.value);
                  if (e.target.value) setName("");
                }}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              >
                <option value="">— Create new —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!existingId && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New folder name
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q1 2026 lost leads"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-md border hover:bg-muted"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
