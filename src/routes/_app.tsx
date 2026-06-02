import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/PageSkeletons";

function AppLayout() {
  const loc = useLocation();
  return (
    <AppShell>
      {/* Key on pathname forces the new route to mount immediately on
          navigation, so the user sees the next page's own loading skeleton
          right away instead of the previous page sitting frozen while the
          new data loads. */}
      <Suspense fallback={<RouteSkeleton pathname={loc.pathname} />}>
        <div key={loc.pathname} className="contents">
          <Outlet />
        </div>
      </Suspense>
    </AppShell>
  );
}

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
