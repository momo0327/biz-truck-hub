// Server-only helpers: research a Swedish company via Firecrawl.
const FIRECRAWL_KEY = () => process.env.FIRECRAWL_API_KEY;

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

const NOISE_WORDS = ["behandlingen", "personuppgifter", "dataskydd", "integritetspolicy", "cookies", "samtycke", "tillgänglig", "närvarande"];

function isRealName(s: string): boolean {
  const lower = s.toLowerCase();
  if (NOISE_WORDS.some((w) => lower.includes(w))) return false;
  if (s.split(/[\s,]+/).filter(Boolean).length < 2) return false;
  if (s.length > 60) return false;
  return true;
}

// Convert "Lastname, Firstname Middle" → "Firstname Middle Lastname"
function normalizeSwedishName(s: string): string {
  const m = s.match(/^([A-ZÅÄÖ][a-zåäö\-]+),\s*([A-ZÅÄÖ][a-zåäö\- A-ZÅÄÖ]+)$/);
  if (m) return `${m[2].trim()} ${m[1].trim()}`;
  return s;
}

// Regex for "Lastname, Firstname" with optional middle names
const LASTNAME_FIRSTNAME_RE = /([A-ZÅÄÖ][a-zåäö\-]+),\s*([A-ZÅÄÖ][a-zåäö\-]+(?:\s+[A-ZÅÄÖ][a-zåäö\-]+)*)/;

function extractContactPerson(md: string): string | undefined {
  const patterns = [
    /verkst[äa]llande direkt[öo]r[:\s]+([A-ZÅÄÖ][a-zåäö]+(?: [A-ZÅÄÖ][a-zåäö]+)+)/i,
    /styrelseordf[öo]rande[:\s]+([A-ZÅÄÖ][a-zåäö]+(?: [A-ZÅÄÖ][a-zåäö]+)+)/i,
    /\bvd[:\s]+([A-ZÅÄÖ][a-zåäö]+(?: [A-ZÅÄÖ][a-zåäö]+)+)/i,
    /kontaktperson[:\s]+([A-ZÅÄÖ][a-zåäö]+(?: [A-ZÅÄÖ][a-zåäö]+)+)/i,
    /ansvarig[:\s]+([A-ZÅÄÖ][a-zåäö]+(?: [A-ZÅÄÖ][a-zåäö]+)+)/i,
  ];
  for (const re of patterns) {
    const m = md.match(re);
    if (m?.[1] && isRealName(m[1])) return normalizeSwedishName(m[1].trim());
  }
  // Match "Lastname, Firstname Middle" anywhere in the text (verklig-huvudman)
  const vhMatch = md.match(LASTNAME_FIRSTNAME_RE);
  if (vhMatch) {
    const full = `${vhMatch[1]}, ${vhMatch[2]}`;
    if (isRealName(full)) return normalizeSwedishName(full);
  }
  return undefined;
}

function extractAddress(md: string): string | undefined {
  // Strip "Adress" label that merinfo puts directly before the street name
  const cleaned = md.replace(/\bAdress\s*/g, "");
  // Match "Street Name 12, 123 45 City" or "Street Name 12\n123 45 City"
  const m = cleaned.match(/([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ ]+\s+\d+[A-Za-z]?)[,\n\r]+\s*(\d{3}\s*\d{2}\s+[A-ZÅÄÖ][a-zåäö]+)/);
  if (m) return `${m[1].trim()}, ${m[2].trim()}`;
  // Fallback: just postal code + city
  const m2 = cleaned.match(/(\d{3}\s*\d{2})\s+([A-ZÅÄÖ][a-zåäö]{2,})/);
  if (m2) return `${m2[1]} ${m2[2]}`;
  return undefined;
}

