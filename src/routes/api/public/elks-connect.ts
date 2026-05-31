import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// 46elks calls this URL (passed as `next` on the connect action) once the
// outbound leg result is known. result = "success" means the customer
// actually answered the phone. We flip the call_logs row to "answered" so
// the softphone UI can stop showing "Dialing…" and switch to "Connected".
export const Route = createFileRoute("/api/public/elks-connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, string> = {};
        try {
          const form = await request.formData();
          form.forEach((v, k) => {
            payload[k] = String(v);
          });
        } catch {
          try {
            const j = await request.json();
            payload = j as Record<string, string>;
          } catch {}
        }

        const callId = payload.callid || payload.id;
        const result = payload.result; // success | failed | busy

        if (callId && result) {
          const status = result === "success" ? "answered" : result;
          await supabaseAdmin
            .from("call_logs")
            .update({ status })
            .eq("elks_call_id", callId);
        }

        // Returning empty JSON ends the call action chain cleanly.
        return Response.json({});
      },
    },
  },
});
