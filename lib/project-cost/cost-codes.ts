export type CostCodeGroup = {
  code: string;
  name: string;
  aliases?: readonly string[];
};

/**
 * Shared construction cost-code contract for Estimator -> Project -> Accounting.
 *
 * Rules:
 * - codes are stable identifiers and must not be renamed after release;
 * - display names may evolve without changing codes;
 * - estimates, BOQ items, commitments and actual transactions should map to one code;
 * - client contract value and internal cost budget remain separate commercial concepts.
 */
export const COST_CODE_GROUPS = [
  { code: "01", name: "Preliminaries", aliases: ["prelims", "general requirements"] },
  { code: "02", name: "Substructure", aliases: ["foundation", "substructure works"] },
  { code: "03", name: "Concrete & Reinforcement", aliases: ["concrete", "reinforcement", "rebar", "formwork"] },
  { code: "04", name: "Blockwork & Masonry", aliases: ["blockwork", "masonry", "walling"] },
  { code: "05", name: "Structural Steel", aliases: ["steelwork", "structural steel"] },
  { code: "06", name: "Roofing", aliases: ["roof", "roofing works"] },
  { code: "07", name: "Doors", aliases: ["door", "ironmongery"] },
  { code: "08", name: "Windows & Glazing", aliases: ["windows", "glazing", "aluminium windows"] },
  { code: "09", name: "Plastering & Screeding", aliases: ["plaster", "render", "screed"] },
  { code: "10", name: "Floor Finishes", aliases: ["floor tiles", "floor finish", "tiling"] },
  { code: "11", name: "Wall Finishes", aliases: ["wall tiles", "wall finish", "cladding"] },
  { code: "12", name: "Ceilings", aliases: ["ceiling", "pop", "gypsum ceiling"] },
  { code: "13", name: "Painting & Decoration", aliases: ["painting", "decorating", "paint"] },
  { code: "14", name: "Joinery & Fixtures", aliases: ["joinery", "cabinetry", "wardrobe", "kitchen cabinet"] },
  { code: "15", name: "Plumbing & Sanitary", aliases: ["plumbing", "sanitary", "water supply", "drainage"] },
  { code: "16", name: "Electrical", aliases: ["electrical works", "power", "lighting"] },
  { code: "17", name: "Mechanical & HVAC", aliases: ["hvac", "air conditioning", "mechanical"] },
  { code: "18", name: "External Works", aliases: ["external works", "landscaping", "drainage external", "fence"] },
  { code: "19", name: "Plant, Equipment & Specialist Works", aliases: ["equipment", "specialist", "plant"] },
  { code: "20", name: "Professional, Statutory & Other", aliases: ["professional fees", "permits", "statutory", "other"] },
] as const satisfies readonly CostCodeGroup[];

export type CostCode = (typeof COST_CODE_GROUPS)[number]["code"];

export function getCostCodeGroup(code: string) {
  return COST_CODE_GROUPS.find((item) => item.code === code) ?? null;
}

export function isValidCostCode(code: string): code is CostCode {
  return COST_CODE_GROUPS.some((item) => item.code === code);
}

export function suggestCostCode(description: string): CostCode | null {
  const normalized = description.trim().toLowerCase();
  if (!normalized) return null;

  const match = COST_CODE_GROUPS.find((group) =>
    [group.name, ...group.aliases].some((term) =>
      normalized.includes(term.toLowerCase()),
    ),
  );

  return match?.code ?? null;
}
