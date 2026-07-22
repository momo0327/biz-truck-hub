import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCompanies } from "@/lib/companies";
import {
  listSchedules,
  deleteSchedule,
  toggleScheduleDone,
  isSameDay,
  type ScheduledCall,
} from "@/lib/schedule";
import { supabase } from "@/integrations/supabase/client";
import {
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyDrawer } from "@/components/CompanyDrawer";
import type { Company } from "@/lib/companies";

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: (s: Record<string, unknown>): { date?: string } => ({
    date: typeof s.date === "string" ? s.date : undefined,
  }),
  component: CalendarPage,
});

type View = "month" | "week";

const HOUR_HEIGHT = 56; // px per hour in week view
const DAY_START = 7; // 07:00
const DAY_END = 20; // 20:00

function CalendarPage() {
  const { companies, upsertCompany, removeCompanies } = useCompanies();
  const { date: dateParam } = useSearch({ from: "/_app/calendar" });
  const [items, setItems] = useState<ScheduledCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(dateParam ? "week" : "month");
  const [cursor, setCursor] = useState<Date>(() => {
    if (dateParam) { const d = new Date(dateParam); if (!isNaN(d.getTime())) return d; }
    return new Date();
  });
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.id, c.name);
    return m;
  }, [companies]);

  async function refresh() {
    try {
      const list = await listSchedules();
      setItems(list);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const ch = (supabase as any)
      .channel("schedules-cal")
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_calls" }, () =>
        refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  function navigate(dir: -1 | 1) {
    setCursor((prev) => {
      const d = new Date(prev);
      if (view === "month") {
        d.setMonth(d.getMonth() + dir);
      } else {
        d.setDate(d.getDate() + dir * 7);
      }
      return d;
    });
  }

  function goToday() { setCursor(new Date()); }

  const headerLabel = useMemo(() => {
    if (view === "month") {
      return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    const week = getWeekDays(cursor);
    const first = week[0];
    const last = week[6];
    const sameMonth = first.getMonth() === last.getMonth();
    if (sameMonth) {
      return `${first.toLocaleDateString(undefined, { month: "long" })} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [cursor, view]);

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={goToday}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
        >
          Today
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="size-8 inline-flex items-center justify-center rounded-md border hover:bg-muted transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => navigate(1)}
            className="size-8 inline-flex items-center justify-center rounded-md border hover:bg-muted transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <h1 className="font-display text-xl tracking-wide flex-1 min-w-0 truncate">{headerLabel}</h1>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button
            onClick={() => setView("month")}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded transition-colors ${view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <LayoutGrid className="size-3.5" />
            Month
          </button>
          <button
            onClick={() => setView("week")}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded transition-colors ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <CalendarDays className="size-3.5" />
            Week
          </button>
        </div>
      </div>

      {/* Views */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : view === "month" ? (
          <MonthView
            cursor={cursor}
            items={items}
            companyById={companyById}
            onDayClick={(d) => { setCursor(d); setView("week"); }}
            onDelete={async (id) => { await deleteSchedule(id); refresh(); }}
            onToggle={async (id, done) => { await toggleScheduleDone(id, done); refresh(); }}
            onCompanyClick={(companyId) => {
              const c = companies.find((co) => co.id === companyId) ?? null;
              setSelectedCompany(c);
            }}
          />
        ) : (
          <WeekView
            cursor={cursor}
            items={items}
            companyById={companyById}
            onDelete={async (id) => { await deleteSchedule(id); refresh(); }}
            onToggle={async (id, done) => { await toggleScheduleDone(id, done); refresh(); }}
            onCompanyClick={(companyId) => {
              const c = companies.find((co) => co.id === companyId) ?? null;
              setSelectedCompany(c);
            }}
          />
        )}
      </div>

      {selectedCompany && (
        <CompanyDrawer
          company={companies.find((c) => c.id === selectedCompany.id) ?? selectedCompany}
          onClose={() => setSelectedCompany(null)}
          onCompanyChange={(c: Company) => { upsertCompany(c); setSelectedCompany(c); }}
          onCompanyDeleted={(id: string) => { removeCompanies([id]); setSelectedCompany(null); }}
        />
      )}
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────

function MonthView({
  cursor,
  items,
  companyById,
  onDayClick,
  onDelete,
  onToggle,
  onCompanyClick,
}: {
  cursor: Date;
  items: ScheduledCall[];
  companyById: Map<string, string>;
  onDayClick: (d: Date) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onCompanyClick: (companyId: string) => void;
}) {
  const today = new Date();
  const grid = buildMonthGrid(cursor);

  return (
    <div className="h-full flex flex-col border rounded-xl overflow-hidden bg-card">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
          {grid.map((day, i) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = isSameDay(day, today);
            const dayItems = items
              .filter((s) => isSameDay(new Date(s.scheduled_at), day))
              .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

            return (
              <div
                key={i}
                className={`border-b border-r p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-muted/30 transition-colors ${!inMonth ? "bg-muted/10" : ""}`}
                onClick={() => onDayClick(day)}
              >
                <div className="flex items-center">
                  <span
                    className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayItems.slice(0, 3).map((s) => (
                    <EventChip
                      key={s.id}
                      schedule={s}
                      companyById={companyById}
                      onDelete={onDelete}
                      onToggle={onToggle}
                      onCompanyClick={onCompanyClick}
                    />
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayItems.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventChip({
  schedule: s,
  companyById,
  onDelete,
  onToggle,
  onCompanyClick,
}: {
  schedule: ScheduledCall;
  companyById: Map<string, string>;
  onDelete: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onCompanyClick: (companyId: string) => void;
}) {
  const time = new Date(s.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const company = companyById.get(s.company_id) ?? s.title;

  return (
    <div
      className={`group flex items-center gap-1 rounded px-1 py-0.5 text-[10px] truncate cursor-pointer ${
        s.done
          ? "bg-muted text-muted-foreground line-through"
          : "bg-primary/10 text-primary border border-primary/20"
      }`}
      onClick={(e) => { e.stopPropagation(); onCompanyClick(s.company_id); }}
    >
      <span className="tabular-nums shrink-0">{time}</span>
      <span className="truncate flex-1">{company}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(s.id, !s.done); }}
        className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
        title={s.done ? "Mark not done" : "Mark done"}
      >
        <Check className="size-2.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) onDelete(s.id); }}
        className="opacity-0 group-hover:opacity-100 shrink-0 text-destructive transition-opacity"
      >
        <Trash2 className="size-2.5" />
      </button>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  cursor,
  items,
  companyById,
  onDelete,
  onToggle,
  onCompanyClick,
}: {
  cursor: Date;
  items: ScheduledCall[];
  companyById: Map<string, string>;
  onDelete: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onCompanyClick: (companyId: string) => void;
}) {
  const today = new Date();
  const week = getWeekDays(cursor);
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  // Compute per-hour heights based on how many events fall in each slot across all days
  const MIN_HOUR_H = HOUR_HEIGHT;
  const EVENT_MIN_H = 36;
  const EVENT_GAP = 2;

  const hourHeights = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of items) {
      const d = new Date(s.scheduled_at);
      const h = d.getHours();
      if (h < DAY_START || h >= DAY_END) continue;
      counts.set(h, Math.max(counts.get(h) ?? 0, 1));
    }
    // Count max events per hour across all days
    for (const day of week) {
      const dayItems = items.filter((s) => isSameDay(new Date(s.scheduled_at), day));
      const byHour = new Map<number, number>();
      for (const s of dayItems) {
        const h = new Date(s.scheduled_at).getHours();
        byHour.set(h, (byHour.get(h) ?? 0) + 1);
      }
      for (const [h, count] of byHour) {
        counts.set(h, Math.max(counts.get(h) ?? 0, count));
      }
    }
    return hours.map((h) => {
      const count = counts.get(h) ?? 0;
      return Math.max(MIN_HOUR_H, count * (EVENT_MIN_H + EVENT_GAP) + EVENT_GAP + 4);
    });
  }, [items, week]);

  // Compute cumulative top offsets per hour
  const hourTops = useMemo(() => {
    const tops: number[] = [];
    let acc = 0;
    for (const h of hourHeights) { tops.push(acc); acc += h; }
    return tops;
  }, [hourHeights]);

  const totalHeight = hourHeights.reduce((a, b) => a + b, 0);

  // Helper: get pixel top for a given fractional hour
  function hourToTop(hour: number): number {
    const floorH = Math.floor(hour);
    const idx = floorH - DAY_START;
    if (idx < 0) return 0;
    if (idx >= hourHeights.length) return totalHeight;
    const frac = hour - floorH;
    return hourTops[idx] + frac * hourHeights[idx];
  }

  return (
    <div className="h-full flex flex-col border rounded-xl overflow-hidden bg-card">
      {/* Day header row */}
      <div className="flex border-b bg-muted/40 shrink-0">
        <div className="w-14 shrink-0" />
        {week.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={day.toISOString()} className="flex-1 py-2 text-center border-l">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div
                className={`mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${
                  isToday ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex" style={{ minHeight: totalHeight }}>
          {/* Hour labels */}
          <div className="w-14 shrink-0 relative" style={{ height: totalHeight }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute w-full pr-2 text-right text-[10px] text-muted-foreground"
                style={{ top: hourTops[i] + 4 }}
              >
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {week.map((day) => {
            const isToday = isSameDay(day, today);
            const dayItems = items.filter((s) => isSameDay(new Date(s.scheduled_at), day));

            return (
              <div
                key={day.toISOString()}
                className={`flex-1 relative border-l ${isToday ? "bg-primary/5" : ""}`}
                style={{ height: totalHeight }}
              >
                {/* Hour lines */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-border/40"
                    style={{ top: hourTops[i] }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && <CurrentTimeLine />}

                {/* Events — stacked within their expanded hour slot */}
                {stackEvents(dayItems, hourToTop, hourHeights, hourTops).map(({ schedule: s, top, height }) => (
                  <WeekEvent
                    key={s.id}
                    schedule={s}
                    top={top}
                    height={height}
                    companyById={companyById}
                    onDelete={onDelete}
                    onToggle={onToggle}
                    onCompanyClick={onCompanyClick}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Group events by hour slot, distribute them evenly within that slot's dynamic height
function stackEvents(
  events: ScheduledCall[],
  hourToTop: (hour: number) => number,
  hourHeights: number[],
  hourTops: number[],
): { schedule: ScheduledCall; top: number; height: number }[] {
  const sorted = [...events].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const groups = new Map<number, ScheduledCall[]>();
  for (const s of sorted) {
    const d = new Date(s.scheduled_at);
    const h = d.getHours();
    if (h < DAY_START || h >= DAY_END) continue;
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h)!.push(s);
  }

  const result: { schedule: ScheduledCall; top: number; height: number }[] = [];
  for (const [h, group] of groups) {
    const idx = h - DAY_START;
    const slotH = hourHeights[idx] ?? HOUR_HEIGHT;
    const slotTop = hourTops[idx] ?? 0;
    const count = group.length;
    const gap = 2;
    const itemH = Math.max(32, Math.floor((slotH - gap) / count) - gap);
    group.forEach((s, i) => {
      result.push({ schedule: s, top: slotTop + gap + i * (itemH + gap), height: itemH });
    });
  }

  return result;
}

function WeekEvent({
  schedule: s,
  top,
  height,
  companyById,
  onDelete,
  onToggle,
  onCompanyClick,
}: {
  schedule: ScheduledCall;
  top: number;
  height: number;
  companyById: Map<string, string>;
  onDelete: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onCompanyClick: (companyId: string) => void;
}) {
  const d = new Date(s.scheduled_at);
  const hour = d.getHours() + d.getMinutes() / 60;
  const company = companyById.get(s.company_id) ?? s.title;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (hour < DAY_START || hour >= DAY_END) return null;

  return (
    <div
      className={`group absolute left-1 right-1 rounded-md px-2 py-1 text-xs overflow-hidden cursor-pointer ${
        s.done
          ? "bg-muted border border-border text-muted-foreground"
          : "bg-primary/15 border border-primary/30 text-primary"
      }`}
      style={{ top, height }}
      onClick={() => onCompanyClick(s.company_id)}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className={`font-medium truncate ${s.done ? "line-through" : ""}`}>{company}</div>
          <div className="text-[10px] tabular-nums opacity-70">{time}</div>
          {s.note && <div className="text-[10px] opacity-60 truncate">{s.note}</div>}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(s.id, !s.done); }}
            className="size-5 flex items-center justify-center rounded hover:bg-black/10"
            title={s.done ? "Mark not done" : "Mark done"}
          >
            <Check className="size-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) onDelete(s.id); }}
            className="size-5 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CurrentTimeLine() {
  const [top, setTop] = useState(() => computeTimeTop());

  useEffect(() => {
    const id = setInterval(() => setTop(computeTimeTop()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (top === null) return null;

  return (
    <div className="absolute left-0 right-0 z-10 flex items-center pointer-events-none" style={{ top }}>
      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
      <div className="flex-1 border-t border-red-500" />
    </div>
  );
}

function computeTimeTop(): number | null {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour < DAY_START || hour >= DAY_END) return null;
  return (hour - DAY_START) * HOUR_HEIGHT;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMonthGrid(cursor: Date): Date[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun
  const endPad = (7 - ((startOffset + lastDay.getDate()) % 7)) % 7;

  const grid: Date[] = [];
  for (let i = startOffset; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    grid.push(d);
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    grid.push(new Date(year, month, d));
  }
  for (let i = 1; i <= endPad; i++) {
    grid.push(new Date(year, month + 1, i));
  }
  return grid;
}

function getWeekDays(cursor: Date): Date[] {
  const d = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  const day = d.getDay(); // 0=Sun
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(sunday);
    dd.setDate(sunday.getDate() + i);
    return dd;
  });
}
