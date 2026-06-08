import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/elks-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, string> = {};
        try {
          const form = await request.formData();
          form.forEach((v, k) => { payload[k] = String(v); });
        } catch {
          try {
            const j = await request.json();
            payload = j as Record<string, string>;
          } catch {}
        }

        const callId = payload.callid || payload.id;
        const state = payload.state; // ongoing, success, busy, failed, noanswer
        const duration = payload.duration ? parseInt(payload.duration, 10) : null;

        if (callId) {
          // Only update duration from the webhook — never overwrite a user-set
          // outcome (answered / no-answer). The user's manual click is the source
          // of truth; 46elks "success" just means the call connected technically.
          const { data: existing } = await supabaseAdmin
            .from("call_logs")
            .select("status")
            .eq("elks_call_id", callId)
            .maybeSingle();

          const userSetOutcome = existing?.status === "answered" || existing?.status === "no-answer";
          const update: { status?: string | null; duration?: number } = {};
          if (!userSetOutcome) update.status = state ?? null;
          if (duration !== null && !Number.isNaN(duration)) update.duration = duration;

          if (Object.keys(update).length > 0) {
            await supabaseAdmin
              .from("call_logs")
              .update(update)
              .eq("elks_call_id", callId);
          }
        }

        return new Response("ok");
      },
    },
  },
});
