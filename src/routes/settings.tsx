import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useCompanies, STATUS_META } from "@/lib/companies";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";

export const Route = createFileRoute("/settings")({ component: () => <AppShell><SettingsPage /></AppShell> });

function SettingsPage() {
  const { user } = useAuth();
  const { companies, refresh } = useCompanies();

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
    const { error } = await supabase.from("companies").delete().eq("user_id", user.id);
    if (error) toast.error(error.message);
    else { toast.success("All companies deleted"); refresh(); }
  }

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Account & data management</p>
      </header>

      <section className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="font-display text-lg">Account</h2>
        <div className="text-sm"><span className="text-muted-foreground">Email:</span> {user?.email}</div>
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
