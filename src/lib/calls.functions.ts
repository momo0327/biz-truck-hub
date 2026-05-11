import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  companyId: z.string().uuid(),
  toNumber: z.string().min(4),
});

function normalize(num: string) {
  return num.replace(/[^\d+]/g, "");
}

function normalizeE164(num: string) {
  const cleaned = normalize(num.trim());
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\D/g, "")}` : cleaned;
}

export const placeCallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const username = process.env.ELKS_API_USERNAME;
    const password = process.env.ELKS_API_PASSWORD;
    const fromNumber = process.env.ELKS_FROM_NUMBER ? normalizeE164(process.env.ELKS_FROM_NUMBER) : "";
    if (!username || !password || !fromNumber) {
      return { ok: false, error: "46elks credentials not configured" };
    }
    if (!/^\+\d{8,15}$/.test(fromNumber)) {
      return { ok: false, error: "46elks from number must be the full number in +4610XXXXXXX format" };
    }

    // Get user's phone number from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_number")
      .eq("user_id", userId)
      .single();
    const myNumber = profile?.phone_number ? normalize(profile.phone_number) : null;
    if (!myNumber) {
      return { ok: false, error: "Add your phone number in Settings first" };
    }

    const target = normalize(data.toNumber);
    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") || "https";
    const base = `${proto}://${host}`;
    const voiceStartUrl = `${base}/api/public/elks-voice-start?to=${encodeURIComponent(target)}`;
    const statusUrl = `${base}/api/public/elks-status`;

    const body = new URLSearchParams({
      from: fromNumber,
      to: myNumber,
      voice_start: voiceStartUrl,
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
    let elksData: any = {};
    try { elksData = JSON.parse(text); } catch {}
    const callId: string | undefined = elksData?.id;

    // Insert call log
    await supabase.from("call_logs").insert({
      company_id: data.companyId,
      user_id: userId,
      note: `Outbound call to ${target}`,
      elks_call_id: callId ?? null,
      status: elksData?.state ?? "initiating",
      to_number: target,
      direction: "outbound",
    });

    // Update last_contact
    await supabase
      .from("companies")
      .update({ last_contact: new Date().toISOString() })
      .eq("id", data.companyId);

    return { ok: true, callId };
  });
