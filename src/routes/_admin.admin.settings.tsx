import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth, signOut } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import { LogOut, ShieldCheck, Mail, Languages } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-3xl">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your admin account.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg">Account</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("settings.email")}</span>
            <span className="ml-auto font-medium">{user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Role</span>
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium uppercase tracking-wider">
              {t("shell.role.admin")}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg">{t("settings.language")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("settings.language.desc")}</p>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="w-full max-w-xs px-3 py-2 rounded-md border bg-background text-sm"
        >
          <option value="en">{t("settings.lang.english")}</option>
          <option value="sv">{t("settings.lang.swedish")}</option>
        </select>
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
          <LogOut className="size-4" /> {t("shell.sign_out")}
        </button>
      </section>
    </div>
  );
}
