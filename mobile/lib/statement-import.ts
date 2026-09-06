import { sha256 } from "js-sha256";
import * as XLSX from "xlsx";

export type StatementProject = {
  id: string;
  name: string;
  code?: string | null;
  keywords?: string[];
};

export type StatementAccount = {
  id: string;
  institution?: string | null;
  name: string;
  number?: string | null;
};

export type StatementRow = {
  rowIndex: number;
  date: string;
  valueDate: string | null;
  description: string;
  debit: number | null;
  credit: number | null;
  signedAmount: number;
  balance: number | null;
  reference: string;
  fingerprint: string;
};

export type PriorStatementRow = {
  id: string;
  statementKey: string;
  accountId: string;
  date: string;
  signedAmount: number;
  description: string;
  reference: string;
};

export type LinkedFee = {
  row: StatementRow;
  amount: number;
};

export type ProjectStatementItem = {
  row: StatementRow;
  fees: LinkedFee[];
  projectId: string;
  projectName: string;
  kind: "project_expense" | "project_funding" | "company_project_funding";
  category: string | null;
  amount: number;
  reason: string;
};

export type TransferPair = {
  row: StatementRow;
  otherRow: PriorStatementRow;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
};

export type StatementDecision = {
  key: string;
  label: string;
  rows: StatementRow[];
  reason: string;
  suggestedProjectIds: string[];
};

export type StatementAnalysis = {
  statementKey: string;
  rows: StatementRow[];
  projectItems: ProjectStatementItem[];
  transferPairs: TransferPair[];
  waitingTransfers: StatementRow[];
  decisions: StatementDecision[];
  ignoredCount: number;
  mechanicsCount: number;
  duplicateCount: number;
  feeRowsAttached: number;
};

const REQUIRED_HEADERS = ["date", "description", "debit", "credit", "balance"] as const;

const CONSTRUCTION_TERMS: Array<[string, string]> = [
  ["cement", "Materials"], ["block", "Blockwork"], ["sharp sand", "Materials"], ["sand", "Materials"],
  ["granite", "Materials"], ["aggregate", "Materials"], ["reinforcement", "Reinforcement"], ["rebar", "Reinforcement"],
  ["concrete", "Concrete"], ["formwork", "Formwork"], ["excavation", "Earthworks"], ["backfill", "Earthworks"],
  ["tile gum", "Tiling"], ["tile", "Tiling"], ["tiling", "Tiling"], ["white cement", "Tiling"],
  ["paint", "Painting"], ["painting", "Painting"], ["screeding", "Finishes"], ["plaster", "Finishes"],
  ["pop", "Ceiling"], ["ceiling", "Ceiling"], ["suspended ceiling", "Ceiling"], ["gypsum", "Ceiling"],
  ["aluminium", "Aluminium / partitions"], ["aluco", "Aluminium / partitions"], ["partition", "Aluminium / partitions"],
  ["glass", "Glass"], ["door", "Doors"], ["security door", "Doors"], ["window", "Windows"],
  ["electrician", "Electrical"], ["electrical", "Electrical"], ["cable", "Electrical"], ["wiring", "Electrical"],
  ["plumber", "Plumbing"], ["plumbing", "Plumbing"], ["sanitary", "Plumbing"], ["pipe", "Plumbing"],
  ["roof", "Roofing"], ["roofing", "Roofing"], ["scaffold", "Access / scaffolding"],
  ["mason", "Labour"], ["carpenter", "Labour"], ["welder", "Labour"], ["labour", "Labour"],
  ["subcontract", "Subcontractor"], ["artisan", "Labour"], ["mobilization", "Mobilisation"], ["mobilisation", "Mobilisation"],
  ["generator", "Plant / power"], ["diesel", "Plant / power"], ["lowbed", "Site transport"],
  ["site transport", "Site transport"], ["transport to site", "Site transport"], ["clearing", "Earthworks"],
  ["leveling", "Earthworks"], ["levelling", "Earthworks"], ["rubble", "Site operations"],
  ["waterproof", "Waterproofing"], ["landscap", "Landscaping"], ["drain", "Drainage"], ["sewage", "Drainage"],
  ["steel", "Steelwork"], ["fabrication", "Steelwork"], ["welding", "Steelwork"], ["railing", "Steelwork"],
];

const FUND_MOVEMENT_TERMS = [
  "site fund", "site funds", "construction site fund", "construction site funds", "project fund", "project funds",
  "loan to site", "loan to jahi", "loan to coco", "loan to project", "imprest", "site imprest",
];

