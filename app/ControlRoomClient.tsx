"use client";

import { useMemo, useState, type ComponentProps } from "react";
import DashboardClient from "./DashboardClient";
import styles from "./control-room.module.css";

type DashboardProps = ComponentProps<typeof DashboardClient>;

type CompanyFinance = {
  company_expenses?: number;
  company_income?: number;
  company_financing?: number;
  project_funding?: number;
  project_expenses?: number;
  project_cash_margin?: number;
  cash_basis_operating_result?: number;
  contract_value_recorded?: number;
  project_count?: number;
  unclassified_transactions?: number;
  basis_note?: string;
  company_expense_categories?: Array<{ category: string; amount: number; rows: number }>;
};

type Props = DashboardProps & { companyFinance?: CompanyFinance | null };

const money = (value: number | string | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0,
      }).format(Number(value));

export default function ControlRoomClient(props: Props) {
  const [scope, setScope] = useState("all");
  const selectedProject = useMemo(
    () => props.projects.find((project: any) => project.id === scope) ?? null,
    [props.projects, scope]
  );

  const scopedProjects = scope === "all" ? props.projects : selectedProject ? [selectedProject] : props.projects;
  const scopedProjectIds = new Set(scopedProjects.map((project: any) => project.id));
  const scopedTransactions = scope === "all"
    ? props.transactions
    : props.transactions.filter((row: any) => row.project_id && scopedProjectIds.has(row.project_id));
  const scopedApprovals = scope === "all"
    ? props.approvals
    : props.approvals.filter((row: any) => row.project_id && scopedProjectIds.has(row.project_id));
  const scopedImprests = scope === "all"
    ? props.imprests
    : props.imprests.filter((row: any) => row.project_id && scopedProjectIds.has(row.project_id));
  const scopedCategories = scope === "all"
    ? props.costCategories
    : props.costCategories.filter((row: any) => row.project_id && scopedProjectIds.has(row.project_id));
  const scopedManagerIds = scope === "all"
    ? props.managerProjectIds
    : props.managerProjectIds.filter((id: string) => scopedProjectIds.has(id));

  const finance = props.companyFinance ?? {};
  const topCategories = (finance.company_expense_categories ?? []).slice(0, 5);

  return (
    <>
      <section className={styles.scopePanel} aria-label="Control room scope">
        <div className={styles.scopeIntro}>
          <span>CONTROL ROOM SCOPE</span>
          <strong>{scope === "all" ? "Company / All Projects" : selectedProject?.name ?? "Project"}</strong>
          <small>
            Switch the executive summary between the consolidated company position and any individual project.
          </small>
        </div>

        <div className={styles.scopeControls}>
          <button
            type="button"
            className={scope === "all" ? styles.activeButton : styles.scopeButton}
            onClick={() => setScope("all")}
          >
            All Projects
          </button>
          <select value={scope === "all" ? "" : scope} onChange={(event) => setScope(event.target.value || "all")}>
            <option value="">Choose a project</option>
            {props.projects.map((project: any) => (
              <option key={project.id} value={project.id}>
                {project.project_code} · {project.name}
              </option>
            ))}
          </select>
        </div>

        {scope === "all" ? (
          <div className={styles.financeGrid}>
            <Metric label="Project receipts" value={money(finance.project_funding)} note="Client/project funding received" />
            <Metric label="Direct project costs" value={money(finance.project_expenses)} note="Confirmed project expenses" />
            <Metric label="Company overhead" value={money(finance.company_expenses)} note="General company expenses" />
            <Metric label="Other company income" value={money(finance.company_income)} note="Non-project company income" />
            <Metric
              label="Cash-basis operating result"
              value={money(finance.cash_basis_operating_result)}
              note="Receipts + company income − project costs − overhead"
              strong
            />
          </div>
        ) : selectedProject ? (
          <div className={styles.financeGrid}>
            <Metric label="Client funding" value={money(selectedProject.summary?.funding_received)} note="Confirmed project funding" />
            <Metric label="Direct project costs" value={money(selectedProject.summary?.confirmed_expenditure)} note="Confirmed expenditure" />
            <Metric label="Commitments" value={money(selectedProject.summary?.outstanding_commitments)} note="Approved / outstanding" />
            <Metric label="Cash position" value={money(selectedProject.summary?.cash_balance)} note="Funding less confirmed cost" />
            <Metric
              label="Position after commitments"
              value={money(selectedProject.summary?.funding_surplus_shortfall)}
              note="Project funding position"
              strong
            />
          </div>
        ) : null}

        {scope === "all" && topCategories.length > 0 && (
          <div className={styles.overheadRow}>
            <span>Company overhead breakdown</span>
            <div>
              {topCategories.map((item) => (
                <small key={item.category}>
                  <b>{item.category}</b> {money(item.amount)}
                </small>
              ))}
            </div>
          </div>
        )}

        {scope === "all" && finance.basis_note && <p className={styles.basisNote}>{finance.basis_note}</p>}
      </section>

      <DashboardClient
        {...props}
        projects={scopedProjects}
        transactions={scopedTransactions}
        approvals={scopedApprovals}
        imprests={scopedImprests}
        costCategories={scopedCategories}
        managerProjectIds={scopedManagerIds}
      />
    </>
  );
}

function Metric({ label, value, note, strong = false }: { label: string; value: string; note: string; strong?: boolean }) {
  return (
    <article className={strong ? `${styles.metric} ${styles.metricStrong}` : styles.metric}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </article>
  );
}
