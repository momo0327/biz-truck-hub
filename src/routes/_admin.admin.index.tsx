import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmployeesOverviewFn } from "@/lib/admin.functions";
import { Calendar } from "@/components/ui/calendar";
import {
  listSchedules,
  isSameDay,
  type ScheduledCall,
} from "@/lib/schedule";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
  const weekly = data?.weekly ?? [];
  const answerRate = totals.calls > 0 ? Math.round((totals.answered / totals.calls) * 100) : 0;
  const topEmployees = (data?.employees ?? [])
    .slice()
    .sort((a, b) => b.stats.calls - a.stats.calls)
    .slice(0, 6);

  return (
    <div className="p-4 md:p-8 max-w-7xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live overview of all team activity.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total calls"
          value={totals.calls.toLocaleString()}
          icon={Phone}
          iconColor="text-primary"
          iconBorder="border-primary/40"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Answered"
          value={totals.answered.toLocaleString()}
          icon={PhoneCall}
          subtitle={`${answerRate}% answer rate`}
          iconColor="text-success"
          iconBorder="border-success/40"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Total leads"
          value={totals.leads.toLocaleString()}
          icon={Users}
          iconColor="text-info"
          iconBorder="border-info/40"
          iconBg="bg-info/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
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

        <CallsByEmployee
          employees={(data?.employees ?? []).map((e) => ({
            name: e.displayName || e.email || "—",
            calls: e.stats.calls,
          }))}
        />
      </div>


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
      <ScheduleWeekSection />
    </div>
  );
}

function ScheduleWeekSection() {
  const [items, setItems] = useState<ScheduledCall[]>([]);
  const [selected, setSelected] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const list = await listSchedules();
      setItems(list);
    } catch {
      // ignore — admin may have no schedules visible
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const ch = (supabase as any)
      .channel("admin-dashboard-schedules")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_calls" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const datesWithEvents = useMemo(
    () => items.map((i) => new Date(i.scheduled_at)),
    [items],
  );
  const forSelected = items
    .filter((i) => isSameDay(new Date(i.scheduled_at), selected))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-4">
        <h2 className="font-display text-lg">Team calendar</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Scheduled calls across the team.
        </p>
      </div>
      <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
        <div className="bg-background/40 border rounded-xl p-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => d && setSelected(d)}
            modifiers={{ scheduled: datesWithEvents }}
            modifiersClassNames={{
              scheduled:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-primary",
            }}
            className="pointer-events-auto"
          />
        </div>

        <div className="bg-background/40 border rounded-xl p-5 min-h-[260px]">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-display text-base tracking-wide uppercase">
              {selected.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
            <span className="text-xs text-muted-foreground">
              {forSelected.length} scheduled
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : forSelected.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y">
              {forSelected.map((s) => {
                const d = new Date(s.scheduled_at);
                return (
                  <li key={s.id} className="py-3 flex items-center gap-3">
                    <div className="text-sm font-mono tabular-nums w-14 text-muted-foreground">
                      {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${s.done ? "line-through text-muted-foreground" : ""}`}
                      >
                        {s.title}
                      </div>
                      {s.note && (
                        <div className="text-xs text-muted-foreground truncate">
                          {s.note}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
  iconColor,
  iconBorder,
  iconBg,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  iconColor: string;
  iconBorder: string;
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <span
          className={`inline-flex items-center justify-center size-11 rounded-lg border ${iconBorder} ${iconBg}`}
        >
          <Icon className={`size-5 ${iconColor}`} />
        </span>
        <div className="font-display text-4xl font-semibold tracking-tight leading-none">
          {value}
        </div>
      </div>
      <div className="mt-6 text-sm text-muted-foreground">{label}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      )}
    </div>
  );
}

const DONUT_COLORS = [
  "var(--primary)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--stage-negotiating)",
  "var(--stage-lost)",
  "var(--muted-foreground)",
];

function CallsByEmployee({ employees }: { employees: { name: string; calls: number }[] }) {
  const filtered = employees.filter((e) => e.calls > 0).sort((a, b) => b.calls - a.calls);
  const top = filtered.slice(0, 6);
  const restTotal = filtered.slice(6).reduce((s, e) => s + e.calls, 0);
  const data = restTotal > 0 ? [...top, { name: "Others", calls: restTotal }] : top;
  const total = data.reduce((s, e) => s + e.calls, 0);
  const leader = data[0];
  const leaderPct = leader && total > 0 ? Math.round((leader.calls / total) * 100) : 0;

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-2">
        <h2 className="font-display text-lg uppercase tracking-wide">Calls by Employee</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          All time · {total.toLocaleString()} total
        </p>
      </div>

      {total === 0 ? (
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          No calls yet.
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="calls"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-3xl font-semibold leading-none">
                {leaderPct}<span className="text-base align-top">%</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                Top agent
              </div>
            </div>
          </div>

          <ul className="w-full space-y-1.5">
            {data.map((e, i) => (
              <li key={e.name} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <span className="flex-1 truncate text-foreground">{e.name}</span>
                <span className="font-display font-semibold text-sm">{e.calls}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

