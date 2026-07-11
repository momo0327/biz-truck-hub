import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let b64 = "";
  const chunk = 3;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.slice(i, i + chunk);
    b64 += btoa(String.fromCharCode(...slice));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function hmacSha256(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

export async function createSinchJwt(applicationKey: string, applicationSecret: string, userId: string): Promise<string> {
  const now = new Date();
  const exp = new Date(now.getTime() + 10 * 60 * 1000); // 10 min TTL
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const nonce = crypto.randomUUID();

  const header = { alg: "HS256", kid: `hkdfv1-${dateStr}` };
  const payload = {
    iss: `//rtc.sinch.com/applications/${applicationKey}`,
    sub: `//rtc.sinch.com/applications/${applicationKey}/users/${userId}`,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(exp.getTime() / 1000),
    nonce,
  };

  // Decode base64 secret, derive date-keyed signing key via HMAC-SHA256
  const secretBytes = Uint8Array.from(atob(applicationSecret), (c) => c.charCodeAt(0));
  const signingKey = await hmacSha256(secretBytes, dateStr);

  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const sigBytes = await hmacSha256(signingKey, `${h}.${p}`);
  const sig = base64url(sigBytes);

  return `${h}.${p}.${sig}`;
}

export const getSinchJwtFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const applicationKey = process.env.SINCH_APPLICATION_KEY?.trim();
    const applicationSecret = process.env.SINCH_APPLICATION_SECRET?.trim();

    if (!applicationKey || !applicationSecret) {
      return { ok: false as const, error: "Sinch credentials not configured" };
    }

    const callerNumber = process.env.SINCH_CALLER_NUMBER?.trim() ?? null;
    const jwt = await createSinchJwt(applicationKey, applicationSecret, userId);
    return { ok: true as const, jwt, applicationKey, userId, callerNumber };
  });
