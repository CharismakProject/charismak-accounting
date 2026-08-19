import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { createClient } from "../lib/supabase/server";
import RoleSwitcher, { type RoleFamily } from "./RoleSwitcher";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";
const allFamilies: RoleFamily[] = ["md_owner", "accountant_cfo", "project_director", "project_manager"];
const money = (value: number | string | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));
const compactMoney = (value: number) => `₦${new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(value || 0))}`;

export default async function Home() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("company_memberships").select("id,company_id,is_owner,status").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/login?message=Please+sign+in+with+your+company+account");

  const [{ data: company }, { data: positionRows }, { data: preference }, { data: assignments }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle(),
    supabase.from("membership_positions").select("is_primary,position:positions(code,name,interface_family)").eq("membership_id", membership.id),
    supabase.from("user_interface_preferences").select("active_interface").eq("company_id", membership.company_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("project_assignments").select("project_id,assignment_role,can_view_cost,can_request,can_approve").eq("membership_id", membership.id),
  ]);

  const assignedFamilies = Array.from(new Set((positionRows ?? []).map((row: any) => row.position?.interface_family).filter(Boolean))) as RoleFamily[];
  const available = membership.is_owner ? allFamilies : assignedFamilies.length ? assignedFamilies : (["project_manager"] as RoleFamily[]);
  const preferred = preference?.active_interface as RoleFamily | undefined;
  const active: RoleFamily = preferred && available.includes(preferred) ? preferred : membership.is_owner ? "md_owner" : available[0];
  const primaryRow: any = (positionRows ?? []).find((row: any) => row.is_primary) ?? (positionRows ?? [])[0];
  const signedInRole = membership.is_owner ? "MD / Owner" : primaryRow?.position?.name ?? "Company member";
  const assignedIds = (assignments ?? []).map((row: any) => row.project_id);

  let projectQuery = supabase.from("projects")
    .select("id,project_code,name,location,status,progress_percent,contract_value,internal_cost_budget,project_image_path,summary:project_financial_summaries(funding_received,company_funding,other_financing,confirmed_expenditure,cash_balance,outstanding_commitments,funding_surplus_shortfall,revised_budget,forecast_cost_to_complete,forecast_final_cost,expected_contract_revenue,forecast_profit)")
    .eq("company_id", membership.company_id).neq("status", "archived").order("created_at", { ascending: false });
  if (!membership.is_owner && active === "project_manager") projectQuery = assignedIds.length ? projectQuery.in("id", assignedIds) : projectQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);

  const [projectResult, accountResult, approvalResult, statementResult, transactionResult, auditResult] = await Promise.all([
    projectQuery,
    supabase.from("financial_accounts").select("id,institution_name,account_name,account_type,current_balance,balance_as_of,last_statement_at").eq("company_id", membership.company_id).eq("is_active", true).order("institution_name"),
    supabase.from("approval_requests").select("id,project_id,request_type,description,amount,status,urgency,requested_at").eq("company_id", membership.company_id).order("requested_at", { ascending: false }).limit(50),
    supabase.from("statement_imports").select("id,detected_institution_name,detected_account_name,status,rows_total,rows_new,rows_already_known,rows_need_review,rows_auto_posted,rows_pending_review,created_at").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(20),
    supabase.from("canonical_transactions").select("id,project_id,signed_amount,classification,status,transaction_date,narration,category_name,is_internal_transfer,is_personal_non_business").eq("company_id", membership.company_id).order("transaction_date", { ascending: false }).limit(5000),
    membership.is_owner ? supabase.from("audit_log").select("id,actor_email,acting_interface,action,entity_type,created_at").eq("company_id", membership.company_id).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] } as any),
  ]);

  const projects = (projectResult.data ?? []).map((project: any) => ({ ...project, summary: Array.isArray(project.summary) ? project.summary[0] : project.summary }));
  const accounts = accountResult.data ?? [];
  const approvals = approvalResult.data ?? [];
  const statements = statementResult.data ?? [];
  const transactions = transactionResult.data ?? [];
  const auditRows = auditResult.data ?? [];
  const projectIds = projects.map((p: any) => p.id);
  const { data: imprests } = projectIds.length ? await supabase.from("imprest_accounts").select("id,project_id,name,approved_limit,current_balance,status").in("project_id", projectIds).eq("status", "active") : { data: [] as any[] };

  const totals = projects.reduce((acc, project: any) => {
    acc.funding += Number(project.summary?.funding_received ?? 0);
    acc.companyFunding += Number(project.summary?.company_funding ?? 0);
    acc.otherFinancing += Number(project.summary?.other_financing ?? 0);
    acc.expenditure += Number(project.summary?.confirmed_expenditure ?? 0);
    acc.cash += Number(project.summary?.cash_balance ?? 0);
    acc.commitments += Number(project.summary?.outstanding_commitments ?? 0);
    acc.budget += Number(project.summary?.revised_budget ?? project.internal_cost_budget ?? 0);
    acc.forecastProfit += Number(project.summary?.forecast_profit ?? 0);
    acc.ctc += Number(project.summary?.forecast_cost_to_complete ?? 0);
    return acc;
  }, { funding: 0, companyFunding:0, otherFinancing:0, expenditure: 0, cash: 0, commitments: 0, budget: 0, forecastProfit: 0, ctc: 0 });

  const bankBalanceAvailable = accounts.some((account:any) => account.current_balance !== null && account.current_balance !== undefined);
  const bankCash = accounts.reduce((sum: number, account: any) => sum + Number(account.current_balance ?? 0), 0);
  const pendingApprovals = approvals.filter((row: any) => ["pending", "emergency_retrospective"].includes(row.status));
  const unclassifiedEstimate = statements.reduce((sum: number, row: any) => sum + Number(row.rows_pending_review ?? row.rows_new ?? 0), 0);
  const roleAccent = active === "accountant_cfo" ? "finance" : active === "project_director" ? "director" : active === "project_manager" ? "manager" : "md";
  const cashflow = buildCashflowSeries(transactions);
  const projectProgression = buildProjectProgression(transactions);

  return <main className={`role-shell role-${roleAccent}-shell`}>
    <aside className="role-sidebar">
      <div className="md-brand"><img src={LOGO_URL} alt="Charismak Accounting" /><div><b>ACCOUNTING</b><span>{company?.name ?? "Company"}</span></div></div>
      <RoleSwitcher companyId={membership.company_id} active={active} available={available} />
      <div className="role-signed-in"><small>SIGNED IN AS</small><b>{signedInRole}</b><span>{user.email}</span></div>
      <RoleNav active={active} owner={membership.is_owner} />
      <div className="pwa-install-note">Same app on desktop, tablet and phone. Install from your browser menu for home-screen access.</div>
      <div className="role-truth">✓ Track the truth<br/><span>Every movement. Every project.</span></div>
    </aside>
    <section className="role-main">
      <div className="role-mobile-top"><div className="role-mobile-brand"><img src={LOGO_URL} alt="" /><b>Accounting</b></div><RoleSwitcher companyId={membership.company_id} active={active} available={available} /></div>
      {active === "md_owner" && <MdDashboard projects={projects} totals={totals} bankCash={bankCash} bankBalanceAvailable={bankBalanceAvailable} approvals={pendingApprovals} accounts={accounts} statements={statements} auditRows={auditRows} progression={projectProgression} />}
      {active === "accountant_cfo" && <FinanceDashboard accounts={accounts} bankCash={bankCash} bankBalanceAvailable={bankBalanceAvailable} statements={statements} approvals={pendingApprovals} transactions={transactions} unclassifiedEstimate={unclassifiedEstimate} cashflow={cashflow} />}
      {active === "project_director" && <DirectorDashboard projects={projects} totals={totals} approvals={pendingApprovals} />}
      {active === "project_manager" && <ManagerDashboard projects={projects} approvals={pendingApprovals} transactions={transactions} imprests={imprests ?? []} ownerView={membership.is_owner} />}
    </section>
  </main>;
}

