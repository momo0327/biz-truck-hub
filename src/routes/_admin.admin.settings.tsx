import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth, signOut } from "@/lib/auth";
import { LogOut, ShieldCheck, Mail } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your admin account.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg">Account</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Email</span>
            <span className="ml-auto font-medium">{user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Role</span>
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wider">
              Admin
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg">Session</h2>
        <p className="text-sm text-muted-foreground">
          Sign out of this device. You'll need your email and password to sign back in.
        </p>
        <button
          onClick={() => signOut().then(() => navigate({ to: "/login" }))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm hover:bg-muted"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </section>
    </div>
  );
}
