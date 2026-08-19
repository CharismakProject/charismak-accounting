import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import RoleSwitcher, { type RoleFamily } from "./RoleSwitcher";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";
const allFamilies: RoleFamily[] = ["md_owner", "accountant_cfo", "project_director", "project_manager"];
const money = (value: number | string | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));

export default async function Home() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("company_memberships").select("id, company_id, is_owner, status").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) {
    await supabase.auth.signOut();
    redirect("/login?message=Please+sign+in+with+your+company+account");
  }

  const [{ data: company }, { data: positionRows }, { data: preference }, { data: assignments }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle(),
    supabase.from("membership_positions").select("is_primary, position:positions(code,name,interface_family)").eq("membership_id", membership.id),
    supabase.from("user_interface_preferences").select("active_interface").eq("company_id", membership.company_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("project_assignments").select("project_id, assignment_role, can_view_cost, can_request, can_approve").eq("membership_id", membership.id),
  ]);

  const assignedFamilies = Array.from(new Set((positionRows ?? []).map((row: any) => row.position?.interface_family).filter(Boolean))) as RoleFamily[];
  const available = membership.is_owner ? allFamilies : assignedFamilies.length ? assignedFamilies : (["project_manager"] as RoleFamily[]);
  const preferred = preference?.active_interface as RoleFamily | undefined;
  const active: RoleFamily = preferred && available.includes(preferred) ? preferred : membership.is_owner ? "md_owner" : available[0];
  const primaryRow: any = (positionRows ?? []).find((row: any) => row.is_primary) ?? (positionRows ?? [])[0];
  const signedInRole = membership.is_owner ? "MD / Owner" : primaryRow?.position?.name ?? "Company member";

  const assignedIds = (assignments ?? []).map((row: any) => row.project_id);
  let projectQuery = supabase
    .from("projects")
    .select("id, project_code, name, location, status, progress_percent, contract_value, internal_cost_budget, project_image_path, summary:project_financial_summaries(funding_received, confirmed_expenditure, cash_balance, outstanding_commitments, funding_surplus_shortfall, revised_budget, forecast_cost_to_complete, forecast_final_cost, expected_contract_revenue, forecast_profit)")
    .eq("company_id", membership.company_id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (!membership.is_owner && active === "project_manager") {
    if (!assignedIds.length) projectQuery = projectQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    else projectQuery = projectQuery.in("id", assignedIds);
  }

  const [projectResult, accountResult, approvalResult, statementResult, transactionResult, imprestResult, auditResult] = await Promise.all([
    projectQuery,
    supabase.from("financial_accounts").select("id, institution_name, account_name, account_type, current_balance, balance_as_of").eq("company_id", membership.company_id).eq("is_active", true).order("institution_name"),
    supabase.from("approval_requests").select("id, project_id, request_type, description, amount, status, urgency, requested_at").eq("company_id", membership.company_id).order("requested_at", { ascending: false }).limit(20),
    supabase.from("statement_imports").select("id, detected_institution_name, detected_account_name, status, rows_total, rows_new, rows_already_known, rows_need_review, imported_at").eq("company_id", membership.company_id).order("imported_at", { ascending: false }).limit(10),
    supabase.from("canonical_transactions").select("id, project_id, signed_amount, classification, status, transaction_date, narration, category_name").eq("company_id", membership.company_id).order("transaction_date", { ascending: false }).limit(20),
    supabase.from("imprest_accounts").select("id, project_id, name, approved_limit, current_balance, status").in("project_id", assignedIds.length ? assignedIds : ["00000000-0000-0000-0000-000000000000"]).eq("status", "active"),
    membership.is_owner ? supabase.from("audit_log").select("id, actor_email, acting_interface, action, entity_type, created_at").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] } as any),
  ]);

  const projects = (projectResult.data ?? []).map((project: any) => ({ ...project, summary: Array.isArray(project.summary) ? project.summary[0] : project.summary }));
  const accounts = accountResult.data ?? [];
  const approvals = approvalResult.data ?? [];
  const statements = statementResult.data ?? [];
  const transactions = transactionResult.data ?? [];
  const imprests = imprestResult.data ?? [];
  const auditRows = auditResult.data ?? [];

  const totals = projects.reduce((acc, project: any) => {
    acc.funding += Number(project.summary?.funding_received ?? 0);
    acc.expenditure += Number(project.summary?.confirmed_expenditure ?? 0);
    acc.cash += Number(project.summary?.cash_balance ?? 0);
    acc.commitments += Number(project.summary?.outstanding_commitments ?? 0);
    acc.budget += Number(project.summary?.revised_budget ?? project.internal_cost_budget ?? 0);
    acc.forecastProfit += Number(project.summary?.forecast_profit ?? 0);
    acc.ctc += Number(project.summary?.forecast_cost_to_complete ?? 0);
    return acc;
  }, { funding: 0, expenditure: 0, cash: 0, commitments: 0, budget: 0, forecastProfit: 0, ctc: 0 });
  const bankCash = accounts.reduce((sum: number, account: any) => sum + Number(account.current_balance ?? 0), 0);
  const pendingApprovals = approvals.filter((row: any) => ["pending", "emergency_retrospective"].includes(row.status));
  const unclassifiedEstimate = Math.max(statements.reduce((sum: number, row: any) => sum + Number(row.rows_new ?? 0), 0) - transactions.length, 0);
  const roleAccent = active === "accountant_cfo" ? "finance" : active === "project_director" ? "director" : active === "project_manager" ? "manager" : "md";

  return (
    <main className={`role-shell role-${roleAccent}-shell`}>
      <aside className="role-sidebar">
        <div className="md-brand"><img src={LOGO_URL} alt="Charismak Accounting" /><div><b>ACCOUNTING</b><span>{company?.name ?? "Company"}</span></div></div>
        <RoleSwitcher companyId={membership.company_id} active={active} available={available} />
        <div className="role-signed-in"><small>SIGNED IN AS</small><b>{signedInRole}</b><span>{user.email}</span></div>
        <RoleNav active={active} owner={membership.is_owner} />
        <div className="role-truth">✓ Track the truth<br/><span>Every movement. Every project.</span></div>
      </aside>

      <section className="role-main">
        <div className="role-mobile-top">
          <div className="role-mobile-brand"><img src={LOGO_URL} alt="" /><b>Accounting</b></div>
          <RoleSwitcher companyId={membership.company_id} active={active} available={available} />
        </div>

        {active === "md_owner" && <MdDashboard projects={projects} totals={totals} bankCash={bankCash} approvals={pendingApprovals} accounts={accounts} statements={statements} auditRows={auditRows} />}
        {active === "accountant_cfo" && <FinanceDashboard accounts={accounts} bankCash={bankCash} statements={statements} approvals={pendingApprovals} transactions={transactions} unclassifiedEstimate={unclassifiedEstimate} />}
        {active === "project_director" && <DirectorDashboard projects={projects} totals={totals} approvals={pendingApprovals} />}
        {active === "project_manager" && <ManagerDashboard projects={projects} approvals={pendingApprovals} transactions={transactions} imprests={imprests} ownerView={membership.is_owner} />}
      </section>
    </main>
  );
}

