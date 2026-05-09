import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CallLog = Database["public"]["Tables"]["call_logs"]["Row"];
export type Status = Database["public"]["Enums"]["company_status"];

export const STATUS_META: Record<Status, { label: string; emoji: string; tone: string }> = {
  new: { label: "New", emoji: "🆕", tone: "bg-muted text-foreground" },
  called_no_answer: { label: "No Answer", emoji: "📞", tone: "bg-info/15 text-info" },
  follow_up: { label: "Follow Up", emoji: "🔁", tone: "bg-warning/20 text-warning-foreground" },
  in_negotiation: { label: "Negotiating", emoji: "💬", tone: "bg-primary/10 text-primary" },
  deal_made: { label: "Deal Made", emoji: "✅", tone: "bg-success/15 text-success" },
  not_interested: { label: "Not Interested", emoji: "❌", tone: "bg-destructive/10 text-destructive" },
};

export const STATUS_ORDER: Status[] = [
  "new", "called_no_answer", "follow_up", "in_negotiation", "deal_made", "not_interested",
];

export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const upsertCompany = useCallback((row: Company) => {
    setCompanies((prev) => {
      const exists = prev.some((c) => c.id === row.id);
      return exists ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev];
    });
  }, []);

  const removeCompanies = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setCompanies((prev) => prev.filter((c) => !idSet.has(c.id)));
  }, []);

  const refetchCompany = useCallback(async (id: string) => {
    const { data, error } = await supabase.from("companies").select("*").eq("id", id).single();
    if (error || !data) return null;
    const row = data as Company;
    upsertCompany(row);
    return row;
  }, [upsertCompany]);

  const refresh = useCallback(async () => {
    // Supabase caps at 1000 rows per request — paginate to load all.
    const pageSize = 1000;
    let from = 0;
    const all: Company[] = [];
    for (;;) {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setCompanies(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Apply realtime changes incrementally so we don't re-download the entire
    // table on every row update (research, status changes, etc.).
    const channel = supabase
      .channel("companies-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "companies" }, (payload) => {
        upsertCompany(payload.new as Company);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "companies" }, (payload) => {
        upsertCompany(payload.new as Company);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "companies" }, (payload) => {
        const oldRow = payload.old as { id?: string };
        if (!oldRow?.id) return;
        removeCompanies([oldRow.id]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, removeCompanies, upsertCompany]);

  return { companies, loading, refresh, upsertCompany, removeCompanies, refetchCompany };
}

export async function updateStatus(id: string, status: Status) {
  return supabase
    .from("companies")
    .update({ status, last_contact: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}
