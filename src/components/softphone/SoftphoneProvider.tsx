import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { TelnyxRTC } from "@telnyx/webrtc";
import type { INotification } from "@telnyx/webrtc";
import type Call from "@telnyx/webrtc/lib/src/Modules/Verto/webrtc/Call";
import { getTelnyxCredentialsFn } from "@/lib/telnyx.functions";
import { setCallOutcomeFn } from "@/lib/calls.functions";
import { supabase } from "@/integrations/supabase/client";

export type CallState = "idle" | "dialing" | "ringing" | "in-call" | "ended";
export type SipStatus = "disconnected" | "connecting" | "registered" | "failed";

export interface ActiveCall {
  number: string;
  contactName?: string;
  companyId?: string;
  startedAt: number;
  direction: "outbound" | "inbound";
}

interface SoftphoneCtx {
  state: CallState;
  call: ActiveCall | null;
  open: boolean;
  muted: boolean;
  durationSec: number;
  sipStatus: SipStatus;
  sipError: string | null;
  outcome: "answered" | "no-answer" | null;
  startCall: (opts: { number: string; contactName?: string; companyId?: string }) => void;
  hangup: () => void;
  toggleMute: () => void;
  sendDtmf: (digit: string) => void;
  setOpen: (v: boolean) => void;
  notes: string;
  setNotes: (v: string) => void;
  markOutcome: (outcome: "answered" | "no-answer") => Promise<void>;
}

const Ctx = createContext<SoftphoneCtx | null>(null);
export const SoftphoneContext = Ctx;

export function useSoftphone() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSoftphone must be inside <SoftphoneProvider>");
  return v;
}

