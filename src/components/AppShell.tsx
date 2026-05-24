import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Building2, KanbanSquare, Phone, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth, signOut } from "@/lib/auth";
import { useUserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { SoftphoneProvider } from "@/components/softphone/SoftphoneProvider";
import { SoftphonePanel } from "@/components/softphone/SoftphonePanel";
import { CompaniesProvider } from "@/lib/companies";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/calls", label: "Call history", icon: Phone },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("appshell:collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  // Admins use the admin shell only — bounce them out of the employee app.
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
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "shrink-0 bg-sidebar text-sidebar-foreground flex flex-col sticky top-0 h-screen transition-[width] duration-200",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <div
            className={cn(
              "flex items-center py-6",
              collapsed ? "justify-center px-2" : "justify-between px-5",
            )}
          >
            {!collapsed && (
              <img src={logo} alt="Auto Wahab Export" className="h-8 w-auto brightness-0 invert" />
            )}
          </div>
          <nav className="px-3 flex-1 space-y-0.5">
            {nav.map((n) => {
              const active = loc.pathname === n.to;
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  title={collapsed ? n.label : undefined}
                  onClick={(e) => {
                    const target = e.currentTarget;
                    const rect = target.getBoundingClientRect();
                    const span = document.createElement("span");
                    const size = Math.max(rect.width, rect.height);
                    span.className = "ripple-span";
                    span.style.width = span.style.height = `${size}px`;
                    span.style.left = `${e.clientX - rect.left - size / 2}px`;
                    span.style.top = `${e.clientY - rect.top - size / 2}px`;
                    target.appendChild(span);
                    setTimeout(() => span.remove(), 600);
                  }}
                  className={cn(
                    "relative overflow-hidden flex items-center gap-3 py-2 rounded-md text-sm transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/40",
                  )}
                >
                  <Icon className="size-4" />
                  {!collapsed && n.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            {!collapsed && (
              <div className="px-3 py-2 text-xs opacity-60 truncate">{user.email}</div>
            )}
            <button
              onClick={() => signOut().then(() => navigate({ to: "/login" }))}
              title={collapsed ? "Sign out" : undefined}
              className={cn(
                "w-full flex items-center gap-2 py-2 rounded-md text-sm hover:bg-sidebar-accent/40",
                collapsed ? "justify-center px-0" : "px-3",
              )}
            >
              <LogOut className="size-4" /> {!collapsed && "Sign out"}
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0">
          <CompaniesProvider>{children}</CompaniesProvider>
        </main>
        <SoftphonePanel />
      </div>
    </SoftphoneProvider>
  );
}
