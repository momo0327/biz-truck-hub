import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmployeesOverviewFn } from "@/lib/admin.functions";
import { Mail, Phone, ShieldCheck, Building2, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/employees")({
  component: AdminEmployees,
});

function AdminEmployees() {
  const fetchOverview = useServerFn(getEmployeesOverviewFn);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => fetchOverview({}),
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-employees-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return (
    <div className="p-8 w-full space-y-8">
      <header>
        <h1 className="font-display text-3xl">Employees</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every account on the team, their activity and pipeline.
        </p>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading employees…</div>
      ) : (
        <div className="grid gap-3">
          {data?.employees
            .slice()
            .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""))
            .map((e) => {
              const isAdmin = e.roles.includes("admin");
              return (
                <Link
                  key={e.id}
                  to="/admin/$employeeId"
                  params={{ employeeId: e.id }}
                  className="block rounded-lg border bg-card hover:border-primary/40 transition-colors p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-display text-lg truncate">
                          {e.displayName || e.email || "—"}
                        </div>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] uppercase tracking-wider font-medium">
                            <ShieldCheck className="size-3" /> Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" /> {e.email}
                        </span>
                        {e.phoneNumber && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" /> {e.phoneNumber}
                          </span>
                        )}
                        <span>
                          Last active:{" "}
                          {e.lastActivity
                            ? new Date(e.lastActivity).toLocaleDateString()
                            : "never"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                    <Stat label="Companies" value={e.stats.companies} icon={Building2} />
                    <Stat label="Calls" value={e.stats.calls} icon={Phone} />
                    <Stat label="Call minutes" value={e.stats.callMinutes} icon={Clock} />
                    <Stat
                      label="Deals closed"
                      value={e.stats.dealsClosed}
                      icon={CheckCircle2}
                      tone="success"
                    />
                    <Stat label="In negotiation" value={e.stats.inNegotiation} icon={Phone} />
                  </div>
                </Link>
              );
            })}
          {data?.employees.length === 0 && (
            <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
              No employees yet. Invite one to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success";
}) {
  return (
    <div className="rounded-md border bg-background/40 p-3">
      <div
        className={`inline-flex items-center justify-center size-7 rounded-md mb-2 ${
          tone === "success" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="text-xl font-display font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
