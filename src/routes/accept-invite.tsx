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
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function verify() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) setHasSession(false);
        return false;
      }
      const { data: userData, error } = await supabase.auth.getUser();
      if (cancelled) return false;
      if (error || !userData.user) {
        await supabase.auth.signOut().catch(() => {});
        setHasSession(false);
        return false;
      }
      setHasSession(true);
      return true;
    }

    async function init() {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const search = typeof window !== "undefined" ? window.location.search : "";
      const params = new URLSearchParams(search);
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const linkType = params.get("type") ?? hashParams.get("type");
      const hasInviteToken = Boolean(
        code || tokenHash || accessToken || linkType === "invite" || linkType === "recovery",
      );

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setHasSession(false);
            setChecking(false);
          }
          return;
        }
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
        if (error) {
          if (!cancelled) {
            setHasSession(false);
            setChecking(false);
          }
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          if (!cancelled) {
            setHasSession(false);
            setChecking(false);
          }
          return;
        }
      }

      if (hasInviteToken && typeof window !== "undefined") {
        window.history.replaceState(null, "", "/accept-invite");
      }

      const ok = await verify();
      if (cancelled) return;

      if (!ok && hasInviteToken) {
        // Give supabase-js up to 4s to parse the hash and emit SIGNED_IN.
        timeoutId = setTimeout(() => {
          if (!cancelled) setChecking(false);
        }, 4000);
        return;
      }
      setChecking(false);
    }

    init();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        void verify().then((ok) => {
          if (!cancelled && ok) {
            if (timeoutId) clearTimeout(timeoutId);
            setChecking(false);
          }
        });
      }
    });
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
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
      // Re-verify the session belongs to a real user before attempting updates.
      const { data: pre, error: preErr } = await supabase.auth.getUser();
      if (preErr || !pre.user) {
        throw new Error(
          "This invitation link is no longer valid. Please ask your admin to send a new invite.",
        );
      }

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
      if (error) {
        if (
          /user.*not.*found|sub claim/i.test(error.message) ||
          (error as any).status === 403
        ) {
          await supabase.auth.signOut().catch(() => {});
          setHasSession(false);
          throw new Error(
            "This invitation link is no longer valid. Please ask your admin to send a new invite.",
          );
        }
        throw error;
      }

      // Persist display name to the profile row too.
      await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", pre.user.id);

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
