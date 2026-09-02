export type BoqColumnKey = "serial" | "description" | "quantity" | "unit" | "rate" | "amount";

export type BoqColumnMap = Partial<Record<BoqColumnKey, number>>;

const ALIASES: Record<BoqColumnKey, readonly string[]> = {
  serial: ["s/n", "sn", "s.no", "s no", "serial", "serial no", "serial number", "item no", "item number", "item"],
  description: ["description", "item description", "work description", "description of work", "particulars"],
  quantity: ["qty", "quantity", "quant", "measured qty", "measured quantity"],
  unit: ["unit", "uom", "unit of measure", "unit of measurement"],
  rate: ["rate", "unit rate", "price", "unit price"],
  amount: ["amount", "total", "total amount", "extended amount", "value"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function identifyBoqColumn(value: unknown): BoqColumnKey | null {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;

  for (const [key, aliases] of Object.entries(ALIASES) as Array<[BoqColumnKey, readonly string[]]>) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return key;
  }
  return null;
}

export function detectBoqColumns(row: readonly unknown[]): BoqColumnMap {
  const map: BoqColumnMap = {};
  row.forEach((cell, index) => {
    const key = identifyBoqColumn(cell);
    if (key && map[key] === undefined) map[key] = index;
  });
  return map;
}

export function boqHeaderScore(row: readonly unknown[]): number {
  const map = detectBoqColumns(row);
  let score = 0;
  if (map.description !== undefined) score += 4;
  if (map.quantity !== undefined) score += 3;
  if (map.unit !== undefined) score += 2;
  if (map.rate !== undefined) score += 2;
  if (map.amount !== undefined) score += 2;
  if (map.serial !== undefined) score += 1;
  return score;
}

export function isUsableBoqHeader(row: readonly unknown[]): boolean {
  const map = detectBoqColumns(row);
  return map.description !== undefined && map.quantity !== undefined && map.unit !== undefined;
}

export function findBestBoqHeader(rows: readonly (readonly unknown[])[]): { rowIndex: number; columns: BoqColumnMap; score: number } | null {
  let best: { rowIndex: number; columns: BoqColumnMap; score: number } | null = null;
  rows.forEach((row, rowIndex) => {
    const score = boqHeaderScore(row);
    if (!isUsableBoqHeader(row)) return;
    if (!best || score > best.score) best = { rowIndex, columns: detectBoqColumns(row), score };
  });
  return best;
}

export const PRIMARY_BOQ_COLUMNS: readonly BoqColumnKey[] = [
  "serial",
  "description",
  "quantity",
  "unit",
  "rate",
  "amount",
];
