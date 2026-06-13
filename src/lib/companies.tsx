import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CallLog = Database["public"]["Tables"]["call_logs"]["Row"];
export type Status = Database["public"]["Enums"]["company_status"];

export const STATUS_META: Record<Status, { label: string; emoji: string; tone: string; accent: string; dot: string }> = {
  new: { label: "Ny", emoji: "•", tone: "bg-muted text-foreground", accent: "var(--stage-new)", dot: "bg-[var(--stage-new)]" },
  not_interested: { label: "Ej intresserad", emoji: "•", tone: "bg-destructive/10 text-destructive", accent: "var(--stage-lost)", dot: "bg-[var(--stage-lost)]" },
  follow_up: { label: "Intresserad", emoji: "•", tone: "bg-info/10 text-info", accent: "var(--stage-contacted)", dot: "bg-[var(--stage-contacted)]" },
  sending_pictures: { label: "Skickar bilder", emoji: "•", tone: "bg-warning/15 text-warning-foreground", accent: "var(--stage-qualified)", dot: "bg-[var(--stage-qualified)]" },
  in_negotiation: { label: "Förhandlar", emoji: "•", tone: "bg-[color-mix(in_oklab,var(--stage-negotiating)_15%,transparent)] text-[var(--stage-negotiating)]", accent: "var(--stage-negotiating)", dot: "bg-[var(--stage-negotiating)]" },
  price_disagreement: { label: "Ej överens", emoji: "•", tone: "bg-warning/15 text-warning-foreground", accent: "var(--stage-lost)", dot: "bg-[var(--stage-lost)]" },
  deal_made: { label: "Köpt", emoji: "•", tone: "bg-success/15 text-success", accent: "var(--stage-closing)", dot: "bg-[var(--stage-closing)]" },
  called_no_answer: { label: "Ej svar", emoji: "•", tone: "bg-muted text-muted-foreground", accent: "var(--stage-contacted)", dot: "bg-[var(--stage-contacted)]" },
};

export const STATUS_ORDER: Status[] = [
  "new", "called_no_answer", "not_interested", "follow_up", "sending_pictures", "in_negotiation", "price_disagreement", "deal_made",
];

export const PIPELINE_ORDER: Status[] = [
  "new", "called_no_answer", "not_interested", "follow_up", "sending_pictures", "in_negotiation", "price_disagreement", "deal_made",
];

type CompaniesContextValue = {
  companies: Company[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsertCompany: (row: Company) => void;
  removeCompanies: (ids: string[]) => void;
  refetchCompany: (id: string) => Promise<Company | null>;
};

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

export function CompaniesProvider({ children }: { children: ReactNode }) {
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
        .is("archived_folder_id" as any, null)
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
        const row = payload.new as Company & { archived_folder_id?: string | null };
        if (row.archived_folder_id) return;
        upsertCompany(row);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "companies" }, (payload) => {
        const row = payload.new as Company & { archived_folder_id?: string | null };
        if (row.archived_folder_id) {
          removeCompanies([row.id]);
          return;
        }
        upsertCompany(row);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "companies" }, (payload) => {
        const oldRow = payload.old as { id?: string };
        if (!oldRow?.id) return;
        removeCompanies([oldRow.id]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, removeCompanies, upsertCompany]);

  const value = useMemo(
    () => ({ companies, loading, refresh, upsertCompany, removeCompanies, refetchCompany }),
    [companies, loading, refresh, upsertCompany, removeCompanies, refetchCompany],
  );

  return <CompaniesContext.Provider value={value}>{children}</CompaniesContext.Provider>;
}

export function useCompanies() {
  const context = useContext(CompaniesContext);
  if (!context) throw new Error("useCompanies must be used within CompaniesProvider");
  return context;
}

export async function updateStatus(id: string, status: Status) {
  return supabase
    .from("companies")
    .update({ status, last_contact: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}
