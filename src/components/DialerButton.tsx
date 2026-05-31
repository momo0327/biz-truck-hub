import { useContext, useState } from "react";
import { Phone, PhoneCall, Delete } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SoftphoneContext } from "@/components/softphone/SoftphoneProvider";
import { toast } from "sonner";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function DialerButton() {
  const ctx = useContext(SoftphoneContext);
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");

  function press(k: string) {
    setNumber((n) => n + k);
  }

  function call() {
    const trimmed = number.trim();
    if (!trimmed) return toast.error("Enter a number");
    if (!ctx) return toast.error("Softphone unavailable");
    ctx.startCall({ number: trimmed });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm hover:bg-muted"
          title="Open dialer"
        >
          <Phone className="size-4" /> Dial
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="+46…"
            className="flex-1 px-3 py-2 rounded-md border bg-background text-sm font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") call();
            }}
            autoFocus
          />
          <button
            onClick={() => setNumber((n) => n.slice(0, -1))}
            className="p-2 rounded-md border hover:bg-muted"
            title="Backspace"
          >
            <Delete className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="py-3 rounded-md border bg-card text-base font-medium hover:bg-muted"
            >
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={call}
          className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md bg-success text-success-foreground text-sm font-medium hover:opacity-90"
        >
          <PhoneCall className="size-4" /> Call
        </button>
        {ctx && ctx.sipStatus !== "registered" && (
          <p className="text-xs text-muted-foreground text-center">
            Softphone: {ctx.sipStatus}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
