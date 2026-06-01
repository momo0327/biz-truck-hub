import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { inviteEmployeeFn } from "@/lib/admin.functions";
import { Mail, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/invite")({
  component: InviteEmployee,
});

function InviteEmployee() {
  const invite = useServerFn(inviteEmployeeFn);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await invite({ data: { email } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      navigate({ to: "/admin/employees" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">Invite employee</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send an email invitation. The recipient sets their name and password before they can sign in.
        </p>
      </header>

      <form onSubmit={submit} className="rounded-lg border bg-card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="email"
              required
              autoFocus
              placeholder="employee@example.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            They'll receive a one-time setup link to choose their name and password.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/admin" })}
            className="px-3 py-2 rounded-md border text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !email}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <UserPlus className="size-4" />
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
