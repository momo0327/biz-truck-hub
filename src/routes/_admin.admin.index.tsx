import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmployeesOverviewFn } from "@/lib/admin.functions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Phone, PhoneCall, Users, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const fetchOverview = useServerFn(getEmployeesOverviewFn);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => fetchOverview({}),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const totals = data?.totals ?? { calls: 0, answered: 0, leads: 0 };
  const weekly = data?.weekly?.length ? data.weekly : mockWeeklyData();
  const answerRate = totals.calls > 0 ? Math.round((totals.answered / totals.calls) * 100) : 0;
  const topEmployees = (data?.employees ?? [])
    .slice()
    .sort((a, b) => b.stats.calls - a.stats.calls)
    .slice(0, 6);

  return (
    <div className="p-8 max-w-7xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live overview of all team activity.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total calls"
          value={totals.calls}
          icon={Phone}
          accent="border-l-4 border-l-primary"
        />
        <StatCard
          label="Answered"
          value={totals.answered}
          icon={PhoneCall}
          subtitle={`${answerRate}% answer rate`}
          accent="border-l-4 border-l-success"
        />
        <StatCard
          label="Total leads"
          value={totals.leads}
          icon={Users}
          accent="border-l-4 border-l-info"
        />
      </div>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-lg">Calls this week</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily call volume vs answered calls.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-primary" /> Calls
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-info" /> Answered
            </span>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--muted) 40%, transparent)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ display: "none" }} />
                <Bar dataKey="calls" name="Calls" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="answered" name="Answered" fill="var(--info)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-lg">Top employees</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sorted by total calls made.
            </p>
          </div>
          <Link
            to="/admin/employees"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            View all <ArrowUpRight className="size-3" />
          </Link>
        </div>
        <div className="grid gap-2">
          {topEmployees.map((e) => (
            <Link
              key={e.id}
              to="/admin/$employeeId"
              params={{ employeeId: e.id }}
              className="flex items-center justify-between gap-4 rounded-md border bg-background/40 px-4 py-3 hover:border-primary/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {e.displayName || e.email || "—"}
                </div>
                <div className="text-xs text-muted-foreground truncate">{e.email}</div>
              </div>
              <div className="flex items-center gap-5 text-sm">
                <div className="text-right">
                  <div className="font-display font-semibold">{e.stats.calls}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Calls</div>
                </div>
                <div className="text-right">
                  <div className="font-display font-semibold">{e.stats.companies}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Leads</div>
                </div>
                <div className="text-right">
                  <div className="font-display font-semibold text-success">{e.stats.dealsClosed}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Deals</div>
                </div>
              </div>
            </Link>
          ))}
          {topEmployees.length === 0 && !isLoading && (
            <div className="rounded-md border bg-background/40 p-8 text-center text-sm text-muted-foreground">
              No employees yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-6 ${accent}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="inline-flex items-center justify-center size-9 rounded-lg bg-muted border">
          <Icon className="size-4 text-foreground" />
        </span>
      </div>
      <div className="mt-4 font-display text-4xl font-semibold tracking-tight">
        {value.toLocaleString()}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      )}
    </div>
  );
}