function extractWebsite(results: Array<{ url: string }>): string | undefined {
  const excluded = ["allabolag.se", "hitta.se", "eniro.se", "merinfo.se", "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "google.com", "bing.com"];
  const own = results.find((r) => {
    const u = r.url.toLowerCase();
    return excluded.every((e) => !u.includes(e));
  });
  if (!own) return undefined;
  try {
    const u = new URL(own.url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return own.url;
  }
}

export async function researchCompany(name: string, orgNumber?: string | null): Promise<ResearchResult> {
  if (!FIRECRAWL_KEY()) throw new Error("FIRECRAWL_API_KEY not configured");

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

  // Fallback chain: if firecrawl search didn't surface merinfo, try
  // increasingly direct lookups. Critical for fleet accuracy — without the
  // /fordon page we only get whatever the AI can guess from the summary.
  async function findMerinfoFallback(): Promise<{ url: string } | null> {
    if (!orgNumber) return null;
    const cleanedOrg = orgNumber.replace(/\D/g, "");

    // (a) Targeted Firecrawl search restricted to merinfo
    try {
      const r = await firecrawlSearch(`site:merinfo.se/foretag ${cleanedOrg}`, 5);
      const hits = pickResults(r);
      const hit = hits.find((h) => /merinfo\.se\/foretag\//i.test(h.url));
      if (hit) return { url: hit.url };
    } catch (e) { console.warn("merinfo targeted search failed", e); }

    // (b) Generic search with the org number — Google often surfaces merinfo
    try {
      const r = await firecrawlSearch(`merinfo ${cleanedOrg} fordon`, 5);
      const hits = pickResults(r);
      const hit = hits.find((h) => /merinfo\.se\/foretag\//i.test(h.url));
      if (hit) return { url: hit.url };
    } catch (e) { console.warn("merinfo generic search failed", e); }

    // (c) Scrape merinfo's own search page (JS-rendered, so wait for hydration)
    const searchUrl = `https://www.merinfo.se/sok?q=${cleanedOrg}`;
    const searchScrape = await firecrawlScrape(searchUrl, { waitFor: 3000 }).catch(() => null);
    const searchMd = searchScrape?.data?.markdown || searchScrape?.markdown || "";
    const m = searchMd.match(/https:\/\/www\.merinfo\.se\/foretag\/[^\s)"']+/i);
    if (m) return { url: m[0] };

    return null;
  }

  if (!merinfo) {
    const fallback = await findMerinfoFallback();
    if (fallback) {
      const url = fallback.url.replace(/\/(fordon|telefonnummer|adresser|styrelse-koncern|verklig-huvudman|nyckeltal|kontakt|ekonomi|styrelse)(\/.*)?$/i, "");
      merinfo = { url };
      results.push({ url, title: "Merinfo (direct lookup)" });
    } else {
      console.warn("[research] merinfo /foretag page not found for", name, orgNumber);
    }
  }

  if (merinfo) {
    // Scrape main merinfo page (phones, address, contact)
    const main = await firecrawlScrape(merinfo.url).catch(() => null);
    const mainMd = main?.data?.markdown || main?.markdown;
    if (mainMd) merinfo.markdown = mainMd;

    // Build base URL (strip any trailing subpage path)
    const base = merinfo.url.replace(/\/(fordon|telefonnummer|adresser|styrelse-koncern|verklig-huvudman|nyckeltal|kontakt|ekonomi|styrelse)(\/.*)?$/i, "").replace(/\/$/, "");

    // Scrape /verklig-huvudman for the beneficial owner (real person behind the company)
    const vhScrape = await firecrawlScrape(`${base}/verklig-huvudman`).catch(() => null);
    const vhMd = vhScrape?.data?.markdown || vhScrape?.markdown;
    if (vhMd) {
      results.push({ url: `${base}/verklig-huvudman`, markdown: vhMd });
      // Merge into merinfo markdown so extractContactPerson can use it
      merinfo.markdown = (merinfo.markdown ?? "") + "\n\n" + vhMd;
    }

    // Paginate: up to 20 pages (500 vehicles). Merinfo shows 25/page.
    // Trust "Totalt antal fordon" from page 1 since pagination links are
    // often missing from firecrawl markdown output.
    let expectedTotal = 0;
    for (let page = 1; page <= 20; page++) {
      const fordonUrl = page === 1 ? `${base}/fordon` : `${base}/fordon?page=${page}`;
      const fordon = await firecrawlScrape(fordonUrl, { waitFor: 2500 }).catch(() => null);
      const fordonMd = fordon?.data?.markdown || fordon?.markdown;
      if (!fordonMd) break;

      if (!totalFleetFromMerinfo) {
        const totalMatch = fordonMd.match(/Totalt antal fordon:\s*(\d+)/i);
        if (totalMatch) {
          totalFleetFromMerinfo = totalMatch[1];
          expectedTotal = parseInt(totalMatch[1], 10) || 0;
        }
      }

      const pageVehicles = parseMerinfoVehicles(fordonMd);
      if (pageVehicles.length === 0) break;
      parsedVehicles.push(...pageVehicles);

      results.push({ url: fordonUrl, title: `Merinfo - Fordon page ${page}`, markdown: fordonMd });

      // Stop when we've collected everything, or the last page is partial.
      if (expectedTotal > 0 && parsedVehicles.length >= expectedTotal) break;
      if (pageVehicles.length < 25) break;
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
    .map((r) => (r.markdown ?? r.description ?? ""))
    .join("\n\n")
    .slice(0, 24000);

  // Extract phones via regex from all scraped content
  const phones = Array.from(new Set(extractSwedishPhones(context))).slice(0, 10);

  // Extract contact person and address from merinfo main page
  const merinfoMd = merinfo?.markdown ?? "";
  const contactPerson = extractContactPerson(merinfoMd) ?? extractContactPerson(context);
  const address = extractAddress(merinfoMd) ?? extractAddress(context);
  const website = extractWebsite(results);

  // Build a simple fleet summary from parsed vehicles
  const brandCounts: Record<string, number> = {};
  for (const v of parsedVehicles) {
    if (v.brand) brandCounts[v.brand] = (brandCounts[v.brand] ?? 0) + 1;
  }
  const brandSummary = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([brand, count]) => `${count} ${brand}`)
    .join(", ");
  const trucks_info = parsedVehicles.length > 0
    ? `Fleet of ${parsedVehicles.length} vehicles${brandSummary ? `: ${brandSummary}` : ""}.`
    : undefined;

  return {
    website,
    phones,
    trucks_info,
    fleet_size: totalFleetFromMerinfo ?? (parsedVehicles.length ? String(parsedVehicles.length) : undefined),
    contact_person: contactPerson,
    address,
    vehicles: parsedVehicles,
    sources,
    debug: { query: queries.join(" | "), contextChars: context.length },
  };
}
