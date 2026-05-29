import { useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Building2, KanbanSquare, Phone, Settings } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useUserRole } from "@/lib/roles";
import { SoftphoneProvider } from "@/components/softphone/SoftphoneProvider";
import { SoftphonePanel } from "@/components/softphone/SoftphonePanel";
import { CompaniesProvider } from "@/lib/companies";
import { Shell, type ShellNavItem } from "@/components/Shell";

const nav: readonly ShellNavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/kanban", label: "Pipeline", icon: KanbanSquare },
  { to: "/calls", label: "Call history", icon: Phone },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
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
