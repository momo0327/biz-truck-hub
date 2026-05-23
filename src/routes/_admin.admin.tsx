import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { getEmployeesOverviewFn, inviteEmployeeFn } from "@/lib/admin.functions";
import { STATUS_META } from "@/lib/companies";
import { Mail, UserPlus, ShieldCheck, Phone, Building2, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: () => (
    <AdminShell>
      <AdminOverview />
    </AdminShell>
  ),
});

function AdminOverview() {
  const fetchOverview = useServerFn(getEmployeesOverviewFn);
  const invite = useServerFn(inviteEmployeeFn);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => fetchOverview({}),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await invite({ data: { email: inviteEmail } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="p-8 max-w-7xl space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of every account, their activity, and pipeline.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <UserPlus className="size-4" /> Invite employee
        </button>
      </header>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading employees…</div>
      ) : (
        <div className="grid gap-3">
          {data?.employees
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

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setInviteOpen(false)}
        >
          <form
            onSubmit={submitInvite}
            onClick={(e) => e.stopPropagation()}
            className="bg-card border rounded-lg p-6 w-full max-w-md space-y-4"
          >
            <div>
              <h2 className="font-display text-xl">Invite employee</h2>
              <p className="text-sm text-muted-foreground mt-1">
                They'll receive an email with a link to set a password and sign in.
              </p>
            </div>
            <input
              type="email"
              required
              autoFocus
              placeholder="employee@example.com"
              value={inviteEmail}
              onChange={(ev) => setInviteEmail(ev.target.value)}
              className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="px-3 py-2 rounded-md border text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
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

// Re-export STATUS_META so it's bundled; not used directly here.
void STATUS_META;
