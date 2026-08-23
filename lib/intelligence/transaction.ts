export const TRANSACTION_INTELLIGENCE_VERSION = "charismak-ti-v1";

export const POSTABLE_CLASSIFICATIONS = [
  "project_expense",
  "project_funding",
  "company_expense",
  "company_income",
  "company_financing",
  "personal_non_business",
  "internal_transfer",
] as const;

export const REVIEW_ONLY_CLASSIFICATIONS = [
  "project_advance",
  "project_reimbursement",
  "inter_project_transfer",
  "unknown",
] as const;

export type PostableClassification = (typeof POSTABLE_CLASSIFICATIONS)[number];
export type IntelligenceClassification =
  | PostableClassification
  | (typeof REVIEW_ONLY_CLASSIFICATIONS)[number];

export type IntelligenceRow = {
  rowId: string;
  transactionDate: string | null;
  narration: string | null;
  counterparty: string | null;
  reference: string | null;
  signedAmount: number | null;
  bestProjectId?: string | null;
  bestProjectConfidence?: number | null;
};

export type IntelligenceProject = {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  clientName?: string | null;
  relationshipTerms: string[];
};

export type IntelligenceAccount = {
  institutionName?: string | null;
  accountName: string;
  accountNumber?: string | null;
  aliases?: string[];
};

export type ModelProposal = {
  rowId: string;
  classification: IntelligenceClassification;
  projectCode: string | null;
  sourceProjectCode?: string | null;
  destinationProjectCode?: string | null;
  category: string | null;
  fundingSource: "client" | "company" | "other" | null;
  confidence: number;
  explanation: string;
  evidence: string[];
};

export type ValidatedProposal = ModelProposal & {
  projectId: string | null;
  classification: IntelligenceClassification;
  accountingConfidence: number;
  autoPostEligible: boolean;
  status: "validated" | "needs_review";
  guardReasons: string[];
  deterministicOverride: boolean;
};

const normal = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const containsPhrase = (haystack: string, needle: string) => {
  const h = ` ${normal(haystack)} `;
  const n = normal(needle);
  return n.length >= 3 && h.includes(` ${n} `);
};

function projectTerms(project: IntelligenceProject) {
  return Array.from(
    new Set(
      [project.code, project.name, project.clientName, ...project.aliases, ...project.relationshipTerms]
        .map(normal)
        .filter((term) => term.length >= 3),
    ),
  );
}

function projectsMentioned(text: string, projects: IntelligenceProject[]) {
  return projects.filter((project) => projectTerms(project).some((term) => containsPhrase(text, term)));
}

function ownAccountSignal(text: string, accounts: IntelligenceAccount[]) {
  const bankContext = /\b(transfer|payment|sent|received|bank|wallet|account|acct|access|uba|opay|carbon|gtbank|zenith)\b/i.test(text);
  if (!bankContext) return false;
  return accounts.some((account) => {
    const identityTerms = [account.accountName, ...(account.aliases ?? [])]
      .map(normal)
      .filter((term) => term.length >= 6);
    const digits = String(account.accountNumber ?? "").replace(/\D/g, "");
    return identityTerms.some((term) => containsPhrase(text, term)) || (digits.length >= 6 && text.replace(/\D/g, "").includes(digits));
  });
}

const isPostable = (value: IntelligenceClassification): value is PostableClassification =>
  (POSTABLE_CLASSIFICATIONS as readonly string[]).includes(value);

