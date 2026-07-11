import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTelnyxCredentialsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const username = process.env.TELNYX_SIP_USERNAME?.trim();
    const password = process.env.TELNYX_SIP_PASSWORD?.trim();
    const callerNumber = process.env.TELNYX_CALLER_NUMBER?.trim() ?? "";
    const domain = process.env.TELNYX_SIP_DOMAIN?.trim() ?? "sip.telnyx.com";
    const wsUrl = process.env.TELNYX_SIP_WS_URL?.trim() ?? "wss://rtc.telnyx.com:443";

    if (!username || !password) {
      return { ok: false as const, error: "Telnyx SIP credentials not configured" };
    }

    return { ok: true as const, username, password, callerNumber, domain, wsUrl };
  });
