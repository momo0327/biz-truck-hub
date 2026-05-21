import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const getEmployeesOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // List users via admin API (paginated)
    const allUsers: { id: string; email: string | null; created_at: string }[] = [];
    let page = 1;
    for (;;) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      allUsers.push(
        ...data.users.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
        })),
      );
      if (data.users.length < 1000) break;
      page += 1;
    }

    const userIds = allUsers.map((u) => u.id);

    const [{ data: profiles }, { data: roles }, { data: companies }, { data: calls }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("user_id, display_name, phone_number").in("user_id", userIds),
        supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabaseAdmin.from("companies").select("user_id, status, last_contact").in("user_id", userIds),
        supabaseAdmin.from("call_logs").select("user_id, duration, created_at").in("user_id", userIds),
      ]);

    const employees = allUsers.map((u) => {
      const profile = profiles?.find((p) => p.user_id === u.id);
      const userRoles = (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role);
      const userCompanies = (companies ?? []).filter((c) => c.user_id === u.id);
      const userCalls = (calls ?? []).filter((c) => c.user_id === u.id);
      const lastActivity = userCompanies
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

    return { employees };
  });

export const getEmployeeDetailFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [{ data: user }, { data: profile }, { data: companies }, { data: calls }] =
      await Promise.all([
        supabaseAdmin.auth.admin.getUserById(data.employeeId),
        supabaseAdmin.from("profiles").select("*").eq("user_id", data.employeeId).maybeSingle(),
        supabaseAdmin
          .from("companies")
          .select("id, name, status, phones, last_contact, created_at, contact_person, org_number")
          .eq("user_id", data.employeeId)
          .order("last_contact", { ascending: false, nullsFirst: false }),
        supabaseAdmin
          .from("call_logs")
          .select("id, company_id, to_number, direction, duration, status, note, outcome, created_at")
          .eq("user_id", data.employeeId)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

    return {
      employee: {
        id: data.employeeId,
        email: user?.user?.email ?? null,
        displayName: profile?.display_name ?? null,
        phoneNumber: profile?.phone_number ?? null,
      },
      companies: companies ?? [],
      calls: calls ?? [],
    };
  });

export const inviteEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255).toLowerCase(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") || "https";
    const redirectTo = `${proto}://${host}/login`;

    const { data: invite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { redirectTo },
    );
    if (error) {
      // 422 — email already exists
      if ((error as any).status === 422 || /already.*registered|exists/i.test(error.message)) {
        return { ok: false as const, error: "That email is already registered." };
      }
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const, userId: invite.user?.id ?? null };
  });
