// Server-only helpers: research a Swedish company via Firecrawl + Lovable AI.
const FIRECRAWL_KEY = () => process.env.FIRECRAWL_API_KEY;
const LOVABLE_KEY = () => process.env.LOVABLE_API_KEY;

export type Vehicle = {
  registration?: string;
  brand?: string;
  model?: string;
  type?: string;
  year?: string;
  fuel?: string;
  weight?: string;
};

export type ResearchResult = {
  website?: string;
  phones: string[];
  trucks_info?: string;
  fleet_size?: string;
  contact_person?: string;
  address?: string;
  vehicles: Vehicle[];
  sources: string[];
  debug?: { query: string; contextChars: number; toolCallRaw?: string };
};

async function firecrawlSearch(query: string, limit = 6) {
  const key = FIRECRAWL_KEY();
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      lang: "sv",
      country: "se",
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl search failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function firecrawlScrape(url: string, opts?: { waitFor?: number }) {
  const key = FIRECRAWL_KEY();
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  const body: any = { url, formats: ["markdown"], onlyMainContent: true };
  if (opts?.waitFor) body.waitFor = opts.waitFor;
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

function pickResults(json: any): Array<{ url: string; title?: string; markdown?: string; description?: string }> {
  const data = json?.data;
  if (Array.isArray(data)) return data;
  if (data?.web && Array.isArray(data.web)) return data.web;
  return [];
}

// Extract Swedish phone numbers from raw text as a safety net.
function extractSwedishPhones(text: string): string[] {
  const re = /(?:\+46|0046|0)\s*[\d\s\-().]{6,18}\d/g;
  const found = new Set<string>();
  for (const m of text.match(re) ?? []) {
    const cleaned = m.replace(/[\s\-().]/g, "");
    if (cleaned.length >= 8 && cleaned.length <= 14) found.add(cleaned);
  }
  return Array.from(found);
}

// Parse the merinfo.se /fordon markdown table. Each vehicle is rendered as
// 5 consecutive lines: brand/model, regnr, color, type, year, followed by
// a "Se fullständig fordonsinfo" link.
function parseMerinfoVehicles(md: string): Vehicle[] {
  const vehicles: Vehicle[] = [];
  // Split into blocks separated by the "Se fullständig fordonsinfo" link.
  const blocks = md.split(/\[Se fullständig fordonsinfo\][^\n]*/i);
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim().replace(/,$/, "").trim())
      .filter((l) => l.length > 0 && !/^#|^!\[|^\[|^-\s|^\*\s/.test(l));
    // Find a Swedish reg-plate line (3 letters + 2-3 alphanumerics, e.g. ABC12X or ABC123)
    const regIdx = lines.findIndex((l) => /^[A-ZÅÄÖ]{3}\d{2}[A-Z0-9]$|^[A-ZÅÄÖ]{3}\d{3}$/.test(l));
    if (regIdx < 1) continue;
    const brandModel = lines[regIdx - 1];
    const reg = lines[regIdx];
    const color = lines[regIdx + 1];
    const type = lines[regIdx + 2];
    const year = lines[regIdx + 3];
    if (!brandModel || !reg) continue;
    // Split brand/model: first token is brand, rest is model
    const parts = brandModel.split(/\s+/);
    const brand = parts[0];
    const model = parts.slice(1).join(" ") || undefined;
    vehicles.push({
      registration: reg,
      brand,
      model,
      type: type && /^[a-zåäö ]+$/i.test(type) ? type.toLowerCase() : undefined,
      year: year && /^(19|20)\d{2}$/.test(year) ? year : undefined,
    });
  }
  return vehicles;
}

export async function researchCompany(name: string, orgNumber?: string | null): Promise<ResearchResult> {
  const lovKey = LOVABLE_KEY();
  if (!lovKey) throw new Error("LOVABLE_API_KEY not configured");

  // 1) Broad search to find pages mentioning the company
  const queries = [
    orgNumber
      ? `"${name}" ${orgNumber} telefon kontakt`
      : `"${name}" telefon kontakt Sverige`,
    `"${name}" lastbil OR fordon OR åkeri`,
    orgNumber
      ? `${orgNumber} site:merinfo.se OR site:allabolag.se OR site:hitta.se`
      : `"${name}" site:merinfo.se OR site:allabolag.se OR site:hitta.se`,
  ];

  const allResults: Array<{ url: string; title?: string; markdown?: string; description?: string }> = [];
  for (const q of queries) {
    try {
      const r = await firecrawlSearch(q, 4);
      allResults.push(...pickResults(r));
    } catch (e) {
      console.warn("search failed for", q, e);
    }
  }

  // Dedupe by URL
  const seen = new Set<string>();
  const results = allResults.filter((r) => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // 2) Find merinfo.se page and ALWAYS scrape its /fordon (vehicles) subpage —
  //    that's where the actual fleet (truck regnums + models) lives.
  // The /fordon page is paginated (25 vehicles per page), so loop until empty.
  let parsedVehicles: Vehicle[] = [];
  let totalFleetFromMerinfo: string | undefined;
  let merinfo = results.find((r) => /merinfo\.se\/foretag\//i.test(r.url));

  // Fallback: if firecrawl search didn't surface merinfo, query merinfo's own
  // search directly using the org number. This is by far the most reliable
  // way to get the company's /fordon page and is critical for fleet accuracy.
  if (!merinfo && orgNumber) {
    const cleanedOrg = orgNumber.replace(/\D/g, "");
    const searchUrl = `https://www.merinfo.se/sok?q=${cleanedOrg}`;
    const searchScrape = await firecrawlScrape(searchUrl).catch(() => null);
    const searchMd = searchScrape?.data?.markdown || searchScrape?.markdown || "";
    const m = searchMd.match(/https:\/\/www\.merinfo\.se\/foretag\/[^\s)"']+/i);
    if (m) {
      const url = m[0].replace(/\/(fordon|telefonnummer|adresser|styrelse-koncern|verklig-huvudman|nyckeltal|kontakt|ekonomi|styrelse)(\/.*)?$/i, "");
      merinfo = { url };
      results.push({ url, title: "Merinfo (direct lookup)" });
    }
  }

  if (merinfo) {
    // Scrape main merinfo page (phones, address, contact)
    const main = await firecrawlScrape(merinfo.url).catch(() => null);
    const mainMd = main?.data?.markdown || main?.markdown;
    if (mainMd) merinfo.markdown = mainMd;

    // Build /fordon URL (strip any trailing path, ensure single trailing slash)
    const base = merinfo.url.replace(/\/(fordon|telefonnummer|adresser|styrelse-koncern|verklig-huvudman|nyckeltal|kontakt|ekonomi|styrelse)(\/.*)?$/i, "").replace(/\/$/, "");

    // Paginate: page 1, 2, 3... up to 10 pages safety cap (250 vehicles)
    for (let page = 1; page <= 10; page++) {
      const fordonUrl = page === 1 ? `${base}/fordon` : `${base}/fordon?page=${page}`;
      const fordon = await firecrawlScrape(fordonUrl).catch(() => null);
      const fordonMd = fordon?.data?.markdown || fordon?.markdown;
      if (!fordonMd) break;

      // Capture fleet total once
      if (!totalFleetFromMerinfo) {
        const totalMatch = fordonMd.match(/Totalt antal fordon:\s*(\d+)/i);
        if (totalMatch) totalFleetFromMerinfo = totalMatch[1];
      }

      const pageVehicles = parseMerinfoVehicles(fordonMd);
      if (pageVehicles.length === 0) break;
      parsedVehicles.push(...pageVehicles);

      results.push({ url: fordonUrl, title: `Merinfo - Fordon page ${page}`, markdown: fordonMd });

      // Stop if no "Nästa" (next) link
      if (!/[?&]page=\d+["')\]]/i.test(fordonMd) && page > 1) break;
      if (!/Nästa|page=\d+/i.test(fordonMd)) break;
    }

    // Dedupe vehicles by registration
    const seenReg = new Set<string>();
    parsedVehicles = parsedVehicles.filter((v) => {
      const r = (v.registration ?? "").toUpperCase();
      if (!r || seenReg.has(r)) return false;
      seenReg.add(r);
      return true;
    });
  }

  // 3) Try to detect the company's own website and scrape it for phones/trucks
  const ownSite = results.find((r) => {
    const u = r.url.toLowerCase();
    return !u.includes("allabolag.se") && !u.includes("hitta.se") && !u.includes("eniro.se")
      && !u.includes("merinfo.se") && !u.includes("linkedin.com") && !u.includes("facebook.com");
  });
  if (ownSite) {
    const scraped = await firecrawlScrape(ownSite.url).catch(() => null);
    const md = scraped?.data?.markdown || scraped?.markdown;
    if (md) ownSite.markdown = md;
    try {
      const u = new URL(ownSite.url);
      const contactUrl = `${u.origin}/kontakt`;
      const c = await firecrawlScrape(contactUrl).catch(() => null);
      const cmd = c?.data?.markdown || c?.markdown;
      if (cmd) results.push({ url: contactUrl, markdown: cmd });
    } catch { /* ignore */ }
  }

  const sources = results.map((r) => r.url).filter(Boolean);

  const context = results
    .map((r, i) => {
      const md = (r.markdown ?? r.description ?? "").slice(0, 4000);
      return `--- Source ${i + 1}: ${r.url}\n${md}`;
    })
    .join("\n\n")
    .slice(0, 24000);

  // Regex fallback for phones
  const regexPhones = extractSwedishPhones(context);

  // 3) Ask AI to extract structured info
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "You extract Swedish company info for a truck-buying CRM. Output ONLY via save_company_info. Phones MUST be Swedish format (+46... or 0...). The merinfo.se /fordon page lists every vehicle the company owns with registration plates, brand, model, type and year — you MUST list EVERY single vehicle as a separate object in the `vehicles` array (one per row). Also write a short SUMMARY into trucks_info (brands and types) and the total count into fleet_size. List EVERY phone number found across sources.",
        },
        {
          role: "user",
          content: `Company: ${name}\nOrg number: ${orgNumber ?? "unknown"}\n\nWeb sources (note: any URL ending in /fordon is the official vehicle registry list — extract every row):\n${context}\n\nExtract: own website domain, all phone numbers, contact person, address, full vehicles list (one entry per registration plate), summary of trucks, total fleet size.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_company_info",
            description: "Return structured info extracted about the company.",
            parameters: {
              type: "object",
              properties: {
                website: { type: "string", description: "Their own website URL." },
                phones: { type: "array", items: { type: "string" }, description: "All phone numbers found, Swedish format." },
                trucks_info: { type: "string", description: "Short summary of fleet (1-3 sentences)." },
                fleet_size: { type: "string", description: "Total number of vehicles, e.g. '12'." },
                contact_person: { type: "string" },
                address: { type: "string" },
                vehicles: {
                  type: "array",
                  description: "Every vehicle from the merinfo /fordon page or other sources. One object per vehicle.",
                  items: {
                    type: "object",
                    properties: {
                      registration: { type: "string", description: "Registration plate, e.g. ABC123." },
                      brand: { type: "string", description: "Brand/make, e.g. Volvo, Scania." },
                      model: { type: "string" },
                      type: { type: "string", description: "Vehicle type in Swedish: lastbil, släp, personbil, buss, traktor etc." },
                      year: { type: "string", description: "Model year." },
                      fuel: { type: "string", description: "Fuel type, e.g. diesel, el, bensin." },
                      weight: { type: "string", description: "Total weight if listed." },
                    },
                    required: ["registration"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["phones", "trucks_info", "vehicles"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_company_info" } },
    }),
  });

  if (!aiRes.ok) {
    const text = await aiRes.text();
    if (aiRes.status === 429) throw new Error("AI rate limit exceeded. Try again shortly.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace > Usage.");
    throw new Error(`AI gateway error ${aiRes.status}: ${text}`);
  }

  const json = await aiRes.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  let parsed: Partial<ResearchResult> = { phones: [], vehicles: [] };
  let toolCallRaw: string | undefined;
  if (call?.function?.arguments) {
    toolCallRaw = call.function.arguments;
    try { parsed = JSON.parse(call.function.arguments); } catch { /* ignore */ }
  }

  // Merge AI phones with regex phones (AI can miss some, regex can find junk; both ok)
  const aiPhones = (parsed.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const phones = Array.from(new Set([...aiPhones, ...regexPhones])).slice(0, 10);

  const aiVehicles = (parsed.vehicles ?? []).filter((v) => v && (v.registration || v.brand || v.model));

  // Prefer deterministic merinfo-parsed vehicles; merge any extra AI-found
  // vehicles (by registration plate) that the parser missed.
  const seenRegs = new Set(parsedVehicles.map((v) => (v.registration ?? "").toUpperCase()));
  const merged = [...parsedVehicles];
  for (const v of aiVehicles) {
    const r = (v.registration ?? "").toUpperCase();
    if (r && !seenRegs.has(r)) {
      merged.push(v);
      seenRegs.add(r);
    }
  }
  const vehicles = merged;

  return {
    website: parsed.website || ownSite?.url,
    phones,
    trucks_info: parsed.trucks_info,
    fleet_size: parsed.fleet_size ?? totalFleetFromMerinfo ?? (vehicles.length ? String(vehicles.length) : undefined),
    contact_person: parsed.contact_person,
    address: parsed.address,
    vehicles,
    sources,
    debug: { query: queries.join(" | "), contextChars: context.length, toolCallRaw },
  };
}
