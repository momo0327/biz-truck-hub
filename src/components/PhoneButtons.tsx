import { Phone, Copy, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useSoftphone } from "@/components/softphone/SoftphoneProvider";

export function PhoneButtons({ phones, companyId, contactName }: { phones: string[]; companyId?: string; contactName?: string }) {
  const { startCall } = useSoftphone();

  if (!phones?.length) return <span className="text-xs text-muted-foreground">No phone</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {phones.map((p) => (
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
    </div>
  );
}
