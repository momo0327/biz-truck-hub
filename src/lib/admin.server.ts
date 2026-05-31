// Server-only helpers — must never be imported by client modules.
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function deleteEmployee(adminUserId: string, employeeId: string, password: string) {
  if (adminUserId === employeeId) {
    return { ok: false as const, error: "You cannot delete your own account." };
  }

  // Re-verify the admin's password before destructive action.
  const { data: adminUser, error: adminLookupErr } =
    await supabaseAdmin.auth.admin.getUserById(adminUserId);
  if (adminLookupErr || !adminUser?.user?.email) {
    return { ok: false as const, error: "Could not verify admin account." };
  }

  const url = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: pwErr } = await verifier.auth.signInWithPassword({
    email: adminUser.user.email,
    password,
  });
  if (pwErr) {
    return { ok: false as const, error: "Incorrect password." };
  }
  await verifier.auth.signOut();

  // Clean app data, then remove the auth user.
  await Promise.all([
    supabaseAdmin.from("call_logs").delete().eq("user_id", employeeId),
    supabaseAdmin.from("companies").delete().eq("user_id", employeeId),
    supabaseAdmin.from("user_roles").delete().eq("user_id", employeeId),
    supabaseAdmin.from("profiles").delete().eq("user_id", employeeId),
  ]);

  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(employeeId);
  if (delErr) {
    return { ok: false as const, error: delErr.message };
  }
  return { ok: true as const };
}


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
  const allUsers: {
    id: string;
    email: string | null;
    created_at: string;
    needsPasswordSetup: boolean;
  }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    allUsers.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        needsPasswordSetup:
          (u.user_metadata as { needs_password_setup?: boolean } | null)?.needs_password_setup ===
          true,
      })),
    );
    if (data.users.length < 1000) break;
    page += 1;
  }
  return allUsers;
}

async function fetchAll<T>(
  builder: () => any,
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

export async function fetchOverviewData(userIds: string[]) {
  if (userIds.length === 0) {
    return { profiles: [], roles: [], companies: [], calls: [] };
  }
  const [profiles, roles, companies, calls] = await Promise.all([
    fetchAll<{ user_id: string; display_name: string | null; phone_number: string | null }>(() =>
      supabaseAdmin.from("profiles").select("user_id, display_name, phone_number").in("user_id", userIds),
    ),
    fetchAll<{ user_id: string; role: string }>(() =>
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
    ),
    fetchAll<{ user_id: string; status: string; last_contact: string | null }>(() =>
      supabaseAdmin.from("companies").select("user_id, status, last_contact").in("user_id", userIds),
    ),
    fetchAll<{ user_id: string; duration: number | null; status: string | null; created_at: string }>(() =>
      supabaseAdmin
        .from("call_logs")
        .select("user_id, duration, status, created_at")
        .in("user_id", userIds),
    ),
  ]);
  return { profiles, roles, companies, calls };
}

export async function fetchEmployeeDetail(employeeId: string) {
  const [{ data: user }, { data: profile }, { data: companies }, { data: calls }] =
    await Promise.all([
      supabaseAdmin.auth.admin.getUserById(employeeId),
      supabaseAdmin.from("profiles").select("*").eq("user_id", employeeId).maybeSingle(),
      supabaseAdmin
        .from("companies")
        .select("*")
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
  const redirectTo = `${proto}://${host}/accept-invite`;

  // If a previous invite to the same email never completed account setup,
  // delete that pending shell user so we can issue a fresh invitation.
  try {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const pending = existing?.users.find(
      (u) =>
        u.email?.toLowerCase() === email.toLowerCase() &&
        (u.user_metadata as { needs_password_setup?: boolean } | null)?.needs_password_setup ===
          true,
    );
    if (pending) {
      await supabaseAdmin.auth.admin.deleteUser(pending.id);
    }
  } catch {
    // best-effort cleanup; fall through to invite call
  }

  const { data: invite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { needs_password_setup: true },
  });
  if (error) {
    if ((error as any).status === 422 || /already.*registered|exists/i.test(error.message)) {
      return { ok: false as const, error: "That email is already registered." };
    }
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, userId: invite.user?.id ?? null };
}
