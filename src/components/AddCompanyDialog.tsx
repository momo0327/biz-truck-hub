import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { X } from "lucide-react";

export function AddCompanyDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({
        user_id: user.id,
        name: name.trim(),
        org_number: org.trim() || null,
        website: website.trim() || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Company added");
    onAdded(data.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={save}
        className="bg-card rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl">Add company</h3>
            <p className="text-sm text-muted-foreground">
              Enter a company manually. You can research it right after.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Company name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Transport AB"
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Org number (optional)</label>
            <input
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="556677-8899"
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Website (optional)</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.se"
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add company"}
          </button>
        </div>
      </form>
    </div>
  );
}
