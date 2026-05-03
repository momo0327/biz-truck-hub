import { useEffect, useState } from "react";
import { X, Loader2, RefreshCw, ExternalLink, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { researchCompanyFn } from "@/server/research.functions";
import { STATUS_META, STATUS_ORDER, type Company, type CallLog, type Status } from "@/lib/companies";
import { PhoneButtons } from "./PhoneButtons";
import { toast } from "sonner";

export function CompanyDrawer({ company, onClose }: { company: Company; onClose: () => void }) {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState(company.notes ?? "");
  const [researching, setResearching] = useState(false);
  const research = useServerFn(researchCompanyFn);

  useEffect(() => {
    setNotes(company.notes ?? "");
    supabase
      .from("call_logs")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCalls(data ?? []));
  }, [company.id, company.notes]);

  async function doResearch() {
    setResearching(true);
    try {
      const res = await research({ data: { companyId: company.id } });
      if (res.ok) toast.success("Research complete");
      else toast.error(res.error ?? "Research failed");
    } catch (e: any) {
      toast.error(e.message ?? "Research failed");
    } finally {
      setResearching(false);
    }
  }

  async function changeStatus(status: Status) {
    await supabase.from("companies").update({ status, last_contact: new Date().toISOString() }).eq("id", company.id);
  }

  async function saveNotes() {
    await supabase.from("companies").update({ notes }).eq("id", company.id);
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
    await supabase.from("companies").update({ last_contact: new Date().toISOString() }).eq("id", company.id);
  }

  async function deleteCompany() {
    if (!confirm("Delete this company?")) return;
    await supabase.from("companies").delete().eq("id", company.id);
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
            <h3 className="font-display text-xl truncate">{company.name}</h3>
            <p className="text-xs text-muted-foreground">Org: {company.org_number ?? "—"}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={deleteCompany} className="p-2 rounded-md hover:bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-muted">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact</h4>
              <button
                onClick={doResearch}
                disabled={researching}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {researching ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                {company.researched_at ? "Re-research" : "Research with AI"}
              </button>
            </div>
            <PhoneButtons phones={company.phones ?? []} />
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
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {company.trucks_info ? (
                <p>{company.trucks_info}</p>
              ) : (
                <p className="text-muted-foreground italic">No fleet info yet — click "Research with AI"</p>
              )}
              {company.fleet_size && <p className="mt-2 text-xs text-muted-foreground">Fleet size: {company.fleet_size}</p>}
            </div>
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
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status</h4>
            <select
              value={company.status}
              onChange={(e) => changeStatus(e.target.value as Status)}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              placeholder="Internal notes…"
            />
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Call log</h4>
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
            <ul className="space-y-2">
              {calls.map((c) => (
                <li key={c.id} className="text-sm border-l-2 border-primary/30 pl-3">
                  <div>{c.note}</div>
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
                </li>
              ))}
              {calls.length === 0 && <li className="text-sm text-muted-foreground italic">No calls logged.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
