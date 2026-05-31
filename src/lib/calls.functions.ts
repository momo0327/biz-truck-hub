import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  companyId: z.string().uuid().optional(),
  toNumber: z.string().min(4),
});

function normalize(num: string) {
  return num.replace(/[^\d+]/g, "");
}

function normalizeE164(num: string) {
  const cleaned = normalize(num.trim());
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";
  if (cleaned.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+46${digits.slice(1)}`;
  return `+${digits}`;
}

function numberFromWebrtcUri(uri: string) {
  return normalizeE164(uri.split("@")[0]);
}

export const placeCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const username = process.env.ELKS_API_USERNAME;
    const password = process.env.ELKS_API_PASSWORD;

    // Prefer the user's own caller ID from their profile; fall back to the global env number.
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_number")
      .eq("user_id", userId)
      .maybeSingle();

    const profileNumber = profile?.phone_number ? normalizeE164(profile.phone_number) : "";
    const envFromNumber = process.env.ELKS_FROM_NUMBER
      ? normalizeE164(process.env.ELKS_FROM_NUMBER)
      : "";
    const fromNumber = profileNumber || envFromNumber;

    const webrtcNumber = process.env.ELKS_WEBRTC_URI
      ? numberFromWebrtcUri(process.env.ELKS_WEBRTC_URI)
      : "";
    if (!username || !password || !fromNumber || !webrtcNumber) {
      return { ok: false, error: "46elks credentials not configured" };
    }
    if (!/^\+\d{8,15}$/.test(fromNumber)) {
      return {
        ok: false,
        error: "46elks from number must be the full number in +4610XXXXXXX format",
      };
    }
    if (!/^\+\d{8,15}$/.test(webrtcNumber)) {
      return { ok: false, error: "46elks WebRTC URI must contain the full client number" };
    }

    const target = normalizeE164(data.toNumber);
    if (!/^\+\d{8,15}$/.test(target)) {
      return { ok: false, error: "Target number must be a valid phone number" };
    }
    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") || "https";
    const base = `${proto}://${host}`;
    const statusUrl = `${base}/api/public/elks-status`;
    const connectUrl = `${base}/api/public/elks-connect`;

    // 46elks rejects whenhangup if it isn't a valid public URL. In local/dev
    // previews host can be localhost or otherwise unreachable — in that case
    // omit the webhook (the call still goes through, we just don't get the
    // status callback) instead of failing the whole call with "Invalid value
    // for whenhangup, not a URL".
    function publicHttps(s: string): string | null {
      try {
        const u = new URL(s);
        const isHttps = u.protocol === "https:";
        const hostname = u.hostname;
        const isPublic =
          hostname.includes(".") &&
          !hostname.endsWith(".local") &&
          hostname !== "localhost" &&
          hostname !== "127.0.0.1" &&
          hostname !== "0.0.0.0";
        if (isHttps && isPublic) return u.toString();
      } catch {
        return null;
      }
      return null;
    }
    const validStatusUrl = publicHttps(statusUrl);
    const validConnectUrl = publicHttps(connectUrl);

    // Call the customer FIRST. 46elks only runs `voice_start` after the
    // customer answers, so the browser/WebRTC leg is not connected until the
    // customer has actually picked up.
    const connectAction: Record<string, string> = { connect: webrtcNumber };
    if (validConnectUrl) connectAction.next = validConnectUrl;
    const bodyParams: Record<string, string> = {
      from: fromNumber,
      to: target,
      voice_start: JSON.stringify(connectAction),
    };
    if (validStatusUrl) bodyParams.whenhangup = validStatusUrl;
    const body = new URLSearchParams(bodyParams);

    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const res = await fetch("https://api.46elks.com/a1/calls", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("46elks call failed", res.status, text);
      return { ok: false, error: `46elks: ${res.status} ${text.slice(0, 200)}` };
    }
    let elksData: { id?: string; state?: string } = {};
    try {
      const parsed = JSON.parse(text) as { id?: unknown; state?: unknown };
      elksData = {
        id: typeof parsed.id === "string" ? parsed.id : undefined,
        state: typeof parsed.state === "string" ? parsed.state : undefined,
      };
    } catch (err) {
      console.warn("46elks call response was not JSON", err);
    }
    const callId = elksData.id;

    if (data.companyId) {
      await supabase.from("call_logs").insert({
        company_id: data.companyId,
        user_id: userId,
        note: `Outbound call to ${target}`,
        elks_call_id: callId ?? null,
        // Always start as "initiating" — 46elks reports "ongoing" the moment
        // the API call is created, before the customer has actually answered.
        // The /api/public/elks-status webhook updates this to success/busy/etc.
        status: "initiating",
        to_number: target,
        direction: "outbound",
      });

      await supabase
        .from("companies")
        .update({ last_contact: new Date().toISOString() })
        .eq("id", data.companyId);
    }

    return { ok: true, callId };
  });

// Tell 46elks to hang up an in-progress call. Used when the user hangs up the
// browser leg before (or after) the customer answers — without this the
// customer's phone keeps ringing because 46elks already dispatched the call.
export const hangupCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ callId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const username = process.env.ELKS_API_USERNAME;
    const password = process.env.ELKS_API_PASSWORD;
    if (!username || !password) return { ok: false, error: "46elks not configured" };

    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const res = await fetch(`https://api.46elks.com/a1/calls/${encodeURIComponent(data.callId)}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ state: "hangup" }).toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("46elks hangup failed", res.status, text);
      return { ok: false, error: `46elks: ${res.status} ${text.slice(0, 200)}` };
    }
    return { ok: true };
  });

// Poll 46elks to see whether the target/customer leg of an outbound bridged
// call has actually been answered. The parent WebRTC call is not enough: it
// starts when 46elks reaches the browser, before the customer picks up.
export const checkCustomerAnsweredFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ callId: z.string().min(1), targetNumber: z.string().min(4) }).parse(d),
  )
  .handler(async ({ data }) => {
    const username = process.env.ELKS_API_USERNAME;
    const password = process.env.ELKS_API_PASSWORD;
    if (!username || !password) return { ok: false as const, answered: false };
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const target = normalizeE164(data.targetNumber);
    const matchesTarget = (value: unknown) =>
      typeof value === "string" && normalizeE164(value) === target;
    const hasAnswerSignal = (entry: { start?: unknown; duration?: unknown; state?: unknown }) =>
      (typeof entry.start === "string" && entry.start.length > 0) ||
      (typeof entry.duration === "number" && entry.duration > 0) ||
      (typeof entry.duration === "string" && Number(entry.duration) > 0) ||
      entry.state === "success";

    const url = `https://api.46elks.com/a1/calls/${encodeURIComponent(data.callId)}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return { ok: false as const, answered: false };
    const json = (await res.json().catch(() => null)) as
      | {
          actions?: Array<{ connect?: unknown; result?: unknown }>;
          legs?: Array<{ from?: unknown; to?: unknown; state?: unknown; start?: unknown; duration?: unknown }>;
        }
      | null;
    const legs = Array.isArray(json?.legs) ? json.legs : [];
    const actions = Array.isArray(json?.actions) ? json.actions : [];
    // Only trust the customer leg/action. The parent WebRTC leg becomes
    // ongoing as soon as 46elks reaches the browser, which is too early.
    const answered =
      legs.some((leg) => (matchesTarget(leg.to) || matchesTarget(leg.from)) && hasAnswerSignal(leg)) ||
      actions.some((action) => matchesTarget(action.connect) && action.result === "success");
    return { ok: true as const, answered };
  });
