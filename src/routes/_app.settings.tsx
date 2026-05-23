import { createFileRoute } from "@tanstack/react-router";
import { useCompanies, STATUS_META } from "@/lib/companies";
import { SettingsSkeleton } from "@/components/PageSkeletons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { deleteAllCompaniesFn } from "@/server/research.functions";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user } = useAuth();
  const { companies, loading, refresh } = useCompanies();
  const deleteAll = useServerFn(deleteAllCompaniesFn);
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("phone_number").eq("user_id", user.id).single()
      .then(({ data }) => { if (data?.phone_number) setPhone(data.phone_number); });
  }, [user]);

  async function savePhone() {
    if (!user) return;
    setSavingPhone(true);
    const { error } = await supabase.from("profiles").update({ phone_number: phone }).eq("user_id", user.id);
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    toast.success("Phone saved");
  }

  function exportCsv() {
    const rows = [
      ["Name", "Org Number", "Status", "Phones", "Website", "Contact", "Trucks", "Last Contact", "Notes"],
      ...companies.map((c) => [
        c.name, c.org_number ?? "", STATUS_META[c.status].label,
        (c.phones ?? []).join("; "), c.website ?? "", c.contact_person ?? "",
        c.trucks_info ?? "", c.last_contact ?? "", (c.notes ?? "").replace(/\n/g, " "),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `companies-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function clearAll() {
    if (!user) return;
    if (!confirm("Delete ALL your companies? This cannot be undone.")) return;
    try {
      // Try server function first (works on published)
      const res = await deleteAll({});
      toast.success(`Deleted ${res.deleted} companies`);
      refresh();
      return;
    } catch (e) {
      // Preview proxy can break server fns — fall back to chunked client deletes
      console.warn("Server delete failed, falling back to chunked client delete", e);
    }
    try {
      let totalDeleted = 0;
      for (;;) {
        const { data: batch, error: selErr } = await supabase
          .from("companies")
          .select("id")
          .eq("user_id", user.id)
          .limit(200);
        if (selErr) throw selErr;
        if (!batch || batch.length === 0) break;
        const ids = batch.map((r) => r.id);
        const { error: delErr } = await supabase.from("companies").delete().in("id", ids);
        if (delErr) throw delErr;
        totalDeleted += ids.length;
        toast.message(`Deleted ${totalDeleted}…`);
        if (batch.length < 200) break;
      }
      toast.success(`Deleted ${totalDeleted} companies`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete");
    }
  }

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Account & data management</p>
      </header>

      <section className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="font-display text-lg">Account</h2>
        <div className="text-sm"><span className="text-muted-foreground">Email:</span> {user?.email}</div>
        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">Your phone number (used for outbound calls via 46elks)</label>
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+46701234567"
              className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
            />
            <button onClick={savePhone} disabled={savingPhone} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
              Save
            </button>
          </div>
          <p className="text-xs text-muted-foreground">When you click Call on a company, 46elks rings your phone first, then connects you to them.</p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg">AI Research</h2>
        <p className="text-sm text-muted-foreground">
          Powered by Lovable AI + Firecrawl. No API keys needed — research is billed as part
          of your Lovable workspace usage.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg">Data</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted">
            <Download className="size-4" /> Export CSV
          </button>
          <button onClick={clearAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/30 text-destructive text-sm hover:bg-destructive/10">
            <Trash2 className="size-4" /> Delete all companies
          </button>
        </div>
      </section>
    </div>
  );
}
