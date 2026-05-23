import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getEmployeeDetailFn } from "@/lib/admin.functions";
import { STATUS_META, type Status } from "@/lib/companies";
import { ArrowLeft, Mail, Phone, Building2, PhoneCall } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/$employeeId")({
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const fetchDetail = useServerFn(getEmployeeDetailFn);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-employee", employeeId],
    queryFn: () => fetchDetail({ data: { employeeId } }),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }

  const { employee, companies, calls } = data;

  return (
    <div className="p-8 max-w-7xl space-y-8">
      <div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to employees
        </Link>
      </div>

      <header>
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
      </header>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg">Companies ({companies.length})</h2>
        </div>
        <div className="rounded-lg border bg-card overflow-hidden">
          {companies.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No companies yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Phones</th>
                  <th className="text-left px-4 py-2 font-medium">Contact</th>
                  <th className="text-left px-4 py-2 font-medium">Last contact</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {companies.map((c) => {
                  const meta = STATUS_META[c.status as Status];
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{c.name}</div>
                        {c.org_number && (
                          <div className="text-xs text-muted-foreground">{c.org_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${meta.tone}`}>
                          {meta.emoji} {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {(c.phones ?? []).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {c.contact_person || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {c.last_contact
                          ? new Date(c.last_contact).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <PhoneCall className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg">Call log ({calls.length})</h2>
        </div>
        <div className="rounded-lg border bg-card overflow-hidden">
          {calls.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No calls yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">When</th>
                  <th className="text-left px-4 py-2 font-medium">Number</th>
                  <th className="text-left px-4 py-2 font-medium">Direction</th>
                  <th className="text-left px-4 py-2 font-medium">Duration</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">{c.to_number ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.direction ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.duration ? `${c.duration}s` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-md truncate">
                      {c.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
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
