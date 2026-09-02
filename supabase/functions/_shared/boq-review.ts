export type BoqReviewConfidence = "high" | "medium" | "low";
export type BoqSupplyResponsibility = "contractor" | "client" | "specialist" | "labour_only" | "unknown";
export type BoqRecipeFamily =
  | "blockwork_225"
  | "blockwork_150"
  | "blockwork"
  | "concrete"
  | "reinforcement"
  | "formwork"
  | "plastering"
  | "screeding"
  | "floor_tiling"
  | "wall_tiling"
  | "painting"
  | "roofing"
  | "ceiling"
  | "plumbing_installation"
  | "electrical_installation"
  | "direct_supply"
  | "external_works"
  | "not_applicable"
  | "needs_review";

export type BoqReviewSuggestion = {
  costCode: string | null;
  costCodeName: string | null;
  recipeFamily: BoqRecipeFamily;
  recipeLabel: string;
  supplyResponsibility: BoqSupplyResponsibility;
  confidence: BoqReviewConfidence;
  requiresAttention: boolean;
  reasons: string[];
};

export type ReviewableBoqItem = {
  description: string;
  unit?: string;
  quantity?: number;
};

export type ReviewableBoqSection = {
  title: string;
  items: Array<ReviewableBoqItem & { reviewSuggestion?: BoqReviewSuggestion }>;
};

export const REVIEW_COST_CODES = [
  ["01", "Preliminaries"],
  ["02", "Substructure"],
  ["03", "Concrete & Reinforcement"],
  ["04", "Blockwork & Masonry"],
  ["05", "Structural Steel"],
  ["06", "Roofing"],
  ["07", "Doors"],
  ["08", "Windows & Glazing"],
  ["09", "Plastering & Screeding"],
  ["10", "Floor Finishes"],
  ["11", "Wall Finishes"],
  ["12", "Ceilings"],
  ["13", "Painting & Decoration"],
  ["14", "Joinery & Fixtures"],
  ["15", "Plumbing & Sanitary"],
  ["16", "Electrical"],
  ["17", "Mechanical & HVAC"],
  ["18", "External Works"],
  ["19", "Plant, Equipment & Specialist Works"],
  ["20", "Professional, Statutory & Other"],
] as const;

const costName = (code: string | null) => REVIEW_COST_CODES.find(([candidate]) => candidate === code)?.[1] ?? null;
const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const includesAny = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));

function directSupply(text: string): boolean {
  return includesAny(text, [
    "door", "window", "glazing", "glass", "sanitary ware", "sanitaryware", "water closet", " wc ",
    "wash hand basin", "whb", "shower mixer", "mixer tap", "sink", "extractor fan", "water heater",
    "socket", "switch", "light fitting", "light fixture", "luminaire", "air conditioner", "ac unit",
    "wardrobe", "kitchen cabinet", "cabinet", "ironmongery",
  ]);
}

