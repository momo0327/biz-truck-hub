import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setCallOutcomeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    logId: z.string().uuid(),
    outcome: z.enum(["answered", "no-answer"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("call_logs")
      .update({ outcome: data.outcome })
      .eq("id", data.logId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