function RoleNav({ active, owner }: { active: RoleFamily; owner: boolean }) {
  const common = [<Link key="projects" href="/projects">Projects</Link>, <Link key="statements" href="/statements">Transactions & Statements</Link>, <Link key="upload" href="/statements/upload">Upload Statements</Link>];
  if (active === "md_owner") return <nav className="role-nav"><Link className="active" href="/">Executive</Link>{common}<Link href="/treasury">Treasury</Link><Link href="/approvals">Approvals</Link>{owner && <Link href="/admin/access">People & Access</Link>}<Link href="/audit">Audit Trail</Link></nav>;
  if (active === "accountant_cfo") return <nav className="role-nav"><Link className="active" href="/">Finance Home</Link>{common}<Link href="/treasury">Banking & Treasury</Link><Link href="/approvals">Payments & Approvals</Link><Link href="/audit">Reconciliation / Audit</Link></nav>;
  if (active === "project_director") return <nav className="role-nav"><Link className="active" href="/">Portfolio</Link><Link href="/projects">Cost Control</Link><Link href="/approvals">Commitments & Approvals</Link><Link href="/statements">Transactions</Link><Link href="/audit">Reports & Audit</Link></nav>;
  return <nav className="role-nav"><Link className="active" href="/">My Project</Link><Link href="/projects">Site & Project</Link><Link href="/approvals">Requests</Link><Link href="/statements">Expenses</Link><Link href="/statements/upload">Upload Evidence / Statement</Link></nav>;
}

