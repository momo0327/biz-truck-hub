import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Building2, KanbanSquare, Settings, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useAuth, signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { SoftphoneProvider } from "@/components/softphone/SoftphoneProvider";
import { SoftphonePanel } from "@/components/softphone/SoftphonePanel";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <SoftphoneProvider>
      <div className="flex min-h-screen bg-background">
        <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
          <div className="px-5 py-6">
            <img src={logo} alt="Auto Wahab Export" className="h-8 w-auto brightness-0 invert" />
          </div>
          <nav className="px-3 flex-1 space-y-0.5">
            {nav.map((n) => {
              const active = loc.pathname === n.to;
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
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
                    "relative overflow-hidden flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/40"
                  )}
                >
                  <Icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <div className="px-3 py-2 text-xs opacity-60 truncate">{user.email}</div>
            <button
              onClick={() => signOut().then(() => navigate({ to: "/login" }))}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/40"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
        <SoftphonePanel />
      </div>
    </SoftphoneProvider>
  );
}
