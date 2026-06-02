import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Suspense } from "react";
import { AdminShell } from "@/components/AdminShell";

function AdminLayout() {
  const loc = useLocation();
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <div key={loc.pathname} className="contents">
          <Outlet />
        </div>
      </Suspense>
    </AdminShell>
  );
}

export const Route = createFileRoute("/_admin")({
  component: AdminLayout,
});
