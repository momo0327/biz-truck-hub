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

    const webrtcUri = process.env.ELKS_WEBRTC_URI?.trim() ?? "";
    if (!username || !password || !fromNumber || !webrtcUri) {
      return { ok: false, error: "46elks credentials not configured" };
    }
    if (!/^\+\d{8,15}$/.test(fromNumber)) {
      return {
        ok: false,
        error: "46elks from number must be the full number in +4610XXXXXXX format",
      };
    }
    // 46elks expects the WebRTC client as a sip: URI, not a phone number.
    const webrtcSipTo = webrtcUri.startsWith("sip:") ? webrtcUri : `sip:${webrtcUri}`;

    const target = normalizeE164(data.toNumber);
    if (!/^\+\d{8,15}$/.test(target)) {
      return { ok: false, error: "Target number must be a valid phone number" };
    }
    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") || "https";
    const base = `${proto}://${host}`;
    const statusUrl = `${base}/api/public/elks-status`;

    // Ring the browser (WebRTC client) FIRST. When we auto-answer in the softphone,
    // 46elks then dials the real target and bridges instantly on answer — so the
    // person we called doesn't hear ringback while waiting for us to pick up.
    const body = new URLSearchParams({
      from: fromNumber,
      to: webrtcNumber,
      voice_start: JSON.stringify({ connect: target, callerid: fromNumber }),
      whenhangup: statusUrl,
    });

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
        status: elksData?.state ?? "initiating",
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
