import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";

export const Route = createFileRoute("/_admin")({
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
