import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { UserRoleProvider } from "@/lib/roles";
import { I18nProvider } from "@/lib/i18n";

import appCss from "../styles.css?url";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CRM system — Autowahabs interna kundsystem" },
      { name: "description", content: "Autowahabs interna CRM system för kundhantering." },
      { property: "og:title", content: "CRM system — Autowahabs interna kundsystem" },
      { name: "twitter:title", content: "CRM system — Autowahabs interna kundsystem" },
      { property: "og:description", content: "Autowahabs interna CRM system för kundhantering." },
      { name: "twitter:description", content: "Autowahabs interna CRM system för kundhantering." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dd0dc1ab-554b-4f90-9a50-5025d738c976/id-preview-e6b7cd76--37fb8703-f1d5-43d1-8eaa-f64cbb3aea53.lovable.app-1778624089047.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dd0dc1ab-554b-4f90-9a50-5025d738c976/id-preview-e6b7cd76--37fb8703-f1d5-43d1-8eaa-f64cbb3aea53.lovable.app-1778624089047.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster richColors position="top-right" />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  if (typeof window !== "undefined") {
    const hash = window.location.hash;
    const search = window.location.search;
    const path = window.location.pathname;
    const hasInviteParams =
      search.includes("type=invite") ||
      search.includes("token_hash=") ||
      (path === "/login" && search.includes("code="));
    if (
      path !== "/accept-invite" &&
      (hash.includes("type=invite") ||
        hash.includes("type=recovery") ||
        hash.includes("type=signup") ||
        hasInviteParams)
    ) {
      window.location.replace(`/accept-invite${window.location.search}${hash}`);
    }
  }
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <UserRoleProvider>
            <Outlet />
          </UserRoleProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