function MdDashboard({ projects, totals, bankCash, approvals, accounts, statements, auditRows }: any) {
  const riskProjects = projects.filter((p: any) => Number(p.summary?.funding_surplus_shortfall ?? 0) < 0 || Number(p.summary?.forecast_profit ?? 0) < 0 || p.status === "on_hold");
  return <>
    <DashboardHeader eyebrow="Executive overview" title="Company Control Room" subtitle="Cash, portfolio risk, profitability, approvals and activity across the company." />
    <div className="role-content">
      <section className="role-kpis role-kpis-5">
        <Kpi label="Bank / wallet cash" value={money(bankCash)} note={`${accounts.length} financial account(s)`} />
        <Kpi label="Project funding" value={money(totals.funding)} note={`${projects.length} active/open projects`} />
        <Kpi label="Confirmed expenditure" value={money(totals.expenditure)} note="Posted/confirmed project cost" />
        <Kpi label="Commitments" value={money(totals.commitments)} note={`${approvals.length} approvals need attention`} />
        <Kpi label="Forecast profit" value={money(totals.forecastProfit)} note="Based on current project forecasts" />
      </section>
      <section className="role-grid role-grid-wide">
        <article className="role-card executive-card">
          <CardHead eyebrow="Portfolio" title="Project Financial Position" action={<Link href="/projects">Open projects</Link>} />
          {projects.length ? projects.map((project: any) => <ProjectPortfolioRow key={project.id} project={project} />) : <Empty text="No live project financial data yet. Upload current statements or create a project." />}
        </article>
        <article className="role-card">
          <CardHead eyebrow="Decisions" title="Needs Your Attention" action={<Link href="/approvals">Approvals</Link>} />
          {riskProjects.slice(0,5).map((project: any) => <DataLine key={project.id} label={project.name} note={project.status} value={money(project.summary?.funding_surplus_shortfall)} warn />)}
          {!riskProjects.length && <Empty text="No project risk flag yet." />}
          {approvals.slice(0,4).map((row: any) => <DataLine key={row.id} label={row.description} note={row.request_type} value={money(row.amount)} />)}
        </article>
      </section>
      <section className="role-grid">
        <article className="role-card opay-inspired-card">
          <CardHead eyebrow="Treasury" title="Cash Position by Account" action={<Link href="/treasury">Treasury</Link>} />
          <div className="wallet-balance"><small>Available recorded balances</small><strong>{money(bankCash)}</strong><span>OPay-inspired quick-balance presentation; accounting records remain account-by-account.</span></div>
          <div className="wallet-account-list">{accounts.slice(0,5).map((a: any) => <DataLine key={a.id} label={a.institution_name || a.account_name} note={a.account_name} value={money(a.current_balance)} />)}{!accounts.length && <Empty text="Your fresh OPay, Access and Carbon uploads will rebuild this account list." />}</div>
        </article>
        <article className="role-card">
          <CardHead eyebrow="System" title="Recent Recorded Activity" action={<Link href="/audit">Audit</Link>} />
          <DataLine label="Statement imports" value={String(statements.length)} note="Recent imports shown" />
          {auditRows.slice(0,6).map((row: any) => <DataLine key={row.id} label={String(row.action).replaceAll(".", " · ")} note={`${row.actor_email || "System"} · ${String(row.acting_interface || "system").replaceAll("_", " ")}`} value={new Date(row.created_at).toLocaleDateString("en-NG")} />)}
        </article>
      </section>
    </div>
  </>;
}

