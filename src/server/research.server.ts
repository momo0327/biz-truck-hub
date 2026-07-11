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

function extractSwedishPhones(text: string): string[] {
  const re = /(?:\+46|0046|0)\s*[\d\s\-().]{6,18}\d/g;
  const found = new Set<string>();
  for (const m of text.match(re) ?? []) {
    const cleaned = m.replace(/[\s\-().]/g, "");
    if (cleaned.length >= 8 && cleaned.length <= 14) found.add(cleaned);
  }
  return Array.from(found);
}

function parseMerinfoVehicles(md: string): Vehicle[] {
  const vehicles: Vehicle[] = [];
  const blocks = md.split(/\[Se fullständig fordonsinfo\][^\n]*/i);
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim().replace(/,$/, "").trim())
      .filter((l) => l.length > 0 && !/^#|^!\[|^\[|^-\s|^\*\s/.test(l));
    const regIdx = lines.findIndex((l) => /^[A-ZÅÄÖ]{3}\d{2}[A-Z0-9]$|^[A-ZÅÄÖ]{3}\d{3}$/.test(l));
    if (regIdx < 1) continue;
    const brandModel = lines[regIdx - 1];
    const reg = lines[regIdx];
    const color = lines[regIdx + 1];
    const type = lines[regIdx + 2];
    const year = lines[regIdx + 3];
    if (!brandModel || !reg) continue;
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

function normalizeSwedishName(s: string): string {
  const m = s.match(/^([A-ZÅÄÖ][a-zåäö\-]+),\s*([A-ZÅÄÖ][a-zåäö\- A-ZÅÄÖ]+)$/);
  if (m) return `${m[2].trim()} ${m[1].trim()}`;
  return s;
}

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
  const vhMatch = md.match(LASTNAME_FIRSTNAME_RE);
  if (vhMatch) {
    const full = `${vhMatch[1]}, ${vhMatch[2]}`;
    if (isRealName(full)) return normalizeSwedishName(full);
  }
  return undefined;
}

