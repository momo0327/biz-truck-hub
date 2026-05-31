import { Phone, Copy, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useContext } from "react";
import { SoftphoneContext } from "@/components/softphone/SoftphoneProvider";

export function PhoneButtons({ phones, companyId, contactName, compact, readOnly }: { phones: string[]; companyId?: string; contactName?: string; compact?: boolean; readOnly?: boolean }) {
  const ctx = useContext(SoftphoneContext);

  if (!phones?.length) return <span className="text-xs text-muted-foreground">No phone</span>;

  const visible = compact ? phones.slice(0, 1) : phones;
  const extra = compact ? phones.length - visible.length : 0;
  const canCall = !readOnly && !!ctx;

  return (
    <div className={compact ? "inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap" : "flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-1.5"}>
      {visible.map((p) => (
        <div key={p} className="inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 overflow-hidden">
          <a href={`tel:${p.replace(/\s/g, "")}`} className="px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-success/20">
            <Phone className="size-3" /> {p}
          </a>
          {canCall && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                ctx!.startCall({ number: p, contactName, companyId });
              }}
              className="px-2 py-1 hover:bg-success/20 border-l border-success/20"
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
            className="px-2 py-1 hover:bg-success/20 border-l border-success/20"
            title="Copy"
          >
            <Copy className="size-3" />
          </button>
        </div>
      ))}
      {extra > 0 && (
        <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
          +{extra}
        </span>
      )}
    </div>
  );
}