function FinanceDashboard({ accounts, bankCash, statements, approvals, transactions, unclassifiedEstimate }: any) {
  const lastStatement = statements[0];
  return <>
    <DashboardHeader eyebrow="Finance operations" title="Finance Operations Hub" subtitle="Bank statements, transaction classification, payments, treasury and reconciliation." />
    <div className="role-content">
      <section className="finance-workload">
        <div><small>TODAY'S FINANCE WORK</small><h2>{unclassifiedEstimate + approvals.length} items may need attention</h2><p>Upload statements, review project signals, classify transactions and process approved payments.</p></div>
        <div><Link href="/statements/upload">Upload statements</Link><Link href="/statements">Review transactions</Link></div>
      </section>
      <section className="role-kpis">
        <Kpi label="Transactions to classify" value={String(unclassifiedEstimate)} note="Estimated from new statement rows" />
        <Kpi label="Pending approvals" value={String(approvals.length)} note={money(approvals.reduce((s: number,r: any)=>s+Number(r.amount||0),0))} />
        <Kpi label="Recorded account cash" value={money(bankCash)} note={`${accounts.length} bank/wallet accounts`} />
        <Kpi label="Last import" value={lastStatement ? String(lastStatement.detected_institution_name || "Statement") : "—"} note={lastStatement ? `${lastStatement.rows_total ?? 0} rows` : "No fresh imports yet"} />
      </section>
      <section className="role-grid role-grid-wide">
        <article className="role-card">
          <CardHead eyebrow="Transaction inbox" title="Recent Movements" action={<Link href="/statements">Open inbox</Link>} />
          {transactions.length ? transactions.slice(0,10).map((tx: any) => <DataLine key={tx.id} label={tx.narration || "Transaction"} note={`${tx.transaction_date || ""} · ${String(tx.classification || "unclassified").replaceAll("_", " ")}`} value={money(tx.signed_amount)} warn={!tx.project_id} />) : <Empty text="No confirmed transactions after the reset. Upload fresh statements to begin." />}
        </article>
        <article className="role-card opay-inspired-card">
          <CardHead eyebrow="Banking" title="Cash by Bank / Wallet" action={<Link href="/treasury">Manage accounts</Link>} />
          <div className="wallet-balance"><small>Total recorded balance</small><strong>{money(bankCash)}</strong><span>Fast wallet-style view for finance operations.</span></div>
          {accounts.map((account: any) => <DataLine key={account.id} label={account.institution_name || account.account_name} note={account.account_name} value={money(account.current_balance)} />)}
          {!accounts.length && <Empty text="Fresh OPay, Access Bank and Carbon uploads will create/detect these accounts." />}
        </article>
      </section>
    </div>
  </>;
}

