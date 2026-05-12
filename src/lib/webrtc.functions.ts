import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWebrtcCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const username = process.env.ELKS_WEBRTC_USERNAME;
    const password = process.env.ELKS_WEBRTC_PASSWORD;
    const uri = process.env.ELKS_WEBRTC_URI;
    const wsUrl = process.env.ELKS_WEBRTC_WS_URL;

    if (!username || !password || !uri || !wsUrl) {
      return { ok: false as const, error: "WebRTC credentials not configured" };
    }

    // Normalize wss:// — 46elks shows it as https://, sip.js wants wss://
    const ws = wsUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");

    return { ok: true as const, username, password, uri, wsUrl: ws };
  });
