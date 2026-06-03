import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { useCompanies } from "@/lib/companies";
import {
  listSchedules,
  deleteSchedule,
  toggleScheduleDone,
  isSameDay,
  getWeekFromToday,
  type ScheduledCall,
} from "@/lib/schedule";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Check, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/calendar")({ component: CalendarPage });

function CalendarPage() {
  const { companies } = useCompanies();
  const [items, setItems] = useState<ScheduledCall[]>([]);
  const [selected, setSelected] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

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
      .channel("schedules")
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

  const datesWithEvents = useMemo(() => items.map((i) => new Date(i.scheduled_at)), [items]);
  const forSelected = items
    .filter((i) => isSameDay(new Date(i.scheduled_at), selected))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return (
    <div className="p-8 space-y-6 w-full">
      <header>
        <h1 className="font-display text-3xl tracking-wide uppercase">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All scheduled calls across your pipeline.
        </p>
      </header>

      <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
        <div className="bg-card border rounded-xl p-3">
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

        <div className="bg-card border rounded-xl p-6 min-h-[300px]">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-xl tracking-wide uppercase">
              {selected.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h2>
            <span className="text-xs text-muted-foreground">{forSelected.length} scheduled</span>
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
                      <div className="text-xs text-muted-foreground truncate">
                        {companyById.get(s.company_id) ?? "Unknown company"}
                        {s.note ? ` · ${s.note}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await toggleScheduleDone(s.id, !s.done);
                        refresh();
                      }}
                      className="size-8 inline-flex items-center justify-center rounded-md border hover:bg-muted"
                      title={s.done ? "Mark not done" : "Mark done"}
                    >
                      <Check className={`size-4 ${s.done ? "text-success" : "text-muted-foreground"}`} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this scheduled call?")) return;
                        await deleteSchedule(s.id);
                        refresh();
                      }}
                      className="size-8 inline-flex items-center justify-center rounded-md border hover:bg-destructive/10 text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <WeekPreview schedules={items} companyById={companyById} />
    </div>
  );
}

function WeekPreview({
  schedules,
  companyById,
}: {
  schedules: ScheduledCall[];
  companyById: Map<string, string>;
}) {
  const week = getWeekFromToday();
  return (
    <section className="bg-card border rounded-xl p-6">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-xl tracking-wide uppercase">This week</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your scheduled calls for the next 7 days.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {week.map((day, idx) => {
          const dayItems = schedules
            .filter((s) => isSameDay(new Date(s.scheduled_at), day))
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
          const isToday = idx === 0;
          return (
            <div
              key={day.toISOString()}
              className={`rounded-lg border bg-background/50 p-3 flex flex-col gap-2 min-h-[120px] ${isToday ? "border-primary/50" : ""}`}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div className={`text-lg font-display ${isToday ? "text-primary" : ""}`}>
                  {day.getDate()}
                </div>
              </div>
              <div className="space-y-1.5">
                {dayItems.length === 0 && (
                  <div className="text-[11px] text-muted-foreground italic">—</div>
                )}
                {dayItems.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="block bg-card border rounded-md px-2 py-1.5"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
                      <CalendarIcon className="size-2.5" />
                      {new Date(s.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="text-xs font-medium truncate">
                      {companyById.get(s.company_id) ?? s.title}
                    </div>
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
