import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type CallState = "idle" | "dialing" | "ringing" | "in-call" | "ended";

export interface ActiveCall {
  number: string;
  contactName?: string;
  companyId?: string;
  startedAt: number; // ms epoch when state became in-call
}

interface SoftphoneCtx {
  state: CallState;
  call: ActiveCall | null;
  open: boolean;
  muted: boolean;
  durationSec: number;
  startCall: (opts: { number: string; contactName?: string; companyId?: string }) => void;
  hangup: () => void;
  toggleMute: () => void;
  sendDtmf: (digit: string) => void;
  setOpen: (v: boolean) => void;
  notes: string;
  setNotes: (v: string) => void;
}

const Ctx = createContext<SoftphoneCtx | null>(null);

export function useSoftphone() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSoftphone must be inside <SoftphoneProvider>");
  return v;
}

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CallState>("idle");
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [notes, setNotes] = useState("");
  const timers = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const startCall: SoftphoneCtx["startCall"] = useCallback((opts) => {
    clearTimers();
    setMuted(false);
    setDurationSec(0);
    setNotes("");
    setOpen(true);
    setCall({ ...opts, startedAt: Date.now() });
    setState("dialing");
    // mock progression — replace with real SIP/WebRTC events later
    timers.current.push(window.setTimeout(() => setState("ringing"), 1500));
    timers.current.push(
      window.setTimeout(() => {
        setState("in-call");
        setCall((c) => (c ? { ...c, startedAt: Date.now() } : c));
        tickRef.current = window.setInterval(() => {
          setDurationSec((d) => d + 1);
        }, 1000);
      }, 4000),
    );
  }, []);

  const hangup = useCallback(() => {
    clearTimers();
    setState("ended");
    timers.current.push(
      window.setTimeout(() => {
        setState("idle");
        setCall(null);
      }, 1500),
    );
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const sendDtmf = useCallback((_digit: string) => {
    // stub — will pipe to SIP session later
  }, []);

  useEffect(() => () => clearTimers(), []);

  return (
    <Ctx.Provider
      value={{ state, call, open, muted, durationSec, startCall, hangup, toggleMute, sendDtmf, setOpen, notes, setNotes }}
    >
      {children}
    </Ctx.Provider>
  );
}
