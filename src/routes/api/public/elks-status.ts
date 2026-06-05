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
          // Derive a normalized outcome so admin charts / history don't need
          // a manual "answered/not answered" click. If the call had any talk
          // time the customer picked up; otherwise treat known failure
          // states as not-answered.
          let normalized: string | null = state ?? null;
          if (duration !== null && !Number.isNaN(duration) && duration > 0) {
            normalized = "answered";
          } else if (state && ["noanswer", "busy", "failed"].includes(state)) {
            normalized = "no-answer";
          }
          const update: { status: string | null; duration?: number } = { status: normalized };
          if (duration !== null && !Number.isNaN(duration)) update.duration = duration;
          await supabaseAdmin
            .from("call_logs")
            .update(update)
            .eq("elks_call_id", callId);
        }

        return new Response("ok");
      },
    },
  },
});
