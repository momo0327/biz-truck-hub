import { Phone, Copy, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useSoftphone } from "@/components/softphone/SoftphoneProvider";

export function PhoneButtons({ phones, companyId, contactName, compact }: { phones: string[]; companyId?: string; contactName?: string; compact?: boolean }) {
  const { startCall } = useSoftphone();

  if (!phones?.length) return <span className="text-xs text-muted-foreground">No phone</span>;

  const visible = compact ? phones.slice(0, 1) : phones;
  const extra = compact ? phones.length - visible.length : 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((p) => (
        <div key={p} className="inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 overflow-hidden">
          <a href={`tel:${p.replace(/\s/g, "")}`} className="px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-success/20">
            <Phone className="size-3" /> {p}
          </a>
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log("[PhoneButtons] click", { raw: p, companyId, contactName });
              startCall({ number: p, contactName, companyId });
            }}
            className="px-2 py-1 hover:bg-success/20 border-l border-success/20"
            title="Call from browser"
          >
            <PhoneCall className="size-3" />
          </button>
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
