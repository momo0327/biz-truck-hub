import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCompanies, type CallLog } from "@/lib/companies";
import { DashboardSkeleton } from "@/components/PageSkeletons";
import { supabase } from "@/integrations/supabase/client";
import { listSchedules, getWeekFromToday, isSameDay, type ScheduledCall } from "@/lib/schedule";
import { Building2, PhoneCall, TrendingUp, CheckCircle2, Search, ArrowRight, PhoneIncoming, PhoneOutgoing, PhoneMissed, Calendar as CalendarIcon } from "lucide-react";

export const Route = createFileRoute("/_app/")({ component: Dashboard });

function Dashboard() {
  const { companies, loading } = useCompanies();
  const [calls, setCalls] = useState<CallLog[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      setCalls((data ?? []) as CallLog[]);
    })();
    const channel = supabase
      .channel("dash-calls")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_logs" }, (p) => {
        setCalls((prev) => [p.new as CallLog, ...prev].slice(0, 10));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.id, c.name);
    return m;
  }, [companies]);

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
    { label: "Companies", value: stats.total, icon: Building2 },
    { label: "Researched", value: stats.researched, icon: Search },
    { label: "Calls today", value: stats.callsToday, icon: PhoneCall },
    { label: "In progress", value: stats.inProgress, icon: TrendingUp },
    { label: "Deals closed", value: stats.closed, icon: CheckCircle2 },
  ];

  return (
    <div className="p-8 space-y-6 w-full">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-wide uppercase">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Pipeline & call activity at a glance.</p>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="bg-card border rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
                  {it.label}
                </div>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-3 font-display text-4xl leading-none">{it.value}</div>
            </div>
          );
        })}
      </div>

      {/* Pipeline mini board */}
      <section className="bg-card border rounded-xl p-6">
        <header className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl tracking-wide uppercase">Lead Pipeline</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snapshot of every active opportunity by stage.
            </p>
          </div>
          <Link
            to="/kanban"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            Open pipeline <ArrowRight className="size-3" />
          </Link>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PIPELINE_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const list = companies.filter((c) => c.status === status);
            return (
              <div
                key={status}
                className="rounded-lg border bg-background/50 p-3 flex flex-col gap-2"
                style={{ borderTop: `3px solid ${meta.accent}` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
                    <span className={`size-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{list.length}</span>
                </div>
                <div className="space-y-1.5">
                  {list.slice(0, 3).map((c) => (
                    <Link
                      key={c.id}
                      to="/kanban"
                      className="block bg-card border rounded-md px-2.5 py-2 hover:border-primary/40"
                    >
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {c.address?.split(",")[0] || c.fleet_size || "—"}
                      </div>
                    </Link>
                  ))}
                  {list.length === 0 && (
                    <div className="text-[11px] text-muted-foreground italic px-1">empty</div>
                  )}
                  {list.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">
                      +{list.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent calls */}
      <section className="bg-card border rounded-xl p-6">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl tracking-wide uppercase">Recent calls</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The latest activity from your softphone.
            </p>
          </div>
          <Link
            to="/calls"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            View all <ArrowRight className="size-3" />
          </Link>
        </header>
        <ul className="divide-y">
          {calls.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">No calls yet.</li>
          )}
          {calls.map((c) => {
            const isOutbound = c.direction !== "inbound";
            const isMissed = ["no-answer", "missed", "failed"].includes(c.status ?? "");
            const Icon = isMissed ? PhoneMissed : isOutbound ? PhoneOutgoing : PhoneIncoming;
            const tone = isMissed
              ? "bg-destructive/10 text-destructive"
              : isOutbound
                ? "bg-muted text-muted-foreground"
                : "bg-success/15 text-success";
            const name = (c.company_id && companyById.get(c.company_id)) || "Unknown";
            return (
              <li key={c.id} className="py-3 flex items-center gap-3">
                <span className={`inline-flex items-center justify-center size-9 rounded-full ${tone}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{c.to_number ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground hidden sm:block capitalize">
                  {c.status ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
