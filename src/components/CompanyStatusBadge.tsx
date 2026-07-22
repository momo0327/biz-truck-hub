import { STATUS_META } from "@/lib/companies";
import { useCustomStatuses } from "@/lib/custom-statuses";
import type { Company } from "@/lib/companies";

interface Props {
  company: Pick<Company, "status" | "custom_status_id">;
  size?: "sm" | "md";
}

export function CompanyStatusBadge({ company, size = "md" }: Props) {
  const { customStatuses } = useCustomStatuses();

  if (company.custom_status_id) {
    const cs = customStatuses.find((s) => s.id === company.custom_status_id);
    const label = cs?.label ?? "Custom";
    const color = cs?.color ?? "#6366f1";
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium tracking-[0.12em] uppercase rounded-full w-fit ${
          size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"
        }`}
        style={{ backgroundColor: `${color}22`, color }}
      >
        <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
    );
  }

  const meta = STATUS_META[company.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium tracking-[0.12em] uppercase rounded-full w-fit ${meta.tone} ${
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"
      }`}
    >
      <span className={`size-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