function suggestRecipe(text: string): { family: BoqRecipeFamily; label: string; code: string | null; strong: boolean } {
  if (/\b225\s*mm\b/.test(text) && includesAny(text, ["block", "blockwork", "walling"])) return { family: "blockwork_225", label: "225mm blockwork", code: "04", strong: true };
  if ((/\b150\s*mm\b/.test(text) || includesAny(text, ["6 inch", "6in"])) && includesAny(text, ["block", "blockwork", "walling"])) return { family: "blockwork_150", label: "150mm blockwork", code: "04", strong: true };
  if (includesAny(text, ["blockwork", "sandcrete block", "block wall", "masonry", "walling"])) return { family: "blockwork", label: "Blockwork recipe", code: "04", strong: true };
  if (includesAny(text, ["reinforcement", "reinforcing bar", "rebar", "high yield steel", "mild steel bar", "y8", "y10", "y12", "y16", "y20", "y25"])) return { family: "reinforcement", label: "Reinforcement recipe", code: "03", strong: true };
  if (includesAny(text, ["formwork", "shuttering", "mould to concrete"])) return { family: "formwork", label: "Formwork recipe", code: "03", strong: true };
  if (includesAny(text, ["reinforced concrete", "mass concrete", "plain concrete", "concrete in", "concrete work", "concrete slab", "concrete beam", "concrete column", "concrete foundation"])) return { family: "concrete", label: "Concrete recipe", code: "03", strong: true };
  if (includesAny(text, ["plastering", "plaster to", "cement sand plaster", "rendering", "render to"])) return { family: "plastering", label: "Plastering recipe", code: "09", strong: true };
  if (includesAny(text, ["screeding", "floor screed", "cement screed", "screed to"])) return { family: "screeding", label: "Screeding recipe", code: "09", strong: true };
  if (includesAny(text, ["floor tile", "floor tiling", "porcelain floor", "ceramic floor", "granite floor", "marble floor"])) return { family: "floor_tiling", label: "Floor tiling recipe", code: "10", strong: true };
  if (includesAny(text, ["wall tile", "wall tiling", "ceramic wall", "porcelain wall", "wall cladding"])) return { family: "wall_tiling", label: "Wall finish recipe", code: "11", strong: true };
  if (includesAny(text, ["painting", "paint to", "emulsion paint", "gloss paint", "textured paint", "primer coat"])) return { family: "painting", label: "Painting recipe", code: "13", strong: true };
  if (includesAny(text, ["roofing sheet", "roof covering", "longspan", "stone coated", "aluminium roofing", "roof tile", "roof membrane"])) return { family: "roofing", label: "Roofing recipe", code: "06", strong: true };
  if (includesAny(text, ["ceiling", "gypsum board", "plasterboard", "pop ceiling", "suspended ceiling"])) return { family: "ceiling", label: "Ceiling recipe", code: "12", strong: true };
  if (includesAny(text, ["pipework", "water supply pipe", "drainage pipe", "soil pipe", "waste pipe", "pvc pipe", "ppr pipe", "plumbing installation"])) return { family: "plumbing_installation", label: "Plumbing installation recipe", code: "15", strong: true };
  if (includesAny(text, ["cable", "conduit", "trunking", "wiring", "electrical installation", "distribution board", "earthing"])) return { family: "electrical_installation", label: "Electrical installation recipe", code: "16", strong: true };
  if (directSupply(` ${text} `)) {
    let code: string | null = null;
    if (includesAny(text, ["door", "ironmongery"])) code = "07";
    else if (includesAny(text, ["window", "glazing", "glass"])) code = "08";
    else if (includesAny(text, ["wardrobe", "kitchen cabinet", "cabinet"])) code = "14";
    else if (includesAny(text, ["sanitary", "water closet", " wc ", "wash hand basin", "whb", "shower", "sink", "mixer", "water heater"])) code = "15";
    else if (includesAny(text, ["socket", "switch", "light fitting", "light fixture", "luminaire", "extractor fan"])) code = "16";
    else if (includesAny(text, ["air conditioner", "ac unit"])) code = "17";
    return { family: "direct_supply", label: "Direct supply item", code, strong: true };
  }
  if (includesAny(text, ["excavation", "earthwork", "earth work", "backfilling", "back filling", "cart away", "disposal of excavated"])) return { family: "not_applicable", label: "No material recipe required", code: "02", strong: true };
  if (includesAny(text, ["preliminaries", "mobilization", "mobilisation", "site establishment", "temporary works", "insurance", "health and safety"])) return { family: "not_applicable", label: "No material recipe required", code: "01", strong: true };
  if (includesAny(text, ["structural steel", "steel frame", "steel column", "steel beam", "steel truss"])) return { family: "needs_review", label: "Structural steel recipe needs review", code: "05", strong: true };
  if (includesAny(text, ["landscaping", "paving", "interlock", "external drain", "fence", "gate", "external works"])) return { family: "external_works", label: "External works recipe", code: "18", strong: true };
  return { family: "needs_review", label: "Material recipe needs review", code: null, strong: false };
}

