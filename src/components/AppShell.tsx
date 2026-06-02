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
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

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
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <SoftphoneProvider>
      <Shell user={user} nav={nav} roleLabel="Senior Agent">
        <CompaniesProvider>{children}</CompaniesProvider>
      </Shell>
      <SoftphonePanel />
    </SoftphoneProvider>
  );
}
