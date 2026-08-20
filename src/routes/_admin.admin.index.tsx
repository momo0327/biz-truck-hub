import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { getEmployeesOverviewFn } from "@/lib/admin.functions";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";


export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

// Employee palette: lime green, pink, yellow, baby blue, then soft extras for overflow.
const DONUT_COLORS = [
  "#00CC77", // lime green
  "#FF4AD6", // pink
  "#fcd34d", // yellow
  "#7dd3fc", // baby blue
  "#c4b5fd", // lavender
  "#fdba74", // peach
  "#94a3b8", // slate (Others)
];

function AdminDashboard() {
  const { t } = useI18n();
  const fetchOverview = useServerFn(getEmployeesOverviewFn);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => fetchOverview({}),
    refetchInterval: 5000,
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
  const weeklyEmployees: string[] = (data as any)?.weeklyEmployees ?? [];
  const colorIndex: Record<string, number> = (data as any)?.colorIndex ?? {};
  const colorMap: Record<string, string> = Object.fromEntries(
    Object.entries(colorIndex).map(([name, i]) => [name, DONUT_COLORS[i % DONUT_COLORS.length]])
  );
  const todayRow = weekly.length > 0 ? weekly[weekly.length - 1] : ({} as Record<string, string | number>);
  const todayCallsTotal = weeklyEmployees.reduce((s, n) => s + ((todayRow[n] as number) ?? 0), 0);
  const today = { calls: todayCallsTotal, answered: 0 };
  const [weekDialogOpen, setWeekDialogOpen] = useState(false);
  const topEmployees = (data?.employees ?? [])
    .slice()
    .sort((a, b) => b.stats.calls - a.stats.calls)
    .slice(0, 6);

  return (
    <div className="p-8 w-full space-y-8">
      <header>
        <h1 className="font-display text-3xl tracking-wide">{t("admin.dash.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.dash.subtitle")}</p>
      </header>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label={`${t("admin.dash.total_calls")} (today)`}
          value={today.calls.toLocaleString()}
          icon={Phone}
          iconColor="text-primary"
          iconBorder="border-primary/40"
          iconBg="bg-primary/10"
          onClick={() => setWeekDialogOpen(true)}
        />
        <StatCard
          label={`${t("admin.dash.answered")} (today)`}
          value="—"
          icon={PhoneCall}
          iconColor="text-muted-foreground"
          iconBorder="border-muted-foreground/20"
          iconBg="bg-muted"
          disabled
        />
        <StatCard
          label={t("admin.dash.total_leads")}
          value={totals.leads.toLocaleString()}
          icon={Users}
          iconColor="text-info"
          iconBorder="border-info/40"
          iconBg="bg-info/10"
        />
      </div>

      <WeeklyBreakdownDialog
        open={weekDialogOpen}
        onOpenChange={setWeekDialogOpen}
        weekly={weekly}
        weeklyEmployees={weeklyEmployees}
        colorMap={colorMap}
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="font-display text-lg">{t("admin.dash.calls_week")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("admin.dash.calls_week_sub")}
              </p>
            </div>
          </div>
          <div className="h-72">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t("shell.loading")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barGap={4}>
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
                  {weeklyEmployees.map((name) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      name={name}
                      fill={colorMap[name] ?? DONUT_COLORS[0]}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={20}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <CallsByEmployee
          employees={(data as any)?.todayByEmployee ?? []}
          colorMap={colorMap}
        />
      </div>


      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-lg">{t("admin.dash.top_employees")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("admin.dash.top_employees_sub")}
            </p>
          </div>
          <Link
            to="/admin/employees"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            {t("admin.dash.view_all")} <ArrowUpRight className="size-3" />
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
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("admin.dash.calls")}</div>
                </div>
                <div className="text-right">
                  <div className="font-display font-semibold">{e.stats.companies}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("admin.dash.leads")}</div>
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
  iconColor,
  iconBorder,
  iconBg,
  onClick,
  disabled,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  iconColor: string;
  iconBorder: string;
  iconBg: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const interactive = !!onClick && !disabled;
  const Comp: React.ElementType = interactive ? "button" : "div";
  return (
    <Comp
      onClick={interactive ? onClick : undefined}
      className={`w-full text-left rounded-xl border bg-card p-6 ${
        interactive ? "hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer" : ""
      } ${disabled ? "opacity-60 select-none" : ""}`}
    >
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
    </Comp>
  );
}

function WeeklyBreakdownDialog({
  open,
  onOpenChange,
  weekly,
  weeklyEmployees,
  colorMap = {},
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  weekly: Record<string, string | number>[];
  weeklyEmployees: string[];
  colorMap?: Record<string, string>;
}) {
  const totalCalls = weekly.reduce(
    (s, d) => s + weeklyEmployees.reduce((ss, n) => ss + ((d[n] as number) ?? 0), 0),
    0,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>This week's calls</DialogTitle>
          <DialogDescription>
            Daily breakdown for the last 7 days · {totalCalls} total calls
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {weekly.map((d, i) => {
            const dayTotal = weeklyEmployees.reduce((s, n) => s + ((d[n] as number) ?? 0), 0);
            const isToday = i === weekly.length - 1;
            return (
              <li key={`${d.day}-${i}`} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.day as string}</span>
                    {isToday && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="font-display font-semibold text-sm">{dayTotal}</span>
                </div>
                {dayTotal > 0 && (
                  <div className="flex gap-3 flex-wrap">
                    {weeklyEmployees.map((name, ei) => {
                      const count = (d[name] as number) ?? 0;
                      if (!count) return null;
                      return (
                        <span key={name} className="inline-flex items-center gap-1 text-xs">
                          <span className="size-2 rounded-full" style={{ background: colorMap[name] ?? DONUT_COLORS[ei % DONUT_COLORS.length] }} />
                          {name}: {count}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
          {weekly.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No data yet.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}


function CallsByEmployee({
  employees,
  colorMap = {},
}: {
  employees: { name: string; calls: number }[];
  colorMap?: Record<string, string>;
}) {
  // All employees sorted by calls desc, keep stable color by original index
  const sorted = employees.slice().sort((a, b) => b.calls - a.calls);
  const withCalls = sorted.filter((e) => e.calls > 0);
  const top = withCalls.slice(0, 6);
  const restTotal = withCalls.slice(6).reduce((s, e) => s + e.calls, 0);
  const pieData = restTotal > 0 ? [...top, { name: "Others", calls: restTotal }] : top;
  const total = pieData.reduce((s, e) => s + e.calls, 0);
  const leader = pieData[0];
  const leaderPct = leader && total > 0 ? Math.round((leader.calls / total) * 100) : 0;
  const getColor = (name: string, fallbackIdx: number) =>
    colorMap[name] ?? DONUT_COLORS[fallbackIdx % DONUT_COLORS.length];

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-2">
        <h2 className="font-display text-lg uppercase tracking-wide">Calls by Employee</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Today · {total.toLocaleString()} calls
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        {total > 0 && (
          <div className="relative w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="calls"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  stroke="none"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={getColor(entry.name, i)} />
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
        )}

        <ul className="w-full space-y-1.5">
          {sorted.map((e, i) => (
            <li key={e.name} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ background: getColor(e.name, i) }}
              />
              <span className="flex-1 truncate text-foreground">{e.name}</span>
              <span className={`font-display font-semibold text-sm ${e.calls === 0 ? "text-muted-foreground" : ""}`}>
                {e.calls}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