function costFromText(text: string, fallback: string | null): string | null {
  if (fallback) return fallback;
  const rules: Array<[string, readonly string[]]> = [
    ["17", ["hvac", "air conditioning", "mechanical ventilation", "ductwork"]],
    ["16", ["electrical", "lighting", "power installation"]],
    ["15", ["plumbing", "sanitary", "drainage", "water supply"]],
    ["14", ["joinery", "cabinetry", "wardrobe", "kitchen cabinet"]],
    ["13", ["painting", "decoration"]],
    ["12", ["ceiling"]],
    ["11", ["wall finish", "wall tile", "cladding"]],
    ["10", ["floor finish", "floor tile", "tiling"]],
    ["09", ["plaster", "render", "screed"]],
    ["08", ["window", "glazing", "glass"]],
    ["07", ["door", "ironmongery"]],
    ["06", ["roof", "roofing"]],
    ["05", ["structural steel", "steelwork"]],
    ["04", ["blockwork", "masonry", "walling"]],
    ["03", ["concrete", "reinforcement", "rebar", "formwork"]],
    ["02", ["substructure", "foundation", "excavation", "earthwork"]],
    ["18", ["external works", "landscaping", "fence", "paving"]],
    ["19", ["specialist works", "equipment", "plant"]],
    ["20", ["professional fee", "statutory", "permit", "approval fee"]],
    ["01", ["preliminaries", "prelims", "mobilization", "mobilisation"]],
  ];
  return rules.find(([, terms]) => includesAny(text, terms))?.[0] ?? null;
}

function supplySuggestion(text: string, recipe: BoqRecipeFamily): { value: BoqSupplyResponsibility; strong: boolean; reason: string } {
  if (includesAny(text, ["client supplied", "client supply", "by client", "free issue", "free issued", "owner supplied", "employer supplied"])) return { value: "client", strong: true, reason: "Description says the item/material is client supplied." };
  if (includesAny(text, ["labour only", "labor only", "installation only", "install only", "fixing only", "workmanship only"])) return { value: "labour_only", strong: true, reason: "Description indicates labour/installation only." };
  if (includesAny(text, ["nominated subcontractor", "nominated supplier", "specialist contractor", "by specialist", "specialist supply"])) return { value: "specialist", strong: true, reason: "Description indicates specialist or nominated supply." };
  if (includesAny(text, ["supply and install", "supply & install", "supply and fix", "provide and fix", "provide and install", "supply deliver and install"])) return { value: "contractor", strong: true, reason: "Description explicitly includes supply and installation." };
  if (recipe !== "needs_review" && recipe !== "not_applicable") return { value: "contractor", strong: false, reason: "Contractor supply is the default working assumption for a material-bearing BOQ item." };
  return { value: "unknown", strong: false, reason: "Supply responsibility is not clear from the description." };
}

export function suggestBoqItemReview(sectionTitle: string, item: ReviewableBoqItem): BoqReviewSuggestion {
  const itemText = normalized(`${item.description} ${item.unit ?? ""}`);
  const sectionText = normalized(sectionTitle);
  const combined = `${itemText} ${sectionText}`.trim();
  const recipe = suggestRecipe(itemText || combined);
  const code = costFromText(itemText, recipe.code) ?? costFromText(sectionText, null);
  const supply = supplySuggestion(itemText, recipe.family);
  const reasons: string[] = [];

  if (recipe.strong) reasons.push(`${recipe.label} detected from the BOQ wording.`);
  else reasons.push("No confident material-recipe family was found from the description.");
  if (code) reasons.push(`Suggested cost group: ${code} ${costName(code)}.`);
  if (supply.reason) reasons.push(supply.reason);

  let confidence: BoqReviewConfidence = "low";
  if (code && recipe.family !== "needs_review" && supply.value !== "unknown") confidence = recipe.strong && supply.strong ? "high" : "medium";
  else if (code && recipe.strong) confidence = "medium";

  const requiresAttention = !code || recipe.family === "needs_review" || supply.value === "unknown" || confidence === "low";
  return {
    costCode: code,
    costCodeName: costName(code),
    recipeFamily: recipe.family,
    recipeLabel: recipe.label,
    supplyResponsibility: supply.value,
    confidence,
    requiresAttention,
    reasons,
  };
}

export function decorateBoqWithReview<T extends { sections: Array<{ title: string; items: Array<ReviewableBoqItem & Record<string, unknown>> }> }>(boq: T) {
  let clearItems = 0;
  let attentionItems = 0;
  const sections = boq.sections.map((section) => {
    const items = section.items.map((item) => {
      const reviewSuggestion = suggestBoqItemReview(section.title, item);
      if (reviewSuggestion.requiresAttention) attentionItems++;
      else clearItems++;
      return { ...item, reviewSuggestion };
    });
    return { ...section, items };
  });
  return {
    boq: { ...boq, sections },
    reviewSummary: { clearItems, attentionItems, totalItems: clearItems + attentionItems },
  };
}