function RoleNav({ active, owner }: { active: RoleFamily; owner: boolean }) {
  if (active === "md_owner") return <nav className="role-nav"><Link className="active" href="/">Executive</Link><Link href="/notifications">Notifications</Link><Link href="/projects">Projects</Link><Link href="/statements">Transactions & Statements</Link><Link href="/statements/upload">Upload Statements</Link><Link href="/treasury">Treasury</Link><Link href="/approvals">Approvals</Link>{owner && <Link href="/admin/access">People & Access</Link>}<Link href="/audit">Audit Trail</Link></nav>;
  if (active === "accountant_cfo") return <nav className="role-nav"><Link className="active" href="/">Finance Home</Link><Link href="/notifications">Notifications</Link><Link href="/statements">Transaction Inbox</Link><Link href="/statements/upload">Upload Statements</Link><Link href="/treasury">Banking & Treasury</Link><Link href="/approvals">Payments & Approvals</Link><Link href="/projects">Projects</Link></nav>;
  if (active === "project_director") return <nav className="role-nav"><Link className="active" href="/">Portfolio</Link><Link href="/notifications">Notifications</Link><Link href="/projects">Cost Control</Link><Link href="/approvals">Commitments & Approvals</Link><Link href="/statements">Transactions</Link><Link href="/audit">Reports & Audit</Link></nav>;
  return <nav className="role-nav"><Link className="active" href="/">My Project</Link><Link href="/notifications">Notifications</Link><Link href="/projects">Site & Project</Link><Link href="/approvals">Requests</Link><Link href="/statements">Expenses</Link></nav>;
}

