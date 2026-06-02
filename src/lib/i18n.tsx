import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "sv";

const STORAGE_KEY = "app:lang";

const dict: Record<Lang, Record<string, string>> = {
  en: {
    // Nav
    "nav.dashboard": "Dashboard",
    "nav.companies": "Companies",
    "nav.pipeline": "Pipeline",
    "nav.calendar": "Calendar",
    "nav.call_history": "Call history",
    "nav.archives": "Archives",
    "nav.settings": "Settings",
    "nav.employees": "Employees",
    "nav.invite_employee": "Invite employee",
    // Shell
    "shell.collapse_menu": "Collapse menu",
    "shell.expand_sidebar": "Expand sidebar",
    "shell.collapse_sidebar": "Collapse sidebar",
    "shell.sign_out": "Sign out",
    "shell.sign_out_q": "Sign out?",
    "shell.sign_out_desc": "You will be returned to the login screen.",
    "shell.cancel": "Cancel",
    "shell.role.senior_agent": "Senior Agent",
    "shell.role.admin": "Admin",
    "shell.loading": "Loading…",
    // Dashboard (admin)
    "admin.dash.title": "Dashboard",
    "admin.dash.subtitle": "Pipeline & call activity at a glance.",
    "admin.dash.total_calls": "Total calls",
    "admin.dash.answered": "Answered",
    "admin.dash.answer_rate": "{rate}% answer rate",
    "admin.dash.total_leads": "Total leads",
    "admin.dash.calls_week": "Calls this week",
    "admin.dash.calls_week_sub": "Daily call volume vs answered calls.",
    "admin.dash.calls": "Calls",
    "admin.dash.top_employees": "Top employees",
    "admin.dash.top_employees_sub": "Sorted by total calls made.",
    "admin.dash.view_all": "View all",
    "admin.dash.leads": "Leads",
    // Settings
    "settings.title": "Settings",
    "settings.subtitle": "Account, calling preferences, and integrations",
    "settings.tab.profile": "Profile",
    "settings.tab.calling": "Calling",
    "settings.tab.notifications": "Notifications",
    "settings.tab.team": "Team & Agents",
    "settings.tab.integrations": "Integrations",
    "settings.tab.billing": "Billing",
    "settings.profile.title": "Profile",
    "settings.profile.subtitle": "Your account details.",
    "settings.email": "Email",
    "settings.first_name": "First name",
    "settings.last_name": "Last name",
    "settings.language": "Language",
    "settings.language.desc": "Choose the language for the entire app.",
    "settings.lang.english": "English",
    "settings.lang.swedish": "Svenska",
    "settings.save_profile": "Save calling profile",
    "settings.saved": "Calling profile saved",
  },
  sv: {
    "nav.dashboard": "Översikt",
    "nav.companies": "Företag",
    "nav.pipeline": "Pipeline",
    "nav.calendar": "Kalender",
    "nav.call_history": "Samtalshistorik",
    "nav.archives": "Arkiv",
    "nav.settings": "Inställningar",
    "nav.employees": "Anställda",
    "nav.invite_employee": "Bjud in anställd",
    "shell.collapse_menu": "Fäll ihop meny",
    "shell.expand_sidebar": "Expandera sidofält",
    "shell.collapse_sidebar": "Fäll ihop sidofält",
    "shell.sign_out": "Logga ut",
    "shell.sign_out_q": "Logga ut?",
    "shell.sign_out_desc": "Du kommer att skickas tillbaka till inloggningssidan.",
    "shell.cancel": "Avbryt",
    "shell.role.senior_agent": "Senior säljare",
    "shell.role.admin": "Administratör",
    "shell.loading": "Laddar…",
    "admin.dash.title": "Översikt",
    "admin.dash.subtitle": "Pipeline & samtalsaktivitet i ett ögonkast.",
    "admin.dash.total_calls": "Totalt antal samtal",
    "admin.dash.answered": "Besvarade",
    "admin.dash.answer_rate": "{rate}% svarsfrekvens",
    "admin.dash.total_leads": "Totalt antal leads",
    "admin.dash.calls_week": "Samtal denna vecka",
    "admin.dash.calls_week_sub": "Dagliga samtal jämfört med besvarade samtal.",
    "admin.dash.calls": "Samtal",
    "admin.dash.top_employees": "Toppanställda",
    "admin.dash.top_employees_sub": "Sorterat efter antal samtal.",
    "admin.dash.view_all": "Visa alla",
    "admin.dash.leads": "Leads",
    "settings.title": "Inställningar",
    "settings.subtitle": "Konto, samtalsinställningar och integrationer",
    "settings.tab.profile": "Profil",
    "settings.tab.calling": "Samtal",
    "settings.tab.notifications": "Notiser",
    "settings.tab.team": "Team & säljare",
    "settings.tab.integrations": "Integrationer",
    "settings.tab.billing": "Fakturering",
    "settings.profile.title": "Profil",
    "settings.profile.subtitle": "Dina kontouppgifter.",
    "settings.email": "E-post",
    "settings.first_name": "Förnamn",
    "settings.last_name": "Efternamn",
    "settings.language": "Språk",
    "settings.language.desc": "Välj språk för hela appen.",
    "settings.lang.english": "English",
    "settings.lang.swedish": "Svenska",
    "settings.save_profile": "Spara samtalsprofil",
    "settings.saved": "Samtalsprofil sparad",
  },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "en" || stored === "sv") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
