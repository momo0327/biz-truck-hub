import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanies, STATUS_META, STATUS_ORDER, type Company, type Status } from "@/lib/companies";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  CalendarIcon,
  Plus,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PhoneButtons } from "@/components/PhoneButtons";
import { VehiclesTable, type Vehicle } from "@/components/VehiclesTable";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listSchedulesForCompany,
  createSchedule,
  deleteSchedule,
  toggleScheduleDone,
  type ScheduledCall,
} from "@/lib/schedule";

export const Route = createFileRoute("/_app/call-mode")({ component: CallModePage });

// ─── Auto-answer helpers (shared with CompanyDrawer) ──────────────────────────
const AUTO_ANSWERS_KEY = "schedule_auto_answers";
const DEFAULT_ANSWERS = ["Follow-up call", "Återkoppla", "Prisförfrågan", "Boka möte"];
function loadAutoAnswers(): string[] {
  try {
    const raw = localStorage.getItem(AUTO_ANSWERS_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return DEFAULT_ANSWERS;
}
function saveAutoAnswers(list: string[]) {
  localStorage.setItem(AUTO_ANSWERS_KEY, JSON.stringify(list));
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function CallModePage() {
  const { companies, upsertCompany } = useCompanies();

  // Snapshot the "Ny" queue once on mount so navigating back works even after
  // a status change removes the company from the live filtered list.
  const [queue, setQueue] = useState<Company[]>([]);
  useEffect(() => {
    if (companies.length > 0 && queue.length === 0) {
      setQueue(companies.filter((c) => c.status === "new"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  // Keep queue entries up-to-date when company data changes (e.g. status change)
  // but never remove entries — so swiping back still works.
  useEffect(() => {
    if (queue.length === 0) return;
    setQueue((prev) =>
      prev.map((q) => companies.find((c) => c.id === q.id) ?? q),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  const [idx, setIdx] = useState(0);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const [animating, setAnimating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);

  const company = queue[idx] ?? null;

  function navigate(dir: "left" | "right") {
    if (animating) return;
    const next = dir === "right" ? idx + 1 : idx - 1;
    if (next < 0 || next >= queue.length) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setIdx(next);
      setDirection(null);
      setAnimating(false);
    }, 280);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") navigate("right");
      if (e.key === "ArrowLeft") navigate("left");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-8">
        <Phone className="size-12 opacity-20" />
        <p className="text-lg font-medium">No companies with status "Ny"</p>
        <p className="text-sm">All caught up!</p>
      </div>
    );
  }

  const slideClass = animating
    ? direction === "right"
      ? "-translate-x-16 opacity-0"
      : "translate-x-16 opacity-0"
    : "translate-x-0 opacity-100";

  return (
    <div className="relative flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-wide uppercase">Call Mode</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {idx + 1} of {queue.length} · Status: Ny
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("left")}
            disabled={idx === 0 || animating}
            className="size-9 inline-flex items-center justify-center rounded-full border hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-sm text-muted-foreground tabular-nums w-16 text-center">
            {idx + 1} / {queue.length}
          </span>
          <button
            onClick={() => navigate("right")}
            disabled={idx === queue.length - 1 || animating}
            className="size-9 inline-flex items-center justify-center rounded-full border hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="shrink-0 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((idx + 1) / queue.length) * 100}%` }}
        />
      </div>

      {/* Content area — relative so zones are scoped below header */}
      <div className="flex-1 min-h-0 relative">
        {/* Invisible click zones */}
        <button
          onClick={() => navigate("left")}
          disabled={idx === 0 || animating}
          className="absolute left-0 top-0 h-full w-36 z-10 disabled:pointer-events-none cursor-w-resize"
          aria-label="Previous"
        />
        <button
          onClick={() => navigate("right")}
          disabled={idx === queue.length - 1 || animating}
          className="absolute right-0 top-0 h-full w-36 z-10 disabled:pointer-events-none cursor-e-resize"
          aria-label="Next"
        />

        {/* Scrollable card */}
        <div className="h-full overflow-y-auto py-6 px-4">
        <div
          ref={cardRef}
          className={`max-w-2xl mx-auto transition-all duration-280 ease-in-out ${slideClass}`}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) < 50) return;
            navigate(dx < 0 ? "right" : "left");
          }}
        >
          {company && (
            <CompanyCard
              key={company.id}
              company={company}
              onCompanyChange={(c) => upsertCompany(c)}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Company Card ─────────────────────────────────────────────────────────────

function CompanyCard({
  company: initial,
  onCompanyChange,
}: {
  company: Company;
  onCompanyChange: (c: Company) => void;
}) {
  const [company, setCompany] = useState(initial);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [schedules, setSchedules] = useState<ScheduledCall[]>([]);
  const [schedTitle, setSchedTitle] = useState("Call");
  const [schedDate, setSchedDate] = useState<Date | undefined>(new Date());
  const [schedTime, setSchedTime] = useState("09:00");
  const [savingNotes, setSavingNotes] = useState(false);

  // Reset when company changes
  useEffect(() => {
    setCompany(initial);
    setNotes(initial.notes ?? "");
    setSchedTitle("Call");
    setSchedDate(new Date());
    setSchedTime("09:00");
    listSchedulesForCompany(initial.id).then(setSchedules).catch(() => {});
  }, [initial.id]);

  async function changeStatus(status: Status) {
    const { data, error } = await supabase
      .from("companies")
      .update({ status, last_contact: new Date().toISOString() })
      .eq("id", company.id)
      .select()
      .single();
    if (error) return toast.error(error.message);
    const row = data as Company;
    setCompany(row);
    onCompanyChange(row);
    toast.success(`Status: ${STATUS_META[status].label}`);
  }

  async function saveNotes() {
    const saved = company.notes ?? "";
    if (notes === saved) return;
    setSavingNotes(true);
    const stamp = new Date().toLocaleString("sv-SE", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).replace("T", " ");
    const stamped = `[${stamp}]\n${notes}`;
    const { data, error } = await supabase.from("companies").update({ notes: stamped }).eq("id", company.id).select().single();
    setSavingNotes(false);
    if (error) return toast.error(error.message);
    const row = data as Company;
    setNotes(stamped);
    setCompany(row);
    onCompanyChange(row);
    toast.success("Notes saved");
  }

  async function addSchedule() {
    if (!schedDate) return toast.error("Pick a date");
    const [hh, mm] = schedTime.split(":").map(Number);
    const dt = new Date(schedDate);
    dt.setHours(hh || 9, mm || 0, 0, 0);
    try {
      await createSchedule({ company_id: company.id, scheduled_at: dt.toISOString(), title: schedTitle.trim() || "Call" });
      toast.success("Scheduled");
      setSchedDate(new Date());
      setSchedTitle("Call");
      listSchedulesForCompany(company.id).then(setSchedules).catch(() => {});
    } catch (e: any) {
      toast.error(e.message ?? "Failed to schedule");
    }
  }

  const meta = STATUS_META[company.status];
  const researchPhones = (company.research_raw as any)?.phones as string[] | undefined;

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-wide">{company.name}</h2>
            {company.org_number && (
              <p className="text-xs text-muted-foreground mt-0.5">{company.org_number}</p>
            )}
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] uppercase px-2.5 py-1 rounded-full ${meta.tone}`}>
            <span className={`size-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>

        {/* Quick info row */}
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
          {company.address && <span>{company.address}</span>}
          {company.fleet_size && <span>· {company.fleet_size} fordon</span>}
          {company.contact_person && <span>· {company.contact_person}</span>}
          {company.website && (
            <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="size-3" /> Website
            </a>
          )}
        </div>

        {/* Phones */}
        <div className="mt-3">
          <PhoneButtons
            phones={company.phones ?? []}
            researchPhones={researchPhones}
            companyId={company.id}
            contactName={company.name}
          />
        </div>

      </div>

      {/* Status change */}
      <div className="bg-card border rounded-xl p-5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Change Status</h3>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.filter((s) => s !== "new").map((s) => {
            const m = STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] uppercase px-3 py-1.5 rounded-full border transition-colors hover:opacity-80 ${m.tone}`}
              >
                <span className={`size-1.5 rounded-full ${m.dot}`} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card border rounded-xl p-5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Internal Notes</h3>
        <CallModeNotesField value={notes} onChange={setNotes} onBlur={saveNotes} saving={savingNotes} />
      </div>

      {/* Vehicles */}
      {((company.vehicles as unknown) as Vehicle[])?.length > 0 && (
        <div className="bg-card border rounded-xl p-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Vehicles</h3>
          <VehiclesTable vehicles={(company.vehicles as unknown) as Vehicle[]} />
        </div>
      )}

      {/* Schedule a call */}
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Schedule a Call</h3>
        <div className="flex gap-2 items-center">
          <input
            value={schedTitle}
            onChange={(e) => setSchedTitle(e.target.value)}
            placeholder="Title"
            className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
          />
          <CallModeAutoAnswerPicker onSelect={setSchedTitle} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex-1 min-w-[140px] inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background text-sm">
                <CalendarIcon className="size-4 text-muted-foreground" />
                {schedDate
                  ? schedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                  : "Pick a date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={schedDate}
                onSelect={setSchedDate}
                defaultMonth={schedDate ?? new Date()}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <input
            type="time"
            value={schedTime}
            onChange={(e) => setSchedTime(e.target.value)}
            className="px-3 py-2 rounded-md border bg-background text-sm w-32"
          />
          <button
            onClick={addSchedule}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 inline-flex items-center gap-1"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>

        {schedules.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {schedules.map((s) => {
              const dt = new Date(s.scheduled_at);
              return (
                <li key={s.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                  <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button
                    onClick={async () => { await toggleScheduleDone(s.id, !s.done); listSchedulesForCompany(company.id).then(setSchedules).catch(() => {}); }}
                    className="text-xs px-2 py-1 rounded border hover:bg-muted"
                  >
                    {s.done ? "Undo" : "Done"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete?")) return;
                      await deleteSchedule(s.id);
                      listSchedulesForCompany(company.id).then(setSchedules).catch(() => {});
                    }}
                    className="size-7 inline-flex items-center justify-center rounded border hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Notes field with faded timestamps ────────────────────────────────────────

const STAMP_RE = /^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\])$/m;

function CallModeNotesField({
  value,
  onChange,
  onBlur,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { setEditing(false); onBlur(); }}
        rows={4}
        className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="Internal notes…"
      />
    );
  }

  if (!value) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="w-full px-3 py-2 rounded-md border bg-background text-sm text-muted-foreground cursor-text min-h-[72px]"
      >
        Internal notes…
      </div>
    );
  }

  const lines = value.split("\n");
  return (
    <div
      onClick={() => setEditing(true)}
      className="w-full px-3 py-2 rounded-md border bg-background text-sm cursor-text whitespace-pre-wrap min-h-[72px] leading-relaxed"
    >
      {lines.map((line, i) =>
        STAMP_RE.test(line)
          ? <span key={i} className="text-muted-foreground/50 text-xs">{line}{"\n"}</span>
          : <span key={i}>{line}{i < lines.length - 1 ? "\n" : ""}</span>
      )}
    </div>
  );
}

// ─── Auto-answer picker ───────────────────────────────────────────────────────

function CallModeAutoAnswerPicker({ onSelect }: { onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>(loadAutoAnswers);
  const [newAnswer, setNewAnswer] = useState("");

  function pick(a: string) { onSelect(a); setOpen(false); }

  function add() {
    const trimmed = newAnswer.trim();
    if (!trimmed || answers.includes(trimmed)) return;
    const updated = [...answers, trimmed];
    setAnswers(updated);
    saveAutoAnswers(updated);
    setNewAnswer("");
    onSelect(trimmed);
    setOpen(false);
  }

  function remove(a: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = answers.filter((x) => x !== a);
    setAnswers(updated);
    saveAutoAnswers(updated);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Quick titles" className="shrink-0 size-9 inline-flex items-center justify-center rounded-md border bg-background hover:bg-muted transition-colors">
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">Quick titles</p>
        <ul className="space-y-0.5">
          {answers.map((a) => (
            <li key={a}>
              <button type="button" onClick={() => pick(a)} className="group w-full flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-muted text-left">
                <span className="truncate">{a}</span>
                <span role="button" onClick={(e) => remove(a, e)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                  <Trash2 className="size-3" />
                </span>
              </button>
            </li>
          ))}
          {answers.length === 0 && <li className="text-xs text-muted-foreground italic px-2 py-1">No saved titles yet.</li>}
        </ul>
        <div className="flex gap-1.5 pt-1 border-t">
          <input
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="New title…"
            className="flex-1 px-2 py-1 text-xs rounded-md border bg-background"
          />
          <button type="button" onClick={add} disabled={!newAnswer.trim()} className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
