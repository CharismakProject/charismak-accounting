import {
  mapBoqHeaderRow,
  matchBoqColumnHeader,
  type BoqColumnKey,
  type BoqColumnMap,
} from "../../supabase/functions/_shared/boq-column-mapping.ts";

export type { BoqColumnKey, BoqColumnMap };

export function identifyBoqColumn(value: unknown): BoqColumnKey | null {
  return matchBoqColumnHeader(value);
}

export function detectBoqColumns(row: readonly unknown[]): BoqColumnMap {
  return mapBoqHeaderRow([...row]);
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
