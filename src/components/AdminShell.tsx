import { useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserPlus, Settings } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useUserRole } from "@/lib/roles";
import { Shell, type ShellNavItem } from "@/components/Shell";

const nav: readonly ShellNavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/employees", label: "Employees", icon: Users },
  { to: "/admin/invite", label: "Invite employee", icon: UserPlus },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!roleLoading && user && !isAdmin) navigate({ to: "/" });
  }, [roleLoading, user, isAdmin, navigate]);

  if (loading || roleLoading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <Shell user={user} nav={nav} roleLabel="Admin">
      {children}
    </Shell>
  );
}
