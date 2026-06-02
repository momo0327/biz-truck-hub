import { useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Building2, KanbanSquare, Phone, Settings, Calendar as CalendarIcon, Archive } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useUserRole } from "@/lib/roles";
import { useI18n } from "@/lib/i18n";
import { SoftphoneProvider } from "@/components/softphone/SoftphoneProvider";
import { SoftphonePanel } from "@/components/softphone/SoftphonePanel";
import { CompaniesProvider } from "@/lib/companies";
import { Shell, type ShellNavItem } from "@/components/Shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const nav = useMemo<readonly ShellNavItem[]>(
    () => [
      { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
      { to: "/companies", label: t("nav.companies"), icon: Building2 },
      { to: "/kanban", label: t("nav.pipeline"), icon: KanbanSquare },
      { to: "/calendar", label: t("nav.calendar"), icon: CalendarIcon },
      { to: "/calls", label: t("nav.call_history"), icon: Phone },
      { to: "/archives", label: t("nav.archives"), icon: Archive },
      { to: "/settings", label: t("nav.settings"), icon: Settings },
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
    if (!roleLoading && user && isAdmin) navigate({ to: "/admin" });
  }, [roleLoading, user, isAdmin, navigate]);

  if (loading || roleLoading || !user || isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">{t("shell.loading")}</div>
      </div>
    );
  }

  return (
    <SoftphoneProvider>
      <Shell user={user} nav={nav} roleLabel={t("shell.role.senior_agent")}>
        <CompaniesProvider>{children}</CompaniesProvider>
      </Shell>
      <SoftphonePanel />
    </SoftphoneProvider>
  );
}
