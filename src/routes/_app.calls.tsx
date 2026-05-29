import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  Search,
  Filter as FilterIcon,
  Calendar,
  Play,
  MoreHorizontal,
  Check,
  X,
  PhoneCall,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies } from "@/lib/companies";
import type { CallLog } from "@/lib/companies";

export const Route = createFileRoute("/_app/calls")({
  component: CallsHistoryPage,
});

type CallFilter = "all" | "inbound" | "outbound" | "missed" | "voicemail" | "recorded";

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
      inbound: calls.filter((c) => c.direction === "inbound").length,
      outbound: calls.filter((c) => c.direction !== "inbound").length,
      missed: calls.filter((c) => c.status === "no-answer" || c.status === "missed" || c.status === "failed").length,
      voicemail: calls.filter((c) => c.status === "voicemail").length,
      recorded: calls.filter((c) => (c.duration ?? 0) > 0).length,
    };
  }, [calls]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return calls.filter((c) => {
      const name = (c.company_id && companyById.get(c.company_id)) || "";
      if (filter === "inbound" && c.direction !== "inbound") return false;
      if (filter === "outbound" && c.direction === "inbound") return false;
      if (filter === "missed" && !["no-answer", "missed", "failed"].includes(c.status ?? "")) return false;
      if (filter === "voicemail" && c.status !== "voicemail") return false;
      if (filter === "recorded" && !(c.duration ?? 0)) return false;
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
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total calls" value={stats.total.toString()} suffix="today" delta="+12.4%" />
        <KpiCard label="Inbound" value={stats.inbound.toString()} delta="+8" />
        <KpiCard label="Outbound" value={stats.outbound.toString()} delta="+24" />
        <KpiCard label="Connect rate" value={stats.connectRate.toString()} suffix="%" delta="+3.1pt" />
        <KpiCard label="Talk time" value={stats.talkHrs} suffix="hrs" delta="+1.2h" />
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
              ["inbound", "Inbound", counts.inbound],
              ["outbound", "Outbound", counts.outbound],
              ["missed", "Missed", counts.missed],
              ["voicemail", "Voicemail", counts.voicemail],
              ["recorded", "Recorded", counts.recorded],
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
        <div className="flex items-center gap-2 ml-auto">
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm hover:bg-muted">
            <Calendar className="size-4" /> May 18 – May 25
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm hover:bg-muted">
            <FilterIcon className="size-4" /> Agent
          </button>
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
              <th className="text-left px-3 py-3">Recording</th>
              <th className="px-3 py-3"></th>
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
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground italic">
                  No calls match this filter.
                </td>
              </tr>
            )}
            {grouped.map(([day, rows]) => (
              <Fragment key={`g-${day}`}>
                <tr key={`g-${day}`} className="bg-muted/40">
                  <td colSpan={8} className="px-5 py-2 text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
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
                      <td className="px-3 py-3">
                        {(c.duration ?? 0) > 0 ? (
                          <button className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border bg-card text-xs hover:bg-muted">
                            <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground">
                              <Play className="size-3" />
                            </span>
                            Play
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                            {isVoicemail ? <Voicemail className="size-3.5" /> : <span className="opacity-30">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                          <MoreHorizontal className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </>
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
  delta,
}: {
  label: string;
  value: string;
  suffix?: string;
  delta?: string;
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
      {delta && <div className="mt-3 text-xs text-success">{delta}</div>}
    </div>
  );
}
