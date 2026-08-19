import type { InterfaceFamily } from "./access";

export type PositionTemplate = {
  code: string;
  name: string;
  interfaceFamily: InterfaceFamily;
  parentCode?: string;
};

export const positionTemplates: PositionTemplate[] = [
  { code: "MD_OWNER", name: "MD / Owner", interfaceFamily: "md" },
  { code: "CFO", name: "Accountant / CFO", interfaceFamily: "finance" },
  { code: "FINANCE_MANAGER", name: "Finance Manager", interfaceFamily: "finance", parentCode: "CFO" },
  { code: "SENIOR_ACCOUNTANT", name: "Senior Accountant", interfaceFamily: "finance", parentCode: "CFO" },
  { code: "ACCOUNTANT", name: "Accountant", interfaceFamily: "finance", parentCode: "CFO" },
  { code: "ACCOUNTS_OFFICER", name: "Accounts Officer", interfaceFamily: "finance", parentCode: "ACCOUNTANT" },
  { code: "CASHIER", name: "Cashier", interfaceFamily: "finance", parentCode: "ACCOUNTANT" },
  { code: "PROJECT_DIRECTOR", name: "Project Director", interfaceFamily: "director" },
  { code: "SENIOR_PROJECT_COORDINATOR", name: "Senior Project Coordinator", interfaceFamily: "director", parentCode: "PROJECT_DIRECTOR" },
  { code: "PROJECT_COORDINATOR", name: "Project Coordinator", interfaceFamily: "director", parentCode: "PROJECT_DIRECTOR" },
  { code: "CONSTRUCTION_MANAGER", name: "Construction Manager", interfaceFamily: "manager" },
  { code: "PROJECT_MANAGER", name: "Project Manager", interfaceFamily: "manager", parentCode: "CONSTRUCTION_MANAGER" },
  { code: "SITE_MANAGER", name: "Site Manager", interfaceFamily: "manager", parentCode: "PROJECT_MANAGER" },
  { code: "SITE_ENGINEER", name: "Site Engineer", interfaceFamily: "manager", parentCode: "PROJECT_MANAGER" },
  { code: "SUPERVISOR", name: "Supervisor", interfaceFamily: "manager", parentCode: "PROJECT_MANAGER" },
  { code: "STOREKEEPER", name: "Storekeeper", interfaceFamily: "manager", parentCode: "PROJECT_MANAGER" },
];

export const permissionCatalog = [
  "company.view",
  "users.manage",
  "projects.view",
  "projects.manage",
  "transactions.view",
  "transactions.create",
  "transactions.confirm",
  "transactions.post",
  "payments.approve",
  "payments.pay",
  "reconciliation.manage",
  "profitability.view",
  "reports.view",
  "reports.export",
  "reports.share_external",
] as const;
