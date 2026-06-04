import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  Search,
  Check,
  X,
  PhoneCall,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CallLog } from "@/lib/companies";

export const Route = createFileRoute("/_app/calls")({
  component: CallsHistoryPage,
});

type CallFilter = "all" | "outbound" | "answered" | "not_answered";

const ANSWERED_STATUSES = new Set(["answered", "success", "completed"]);
const NOT_ANSWERED_STATUSES = new Set(["no-answer", "noanswer", "missed", "failed", "busy", "voicemail"]);
function isAnswered(c: { status?: string | null; duration?: number | null }) {
  if (c.status && ANSWERED_STATUSES.has(c.status)) return true;
  if ((c.duration ?? 0) > 0) return true;
  return false;
}
function isNotAnswered(c: { status?: string | null; duration?: number | null }) {
  if (isAnswered(c)) return false;
  if (c.status && NOT_ANSWERED_STATUSES.has(c.status)) return true;
  return false;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDuration(s: number | null | undefined) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function dayLabel(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return target.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function CallsHistoryPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CallFilter>("all");
  const [companyNames, setCompanyNames] = useState<Map<string, string>>(new Map());

  const companyById = companyNames;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      const rows = (data ?? []) as CallLog[];
      setCalls(rows);
      const ids = Array.from(new Set(rows.map((r) => r.company_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: comps } = await supabase.from("companies").select("id,name").in("id", ids);
        const m = new Map<string, string>();
        for (const c of (comps ?? []) as { id: string; name: string }[]) m.set(c.id, c.name);
        setCompanyNames(m);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel("call_logs-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_logs" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as CallLog;
            setCalls((prev) => [row, ...prev]);
            if (row.company_id) {
              setCompanyNames((prev) => {
                if (prev.has(row.company_id!)) return prev;
                supabase.from("companies").select("id,name").eq("id", row.company_id!).maybeSingle()
                  .then(({ data }) => {
                    if (data) setCompanyNames((p) => new Map(p).set(data.id, data.name));
                  });
                return prev;
              });
            }
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

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const isToday = (c: CallLog) => new Date(c.created_at).toDateString() === today;
    const todays = calls.filter(isToday);
    const inbound = calls.filter((c) => c.direction === "inbound").length;
    const outbound = calls.filter((c) => c.direction !== "inbound").length;
    const answered = calls.filter((c) => c.status === "answered" || (c.duration ?? 0) > 0).length;
    const totalSec = calls.reduce((acc, c) => acc + (c.duration ?? 0), 0);
    return {
      total: todays.length,
      totalAll: calls.length,
      inbound,
      outbound,
      connectRate: calls.length ? Math.round((answered / calls.length) * 100) : 0,
      talkHrs: (totalSec / 3600).toFixed(1),
    };
  }, [calls]);

  const counts = useMemo(() => {
    return {
      all: calls.length,
      outbound: calls.filter((c) => c.direction !== "inbound").length,
      answered: calls.filter(isAnswered).length,
      not_answered: calls.filter(isNotAnswered).length,
    };
  }, [calls]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return calls.filter((c) => {
      const name = (c.company_id && companyById.get(c.company_id)) || "";
      if (filter === "outbound" && c.direction === "inbound") return false;
      if (filter === "answered" && !isAnswered(c)) return false;
      if (filter === "not_answered" && !isNotAnswered(c)) return false;
      if (!term) return true;
      return (
        name.toLowerCase().includes(term) ||
        (c.to_number ?? "").toLowerCase().includes(term) ||
        (c.note ?? "").toLowerCase().includes(term) ||
        (c.status ?? "").toLowerCase().includes(term)
      );
    });
  }, [calls, companyById, q, filter]);

  // Group by day
  const grouped = useMemo(() => {
    const groups = new Map<string, CallLog[]>();
    for (const c of filtered) {
      const key = dayLabel(new Date(c.created_at));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-end gap-4 flex-wrap">
        <h1 className="font-display text-3xl tracking-wide">Call History</h1>
        <p className="text-sm text-muted-foreground mb-1">All inbound and outbound calls across your team</p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total calls" value={stats.total.toString()} suffix="today" />
        <KpiCard label="Inbound" value={stats.inbound.toString()} />
        <KpiCard label="Outbound" value={stats.outbound.toString()} />
        <KpiCard label="Connect rate" value={stats.connectRate.toString()} suffix="%" />
        <KpiCard label="Talk time" value={stats.talkHrs} suffix="hrs" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company, contact, or number…"
            className="w-full pl-9 pr-3 py-2.5 rounded-full border bg-card text-sm placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              ["all", "All", counts.all],
              ["outbound", "Outbound", counts.outbound],
              ["answered", "Answered", counts.answered],
              ["not_answered", "Not answered", counts.not_answered],
            ] as const
          ).map(([key, label, n]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key as CallFilter)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
                }`}
              >
                {label}
                <span
                  className={`text-[11px] rounded-full px-1.5 py-0.5 ${
                    active ? "bg-white/20" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
              <th className="text-left px-5 py-3 w-12"></th>
              <th className="text-left px-3 py-3">Company</th>
              <th className="text-left px-3 py-3">Contact</th>
              <th className="text-left px-3 py-3">Outcome</th>
              <th className="text-left px-3 py-3">Duration</th>
              <th className="text-left px-3 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground italic">
                  No calls match this filter.
                </td>
              </tr>
            )}
            {grouped.map(([day, rows]) => (
              <Fragment key={`g-${day}`}>
                <tr key={`g-${day}`} className="bg-muted/40">
                  <td colSpan={6} className="px-5 py-2 text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
                    {day} · {rows.length} calls
                  </td>
                </tr>
                {rows.map((c) => {
                  const isOutbound = c.direction !== "inbound";
                  const isMissed = ["no-answer", "missed", "failed"].includes(c.status ?? "");
                  const isVoicemail = c.status === "voicemail";
                  const DirIcon = isMissed ? PhoneMissed : isOutbound ? PhoneOutgoing : PhoneIncoming;
                  const dirColor = isMissed
                    ? "bg-destructive/10 text-destructive"
                    : isOutbound
                      ? "bg-muted text-muted-foreground"
                      : "bg-success/15 text-success";
                  const name = (c.company_id && companyById.get(c.company_id)) || "Unknown";
                  const outcome = isVoicemail
                    ? { label: "voicemail", tone: "bg-muted text-foreground", icon: Voicemail }
                    : isMissed
                      ? { label: "no answer", tone: "bg-muted text-foreground", icon: X }
                      : c.status === "callback"
                        ? { label: "callback", tone: "bg-primary text-primary-foreground", icon: PhoneCall }
                        : { label: "answered", tone: "bg-success/15 text-success", icon: Check };
                  const OutIcon = outcome.icon;
                  return (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center justify-center size-9 rounded-full ${dirColor}`}
                        >
                          <DirIcon className="size-4" />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center justify-center size-9 rounded-md bg-muted text-[11px] font-semibold tracking-wide text-muted-foreground">
                            {initials(name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {isOutbound ? "Outbound" : "Inbound"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{c.note?.split(" — ")[0] || "—"}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{c.to_number ?? "—"}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${outcome.tone}`}>
                          <OutIcon className="size-3" /> {outcome.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{formatDuration(c.duration)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>

                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-5">
      <div className="text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-4xl leading-none tracking-tight">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
