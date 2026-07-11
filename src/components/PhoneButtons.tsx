import { Phone, Copy, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useContext } from "react";
import { SoftphoneContext } from "@/components/softphone/SoftphoneProvider";

export function PhoneButtons({ phones, researchPhones, companyId, contactName, compact, readOnly }: { phones: string[]; researchPhones?: string[]; companyId?: string; contactName?: string; compact?: boolean; readOnly?: boolean }) {
  const ctx = useContext(SoftphoneContext);

  if (!phones?.length) return <span className="text-xs text-muted-foreground">No phone</span>;

  const researchSet = new Set(researchPhones ?? []);
  const visible = compact ? phones.slice(0, 1) : phones;
  const extra = compact ? phones.length - visible.length : 0;
  const canCall = !readOnly && !!ctx;

  return (
    <div className={compact ? "inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap" : "flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-1.5"}>
      {visible.map((p) => {
        const manual = researchPhones !== undefined && !researchSet.has(p);
        const color = manual
          ? "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"
          : "bg-success/10 text-success border-success/20 hover:bg-success/20";
        const hoverBorder = manual ? "hover:bg-blue-500/20 border-blue-500/20" : "hover:bg-success/20 border-success/20";
        return (
          <div key={p} className={`inline-flex w-full sm:w-auto items-center rounded-full border overflow-hidden ${manual ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-success/10 text-success border-success/20"}`}>
            <a href={`tel:${p.replace(/\s/g, "")}`} className={`flex-1 min-w-0 px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 truncate ${manual ? "hover:bg-blue-500/20" : "hover:bg-success/20"}`}>
              <Phone className="size-3 shrink-0" /> <span className="truncate">{p}</span>
            </a>
            {canCall && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ctx!.startCall({ number: p, contactName, companyId });
                }}
                className={`px-2 py-1 border-l ${hoverBorder}`}
                title="Call from browser"
              >
                <PhoneCall className="size-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(p);
                toast.success("Copied");
              }}
              className={`px-2 py-1 border-l ${hoverBorder}`}
              title="Copy"
            >
              <Copy className="size-3" />
            </button>
          </div>
        );
      })}
      {extra > 0 && (
        <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
          +{extra}
        </span>
      )}
    </div>
  );
}
