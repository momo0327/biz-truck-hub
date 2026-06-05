import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, X, Minus, Delete, GripHorizontal, Check, PhoneMissed } from "lucide-react";
import { useSoftphone, type CallState } from "./SoftphoneProvider";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Idle",
  dialing: "Dialing…",
  ringing: "Ringing…",
  "in-call": "Connected",
  ended: "Call ended",
};

const DIRECTION_LABEL = {
  outbound: "Outbound call",
  inbound: "Incoming call",
};

const STATE_DOT: Record<CallState, string> = {
  idle: "bg-muted-foreground",
  dialing: "bg-warning animate-pulse",
  ringing: "bg-warning animate-pulse",
  "in-call": "bg-success",
  ended: "bg-destructive",
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function SoftphonePanel() {
  const {
    state,
    call,
    open,
    muted,
    durationSec,
    sipStatus,
    sipError,
    outcome,
    hangup,
    toggleMute,
    sendDtmf,
    setOpen,
    notes,
    setNotes,
    markOutcome,
  } = useSoftphone();
  const [showKeypad, setShowKeypad] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dtmfTrail, setDtmfTrail] = useState("");
  const PANEL_W = 340;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (state === "idle") {
      setShowKeypad(false);
      setMinimized(false);
      setDtmfTrail("");
    }
  }, [state]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const x = Math.max(
        8,
        Math.min(window.innerWidth - PANEL_W - 8, e.clientX - dragRef.current.dx),
      );
      const y = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - dragRef.current.dy));
      setPos({ x, y });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!open || !call) return null;

  const press = (k: string) => {
    sendDtmf(k);
    setDtmfTrail((t) => (t + k).slice(-12));
  };

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    if (!pos) setPos({ x: rect.left, y: rect.top });
  };

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : {};

  return (
    <div
      style={style}
      className={cn(
        "fixed z-50 w-[340px] rounded-xl border bg-card shadow-2xl overflow-hidden",
        !pos && "bottom-4 right-4",
        "animate-in slide-in-from-bottom-4 fade-in duration-200",
      )}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        className="flex items-center justify-between px-4 py-2.5 bg-muted/60 border-b cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="size-3.5 text-muted-foreground/60" />
          <span className={cn("size-2 rounded-full shrink-0", STATE_DOT[state])} />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {call.direction === "outbound" && state === "ringing" ? "Calling…" : STATE_LABEL[state]}
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
            <div className="size-16 mx-auto rounded-full bg-muted border border-primary/20 flex items-center justify-center">
              <Phone
                className={cn("size-7 text-primary", state === "ringing" && "animate-pulse")}
              />
            </div>
            <div className="font-display text-lg leading-tight pt-2 truncate">
              {call.contactName ?? call.number}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {DIRECTION_LABEL[call.direction]}
            </div>
            {call.contactName && <div className="text-xs text-muted-foreground">{call.number}</div>}
            <div className="text-2xl font-mono tabular-nums pt-1">
              {state === "in-call" ? fmt(durationSec) : "—:—"}
            </div>
            {dtmfTrail && (
              <div className="text-xs text-muted-foreground font-mono tracking-widest">
                {dtmfTrail}
              </div>
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
                <span className="text-[10px] uppercase tracking-wide">
                  {muted ? "Muted" : "Mute"}
                </span>
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
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Mark outcome
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => markOutcome("answered")}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors",
                  outcome === "answered"
                    ? "bg-success text-success-foreground border-success"
                    : "bg-success/10 text-success border-success/30 hover:bg-success/20",
                )}
              >
                <Check className="size-4" /> Answered
              </button>
              <button
                onClick={() => markOutcome("no-answer")}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors",
                  outcome === "no-answer"
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20",
                )}
              >
                <PhoneMissed className="size-4" /> Not answered
              </button>
            </div>
          </div>


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
            {sipStatus === "registered" && "Connected · 46elks WebRTC"}
            {sipStatus === "connecting" && "Connecting to 46elks…"}
            {sipStatus === "disconnected" && "WebRTC disconnected"}
            {sipStatus === "failed" && (sipError ? `WebRTC failed: ${sipError}` : "WebRTC failed")}
          </div>
        </div>
      )}
    </div>
  );
}
