import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANSWERED_CALL_STATUSES = new Set(["success", "answered", "completed"]);
function isCallAnswered(c: { status?: string | null; outcome?: string | null }) {
  if (c.outcome === "answered") return true;
  if (c.outcome === "no-answer") return false;
  return ANSWERED_CALL_STATUSES.has((c.status ?? "").toLowerCase());
}

export const getEmployeesOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, listAllAuthUsers, fetchOverviewData } = await import("./admin.server");
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const DEVELOPER_EMAILS = new Set(["arriahmed673@gmail.com"]);

    const rawUsers = await listAllAuthUsers();
    const setupUsers = rawUsers.filter((u) => !u.needsPasswordSetup);
    const allIds = setupUsers.map((u) => u.id);
    const { profiles, roles, companies, calls } = await fetchOverviewData(allIds);

    // Exclude developer accounts from all stats and charts.
    const developerIds = new Set(
      roles.filter((r) => r.role === "developer").map((r) => r.user_id),
    );
    const allUsers = setupUsers.filter(
      (u) => !developerIds.has(u.id) && !DEVELOPER_EMAILS.has((u.email ?? "").toLowerCase()),
    );

    const adminIds = new Set(
      roles.filter((r) => r.role === "admin").map((r) => r.user_id),
    );

    const employees = allUsers.filter((u) => !adminIds.has(u.id)).map((u) => {
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
      answered: calls.filter(isCallAnswered).length,
      leads: companies.length,
    };

    // Build weekly breakdown per employee (last 7 days, UTC).
    const nowUtc = new Date();
    const days: { key: string; day: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowUtc);
      d.setUTCDate(d.getUTCDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        day: d.toLocaleDateString("sv-SE", { weekday: "short", timeZone: "UTC" }),
      });
    }

    // Map userId -> displayName/email for the chart
    const employeeNames = new Map(
      allUsers.map((u) => {
        const profile = profiles.find((p) => p.user_id === u.id);
        return [u.id, profile?.display_name || u.email || u.id];
      }),
    );

    // Count calls per (day, userId)
    const callsByDayUser = new Map<string, Map<string, number>>();
    for (const { key } of days) callsByDayUser.set(key, new Map());
    for (const c of calls) {
      const key = new Date(c.created_at).toISOString().slice(0, 10);
      const dayMap = callsByDayUser.get(key);
      if (!dayMap || !c.user_id) continue;
      dayMap.set(c.user_id, (dayMap.get(c.user_id) ?? 0) + 1);
    }

    // Employees sorted by total calls (descending) — same order as donut chart
    const activeEmployees = employees
      .filter((e) => e.stats.calls > 0)
      .sort((a, b) => b.stats.calls - a.stats.calls)
      .slice(0, 6);

    const weekly = days.map(({ key, day }) => {
      const dayMap = callsByDayUser.get(key) ?? new Map<string, number>();
      const row: Record<string, string | number> = { day };
      for (const e of activeEmployees) {
        row[employeeNames.get(e.id) ?? e.id] = dayMap.get(e.id) ?? 0;
      }
      return row;
    });

    // Pass employee names (in order) so the chart knows which keys to render
    const weeklyEmployees = activeEmployees.map((e) => employeeNames.get(e.id) ?? e.id);

    // Stable color index per user: based on allUsers creation order (excludes admins for donut)
    const nonAdminUsers = allUsers.filter(
      (u) => !roles.some((r) => r.user_id === u.id && r.role === "admin"),
    );
    // colorIndex maps display name -> palette index (stable, creation-order based)
    const colorIndex: Record<string, number> = {};
    nonAdminUsers.forEach((u, i) => {
      const name =
        profiles.find((p) => p.user_id === u.id)?.display_name || u.email || u.id;
      colorIndex[name] = i;
    });

    // Per-employee calls today
    const todayKey = nowUtc.toISOString().slice(0, 10);
    const callsToday = calls.filter(
      (c) => new Date(c.created_at).toISOString().slice(0, 10) === todayKey,
    );
    const todayByEmployee = nonAdminUsers.map((u) => ({
      name:
        profiles.find((p) => p.user_id === u.id)?.display_name ||
        u.email ||
        u.id,
      calls: callsToday.filter((c) => c.user_id === u.id).length,
    }));

    return { employees, totals, weekly, weeklyEmployees, todayByEmployee, colorIndex };
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

