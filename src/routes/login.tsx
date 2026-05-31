import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: user.user_metadata?.needs_password_setup ? "/accept-invite" : "/" });
    }
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-sidebar text-sidebar-foreground">
        <img src={logo} alt="Auto Wahab Export" className="h-24 w-auto object-contain self-start brightness-0 invert" />
        <div>
          <h1 className="font-display text-4xl leading-tight max-w-md">
            Find. Call. Close.
          </h1>
          <p className="mt-3 opacity-70 max-w-md">
            Research Swedish trucking fleets, dial leads with one click, and
            track deals from first contact to close.
          </p>
        </div>
        <div className="text-xs opacity-50">Built for callers, not spreadsheets.</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-display text-2xl">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your CRM</p>
          </div>
          <div className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Please wait…" : "Sign in"}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            New accounts are created by invitation only.
          </p>
        </form>
      </div>
    </div>
  );
}