function MdDashboard({ projects, totals, bankCash, bankBalanceAvailable, approvals, accounts, statements, auditRows, progression }: any) {
  const riskProjects = projects.filter((p: any) => Number(p.summary?.funding_surplus_shortfall ?? 0) < 0 || Number(p.summary?.forecast_profit ?? 0) < 0 || p.status === "on_hold");
  const autoPosted = statements.reduce((s:number,r:any)=>s+Number(r.rows_auto_posted??0),0);
  const pendingReview = statements.reduce((s:number,r:any)=>s+Number(r.rows_pending_review??0),0);
  const healthy = projects.filter((p:any)=>Number(p.summary?.funding_surplus_shortfall??0)>=0 && Number(p.summary?.forecast_profit??0)>=0).length;
  const healthPct = projects.length ? Math.round(healthy/projects.length*100) : 0;
  return <><DashboardHeader eyebrow="Executive overview" title="Company Control Room" subtitle="Live company cash, project position, approvals and statement intelligence." /><div className="role-content">
    <section className="role-kpis role-kpis-5"><Kpi label="Bank / wallet cash" value={bankBalanceAvailable?money(bankCash):"Balance pending"} note={bankBalanceAvailable?`${accounts.length} account(s) with recorded balances`:"Latest statement balance has not been parsed yet"}/><Kpi label="Client project funding" value={money(totals.funding)} note={`${projects.length} projects`}/><Kpi label="Confirmed expenditure" value={money(totals.expenditure)} note={`${autoPosted} statement rows auto-posted`}/><Kpi label="Company funding to projects" value={money(totals.companyFunding)} note="Loans / project financing kept separate"/><Kpi label="Still needs review" value={String(pendingReview)} note="Unmatched or ambiguous statement rows"/></section>
    <section className="chart-grid"><LineChart title="Project Funding & Expenditure Progression" eyebrow="Cumulative confirmed position" data={progression} firstLabel="Funding" secondLabel="Expenditure"/><DonutCard title="Portfolio Health" eyebrow="Project position" pct={healthPct} label="healthy" stats={[["Healthy",healthy],["Needs attention",Math.max(projects.length-healthy,0)],["Projects",projects.length]]}/></section>
    <section className="role-grid role-grid-wide"><article className="role-card"><CardHead eyebrow="Portfolio" title="Project Financial Position" action={<Link href="/projects">Open projects</Link>}/>{projects.length?projects.map((p:any)=><ProjectPortfolioRow key={p.id} project={p}/>):<Empty text="No projects yet."/>}</article><article className="role-card"><CardHead eyebrow="Decisions" title="Needs Your Attention" action={<Link href="/approvals">Approvals</Link>}/>{riskProjects.slice(0,5).map((p:any)=><DataLine key={p.id} label={p.name} note={p.status} value={money(p.summary?.funding_surplus_shortfall)} warn/>)}{!riskProjects.length&&<Empty text="No current project risk flag."/>}</article></section>
    <section className="role-grid"><article className="role-card opay-inspired-card"><CardHead eyebrow="Treasury" title="Cash Position by Account" action={<Link href="/treasury">Treasury</Link>}/><div className="wallet-balance"><small>Recorded account balance</small><strong>{bankBalanceAvailable?money(bankCash):"Pending"}</strong><span>Balances update from the latest analysed statements when the bank file exposes a balance column.</span></div>{accounts.slice(0,5).map((a:any)=><DataLine key={a.id} label={a.institution_name||a.account_name} note={a.balance_as_of?`As at ${a.balance_as_of}`:"Balance not parsed yet"} value={a.current_balance==null?"Pending":money(a.current_balance)}/>)}</article><article className="role-card"><CardHead eyebrow="Audit" title="Recent Recorded Activity" action={<Link href="/audit">Audit trail</Link>}/>{auditRows.slice(0,7).map((r:any)=><DataLine key={r.id} label={String(r.action).replaceAll("."," · ")} note={`${r.actor_email||"System"} · ${String(r.acting_interface||"system").replaceAll("_"," ")}`} value={new Date(r.created_at).toLocaleDateString("en-NG")}/>)}</article></section>
  </div></>;
}