function extractAddress(md: string): string | undefined {
  const cleaned = md.replace(/\bAdress\s*/g, "");
  const m = cleaned.match(/([A-ZÅÄÖ][a-zåäöA-ZÅÄÖ ]+\s+\d+[A-Za-z]?)[,\n\r]+\s*(\d{3}\s*\d{2}\s+[A-ZÅÄÖ][a-zåäö]+)/);
  if (m) return `${m[1].trim()}, ${m[2].trim()}`;
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

// Strip subpage suffix from a merinfo URL to get the company base URL.
function merinfoBase(url: string): string {
  return url
    .replace(/\/(fordon|telefonnummer|adresser|styrelse-koncern|verklig-huvudman|nyckeltal|kontakt|ekonomi|styrelse)(\/.*)?$/i, "")
    .replace(/\/$/, "");
}

export async function researchCompany(name: string, orgNumber?: string | null): Promise<ResearchResult> {
  if (!FIRECRAWL_KEY()) throw new Error("FIRECRAWL_API_KEY not configured");

  // ── Phase 1: fire all broad searches in parallel ──────────────────────────
  const queries = [
    orgNumber
      ? `"${name}" ${orgNumber} telefon kontakt`
      : `"${name}" telefon kontakt Sverige`,
    `"${name}" lastbil OR fordon OR åkeri`,
    orgNumber
      ? `${orgNumber} site:merinfo.se OR site:allabolag.se OR site:hitta.se`
      : `"${name}" site:merinfo.se OR site:allabolag.se OR site:hitta.se`,
  ];

  const searchResponses = await Promise.allSettled(queries.map((q) => firecrawlSearch(q, 4)));

  const allResults: Array<{ url: string; title?: string; markdown?: string; description?: string }> = [];
  for (const r of searchResponses) {
    if (r.status === "fulfilled") allResults.push(...pickResults(r.value));
    else console.warn("search failed", r.reason);
  }

  // Dedupe by URL, keeping whichever copy has markdown.
  const byUrl = new Map<string, { url: string; title?: string; markdown?: string; description?: string }>();
  for (const r of allResults) {
    if (!r.url) continue;
    const existing = byUrl.get(r.url);
    if (!existing || (!existing.markdown && r.markdown)) byUrl.set(r.url, r);
  }
  const results = Array.from(byUrl.values());

  // ── Phase 2: resolve merinfo base URL ────────────────────────────────────
  let merinoBaseUrl: string | undefined = results
    .find((r) => /merinfo\.se\/foretag\//i.test(r.url))
    ?.url;
  if (merinoBaseUrl) merinoBaseUrl = merinfoBase(merinoBaseUrl);

  // Fallback: try to discover merinfo URL if the searches missed it.
  if (!merinoBaseUrl && orgNumber) {
    const cleanedOrg = orgNumber.replace(/\D/g, "");

    // Run both targeted searches in parallel.
    const [targeted, generic] = await Promise.allSettled([
      firecrawlSearch(`site:merinfo.se/foretag ${cleanedOrg}`, 5),
      firecrawlSearch(`merinfo ${cleanedOrg} fordon`, 5),
    ]);

    for (const r of [targeted, generic]) {
      if (r.status === "fulfilled") {
        const hit = pickResults(r.value).find((h) => /merinfo\.se\/foretag\//i.test(h.url));
        if (hit) {
          merinoBaseUrl = merinfoBase(hit.url);
          // Reuse any markdown the search already returned.
          if (!byUrl.has(hit.url)) byUrl.set(hit.url, hit);
          results.push(...pickResults(r.value).filter((h) => !byUrl.has(h.url)));
          break;
        }
      }
    }

    // Last resort: scrape merinfo's own search page (JS-rendered).
    if (!merinoBaseUrl) {
      const searchScrape = await firecrawlScrape(`https://www.merinfo.se/sok?q=${cleanedOrg}`, { waitFor: 3000 }).catch(() => null);
      const searchMd = searchScrape?.data?.markdown || searchScrape?.markdown || "";
      const m = searchMd.match(/https:\/\/www\.merinfo\.se\/foretag\/[^\s)"']+/i);
      if (m) merinoBaseUrl = merinfoBase(m[0]);
    }

    if (!merinoBaseUrl) console.warn("[research] merinfo /foretag page not found for", name, orgNumber);
  }

  // ── Phase 3: scrape merinfo subpages ─────────────────────────────────────
  let parsedVehicles: Vehicle[] = [];
  let totalFleetFromMerinfo: string | undefined;
  let merinoMainMd = "";

  if (merinoBaseUrl) {
    // Only scrape the main merinfo page if the search didn't already return its markdown.
    const existingMain = byUrl.get(merinoBaseUrl);
    let mainMd = existingMain?.markdown ?? "";
    if (!mainMd) {
      const main = await firecrawlScrape(merinoBaseUrl).catch(() => null);
      mainMd = main?.data?.markdown || main?.markdown || "";
      if (existingMain) existingMain.markdown = mainMd;
      else results.push({ url: merinoBaseUrl, title: "Merinfo main", markdown: mainMd });
    }
    merinoMainMd = mainMd;

    // Scrape /verklig-huvudman in parallel with the first /fordon page.
    const vhUrl = `${merinoBaseUrl}/verklig-huvudman`;
    const fordon1Url = `${merinoBaseUrl}/fordon`;

    const [vhRes, fordon1Res] = await Promise.all([
      byUrl.has(vhUrl)
        ? Promise.resolve(null)
        : firecrawlScrape(vhUrl).catch(() => null),
      byUrl.has(fordon1Url)
        ? Promise.resolve({ _cached: true, markdown: byUrl.get(fordon1Url)!.markdown })
        : firecrawlScrape(fordon1Url, { waitFor: 2500 }).catch(() => null),
    ]);

    // Handle /verklig-huvudman result.
    const vhMd = vhRes?.data?.markdown || vhRes?.markdown || byUrl.get(vhUrl)?.markdown || "";
    if (vhMd) {
      results.push({ url: vhUrl, markdown: vhMd });
      merinoMainMd += "\n\n" + vhMd;
    }

    // Handle first /fordon page.
    const fordon1Md = (fordon1Res as any)?._cached
      ? (fordon1Res as any).markdown
      : (fordon1Res as any)?.data?.markdown || (fordon1Res as any)?.markdown;

    if (fordon1Md) {
      const totalMatch = fordon1Md.match(/Totalt antal fordon:\s*(\d+)/i);
      if (totalMatch) {
        totalFleetFromMerinfo = totalMatch[1];
      }
      const expectedTotal = parseInt(totalFleetFromMerinfo ?? "0", 10) || 0;
      const page1Vehicles = parseMerinfoVehicles(fordon1Md);
      parsedVehicles.push(...page1Vehicles);
      results.push({ url: fordon1Url, title: "Merinfo - Fordon page 1", markdown: fordon1Md });

      // Paginate remaining pages only if the first page is full (25 vehicles)
      // and we haven't collected everything yet.
      if (page1Vehicles.length >= 25 && (expectedTotal === 0 || parsedVehicles.length < expectedTotal)) {
        // Figure out how many more pages we need (max 19 more = 20 total).
        const remainingPages = expectedTotal > 0
          ? Math.min(Math.ceil((expectedTotal - parsedVehicles.length) / 25), 19)
          : 19;

        for (let page = 2; page <= remainingPages + 1; page++) {
          const fordonUrl = `${merinoBaseUrl}/fordon?page=${page}`;
          const fordon = await firecrawlScrape(fordonUrl, { waitFor: 2500 }).catch(() => null);
          const fordonMd = fordon?.data?.markdown || fordon?.markdown;
          if (!fordonMd) break;

          const pageVehicles = parseMerinfoVehicles(fordonMd);
          if (pageVehicles.length === 0) break;
          parsedVehicles.push(...pageVehicles);
          results.push({ url: fordonUrl, title: `Merinfo - Fordon page ${page}`, markdown: fordonMd });

          if (expectedTotal > 0 && parsedVehicles.length >= expectedTotal) break;
          if (pageVehicles.length < 25) break;
        }
      }
    }

    // Dedupe vehicles by registration.
    const seenReg = new Set<string>();
    parsedVehicles = parsedVehicles.filter((v) => {
      const r = (v.registration ?? "").toUpperCase();
      if (!r || seenReg.has(r)) return false;
      seenReg.add(r);
      return true;
    });
  }

  // ── Phase 4: company's own website ───────────────────────────────────────
  // The search result already includes markdown for the homepage — only scrape
  // /kontakt as an extra page (one credit instead of two).
  const excluded = ["allabolag.se", "hitta.se", "eniro.se", "merinfo.se", "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "google.com", "bing.com"];
  const ownSite = results.find((r) => excluded.every((e) => !r.url.toLowerCase().includes(e)));
  if (ownSite) {
    try {
      const u = new URL(ownSite.url);
      const contactUrl = `${u.origin}/kontakt`;
      if (!byUrl.has(contactUrl)) {
        const c = await firecrawlScrape(contactUrl).catch(() => null);
        const cmd = c?.data?.markdown || c?.markdown;
        if (cmd) results.push({ url: contactUrl, markdown: cmd });
      }
    } catch { /* ignore */ }
  }

  // ── Phase 5: extract data from collected content ──────────────────────────
  const sources = [...new Set(results.map((r) => r.url).filter(Boolean))];

  const context = results
    .map((r) => r.markdown ?? r.description ?? "")
    .join("\n\n")
    .slice(0, 24000);

  const phones = Array.from(new Set(extractSwedishPhones(context))).slice(0, 10);
  const contactPerson = extractContactPerson(merinoMainMd) ?? extractContactPerson(context);
  const address = extractAddress(merinoMainMd) ?? extractAddress(context);
  const website = extractWebsite(results);

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
