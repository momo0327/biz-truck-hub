import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies } from "@/lib/companies";
import type { CallLog } from "@/lib/companies";

export const Route = createFileRoute("/_app/calls")({
  component: CallsHistoryPage,
});

function CallsHistoryPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const { companies } = useCompanies();

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.id, c.name);
    return m;
  }, [companies]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      setCalls((data ?? []) as CallLog[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("call_logs-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_logs" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCalls((prev) => [payload.new as CallLog, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setCalls((prev) =>
              prev.map((c) => (c.id === (payload.new as CallLog).id ? (payload.new as CallLog) : c)),
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id?: string };
            if (oldRow?.id) setCalls((prev) => prev.filter((c) => c.id !== oldRow.id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return calls;
    return calls.filter((c) => {
      const name = (c.company_id && companyById.get(c.company_id)) || "";
      return (
        name.toLowerCase().includes(term) ||
        (c.to_number ?? "").toLowerCase().includes(term) ||
        (c.note ?? "").toLowerCase().includes(term) ||
        (c.status ?? "").toLowerCase().includes(term)
      );
    });
  }, [calls, companyById, q]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl">Call history</h1>
          <p className="text-sm text-muted-foreground">All calls placed and received.</p>
        </div>
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, number, note…"
            className="pl-9 pr-3 py-2 rounded-md border bg-background text-sm w-72"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">When</th>
              <th className="text-left px-4 py-2.5 font-medium">Direction</th>
              <th className="text-left px-4 py-2.5 font-medium">Company</th>
              <th className="text-left px-4 py-2.5 font-medium">Number</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Duration</th>
              <th className="text-left px-4 py-2.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground italic">
                  No calls yet.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const isOutbound = c.direction !== "inbound";
              const Icon = isOutbound ? PhoneOutgoing : PhoneIncoming;
              const name = (c.company_id && companyById.get(c.company_id)) || "—";
              return (
                <tr key={c.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Icon className={`size-3.5 ${isOutbound ? "text-primary" : "text-success"}`} />
                      {isOutbound ? "Outbound" : "Inbound"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">{name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{c.to_number ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.status ? (
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {c.status}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {typeof c.duration === "number" && c.duration > 0 ? `${c.duration}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 max-w-sm truncate" title={c.note ?? ""}>
                    {c.note || <span className="text-muted-foreground italic">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