function normalizeE164(num: string) {
  let cleaned = num.trim().replace(/\s/g, "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("0")) return `+46${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CallState>("idle");
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [notes, setNotes] = useState("");
  const [sipStatus, setSipStatus] = useState<SipStatus>("disconnected");
  const [sipError, setSipError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"answered" | "no-answer" | null>(null);

  const setOutcomeServer = useServerFn(setCallOutcomeFn);
  const fetchCreds = useServerFn(getTelnyxCredentialsFn);

  const clientRef = useRef<InstanceType<typeof TelnyxRTC> | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<number | null>(null);
  const logIdRef = useRef<string | null>(null);
  const callWasAnsweredRef = useRef(false);
  const callAnsweredAtRef = useRef<number | null>(null);
  const pendingOptsRef = useRef<{ number: string; contactName?: string; companyId?: string } | null>(null);
  const setOutcomeServerRef = useRef(setOutcomeServer);
  useEffect(() => { setOutcomeServerRef.current = setOutcomeServer; }, [setOutcomeServer]);

  const stopTick = useCallback(() => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    setDurationSec(0);
    tickRef.current = window.setInterval(() => setDurationSec((d) => d + 1), 1000);
  }, [stopTick]);

  useEffect(() => {
    const a = document.createElement("audio");
    a.autoplay = true;
    a.style.display = "none";
    document.body.appendChild(a);
    audioRef.current = a;
    return () => { a.remove(); audioRef.current = null; };
  }, []);

  // Init Telnyx on mount
  useEffect(() => {
    let cancelled = false;
    let client: InstanceType<typeof TelnyxRTC> | null = null;

    (async () => {
      setSipStatus("connecting");
      try {
        const creds = await fetchCreds();
        if (cancelled) return;
        if (!creds.ok) { setSipStatus("failed"); setSipError(creds.error); return; }

        client = new TelnyxRTC({
          login: creds.username,
          password: creds.password,
        });

        clientRef.current = client;

        client.on("telnyx.ready", () => {
          if (cancelled) return;
          setSipStatus("registered");
          setSipError(null);
          console.log("[telnyx] ready");
        });

        client.on("telnyx.error", (err: any) => {
          if (cancelled) return;
          console.error("[telnyx] error", err);
          setSipStatus("failed");
          setSipError(err?.message ?? "Telnyx error");
        });

        client.on("telnyx.socket.close", () => {
          if (cancelled) return;
          setSipStatus("disconnected");
        });

        client.on("telnyx.notification", (notification: INotification) => {
          console.log("[telnyx] notification RAW", JSON.stringify({ type: notification.type, state: (notification.call as any)?.state, error: (notification as any).error?.message }));
          if (cancelled) return;
          const telCall = notification.call;
          console.log("[telnyx] notification", notification.type, (telCall as any)?.state, notification);
          if (!telCall) return;

          const opts = pendingOptsRef.current;

          if (notification.type === "callUpdate") {
            const cs = telCall.state;

            if (cs === "ringing" || cs === "trying") {
              setState("ringing");
            } else if (cs === "active") {
              callWasAnsweredRef.current = true;
              callAnsweredAtRef.current = Date.now();
              activeCallRef.current = telCall;

              // Attach remote audio
              if (audioRef.current) {
                audioRef.current.srcObject = (telCall as any).remoteStream ?? null;
                audioRef.current.play().catch(() => {});
              }

              setState("in-call");
              setCall((c) => (c ? { ...c, startedAt: Date.now() } : c));
              startTick();

              // Log call
              (async () => {
                const number = opts?.number ?? "";
                const { data: inserted } = await supabase.from("call_logs").insert({
                  company_id: opts?.companyId ?? null,
                  user_id: (await supabase.auth.getUser()).data.user?.id ?? "",
                  note: `Outbound call to ${number}`,
                  status: "ongoing",
                  to_number: number,
                  direction: "outbound",
                }).select("id").single();
                logIdRef.current = inserted?.id ?? null;
                if (opts?.companyId) {
                  await supabase.from("companies").update({ last_contact: new Date().toISOString() }).eq("id", opts.companyId);
                }
              })().catch((e) => console.error("[telnyx] call_log failed", e));

            } else if (cs === "hangup" || cs === "destroy") {
              stopTick();

              const VOICEMAIL_THRESHOLD_MS = 8000;
              const answeredAt = callAnsweredAtRef.current;
              const talkDuration = answeredAt ? Date.now() - answeredAt : 0;
              const wasRealAnswer = callWasAnsweredRef.current && talkDuration >= VOICEMAIL_THRESHOLD_MS;
              const autoOutcome: "answered" | "no-answer" = wasRealAnswer ? "answered" : "no-answer";

              setOutcome(autoOutcome);
              if (logIdRef.current) {
                setOutcomeServerRef.current({ data: { logId: logIdRef.current, outcome: autoOutcome } })
                  .catch((e) => console.error("[telnyx] auto-outcome failed", e));
              }

              callWasAnsweredRef.current = false;
              callAnsweredAtRef.current = null;
              activeCallRef.current = null;
              logIdRef.current = null;
              if (audioRef.current) audioRef.current.srcObject = null;
              setState("ended");
              window.setTimeout(() => { setState("idle"); setCall(null); }, 1500);
            }
          }
        });

        await client.connect();
      } catch (e) {
        if (cancelled) return;
        console.error("[telnyx] init failed", e);
        setSipStatus("failed");
        setSipError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      try { client?.disconnect(); } catch {}
      clientRef.current = null;
      stopTick();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCall: SoftphoneCtx["startCall"] = useCallback((opts) => {
    const client = clientRef.current;
    if (!client || sipStatus !== "registered") {
      setOpen(true);
      setSipError(sipStatus === "connecting" ? "Still connecting, please wait…" : "Softphone not connected");
      return;
    }

    callWasAnsweredRef.current = false;
    callAnsweredAtRef.current = null;
    logIdRef.current = null;
    pendingOptsRef.current = opts;
    setMuted(false);
    setDurationSec(0);
    setNotes("");
    setOpen(true);
    setOutcome(null);
    setState("dialing");
    setCall({ ...opts, startedAt: Date.now(), direction: "outbound" });

    const normalized = normalizeE164(opts.number);
    console.log("[telnyx] calling", normalized);

    try {
      const telCall = client.newCall({
        destinationNumber: normalized,
        audio: true,
        video: false,
      });
      console.log("[telnyx] newCall returned", telCall);
      (telCall as any).on?.("telnyx.notification", (n: any) => console.log("[telnyx] call-level notification", n?.type, n?.call?.state));
      activeCallRef.current = telCall;
    } catch (err) {
      console.error("[telnyx] newCall failed", err);
      setSipError(err instanceof Error ? err.message : String(err));
      setState("ended");
      window.setTimeout(() => { setState("idle"); setCall(null); }, 1500);
    }
  }, [sipStatus]);

  const hangup = useCallback(async () => {
    const activeCallSnapshot = call;
    const trimmedNotes = notes.trim();

    if (activeCallSnapshot?.companyId && trimmedNotes) {
      (async () => {
        const { data: existing } = await supabase.from("companies").select("notes").eq("id", activeCallSnapshot.companyId!).maybeSingle();
        const stamp = new Date().toLocaleString();
        const block = `[${stamp} — Call ${activeCallSnapshot.number}]\n${trimmedNotes}`;
        const merged = existing?.notes ? `${existing.notes}\n\n${block}` : block;
        await supabase.from("companies").update({ notes: merged }).eq("id", activeCallSnapshot.companyId!);
      })().catch((e) => console.error("[telnyx] save notes failed", e));
    }

    try { activeCallRef.current?.hangup(); } catch (e) { console.error("[telnyx] hangup error", e); }

    stopTick();
    setState("ended");
    if (audioRef.current) audioRef.current.srcObject = null;
    window.setTimeout(() => {
      setState("idle");
      setCall(null);
      activeCallRef.current = null;
    }, 1200);
  }, [stopTick, call, notes]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        if (next) activeCallRef.current?.muteAudio();
        else activeCallRef.current?.unmuteAudio();
      } catch {}
      return next;
    });
  }, []);

  const sendDtmf = useCallback((digit: string) => {
    try { activeCallRef.current?.dtmf(digit); } catch {}
  }, []);

  const markOutcome = useCallback(async (next: "answered" | "no-answer") => {
    setOutcome(next);
    const id = logIdRef.current;
    if (!id) return;
    try { await setOutcomeServer({ data: { logId: id, outcome: next } }); }
    catch (e) { console.error("[telnyx] markOutcome failed", e); }
  }, [setOutcomeServer]);

  return (
    <Ctx.Provider value={{ state, call, open, muted, durationSec, sipStatus, sipError, outcome, startCall, hangup, toggleMute, sendDtmf, setOpen, notes, setNotes, markOutcome }}>
      {children}
    </Ctx.Provider>
  );
}
