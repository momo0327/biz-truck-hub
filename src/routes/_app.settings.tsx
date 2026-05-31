import { createFileRoute } from "@tanstack/react-router";
import { useCompanies, STATUS_META } from "@/lib/companies";
import { SettingsSkeleton } from "@/components/PageSkeletons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { deleteAllCompaniesFn } from "@/server/research.functions";
import { toast } from "sonner";
import { Download, Trash2, User, Phone, Bell, Users, LayoutGrid, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

type TabKey = "profile" | "calling" | "notifications" | "team" | "integrations" | "billing";

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "calling", label: "Calling", icon: Phone },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "team", label: "Team & Agents", icon: Users },
  { key: "integrations", label: "Integrations", icon: LayoutGrid },
  { key: "billing", label: "Billing", icon: BarChart3 },
];

function SettingsPage() {
  const { user } = useAuth();
  const { companies, loading, refresh } = useCompanies();
  const deleteAll = useServerFn(deleteAllCompaniesFn);
  const [displayPhone, setDisplayPhone] = useState("");
  const [elksNumber, setElksNumber] = useState("");
  const [elksUri, setElksUri] = useState("");
  const [elksUser, setElksUser] = useState("");
  const [elksPass, setElksPass] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [tab, setTab] = useState<TabKey>("profile");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("phone_number,display_phone_number,elks_webrtc_uri,elks_webrtc_username,elks_webrtc_password")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        setDisplayPhone(d.display_phone_number ?? d.phone_number ?? "");
        setElksNumber(d.phone_number ?? "");
        setElksUri(d.elks_webrtc_uri ?? "");
        setElksUser(d.elks_webrtc_username ?? "");
        setElksPass(d.elks_webrtc_password ?? "");
      });
  }, [user]);

  async function savePhone() {
    if (!user) return;
    setSavingPhone(true);
    const payload: Record<string, string | null> = {
      display_phone_number: displayPhone.trim() || null,
      phone_number: elksNumber.trim() || null,
      elks_webrtc_uri: elksUri.trim() || null,
      elks_webrtc_username: elksUser.trim() || null,
      elks_webrtc_password: elksPass.trim() || null,
    };
    const { error } = await supabase.from("profiles").update(payload as any).eq("user_id", user.id);
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    toast.success("Calling profile saved");
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
      const res = await deleteAll({});
      toast.success(`Deleted ${res.deleted} companies`);
      refresh();
      return;
    } catch (e) {
      console.warn("Server delete failed, falling back to chunked client delete", e);
    }
    try {
      let totalDeleted = 0;
      for (;;) {
        const { data: batch, error: selErr } = await supabase
          .from("companies").select("id").eq("user_id", user.id).limit(200);
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
    <div className="p-8 space-y-6">
      <header className="flex items-end gap-4 flex-wrap">
        <h1 className="font-display text-3xl tracking-wide">Settings</h1>
        <p className="text-sm text-muted-foreground mb-1">
          Account, calling preferences, and integrations
        </p>
      </header>

      <div className="grid grid-cols-[240px_1fr] gap-6 items-start">
        {/* Sidebar nav */}
        <nav className="flex flex-col gap-1">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm text-left transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
                <span className="font-medium">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Panel */}
        <section className="rounded-xl border bg-card p-8 min-h-[480px]">
          {tab === "profile" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl tracking-wide">Profile</h2>
                <p className="text-sm text-muted-foreground mt-1">Your account details.</p>
              </div>
              <div className="space-y-4 max-w-xl">
                <Field label="Email" value={user?.email ?? "—"} />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Your phone number</label>
                  <div className="flex gap-2">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+46701234567"
                      className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
                    />
                    <button
                      onClick={savePhone}
                      disabled={savingPhone}
                      className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for outbound calls via 46elks — we ring your phone first, then connect.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "calling" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl tracking-wide">Calling</h2>
                <p className="text-sm text-muted-foreground mt-1">Calling preferences and routing.</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Calling is powered by 46elks. Configure your phone number in the Profile tab.
              </p>
            </div>
          )}

          {tab === "notifications" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl tracking-wide">Notifications</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose what you want to be alerted about.</p>
              </div>
              <div className="divide-y">
                <ToggleRow title="Desktop push notifications" desc="Incoming calls, new leads, mentions" />
                <ToggleRow title="New voicemail" desc="Email transcript when a voicemail arrives" />
                <ToggleRow title="Daily performance digest" desc="Summary at 17:00 each working day" />
                <ToggleRow title="Lead stage changes" desc="When your leads move to Negotiating or Closing" />
                <ToggleRow title="Team @mentions" desc="When a colleague tags you in a call note" />
              </div>
            </div>
          )}

          {tab === "team" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl tracking-wide">Team & Agents</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage who has access.</p>
              </div>
              <p className="text-sm text-muted-foreground">Invite teammates from the Admin area.</p>
            </div>
          )}

          {tab === "integrations" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl tracking-wide">Integrations</h2>
                <p className="text-sm text-muted-foreground mt-1">Connected services and data tools.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted">
                  <Download className="size-4" /> Export companies CSV
                </button>
                <button onClick={clearAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/30 text-destructive text-sm hover:bg-destructive/10">
                  <Trash2 className="size-4" /> Delete all companies
                </button>
              </div>
            </div>
          )}

          {tab === "billing" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-xl tracking-wide">Billing</h2>
                <p className="text-sm text-muted-foreground mt-1">Plan and invoices.</p>
              </div>
              <p className="text-sm text-muted-foreground">Billing is managed via your Lovable workspace.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ToggleRow({ title, desc }: { title: string; desc: string }) {
  const [on, setOn] = useState(true);
  return (
    <div className="flex items-center justify-between gap-4 py-5">
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          on ? "bg-primary" : "bg-muted"
        }`}
        aria-pressed={on}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
