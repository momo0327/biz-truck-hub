import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CustomStatus {
  id: string;
  user_id: string;
  label: string;
  color: string;
  created_at: string;
}

interface CustomStatusesCtx {
  customStatuses: CustomStatus[];
  createCustomStatus: (label: string, color: string) => Promise<CustomStatus>;
  deleteCustomStatus: (id: string) => Promise<void>;
}

const Ctx = createContext<CustomStatusesCtx | null>(null);

export function CustomStatusesProvider({ children }: { children: ReactNode }) {
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("custom_statuses")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setCustomStatuses(data as CustomStatus[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createCustomStatus = useCallback(async (label: string, color: string): Promise<CustomStatus> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("custom_statuses")
      .insert({ label, color, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    const row = data as CustomStatus;
    setCustomStatuses((prev) => [...prev, row]);
    return row;
  }, []);

  const deleteCustomStatus = useCallback(async (id: string) => {
    await supabase.from("custom_statuses").delete().eq("id", id);
    setCustomStatuses((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ customStatuses, createCustomStatus, deleteCustomStatus }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCustomStatuses() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCustomStatuses must be inside <CustomStatusesProvider>");
  return ctx;
}

// Tailwind-safe color options for custom statuses
export const STATUS_COLORS = [
  { value: "#6366f1", label: "Indigo", tw: "bg-[#6366f1]" },
  { value: "#ec4899", label: "Pink",   tw: "bg-[#ec4899]" },
  { value: "#f59e0b", label: "Amber",  tw: "bg-[#f59e0b]" },
  { value: "#10b981", label: "Green",  tw: "bg-[#10b981]" },
  { value: "#3b82f6", label: "Blue",   tw: "bg-[#3b82f6]" },
  { value: "#ef4444", label: "Red",    tw: "bg-[#ef4444]" },
  { value: "#8b5cf6", label: "Purple", tw: "bg-[#8b5cf6]" },
  { value: "#14b8a6", label: "Teal",   tw: "bg-[#14b8a6]" },
];
