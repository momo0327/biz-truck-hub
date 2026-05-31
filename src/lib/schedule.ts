import { supabase } from "@/integrations/supabase/client";

export type ScheduledCall = {
  id: string;
  user_id: string;
  company_id: string;
  scheduled_at: string;
  title: string;
  note: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
};

const TABLE = "scheduled_calls" as const;

export async function listSchedules(): Promise<ScheduledCall[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduledCall[];
}

export async function listSchedulesForCompany(companyId: string): Promise<ScheduledCall[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("company_id", companyId)
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduledCall[];
}

export async function createSchedule(input: {
  company_id: string;
  scheduled_at: string;
  title?: string;
  note?: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert({
      user_id: u.user.id,
      company_id: input.company_id,
      scheduled_at: input.scheduled_at,
      title: input.title ?? "Call",
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ScheduledCall;
}

export async function deleteSchedule(id: string) {
  const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleScheduleDone(id: string, done: boolean) {
  const { error } = await (supabase as any).from(TABLE).update({ done }).eq("id", id);
  if (error) throw error;
}

// Week starting today (today + next 6 days)
export function getWeekFromToday(base = new Date()): Date[] {
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