function FinanceDashboard({ accounts, bankCash, bankBalanceAvailable, statements, approvals, transactions, unclassifiedEstimate, cashflow }: any) {
  const last=statements[0];
  const auto=statements.reduce((s:number,r:any)=>s+Number(r.rows_auto_posted??0),0);
  const known=statements.reduce((s:number,r:any)=>s+Number(r.rows_already_known??0),0);
  const total=statements.reduce((s:number,r:any)=>s+Number(r.rows_total??0),0);
  const resolvedPct=total?Math.min(100,Math.round((auto+known+Math.max(total-auto-known-unclassifiedEstimate,0))/total*100)):0;
  return <><DashboardHeader eyebrow="Finance operations" title="Finance Operations Hub" subtitle="Statements, classification, treasury, payments and reconciliation."/><div className="role-content">
    <section className="finance-workload"><div><small>FINANCE WORK QUEUE</small><h2>{unclassifiedEstimate+approvals.length} items may need attention</h2><p>Confident project transactions post automatically; only exceptions and untagged rows stay here.</p></div><div><Link href="/statements/upload">Upload statements</Link><Link href="/statements">Review exceptions</Link></div></section>
    <section className="role-kpis"><Kpi label="Needs classification" value={String(unclassifiedEstimate)} note="Unmatched/ambiguous rows"/><Kpi label="Pending approvals" value={String(approvals.length)} note={money(approvals.reduce((s:number,r:any)=>s+Number(r.amount||0),0))}/><Kpi label="Recorded account cash" value={bankBalanceAvailable?money(bankCash):"Balance pending"} note={`${accounts.length} accounts`}/><Kpi label="Last import" value={last?String(last.detected_institution_name||"Statement"):"—"} note={last?`${last.rows_auto_posted??0} auto-posted · ${last.rows_pending_review??0} review`:"No import"}/></section>
    <section className="chart-grid"><BarChart title="Cash by Bank / Wallet" eyebrow="Treasury" items={accounts.map((a:any)=>({label:a.institution_name||a.account_name,note:a.current_balance==null?"Balance pending":a.account_name,value:Number(a.current_balance||0)}))}/><DonutCard title="Statement Resolution" eyebrow="Reconciliation workload" pct={resolvedPct} label="processed" stats={[["Auto-posted",auto],["Already known",known],["Needs action",unclassifiedEstimate]]}/></section>
    <section className="role-grid role-grid-wide"><article className="role-card"><CardHead eyebrow="Transactions" title="Recent Confirmed Movements" action={<Link href="/statements">Open inbox</Link>}/>{transactions.slice(0,10).map((tx:any)=><DataLine key={tx.id} label={tx.narration||"Transaction"} note={`${tx.transaction_date} · ${String(tx.classification||"unclassified").replaceAll("_"," ")}`} value={money(tx.signed_amount)} warn={!tx.project_id}/>)}</article><article className="role-card opay-inspired-card"><CardHead eyebrow="Banking" title="Quick Balance" action={<Link href="/treasury">Manage accounts</Link>}/><div className="wallet-balance"><small>Total recorded balance</small><strong>{bankBalanceAvailable?money(bankCash):"Pending"}</strong><span>OPay-inspired quick view backed by analysed account statements.</span></div>{accounts.slice(0,5).map((a:any)=><DataLine key={a.id} label={a.institution_name||a.account_name} note={a.account_name} value={a.current_balance==null?"Pending":money(a.current_balance)}/>)}</article></section>
    <LineChart title="Monthly Money In vs Money Out" eyebrow="Confirmed cash movement" data={cashflow} firstLabel="Money in" secondLabel="Money out"/>
  </div></>;
}

