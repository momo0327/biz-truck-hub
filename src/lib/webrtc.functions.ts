import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getWebrtcCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Read the WebRTC credentials with the service role — the password column
    // is no longer readable by the authenticated role (column-level grant
    // revoked) so end-users cannot exfiltrate it from the profiles table.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("elks_webrtc_uri,elks_webrtc_username,elks_webrtc_password")
      .eq("user_id", userId)
      .maybeSingle();

    const username =
      (profile?.elks_webrtc_username as string | null)?.trim() ||
      process.env.ELKS_WEBRTC_USERNAME?.trim();
    const password =
      (profile?.elks_webrtc_password as string | null)?.trim() ||
      process.env.ELKS_WEBRTC_PASSWORD?.trim();
    const uri =
      (profile?.elks_webrtc_uri as string | null)?.trim() ||
      process.env.ELKS_WEBRTC_URI?.trim();
    const wsRaw = process.env.ELKS_WEBRTC_WS_URL?.trim();

    if (!username || !password || !uri || !wsRaw) {
      return {
        ok: false as const,
        error:
          "WebRTC credentials not configured — add your 46elks WebRTC username, password and URI in Settings → Profile.",
      };
    }

    const urlMatch = wsRaw.match(/(?:wss?|https?):\/\/[^\s"'<>]+/i);
    let ws = urlMatch?.[0] ?? wsRaw;
    if (ws.startsWith("https://")) ws = "wss://" + ws.slice("https://".length);
    else if (ws.startsWith("http://")) ws = "ws://" + ws.slice("http://".length);
    else if (!ws.startsWith("wss://") && !ws.startsWith("ws://"))
      ws = "wss://" + ws.replace(/^\/+/, "");

    console.log("[webrtc] returning ws url:", ws);

    return { ok: true as const, username, password, uri, wsUrl: ws };
  });
