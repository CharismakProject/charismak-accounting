export type RateSource = "imported" | "charismak_reference" | "manual";
export type RateConfidence = "high" | "medium" | "low" | "unavailable";
export type RateStatus = "unpriced" | "within_reference" | "below_reference" | "above_reference" | "reference_unavailable";

export type RateLocation = {
  country: string;
  state?: string | null;
  city?: string | null;
  area?: string | null;
};

export type RateObservation = {
  id: string;
  rate: number;
  currency: string;
  unit: string;
  observedAt: string;
  sourceLabel: string;
  location?: RateLocation | null;
  confidence?: Exclude<RateConfidence, "unavailable">;
};

export type RateReference = {
  currency: string;
  unit: string;
  location?: RateLocation | null;
  observedFrom?: string | null;
  observedTo?: string | null;
  low: number;
  typical: number;
  high: number;
  observationCount: number;
  confidence: RateConfidence;
  sourceLabels: string[];
};

export type BoqRateReview = {
  importedRate: number | null;
  reference: RateReference | null;
  workingRate: number | null;
  workingRateSource: RateSource | null;
  status: RateStatus;
  varianceFromTypicalPercent: number | null;
  requiresAttention: boolean;
  note: string;
};

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, " ");
}

function sameLocation(a?: RateLocation | null, b?: RateLocation | null): boolean {
  if (!a || !b) return true;
  const fields: Array<keyof RateLocation> = ["country", "state", "city", "area"];
  return fields.every((field) => {
    const left = String(a[field] ?? "").trim().toLowerCase();
    const right = String(b[field] ?? "").trim().toLowerCase();
    return !left || !right || left === right;
  });
}

export function buildRateReference(
  observations: RateObservation[],
  options: { currency: string; unit: string; location?: RateLocation | null },
): RateReference | null {
  const eligible = observations.filter((observation) =>
    finitePositive(observation.rate) &&
    observation.currency.toUpperCase() === options.currency.toUpperCase() &&
    normalizeUnit(observation.unit) === normalizeUnit(options.unit) &&
    sameLocation(observation.location, options.location),
  );
  if (!eligible.length) return null;

  const rates = eligible.map((item) => item.rate);
  const dates = eligible.map((item) => item.observedAt).filter(Boolean).sort();
  const confidence: RateConfidence = eligible.length >= 5 ? "high" : eligible.length >= 3 ? "medium" : "low";

  return {
    currency: options.currency.toUpperCase(),
    unit: options.unit,
    location: options.location ?? null,
    observedFrom: dates[0] ?? null,
    observedTo: dates.at(-1) ?? null,
    low: roundMoney(percentile(rates, 0.25)),
    typical: roundMoney(median(rates)),
    high: roundMoney(percentile(rates, 0.75)),
    observationCount: eligible.length,
    confidence,
    sourceLabels: [...new Set(eligible.map((item) => item.sourceLabel.trim()).filter(Boolean))],
  };
}

export function reviewBoqRate(input: {
  importedRate?: number | null;
  reference?: RateReference | null;
  selectedRate?: number | null;
  selectedSource?: RateSource | null;
}): BoqRateReview {
  const importedRate = finitePositive(input.importedRate) ? input.importedRate : null;
  const reference = input.reference ?? null;
  const explicitSelected = finitePositive(input.selectedRate) ? input.selectedRate : null;
  const workingRate = explicitSelected ?? importedRate;
  const workingRateSource = explicitSelected !== null
    ? input.selectedSource ?? "manual"
    : importedRate !== null
      ? "imported"
      : null;

  if (workingRate === null) {
    return {
      importedRate,
      reference,
      workingRate: null,
      workingRateSource: null,
      status: "unpriced",
      varianceFromTypicalPercent: null,
      requiresAttention: true,
      note: reference ? "No working rate selected. Review the reference range or enter a rate." : "No rate is available yet.",
    };
  }

  if (!reference || reference.typical <= 0) {
    return {
      importedRate,
      reference,
      workingRate,
      workingRateSource,
      status: "reference_unavailable",
      varianceFromTypicalPercent: null,
      requiresAttention: false,
      note: "Working rate retained. No comparable Charismak reference is available yet.",
    };
  }

  const variance = ((workingRate - reference.typical) / reference.typical) * 100;
  const status: RateStatus = workingRate < reference.low
    ? "below_reference"
    : workingRate > reference.high
      ? "above_reference"
      : "within_reference";

  return {
    importedRate,
    reference,
    workingRate,
    workingRateSource,
    status,
    varianceFromTypicalPercent: Math.round(variance * 10) / 10,
    requiresAttention: status !== "within_reference",
    note: status === "within_reference"
      ? "Working rate sits within the reviewed reference range."
      : status === "below_reference"
        ? "Working rate is below the reviewed reference range. Check scope, supply responsibility and date."
        : "Working rate is above the reviewed reference range. Check scope, location, specification and date.",
  };
}

export function selectWorkingRate(
  current: BoqRateReview,
  selection: { rate: number; source: RateSource },
): BoqRateReview {
  if (!finitePositive(selection.rate)) throw new Error("Working rate must be zero or greater.");
  return reviewBoqRate({
    importedRate: current.importedRate,
    reference: current.reference,
    selectedRate: selection.rate,
    selectedSource: selection.source,
  });
}

export function priceBoqLine(quantity: number, review: BoqRateReview): number | null {
  if (!finitePositive(quantity) || review.workingRate === null) return null;
  return roundMoney(quantity * review.workingRate);
}