function DirectorDashboard({ projects, totals, approvals }: any) {
  return <>
    <DashboardHeader eyebrow="Project portfolio" title="Portfolio & Cost Control" subtitle="Compare project budgets, actual cost, commitments, cost-to-complete, margin and delivery risk." />
    <div className="role-content">
      <section className="role-kpis">
        <Kpi label="Projects under view" value={String(projects.length)} note="Open/non-archived" />
        <Kpi label="Portfolio budget" value={money(totals.budget)} note={`Actual ${money(totals.expenditure)}`} />
        <Kpi label="Forecast cost to complete" value={money(totals.ctc)} note="Across current projects" />
        <Kpi label="Pending requests" value={String(approvals.length)} note={money(approvals.reduce((s: number,r: any)=>s+Number(r.amount||0),0))} />
      </section>
      <section className="role-grid role-grid-wide">
        <article className="role-card">
          <CardHead eyebrow="Portfolio health" title="Project Performance" action={<Link href="/projects">Cost control</Link>} />
          {projects.length ? projects.map((project: any) => <ProjectPerformanceRow key={project.id} project={project} />) : <Empty text="No project data yet." />}
        </article>
        <article className="role-card">
          <CardHead eyebrow="Risk" title="Portfolio Risk Map" />
          <RiskGrid projects={projects} />
          <p className="role-muted">Risk uses current funding position, forecast profit and project status. It will improve as the fresh statements and project budgets are confirmed.</p>
        </article>
      </section>
      <article className="role-card">
        <CardHead eyebrow="Cost control" title="Budget, Actual, Committed & Completion Forecast" />
        <div className="portfolio-table"><div className="portfolio-table-head"><span>Project</span><span>Budget</span><span>Actual</span><span>Committed</span><span>CTC</span><span>Forecast profit</span></div>{projects.map((p:any)=><div className="portfolio-table-row" key={p.id}><Link href={`/projects/${p.id}`}>{p.project_code} · {p.name}</Link><span>{money(p.summary?.revised_budget || p.internal_cost_budget)}</span><span>{money(p.summary?.confirmed_expenditure)}</span><span>{money(p.summary?.outstanding_commitments)}</span><span>{money(p.summary?.forecast_cost_to_complete)}</span><b className={Number(p.summary?.forecast_profit||0)<0?"negative":""}>{money(p.summary?.forecast_profit)}</b></div>)}</div>
      </article>
    </div>
  </>;
}

function ManagerDashboard({ projects, approvals, transactions, imprests, ownerView }: any) {
  const project = projects[0];
  const projectApprovals = project ? approvals.filter((row:any)=>row.project_id===project.id) : [];
  const projectTransactions = project ? transactions.filter((row:any)=>row.project_id===project.id) : [];
  const projectImprest = project ? imprests.find((row:any)=>row.project_id===project.id) : null;
  return <>
    <DashboardHeader eyebrow="Site & project control" title={project ? project.name : "My Project Workspace"} subtitle={ownerView ? "MD test view: choose/open a project to work as the site/project role. Actions remain recorded as the MD user acting through this interface." : "Requests, expenses, imprest, project evidence and progress for your assigned project(s)."} />
    <div className="role-content">
      {!project ? <article className="role-card"><Empty text="No project is assigned to this position yet. Ask the MD/Owner to assign a project in People & Access." /></article> : <>
        <section className="manager-hero"><div><span>{project.project_code}</span><h2>{project.name}</h2><p>{project.location || "Location not set"} · {Number(project.progress_percent || 0).toFixed(0)}% progress</p></div><div><small>Available / recorded imprest</small><strong>{money(projectImprest?.current_balance ?? 0)}</strong></div></section>
        <section className="manager-actions"><Link href="/approvals">＋ Request Funds</Link><Link href="/statements">＋ Record / Review Expense</Link><Link href="/statements/upload">▣ Upload Evidence / Statement</Link><Link href={`/projects/${project.id}`}>✓ Update Project</Link></section>
        <section className="role-grid role-grid-wide">
          <article className="role-card">
            <CardHead eyebrow="Project budget" title="Budget Health" action={<Link href={`/projects/${project.id}`}>Open project</Link>} />
            <div className="budget-health"><div className="budget-ring"><strong>{project.summary?.revised_budget ? Math.min(100, Math.round(Number(project.summary?.confirmed_expenditure||0)/Number(project.summary.revised_budget)*100)) : 0}%</strong><span>budget used</span></div><div><DataLine label="Budget" value={money(project.summary?.revised_budget || project.internal_cost_budget)} /><DataLine label="Spent" value={money(project.summary?.confirmed_expenditure)} /><DataLine label="Committed" value={money(project.summary?.outstanding_commitments)} /><DataLine label="Forecast remaining" value={money(project.summary?.forecast_cost_to_complete)} /></div></div>
          </article>
          <article className="role-card"><CardHead eyebrow="My actions" title="What Needs Attention" />{projectApprovals.length ? projectApprovals.slice(0,6).map((row:any)=><DataLine key={row.id} label={row.description} note={`${row.request_type} · ${row.status}`} value={money(row.amount)} warn />) : <Empty text="No project requests are waiting." />}</article>
        </section>
        <section className="role-grid">
          <article className="role-card"><CardHead eyebrow="Recent cost" title="Project Transactions" />{projectTransactions.length ? projectTransactions.slice(0,8).map((tx:any)=><DataLine key={tx.id} label={tx.narration || "Transaction"} note={`${tx.transaction_date} · ${tx.category_name || "Uncategorised"}`} value={money(tx.signed_amount)} />) : <Empty text="No confirmed statement transaction is linked to this project yet." />}</article>
          <article className="role-card"><CardHead eyebrow="Project position" title="Funding & Completion" /><DataLine label="Funding received" value={money(project.summary?.funding_received)} /><DataLine label="Cash balance" value={money(project.summary?.cash_balance)} /><DataLine label="Funding after commitments" value={money(project.summary?.funding_surplus_shortfall)} warn={Number(project.summary?.funding_surplus_shortfall||0)<0} /><DataLine label="Forecast final cost" value={money(project.summary?.forecast_final_cost)} /></article>
        </section>
      </>}
    </div>
  </>;
}

function DashboardHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <header className="role-header"><p>{eyebrow}</p><h1>{title}</h1><span>{subtitle}</span></header>; }
function Kpi({ label, value, note }: { label: string; value: string; note: string }) { return <article className="role-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function CardHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) { return <div className="role-card-head"><div><small>{eyebrow}</small><h2>{title}</h2></div>{action && <div>{action}</div>}</div>; }
function DataLine({ label, value, note, warn=false }: { label: string; value: string; note?: string; warn?: boolean }) { return <div className="role-data-line"><div><b>{label}</b>{note && <small>{note}</small>}</div><strong className={warn?"warn":""}>{value}</strong></div>; }
function Empty({ text }: { text: string }) { return <p className="role-empty">{text}</p>; }
function ProjectPortfolioRow({ project }: any) { return <Link href={`/projects/${project.id}`} className="portfolio-row"><div><b>{project.project_code} · {project.name}</b><small>{project.location || "No location"} · {Number(project.progress_percent||0).toFixed(0)}%</small></div><span><small>Funding</small><b>{money(project.summary?.funding_received)}</b></span><span><small>Spent</small><b>{money(project.summary?.confirmed_expenditure)}</b></span><span><small>Commitments</small><b>{money(project.summary?.outstanding_commitments)}</b></span><span><small>Forecast profit</small><b className={Number(project.summary?.forecast_profit||0)<0?"negative":""}>{money(project.summary?.forecast_profit)}</b></span></Link>; }
function ProjectPerformanceRow({ project }: any) { const budget=Number(project.summary?.revised_budget||project.internal_cost_budget||0); const actual=Number(project.summary?.confirmed_expenditure||0); const used=budget?Math.min(100,Math.round(actual/budget*100)):0; return <Link href={`/projects/${project.id}`} className="performance-row"><div><b>{project.name}</b><small>{project.project_code}</small></div><div className="performance-bar"><i style={{width:`${used}%`}} /></div><strong>{used}%</strong><em className={Number(project.summary?.forecast_profit||0)<0?"risk":"ok"}>{money(project.summary?.forecast_profit)} profit</em></Link>; }
function RiskGrid({ projects }: any) { let healthy=0,monitor=0,intervene=0; projects.forEach((p:any)=>{ const profit=Number(p.summary?.forecast_profit||0), position=Number(p.summary?.funding_surplus_shortfall||0); if(p.status==="on_hold"||profit<0)intervene++; else if(position<0)monitor++; else healthy++; }); return <div className="risk-grid"><div><b>{healthy}</b><span>Healthy</span></div><div><b>{monitor}</b><span>Monitor</span></div><div><b>{intervene}</b><span>Intervene</span></div></div>; }
