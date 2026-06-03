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
import { Trash2, Check, Calendar as CalendarIcon, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
    </div>
  );
}
