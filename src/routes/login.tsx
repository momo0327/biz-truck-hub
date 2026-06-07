import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import truckImg from "@/assets/16122-052.jpg";

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
    <div className="min-h-screen flex">
      {/* Left: truck image */}
      <div className="hidden lg:block lg:w-3/5 relative">
        <img src={truckImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <img src={logo} alt="Auto Wahab Export" className="absolute top-8 left-8 h-10 w-auto object-contain brightness-0 invert" />
        <div className="absolute bottom-1/8 left-10 right-10">
          <h2 className="font-display text-5xl text-white leading-tight">
            Customer Relations Management <br /> system for Auto Wahab Export
          </h2>
          <p className="mt-3 text-white/70 text-lg">
            Research fleets, dial leads with one click, and track <br /> every deal from first contact to close.
          </p>
        </div>
      </div>
      {/* Right: form */}
      <div className="flex flex-col justify-center items-start w-full lg:w-2/5 px-12 py-12 bg-white">
        <form onSubmit={submit} className="w-full space-y-5">
          <div>
            <h2 className="font-display text-4xl">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-2">Sign in to your CRM</p>
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
          <p className="text-xs text-muted-foreground">
            New accounts are created by invitation only.
          </p>
        </form>
      </div>
    </div>
  );
}
