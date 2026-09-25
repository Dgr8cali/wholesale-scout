import "server-only";
import { brandKey } from "../brands";
import { IP_LEVELS, parseIpCsv, type IpRiskBrand } from "../ipRisk";
import { chunks, db, loadIpRisk, must } from "./db";

export { loadIpRisk };

/** Validate and tidy one entry from the page. */
function cleanIpBrand(b: Partial<IpRiskBrand>): IpRiskBrand {
  const brand = b.brand?.trim();
  if (!brand || !brandKey(brand)) throw new Error("brand is required");
  if (!IP_LEVELS.includes(b.level as IpRiskBrand["level"])) throw new Error("level must be low, medium or high");
  if (b.reported_on && !/^\d{4}-\d{2}-\d{2}$/.test(b.reported_on)) throw new Error("date must be YYYY-MM-DD");
  return {
    brand,
    level: b.level as IpRiskBrand["level"],
    aliases: [...new Set((b.aliases ?? []).map((a) => a.trim()).filter((a) => a && brandKey(a) && brandKey(a) !== brandKey(brand)))],
    note: b.note?.trim() || null,
    source: b.source?.trim() || null,
    reported_on: b.reported_on || null,
  };
}

/** Add or update one brand (by id, else by its normalised name). */
export async function saveIpBrand(input: Partial<IpRiskBrand> & { id?: string }): Promise<IpRiskBrand> {
  const b = cleanIpBrand(input);
  const row = { ...b, brand_key: brandKey(b.brand), updated_at: new Date().toISOString() };
  const d = db();
  const res = input.id
    ? await d.from("ip_risk_brands").update(row).eq("id", input.id).select("*").single()
    : await d.from("ip_risk_brands").upsert(row, { onConflict: "brand_key" }).select("*").single();
  if (res.error && /duplicate|unique/i.test(res.error.message)) throw new Error(`${b.brand} is already on the list`);
  return must(res, "save IP-risk brand") as IpRiskBrand;
}

export async function deleteIpBrand(id: string): Promise<void> {
  must(await db().from("ip_risk_brands").delete().eq("id", id), "delete IP-risk brand");
}

/**
 * Import a pasted list (see parseIpCsv). A brand already on the list is updated with what the
 * import gives (blank cells keep what's there); new brands are added.
 */
export async function importIpCsv(csv: string, source?: string): Promise<{ added: number; updated: number; errors: string[] }> {
  const { rows, errors } = parseIpCsv(csv, { source });
  const current = new Map((await loadIpRisk()).map((x) => [brandKey(x.brand), x]));
  let added = 0, updated = 0;
  const now = new Date().toISOString();
  const upserts = rows.map((r) => {
    const cur = current.get(brandKey(r.brand));
    if (cur) updated++;
    else added++;
    return {
      brand: cur?.brand ?? r.brand,
      brand_key: brandKey(r.brand),
      level: r.level,
      note: r.note ?? cur?.note ?? null,
      source: r.source ?? cur?.source ?? null,
      reported_on: r.reported_on ?? cur?.reported_on ?? null,
      aliases: [...new Set([...(cur?.aliases ?? []), ...r.aliases])],
      updated_at: now,
    };
  });
  for (const c of chunks(upserts, 200)) must(await db().from("ip_risk_brands").upsert(c, { onConflict: "brand_key" }), "import IP-risk brands");
  return { added, updated, errors };
}
