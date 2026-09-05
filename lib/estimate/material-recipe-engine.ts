import type {
  BoqMaterialBreakdown,
  BoqRecipeFamily,
  BoqSupplyResponsibility,
  SectionedBoq,
  SectionedBoqItem,
} from "./sectioned-boq";

export type MaterialRecipeParameters = {
  blockWastePercent?: number;
  mortarWastePercent?: number;
  mortarWetVolumePerBlockM3?: number;
  mortarDryFactor?: number;
  mortarCementPart?: number;
  mortarSandPart?: number;
  cementDensityKgPerM3?: number;
  cementBagKg?: number;
  plasterThicknessMm?: number;
  plasterWastePercent?: number;
  plasterCementPart?: number;
  plasterSandPart?: number;
  screedThicknessMm?: number;
  screedWastePercent?: number;
  screedCementPart?: number;
  screedSandPart?: number;
  tileWastePercent?: number;
  reinforcementWastePercent?: number;
  bindingWirePercent?: number;
};

export type MaterializeDecision = {
  recipeFamily: BoqRecipeFamily;
  supplyResponsibility: BoqSupplyResponsibility;
  confirmed: boolean;
  parameters?: MaterialRecipeParameters;
};

const DEFAULTS: Required<MaterialRecipeParameters> = {
  blockWastePercent: 5,
  mortarWastePercent: 10,
  mortarWetVolumePerBlockM3: 0.0015,
  mortarDryFactor: 1.33,
  mortarCementPart: 1,
  mortarSandPart: 6,
  cementDensityKgPerM3: 1440,
  cementBagKg: 50,
  plasterThicknessMm: 12,
  plasterWastePercent: 10,
  plasterCementPart: 1,
  plasterSandPart: 4,
  screedThicknessMm: 25,
  screedWastePercent: 10,
  screedCementPart: 1,
  screedSandPart: 4,
  tileWastePercent: 5,
  reinforcementWastePercent: 5,
  bindingWirePercent: 1.5,
};

const round = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const norm = (unit: string) => unit.trim().toLowerCase().replace(/²/g, "2").replace(/\s+/g, "");
const isAreaUnit = (unit: string) => ["m2", "sqm", "sq.m", "sqm.", "m^2"].includes(norm(unit));
const isKgUnit = (unit: string) => ["kg", "kilogram", "kilograms"].includes(norm(unit));
const isTonneUnit = (unit: string) => ["t", "ton", "tons", "tonne", "tonnes", "mt"].includes(norm(unit));

function component(
  id: string,
  material: string,
  unit: string,
  baseQuantity: number,
  wastePercent = 0,
  note?: string,
) {
  return {
    id,
    material,
    unit,
    baseQuantity: round(baseQuantity),
    wastePercent,
    totalQuantity: round(baseQuantity * (1 + wastePercent / 100)),
    source: "recipe" as const,
    note,
  };
}

function mortarMaterials(
  wetM3: number,
  wastePercent: number,
  dryFactor: number,
  cementPart: number,
  sandPart: number,
  cementDensityKgPerM3: number,
  cementBagKg: number,
  prefix: string,
) {
  const wetWithWaste = wetM3 * (1 + wastePercent / 100);
  const dryVolume = wetWithWaste * dryFactor;
  const totalParts = cementPart + sandPart;
  const cementM3 = dryVolume * (cementPart / totalParts);
  const sandM3 = dryVolume * (sandPart / totalParts);
  const cementBags = (cementM3 * cementDensityKgPerM3) / cementBagKg;
  return [
    component(`${prefix}-cement`, "Cement", `${cementBagKg}kg bag`, cementBags, 0, "Derived from the reviewed mortar/screed mix assumptions."),
    component(`${prefix}-sand`, "Sharp sand", "m³", sandM3, 0, "Derived from the reviewed mortar/screed mix assumptions."),
  ];
}

function unsupported(recipeName: string, reason: string): BoqMaterialBreakdown {
  return {
    status: "needs_review",
    recipeName,
    materials: [],
    assumptions: [reason],
  };
}

