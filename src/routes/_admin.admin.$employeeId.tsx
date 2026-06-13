import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getEmployeeDetailFn, deleteEmployeeFn } from "@/lib/admin.functions";
import { STATUS_META, STATUS_ORDER, type Company, type Status } from "@/lib/companies";
import { PhoneButtons } from "@/components/PhoneButtons";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import { ArrowLeft, Mail, Phone, Building2, PhoneCall, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/$employeeId")({
  component: EmployeeDetail,
});

type Tab = "companies" | "calls";

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const navigate = useNavigate();
  const fetchDetail = useServerFn(getEmployeeDetailFn);
  const deleteEmployee = useServerFn(deleteEmployeeFn);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-employee", employeeId],
    queryFn: () => fetchDetail({ data: { employeeId } }),
    staleTime: Infinity,
  });

  const [tab, setTab] = useState<Tab>("companies");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const allCompanies = useMemo(() => (data?.companies ?? []) as Company[], [data]);
  const statusCounts = useMemo(
    () => STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: allCompanies.filter((c) => c.status === s).length }), {} as Record<Status, number>),
    [allCompanies],
  );
  const filteredCompanies = useMemo(
    () => statusFilter === "all" ? allCompanies : allCompanies.filter((c) => c.status === statusFilter),
    [allCompanies, statusFilter],
  );
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => { setVisibleCount(100); }, [statusFilter]);
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => { tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [statusFilter]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Company | null>(null);

  async function submitDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    try {
      const res = await deleteEmployee({ data: { employeeId, password } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Employee account deleted");
      setConfirmOpen(false);
      setPassword("");
      navigate({ to: "/admin" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete employee");
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading || !data) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }

  const { employee, calls } = data;

  return (
    <div className="p-8 w-full space-y-6">
      <div>
        <Link
          to="/admin/employees"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to employees
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl">
            {employee.displayName || employee.email || "—"}
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" /> {employee.email}
            </span>
            {employee.phoneNumber && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" /> {employee.phoneNumber}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" /> Delete account
        </button>
      </header>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={submitDelete}
            className="w-full max-w-md bg-card rounded-lg border shadow-lg p-6 space-y-4"
          >
            <div>
              <h3 className="font-display text-lg">Delete employee account</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This permanently removes <strong>{employee.email}</strong> and all of
                their companies and call logs. Enter your admin password to confirm.
              </p>
            </div>
            <input
              type="password"
              required
              autoFocus
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setPassword("");
                }}
                className="px-3 py-2 rounded-md text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting}
                className="px-3 py-2 rounded-md text-sm bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div ref={tableRef} className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center gap-1 border-b px-2 bg-muted/30">
          <TabButton active={tab === "companies"} onClick={() => setTab("companies")} icon={Building2}>
            Companies ({allCompanies.length})
          </TabButton>
          <TabButton active={tab === "calls"} onClick={() => setTab("calls")} icon={PhoneCall}>
            Call log ({calls.length})
          </TabButton>
        </div>

        {tab === "companies" && (
          <>
            <div className="flex gap-2 flex-wrap px-4 py-3 border-b bg-muted/20 overflow-x-auto">
              <button
                onClick={() => setStatusFilter("all")}
                className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                  statusFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                }`}
              >
                All <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusFilter === "all" ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>{allCompanies.length}</span>
              </button>
              {STATUS_ORDER.map((s) => {
                const meta = STATUS_META[s];
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                    }`}
                  >
                    {meta.label} <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>{statusCounts[s]}</span>
                  </button>
                );
              })}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Company</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Primary Contact</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Phone</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Last contact</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCompanies.slice(0, visibleCount).map((c) => {
                  const meta = STATUS_META[c.status as keyof typeof STATUS_META] ?? { label: c.status ?? "—", tone: "bg-muted text-foreground", dot: "bg-muted-foreground" };
                  const city = c.address?.split(",")[0]?.trim() || "";
                  return (
                    <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(c)}>
                      <td className="px-4 py-3">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[city, c.org_number].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{c.contact_person || "—"}</div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <PhoneButtons phones={c.phones ?? []} companyId={c.id} contactName={c.name} compact />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] uppercase px-2.5 py-1 rounded-full ${meta.tone}`}>
                          <span className={`size-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {c.last_contact ? new Date(c.last_contact).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No companies found.
                    </td>
                  </tr>
                )}
                {filteredCompanies.length > visibleCount && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center">
                      <button
                        onClick={() => setVisibleCount((n) => n + 100)}
                        className="text-sm text-primary hover:underline"
                      >
                        Load more ({filteredCompanies.length - visibleCount} remaining)
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === "calls" && (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">When</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Number</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Direction</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium tracking-[0.18em] uppercase">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {calls.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{c.to_number ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.direction ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.duration ? `${c.duration}s` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-md truncate">
                    {c.note || "—"}
                  </td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No calls logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <CompanyDrawer
          company={selected}
          readOnly
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const tone =
    status === "success"
      ? "bg-success/15 text-success"
      : status === "failed" || status === "noanswer" || status === "busy"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-foreground";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>{status ?? "—"}</span>
  );
}
