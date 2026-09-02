import type { MaterialSummaryRow, SectionedBoq } from "./sectioned-boq";
import { summarizeMaterials } from "./sectioned-boq";

export type WorkingRateSource = "imported" | "manual" | "reference" | null;
export type WorkingRateDecision = { rate: number | null; source: WorkingRateSource };
export type WorkingRateMap = Record<string, WorkingRateDecision>;

export type EstimateCommercialSettings = {
  contingencyPercent: number;
  overheadPercent: number;
  profitPercent: number;
  discountPercent: number;
  taxPercent: number;
};

export type EstimateSummaryLine = {
  sectionId: string;
  sectionTitle: string;
  itemId: string;
  itemNo?: string;
  description: string;
  quantity: number;
  unit: string;
  workingRate: number | null;
  workingRateSource: WorkingRateSource;
  amount: number | null;
};

export type EstimateSectionSummary = {
  sectionId: string;
  title: string;
  pricedAmount: number;
  unpricedItems: number;
};

export type EstimateSummary = {
  currency: string;
  directCost: number;
  contingency: number;
  overhead: number;
  profit: number;
  discount: number;
  subtotalBeforeTax: number;
  tax: number;
  grandTotal: number;
  unpricedItems: number;
  isCommercialTotalComplete: boolean;
  settings: EstimateCommercialSettings;
  lines: EstimateSummaryLine[];
  sections: EstimateSectionSummary[];
  materials: MaterialSummaryRow[];
};

export const ZERO_COMMERCIAL_SETTINGS: EstimateCommercialSettings = {
  contingencyPercent: 0,
  overheadPercent: 0,
  profitPercent: 0,
  discountPercent: 0,
  taxPercent: 0,
};

const pct = (value: number) => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : 0;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function initialWorkingRates(boq: SectionedBoq): WorkingRateMap {
  return Object.fromEntries(boq.sections.flatMap(section => section.items.map(item => [item.id, {
    rate: item.rate ?? null,
    source: item.rate == null ? null : "imported" as const,
  }])));
}

export function buildEstimateSummary(input: {
  boq: SectionedBoq;
  workingRates?: WorkingRateMap;
  materializedBoq?: SectionedBoq | null;
  settings?: Partial<EstimateCommercialSettings>;
}): EstimateSummary {
  const settings: EstimateCommercialSettings = { ...ZERO_COMMERCIAL_SETTINGS, ...(input.settings ?? {}) };
  const rates = input.workingRates ?? initialWorkingRates(input.boq);
  const lines: EstimateSummaryLine[] = [];
  const sections: EstimateSectionSummary[] = [];

  for (const section of input.boq.sections) {
    let pricedAmount = 0;
    let unpricedItems = 0;
    for (const item of section.items) {
      const decision = rates[item.id] ?? { rate: item.rate ?? null, source: item.rate == null ? null : "imported" as const };
      const rate = decision.rate != null && Number.isFinite(decision.rate) && decision.rate >= 0 ? decision.rate : null;
      const amount = rate == null ? null : roundMoney(item.quantity * rate);
      if (amount == null) unpricedItems += 1;
      else pricedAmount += amount;
      lines.push({
        sectionId: section.id,
        sectionTitle: section.title,
        itemId: item.id,
        itemNo: item.itemNo,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        workingRate: rate,
        workingRateSource: rate == null ? null : decision.source,
        amount,
      });
    }
    sections.push({ sectionId: section.id, title: section.title, pricedAmount: roundMoney(pricedAmount), unpricedItems });
  }

  const directCost = roundMoney(lines.reduce((sum, line) => sum + (line.amount ?? 0), 0));
  const contingency = roundMoney(directCost * pct(settings.contingencyPercent));
  const costWithContingency = directCost + contingency;
  const overhead = roundMoney(costWithContingency * pct(settings.overheadPercent));
  const preProfit = costWithContingency + overhead;
  const profit = roundMoney(preProfit * pct(settings.profitPercent));
  const grossBeforeDiscount = preProfit + profit;
  const discount = roundMoney(grossBeforeDiscount * pct(settings.discountPercent));
  const subtotalBeforeTax = roundMoney(grossBeforeDiscount - discount);
  const tax = roundMoney(subtotalBeforeTax * pct(settings.taxPercent));
  const grandTotal = roundMoney(subtotalBeforeTax + tax);
  const unpricedItems = lines.filter(line => line.amount == null).length;

  return {
    currency: input.boq.currency,
    directCost,
    contingency,
    overhead,
    profit,
    discount,
    subtotalBeforeTax,
    tax,
    grandTotal,
    unpricedItems,
    isCommercialTotalComplete: unpricedItems === 0,
    settings,
    lines,
    sections,
    materials: summarizeMaterials(input.materializedBoq ?? input.boq),
  };
}

const escHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));
const escXml = (value: unknown) => escHtml(value).replace(/'/g, "&apos;");
const fmt = (value: number) => value.toLocaleString("en-NG", { maximumFractionDigits: 3 });
const money = (value: number, currency: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export function buildEstimatePrintHtml(input: { boq: SectionedBoq; summary: EstimateSummary; companyName?: string; projectName?: string }): string {
  const { boq, summary } = input;
  const companyName = input.companyName?.trim() || "Charismak App Estimate";
  const projectName = input.projectName?.trim() || boq.name;
  const rows = summary.lines.map(line => `<tr><td>${escHtml(line.sectionTitle)}</td><td>${escHtml(line.itemNo || "")}</td><td>${escHtml(line.description)}</td><td class="n">${fmt(line.quantity)} ${escHtml(line.unit)}</td><td class="n">${line.workingRate == null ? "—" : money(line.workingRate, summary.currency)}</td><td class="n">${line.amount == null ? "UNPRICED" : money(line.amount, summary.currency)}</td></tr>`).join("");
  const materials = summary.materials.map(row => `<tr><td>${escHtml(row.material)}</td><td>${escHtml(row.unit)}</td><td class="n">${fmt(row.quantity)}</td><td class="n">${row.sourceItems.length}</td></tr>`).join("");
  const warning = summary.unpricedItems ? `<div class="warning">${summary.unpricedItems} BOQ item${summary.unpricedItems === 1 ? " is" : "s are"} still unpriced. Commercial totals are provisional until all required rates are confirmed.</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(projectName)} Estimate</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#173f5a;font-size:10px}h1{font-size:21px;margin:0}h2{font-size:14px;margin:18px 0 7px}.muted{color:#6b7f8e}.hero{border-bottom:3px solid #0b668f;padding-bottom:12px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:14px 0}.card{border:1px solid #dbe6ec;border-radius:7px;padding:8px}.label{font-size:8px;color:#718391;text-transform:uppercase}.value{font-size:14px;font-weight:700;margin-top:3px}.warning{background:#fff4ce;color:#775c18;padding:8px;border-radius:6px;margin:10px 0}table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#edf4f8;text-align:left;font-size:8px;text-transform:uppercase}th,td{padding:5px;border-bottom:1px solid #e7edf1;vertical-align:top}.n{text-align:right;white-space:nowrap}.commercial{width:55%;margin-left:auto}.commercial td:first-child{font-weight:700}.grand td{font-size:13px;font-weight:700;border-top:2px solid #173f5a}.foot{margin-top:18px;font-size:8px;color:#718391}</style></head><body><div class="hero"><div class="muted">${escHtml(companyName)}</div><h1>${escHtml(projectName)}</h1><div class="muted">Reviewed estimate summary · ${escHtml(summary.currency)}</div></div>${warning}<div class="summary"><div class="card"><div class="label">Direct Cost</div><div class="value">${money(summary.directCost, summary.currency)}</div></div><div class="card"><div class="label">Materials Identified</div><div class="value">${summary.materials.length}</div></div><div class="card"><div class="label">Client Price / Grand Total</div><div class="value">${money(summary.grandTotal, summary.currency)}</div></div></div><h2>Commercial Summary</h2><table class="commercial"><tr><td>Direct Cost</td><td class="n">${money(summary.directCost, summary.currency)}</td></tr><tr><td>Contingency (${summary.settings.contingencyPercent}%)</td><td class="n">${money(summary.contingency, summary.currency)}</td></tr><tr><td>Overhead (${summary.settings.overheadPercent}%)</td><td class="n">${money(summary.overhead, summary.currency)}</td></tr><tr><td>Profit (${summary.settings.profitPercent}%)</td><td class="n">${money(summary.profit, summary.currency)}</td></tr><tr><td>Discount (${summary.settings.discountPercent}%)</td><td class="n">-${money(summary.discount, summary.currency)}</td></tr><tr><td>Subtotal before tax</td><td class="n">${money(summary.subtotalBeforeTax, summary.currency)}</td></tr><tr><td>Tax / VAT (${summary.settings.taxPercent}%)</td><td class="n">${money(summary.tax, summary.currency)}</td></tr><tr class="grand"><td>Grand Total</td><td class="n">${money(summary.grandTotal, summary.currency)}</td></tr></table><h2>Priced BOQ</h2><table><thead><tr><th>Section</th><th>Item</th><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table><h2>Material Schedule</h2><table><thead><tr><th>Material</th><th>Unit</th><th class="n">Quantity</th><th class="n">BOQ Sources</th></tr></thead><tbody>${materials || `<tr><td colspan="4">No reviewed material quantities are available yet.</td></tr>`}</tbody></table><div class="foot">Formula order: Direct Cost → Contingency → Overhead → Profit → Discount → Tax/VAT. Export is a reviewed estimate snapshot and does not post to Accounting or set an internal project budget.</div></body></html>`;
}

function xmlCell(value: unknown, type: "String" | "Number" = "String") {
  return `<Cell><Data ss:Type="${type}">${escXml(value)}</Data></Cell>`;
}
function xmlRow(values: Array<[unknown, "String" | "Number"?]>) {
  return `<Row>${values.map(([value, type]) => xmlCell(value, type ?? "String")).join("")}</Row>`;
}

export function buildEstimateSpreadsheetXml(input: { boq: SectionedBoq; summary: EstimateSummary }): string {
  const { boq, summary } = input;
  const summaryRows = [
    ["Estimate", boq.name], ["Currency", summary.currency], ["Direct Cost", summary.directCost], ["Contingency %", summary.settings.contingencyPercent], ["Contingency", summary.contingency], ["Overhead %", summary.settings.overheadPercent], ["Overhead", summary.overhead], ["Profit %", summary.settings.profitPercent], ["Profit", summary.profit], ["Discount %", summary.settings.discountPercent], ["Discount", summary.discount], ["Subtotal Before Tax", summary.subtotalBeforeTax], ["Tax / VAT %", summary.settings.taxPercent], ["Tax / VAT", summary.tax], ["Grand Total", summary.grandTotal], ["Unpriced Items", summary.unpricedItems],
  ].map(([label, value]) => xmlRow([[label], [value, typeof value === "number" ? "Number" : "String"]])).join("");
  const boqRows = [xmlRow([["Section"], ["Item No"], ["Description"], ["Quantity"], ["Unit"], ["Working Rate"], ["Rate Source"], ["Amount"]]), ...summary.lines.map(line => xmlRow([[line.sectionTitle], [line.itemNo ?? ""], [line.description], [line.quantity, "Number"], [line.unit], [line.workingRate ?? "" , line.workingRate == null ? "String" : "Number"], [line.workingRateSource ?? ""], [line.amount ?? "", line.amount == null ? "String" : "Number"]]))].join("");
  const materialRows = [xmlRow([["Material"], ["Unit"], ["Quantity"], ["BOQ Source Count"]]), ...summary.materials.map(row => xmlRow([[row.material], [row.unit], [row.quantity, "Number"], [row.sourceItems.length, "Number"]]))].join("");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Estimate Summary"><Table>${summaryRows}</Table></Worksheet><Worksheet ss:Name="Priced BOQ"><Table>${boqRows}</Table></Worksheet><Worksheet ss:Name="Materials"><Table>${materialRows}</Table></Worksheet></Workbook>`;
}
