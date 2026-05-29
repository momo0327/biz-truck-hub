import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ShellNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export function Shell({
  user,
  nav,
  roleLabel,
  children,
}: {
  user: AuthUser;
  nav: readonly ShellNavItem[];
  roleLabel: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("appshell:collapsed") === "1";
  });
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  return (
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
            const active = n.exact ? loc.pathname === n.to : loc.pathname === n.to || loc.pathname.startsWith(n.to + "/");
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
        <div className="p-3 flex flex-col gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "flex items-center gap-2 py-2 rounded-md text-sm hover:bg-sidebar-accent/40 text-sidebar-foreground",
              collapsed ? "justify-center px-1" : "px-3",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse menu"}
          </button>
          <div className="border-t border-sidebar-border" />
          <button
            onClick={() => setConfirmSignOut(true)}
            title="Sign out"
            className={cn(
              "w-full flex items-center gap-3 py-2 rounded-md hover:bg-sidebar-accent/40 transition-colors",
              collapsed ? "justify-center px-0" : "px-2",
            )}
          >
            <span className="relative shrink-0">
              <span className="inline-flex items-center justify-center size-9 rounded-full bg-white text-[11px] font-semibold text-primary">
                {(user.email ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-sidebar" />
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-semibold text-sidebar-accent-foreground truncate">
                  {user.email?.split("@")[0] ?? "User"}
                </span>
                <span className="block text-xs text-sidebar-foreground/60 truncate">{roleLabel}</span>
              </span>
            )}
            {!collapsed && <LogOut className="size-4 opacity-60 shrink-0" />}
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the login screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
