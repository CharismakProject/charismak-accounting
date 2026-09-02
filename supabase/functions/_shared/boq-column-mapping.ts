export type BoqColumnKey = "serial" | "description" | "quantity" | "unit" | "rate" | "amount";

export type BoqColumnMap = Partial<Record<BoqColumnKey, number>>;

const aliases: Record<BoqColumnKey, string[]> = {
  serial: [
    "s/n", "sn", "s no", "s/no", "serial", "serial no", "serial number",
    "item", "item no", "item number", "no", "no.", "ref", "reference"
  ],
  description: [
    "description", "description of work", "work description", "item description",
    "particulars", "details", "work item", "scope", "scope of work"
  ],
  quantity: [
    "qty", "quantity", "measured qty", "measured quantity", "qnty", "quant",
    "bill qty", "boq qty"
  ],
  unit: [
    "unit", "uom", "unit of measure", "unit of measurement", "measurement unit"
  ],
  rate: [
    "rate", "unit rate", "price", "unit price", "rate/qty", "rate per unit",
    "cost rate", "quoted rate"
  ],
  amount: [
    "amount", "total", "total amount", "extended amount", "extension",
    "line amount", "line total", "cost", "value"
  ],
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[._-]+/g, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const normalizedAliases = Object.fromEntries(
  Object.entries(aliases).map(([key, values]) => [key, new Set(values.map(normalize))]),
) as Record<BoqColumnKey, Set<string>>;

export function matchBoqColumnHeader(value: unknown): BoqColumnKey | null {
  const header = normalize(value);
  if (!header) return null;

  for (const key of Object.keys(normalizedAliases) as BoqColumnKey[]) {
    if (normalizedAliases[key].has(header)) return key;
  }

  if (/^(s\s*\/\s*n|serial\s*(no|number)?|item\s*(no|number)|ref(erence)?)$/.test(header)) return "serial";
  if (/description|particulars|scope of work|work item/.test(header)) return "description";
  if (/^(qty|quantity|qnty|measured qty|measured quantity|bill qty|boq qty)$/.test(header)) return "quantity";
  if (/^(unit|uom|unit of measure|unit of measurement)$/.test(header)) return "unit";
  if (/^(rate|unit rate|unit price|price|rate per unit|quoted rate)$/.test(header)) return "rate";
  if (/^(amount|total amount|line total|line amount|extended amount|extension|value)$/.test(header)) return "amount";

  return null;
}

export function mapBoqHeaderRow(row: unknown[]): BoqColumnMap {
  const mapped: BoqColumnMap = {};
  row.forEach((cell, index) => {
    const key = matchBoqColumnHeader(cell);
    if (key && mapped[key] === undefined) mapped[key] = index;
  });
  return mapped;
}

export type DetectedBoqHeader = {
  rowIndex: number;
  columns: BoqColumnMap;
  score: number;
};

export function detectBoqHeaderRow(rows: unknown[][], maxScanRows = 40): DetectedBoqHeader | null {
  let best: DetectedBoqHeader | null = null;

  rows.slice(0, maxScanRows).forEach((row, rowIndex) => {
    const columns = mapBoqHeaderRow(row);
    const keys = Object.keys(columns) as BoqColumnKey[];
    if (columns.description === undefined) return;

    let score = keys.length;
    if (columns.quantity !== undefined) score += 2;
    if (columns.unit !== undefined) score += 1;
    if (columns.rate !== undefined) score += 1;
    if (columns.amount !== undefined) score += 1;

    const hasBoqShape =
      columns.quantity !== undefined ||
      columns.unit !== undefined ||
      columns.rate !== undefined ||
      columns.amount !== undefined;

    if (!hasBoqShape) return;
    if (!best || score > best.score) best = { rowIndex, columns, score };
  });

  return best;
}

export function supportedBoqHeaderExamples(): Record<BoqColumnKey, string[]> {
  return aliases;
}
