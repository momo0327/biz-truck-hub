import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Users, ShieldCheck, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useAuth, signOut } from "@/lib/auth";
import { useUserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const nav = [{ to: "/admin", label: "Employees", icon: Users }];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const loc = useLocation();

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
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-6">
          <img src={logo} alt="Auto Wahab Export" className="h-8 w-auto brightness-0 invert" />
          <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] uppercase tracking-wider font-medium">
            <ShieldCheck className="size-3" /> Admin
          </div>
        </div>
        <nav className="px-3 flex-1 space-y-0.5">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/40",
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
    </div>
  );
}
