import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AppRole = "admin" | "user";

type UserRoleContextValue = {
  loading: boolean;
  roles: AppRole[];
  isAdmin: boolean;
};

const UserRoleContext = createContext<UserRoleContextValue | null>(null);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const value = useMemo(() => ({
    loading: authLoading || loading,
    roles,
    isAdmin: roles.includes("admin"),
  }), [authLoading, loading, roles]);

  return createElement(UserRoleContext.Provider, { value }, children);
}

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (!context) throw new Error("useUserRole must be used within UserRoleProvider");
  return context;
}
