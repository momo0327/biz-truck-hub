// Server-only helpers: research a Swedish company via Firecrawl + Lovable AI.
const FIRECRAWL_KEY = () => process.env.FIRECRAWL_API_KEY;
const LOVABLE_KEY = () => process.env.LOVABLE_API_KEY;

export type ResearchResult = {
  website?: string;
  phones: string[];
  trucks_info?: string;
  fleet_size?: string;
  contact_person?: string;
  address?: string;
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

async function firecrawlScrape(url: string) {
  const key = FIRECRAWL_KEY();
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
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
  const merinfo = results.find((r) => /merinfo\.se\/foretag\//i.test(r.url));
  if (merinfo) {
    // Scrape main merinfo page (phones, address, contact)
    const main = await firecrawlScrape(merinfo.url).catch(() => null);
    const mainMd = main?.data?.markdown || main?.markdown;
    if (mainMd) merinfo.markdown = mainMd;

    // Build /fordon URL (strip any trailing path, ensure single trailing slash)
    const base = merinfo.url.replace(/\/(fordon|kontakt|ekonomi|styrelse)\/?$/i, "").replace(/\/$/, "");
    const fordonUrl = `${base}/fordon`;
    const fordon = await firecrawlScrape(fordonUrl).catch(() => null);
    const fordonMd = fordon?.data?.markdown || fordon?.markdown;
    if (fordonMd) {
      results.push({ url: fordonUrl, title: "Merinfo - Fordon (fleet)", markdown: fordonMd });
    }
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
            "You extract Swedish company information for a truck-buying CRM. Output ONLY by calling save_company_info. Phones MUST be in Swedish format (+46... or 0...). Include EVERY phone number you can find in the sources. If you find no fleet info but the company is in transport/åkeri/logistik, still note that in trucks_info. Never return empty fields when info is in the sources.",
        },
        {
          role: "user",
          content: `Company: ${name}\nOrg number: ${orgNumber ?? "unknown"}\n\nWeb sources:\n${context}\n\nExtract: website (their own domain), all phone numbers, contact person, address, trucks/vehicles they own, fleet size.`,
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
                trucks_info: { type: "string", description: "What trucks/vehicles they own or operate. 1-3 sentences." },
                fleet_size: { type: "string", description: "Number of vehicles, e.g. '12 trucks' or 'unknown'." },
                contact_person: { type: "string" },
                address: { type: "string" },
              },
              required: ["phones", "trucks_info"],
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
  let parsed: Partial<ResearchResult> = { phones: [] };
  let toolCallRaw: string | undefined;
  if (call?.function?.arguments) {
    toolCallRaw = call.function.arguments;
    try { parsed = JSON.parse(call.function.arguments); } catch { /* ignore */ }
  }

  // Merge AI phones with regex phones (AI can miss some, regex can find junk; both ok)
  const aiPhones = (parsed.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const phones = Array.from(new Set([...aiPhones, ...regexPhones])).slice(0, 10);

  return {
    website: parsed.website || ownSite?.url,
    phones,
    trucks_info: parsed.trucks_info,
    fleet_size: parsed.fleet_size,
    contact_person: parsed.contact_person,
    address: parsed.address,
    sources,
    debug: { query: queries.join(" | "), contextChars: context.length, toolCallRaw },
  };
}