function DirectorDashboard({ projects, totals, approvals }: any) {
  const risky=projects.filter((p:any)=>Number(p.summary?.funding_surplus_shortfall??0)<0||Number(p.summary?.forecast_profit??0)<0).length;
  const healthy=Math.max(projects.length-risky,0);
  return <><DashboardHeader eyebrow="Project portfolio" title="Portfolio & Cost Control" subtitle="Budget, actual cost, commitments, CTC, profitability and delivery risk."/><div className="role-content">
    <section className="role-kpis"><Kpi label="Projects" value={String(projects.length)} note="Open/non-archived"/><Kpi label="Portfolio budget" value={money(totals.budget)} note={`Actual ${money(totals.expenditure)}`}/><Kpi label="Forecast CTC" value={money(totals.ctc)} note="Current forecast"/><Kpi label="Pending requests" value={String(approvals.length)} note="Approval queue"/></section>
    <section className="chart-grid"><BudgetActualChart projects={projects}/><DonutCard title="Portfolio Risk" eyebrow="Cost & funding position" pct={projects.length?Math.round(healthy/projects.length*100):0} label="healthy" stats={[["Healthy",healthy],["Risk / shortfall",risky],["Projects",projects.length]]}/></section>
    <article className="role-card"><CardHead eyebrow="Portfolio health" title="Project Performance" action={<Link href="/projects">Cost control</Link>}/>{projects.map((p:any)=><ProjectPerformanceRow key={p.id} project={p}/>)}</article>
  </div></>;
}