const FUNDING_TERMS = ["client payment", "advance payment", "mobilization", "mobilisation", "project funding", "site funding", "contract payment"];
const LOAN_TERMS = ["loan to cpnl", "loan to project", "loan to site", "project loan", "site loan"];
const PERSONAL_TERMS = ["drinks", "dinner", "breakfast", "lunch", "food", "bread", "tea", "gift", "airtime", "data", "family support", "upkeep", "pharmacy", "medicine", "paracetamol", "indomie", "beverage", "beverages"];
const MECHANICS_TERMS = ["opening balance", "closing balance", "owealth withdrawal", "auto-save to owealth", "autosave to owealth", "owealth deposit", "owealth interest"];
const FEE_PREFIXES = ["commission ", "vat ", "vat on ", "vat charge ", "stamp duty", "transfer fee", "service charge - transfer"];

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeHeader(value: unknown) {
  return clean(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value).trim();
  if (!text || text === "-" || text === "--") return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[₦,$\s]/g, "").replace(/[()]/g, "");
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function excelDate(serial: number) {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 80000) return excelDate(value);
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const iso = `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : iso;
  }
  const direct = new Date(raw);
  return Number.isNaN(direct.getTime()) ? null : direct.toISOString().slice(0, 10);
}

function dateDistanceDays(a: string, b: string) {
  return Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000;
}

function fingerprint(row: Omit<StatementRow, "fingerprint">) {
  return sha256([row.date, row.reference.trim().toLowerCase(), row.signedAmount.toFixed(2), clean(row.description)].join("|"));
}

function getSheetRows(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The statement has no worksheet.");
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });
}

export function parseStandardStatement(buffer: ArrayBuffer): StatementRow[] {
  const matrix = getSheetRows(buffer);
  if (matrix.length < 2) throw new Error("The statement is empty.");
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`Use the Charismak statement format. Missing column${missing.length === 1 ? "" : "s"}: ${missing.map(x => x[0].toUpperCase() + x.slice(1)).join(", ")}.`);
  }
  const index = (name: string) => headers.indexOf(name);
  const valueDateIndex = index("value date");
  const referenceIndex = index("reference");
  const rows: StatementRow[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const raw = matrix[i] ?? [];
    const date = parseDate(raw[index("date")]);
    const description = String(raw[index("description")] ?? "").trim();
    const debitRaw = parseMoney(raw[index("debit")]);
    const creditRaw = parseMoney(raw[index("credit")]);
    const debit = debitRaw === null ? null : Math.abs(debitRaw);
    const credit = creditRaw === null ? null : Math.abs(creditRaw);
    const balance = parseMoney(raw[index("balance")]);
    if (!date && !description && debit === null && credit === null) continue;
    if (!date) throw new Error(`Row ${i + 1} has no valid Date.`);
    if (!description) throw new Error(`Row ${i + 1} has no Description.`);
    if ((debit === null && credit === null) || (debit !== null && credit !== null && debit > 0 && credit > 0)) {
      throw new Error(`Row ${i + 1} must have an amount in either Debit or Credit, not both.`);
    }
    const signedAmount = credit !== null && credit > 0 ? credit : -Math.abs(debit ?? 0);
    if (signedAmount === 0 && !clean(description).includes("opening balance")) continue;
    const base = {
      rowIndex: i + 1,
      date,
      valueDate: valueDateIndex >= 0 ? parseDate(raw[valueDateIndex]) : null,
      description,
      debit,
      credit,
      signedAmount,
      balance,
      reference: referenceIndex >= 0 ? String(raw[referenceIndex] ?? "").trim() : "",
    };
    rows.push({ ...base, fingerprint: fingerprint(base) });
  }
  if (!rows.length) throw new Error("No transaction rows were found.");
  return rows;
}

export function createStandardStatementTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Date", "Value Date", "Description", "Debit", "Credit", "Balance", "Reference"],
    ["01/09/2026", "01/09/2026", "Example payment for cement", 250000, "", 750000, "REF123"],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Statement");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function includesAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term));
}

function constructionCategory(text: string) {
  for (const [term, category] of CONSTRUCTION_TERMS) if (text.includes(term)) return category;
  return null;
}

function projectMatches(text: string, projects: StatementProject[]) {
  return projects.filter(project => {
    const terms = [project.name, project.code ?? "", ...(project.keywords ?? [])]
      .map(clean)
      .filter(term => term.length >= 3);
    return terms.some(term => text.includes(term));
  });
}

function accountLastDigits(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function mentionedOwnAccount(text: string, sourceAccountId: string, accounts: StatementAccount[]) {
  const candidates = accounts.filter(a => a.id !== sourceAccountId).map(account => {
    const last4 = accountLastDigits(account.number);
    const name = clean(account.name);
    const institution = clean(account.institution);
    const digitHit = last4.length === 4 && text.replace(/\D/g, "").includes(last4);
    const nameHit = name.length >= 5 && text.includes(name);
    const institutionHit = institution.length >= 3 && text.includes(institution);
    return { account, score: digitHit ? 3 : nameHit ? 2 : institutionHit ? 1 : 0 };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return candidates.length && (candidates[0].score >= 2 || candidates.filter(c => c.score === candidates[0].score).length === 1 && candidates[0].score >= 2)
    ? candidates[0].account : null;
}

function isMechanic(text: string) {
  return includesAny(text, MECHANICS_TERMS);
}

function isFee(text: string) {
  return FEE_PREFIXES.some(prefix => text.startsWith(prefix)) || text === "stamp duty" || text.startsWith("fgn stamp duty");
}

function feeBase(text: string) {
  return text
    .replace(/^commission\s+/, "")
    .replace(/^vat\s+(on\s+)?/, "")
    .replace(/^vat charge for\s+/, "")
    .replace(/^service charge -\s+/, "")
    .replace(/^fgn stamp duty.*$/, "")
    .replace(/^stamp duty.*$/, "")
    .trim();
}

function attachFees(rows: StatementRow[]) {
  const fees = new Map<number, LinkedFee[]>();
  const feeIndexes = new Set<number>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const text = clean(row.description);
    if (!isFee(text) || row.signedAmount >= 0) continue;
    const base = feeBase(text);
    let best = -1;
    for (let back = 1; back <= 4 && i - back >= 0; back += 1) {
      const candidate = rows[i - back];
      if (candidate.signedAmount >= 0 || candidate.date !== row.date || isFee(clean(candidate.description))) continue;
      const candidateText = clean(candidate.description);
      if (!base || base.includes(candidateText) || candidateText.includes(base) || overlapWords(base, candidateText) >= 0.65) {
        best = i - back;
        break;
      }
    }
    if (best >= 0) {
      const list = fees.get(best) ?? [];
      list.push({ row, amount: Math.abs(row.signedAmount) });
      fees.set(best, list);
      feeIndexes.add(i);
    }
  }
  return { fees, feeIndexes };
}

function overlapWords(a: string, b: string) {
  const aa = new Set(a.split(/\s+/).filter(w => w.length >= 3));
  const bb = new Set(b.split(/\s+/).filter(w => w.length >= 3));
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const word of aa) if (bb.has(word)) common += 1;
  return common / Math.min(aa.size, bb.size);
}

function crossStatementPair(row: StatementRow, sourceAccountId: string, priorRows: PriorStatementRow[], statementKey: string) {
  const candidates = priorRows.filter(prior => prior.statementKey !== statementKey && prior.accountId !== sourceAccountId && Math.abs(prior.signedAmount + row.signedAmount) < 0.01 && dateDistanceDays(prior.date, row.date) <= 1);
  if (!candidates.length) return null;
  const ranked = candidates.map(prior => ({
    prior,
    score: (row.reference && prior.reference && clean(row.reference) === clean(prior.reference) ? 5 : 0) + overlapWords(clean(row.description), clean(prior.description)) * 3,
  })).sort((a, b) => b.score - a.score);
  if (ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].score < 2) return null;
  return ranked[0].prior;
}

function decisionKey(row: StatementRow) {
  const text = clean(row.description);
  const transfer = text.match(/(?:transfer to|transfer from|\/)([a-z][a-z '\-.]{4,})/i)?.[1]?.trim();
  if (transfer) return transfer.toLowerCase().slice(0, 60);
  const category = constructionCategory(text);
  return category ? `construction:${category}` : "unresolved";
}

function humanDecisionLabel(row: StatementRow) {
  const text = clean(row.description);
  const transfer = row.description.match(/(?:transfer to|transfer from)\s+([^|/]+)/i)?.[1]?.trim();
  if (transfer) return transfer;
  const category = constructionCategory(text);
  return category ? `${category} transactions` : "Other possible project transactions";
}

export function analyseStatement(args: {
  rows: StatementRow[];
  sourceAccount: StatementAccount;
  accounts: StatementAccount[];
  projects: StatementProject[];
  priorRows?: PriorStatementRow[];
  knownFingerprints?: Set<string>;
}): StatementAnalysis {
  const { rows, sourceAccount, accounts, projects, priorRows = [], knownFingerprints = new Set<string>() } = args;
  const statementKey = sha256(`${sourceAccount.id}|${rows.map(r => r.fingerprint).join("|")}`);
  const projectItems: ProjectStatementItem[] = [];
  const transferPairs: TransferPair[] = [];
  const waitingTransfers: StatementRow[] = [];
  const unresolved = new Map<string, StatementDecision>();
  let ignoredCount = 0, mechanicsCount = 0, duplicateCount = 0, feeRowsAttached = 0;
  const { fees, feeIndexes } = attachFees(rows);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (feeIndexes.has(i)) continue;
    if (knownFingerprints.has(row.fingerprint)) { duplicateCount += 1; continue; }
    const text = clean([row.description, row.reference].filter(Boolean).join(" "));
    if (isMechanic(text)) { mechanicsCount += 1; continue; }
    if (isFee(text)) { ignoredCount += 1; continue; }

    const paired = crossStatementPair(row, sourceAccount.id, priorRows, statementKey);
    if (paired) {
      transferPairs.push({
        row,
        otherRow: paired,
        fromAccountId: row.signedAmount < 0 ? sourceAccount.id : paired.accountId,
        toAccountId: row.signedAmount > 0 ? sourceAccount.id : paired.accountId,
        amount: Math.abs(row.signedAmount),
      });
      continue;
    }

    const ownAccount = mentionedOwnAccount(text, sourceAccount.id, accounts);
    if (ownAccount) {
      waitingTransfers.push(row);
      continue;
    }

    const matchedProjects = projectMatches(text, projects);
    const category = constructionCategory(text);
    const isFundMovement = includesAny(text, FUND_MOVEMENT_TERMS);
    const isPersonal = includesAny(text, PERSONAL_TERMS);
    const rowFees = fees.get(i) ?? [];

    if (row.signedAmount < 0 && isFundMovement) {
      waitingTransfers.push(row);
      continue;
    }

    if (matchedProjects.length === 1 && row.signedAmount < 0 && category && !isPersonal) {
      const amount = Math.abs(row.signedAmount) + rowFees.reduce((s, f) => s + f.amount, 0);
      feeRowsAttached += rowFees.length;
      projectItems.push({ row, fees: rowFees, projectId: matchedProjects[0].id, projectName: matchedProjects[0].name, kind: "project_expense", category, amount, reason: `Project name/word and ${category.toLowerCase()} description` });
      continue;
    }

    if (matchedProjects.length === 1 && row.signedAmount > 0 && (includesAny(text, FUNDING_TERMS) || text.includes("fund") || text.includes("payment"))) {
      projectItems.push({ row, fees: [], projectId: matchedProjects[0].id, projectName: matchedProjects[0].name, kind: includesAny(text, LOAN_TERMS) ? "company_project_funding" : "project_funding", category: null, amount: Math.abs(row.signedAmount), reason: "Project name/word and funding description" });
      continue;
    }

    if (!matchedProjects.length && !category && !isFundMovement) {
      ignoredCount += 1;
      continue;
    }

    if (!matchedProjects.length && isPersonal && !category) {
      ignoredCount += 1;
      continue;
    }

    const key = decisionKey(row);
    const current = unresolved.get(key) ?? { key, label: humanDecisionLabel(row), rows: [], reason: matchedProjects.length > 1 ? "More than one project matches" : category ? "Construction-related, but the project is not clear" : "Project-related wording needs a decision", suggestedProjectIds: matchedProjects.map(p => p.id) };
    current.rows.push(row);
    current.suggestedProjectIds = Array.from(new Set([...current.suggestedProjectIds, ...matchedProjects.map(p => p.id)]));
    unresolved.set(key, current);
  }

  return { statementKey, rows, projectItems, transferPairs, waitingTransfers, decisions: Array.from(unresolved.values()), ignoredCount, mechanicsCount, duplicateCount, feeRowsAttached };
}

export function rowsForHistory(statementKey: string, accountId: string, rows: StatementRow[]): PriorStatementRow[] {
  return rows.map(row => ({ id: `${statementKey}:${row.rowIndex}`, statementKey, accountId, date: row.date, signedAmount: row.signedAmount, description: row.description, reference: row.reference }));
}

export function constructionTermsForDisplay() {
  return Array.from(new Set(CONSTRUCTION_TERMS.map(([term]) => term)));
}
