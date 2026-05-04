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
      .select("id,name,org_number,vehicles")
      .eq("id", data.companyId)
      .single();
    if (error || !company) throw new Error("Company not found");

    try {
      const result = await researchCompany(company.name, company.org_number);

      // Merge: keep all Excel-imported vehicles, mark them. Add AI vehicles that
      // don't duplicate by registration. Mark Excel vehicles whose reg also
      // appears in AI results as `matched` (confirmed by AI research).
      const normReg = (s: any) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
      const existing: any[] = Array.isArray(company.vehicles) ? (company.vehicles as any[]) : [];
      const aiVehicles = result.vehicles ?? [];
      const aiRegs = new Set(aiVehicles.map((v: any) => normReg(v.registration)).filter((r) => r.length >= 3));

      const excelMerged = existing.map((v: any) => {
        const reg = normReg(v.registration);
        const matched = reg.length >= 3 && aiRegs.has(reg);
        return { ...v, source: v.source ?? "excel", matched };
      });
      const existingRegs = new Set(excelMerged.map((v: any) => normReg(v.registration)).filter((r) => r.length >= 3));
      const aiOnly = aiVehicles
        .filter((v: any) => {
          const reg = normReg(v.registration);
          return !reg || !existingRegs.has(reg);
        })
        .map((v: any) => ({ ...v, source: "ai" }));

      const mergedVehicles = [...excelMerged, ...aiOnly];

      const { error: upErr } = await supabase
        .from("companies")
        .update({
          website: result.website ?? null,
          phones: result.phones,
          trucks_info: result.trucks_info ?? null,
          fleet_size: result.fleet_size ?? String(mergedVehicles.length),
          contact_person: result.contact_person ?? null,
          address: result.address ?? null,
          vehicles: mergedVehicles as any,
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