function ManagerDashboard({ projects, approvals, transactions, imprests, ownerView }: any) {
  const p=projects[0];
  const pa=p?approvals.filter((r:any)=>r.project_id===p.id):[];
  const pt=p?transactions.filter((r:any)=>r.project_id===p.id):[];
  const imp=p?imprests.find((r:any)=>r.project_id===p.id):null;
  const categories=categoryTotals(pt);
  return <><DashboardHeader eyebrow="Site & project control" title={p?p.name:"My Project Workspace"} subtitle={ownerView?"MD test view. Actions remain audited under the MD identity and this acting interface.":"Requests, expenses, imprest, evidence and progress for assigned projects."}/><div className="role-content">{!p?<article className="role-card"><Empty text="No assigned project."/></article>:<>
    <section className="manager-hero"><div><span>{p.project_code}</span><h2>{p.name}</h2><p>{p.location||"Location not set"} · {Number(p.progress_percent||0).toFixed(0)}% progress</p></div><div><small>Recorded imprest</small><strong>{money(imp?.current_balance??0)}</strong></div></section>
    <section className="manager-actions"><Link href="/approvals">＋ Request Funds</Link><Link href="/statements">Review Expenses</Link><Link href={`/projects/${p.id}`}>Update Progress</Link><Link href={`/projects/${p.id}`}>Open Project</Link></section>
    <section className="chart-grid"><BarChart title="Spend by Work Category" eyebrow="Site cost" items={categories}/><DonutCard title="Project Progress" eyebrow="Site status" pct={Math.round(Number(p.progress_percent||0))} label="complete" stats={[["Funding",compactMoney(Number(p.summary?.funding_received||0))],["Spent",compactMoney(Number(p.summary?.confirmed_expenditure||0))],["Requests",pa.length]]}/></section>
    <section className="role-grid"><article className="role-card"><CardHead eyebrow="Project position" title="Funding & Cost"/><DataLine label="Client funding" value={money(p.summary?.funding_received)}/><DataLine label="Company funding" value={money(p.summary?.company_funding)}/><DataLine label="Spent" value={money(p.summary?.confirmed_expenditure)}/><DataLine label="Cash position" value={money(p.summary?.funding_surplus_shortfall)} warn={Number(p.summary?.funding_surplus_shortfall||0)<0}/></article><article className="role-card"><CardHead eyebrow="My actions" title="Needs Attention"/>{pa.length?pa.slice(0,6).map((r:any)=><DataLine key={r.id} label={r.description} note={r.status} value={money(r.amount)} warn/>):<Empty text="No requests waiting."/>}{pt.slice(0,4).map((tx:any)=><DataLine key={tx.id} label={tx.narration||"Transaction"} note={tx.category_name||"Uncategorised"} value={money(tx.signed_amount)}/>)}</article></section>
  </>}</div></>;
}

function monthLabel(key:string){const [y,m]=key.split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("en-NG",{month:"short",year:"2-digit"});}

function buildCashflowSeries(transactions:any[]){
  const map=new Map<string,{key:string,label:string,inflow:number,outflow:number}>();
  for(const tx of transactions){
    if(!String(tx.transaction_date||"").match(/^\d{4}-\d{2}/))continue;
    if(!["confirmed","confirmed_reconciliation_only"].includes(String(tx.status||"")))continue;
    const key=String(tx.transaction_date).slice(0,7);const row=map.get(key)||{key,label:monthLabel(key),inflow:0,outflow:0};const amount=Number(tx.signed_amount||0);if(amount>=0)row.inflow+=amount;else row.outflow+=Math.abs(amount);map.set(key,row);
  }
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-12);
}

function buildProjectProgression(transactions:any[]){
  const map=new Map<string,{key:string,label:string,inflow:number,outflow:number}>();
  for(const tx of transactions){
    if(!String(tx.transaction_date||"").match(/^\d{4}-\d{2}/))continue;
    if(String(tx.status||"")!=="confirmed")continue;
    const classification=String(tx.classification||"");
    if(!["project_funding","project_expense"].includes(classification))continue;
    const key=String(tx.transaction_date).slice(0,7);const row=map.get(key)||{key,label:monthLabel(key),inflow:0,outflow:0};const amount=Number(tx.signed_amount||0);
    if(classification==="project_funding"&&amount>0)row.inflow+=amount;
    if(classification==="project_expense"&&amount<0)row.outflow+=Math.abs(amount);
    map.set(key,row);
  }
  let funding=0,spent=0;
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(row=>{funding+=row.inflow;spent+=row.outflow;return {...row,inflow:funding,outflow:spent};}).slice(-12);
}

