import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { researchCompany } from "./research.server";

const inputSchema = z.object({ companyId: z.string().uuid() });

export const researchCompanyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: company, error } = await supabase
      .from("companies")
      .select("id,name,org_number")
      .eq("id", data.companyId)
      .single();
    if (error || !company) throw new Error("Company not found");

    try {
      const result = await researchCompany(company.name, company.org_number);
      const { error: upErr } = await supabase
        .from("companies")
        .update({
          website: result.website ?? null,
          phones: result.phones,
          trucks_info: result.trucks_info ?? null,
          fleet_size: result.fleet_size ?? null,
          contact_person: result.contact_person ?? null,
          address: result.address ?? null,
          vehicles: result.vehicles as any,
          research_raw: { sources: result.sources, debug: result.debug } as any,
          researched_at: new Date().toISOString(),
        })
        .eq("id", data.companyId);
      if (upErr) throw upErr;
      return { ok: true, result };
    } catch (e: any) {
      console.error("research failed", e);
      return { ok: false, error: e.message ?? "Research failed" };
    }
  });
