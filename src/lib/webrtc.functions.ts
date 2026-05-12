import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWebrtcCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const username = process.env.ELKS_WEBRTC_USERNAME?.trim();
    const password = process.env.ELKS_WEBRTC_PASSWORD?.trim();
    const uri = process.env.ELKS_WEBRTC_URI?.trim();
    const wsRaw = process.env.ELKS_WEBRTC_WS_URL?.trim();

    if (!username || !password || !uri || !wsRaw) {
      return { ok: false as const, error: "WebRTC credentials not configured" };
    }

    // 46elks shows the websocket as https://... — sip.js needs wss://.
    // Accept pasted values with labels, e.g. "webRTCwebsocket: https://...".
    const urlMatch = wsRaw.match(/(?:wss?|https?):\/\/[^\s"'<>]+/i);
    let ws = urlMatch?.[0] ?? wsRaw;
    if (ws.startsWith("https://")) ws = "wss://" + ws.slice("https://".length);
    else if (ws.startsWith("http://")) ws = "ws://" + ws.slice("http://".length);
    else if (!ws.startsWith("wss://") && !ws.startsWith("ws://")) ws = "wss://" + ws.replace(/^\/+/, "");

    console.log("[webrtc] returning ws url:", ws);

    return { ok: true as const, username, password, uri, wsUrl: ws };
  });