export function buildMaterialBreakdown(input: {
  item: Pick<SectionedBoqItem, "id" | "description" | "unit" | "quantity">;
  decision: MaterializeDecision;
}): BoqMaterialBreakdown {
  const { item, decision } = input;
  const p = { ...DEFAULTS, ...(decision.parameters ?? {}) };

  if (!decision.confirmed) return unsupported("Unconfirmed recipe", "Confirm the BOQ item's meaning and material recipe before calculating materials.");
  if (decision.supplyResponsibility === "client") {
    return { status: "not_applicable", recipeName: "Client supplied", materials: [], assumptions: ["This item is marked client supplied, so it is excluded from contractor material totals."] };
  }
  if (decision.supplyResponsibility === "labour_only") {
    return { status: "not_applicable", recipeName: "Labour / installation only", materials: [], assumptions: ["This item is marked labour/installation only, so no contractor material quantity is generated."] };
  }
  if (decision.recipeFamily === "not_applicable") {
    return { status: "not_applicable", recipeName: "No material recipe required", materials: [], assumptions: [] };
  }
  if (decision.recipeFamily === "needs_review") return unsupported("Recipe needs review", "Choose a material recipe family before calculating materials.");
  if (!Number.isFinite(item.quantity) || item.quantity < 0) return unsupported("Invalid quantity", "The BOQ quantity must be reviewed before material calculation.");

  if (decision.recipeFamily === "blockwork_225" || decision.recipeFamily === "blockwork_150" || decision.recipeFamily === "blockwork") {
    if (!isAreaUnit(item.unit)) return unsupported("Blockwork", `Blockwork V1 expects an area unit such as m²; this line uses “${item.unit}”.`);
    const blocksPerM2 = 10;
    const baseBlocks = item.quantity * blocksPerM2;
    const mortarWetM3 = baseBlocks * p.mortarWetVolumePerBlockM3;
    return {
      status: "available",
      recipeName: decision.recipeFamily === "blockwork_225" ? "225mm blockwork" : decision.recipeFamily === "blockwork_150" ? "150mm blockwork" : "Blockwork",
      materials: [
        component(`${item.id}-blocks`, decision.recipeFamily === "blockwork_150" ? "150mm hollow blocks" : decision.recipeFamily === "blockwork_225" ? "225mm hollow blocks" : "Hollow blocks", "pcs", baseBlocks, p.blockWastePercent),
        ...mortarMaterials(mortarWetM3, p.mortarWastePercent, p.mortarDryFactor, p.mortarCementPart, p.mortarSandPart, p.cementDensityKgPerM3, p.cementBagKg, `${item.id}-mortar`),
      ],
      assumptions: [
        `${blocksPerM2} blocks per m².`,
        `${p.blockWastePercent}% block waste.`,
        `${p.mortarWetVolumePerBlockM3} m³ wet mortar per block with ${p.mortarWastePercent}% mortar allowance.`,
        `Mortar mix ${p.mortarCementPart}:${p.mortarSandPart}; dry-volume factor ${p.mortarDryFactor}.`,
        `${p.cementBagKg}kg cement bags at ${p.cementDensityKgPerM3} kg/m³ bulk density.`,
      ],
    };
  }

  if (decision.recipeFamily === "plastering") {
    if (!isAreaUnit(item.unit)) return unsupported("Plastering", `Plastering V1 expects an area unit such as m²; this line uses “${item.unit}”.`);
    const wetM3 = item.quantity * (p.plasterThicknessMm / 1000);
    return {
      status: "available",
      recipeName: "Plastering",
      materials: mortarMaterials(wetM3, p.plasterWastePercent, p.mortarDryFactor, p.plasterCementPart, p.plasterSandPart, p.cementDensityKgPerM3, p.cementBagKg, `${item.id}-plaster`),
      assumptions: [
        `${p.plasterThicknessMm}mm average plaster thickness.`,
        `${p.plasterCementPart}:${p.plasterSandPart} cement:sand mix.`,
        `${p.plasterWastePercent}% wet-mortar allowance and dry-volume factor ${p.mortarDryFactor}.`,
      ],
    };
  }

  if (decision.recipeFamily === "screeding") {
    if (!isAreaUnit(item.unit)) return unsupported("Screeding", `Screeding V1 expects an area unit such as m²; this line uses “${item.unit}”.`);
    const wetM3 = item.quantity * (p.screedThicknessMm / 1000);
    return {
      status: "available",
      recipeName: "Floor screeding",
      materials: mortarMaterials(wetM3, p.screedWastePercent, p.mortarDryFactor, p.screedCementPart, p.screedSandPart, p.cementDensityKgPerM3, p.cementBagKg, `${item.id}-screed`),
      assumptions: [
        `${p.screedThicknessMm}mm average screed thickness.`,
        `${p.screedCementPart}:${p.screedSandPart} cement:sand mix.`,
        `${p.screedWastePercent}% wet-mortar allowance and dry-volume factor ${p.mortarDryFactor}.`,
      ],
    };
  }

  if (decision.recipeFamily === "floor_tiling" || decision.recipeFamily === "wall_tiling") {
    if (!isAreaUnit(item.unit)) return unsupported("Tiling", `Tiling V1 expects an area unit such as m²; this line uses “${item.unit}”.`);
    return {
      status: "available",
      recipeName: decision.recipeFamily === "floor_tiling" ? "Floor tiling" : "Wall tiling",
      materials: [component(`${item.id}-finish`, decision.recipeFamily === "floor_tiling" ? "Floor tile finish" : "Wall tile finish", "m²", item.quantity, p.tileWastePercent, "Tile/finish area only. Adhesive and grout depend on tile size, substrate and product and are not guessed in V1.")],
      assumptions: [`${p.tileWastePercent}% tile/finish cutting and waste allowance.`, "Adhesive and grout remain parameter-required until tile format/product is confirmed."],
    };
  }

  if (decision.recipeFamily === "reinforcement") {
    if (!isKgUnit(item.unit) && !isTonneUnit(item.unit)) return unsupported("Reinforcement", `Reinforcement V1 expects kg or tonnes; this line uses “${item.unit}”.`);
    const steelKg = isTonneUnit(item.unit) ? item.quantity * 1000 : item.quantity;
    return {
      status: "available",
      recipeName: "Measured reinforcement",
      materials: [
        component(`${item.id}-steel`, "Reinforcement steel", "kg", steelKg, p.reinforcementWastePercent, "Measured reinforcement quantity converted to kg where necessary."),
        component(`${item.id}-binding`, "Binding wire", "kg", steelKg * (p.bindingWirePercent / 100), 0, "Calculated as a percentage of measured reinforcement before steel waste."),
      ],
      assumptions: [`${p.reinforcementWastePercent}% reinforcement waste allowance.`, `Binding wire at ${p.bindingWirePercent}% of measured reinforcement.`],
    };
  }

  if (decision.recipeFamily === "direct_supply") {
    if (decision.supplyResponsibility !== "contractor") return unsupported("Direct supply item", "Direct supply is only included in contractor material totals when the contractor is responsible for supply.");
    return {
      status: "available",
      recipeName: "Direct supply item",
      materials: [component(`${item.id}-direct`, item.description, item.unit || "item", item.quantity, 0, "Direct-supply BOQ quantity; no hidden conversion or waste factor applied.")],
      assumptions: ["The BOQ quantity itself is treated as the material quantity because this is a confirmed direct-supply item."],
    };
  }

  const labels: Partial<Record<BoqRecipeFamily, string>> = {
    concrete: "Concrete",
    formwork: "Formwork",
    painting: "Painting",
    roofing: "Roofing",
    ceiling: "Ceiling",
    plumbing_installation: "Plumbing installation",
    electrical_installation: "Electrical installation",
    external_works: "External works",
  };
  return unsupported(labels[decision.recipeFamily] ?? "Material recipe", "This recipe family still requires specification parameters before Charismak can calculate reliable material quantities.");
}

export function materializeBoq(
  boq: SectionedBoq,
  decisions: Record<string, MaterializeDecision>,
): SectionedBoq {
  return {
    ...boq,
    sections: boq.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        materialBreakdown: buildMaterialBreakdown({
          item,
          decision: decisions[item.id] ?? {
            recipeFamily: item.reviewSuggestion?.recipeFamily ?? "needs_review",
            supplyResponsibility: item.reviewSuggestion?.supplyResponsibility ?? "unknown",
            confirmed: false,
          },
        }),
      })),
    })),
  };
}
