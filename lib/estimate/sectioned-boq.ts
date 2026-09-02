export type MaterialBreakdownStatus = "available" | "needs_review" | "not_applicable";
export type MaterialBreakdownSource = "recipe" | "manual" | "imported";

export type BoqMaterialComponent = {
  id: string;
  material: string;
  unit: string;
  baseQuantity: number;
  wastePercent?: number;
  totalQuantity: number;
  source: MaterialBreakdownSource;
  note?: string;
};

export type BoqMaterialBreakdown = {
  status: MaterialBreakdownStatus;
  recipeName?: string;
  materials: BoqMaterialComponent[];
  assumptions?: string[];
};

export type SectionedBoqItem = {
  id: string;
  itemNo?: string;
  description: string;
  unit: string;
  quantity: number;
  rate?: number | null;
  amount?: number | null;
  materialBreakdown: BoqMaterialBreakdown;
};

export type SectionedBoqSection = {
  id: string;
  code?: string;
  title: string;
  items: SectionedBoqItem[];
};

export type SectionedBoq = {
  id: string;
  name: string;
  currency: string;
  sections: SectionedBoqSection[];
};

export type MaterialSummaryRow = {
  material: string;
  unit: string;
  quantity: number;
  sourceItems: Array<{ sectionId: string; itemId: string; description: string; quantity: number }>;
};

const moneyTolerance = 0.02;

export function validateSectionedBoq(boq: SectionedBoq): string[] {
  const errors: string[] = [];
  const itemIds = new Set<string>();
  const sectionIds = new Set<string>();

  for (const section of boq.sections) {
    if (sectionIds.has(section.id)) errors.push(`Duplicate section ID: ${section.id}`);
    sectionIds.add(section.id);
    if (!section.title.trim()) errors.push(`Section ${section.id} has no title.`);

    for (const item of section.items) {
      if (itemIds.has(item.id)) errors.push(`Duplicate BOQ item ID: ${item.id}`);
      itemIds.add(item.id);
      if (!item.description.trim()) errors.push(`Item ${item.id} has no description.`);
      if (!item.unit.trim()) errors.push(`Item ${item.id} has no unit.`);
      if (!Number.isFinite(item.quantity) || item.quantity < 0) errors.push(`Item ${item.id} has an invalid quantity.`);

      if (item.rate != null && item.amount != null) {
        const expected = item.quantity * item.rate;
        if (Math.abs(expected - item.amount) > moneyTolerance) {
          errors.push(`Item ${item.id} amount does not equal quantity × rate.`);
        }
      }

      if (item.materialBreakdown.status === "available" && item.materialBreakdown.materials.length === 0) {
        errors.push(`Item ${item.id} says materials are available but has no material components.`);
      }

      for (const material of item.materialBreakdown.materials) {
        if (!material.material.trim() || !material.unit.trim()) errors.push(`Item ${item.id} contains an incomplete material component.`);
        if (material.baseQuantity < 0 || material.totalQuantity < 0) errors.push(`Item ${item.id} contains a negative material quantity.`);
        const waste = material.wastePercent ?? 0;
        const expectedTotal = material.baseQuantity * (1 + waste / 100);
        if (Math.abs(expectedTotal - material.totalQuantity) > 0.02) {
          errors.push(`Item ${item.id} material ${material.material} does not reconcile with its waste allowance.`);
        }
      }
    }
  }

  return errors;
}

export function findBoqItem(boq: SectionedBoq, itemId: string): { section: SectionedBoqSection; item: SectionedBoqItem } | null {
  for (const section of boq.sections) {
    const item = section.items.find((candidate) => candidate.id === itemId);
    if (item) return { section, item };
  }
  return null;
}

export function summarizeMaterials(boq: SectionedBoq): MaterialSummaryRow[] {
  const rows = new Map<string, MaterialSummaryRow>();

  for (const section of boq.sections) {
    for (const item of section.items) {
      if (item.materialBreakdown.status !== "available") continue;
      for (const component of item.materialBreakdown.materials) {
        const key = `${component.material.trim().toLowerCase()}::${component.unit.trim().toLowerCase()}`;
        const row = rows.get(key) ?? {
          material: component.material,
          unit: component.unit,
          quantity: 0,
          sourceItems: [],
        };
        row.quantity += component.totalQuantity;
        row.sourceItems.push({
          sectionId: section.id,
          itemId: item.id,
          description: item.description,
          quantity: component.totalQuantity,
        });
        rows.set(key, row);
      }
    }
  }

  return [...rows.values()].sort((a, b) => a.material.localeCompare(b.material));
}
