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

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setCompanies(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("companies-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { companies, loading, refresh };
}

export async function updateStatus(id: string, status: Status) {
  return supabase.from("companies").update({ status, last_contact: new Date().toISOString() }).eq("id", id);
}
