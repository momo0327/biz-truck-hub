import { useEffect, useState, useContext, useRef } from "react";
import { X, Loader2, RefreshCw, ExternalLink, Trash2, Calendar as CalendarIcon, Plus, PhoneCall, Copy, Check, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { researchCompanyFn } from "@/lib/research.functions";
import { STATUS_META, STATUS_ORDER, type Company, type CallLog, type Status } from "@/lib/companies";
import { useCustomStatuses, STATUS_COLORS, type CustomStatus } from "@/lib/custom-statuses";
import { PhoneButtons } from "./PhoneButtons";
import { VehiclesTable, type Vehicle } from "./VehiclesTable";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listSchedulesForCompany,
  createSchedule,
  deleteSchedule,
  toggleScheduleDone,
  type ScheduledCall,
} from "@/lib/schedule";
import { toast } from "sonner";
import { SoftphoneContext } from "@/components/softphone/SoftphoneProvider";

export function CompanyDrawer({ company: initial, onClose, onCompanyChange, onCompanyDeleted, readOnly = false }: { company: Company; onClose: () => void; onCompanyChange?: (company: Company) => void; onCompanyDeleted?: (id: string) => void; readOnly?: boolean }) {
  const [company, setCompany] = useState<Company>(initial);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [researching, setResearching] = useState(false);
  const [schedules, setSchedules] = useState<ScheduledCall[]>([]);
  const [schedDate, setSchedDate] = useState<Date | undefined>(new Date());
  const [schedTime, setSchedTime] = useState("09:00");
  const [schedTitle, setSchedTitle] = useState("Call");
  const [dialNumber, setDialNumber] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const softphone = useContext(SoftphoneContext);
  const research = useServerFn(researchCompanyFn);
  const { customStatuses, createCustomStatus, deleteCustomStatus } = useCustomStatuses();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusColor, setNewStatusColor] = useState(STATUS_COLORS[0].value);

  // Sync when parent passes a different company (e.g. realtime update arrived).
  useEffect(() => {
    setCompany(initial);
    setNotes(initial.notes ?? "");
  }, [initial]);

  useEffect(() => {
    supabase
      .from("call_logs")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCalls(data ?? []));
  }, [company.id]);

  async function refreshSchedules() {
    try {
      const list = await listSchedulesForCompany(company.id);
      setSchedules(list);
    } catch {}
  }
  useEffect(() => {
    refreshSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  async function addSchedule() {
    if (!schedDate) return toast.error("Pick a date");
    const [hh, mm] = schedTime.split(":").map(Number);
    const dt = new Date(schedDate);
    dt.setHours(hh || 9, mm || 0, 0, 0);
    try {
      await createSchedule({
        company_id: company.id,
        scheduled_at: dt.toISOString(),
        title: schedTitle.trim() || "Call",
      });
      toast.success("Scheduled");
      setSchedDate(undefined);
      setSchedTitle("Call");
      refreshSchedules();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to schedule");
    }
  }

  async function refetchCompany() {
    const { data } = await supabase.from("companies").select("*").eq("id", company.id).single();
    if (data) {
      const row = data as Company;
      setCompany(row);
      onCompanyChange?.(row);
    }
  }

  async function doResearch() {
    setResearching(true);
    try {
      const res = await research({ data: { companyId: company.id } });
      if (res.ok) {
        toast.success("Research complete");
        await refetchCompany();
      } else toast.error(res.error ?? "Research failed");
    } catch (e: any) {
      toast.error(e.message ?? "Research failed");
    } finally {
      setResearching(false);
    }
  }

  async function changeStatus(status: Status) {
    const { data, error } = await supabase
      .from("companies")
      .update({ status, custom_status_id: null, last_contact: new Date().toISOString() })
      .eq("id", company.id)
      .select()
      .single();
    if (error) return toast.error(error.message);
    const row = data as Company;
    setCompany(row);
    onCompanyChange?.(row);
  }

  async function changeCustomStatus(cs: CustomStatus) {
    const { data, error } = await supabase
      .from("companies")
      .update({ custom_status_id: cs.id, last_contact: new Date().toISOString() })
      .eq("id", company.id)
      .select()
      .single();
    if (error) return toast.error(error.message);
    const row = data as Company;
    setCompany(row);
    onCompanyChange?.(row);
  }

  async function saveNotes() {
    const saved = company.notes ?? "";
    if (notes === saved) return;
    const stamp = new Date().toLocaleString("sv-SE", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).replace("T", " ");
    const stamped = `[${stamp}]\n${notes}`;
    const { data, error } = await supabase.from("companies").update({ notes: stamped }).eq("id", company.id).select().single();
    if (error) return toast.error(error.message);
    const row = data as Company;
    setNotes(stamped);
    setCompany(row);
    onCompanyChange?.(row);
    toast.success("Notes saved");
  }

  async function addCall() {
    if (!note.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("call_logs")
      .insert({ company_id: company.id, user_id: u.user.id, note })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setCalls((c) => [data, ...c]);
    setNote("");
    const { data: updated } = await supabase
      .from("companies")
      .update({ last_contact: new Date().toISOString() })
      .eq("id", company.id)
      .select()
      .single();
    if (updated) {
      const row = updated as Company;
      setCompany(row);
      onCompanyChange?.(row);
    }
  }

  async function deleteCompany() {
    if (!confirm("Delete this company?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    if (error) return toast.error(error.message);
    onCompanyDeleted?.(company.id);
    onClose();
  }

  const sources = (company.research_raw as any)?.sources as string[] | undefined;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={onClose}>
      <div
        className="bg-card w-full max-w-xl h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display text-xl truncate">{company.name}</h3>
              <QuickCopy value={company.name} />
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground">Org: {company.org_number ?? "—"}</p>
              {company.org_number && <QuickCopy value={company.org_number} />}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!readOnly && (
              <button onClick={deleteCompany} className="p-2 rounded-md hover:bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-md hover:bg-muted">
              <X className="size-5" />
            </button>
          </div>

        </div>

        <div className="p-6 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact</h4>
              {!readOnly && (
                <button
                  onClick={doResearch}
                  disabled={researching}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {researching ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  {company.researched_at ? "Re-research" : "Research with AI"}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <PhoneButtons
                phones={company.phones ?? []}
                researchPhones={(company.research_raw as any)?.phones ?? undefined}
                companyId={company.id}
                contactName={company.name}
              />
              {!readOnly && (
                addingPhone ? (
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") { setAddingPhone(false); setNewPhone(""); }
                        if (e.key === "Enter" && newPhone.trim()) {
                          setSavingPhone(true);
                          const phones = [...(company.phones ?? []), newPhone.trim()];
                          const { error } = await supabase.from("companies").update({ phones }).eq("id", company.id);
                          setSavingPhone(false);
                          if (error) return toast.error(error.message);
                          const updated = { ...company, phones };
                          setCompany(updated); onCompanyChange?.(updated);
                          setNewPhone(""); setAddingPhone(false);
                        }
                      }}
                      placeholder="+46 70 000 00 00"
                      className="flex-1 px-2.5 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      disabled={!newPhone.trim() || savingPhone}
                      onClick={async () => {
                        if (!newPhone.trim()) return;
                        setSavingPhone(true);
                        const phones = [...(company.phones ?? []), newPhone.trim()];
                        const { error } = await supabase.from("companies").update({ phones }).eq("id", company.id);
                        setSavingPhone(false);
                        if (error) return toast.error(error.message);
                        const updated = { ...company, phones };
                        setCompany(updated); onCompanyChange?.(updated);
                        setNewPhone(""); setAddingPhone(false);
                      }}
                      className="px-2.5 py-1.5 rounded-md border bg-background text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      {savingPhone ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                    </button>
                    <button onClick={() => { setAddingPhone(false); setNewPhone(""); }} className="px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setAddingPhone(true)} className="text-xs text-muted-foreground hover:text-foreground">
                    + Add number
                  </button>
                )
              )}
            </div>
            {softphone && (
              <div className="flex gap-1.5 mt-1 items-center">
                <input
                  value={dialNumber}
                  onChange={(e) => setDialNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && dialNumber.trim()) { softphone.startCall({ number: dialNumber.trim(), contactName: company.name, companyId: company.id }); setDialNumber(""); }
                  }}
                  placeholder="+46 70 000 00 00"
                  className="w-56 px-2.5 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  disabled={!dialNumber.trim()}
                  onClick={() => { softphone.startCall({ number: dialNumber.trim(), contactName: company.name, companyId: company.id }); setDialNumber(""); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border bg-background text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <PhoneCall className="size-3.5" /> Call
                </button>
                {!readOnly && (
                  <button
                    disabled={!dialNumber.trim() || savingPhone}
                    onClick={async () => {
                      if (!dialNumber.trim()) return;
                      setSavingPhone(true);
                      const phones = [...(company.phones ?? []), dialNumber.trim()];
                      const { error } = await supabase.from("companies").update({ phones }).eq("id", company.id);
                      setSavingPhone(false);
                      if (error) return toast.error(error.message);
                      const updated = { ...company, phones };
                      setCompany(updated); onCompanyChange?.(updated);
                      toast.success("Number saved");
                    }}
                    className="px-2.5 py-1.5 rounded-md border bg-background text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    {savingPhone ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                  </button>
                )}
              </div>
            )}
            {company.website && (
              <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-info hover:underline">
                <ExternalLink className="size-3" /> {company.website}
              </a>
            )}
            {company.address && <p className="text-sm text-muted-foreground">{company.address}</p>}
            {company.contact_person && (
              <p className="text-sm"><span className="text-muted-foreground">Contact:</span> {company.contact_person}</p>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fleet</h4>
            <VehiclesTable vehicles={((company.vehicles as unknown) as Vehicle[]) ?? []} />
          </section>

          {sources && sources.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Sources ({sources.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {sources.map((s) => (
                  <li key={s}><a href={s} target="_blank" rel="noreferrer" className="hover:underline">{s}</a></li>
                ))}
              </ul>
            </details>
          )}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status</h4>
            {readOnly ? (
              <div className="px-3 py-2 rounded-md border bg-background text-sm opacity-70">
                {company.custom_status_id
                  ? (customStatuses.find((cs) => cs.id === company.custom_status_id)?.label ?? "Custom")
                  : STATUS_META[company.status].label}
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setStatusMenuOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-background text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {company.custom_status_id ? (
                      <>
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: customStatuses.find((cs) => cs.id === company.custom_status_id)?.color ?? "#6366f1" }}
                        />
                        {customStatuses.find((cs) => cs.id === company.custom_status_id)?.label ?? "Custom"}
                      </>
                    ) : (
                      <>
                        <span className={`size-2 rounded-full shrink-0 ${STATUS_META[company.status].dot}`} />
                        {STATUS_META[company.status].label}
                      </>
                    )}
                  </div>
                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                </button>

                {statusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setStatusMenuOpen(false); setCreatingStatus(false); }} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
                      {/* Built-in statuses */}
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-1.5">Default</p>
                      {STATUS_ORDER.map((s) => {
                        const m = STATUS_META[s];
                        const active = !company.custom_status_id && company.status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => { changeStatus(s); setStatusMenuOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                          >
                            <span className={`size-2 rounded-full shrink-0 ${m.dot}`} />
                            <span className="flex-1">{m.label}</span>
                            {active && <Check className="size-3.5 text-primary shrink-0" />}
                          </button>
                        );
                      })}

                      {/* Custom statuses */}
                      {customStatuses.length > 0 && (
                        <>
                          <div className="border-t my-1" />
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 py-1.5">Custom</p>
                          {customStatuses.map((cs) => {
                            const active = company.custom_status_id === cs.id;
                            return (
                              <div key={cs.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors">
                                <button
                                  onClick={() => { changeCustomStatus(cs); setStatusMenuOpen(false); }}
                                  className="flex items-center gap-2 flex-1 text-sm text-left"
                                >
                                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: cs.color }} />
                                  <span className="flex-1">{cs.label}</span>
                                  {active && <Check className="size-3.5 text-primary shrink-0" />}
                                </button>
                                <button
                                  onClick={() => deleteCustomStatus(cs.id)}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </>
                      )}

                      {/* Create new */}
                      <div className="border-t my-1" />
                      {!creatingStatus ? (
                        <button
                          onClick={() => setCreatingStatus(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted transition-colors text-left"
                        >
                          <Plus className="size-3.5" /> Create new status
                        </button>
                      ) : (
                        <div className="px-3 py-2 space-y-2">
                          <input
                            autoFocus
                            value={newStatusLabel}
                            onChange={(e) => setNewStatusLabel(e.target.value)}
                            placeholder="Status name…"
                            className="w-full px-2 py-1.5 rounded-md border bg-background text-sm"
                            onKeyDown={(e) => { if (e.key === "Escape") setCreatingStatus(false); }}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {STATUS_COLORS.map((c) => (
                              <button
                                key={c.value}
                                onClick={() => setNewStatusColor(c.value)}
                                className="size-5 rounded-full border-2 transition-all"
                                style={{
                                  backgroundColor: c.value,
                                  borderColor: newStatusColor === c.value ? "white" : "transparent",
                                  boxShadow: newStatusColor === c.value ? `0 0 0 2px ${c.value}` : "none",
                                }}
                                title={c.label}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                if (!newStatusLabel.trim()) return;
                                try {
                                  const cs = await createCustomStatus(newStatusLabel.trim(), newStatusColor);
                                  await changeCustomStatus(cs);
                                  setNewStatusLabel("");
                                  setCreatingStatus(false);
                                  setStatusMenuOpen(false);
                                } catch (e: any) { toast.error(e.message); }
                              }}
                              disabled={!newStatusLabel.trim()}
                              className="flex-1 px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setCreatingStatus(false)}
                              className="px-2 py-1.5 rounded-md border text-xs hover:bg-muted"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</h4>
            <NotesField value={notes} onChange={setNotes} onBlur={readOnly ? undefined : saveNotes} readOnly={readOnly} />
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Schedule a call
            </h4>
            {!readOnly && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    placeholder="Title (e.g. Follow-up call)"
                    className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
                  />
                  <AutoAnswerPicker onSelect={setSchedTitle} />
                </div>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex-1 inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-background text-sm">
                        <span className="inline-flex items-center gap-2">
                          <CalendarIcon className="size-4" />
                          {schedDate
                            ? schedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                            : "Pick a date"}
                        </span>
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
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-4" /> Add
                  </button>
                </div>
              </div>
            )}
            <ul className="space-y-1.5">
              {schedules.length === 0 && (
                <li className="text-sm text-muted-foreground italic">No calls scheduled.</li>
              )}
              {schedules.map((s) => {
                const dt = new Date(s.scheduled_at);
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                    <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${s.done ? "line-through text-muted-foreground" : ""}`}>
                        {s.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {!readOnly && (
                      <>
                        <button
                          onClick={async () => { await toggleScheduleDone(s.id, !s.done); refreshSchedules(); }}
                          className="text-xs px-2 py-1 rounded border hover:bg-muted"
                        >
                          {s.done ? "Undo" : "Done"}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm("Delete this scheduled call?")) return;
                            await deleteSchedule(s.id);
                            refreshSchedules();
                          }}
                          className="size-7 inline-flex items-center justify-center rounded border hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Call log</h4>
            {!readOnly && (
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCall()}
                  placeholder="Log a call note…"
                  className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
                />
                <button onClick={addCall} className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground">
                  Add
                </button>
              </div>
            )}
            <ul className="space-y-2">
              {calls.map((c) => {
                const answered = c.status === "answered" || c.status === "success" || (c.duration ?? 0) > 0;
                const notAnswered = !answered && ["no-answer", "noanswer", "missed", "failed", "busy"].includes(c.status ?? "");
                async function setOutcome(next: "answered" | "no-answer") {
                  const { data, error } = await supabase
                    .from("call_logs")
                    .update({ status: next })
                    .eq("id", c.id)
                    .select()
                    .single();
                  if (error) return toast.error(error.message);
                  setCalls((prev) => prev.map((x) => (x.id === c.id ? (data as CallLog) : x)));
                }
                return (
                  <li key={c.id} className="text-sm border-l-2 border-primary/30 pl-3">
                    <div>{c.note || (c.to_number ? `Call to ${c.to_number}` : "Call")}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
                      <span>{new Date(c.created_at).toLocaleString()}</span>
                      <span className={`uppercase tracking-wide ${notAnswered ? "text-destructive" : answered ? "text-success" : ""}`}>
                        · {answered ? "answered" : notAnswered ? "not answered" : (c.status ?? "pending")}
                      </span>
                      {typeof c.duration === "number" && c.duration > 0 && <span>· {c.duration}s</span>}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-1.5 mt-1.5">
                        <button
                          onClick={() => setOutcome("answered")}
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border ${answered ? "bg-success text-success-foreground border-success" : "bg-success/10 text-success border-success/30 hover:bg-success/20"}`}
                        >
                          ✓ Answered
                        </button>
                        <button
                          onClick={() => setOutcome("no-answer")}
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border ${notAnswered ? "bg-destructive text-destructive-foreground border-destructive" : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"}`}
                        >
                          ✕ Not answered
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              {calls.length === 0 && <li className="text-sm text-muted-foreground italic">No calls logged.</li>}
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

const STAMP_RE = /^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\])$/m;

function NotesField({
  value,
  onChange,
  onBlur,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing || readOnly) {
    return (
      <textarea
        autoFocus={editing}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { setEditing(false); onBlur?.(); }}
        rows={5}
        className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder={readOnly ? "No notes" : "Internal notes…"}
      />
    );
  }

  if (!value) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="w-full px-3 py-2 rounded-md border bg-background text-sm text-muted-foreground cursor-text min-h-[80px]"
      >
        Internal notes…
      </div>
    );
  }

  // Render with faded timestamps
  const lines = value.split("\n");
  return (
    <div
      onClick={() => setEditing(true)}
      className="w-full px-3 py-2 rounded-md border bg-background text-sm cursor-text whitespace-pre-wrap min-h-[80px] leading-relaxed"
    >
      {lines.map((line, i) => (
        STAMP_RE.test(line)
          ? <span key={i} className="text-muted-foreground/50 text-xs">{line}{"\n"}</span>
          : <span key={i}>{line}{i < lines.length - 1 ? "\n" : ""}</span>
      ))}
    </div>
  );
}

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

function AutoAnswerPicker({ onSelect }: { onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>(loadAutoAnswers);
  const [newAnswer, setNewAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(a: string) {
    onSelect(a);
    setOpen(false);
  }

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
        <button
          type="button"
          title="Quick titles"
          className="shrink-0 size-8 inline-flex items-center justify-center rounded-md border bg-background hover:bg-muted transition-colors"
        >
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">Quick titles</p>
        <ul className="space-y-0.5">
          {answers.map((a) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => pick(a)}
                className="group w-full flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-muted text-left"
              >
                <span className="truncate">{a}</span>
                <span
                  role="button"
                  onClick={(e) => remove(a, e)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                >
                  <Trash2 className="size-3" />
                </span>
              </button>
            </li>
          ))}
          {answers.length === 0 && (
            <li className="text-xs text-muted-foreground italic px-2 py-1">No saved titles yet.</li>
          )}
        </ul>
        <div className="flex gap-1.5 pt-1 border-t">
          <input
            ref={inputRef}
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="New title…"
            className="flex-1 px-2 py-1 text-xs rounded-md border bg-background"
          />
          <button
            type="button"
            onClick={add}
            disabled={!newAnswer.trim()}
            className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuickCopy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}
