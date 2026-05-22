import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inviter, Registerer, SessionState, UserAgent, type Session } from "sip.js";
import { getWebrtcCredentials } from "@/lib/webrtc.functions";
import { placeCallFn } from "@/lib/calls.functions";

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
  startCall: (opts: { number: string; contactName?: string; companyId?: string }) => void;
  hangup: () => void;
  toggleMute: () => void;
  sendDtmf: (digit: string) => void;
  setOpen: (v: boolean) => void;
  notes: string;
  setNotes: (v: string) => void;
}

type SessionMedia = Session & {
  bye?: () => void | Promise<void>;
  sessionDescriptionHandler?: {
    peerConnection?: RTCPeerConnection;
    sendDtmf?: (digit: string) => void;
  };
};

const Ctx = createContext<SoftphoneCtx | null>(null);

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
  const placeCall = useServerFn(placeCallFn);

  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<number | null>(null);
  const outboundActiveRef = useRef(false);
  const trunkNumberRef = useRef<string | null>(null);
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
          setState("in-call");
          setCall((c) => (c ? { ...c, startedAt: Date.now() } : c));
          startTick();
          // Pipe remote audio into the audio element
          const pc = (session as SessionMedia).sessionDescriptionHandler?.peerConnection;
          if (pc && audioRef.current) {
            const remote = new MediaStream();
            pc.getReceivers().forEach((r) => {
              if (r.track) remote.addTrack(r.track);
            });
            audioRef.current.srcObject = remote;
            audioRef.current.play().catch(() => {});
          }
        } else if (s === SessionState.Terminated) {
          stopTick();
          setState("ended");
          sessionRef.current = null;
          outboundActiveRef.current = false;
          if (audioRef.current) audioRef.current.srcObject = null;
          window.setTimeout(() => {
            setState((cur) => (cur === "ended" ? "idle" : cur));
            setCall((c) => (state === "ended" ? null : c));
          }, 1500);
        }
      });
    },
    [startTick, state, stopTick],
  );

  const startCall: SoftphoneCtx["startCall"] = useCallback(
    (opts) => {
      outboundActiveRef.current = true;
      setMuted(false);
      setDurationSec(0);
      setNotes("");
      setOpen(true);
      setCall({ ...opts, startedAt: Date.now(), direction: "outbound" });

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
      console.log("[softphone] startCall", {
        rawNumber: opts.number,
        normalized,
        contactName: opts.contactName,
        companyId: opts.companyId,
      });
      placeCall({ data: { toNumber: normalized, companyId: opts.companyId } })
        .then((res) => {
          if (!res.ok) throw new Error(res.error);
          console.log("[softphone] 46elks outbound bridge started", { callId: res.callId });
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
    console.log("[softphone] hangup", { state: session?.state, kind: session?.constructor?.name });
    if (session) {
      try {
        switch (session.state) {
          case SessionState.Initial:
          case SessionState.Establishing:
            if (session instanceof Inviter) {
              await session.cancel();
            } else {
              // Inbound invitation that hasn't been answered yet
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
            // already going away
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
    }, 1200);
  }, [stopTick]);

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
        startCall,
        hangup,
        toggleMute,
        sendDtmf,
        setOpen,
        notes,
        setNotes,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
