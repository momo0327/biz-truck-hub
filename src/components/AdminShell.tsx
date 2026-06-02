import { useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserPlus, Settings } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useUserRole } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";
import { Shell, type ShellNavItem } from "@/components/Shell";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const nav = useMemo<readonly ShellNavItem[]>(
    () => [
      { to: "/admin", label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
      { to: "/admin/employees", label: t("nav.employees"), icon: Users },
      { to: "/admin/invite", label: t("nav.invite_employee"), icon: UserPlus },
      { to: "/admin/settings", label: t("nav.settings"), icon: Settings },
    ],
    [t],
  );

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && user.user_metadata?.needs_password_setup) {
      navigate({ to: "/accept-invite" });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!roleLoading && user && !isAdmin) navigate({ to: "/" });
  }, [roleLoading, user, isAdmin, navigate]);

  if (loading || roleLoading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">{t("shell.loading")}</div>
      </div>
    );
  }

  return (
    <Shell user={user} nav={nav} roleLabel={t("shell.role.admin")}>
      {children}
    </Shell>
  );
}
