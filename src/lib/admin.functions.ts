import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANSWERED_CALL_STATUSES = new Set(["success", "answered", "completed"]);
const isAnswered = (c: { status?: string | null; duration?: number | null }) =>
  ANSWERED_CALL_STATUSES.has((c.status ?? "").toLowerCase()) || (c.duration ?? 0) > 0;

export const getEmployeesOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, listAllAuthUsers, fetchOverviewData } = await import("./admin.server");
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const rawUsers = await listAllAuthUsers();
    // Hide users who were invited but never completed account setup.
    const allUsers = rawUsers.filter((u) => !u.needsPasswordSetup);
    const userIds = allUsers.map((u) => u.id);
    const { profiles, roles, companies, calls } = await fetchOverviewData(userIds);

    const employees = allUsers.map((u) => {
      const profile = profiles.find((p) => p.user_id === u.id);
      const userRoles = roles.filter((r) => r.user_id === u.id).map((r) => r.role);
      const userCompanies = companies.filter((c) => c.user_id === u.id);
      const userCalls = calls.filter((c) => c.user_id === u.id);
      const lastActivity =
        userCompanies
          .map((c) => c.last_contact)
          .concat(userCalls.map((c) => c.created_at))
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null;
      return {
        id: u.id,
        email: u.email,
        displayName: profile?.display_name ?? null,
        phoneNumber: profile?.phone_number ?? null,
        roles: userRoles,
        createdAt: u.created_at,
        stats: {
          companies: userCompanies.length,
          calls: userCalls.length,
          callMinutes: Math.round(
            userCalls.reduce((sum, c) => sum + (c.duration ?? 0), 0) / 60,
          ),
          dealsClosed: userCompanies.filter((c) => c.status === "deal_made").length,
          inNegotiation: userCompanies.filter((c) => c.status === "in_negotiation").length,
          followUp: userCompanies.filter((c) => c.status === "follow_up").length,
          noAnswer: userCompanies.filter((c) => c.status === "called_no_answer").length,
        },
        lastActivity,
      };
    });

    const totals = {
      calls: calls.length,
      answered: calls.filter(isAnswered).length,
      leads: companies.length,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDate = new Map<string, { calls: number; answered: number }>();
    const weekly: { day: string; calls: number; answered: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = d.toLocaleDateString(undefined, { weekday: "short" });
      const bucket = { calls: 0, answered: 0 };
      byDate.set(key, bucket);
      weekly.push({ day, ...bucket });
    }
    calls.forEach((c) => {
      const key = new Date(c.created_at).toISOString().slice(0, 10);
      const b = byDate.get(key);
      if (!b) return;
      b.calls++;
      if (ANSWERED_CALL_STATUSES.has((c.status ?? "").toLowerCase())) b.answered++;
    });
    // sync mutated values back into the array
    let i = 6;
    for (const item of weekly) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const v = byDate.get(key)!;
      item.calls = v.calls;
      item.answered = v.answered;
      i--;
    }

    return { employees, totals, weekly };
  });

export const getEmployeeDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, fetchEmployeeDetail } = await import("./admin.server");
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    return fetchEmployeeDetail(data.employeeId);
  });

export const inviteEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255).toLowerCase(),
        role: z.enum(["admin", "user"]).default("user"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, inviteUser } = await import("./admin.server");
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    return inviteUser(data.email, data.role);
  });

export const deleteEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        password: z.string().min(1).max(256),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, deleteEmployee } = await import("./admin.server");
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    return deleteEmployee(userId, data.employeeId, data.password);
  });