export function validateModelProposal(input: {
  row: IntelligenceRow;
  proposal: ModelProposal;
  projects: IntelligenceProject[];
  accounts: IntelligenceAccount[];
  minimumConfidence?: number;
}): ValidatedProposal {
  const { row, proposal, projects, accounts } = input;
  const minimumConfidence = input.minimumConfidence ?? 96;
  const text = `${row.counterparty ?? ""} ${row.narration ?? ""} ${row.reference ?? ""}`;
  const mentioned = projectsMentioned(text, projects);
  const selected = proposal.projectCode
    ? projects.find((project) => normal(project.code) === normal(proposal.projectCode)) ?? null
    : null;
  const reasons: string[] = [];
  let classification = proposal.classification;
  let projectId = selected?.id ?? null;
  let deterministicOverride = false;

  if (ownAccountSignal(text, accounts)) {
    classification = "internal_transfer";
    projectId = null;
    deterministicOverride = true;
    reasons.push("Known own-account identity overrides the model: treat as an internal transfer.");
  }

  if (mentioned.length > 1) {
    classification = "inter_project_transfer";
    projectId = null;
    deterministicOverride = true;
    reasons.push("More than one project is explicitly mentioned; inter-project treatment needs review.");
  }

  const amount = row.signedAmount;
  if (amount === null || !Number.isFinite(amount)) reasons.push("A valid signed amount is required.");
  if (!row.transactionDate) reasons.push("A valid transaction date is required.");

  if (["project_expense", "project_funding"].includes(classification) && !projectId) {
    reasons.push("A project classification requires one identified project.");
  }
  if (classification === "project_expense" && amount !== null && amount >= 0) {
    reasons.push("Money in cannot be auto-posted as a project expense.");
  }
  if (classification === "project_funding" && amount !== null && amount <= 0) {
    reasons.push("Money out cannot be auto-posted as project funding.");
  }
  if (["company_expense"].includes(classification) && amount !== null && amount >= 0) {
    reasons.push("Money in cannot be auto-posted as a company expense.");
  }
  if (["company_income", "company_financing"].includes(classification) && amount !== null && amount <= 0) {
    reasons.push("Money out cannot be auto-posted as company income or financing.");
  }
  if (["project_expense", "company_expense"].includes(classification) && !normal(proposal.category)) {
    reasons.push("Expense classification requires a cost category.");
  }

  const selectedExplicitlySupported = Boolean(
    selected &&
      (mentioned.some((project) => project.id === selected.id) ||
        (row.bestProjectId === selected.id && Number(row.bestProjectConfidence ?? 0) >= 94)),
  );
  if (["project_expense", "project_funding"].includes(classification) && !selectedExplicitlySupported) {
    reasons.push("The selected project is not supported by an explicit narration, relationship, or high-confidence project match.");
  }

  if (["company_expense", "company_income", "company_financing"].includes(classification) && !/\b(cpnl|charismak|company|business|office|tender|subscription|admin(?:istration)?)\b/i.test(text)) {
    reasons.push("Company-level classification lacks explicit company or established business context.");
  }
  if (classification === "personal_non_business" && !/\b(personal|private|tip|salary|school|family|wife|child|gift)\b/i.test(text)) {
    reasons.push("Personal classification lacks explicit personal context.");
  }
  if (classification === "internal_transfer" && !deterministicOverride) {
    reasons.push("Internal transfer requires a deterministic match to a known owned account.");
  }

  if (/\b(loan|advance|imprest|retire(?:ment)?|reimburse(?:ment)?|refund|site funds?)\b/i.test(text) && classification === "project_expense") {
    reasons.push("Advance, imprest, loan, refund or retirement wording needs balance-sheet/reconciliation review before expense posting.");
  }

  if (!isPostable(classification)) reasons.push("This accounting meaning requires a specialised review workflow before posting.");
  if (proposal.confidence < minimumConfidence && !deterministicOverride) {
    reasons.push(`Model confidence is below the ${minimumConfidence}% automatic-posting threshold.`);
  }

  const hardGuardCount = reasons.length;
  const accountingConfidence = deterministicOverride && classification === "internal_transfer"
    ? 99
    : Math.max(0, Math.min(100, Math.round(proposal.confidence - hardGuardCount * 8)));
  const autoPostEligible = isPostable(classification) && reasons.length === 0 && accountingConfidence >= minimumConfidence;

  return {
    ...proposal,
    classification,
    projectId,
    accountingConfidence,
    autoPostEligible,
    status: autoPostEligible ? "validated" : "needs_review",
    guardReasons: reasons,
    deterministicOverride,
  };
}
