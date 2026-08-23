"use client";

import { useState } from "react";
import { postManualTransaction } from "./actions";

type Project = { id: string; project_code: string; name: string };
type Account = { id: string; institution_name: string | null; account_name: string; current_balance: number | string | null };

const labels: Record<string, { title: string; note: string }> = {
  project_funding: { title: "Project money received", note: "Client or other funding received for a project." },
  company_project_funding: { title: "Company/owner funds received for project", note: "New company or owner money received into this account for the selected project." },
  project_expense: { title: "Project expense", note: "Materials, labour, subcontractor or another direct project payment." },
  company_expense: { title: "Company expense / overhead", note: "Office, administration, tendering, subscriptions or other company cost." },
  company_income: { title: "Other company income", note: "Income that is not project funding." },
  company_financing: { title: "Company loan / financing received", note: "Owner loan, external loan or another financing inflow." },
  project_advance: { title: "Site advance / imprest", note: "Money issued for later retirement. It is not treated as expense yet." },
  reimbursement: { title: "Reimbursement paid", note: "Repayment of an already incurred project or company expense." },
  personal_non_business: { title: "Personal / non-business payment", note: "Recorded separately so it does not become company or project expense." },
};

export default function ManualTransactionForm({ requestKey, projects, accounts, categories }: { requestKey: string; projects: Project[]; accounts: Account[]; categories: string[] }) {
  const [kind, setKind] = useState("project_expense");
  const projectRequired = ["project_funding", "company_project_funding", "project_expense", "project_advance"].includes(kind);
  const projectAllowed = projectRequired || kind === "reimbursement";
  const expenseCategory = ["project_expense", "company_expense", "reimbursement"].includes(kind);
  const funding = kind === "project_funding";
  const selected = labels[kind];

  return <form action={postManualTransaction} className="project-edit-form" style={{ marginTop: 0 }}>
    <input type="hidden" name="request_key" value={requestKey} />
    <div className="project-info-heading">What happened?</div>
    <label className="wide">Record type
      <select name="entry_kind" value={kind} onChange={(event) => setKind(event.target.value)}>
        {Object.entries(labels).map(([value, item]) => <option key={value} value={value}>{item.title}</option>)}
      </select>
      <small>{selected.note}</small>
    </label>
    <label>Transaction date<input name="transaction_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
    <label>Amount (₦)<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label>
    <label>Financial account
      <select name="account_id" required defaultValue="">
        <option value="" disabled>Select where the money moved</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.institution_name || "Account"} · {account.account_name}</option>)}
      </select>
    </label>
    {projectAllowed && <label>Project {projectRequired ? "" : "(optional)"}
      <select name="project_id" required={projectRequired} defaultValue="">
        <option value="">{projectRequired ? "Select project" : "Company-level reimbursement"}</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
      </select>
    </label>}
    {funding && <label>Funding source
      <select name="funding_source" defaultValue="client"><option value="client">Client</option><option value="other">Other external source</option></select>
    </label>}
    <label className="wide">Description<input name="narration" placeholder="Example: Cement and delivery for Jahi" required /></label>
    <label>Paid to / received from<input name="counterparty" placeholder="Supplier, client or person" /></label>
    <label>Reference<input name="reference" placeholder="Receipt, transfer or invoice reference" /></label>
    {(expenseCategory || kind === "project_advance") && <label className="wide">Category
      <input name="category" list="manual-categories" placeholder={kind === "project_advance" ? "Site advance / imprest" : "Materials, Labour, Transport…"} required={expenseCategory} />
      <datalist id="manual-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
    </label>}
    <label className="wide">Internal note <small>Optional</small><textarea name="notes" rows={2} placeholder="Reason, supporting detail or who approved it" /></label>
    <button type="submit" disabled={!accounts.length}>Record and post accounting</button>
  </form>;
}
