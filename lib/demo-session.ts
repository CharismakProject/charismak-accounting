import type { SessionUser } from "./access";

export const demoSessionUser: SessionUser = {
  id: "demo-md",
  name: "Christopher Akinola",
  email: "md@charismakproject.com",
  companyId: "demo-charismak",
  companyName: "Charismak Project Nigeria Limited",
  positions: [
    {
      code: "MD",
      name: "Managing Director",
      interfaceFamily: "md",
    },
    {
      code: "PROJECT_DIRECTOR",
      name: "Project Director",
      interfaceFamily: "director",
    },
  ],
  grants: [
    { code: "company.view", scope: "company_wide" },
    { code: "users.manage", scope: "company_wide" },
    { code: "projects.view", scope: "company_wide" },
    { code: "projects.manage", scope: "company_wide" },
    { code: "transactions.view", scope: "company_wide" },
    { code: "transactions.create", scope: "company_wide" },
    { code: "transactions.confirm", scope: "company_wide" },
    { code: "transactions.post", scope: "company_wide" },
    {
      code: "payments.approve",
      scope: "company_wide",
      approvalLimit: 1000000000,
    },
    {
      code: "payments.pay",
      scope: "company_wide",
      paymentLimit: 1000000000,
    },
    { code: "reconciliation.manage", scope: "company_wide" },
    { code: "profitability.view", scope: "company_wide" },
    { code: "reports.view", scope: "company_wide" },
    { code: "reports.export", scope: "company_wide" },
    { code: "reports.share_external", scope: "company_wide" },
  ],
};

export const demoFinanceUser: SessionUser = {
  id: "demo-cfo",
  name: "Demo CFO",
  email: "cfo@example.com",
  companyId: "demo-charismak",
  companyName: "Charismak Project Nigeria Limited",
  positions: [
    {
      code: "CFO",
      name: "Chief Financial Officer",
      interfaceFamily: "finance",
    },
  ],
  grants: [
    { code: "company.view", scope: "company_wide" },
    { code: "projects.view", scope: "company_wide" },
    { code: "transactions.view", scope: "company_wide" },
    { code: "transactions.create", scope: "company_wide" },
    { code: "transactions.confirm", scope: "company_wide" },
    { code: "transactions.post", scope: "company_wide" },
    {
      code: "payments.approve",
      scope: "company_wide",
      approvalLimit: 5000000,
    },
    {
      code: "payments.pay",
      scope: "company_wide",
      paymentLimit: 5000000,
    },
    { code: "reconciliation.manage", scope: "company_wide" },
    { code: "reports.view", scope: "company_wide" },
    { code: "reports.export", scope: "company_wide" },
  ],
};
