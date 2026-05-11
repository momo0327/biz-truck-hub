import { Phone, Copy, PhoneCall, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { placeCallFn } from "@/lib/calls.functions";
import { useState } from "react";

export function PhoneButtons({ phones, companyId }: { phones: string[]; companyId?: string }) {
  const placeCall = useServerFn(placeCallFn);
  const [callingNum, setCallingNum] = useState<string | null>(null);

  if (!phones?.length) return <span className="text-xs text-muted-foreground">No phone</span>;

  async function handleCall(p: string) {
    if (!companyId) return;
    setCallingNum(p);
    try {
      const res = await placeCall({ data: { companyId, toNumber: p } });
      if (res.ok) toast.success("Calling your phone… answer to connect");
      else toast.error(res.error ?? "Call failed");
    } catch (e: any) {
      toast.error(e.message ?? "Call failed");
    } finally {
      setCallingNum(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {phones.map((p) => (
        <div key={p} className="inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 overflow-hidden">
          <a href={`tel:${p.replace(/\s/g, "")}`} className="px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-success/20">
            <Phone className="size-3" /> {p}
          </a>
          {companyId && (
            <button
              onClick={(e) => { e.stopPropagation(); handleCall(p); }}
              disabled={callingNum === p}
              className="px-2 py-1 hover:bg-success/20 border-l border-success/20 disabled:opacity-50"
              title="Call via 46elks"
            >
              {callingNum === p ? <Loader2 className="size-3 animate-spin" /> : <PhoneCall className="size-3" />}
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
    </div>
  );
}

