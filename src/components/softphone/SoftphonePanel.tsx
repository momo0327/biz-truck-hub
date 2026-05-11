import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, X, Minus, Delete, GripHorizontal } from "lucide-react";
import { useSoftphone, type CallState } from "./SoftphoneProvider";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Idle",
  dialing: "Dialing…",
  ringing: "Ringing…",
  "in-call": "Connected",
  ended: "Call ended",
};

const STATE_DOT: Record<CallState, string> = {
  idle: "bg-muted-foreground",
  dialing: "bg-warning animate-pulse",
  ringing: "bg-warning animate-pulse",
  "in-call": "bg-success",
  ended: "bg-destructive",
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function SoftphonePanel() {
  const { state, call, open, muted, durationSec, hangup, toggleMute, sendDtmf, setOpen, notes, setNotes } = useSoftphone();
  const [showKeypad, setShowKeypad] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dtmfTrail, setDtmfTrail] = useState("");

  useEffect(() => {
    if (state === "idle") {
      setShowKeypad(false);
      setMinimized(false);
      setDtmfTrail("");
    }
  }, [state]);

  if (!open || !call) return null;

  const press = (k: string) => {
    sendDtmf(k);
    setDtmfTrail((t) => (t + k).slice(-12));
  };

  return (
    <div
      className={cn(
        "fixed z-50 bottom-4 right-4 w-[340px] rounded-xl border bg-card shadow-2xl overflow-hidden",
        "animate-in slide-in-from-bottom-4 fade-in duration-200",
      )}
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-primary/10 to-transparent border-b">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("size-2 rounded-full shrink-0", STATE_DOT[state])} />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {STATE_LABEL[state]}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMinimized((m) => !m)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title={minimized ? "Expand" : "Minimize"}
          >
            <Minus className="size-3.5" />
          </button>
          <button
            onClick={() => {
              if (state !== "idle" && state !== "ended") hangup();
              setOpen(false);
            }}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="p-5 space-y-4">
          <div className="text-center space-y-1">
            <div className="size-16 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
              <Phone className={cn("size-7 text-primary", state === "ringing" && "animate-pulse")} />
            </div>
            <div className="font-display text-lg leading-tight pt-2 truncate">
              {call.contactName ?? call.number}
            </div>
            {call.contactName && (
              <div className="text-xs text-muted-foreground">{call.number}</div>
            )}
            <div className="text-2xl font-mono tabular-nums pt-1">
              {state === "in-call" ? fmt(durationSec) : "—:—"}
            </div>
            {dtmfTrail && (
              <div className="text-xs text-muted-foreground font-mono tracking-widest">{dtmfTrail}</div>
            )}
          </div>

          {showKeypad ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => press(k)}
                    className="aspect-square rounded-lg bg-muted hover:bg-muted/70 active:bg-muted/50 text-lg font-medium transition-colors"
                  >
                    {k}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowKeypad(false)}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5"
              >
                Hide keypad
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={toggleMute}
                disabled={state !== "in-call"}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors disabled:opacity-40",
                  muted ? "bg-warning/10 border-warning/30 text-warning" : "hover:bg-muted",
                )}
              >
                {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                <span className="text-[10px] uppercase tracking-wide">{muted ? "Muted" : "Mute"}</span>
              </button>
              <button
                onClick={() => setShowKeypad(true)}
                disabled={state !== "in-call"}
                className="flex flex-col items-center gap-1 py-3 rounded-lg border hover:bg-muted disabled:opacity-40"
              >
                <Delete className="size-5 rotate-180" />
                <span className="text-[10px] uppercase tracking-wide">Keypad</span>
              </button>
              <button
                onClick={hangup}
                disabled={state === "idle" || state === "ended"}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
              >
                <PhoneOff className="size-5" />
                <span className="text-[10px] uppercase tracking-wide">Hang up</span>
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Call notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Type while you talk…"
              className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-none"
            />
          </div>

          <div className="text-[10px] text-muted-foreground text-center italic">
            Demo mode · WebRTC not yet connected
          </div>
        </div>
      )}
    </div>
  );
}
