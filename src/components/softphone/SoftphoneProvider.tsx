import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inviter, Registerer, SessionState, UserAgent, type Session } from "sip.js";
import { getWebrtcCredentials } from "@/lib/webrtc.functions";
import { placeCallFn, hangupCallFn, setCallOutcomeFn, getCallStatusFn } from "@/lib/calls.functions";
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

export type CustomerCallStatus = "pending" | "ringing" | "answered" | "no-answer";

interface SoftphoneCtx {
  state: CallState;
  call: ActiveCall | null;
  open: boolean;
  muted: boolean;
  durationSec: number;
  sipStatus: SipStatus;
  sipError: string | null;
  customerStatus: CustomerCallStatus;
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

type SessionMedia = Session & {
  bye?: () => void | Promise<void>;
  sessionDescriptionHandler?: {
    peerConnection?: RTCPeerConnection;
    sendDtmf?: (digit: string) => void;
  };
};

const Ctx = createContext<SoftphoneCtx | null>(null);
export const SoftphoneContext = Ctx;

export function useSoftphone() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSoftphone must be inside <SoftphoneProvider>");
  return v;
}

function normalizeForSip(num: string) {
  // Strip everything except digits and leading +
  let cleaned = num.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  // 00xx international prefix → +xx
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  // Swedish national format starting with 0 → +46
  if (cleaned.startsWith("0")) return `+46${cleaned.slice(1)}`;
  // Bare digits already in country-code form (e.g. 46723…)
  cleaned = cleaned.replace(/^\++/, "");
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
  const [customerStatus, setCustomerStatus] = useState<CustomerCallStatus>("pending");
  const [outcome, setOutcome] = useState<"answered" | "no-answer" | null>(null);
  const placeCall = useServerFn(placeCallFn);
  const hangupServerCall = useServerFn(hangupCallFn);
  const setOutcomeServer = useServerFn(setCallOutcomeFn);
  const getCallStatus = useServerFn(getCallStatusFn);
  const elksCallIdRef = useRef<string | null>(null);
  const logIdRef = useRef<string | null>(null);

  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<number | null>(null);
  const outboundActiveRef = useRef(false);
  const trunkNumberRef = useRef<string | null>(null);
  const answerPollRef = useRef<number | null>(null);
  const statusPollRef = useRef<number | null>(null);
  const targetNumberRef = useRef<string | null>(null);
  const customerAnsweredRef = useRef(false);
  const fetchCreds = useServerFn(getWebrtcCredentials);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    setDurationSec(0);
    tickRef.current = window.setInterval(() => setDurationSec((d) => d + 1), 1000);
  }, [stopTick]);

  const stopStatusPoll = useCallback(() => {
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  // Lazy-init the audio element
  useEffect(() => {
    const a = document.createElement("audio");
    a.autoplay = true;
    a.style.display = "none";
    document.body.appendChild(a);
    audioRef.current = a;
    return () => {
      a.remove();
      audioRef.current = null;
    };
  }, [stopTick]);

  // Connect & register with 46elks once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSipStatus("connecting");
      try {
        const creds = await fetchCreds();
        if (cancelled) return;
        if (!creds.ok) {
          setSipStatus("failed");
          setSipError(creds.error);
          return;
        }

        console.log("[softphone] SIP connect →", { uri: creds.uri, wsUrl: creds.wsUrl });
        // Capture the trunk number (digits only) so we can detect loopback INVITEs
        trunkNumberRef.current = creds.uri.split("@")[0].replace(/[^\d]/g, "");
        const ua = new UserAgent({
          uri: UserAgent.makeURI(`sip:${creds.uri}`)!,
          authorizationUsername: creds.username,
          authorizationPassword: creds.password,
          transportOptions: { server: creds.wsUrl, traceSip: true },
          delegate: {
            onInvite: (invitation) => {
              const fromUser = invitation.remoteIdentity.uri.user ?? "";
              const fromDigits = fromUser.replace(/[^\d]/g, "");
              console.log("[softphone] incoming INVITE", {
                from: fromUser,
                displayName: invitation.remoteIdentity.displayName,
                outboundActive: outboundActiveRef.current,
                trunk: trunkNumberRef.current,
              });
              // 46elks' WebRTC flow starts as an API-created call to this browser,
              // then connects the real target after we answer it.
              if (
                sessionRef.current ||
                (!outboundActiveRef.current &&
                  trunkNumberRef.current &&
                  fromDigits === trunkNumberRef.current)
              ) {
                console.warn("[softphone] rejecting INVITE — busy or loopback");
                invitation.reject().catch((err) => console.error("INVITE reject failed", err));
                return;
              }
              if (outboundActiveRef.current) {
                sessionRef.current = invitation;
                attachSessionHandlers(invitation);
                invitation
                  .accept({
                    sessionDescriptionHandlerOptions: {
                      constraints: {
                        audio: {
                          echoCancellation: false,
                          noiseSuppression: false,
                          autoGainControl: false,
                          channelCount: 1,
                          sampleRate: 48000,
                          sampleSize: 16,
                        },
                        video: false,
                      },
                    },
                  })
                  .catch((err) => console.error("Outbound bridge accept failed", err));
                return;
              }
              // Inbound — auto-attach handlers but don't auto-answer
              sessionRef.current = invitation;
              setCall({
                number: fromUser || "Unknown",
                contactName: invitation.remoteIdentity.displayName,
                startedAt: Date.now(),
                direction: "inbound",
              });
              setOpen(true);
              setState("ringing");
              attachSessionHandlers(invitation);
            },
          },
        });

        uaRef.current = ua;
        await ua.start();
        if (cancelled) return;

        const registerer = new Registerer(ua);
        registererRef.current = registerer;
        registerer.stateChange.addListener((s) => {
          if (cancelled) return;
          if (s === "Registered") {
            setSipStatus("registered");
            setSipError(null);
          } else if (s === "Unregistered" || s === "Terminated") {
            setSipStatus("disconnected");
          }
        });
        await registerer.register();
      } catch (e) {
        if (cancelled) return;
        console.error("SIP register failed", e);
        setSipStatus("failed");
        setSipError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      try {
        registererRef.current?.unregister();
      } catch (e) {
        console.error("SIP unregister failed", e);
      }
      try {
        uaRef.current?.stop();
      } catch (e) {
        console.error("SIP stop failed", e);
      }
      stopTick();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachSessionHandlers = useCallback(
    (session: Session) => {
      session.stateChange.addListener((s) => {
        if (s === SessionState.Establishing) {
          setState("ringing");
        } else if (s === SessionState.Established) {
          // SIP "Established" means our browser leg is up — but 46elks hasn't
          // necessarily reached the customer yet. Pipe audio through, but stay
          // in "ringing" (UI shows "Calling…") until we actually see sustained
          // inbound RTP packets from the customer.
          const pc = (session as SessionMedia).sessionDescriptionHandler?.peerConnection;
          if (pc && audioRef.current) {
            const remote = new MediaStream();
            const attach = () => {
              if (!audioRef.current) return;
              audioRef.current.srcObject = remote;
              audioRef.current.muted = false;
              audioRef.current.volume = 1;
              audioRef.current.play().catch((err) => console.warn("[softphone] audio.play failed", err));
            };
            // Attach any receivers already negotiated
            pc.getReceivers().forEach((r) => {
              if (r.track && r.track.kind === "audio") remote.addTrack(r.track);
            });
            // And any tracks that arrive after SDP negotiation completes
            pc.ontrack = (ev) => {
              console.log("[softphone] ontrack", ev.track.kind, ev.streams.length);
              if (ev.track.kind !== "audio") return;
              if (!remote.getTracks().includes(ev.track)) remote.addTrack(ev.track);
              attach();
            };
            // Ensure our mic track is actually enabled (sendrecv)
            pc.getSenders().forEach((s) => {
              if (s.track && s.track.kind === "audio") s.track.enabled = true;
            });
            attach();
          }

          const isOutbound = outboundActiveRef.current;
          if (!isOutbound) {
            // Inbound calls are real audio the moment we accept.
            setCustomerStatus("answered");
            setState("in-call");
            setCall((c) => (c ? { ...c, startedAt: Date.now() } : c));
            startTick();
            return;
          }

          // Outbound: the browser leg is connected, but the customer leg may
          // still be ringing. Keep audio connected, then poll the provider call
          // details for the target leg instead of guessing from ringback audio.
          setState("in-call");
          setCustomerStatus("ringing");
          stopStatusPoll();
          statusPollRef.current = window.setInterval(() => {
            const callId = elksCallIdRef.current;
            const targetNumber = targetNumberRef.current;
            if (!callId || !targetNumber || customerAnsweredRef.current) return;
            getCallStatus({ data: { callId, targetNumber } })
              .then((res) => {
                if (!res.ok) return;
                if (res.targetAnswered) {
                  customerAnsweredRef.current = true;
                  setCustomerStatus("answered");
                  setOutcome("answered");
                  setCall((c) => (c ? { ...c, startedAt: Date.now() } : c));
                  startTick();
                  stopStatusPoll();
                } else if (res.finished) {
                  setCustomerStatus("no-answer");
                  setOutcome("no-answer");
                  stopStatusPoll();
                }
              })
              .catch((err) => console.warn("[softphone] call status poll failed", err));
          }, 1500);
        } else if (s === SessionState.Terminated) {
          if (answerPollRef.current) {
            window.clearInterval(answerPollRef.current);
            answerPollRef.current = null;
          }
          stopStatusPoll();
          stopTick();
          if (outboundActiveRef.current && !customerAnsweredRef.current) {
            setCustomerStatus("no-answer");
            setOutcome("no-answer");
          }
          setState("ended");
          sessionRef.current = null;
          outboundActiveRef.current = false;
          if (audioRef.current) audioRef.current.srcObject = null;
          window.setTimeout(() => {
            setState((cur) => (cur === "ended" ? "idle" : cur));
            setCall(null);
            setCustomerStatus("pending");
            customerAnsweredRef.current = false;
          }, 1500);
        }
      });
    },
    [getCallStatus, startTick, stopStatusPoll, stopTick],
  );

  const startCall: SoftphoneCtx["startCall"] = useCallback(
    (opts) => {
      outboundActiveRef.current = true;
      setMuted(false);
      setDurationSec(0);
      setNotes("");
      setOpen(true);
      setCustomerStatus("pending");
      setOutcome(null);
      customerAnsweredRef.current = false;
      logIdRef.current = null;
      setCall({ ...opts, startedAt: Date.now(), direction: "outbound" });

      // Prime audio playback within the user gesture so the browser allows
      // autoplay once the remote stream arrives.
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.play().catch(() => {});
      }

      const ua = uaRef.current;
      if (!ua || sipStatus !== "registered") {
        // Fallback: mock progression so the UI is still usable
        setState("dialing");
        window.setTimeout(() => setState("ringing"), 1200);
        window.setTimeout(() => {
          setState("in-call");
          setCall((c) => (c ? { ...c, startedAt: Date.now() } : c));
          startTick();
        }, 3000);
        return;
      }

      setState("dialing");
      const normalized = normalizeForSip(opts.number);
      targetNumberRef.current = normalized;
      console.log("[softphone] startCall", {
        rawNumber: opts.number,
        normalized,
        contactName: opts.contactName,
        companyId: opts.companyId,
      });
      placeCall({ data: { toNumber: normalized, companyId: opts.companyId } })
        .then((res) => {
          if (!res.ok) throw new Error(res.error);
          elksCallIdRef.current = res.callId ?? null;
          logIdRef.current = res.logId ?? null;
          console.log("[softphone] 46elks outbound bridge started", { callId: res.callId, logId: res.logId });
        })
        .catch((err) => {
          console.error("46elks outbound bridge failed", err);
          setSipError(err instanceof Error ? err.message : String(err));
          setState("ended");
          outboundActiveRef.current = false;
        });
    },
    [sipStatus, startTick, placeCall],
  );

  const hangup = useCallback(async () => {
    const session = sessionRef.current;
    const callId = elksCallIdRef.current;
    const activeCall = call;
    const trimmedNotes = notes.trim();
    console.log("[softphone] hangup", { state: session?.state, kind: session?.constructor?.name, callId });

    // Persist softphone notes into the company's internal notes (append).
    if (activeCall?.companyId && trimmedNotes) {
      (async () => {
        const { data: existing } = await supabase
          .from("companies")
          .select("notes")
          .eq("id", activeCall.companyId!)
          .maybeSingle();
        const stamp = new Date().toLocaleString();
        const header = `[${stamp} — Call ${activeCall.number}]`;
        const block = `${header}\n${trimmedNotes}`;
        const merged = existing?.notes ? `${existing.notes}\n\n${block}` : block;
        await supabase.from("companies").update({ notes: merged }).eq("id", activeCall.companyId!);
      })().catch((err) => console.error("[softphone] save notes failed", err));
    }

    // Tell 46elks to terminate the whole call (both legs) — without this the
    // customer's phone keeps ringing if we hang up before they answer.
    if (callId) {
      hangupServerCall({ data: { callId } }).catch((err) => {
        console.error("[softphone] 46elks hangup failed", err);
      });
    }

    if (session) {
      try {
        switch (session.state) {
          case SessionState.Initial:
          case SessionState.Establishing:
            if (session instanceof Inviter) {
              await session.cancel();
            } else {
              const inv = session as unknown as { reject?: () => Promise<void> };
              await inv.reject?.();
            }
            break;
          case SessionState.Established: {
            const bye = (session as SessionMedia).bye;
            if (typeof bye === "function") {
              await bye.call(session);
            }
            break;
          }
          case SessionState.Terminating:
          case SessionState.Terminated:
            break;
        }
      } catch (e) {
        console.error("[softphone] hangup error", e);
      }
    }
    stopTick();
    setState("ended");
    window.setTimeout(() => {
      setState("idle");
      setCall(null);
      sessionRef.current = null;
      outboundActiveRef.current = false;
      elksCallIdRef.current = null;
    }, 1200);
  }, [stopTick, hangupServerCall, call, notes]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const session = sessionRef.current;
      const pc = (session as SessionMedia | null)?.sessionDescriptionHandler?.peerConnection;
      pc?.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "audio") sender.track.enabled = !next;
      });
      return next;
    });
  }, []);

  const sendDtmf = useCallback((digit: string) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;
    try {
      const sdh = (session as SessionMedia).sessionDescriptionHandler;
      sdh?.sendDtmf?.(digit);
    } catch (e) {
      console.error("DTMF failed", e);
    }
  }, []);

  const markOutcome = useCallback(async (next: "answered" | "no-answer") => {
    setOutcome(next);
    const id = logIdRef.current;
    if (!id) return;
    try {
      await setOutcomeServer({ data: { logId: id, outcome: next } });
    } catch (e) {
      console.error("[softphone] markOutcome failed", e);
    }
  }, [setOutcomeServer]);

  return (
    <Ctx.Provider
      value={{
        state,
        call,
        open,
        muted,
        durationSec,
        sipStatus,
        sipError,
        outcome,
        startCall,
        hangup,
        toggleMute,
        sendDtmf,
        setOpen,
        notes,
        setNotes,
        markOutcome,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
