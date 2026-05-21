// Server-only helpers — must never be imported by client modules.
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export async function listAllAuthUsers() {
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
  return allUsers;
}

export async function fetchOverviewData(userIds: string[]) {
  const [{ data: profiles }, { data: roles }, { data: companies }, { data: calls }] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, display_name, phone_number").in("user_id", userIds),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
      supabaseAdmin.from("companies").select("user_id, status, last_contact").in("user_id", userIds),
      supabaseAdmin.from("call_logs").select("user_id, duration, created_at").in("user_id", userIds),
    ]);
  return { profiles: profiles ?? [], roles: roles ?? [], companies: companies ?? [], calls: calls ?? [] };
}

export async function fetchEmployeeDetail(employeeId: string) {
  const [{ data: user }, { data: profile }, { data: companies }, { data: calls }] =
    await Promise.all([
      supabaseAdmin.auth.admin.getUserById(employeeId),
      supabaseAdmin.from("profiles").select("*").eq("user_id", employeeId).maybeSingle(),
      supabaseAdmin
        .from("companies")
        .select("id, name, status, phones, last_contact, created_at, contact_person, org_number")
        .eq("user_id", employeeId)
        .order("last_contact", { ascending: false, nullsFirst: false }),
      supabaseAdmin
        .from("call_logs")
        .select("id, company_id, to_number, direction, duration, status, note, outcome, created_at")
        .eq("user_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
  return {
    employee: {
      id: employeeId,
      email: user?.user?.email ?? null,
      displayName: profile?.display_name ?? null,
      phoneNumber: profile?.phone_number ?? null,
    },
    companies: companies ?? [],
    calls: calls ?? [],
  };
}

export async function inviteUser(email: string) {
  const host = getRequestHost();
  const proto = getRequestHeader("x-forwarded-proto") || "https";
  const redirectTo = `${proto}://${host}/login`;

  const { data: invite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (error) {
    if ((error as any).status === 422 || /already.*registered|exists/i.test(error.message)) {
      return { ok: false as const, error: "That email is already registered." };
    }
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, userId: invite.user?.id ?? null };
}