function categoryTotals(transactions:any[]){
  const map=new Map<string,number>();
  for(const tx of transactions){if(Number(tx.signed_amount||0)>=0||String(tx.classification)!=="project_expense")continue;const k=String(tx.category_name||"Uncategorised");map.set(k,(map.get(k)||0)+Math.abs(Number(tx.signed_amount||0)));}
  return [...map.entries()].map(([label,value])=>({label,note:"",value})).sort((a,b)=>b.value-a.value).slice(0,6);
}

function makePath(values:number[],max:number){const w=600,h=160,p=22,n=Math.max(values.length,1),step=n>1?(w-p*2)/(n-1):0;return values.map((v,i)=>`${i?"L":"M"} ${p+i*step} ${h-p-(max?((v/max)*(h-p*2)):0)}`).join(" ")}

function LineChart({title,eyebrow,data,firstLabel="Money in",secondLabel="Money out"}:{title:string;eyebrow:string;data:any[];firstLabel?:string;secondLabel?:string}){
  const first=data.map((d:any)=>Number(d.inflow||0)),second=data.map((d:any)=>Number(d.outflow||0));const max=Math.max(1,...first,...second);const w=600,h=160,p=22;
  const last=data[data.length-1];
  return <article className="chart-card"><div className="chart-head"><div><small>{eyebrow}</small><h3>{title}</h3></div><div className="chart-legend"><span><i className="legend-a"/>{firstLabel}</span><span><i className="legend-b"/>{secondLabel}</span></div></div>{data.length?<><svg className="line-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>{[.25,.5,.75,1].map(v=><line key={v} className="grid" x1={p} x2={w-p} y1={h-p-v*(h-p*2)} y2={h-p-v*(h-p*2)}/>)}<path className="line-a" d={makePath(first,max)}/><path className="line-b" d={makePath(second,max)}/>{data.map((d:any,i:number)=>{const x=p+(data.length>1?i*(w-p*2)/(data.length-1):0);const y1=h-p-(Number(d.inflow||0)/max)*(h-p*2);const y2=h-p-(Number(d.outflow||0)/max)*(h-p*2);return <g key={d.key}><circle className="line-dot-a" cx={x} cy={y1} r="3"><title>{d.label} · {firstLabel}: {money(d.inflow)}</title></circle><circle className="line-dot-b" cx={x} cy={y2} r="3"><title>{d.label} · {secondLabel}: {money(d.outflow)}</title></circle><text x={x} y={h-3} textAnchor="middle">{d.label}</text></g>})}</svg><div className="chart-latest"><span><small>Latest {firstLabel}</small><b>{money(last?.inflow)}</b></span><span><small>Latest {secondLabel}</small><b>{money(last?.outflow)}</b></span><span><small>Periods shown</small><b>{data.length}</b></span></div></>:<Empty text="Confirmed transaction history will populate this chart."/>}</article>
}

function BarChart({title,eyebrow,items}:{title:string;eyebrow:string;items:{label:string;note?:string;value:number}[]}){
  const max=Math.max(1,...items.map(i=>Math.abs(i.value||0)));
  return <article className="chart-card"><div className="chart-head"><div><small>{eyebrow}</small><h3>{title}</h3></div></div><div className="bar-list">{items.length?items.slice(0,7).map((item,i)=><div className="bar-row" key={`${item.label}-${i}`}><div><b>{item.label}</b>{item.note&&<small>{item.note}</small>}</div><div className="bar-track"><i style={{width:`${Math.max(2,Math.round(Math.abs(item.value||0)/max*100))}%`}}/></div><strong>{item.note==="Balance pending"?"Pending":compactMoney(item.value)}</strong></div>):<Empty text="No data yet."/>}</div></article>
}

function BudgetActualChart({projects}:{projects:any[]}){
  const items=projects.slice(0,6);const max=Math.max(1,...items.flatMap((p:any)=>[Number(p.summary?.revised_budget||p.internal_cost_budget||0),Number(p.summary?.confirmed_expenditure||0)]));
  return <article className="chart-card"><div className="chart-head"><div><small>Cost control</small><h3>Budget vs Actual</h3></div><div className="chart-legend"><span><i className="legend-a"/>Budget</span><span><i className="legend-b"/>Actual</span></div></div><div className="bar-list">{items.map((p:any)=><div key={p.id} style={{display:"grid",gap:4}}><div style={{display:"flex",justifyContent:"space-between",fontSize:8}}><b>{p.project_code}</b><span>{compactMoney(Number(p.summary?.confirmed_expenditure||0))}</span></div><div className="bar-track"><i style={{width:`${Math.round(Number(p.summary?.revised_budget||p.internal_cost_budget||0)/max*100)}%`}}/></div><div className="bar-track alt"><i style={{width:`${Math.round(Number(p.summary?.confirmed_expenditure||0)/max*100)}%`}}/></div></div>)}</div></article>
}

function DonutCard({title,eyebrow,pct,label,stats}:{title:string;eyebrow:string;pct:number;label:string;stats:[string,string|number][]}){
  const safe=Math.max(0,Math.min(100,pct||0));const style={"--pct":safe} as CSSProperties;
  return <article className="chart-card"><div className="chart-head"><div><small>{eyebrow}</small><h3>{title}</h3></div></div><div className="donut-wrap"><div className="donut" style={style}><div><b>{safe}%</b><small>{label}</small></div></div><div>{stats.map(([k,v])=><div className="mini-chart-stat" key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></article>
}

function DashboardHeader({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}){return <header className="role-header"><p>{eyebrow}</p><h1>{title}</h1><span>{subtitle}</span></header>}
function Kpi({label,value,note}:{label:string;value:string;note:string}){return <article className="role-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function CardHead({eyebrow,title,action}:{eyebrow:string;title:string;action?:ReactNode}){return <div className="role-card-head"><div><small>{eyebrow}</small><h2>{title}</h2></div>{action&&<div>{action}</div>}</div>}
function DataLine({label,value,note,warn=false}:{label:string;value:string;note?:string;warn?:boolean}){return <div className="role-data-line"><div><b>{label}</b>{note&&<small>{note}</small>}</div><strong className={warn?"warn":""}>{value}</strong></div>}
function Empty({text}:{text:string}){return <p className="role-empty">{text}</p>}
function ProjectPortfolioRow({project}:any){return <Link href={`/projects/${project.id}`} className="portfolio-row"><div><b>{project.project_code} · {project.name}</b><small>{project.location||"No location"} · {Number(project.progress_percent||0).toFixed(0)}%</small></div><span><small>Client funding</small><b>{money(project.summary?.funding_received)}</b></span><span><small>Company funding</small><b>{money(project.summary?.company_funding)}</b></span><span><small>Spent</small><b>{money(project.summary?.confirmed_expenditure)}</b></span><span><small>Position</small><b>{money(project.summary?.funding_surplus_shortfall)}</b></span></Link>}
function ProjectPerformanceRow({project}:any){const b=Number(project.summary?.revised_budget||project.internal_cost_budget||0),a=Number(project.summary?.confirmed_expenditure||0),used=b?Math.min(100,Math.round(a/b*100)):0;return <Link href={`/projects/${project.id}`} className="performance-row"><div><b>{project.name}</b><small>{project.project_code}</small></div><div className="performance-bar"><i style={{width:`${used}%`}}/></div><strong>{used}%</strong><em className={Number(project.summary?.forecast_profit||0)<0?"risk":"ok"}>{money(project.summary?.forecast_profit)} profit</em></Link>}
