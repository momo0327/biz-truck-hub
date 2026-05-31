import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/accept-invite")({ component: AcceptInvitePage });

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase parses the invite token from the URL hash and sets a session.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setHasSession(!!s);
      setChecking(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your first and last name");
      return;
    }
    setBusy(true);
    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      const { error } = await supabase.auth.updateUser({
        password,
        data: {
          display_name: displayName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          needs_password_setup: false,
        },
      });
      if (error) throw error;

      // Persist display name to the profile row too.
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase
          .from("profiles")
          .update({ display_name: displayName })
          .eq("user_id", userData.user.id);
      }

      // Sign out so the user logs in fresh with their new password.
      await supabase.auth.signOut();
      toast.success("Account ready — please sign in with your new password.");
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to set up account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-sidebar text-sidebar-foreground">
        <img src={logo} alt="Auto Wahab Export" className="h-24 w-auto object-contain self-start brightness-0 invert" />
        <div>
          <h1 className="font-display text-4xl leading-tight max-w-md">Welcome aboard.</h1>
          <p className="mt-3 opacity-70 max-w-md">
            Finish setting up your account to start working with the team.
          </p>
        </div>
        <div className="text-xs opacity-50">Built for callers, not spreadsheets.</div>
      </div>
      <div className="flex items-center justify-center p-8">
        {checking ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : !hasSession ? (
          <div className="max-w-sm text-center space-y-3">
            <h2 className="font-display text-2xl">Invalid or expired invite</h2>
            <p className="text-sm text-muted-foreground">
              This invitation link is no longer valid. Ask your admin to send a new invite.
            </p>
            <button
              onClick={() => navigate({ to: "/login" })}
              className="text-sm text-primary hover:underline"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full max-w-sm space-y-5">
            <div>
              <h2 className="font-display text-2xl">Set up your account</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your name and choose a password.
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  required
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Setting up…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
