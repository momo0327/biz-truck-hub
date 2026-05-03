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
};

async function firecrawlSearch(query: string) {
  const key = FIRECRAWL_KEY();
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: 5,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl search failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function pickResults(json: any): Array<{ url: string; title?: string; markdown?: string; description?: string }> {
  const data = json?.data;
  if (Array.isArray(data)) return data;
  if (data?.web && Array.isArray(data.web)) return data.web;
  return [];
}

export async function researchCompany(name: string, orgNumber?: string | null): Promise<ResearchResult> {
  const lovKey = LOVABLE_KEY();
  if (!lovKey) throw new Error("LOVABLE_API_KEY not configured");

  const query = orgNumber
    ? `${name} ${orgNumber} lastbilar fordon kontakt telefon`
    : `${name} lastbilar fordon kontakt telefon Sverige`;

  const search = await firecrawlSearch(query);
  const results = pickResults(search).slice(0, 5);
  const sources = results.map((r) => r.url).filter(Boolean);

  const context = results
    .map((r, i) => {
      const md = (r.markdown ?? r.description ?? "").slice(0, 2500);
      return `--- Source ${i + 1}: ${r.url}\n${md}`;
    })
    .join("\n\n")
    .slice(0, 14000);

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You extract Swedish company information for a truck-buying CRM. Output ONLY via the provided tool. Phone numbers must be in Swedish format (+46... or 0...). Be concise.",
        },
        {
          role: "user",
          content: `Company: ${name}\nOrg number: ${orgNumber ?? "unknown"}\n\nWeb search results:\n${context}\n\nExtract everything you can about this company, focusing on their truck/vehicle fleet.`,
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
                website: { type: "string" },
                phones: { type: "array", items: { type: "string" } },
                trucks_info: { type: "string", description: "What trucks/vehicles they own or operate (1-3 sentences)." },
                fleet_size: { type: "string" },
                contact_person: { type: "string" },
                address: { type: "string" },
              },
              required: ["phones"],
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
  if (call?.function?.arguments) {
    try { parsed = JSON.parse(call.function.arguments); } catch { /* ignore */ }
  }

  const phones = Array.from(new Set((parsed.phones ?? []).map((p) => p.trim()).filter(Boolean)));

  return {
    website: parsed.website,
    phones,
    trucks_info: parsed.trucks_info,
    fleet_size: parsed.fleet_size,
    contact_person: parsed.contact_person,
    address: parsed.address,
    sources,
  };
}
