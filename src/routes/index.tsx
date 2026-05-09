import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useCompanies, STATUS_META } from "@/lib/companies";
import { DashboardSkeleton } from "@/components/PageSkeletons";
import { CallsChart } from "@/components/CallsChart";
import { Building2, PhoneCall, TrendingUp, CheckCircle2, Search } from "lucide-react";

export const Route = createFileRoute("/")({ component: DashboardPage });

function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { companies, loading } = useCompanies();
  if (loading) return <DashboardSkeleton />;
  const today = new Date().toDateString();
  const stats = {
    total: companies.length,
    researched: companies.filter((c) => c.researched_at).length,
    callsToday: companies.filter((c) => c.last_contact && new Date(c.last_contact).toDateString() === today).length,
    inProgress: companies.filter((c) => ["called_no_answer", "follow_up", "in_negotiation"].includes(c.status)).length,
    closed: companies.filter((c) => c.status === "deal_made").length,
  };

  const items = [
    { label: "Companies", value: stats.total, icon: Building2, tone: "bg-info/10 text-info" },
    { label: "Researched", value: stats.researched, icon: Search, tone: "bg-primary/10 text-primary" },
    { label: "Calls today", value: stats.callsToday, icon: PhoneCall, tone: "bg-success/10 text-success" },
    { label: "In progress", value: stats.inProgress, icon: TrendingUp, tone: "bg-warning/20 text-warning-foreground" },
    { label: "Deals closed", value: stats.closed, icon: CheckCircle2, tone: "bg-success/15 text-success" },
  ];

  const recent = [...companies]
    .sort((a, b) => (b.last_contact ?? b.created_at).localeCompare(a.last_contact ?? a.created_at))
    .slice(0, 8);

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <header>
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your fleet pipeline at a glance.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="rounded-lg border bg-card p-4">
              <div className={`inline-flex items-center justify-center size-8 rounded-md ${it.tone} mb-3`}>
                <Icon className="size-4" />
              </div>
              <div className="text-2xl font-display font-semibold">{it.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{it.label}</div>
            </div>
          );
        })}
      </div>

      <CallsChart companies={companies} />

      <section>
        <h2 className="font-display text-lg mb-3">Recent activity</h2>
        <div className="rounded-lg border bg-card overflow-hidden">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No companies yet — head to <strong>Companies</strong> to import your list.
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((c) => {
                const meta = STATUS_META[c.status];
                return (
                  <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${meta.tone}`}>
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="font-medium text-sm flex-1 truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.last_contact ? new Date(c.last_contact).toLocaleDateString() : "—"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
